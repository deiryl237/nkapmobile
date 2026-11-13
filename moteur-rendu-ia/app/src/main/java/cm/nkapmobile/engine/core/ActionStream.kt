package cm.nkapmobile.engine.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * Protocole du flux d'actions (contrat docs/02 §5) — vocabulaire FERMÉ de 9 types.
 * Tout échange inter-modules passe par ces types. Parsing défensif : invalide = rejeté,
 * jamais une exception qui remonte à l'utilisateur.
 *
 * Encre sémantique verrouillée : ink = expliquer · yellow = souligner · red = agir/alerter.
 */

enum class Ink { INK, YELLOW, RED }

fun inkFrom(s: String?): Ink = when (s?.lowercase()) {
    "yellow" -> Ink.YELLOW
    "red" -> Ink.RED
    else -> Ink.INK
}

/** Cible d'un geste : nœud du ScreenContext (résolu à l'exécution) ou position libre 0..1. */
sealed class Pos {
    data class Node(val nodeId: String, val dx: Int = 0, val dy: Int = 0) : Pos()
    data class Free(val x: Float, val y: Float) : Pos()

    companion object {
        fun from(o: JSONObject?): Pos? {
            if (o == null) return null
            val node = o.optString("node_id", "").ifEmpty { null }
            if (node != null) return Node(node, o.optInt("dx", 0), o.optInt("dy", 0))
            val x = if (o.has("x")) o.getDouble("x").toFloat() else return null
            val y = if (o.has("y")) o.getDouble("y").toFloat() else return null
            return Free(x, y)
        }
    }
}

/** Un nœud de ScreenContext (I5) — bounds en px écran (fenêtre). */
data class ScreenNode(
    val nodeId: String,
    val path: String,
    val cls: String,
    val text: String,
    val bounds: List<Int>,       // [left, top, right, bottom] px
    val clickable: Boolean,
    val sensitive: Boolean,      // champ de saisie / password → jamais rendu ni transmis
)

/** Snapshot du contexte d'écran (produit par M4, consommé par M1/M2). */
data class ScreenContext(
    val appPackage: String,
    val screenHint: String,
    val nodes: List<ScreenNode>,
) {
    fun findNode(nodeId: String): ScreenNode? = nodes.firstOrNull { it.nodeId == nodeId }
    fun findByTextContains(fragment: String): ScreenNode? =
        nodes.firstOrNull { it.text.contains(fragment, ignoreCase = true) }

    companion object {
        fun fromJson(o: JSONObject): ScreenContext? {
            return try {
                val app = o.optJSONObject("app")
                val arr = o.optJSONArray("nodes") ?: return null
                val nodes = (0 until arr.length()).mapNotNull { i ->
                    val n = arr.getJSONObject(i)
                    if (n.optBoolean("password", false) ||
                        n.optString("cls").contains("EditText")
                    ) return@mapNotNull null          // sécurité : jamais de champ de saisie
                    ScreenNode(
                        nodeId = n.getString("node_id"),
                        path = n.optString("path"),
                        cls = n.optString("cls"),
                        text = n.optString("text"),
                        bounds = listOf(
                            n.optInt("l"), n.optInt("t"), n.optInt("r"), n.optInt("b")
                        ),
                        clickable = n.optBoolean("clickable", false),
                        sensitive = false,
                    )
                }
                ScreenContext(
                    appPackage = app?.optString("package") ?: "?",
                    screenHint = o.optString("screen_hint", "unknown"),
                    nodes = nodes
                )
            } catch (e: Exception) {
                null
            }
        }
    }
}

/** Les 9 actions du vocabulaire (contrat §5). */
sealed class Action {
    abstract val id: String

    data class Speak(
        override val id: String,
        val text: String,
        val lang: String = "ewo",
        val mode: String = "bank",
        val phraseKey: String? = null,
        val audioUrl: String? = null,     // fourni quand le serveur a déjà synthétisé
        val durationMs: Int? = null,
    ) : Action()

    data class Circle(
        override val id: String,
        val target: Pos,
        val color: Ink = Ink.INK,
        val durationMs: Int = 700,
    ) : Action()

    data class Write(
        override val id: String,
        val text: String,
        val at: Pos,
        val size: Float = 26f,
        val color: Ink = Ink.INK,
        val backing: Boolean = false,     // papier = lisible sur tout fond
        val perLetterMs: Int = 55,
    ) : Action()

    data class Underline(
        override val id: String,
        val target: Pos,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 450,
    ) : Action()

    data class Frame(
        override val id: String,
        val target: Pos,
        val label: String? = null,
        val color: Ink = Ink.RED,
        val pad: Int = 10,
    ) : Action()

    data class Arrow(
        override val id: String,
        val from: Pos,
        val to: Pos,
        val color: Ink = Ink.INK,
        val durationMs: Int = 800,
        val bow: Float = 0.16f,
    ) : Action()

    data class Caption(
        val text: String,
        val subFr: String? = null,
    ) : Action() { override val id = "caption" }

    data class Hide(override val id: String) : Action()
    object Clear : Action() { override val id = "clear" }
}

/** Message WS complet (enveloppe commune + action). */
data class TimedAction(val seq: Int, val speakSeg: Int?, val runAfterMs: Int, val action: Action)

/** Parseur défensif du flux — le harnais/côté appareil rejette, ne plante jamais. */
object ActionStreamParser {

    fun parsePos(o: JSONObject?): Pos? = Pos.from(o)

    fun parseAction(a: JSONObject): Action? {
        return try {
            when (a.optString("t")) {
            "speak" -> Action.Speak(
                id = a.optString("id", "spk"),
                text = a.optString("text"),
                lang = a.optString("lang", "ewo"),
                mode = a.optString("mode", "bank"),
                phraseKey = a.optString("phrase_key").ifEmpty { null },
                audioUrl = a.optString("audio_url").ifEmpty { null },
                durationMs = if (a.has("duration_ms")) a.getInt("duration_ms") else null,
            )
            "circle" -> Action.Circle(
                id = a.getString("id"),
                target = parsePos(a.getJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "ink")),
                durationMs = a.optInt("duration_ms", 700),
            )
            "write" -> Action.Write(
                id = a.getString("id"),
                text = a.getString("text"),
                at = parsePos(a.getJSONObject("target").let { it }) ?: return null,
                size = a.optDouble("size", 26.0).toFloat(),
                color = inkFrom(a.optString("color", "ink")),
                backing = a.optString("backing") == "paper",
                perLetterMs = a.optInt("per_letter_ms", 55),
            )
            "underline" -> Action.Underline(
                id = a.getString("id"),
                target = parsePos(a.getJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 450),
            )
            "frame" -> Action.Frame(
                id = a.getString("id"),
                target = parsePos(a.getJSONObject("target")) ?: return null,
                label = a.optString("label").ifEmpty { null },
                color = Ink.RED,
                pad = a.optInt("pad", 10),
            )
            "arrow" -> Action.Arrow(
                id = a.getString("id"),
                from = parsePos(a.getJSONObject("from")) ?: return null,
                to = parsePos(a.getJSONObject("to")) ?: return null,
                color = inkFrom(a.optString("color", "ink")),
                durationMs = a.optInt("duration_ms", 800),
                bow = a.optDouble("bow", 0.16).toFloat(),
            )
            "caption" -> Action.Caption(
                text = a.getString("text"),
                subFr = a.optString("sub_fr").ifEmpty { null },
            )
            "hide" -> Action.Hide(a.getString("id"))
            "clear" -> Action.Clear
            else -> null
        }
        } catch (e: Exception) {
            null
        }
    }

    /** Parse un flux complet depuis un JSON array (mode fixtures). */
    fun parseStream(arr: JSONArray): List<TimedAction> = try {
        (0 until arr.length()).mapNotNull { i ->
            val m = arr.getJSONObject(i)
            val a = parseAction(m.getJSONObject("action")) ?: return@mapNotNull null
            TimedAction(
                seq = m.optInt("seq", i + 1),
                speakSeg = if (m.has("speak_seg")) m.getInt("speak_seg") else null,
                runAfterMs = m.optInt("run_after_ms", 0),
                action = a,
            )
        }.sortedBy { it.seq }
    } catch (e: Exception) {
        emptyList()
    }
}
