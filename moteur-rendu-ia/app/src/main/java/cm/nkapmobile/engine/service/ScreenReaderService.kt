package cm.nkapmobile.engine.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import cm.nkapmobile.engine.Engine
import cm.nkapmobile.engine.core.ScreenContext
import cm.nkapmobile.engine.core.ScreenNode
import cm.nkapmobile.engine.overlay.AssistantBubble
import cm.nkapmobile.engine.overlay.CaptionLayer
import cm.nkapmobile.engine.overlay.OverlaySurface
import cm.nkapmobile.engine.demo.DemoDirector
import cm.nkapmobile.engine.session.WsSession

/**
 * M4 + M1 : lit l'arbre d'écran (sans les champs de saisie), produit le
 * ScreenContext (I5) et héberge les deux couches d'overlay du moteur (I4).
 *
 * Sécurité (contrat §2) : aucun champ password/EditText n'est jamais dumpé.
 */
class ScreenReaderService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var surface: OverlaySurface? = null
    private var caption: CaptionLayer? = null
    private var bubble: AssistantBubble? = null
    private var wm: WindowManager? = null
    private val demoDirector = DemoDirector(this) { snapshot() }
    private var wsSession: WsSession? = null

    private val dumpRunnable = object : Runnable {
        override fun run() {
            snapshot()
            handler.postDelayed(this, 2500)
        }
    }

    // ---- M4 : extraction du ScreenContext ---------------------------------

    fun snapshot(): ScreenContext? {
        val root = rootInActiveWindow ?: return Engine.context
        val pkg = root.packageName?.toString() ?: "?"
        // NB : notre propre écran démo EST une cible légitime (mode offline).
        // Les overlays du moteur ne font pas partie de rootInActiveWindow.

        val nodes = ArrayList<ScreenNode>(24)
        walk(root, "root", 0, nodes, pkg)
        root.recycle()

        val ctx = ScreenContext(appPackage = pkg, screenHint = guessScreenHint(nodes), nodes = nodes)
        Engine.updateContext(ctx)
        wsSession?.sendContext(ctx)
        return ctx
    }

    private fun guessScreenHint(nodes: List<ScreenNode>): String = when {
        nodes.any { it.text.contains("solde", true) } -> "home"
        nodes.any { it.text.contains("frais", true) } -> "fees"
        nodes.any { it.text.contains("transfert", true) || it.text.contains("envoyer", true) } -> "transfer"
        else -> "unknown"
    }

    private fun walk(node: AccessibilityNodeInfo, path: String, depth: Int, out: ArrayList<ScreenNode>, pkg: String) {
        if (depth > 30 || out.size >= 40) return

        val sensitive = node.isPassword || node.className?.toString()?.contains("EditText") == true
        val text = node.text?.toString()?.trim().orEmpty()
        val desc = node.contentDescription?.toString()?.trim().orEmpty()
        val label = if (text.isNotEmpty()) text else desc

        if (label.isNotEmpty() && !sensitive) {
            val r = Rect()
            node.getBoundsInScreen(r)
            if (r.width() > 20 && r.height() > 12 && !r.isEmpty) {
                out.add(
                    ScreenNode(
                        nodeId = "n_%02d".format(out.size + 1),
                        path = path,
                        cls = node.className?.toString()?.substringAfterLast('.') ?: "?",
                        text = label.take(90),
                        bounds = listOf(r.left, r.top, r.right, r.bottom),
                        clickable = node.isClickable,
                        sensitive = false,
                    )
                )
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val seg = node.className?.toString()?.substringAfterLast('.') ?: "n"
            walk(child, "$path/$seg[$i]", depth + 1, out, pkg)
            child.recycle()
        }
    }

    // ---- M1 : couches overlay ----------------------------------------------

    private fun addOverlayLayer(flags: Int, view: android.view.View) {
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            flags,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START }
        wm?.addView(view, lp)
    }

    private fun ensureOverlays() {
        if (surface != null) return
        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        val marks = OverlaySurface(this)
        addOverlayLayer(
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            marks
        )
        surface = marks
        Engine.renderer = marks
        Engine.initTts(this)

        val cap = CaptionLayer(this)
        addOverlayLayer(
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            cap
        )
        caption = cap
        surface?.captionLayer = cap

        val bubble = AssistantBubble(this) { onBubblePress() }
        // La bulle est la SEULE couche tactile : petite, en bas à droite,
        // au-dessus de la barre de navigation — le reste de l'écran reste manipulable.
        val blp = WindowManager.LayoutParams(
            140, 140,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.BOTTOM or Gravity.END; x = 36; y = 180 }
        wm?.addView(bubble, blp)
        this.bubble = bubble
    }

    /** Comportement de la bulle : démo offline = tour suivant ; serveur = push-to-talk. */
    private fun onBubblePress() {
        when (Engine.mode) {
            Engine.Mode.OFFLINE_DEMO -> demoDirector.next()
            Engine.Mode.SERVER -> wsSession?.toggleRecording()
        }
    }

    // ---- cycle de vie --------------------------------------------------------

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo?.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        ensureOverlays()
        handler.postDelayed(dumpRunnable, 600)
        if (Engine.mode == Engine.Mode.SERVER) wsSession = WsSession(this).also { it.connect() }
        android.util.Log.i("nkapengine", "service connecté (mode=${Engine.mode})")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            handler.postDelayed({ snapshot() }, 150)
        }
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        handler.removeCallbacks(dumpRunnable)
        surface?.let { runCatching { wm?.removeView(it) } }
        caption?.let { runCatching { wm?.removeView(it) } }
        bubble?.let { runCatching { wm?.removeView(it) } }
        surface = null; caption = null; bubble = null
        Engine.renderer = null
        Engine.shutdownTts()
        wsSession?.close()
        wsSession = null
        return super.onUnbind(intent)
    }
}
