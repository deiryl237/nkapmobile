package cm.nkapmobile.engine.demo

import android.content.Context
import android.os.Handler
import android.os.Looper
import cm.nkapmobile.engine.Engine
import cm.nkapmobile.engine.core.ActionStreamParser
import cm.nkapmobile.engine.core.TimedAction
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mode démo OFFLINE : les parcours imposés (P1 solde, P2 frais, P3 transfert,
 * P5 erreur/sécurité) sont embarqués en assets et rejoués sur N'IMPORTE QUELLE
 * écran — les cibles sont résolues par `match_text` sur le ScreenContext courant.
 *
 * Extension offline documentée : les fixtures peuvent cibler par match_text
 * au lieu de node_id (le mode serveur reste strictement node_id, contrat §5).
 * Le jour du dépôt, ce mode tourne même sans internet ni serveur.
 */
class DemoDirector(
    private val context: Context,
    private val snapshotProvider: () -> cm.nkapmobile.engine.core.ScreenContext?,
) {

    private val handler = Handler(Looper.getMainLooper())
    private val parcours = listOf("p1-solde", "p2-frais", "p3-transfert", "p5-erreur")
    private var index = 0
    private var running = false

    fun next(): String {
        // Un tap annule le tour courant et joue le suivant — la démo reste réactive.
        handler.removeCallbacksAndMessages(null)
        Engine.renderer?.clearAll()
        running = false
        val id = parcours[index % parcours.size]
        index++
        play(id)
        return id
    }

    private fun play(parcoursId: String) {
        val json = runCatching {
            context.assets.open("fixtures/actions-$parcoursId.json").bufferedReader().use { it.readText() }
        }.getOrElse {
            Engine.renderer?.showCaption("fixture manquante: $parcoursId")
            return
        }

        val snapshot = snapshotProvider() ?: run {
            Engine.renderer?.showCaption("Active le service d'accessibilité d'abord")
            return
        }

        val resolved = resolveMatchText(JSONObject(json), snapshot)
        val steps = resolved.optJSONArray("steps") ?: run {
            Engine.renderer?.showCaption("fixture sans steps")
            return
        }
        val actions = ArrayList<TimedAction>()
        for (i in 0 until steps.length()) {
            val step = steps.getJSONObject(i)
            val at = step.optInt("at", 0)
            val dos = step.optJSONArray("do") ?: continue
            for (j in 0 until dos.length()) {
                val a = ActionStreamParser.parseAction(dos.getJSONObject(j))
                if (a != null) actions.add(TimedAction(seq = actions.size + 1, speakSeg = null, runAfterMs = at, action = a))
            }
        }
        if (actions.isEmpty()) {
            Engine.renderer?.showCaption("Aucune cible trouvée sur cet écran pour $parcoursId")
            return
        }
        running = true
        handler.post {
            Engine.executeTurn(actions, handler)
            handler.postDelayed({ running = false }, actions.maxOfOrNull { it.runAfterMs }?.plus(3600L) ?: 4000L)
        }
    }

    /** Extension offline : {"match_text":"…"} → node_id du snapshot courant. */
    private fun resolveMatchText(root: JSONObject, snapshot: cm.nkapmobile.engine.core.ScreenContext): JSONObject {
        fun walk(o: JSONObject): JSONObject {
            for (key in listOf("target", "from", "to", "at")) {
                val p = o.optJSONObject(key) ?: continue
                val match = p.optString("match_text").ifEmpty { null }
                if (match != null) {
                    val node = snapshot.findByTextContains(match)
                    p.put("node_id", node?.nodeId ?: "__not_found__")
                    p.remove("match_text")
                }
            }
            return o
        }
        val steps = root.optJSONArray("steps") ?: return root
        for (i in 0 until steps.length()) {
            val step = steps.getJSONObject(i)
            val dos = step.optJSONArray("do") ?: continue
            for (j in 0 until dos.length()) walk(dos.getJSONObject(j))
        }
        return root
    }
}
