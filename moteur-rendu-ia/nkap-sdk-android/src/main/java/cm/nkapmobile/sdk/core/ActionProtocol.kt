package cm.nkapmobile.sdk.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * Contrat NkapSDK v1.2 — vocabulaire fermé d'actions visuelles & vocales (I3)
 * et contexte d'écran (I5). Parsing strict et défensif : jamais de crash sur
 * un payload partiel ou inconnu.
 */
enum class Ink { INK, YELLOW, RED, GREEN, CYAN }

fun inkFrom(s: String?): Ink = when (s?.lowercase()?.trim()) {
    "yellow", "gold", "amber" -> Ink.YELLOW
    "red", "coral", "danger" -> Ink.RED
    "green", "emerald", "success" -> Ink.GREEN
    "cyan", "blue", "info" -> Ink.CYAN
    else -> Ink.INK
}

/** Cible d'un geste : résolue dynamiquement à l'exécution (jamais en dur). */
sealed class TargetRef {
    data class Node(val nodeId: String, val dx: Int = 0, val dy: Int = 0) : TargetRef()
    data class MatchText(val texts: List<String>, val dx: Int = 0, val dy: Int = 0) : TargetRef()
    data class MatchRegex(val pattern: String, val pick: String = "first") : TargetRef()
    data class ValueOf(val labels: List<String>) : TargetRef()
    data class Free(val x: Float, val y: Float) : TargetRef()

    companion object {
        fun from(o: JSONObject?): TargetRef? {
            if (o == null) return null
            val nodeId = o.optString("node_id", "").trim()
            if (nodeId.isNotEmpty()) return Node(nodeId, o.optInt("dx", 0), o.optInt("dy", 0))

            if (o.has("value_of")) {
                val labels = jsonStringList(o.opt("value_of"))
                if (labels.isNotEmpty()) return ValueOf(labels)
            }
            if (o.has("match_text")) {
                val texts = jsonStringList(o.opt("match_text"))
                if (texts.isNotEmpty()) return MatchText(texts, o.optInt("dx", 0), o.optInt("dy", 0))
            }
            val regex = o.optString("match_regex", "").trim()
            if (regex.isNotEmpty()) return MatchRegex(regex, o.optString("pick", "first"))

            if (o.has("x") && o.has("y")) {
                return Free(o.optDouble("x", 0.5).toFloat(), o.optDouble("y", 0.5).toFloat())
            }
            return null
        }

        private fun jsonStringList(raw: Any?): List<String> = when (raw) {
            is String -> listOf(raw).filter { it.isNotBlank() }
            is JSONArray -> (0 until raw.length()).mapNotNull { raw.optString(it).takeIf { s -> s.isNotBlank() } }
            else -> emptyList()
        }
    }
}

/** Nœud d'écran I5 — bounds en px fenêtre [left, top, right, bottom]. */
data class ScreenNode(
    val nodeId: String,
    val tag: String,
    val text: String,
    val bounds: IntArray, // [l, t, r, b]
    val clickable: Boolean = false,
    val tone: String = "unknown",
    val path: String = "",
) {
    fun centerX(): Float = (bounds[0] + bounds[2]) / 2f
    fun centerY(): Float = (bounds[1] + bounds[3]) / 2f
    fun width(): Int = (bounds[2] - bounds[0]).coerceAtLeast(0)
    fun height(): Int = (bounds[3] - bounds[1]).coerceAtLeast(0)
}

/** Snapshot de l'écran actif (filtre strict M4 : aucun champ PIN/password). */
data class ScreenContext(
    val appPackage: String,
    val title: String,
    val screenHint: String,
    val channel: String = "mobile",
    val nodes: List<ScreenNode>,
) {
    fun findNode(nodeId: String): ScreenNode? = nodes.firstOrNull { it.nodeId == nodeId }

    fun resolve(ref: TargetRef?): ScreenNode? {
        if (ref == null) return null
        return when (ref) {
            is TargetRef.Node -> findNode(ref.nodeId)
            is TargetRef.MatchText -> {
                for (q in ref.texts) {
                    val exact = nodes.firstOrNull { it.text.equals(q, ignoreCase = true) }
                    if (exact != null) return exact
                    val sub = nodes.firstOrNull { it.text.contains(q, ignoreCase = true) }
                    if (sub != null) return sub
                }
                null
            }
            is TargetRef.MatchRegex -> {
                val re = runCatching { Regex(ref.pattern, RegexOption.IGNORE_CASE) }.getOrNull() ?: return null
                val cands = nodes.filter { re.containsMatchIn(it.text) }
                if (cands.isEmpty()) return null
                when (ref.pick) {
                    "last" -> cands.last()
                    "largest" -> cands.maxByOrNull { it.text.length }
                    "largest_value" -> cands.maxByOrNull { extractNum(it.text) }
                    "smallest_value" -> cands.minByOrNull { extractNum(it.text) }
                    else -> cands.first()
                }
            }
            is TargetRef.ValueOf -> {
                for (lbl in ref.labels) {
                    val idx = nodes.indexOfFirst { it.text.contains(lbl, ignoreCase = true) }
                    if (idx >= 0 && idx + 1 < nodes.size) return nodes[idx + 1]
                }
                null
            }
            is TargetRef.Free -> null
        }
    }

    private fun extractNum(s: String): Double {
        val m = Regex("""[\d][\d\s.,]*""").findAll(s).lastOrNull()?.value ?: return -1.0
        return m.replace(Regex("""[\s\u00A0\u202F]"""), "").replace(',', '.').toDoubleOrNull() ?: -1.0
    }

    fun toAnswerContextJson(): JSONObject {
        val arr = JSONArray()
        for (n in nodes) {
            arr.put(
                JSONObject()
                    .put("node_id", n.nodeId)
                    .put("tag", n.tag)
                    .put("text", n.text)
                    .put("clickable", n.clickable)
                    .put("bounds", JSONArray().put(n.bounds[0]).put(n.bounds[1]).put(n.bounds[2]).put(n.bounds[3]))
                    .put("tone", n.tone)
            )
        }
        return JSONObject()
            .put("type", "screen_context")
            .put("channel", channel)
            .put("app", JSONObject().put("package", appPackage).put("activity", title.ifBlank { screenHint }))
            .put("page", JSONObject().put("url", "android://$appPackage/$screenHint").put("title", title))
            .put("screen_hint", screenHint)
            .put("nodes", arr)
    }
}

/** Ligne d'ardoise `notebook` (modes lines / flow / bars / table / choices). */
data class NotebookLine(
    val text: String = "",
    val value: String = "",
    val color: Ink = Ink.INK,
    val bold: Boolean = false,
    val divider: Boolean = false,
    val pct: Float? = null,
)

/** Actions visuelles & vocales v1.1 + v1.2 du contrat NkapSDK. */
sealed class NkapAction {
    abstract val id: String

    data class Speak(
        override val id: String,
        val text: String,
        val lang: String = "fr",
        val audioUrl: String? = null,
        val subFr: String? = null,
    ) : NkapAction()

    data class Caption(
        val text: String,
        val subFr: String? = null,
    ) : NkapAction() { override val id = "caption" }

    data class Circle(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 650,
    ) : NkapAction()

    data class Box(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 620,
    ) : NkapAction()

    data class Underline(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 450,
    ) : NkapAction()

    data class Highlight(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 420,
    ) : NkapAction()

    data class Frame(
        override val id: String,
        val target: TargetRef,
        val label: String? = null,
        val color: Ink = Ink.RED,
        val pad: Int = 10,
    ) : NkapAction()

    data class Arrow(
        override val id: String,
        val from: TargetRef,
        val to: TargetRef,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 720,
        val bow: Float = 0.16f,
    ) : NkapAction()

    data class Write(
        override val id: String,
        val text: String,
        val target: TargetRef,
        val size: Float = 24f,
        val color: Ink = Ink.INK,
        val backing: Boolean = true,
        val perLetterMs: Int = 45,
    ) : NkapAction()

    data class Callout(
        override val id: String,
        val target: TargetRef,
        val label: String,
        val color: Ink = Ink.YELLOW,
        val durationMs: Int = 480,
    ) : NkapAction()

    data class NumBadge(
        override val id: String,
        val target: TargetRef,
        val step: Int = 1,
        val label: String = "",
        val color: Ink = Ink.YELLOW,
    ) : NkapAction()

    data class Strike(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.RED,
        val durationMs: Int = 360,
    ) : NkapAction()

    data class Check(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.GREEN,
        val durationMs: Int = 380,
    ) : NkapAction()

    data class Cross(
        override val id: String,
        val target: TargetRef,
        val color: Ink = Ink.RED,
        val durationMs: Int = 380,
    ) : NkapAction()

    data class Notebook(
        override val id: String,
        val mode: String = "lines", // lines | flow | bars | table | choices
        val title: String = "",
        val anchor: TargetRef? = null,
        val lines: List<NotebookLine> = emptyList(),
        val steps: List<String> = emptyList(),
        val headers: List<String> = emptyList(),
        val rows: List<List<String>> = emptyList(),
        val choices: List<String> = emptyList(),
    ) : NkapAction()

    data class Hide(override val id: String) : NkapAction()
    object Clear : NkapAction() { override val id = "clear" }
}

data class TimedAction(
    val seq: Int,
    val runAfterMs: Int,
    val action: NkapAction,
)

data class FollowUpGoal(
    val targetScreens: List<String>,
    val targetCues: List<String>,
    val question: String,
    val ttlMs: Long = 30_000L,
)

data class BrainAnswer(
    val actions: List<TimedAction>,
    val followUp: FollowUpGoal? = null,
)

object ActionProtocol {

    fun parseAction(a: JSONObject): NkapAction? = runCatching {
        val id = a.optString("id", "m_${System.nanoTime() % 10000}")
        when (a.optString("t").lowercase()) {
            "speak" -> NkapAction.Speak(
                id = id,
                text = a.optString("text", a.optString("caption_fr", "")),
                lang = a.optString("lang", "fr"),
                audioUrl = a.optString("audio_url").ifBlank { null },
                subFr = a.optString("sub_fr").ifBlank { null },
            )
            "caption" -> NkapAction.Caption(
                text = a.optString("text", ""),
                subFr = a.optString("sub_fr").ifBlank { null },
            )
            "circle" -> NkapAction.Circle(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 650),
            )
            "box" -> NkapAction.Box(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 620),
            )
            "underline" -> NkapAction.Underline(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 450),
            )
            "highlight" -> NkapAction.Highlight(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 420),
            )
            "frame" -> NkapAction.Frame(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                label = a.optString("label").ifBlank { null },
                color = inkFrom(a.optString("color", "red")),
                pad = a.optInt("pad", 10),
            )
            "arrow" -> NkapAction.Arrow(
                id = id,
                from = TargetRef.from(a.optJSONObject("from")) ?: return null,
                to = TargetRef.from(a.optJSONObject("to")) ?: return null,
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 720),
                bow = a.optDouble("bow", 0.16).toFloat(),
            )
            "write" -> NkapAction.Write(
                id = id,
                text = a.optString("text", ""),
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                size = a.optDouble("size", 24.0).toFloat(),
                color = inkFrom(a.optString("color", "ink")),
                backing = a.optString("backing", "paper") != "none",
                perLetterMs = a.optInt("per_letter_ms", 45),
            )
            "callout" -> NkapAction.Callout(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                label = a.optString("label", a.optString("text", "")),
                color = inkFrom(a.optString("color", "yellow")),
                durationMs = a.optInt("duration_ms", 480),
            )
            "num" -> NkapAction.NumBadge(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                step = a.optInt("step", 1),
                label = a.optString("label", ""),
                color = inkFrom(a.optString("color", "yellow")),
            )
            "strike" -> NkapAction.Strike(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "red")),
                durationMs = a.optInt("duration_ms", 360),
            )
            "check" -> NkapAction.Check(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "green")),
                durationMs = a.optInt("duration_ms", 380),
            )
            "cross" -> NkapAction.Cross(
                id = id,
                target = TargetRef.from(a.optJSONObject("target")) ?: return null,
                color = inkFrom(a.optString("color", "red")),
                durationMs = a.optInt("duration_ms", 380),
            )
            "notebook" -> parseNotebook(id, a)
            "hide" -> NkapAction.Hide(id)
            "clear" -> NkapAction.Clear
            else -> null
        }
    }.getOrNull()

    private fun parseNotebook(id: String, a: JSONObject): NkapAction.Notebook {
        val mode = a.optString("mode", "lines").lowercase()
        val lines = ArrayList<NotebookLine>()
        val rawLines = a.optJSONArray("lines") ?: a.optJSONArray("bars")
        if (rawLines != null) {
            for (i in 0 until rawLines.length()) {
                val item = rawLines.optJSONObject(i) ?: continue
                val rawVal = item.optString("amount_text", item.optString("value", item.optString("amount", "")))
                val pctVal = when {
                    item.has("pct") -> item.optDouble("pct", 0.0).toFloat()
                    mode == "bars" && item.has("value") -> item.optDouble("value", 0.0).toFloat()
                    else -> null
                }
                lines.add(
                    NotebookLine(
                        text = item.optString("text", item.optString("label", "")),
                        value = rawVal,
                        color = inkFrom(item.optString("color", item.optString("tone", "ink"))),
                        bold = item.optBoolean("bold", false),
                        divider = item.optBoolean("divider", false),
                        pct = pctVal,
                    )
                )
            }
        }
        val steps = ArrayList<String>()
        val rawSteps = a.optJSONArray("steps")
        if (rawSteps != null) {
            for (i in 0 until rawSteps.length()) {
                val s = rawSteps.opt(i)
                when (s) {
                    is String -> if (s.isNotBlank()) steps.add(s)
                    is JSONObject -> {
                        val lbl = s.optString("label", s.optString("text", ""))
                        if (lbl.isNotBlank()) steps.add(lbl)
                    }
                }
            }
        }
        val headers = ArrayList<String>()
        a.optJSONArray("headers")?.let { h ->
            for (i in 0 until h.length()) headers.add(h.optString(i, ""))
        }
        val rows = ArrayList<List<String>>()
        a.optJSONArray("rows")?.let { rArr ->
            for (i in 0 until rArr.length()) {
                val row = rArr.optJSONArray(i) ?: continue
                rows.add((0 until row.length()).map { row.optString(it, "") })
            }
        }
        val choices = ArrayList<String>()
        a.optJSONArray("choices")?.let { cArr ->
            for (i in 0 until cArr.length()) {
                val item = cArr.opt(i)
                when (item) {
                    is String -> if (item.isNotBlank()) choices.add(item)
                    is JSONObject -> {
                        val lbl = item.optString("label", item.optString("text", ""))
                        if (lbl.isNotBlank()) choices.add(lbl)
                    }
                }
            }
        }
        return NkapAction.Notebook(
            id = id,
            mode = mode,
            title = a.optString("title", "Résumé"),
            anchor = TargetRef.from(a.optJSONObject("anchor")),
            lines = lines,
            steps = steps,
            headers = headers,
            rows = rows,
            choices = choices,
        )
    }

    fun parseAnswerResponse(body: String): List<TimedAction> = parseAnswerBundle(body).actions

    fun parseAnswerBundle(body: String): BrainAnswer = runCatching {
        val root = JSONObject(body)
        val arr = root.optJSONArray("actions")
        val actions = if (arr == null) {
            emptyList()
        } else {
            (0 until arr.length()).mapNotNull { i ->
                val item = arr.optJSONObject(i) ?: return@mapNotNull null
                val actJson = item.optJSONObject("action") ?: item
                val act = parseAction(actJson) ?: return@mapNotNull null
                TimedAction(
                    seq = item.optInt("seq", i + 1),
                    runAfterMs = item.optInt("run_after_ms", i * 500),
                    action = act,
                )
            }.sortedBy { it.seq }
        }
        val fuObj = root.optJSONObject("follow_up")
        val followUp = if (fuObj != null) {
            val screens = ArrayList<String>()
            fuObj.optJSONArray("target_screens")?.let { sArr ->
                for (i in 0 until sArr.length()) {
                    val s = sArr.optString(i).trim()
                    if (s.isNotEmpty()) screens.add(s)
                }
            }
            val cues = ArrayList<String>()
            fuObj.optJSONArray("target_cues")?.let { cArr ->
                for (i in 0 until cArr.length()) {
                    val c = cArr.optString(i).trim()
                    if (c.isNotEmpty()) cues.add(c)
                }
            }
            val q = fuObj.optString("question").trim()
            if (q.isNotEmpty() && (screens.isNotEmpty() || cues.isNotEmpty())) {
                FollowUpGoal(
                    targetScreens = screens,
                    targetCues = cues,
                    question = q,
                    ttlMs = fuObj.optLong("ttl_ms", 30_000L).coerceIn(8_000L, 60_000L),
                )
            } else null
        } else null
        BrainAnswer(actions = actions, followUp = followUp)
    }.getOrElse { BrainAnswer(emptyList(), null) }
}
