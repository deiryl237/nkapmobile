package cm.nkapmobile.engine

import android.content.Context
import android.speech.tts.TextToSpeech
import cm.nkapmobile.engine.core.*
import cm.nkapmobile.engine.overlay.OverlaySurface
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Orchestrateur du moteur (M1+M4). Singleton léger possédé par le service
 * d'accessibilité ; il reçoit les actions (mode démo offline ou mode serveur WS),
 * applique les règles de composition et délègue le rendu à l'OverlaySurface.
 */
object Engine {

    enum class Mode { OFFLINE_DEMO, SERVER }

    var mode: Mode = Mode.OFFLINE_DEMO
    var context: ScreenContext? = null
    var renderer: OverlaySurface? = null
    val rules = CompositionRules()

    /** Limite basse de zone sûre (px surface) — chrome hôte à ne pas recouvrir. */
    var safeBottomPx: Int = 120

    /** TTS système : placeholder vocal (le vrai TTS ewondo = M3 / banque vocale). */
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    fun initTts(ctx: Context) {
        if (tts != null) return
        tts = TextToSpeech(ctx) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            tts?.language = Locale.FRENCH // placeholder — l'ewondo viendra de M3
        }
    }

    fun shutdownTts() {
        tts?.shutdown()
        tts = null
        ttsReady = false
    }

    fun updateContext(ctx: ScreenContext) {
        context = ctx
        renderer?.onContextChanged()
    }

    /** Exécute une action horodatée du flux (contrat §5). */
    fun execute(timed: TimedAction) {
        val surface = renderer ?: return
        val ctx = context
        val a = timed.action

        // Règle montants : recopiés à l'identique ou rejetés (docs/02 §5.4)
        val textOfAction = when (a) {
            is Action.Write -> a.text
            is Action.Speak -> a.text
            is Action.Caption -> a.text
            else -> null
        }
        if (textOfAction != null && !rules.amountsPreserved(textOfAction, ctx)) {
            android.util.Log.w("nkapengine", "REJET (montant altéré): $textOfAction")
            return
        }

        when (a) {
            is Action.Speak -> {
                if (a.audioUrl != null) {
                    surface.playAudio(a.audioUrl)
                } else {
                    // v1 démo : TTS système placeholder (M3 fournira l'audio ewondo)
                    if (ttsReady) tts?.speak(a.text, TextToSpeech.QUEUE_FLUSH, null, a.id)
                }
                surface.showCaption(a.text)
            }
            is Action.Caption -> surface.showCaption(a.text, a.subFr)
            is Action.Circle -> surface.showCircle(resolveTarget(a.target, ctx), a.color, a.durationMs, a.id)
            is Action.Underline -> surface.showUnderline(resolveTarget(a.target, ctx), a.color, a.durationMs, a.id)
            is Action.Write -> surface.showWrite(a.text, resolveCenter(a.at, ctx), a.size, a.color, a.backing, a.perLetterMs, a.id)
            is Action.Frame -> surface.showFrame(resolveRect(a.target, ctx), a.label, a.color, a.pad, a.id)
            is Action.Arrow -> surface.showArrow(resolveCenter(a.from, ctx), resolveCenter(a.to, ctx), a.color, a.durationMs, a.bow, a.id)
            is Action.Hide -> surface.hideMark(a.id)
            is Action.Clear -> surface.clearAll()
        }

        // Budget ≤ 3 marques vivantes : les plus anciennes s'effacent
        rules.onMarkShown(a.id).forEach { surface.hideMark(it) }
        if (a is Action.Clear) rules.onCleared() else if (a is Action.Hide) rules.onHidden(a.id)
    }

    /** Exécute une liste d'actions selon leur run_after_ms (relatif au début du tour). */
    fun executeTurn(actions: List<TimedAction>, handler: android.os.Handler) {
        for (t in actions) {
            handler.postDelayed({ execute(t) }, t.runAfterMs.coerceAtLeast(0).toLong())
        }
        val total = actions.maxOfOrNull { it.runAfterMs } ?: 0
        handler.postDelayed({ renderer?.clearAll() }, (total + 3500).coerceAtLeast(2000).toLong())
    }

    /** Résout une Pos en px écran via le contexte courant (jamais stocké : résolu à l'exécution). */
    fun resolveTarget(pos: Pos, ctx: ScreenContext?): ScreenNode? = when (pos) {
        is Pos.Node -> ctx?.findNode(pos.nodeId)
        is Pos.Free -> null
    }

    fun resolveCenter(pos: Pos, ctx: ScreenContext?): Pair<Float, Float>? {
        return when (pos) {
            is Pos.Node -> ctx?.findNode(pos.nodeId)?.let {
                Pair((it.bounds[0] + it.bounds[2]) / 2f + pos.dx,
                     (it.bounds[1] + it.bounds[3]) / 2f + pos.dy)
            }
            is Pos.Free -> {
                val w = renderer?.widthPx?.toFloat() ?: return null
                val h = renderer?.heightPx?.toFloat() ?: return null
                Pair(pos.x * w, pos.y * h)
            }
        }
    }

    fun resolveRect(pos: Pos, ctx: ScreenContext?): ScreenNode? = resolveTarget(pos, ctx)

    // ---- émission ScreenContext (M4 → I5) --------------------------------

    fun contextJson(ctx: ScreenContext): JSONObject {
        val nodes = JSONArray()
        for (n in ctx.nodes) {
            nodes.put(
                JSONObject()
                    .put("node_id", n.nodeId)
                    .put("path", n.path)
                    .put("cls", n.cls)
                    .put("text", n.text)
                    .put("clickable", n.clickable)
                    .put("l", n.bounds[0]).put("t", n.bounds[1])
                    .put("r", n.bounds[2]).put("b", n.bounds[3])
                    .put("tone", "unknown")
            )
        }
        return JSONObject()
            .put("type", "screen_context")
            .put("app", JSONObject().put("package", ctx.appPackage))
            .put("screen_hint", ctx.screenHint)
            .put("nodes", nodes)
    }
}
