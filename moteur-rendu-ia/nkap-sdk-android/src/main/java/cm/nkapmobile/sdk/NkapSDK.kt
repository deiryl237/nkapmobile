package cm.nkapmobile.sdk

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import cm.nkapmobile.sdk.context.ViewTreeScanner
import cm.nkapmobile.sdk.core.*
import cm.nkapmobile.sdk.net.BrainClient
import cm.nkapmobile.sdk.net.HealthInfo
import cm.nkapmobile.sdk.ui.JarvisOrbView
import cm.nkapmobile.sdk.ui.NkapChatDrawer
import cm.nkapmobile.sdk.ui.NkapOverlayView
import cm.nkapmobile.sdk.voice.NkapVoiceController
import java.text.Normalizer

data class NkapConfig(
    val brainUrl: String = NkapSDK.DEFAULT_BRAIN_URL,
    val langHint: String = "fr",
)

/**
 * Point d'entrée public du SDK Android NkapMobile (.aar) :
 *
 * Intégration en 2 lignes dans n'importe quelle Activity Android :
 * ```kotlin
 * val nkap = NkapSDK.attach(this, NkapConfig(brainUrl = "https://13.51.168.107.sslip.io"))
 * ```
 */
object NkapSDK {
    const val DEFAULT_BRAIN_URL = "https://13.51.168.107.sslip.io"

    fun attach(activity: Activity, config: NkapConfig = NkapConfig()): NkapSession {
        val session = NkapSession(
            context = activity,
            config = config,
            contextProvider = { ViewTreeScanner.scan(activity) },
        )
        session.mountInActivity(activity)
        return session
    }

    fun checkHealth(brainUrl: String = DEFAULT_BRAIN_URL, callback: (HealthInfo) -> Unit) {
        BrainClient(brainUrl).checkHealth(callback)
    }
}

/**
 * Orchestrateur d'une session NkapSDK (utilisable à la fois en mode SDK intégré .aar
 * dans une Activity ET en mode AccessibilityService universel).
 */
class NkapSession(
    private val context: Context,
    config: NkapConfig = NkapConfig(),
    private val contextProvider: () -> ScreenContext,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val rules = CompositionRules()
    private val scheduledRunnables = ArrayList<Runnable>()
    private val d = context.resources.displayMetrics.density
    private fun dp(v: Int): Int = (v * d).toInt()

    val brainClient = BrainClient(config.brainUrl)
    private val langHint = config.langHint

    val overlayView = NkapOverlayView(context)
    lateinit var orbView: JarvisOrbView
        private set
    lateinit var drawerView: NkapChatDrawer
        private set
    val voiceController: NkapVoiceController

    private var rootFrame: FrameLayout? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var lastContext: ScreenContext? = null

    private data class PendingGoalState(
        val goal: FollowUpGoal,
        val originSig: String,
        val expiresAtMs: Long,
    )

    private var pendingGoal: PendingGoalState? = null
    private var pendingGoalRunnable: Runnable? = null

    private var activeVisualPkg: String = ""
    private var activeVisualAppScreen: Pair<String, String>? = null
    private var activeVisualTexts: Set<String> = emptySet()

    private fun normText(s: String): String {
        val decomposed = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD)
        return decomposed.replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "").replace(Regex("\\s+"), " ").trim()
    }

    private fun screenCorpus(ctx: ScreenContext): String =
        normText(ctx.nodes.take(80).joinToString(" ") { it.text })

    /** Identifie l'application active (Wave, Max it, SAFINUM, générique) et son sous-écran exact (aligné sur M5 KB). */
    fun inferAppAndScreen(ctx: ScreenContext): Pair<String, String> {
        val pkg = ctx.appPackage.lowercase()
        val corpus = screenCorpus(ctx)
        val isWave = pkg.contains("wave") ||
            listOf("hide balance", "enter a new number", "scan to send", "gimac transfer", "eneo prepaid", "cam-water", "lock your vault").any { corpus.contains(it) }
        if (isWave) {
            val hasHomeCue = listOf("hide balance", "show balance", "masquer le solde", "afficher le solde").any { corpus.contains(it) }
            val hasHomeActionBar = listOf("bills", "factures", "more", "gimac transfer").any { corpus.contains(it) }
            val screen = when {
                !hasHomeActionBar && listOf(
                    "add vault", "transfer in", "transfer out", "lock your vault", "your vault is empty",
                    "lock vault", "transfer to vault", "withdraw from vault", "my vault", "mon coffre"
                ).any { corpus.contains(it) } -> "vault"
                !hasHomeCue && (corpus.contains("scan to send") || corpus.contains("scanner pour envoyer") ||
                    (corpus.contains("enter a new number") && corpus.contains("contacts"))) -> "send_money"
                !hasHomeCue && listOf("send amount", "receive amount", "montant envoye", "montant recu", "wave fee").any { corpus.contains(it) } -> "send_amount"
                !hasHomeCue && listOf("full name", "nom complet", "enter a phone number").any { corpus.contains(it) } -> "send_new_number"
                !hasHomeCue && (ctx.title.lowercase().contains("cardfullscreen") || corpus.contains("scan to pay")) -> "card_qr"
                !hasHomeCue && listOf("reset secret code", "call support", "find nearby agents", "verify your limit").any { corpus.contains(it) } -> "settings"
                !hasHomeCue && listOf(
                    "search by name", "rechercher par nom", "electricity", "utilities", "payments", "paiements",
                    "eneo prepaid", "eneo postpaid", "eneo", "cam-water", "camwater", "canal+"
                ).any { corpus.contains(it) } -> "bills"
                !hasHomeCue && listOf("airtime", "rewards", "transport").any { corpus.contains(it) } -> "more"
                else -> "home"
            }
            return "wave" to screen
        }

        val isMaxIt = pkg.contains("orange") || pkg.contains("maxit") ||
            listOf("main account", "om loyalty", "my credits", "buy a bundle").any { corpus.contains(it) }
        if (isMaxIt) {
            val hasHome = listOf("main account", "my credits", "om loyalty").any { corpus.contains(it) }
            val screen = when {
                !hasHome && listOf("enter amount", "montant a envoyer", "recipient", "orange money transfer").any { corpus.contains(it) } -> "transfer"
                !hasHome && listOf("internet bundles", "voice bundles", "forfaits internet", "choose a bundle").any { corpus.contains(it) } -> "bundle"
                !hasHome && listOf("airtime amount", "recharger un numero", "top up number").any { corpus.contains(it) } -> "topup"
                !hasHome && listOf("cancel a transaction", "transaction to cancel", "annulation de transfert").any { corpus.contains(it) } -> "cancel"
                else -> "home"
            }
            return "maxit" to screen
        }

        val isSafinum = pkg.contains("nkapmobile") ||
            listOf("banque demo", "lomo moni", "loma moni", "mbembe kiri", "idiba bwam", "mbole", "miango", "misongi", "bakuse moni").any { corpus.contains(it) }
        if (isSafinum) {
            val screen = when {
                listOf("operation reussie", "mvet o boban mben", "ebolo e tilabe na bwam", "nouveau solde", "itan mfefe", "epetele").any { corpus.contains(it) } -> "receipt"
                listOf("verifiez avant de confirmer", "fombo ossussua", "ombwa oboso ba bamse", "sele jombwa miango", "musongi mu londi", "timba la mbusa si titi").any { corpus.contains(it) } -> "review"
                listOf("mes beneficiaires", "bot bam ba non moni", "bakusa bam", "bakuse moni", "jusqu'a 500 000", "akui 500 000").any { corpus.contains(it) } -> "transfer"
                !corpus.contains("solde disponible") && !corpus.contains("itan ineu") &&
                    ((corpus.contains("entrants") && corpus.contains("sortants")) ||
                        (corpus.contains("bi bi") && corpus.contains("bi lom")) ||
                        (corpus.contains("moni mu mingeye") && corpus.contains("moni mu mabuse")) ||
                        corpus.contains("itang mvet")) -> "history"
                !corpus.contains("solde disponible") && listOf("numero a recharger", "nombo ya lomo kredi", "operateur detecte", "miiyo :").any { corpus.contains(it) } -> "pay_airtime"
                !corpus.contains("solde disponible") && listOf("choisir le service", "tob isae", "pona ebolo").any { corpus.contains(it) } -> "pay_bill"
                else -> "home"
            }
            return "safinum" to screen
        }

        return "generic" to ctx.screenHint
    }

    fun hasPendingGoal(): Boolean {
        val g = pendingGoal ?: return false
        if (System.currentTimeMillis() > g.expiresAtMs) {
            clearPendingGoal()
            return false
        }
        return true
    }

    fun shouldWatchScreenChanges(): Boolean =
        hasPendingGoal() || overlayView.hasActiveMarks() || voiceController.isSpeaking

    fun clearPendingGoal() {
        pendingGoal = null
        pendingGoalRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingGoalRunnable = null
    }

    /** Appelé dès que l'écran ou l'application change : efface les visuels obsolètes + coupe la voix, puis reprend un éventuel objectif multi-écrans. */
    fun onScreenSnapshotUpdated(ctx: ScreenContext) {
        if (ctx.nodes.isEmpty()) return
        if (ctx.appPackage == context.packageName && drawerView.visibility == View.VISIBLE) return

        // 1. Si des marques ou une voix de l'écran précédent sont encore actives et que l'écran/app a changé -> nettoyage immédiat !
        if (overlayView.hasActiveMarks() || voiceController.isSpeaking) {
            val curAppScreen = inferAppAndScreen(ctx)
            val pkgChanged = activeVisualPkg.isNotEmpty() && ctx.appPackage != activeVisualPkg
            val screenChanged = activeVisualAppScreen != null && curAppScreen != activeVisualAppScreen
            val curTexts = ctx.nodes.take(60).map { normText(it.text) }.filter { it.length >= 2 }.toSet()
            val overlapRatio = if (activeVisualTexts.size >= 3) {
                activeVisualTexts.count { it in curTexts }.toFloat() / activeVisualTexts.size.toFloat()
            } else 1f
            if (pkgChanged || screenChanged || overlapRatio < 0.35f) {
                android.util.Log.i(
                    "NkapSDK",
                    "Screen changed (pkg=$pkgChanged, screen=$screenChanged, overlap=${"%.2f".format(overlapRatio)}) -> clearing visuals & voice"
                )
                activeVisualPkg = ""
                activeVisualAppScreen = null
                activeVisualTexts = emptySet()
                cancelScheduled()
                voiceController.stopAll()
                overlayView.clearAll()
                rules.onCleared()
                if (!isListening) orbView.state = JarvisOrbView.OrbState.IDLE
            }
        }

        // 2. Suivi d'objectif multi-écrans (reprise automatique dès l'arrivée sur l'écran cible)
        val state = pendingGoal ?: return
        if (System.currentTimeMillis() > state.expiresAtMs) {
            clearPendingGoal()
            return
        }
        val corpus = screenCorpus(ctx)
        if (corpus.isBlank() || corpus.take(360) == state.originSig) return
        val inferredScreen = inferAppAndScreen(ctx).second
        val targetScreensHit = state.goal.targetScreens.isNotEmpty() &&
            state.goal.targetScreens.any { normText(it) == normText(inferredScreen) }
        val cueHit = state.goal.targetScreens.isEmpty() && state.goal.targetCues.any { cue ->
            val nCue = normText(cue)
            nCue.isNotEmpty() && corpus.contains(nCue)
        }
        val screenHit = targetScreensHit || cueHit
        if (!screenHit) return

        val questionToResume = state.goal.question
        clearPendingGoal()
        android.util.Log.i("NkapSDK", "Pending goal target reached -> resuming: $questionToResume")
        val r = Runnable {
            pendingGoalRunnable = null
            ask(questionToResume, isFollowUp = true)
        }
        pendingGoalRunnable = r
        mainHandler.postDelayed(r, 380L)
    }

    private var orbMarginLeft = 0
    private var orbMarginTop = 0
    private var mounted = false

    /** Hooks optionnels utilisés quand la session est montée via WindowManager (AccessibilityService). */
    var onOrbDraggedExternal: ((dx: Float, dy: Float) -> Unit)? = null
    var onDrawerToggledExternal: ((visible: Boolean) -> Unit)? = null

    init {
        voiceController = NkapVoiceController(context) { speaking ->
            if (!isListening) {
                orbView.state = if (speaking) JarvisOrbView.OrbState.SPEAKING else JarvisOrbView.OrbState.IDLE
            }
        }
        orbView = JarvisOrbView(
            ctx = context,
            onTap = { toggleDrawer() },
            onDragDelta = { dx, dy ->
                val ext = onOrbDraggedExternal
                if (ext != null) ext(dx, dy) else moveOrbBy(dx, dy)
            },
            onDragEnd = { positionDrawerNearOrb() },
        )
        drawerView = NkapChatDrawer(
            ctx = context,
            onAsk = { q -> ask(q) },
            onClear = { clearAll() },
            onToggleVoice = {
                voiceController.audioEnabled = !voiceController.audioEnabled
                if (!voiceController.audioEnabled) voiceController.stopAll()
                voiceController.audioEnabled
            },
            onToggleMic = { toggleMic() },
            onClose = { closeDrawer() },
        )
    }

    /** Monte l'overlay + l'orbe Jarvis + le tiroir chat directement dans la DecorView d'une Activity. */
    fun mountInActivity(activity: Activity) {
        if (mounted) return
        mounted = true
        val decor = activity.window?.decorView as? ViewGroup ?: return

        val container = FrameLayout(activity).apply {
            tag = ViewTreeScanner.OVERLAY_TAG
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            isClickable = false
            isFocusable = false
        }

        container.addView(
            overlayView,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        )

        val orbSize = dp(74)
        val screenW = activity.resources.displayMetrics.widthPixels
        orbMarginLeft = (screenW - orbSize - dp(12)).coerceAtLeast(dp(8))
        orbMarginTop = dp(52)

        val orbLp = FrameLayout.LayoutParams(orbSize, orbSize + dp(10)).apply {
            gravity = Gravity.TOP or Gravity.START
            leftMargin = orbMarginLeft
            topMargin = orbMarginTop
        }
        container.addView(orbView, orbLp)

        drawerView.visibility = View.GONE
        val drawerW = (screenW - dp(24)).coerceAtMost(dp(344))
        val drawerLp = FrameLayout.LayoutParams(drawerW, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.TOP or Gravity.START
            leftMargin = (screenW - drawerW) / 2
            topMargin = orbMarginTop + orbSize + dp(8)
        }
        container.addView(drawerView, drawerLp)

        decor.addView(container)
        rootFrame = container
    }

    private fun moveOrbBy(dx: Float, dy: Float) {
        val parent = rootFrame ?: return
        val lp = orbView.layoutParams as? FrameLayout.LayoutParams ?: return
        val maxX = (parent.width - orbView.width - dp(6)).coerceAtLeast(dp(6))
        val maxY = (parent.height - orbView.height - dp(16)).coerceAtLeast(dp(32))
        orbMarginLeft = (orbMarginLeft + dx.toInt()).coerceIn(dp(6), maxX)
        orbMarginTop = (orbMarginTop + dy.toInt()).coerceIn(dp(28), maxY)
        lp.leftMargin = orbMarginLeft
        lp.topMargin = orbMarginTop
        orbView.layoutParams = lp
        if (drawerView.visibility == View.VISIBLE) positionDrawerNearOrb()
    }

    private fun positionDrawerNearOrb() {
        val parent = rootFrame ?: return
        val lp = drawerView.layoutParams as? FrameLayout.LayoutParams ?: return
        val w = lp.width.takeIf { it > 0 } ?: dp(320)
        val left = (orbMarginLeft + orbView.width - w).coerceIn(dp(10), (parent.width - w - dp(10)).coerceAtLeast(dp(10)))
        val spaceBelow = parent.height - (orbMarginTop + orbView.height) - dp(24)
        val top = if (spaceBelow < dp(240) && orbMarginTop > dp(260)) {
            (orbMarginTop - dp(310)).coerceAtLeast(dp(36))
        } else {
            (orbMarginTop + orbView.height + dp(8)).coerceAtMost((parent.height - dp(220)).coerceAtLeast(dp(40)))
        }
        lp.leftMargin = left
        lp.topMargin = top
        drawerView.layoutParams = lp
    }

    fun toggleDrawer() {
        if (drawerView.visibility == View.VISIBLE) {
            closeDrawer()
        } else {
            val ctx = runCatching { contextProvider() }.getOrNull()
            lastContext = ctx
            val (appId, screenKey) = if (ctx != null) inferAppAndScreen(ctx) else ("generic" to "home")
            drawerView.refreshSuggestions(appId, screenKey, brainClient.brainUrl.isNotBlank())
            positionDrawerNearOrb()
            drawerView.visibility = View.VISIBLE
            drawerView.alpha = 0f
            drawerView.translationY = -12f * d
            drawerView.animate().alpha(1f).translationY(0f).setDuration(200).start()
            orbView.showLabel = true
            onDrawerToggledExternal?.invoke(true)
        }
    }

    fun closeDrawer() {
        drawerView.visibility = View.GONE
        if (!isListening) orbView.showLabel = false
        onDrawerToggledExternal?.invoke(false)
    }

    fun ask(question: String, isFollowUp: Boolean = false) {
        val q = question.trim()
        if (q.isEmpty()) return
        if (!isFollowUp) clearPendingGoal()
        closeDrawer()
        cancelScheduled()
        voiceController.stopAll()
        overlayView.clearAll()
        rules.onCleared()

        val ctx = runCatching { contextProvider() }.getOrElse {
            ScreenContext(context.packageName, "Application", "home", "mobile", emptyList())
        }
        lastContext = ctx
        orbView.state = JarvisOrbView.OrbState.THINKING
        overlayView.showCaption("Réflexion en cours…")

        brainClient.ask(
            question = q,
            context = ctx,
            langHint = langHint,
            onFollowUp = { fu ->
                if (!isFollowUp && fu != null) {
                    mainHandler.post {
                        pendingGoal = PendingGoalState(
                            goal = fu,
                            originSig = screenCorpus(ctx).take(360),
                            expiresAtMs = System.currentTimeMillis() + fu.ttlMs,
                        )
                    }
                }
            },
            onResult = { actions ->
                mainHandler.post {
                    if (actions.isEmpty()) {
                        orbView.state = JarvisOrbView.OrbState.IDLE
                        overlayView.showCaption("Je n'ai pas reçu d'action exploitable.")
                        return@post
                    }
                    playActions(actions, ctx)
                }
            },
            onError = { err ->
                mainHandler.post {
                    orbView.state = JarvisOrbView.OrbState.IDLE
                    overlayView.showCaption("Serveur indisponible ($err)")
                }
            },
        )
    }

    fun playActions(actions: List<TimedAction>, ctx: ScreenContext) {
        cancelScheduled()
        overlayView.clearAll()
        rules.onCleared()
        activeVisualPkg = ctx.appPackage
        activeVisualAppScreen = inferAppAndScreen(ctx)
        activeVisualTexts = ctx.nodes.take(60).map { normText(it.text) }.filter { it.length >= 2 }.toSet()

        var nextDrawAt = 0L
        var hasClear = false

        for (item in actions) {
            val act = item.action
            val isDraw = act is NkapAction.Circle || act is NkapAction.Box || act is NkapAction.Underline ||
                act is NkapAction.Highlight || act is NkapAction.Frame || act is NkapAction.Arrow ||
                act is NkapAction.Callout || act is NkapAction.NumBadge || act is NkapAction.Strike ||
                act is NkapAction.Check || act is NkapAction.Cross

            var delay = item.runAfterMs.toLong().coerceAtLeast(0L)
            if (isDraw) {
                if (delay < nextDrawAt) delay = nextDrawAt
                nextDrawAt = delay + 580L
            } else if (act is NkapAction.Clear) {
                hasClear = true
                if (delay < nextDrawAt + 3200L) delay = nextDrawAt + 3200L
            }

            val r = Runnable { executeAction(act, ctx) }
            scheduledRunnables.add(r)
            if (delay == 0L) r.run() else mainHandler.postDelayed(r, delay)
        }

        if (!hasClear) {
            val clearR = Runnable { scheduleClearAfterVoice() }
            scheduledRunnables.add(clearR)
            mainHandler.postDelayed(clearR, (nextDrawAt + 4200L).coerceAtLeast(6000L))
        }
    }

    private fun executeAction(act: NkapAction, ctx: ScreenContext) {
        when (act) {
            is NkapAction.Speak -> {
                overlayView.showCaption(act.text, act.subFr)
                voiceController.enqueue(act.text, act.audioUrl)
            }
            is NkapAction.Caption -> overlayView.showCaption(act.text, act.subFr)
            is NkapAction.Circle -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showCircle(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Box -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showBox(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Underline -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showUnderline(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Highlight -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showHighlight(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Frame -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showFrame(n, act.label, act.color, act.pad, act.id)
            }
            is NkapAction.Arrow -> {
                val a = ctx.resolve(act.from)
                val b = ctx.resolve(act.to)
                if (a != null && b != null) {
                    enforceBudget(act.id)
                    overlayView.showArrow(a, b, act.color, act.durationMs, act.bow, act.id)
                }
            }
            is NkapAction.Write -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showWrite(act.text, n, act.size, act.color, act.backing, act.perLetterMs, act.id)
            }
            is NkapAction.Callout -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showCallout(n, act.label, act.color, act.id)
            }
            is NkapAction.NumBadge -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showNum(n, act.step, act.label, act.color, act.id)
            }
            is NkapAction.Strike -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showStrike(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Check -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showCheck(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Cross -> {
                val n = ctx.resolve(act.target) ?: return
                enforceBudget(act.id)
                overlayView.showCross(n, act.color, act.durationMs, act.id)
            }
            is NkapAction.Notebook -> {
                val anchor = ctx.resolve(act.anchor)
                overlayView.showNotebook(act, anchor)
            }
            is NkapAction.Hide -> {
                rules.onHidden(act.id)
                overlayView.hideMark(act.id)
            }
            is NkapAction.Clear -> scheduleClearAfterVoice()
        }
    }

    private fun enforceBudget(id: String) {
        rules.onMarkShown(id, max = 3).forEach { overlayView.hideMark(it) }
    }

    private fun scheduleClearAfterVoice() {
        voiceController.onIdleOnce {
            val r = Runnable {
                overlayView.clearAll()
                rules.onCleared()
                if (!voiceController.isSpeaking && !isListening) {
                    orbView.state = JarvisOrbView.OrbState.IDLE
                }
            }
            scheduledRunnables.add(r)
            mainHandler.postDelayed(r, 700L)
        }
    }

    private fun toggleMic() {
        // 1. Vérifie d'abord la permission RECORD_AUDIO (sinon SpeechRecognizer échoue silencieusement avec code 9)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
        ) {
            if (context is Activity) {
                context.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 701)
                overlayView.showCaption("Autorise le micro puis appuie de nouveau sur le bouton.")
            } else {
                overlayView.showCaption("Permission micro requise : ouvre l'app nkap engine pour l'autoriser.")
                runCatching {
                    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(launch)
                    }
                }
            }
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            overlayView.showCaption("Reconnaissance vocale indisponible sur cet appareil.")
            return
        }
        if (isListening) {
            runCatching { speechRecognizer?.stopListening() }
            isListening = false
            drawerView.setMicActive(false)
            orbView.state = JarvisOrbView.OrbState.IDLE
            overlayView.showCaption(null)
            return
        }
        voiceController.stopAll()
        isListening = true
        drawerView.setMicActive(true)
        orbView.state = JarvisOrbView.OrbState.LISTENING
        orbView.showLabel = true
        overlayView.showCaption("Je t'écoute… parle maintenant")

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        isListening = true
                        drawerView.setMicActive(true)
                        orbView.state = JarvisOrbView.OrbState.LISTENING
                        overlayView.showCaption("Je t'écoute…")
                    }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {
                        isListening = false
                        drawerView.setMicActive(false)
                    }
                    override fun onError(error: Int) {
                        isListening = false
                        drawerView.setMicActive(false)
                        orbView.state = JarvisOrbView.OrbState.IDLE
                        val msg = when (error) {
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permission micro refusée."
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Je n'ai rien entendu, réessaie."
                            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Réseau vocal indisponible."
                            else -> "Micro interrompu (code $error), réessaie."
                        }
                        android.util.Log.w("NkapSDK", "SpeechRecognizer error=$error")
                        overlayView.showCaption(msg)
                    }
                    override fun onResults(results: Bundle?) {
                        isListening = false
                        drawerView.setMicActive(false)
                        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                        if (!text.isNullOrBlank()) {
                            ask(text)
                        } else {
                            orbView.state = JarvisOrbView.OrbState.IDLE
                            overlayView.showCaption("Je n'ai rien entendu, réessaie.")
                        }
                    }
                    override fun onPartialResults(partialResults: Bundle?) {
                        val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                        if (!partial.isNullOrBlank()) {
                            overlayView.showCaption("« $partial »")
                        }
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })
            }
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        runCatching { speechRecognizer?.startListening(intent) }.onFailure { err ->
            isListening = false
            drawerView.setMicActive(false)
            orbView.state = JarvisOrbView.OrbState.IDLE
            overlayView.showCaption("Impossible de démarrer le micro : ${err.localizedMessage ?: "erreur"}")
        }
    }

    private fun cancelScheduled() {
        scheduledRunnables.forEach { mainHandler.removeCallbacks(it) }
        scheduledRunnables.clear()
    }

    fun clearAll() {
        activeVisualPkg = ""
        activeVisualAppScreen = null
        activeVisualTexts = emptySet()
        cancelScheduled()
        voiceController.stopAll()
        overlayView.clearAll()
        rules.onCleared()
        orbView.state = JarvisOrbView.OrbState.IDLE
    }

    fun destroy() {
        clearPendingGoal()
        cancelScheduled()
        voiceController.shutdown()
        runCatching { speechRecognizer?.destroy() }
        speechRecognizer = null
        rootFrame?.let { (it.parent as? ViewGroup)?.removeView(it) }
        rootFrame = null
        mounted = false
    }
}
