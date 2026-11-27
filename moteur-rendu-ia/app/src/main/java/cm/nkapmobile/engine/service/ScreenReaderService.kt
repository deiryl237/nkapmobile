package cm.nkapmobile.engine.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import cm.nkapmobile.sdk.NkapConfig
import cm.nkapmobile.sdk.NkapSDK
import cm.nkapmobile.sdk.NkapSession
import cm.nkapmobile.sdk.context.ViewTreeScanner
import cm.nkapmobile.sdk.core.ScreenContext
import cm.nkapmobile.sdk.core.ScreenNode
import kotlin.math.abs

/**
 * Mode Universel (AccessibilityService) propulsé par le même module `:nkap-sdk-android` :
 * fonctionne par-dessus N'IMPORTE QUELLE application Android (Max it, Wave, Orange Money, MTN MoMo, Chrome)
 * sans modifier le code de l'app cible, avec filtre strict anti-PIN/EditText (règle d'or #3).
 */
class ScreenReaderService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var wm: WindowManager? = null
    private var session: NkapSession? = null
    private var orbLp: WindowManager.LayoutParams? = null
    private var drawerLp: WindowManager.LayoutParams? = null
    private var lastContext: ScreenContext? = null
    private var snapshotCheckRunnable: Runnable? = null

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun findTargetAppRoot(): AccessibilityNodeInfo? {
        // Priorise la vraie fenêtre application active (évite nos propres overlays ou la barre système)
        val appWin = runCatching {
            windows?.firstOrNull { w ->
                w.type == AccessibilityWindowInfo.TYPE_APPLICATION && w.root != null &&
                    w.root?.packageName?.toString() != "com.android.systemui"
            } ?: windows?.firstOrNull { w -> w.type == AccessibilityWindowInfo.TYPE_APPLICATION && w.root != null }
        }.getOrNull()
        return appWin?.root ?: rootInActiveWindow
    }

    fun snapshot(): ScreenContext {
        val root = findTargetAppRoot()
        if (root == null) {
            return lastContext ?: ScreenContext(packageName, "Écran", "home", "mobile", emptyList())
        }
        val pkg = root.packageName?.toString() ?: "?"
        val rawNodes = ArrayList<ScreenNode>(64)
        walk(root, "root", 0, rawNodes)
        val merged = mergeAdjacentAmounts(rawNodes)
        android.util.Log.i("NkapSDK", "Accessibility snapshot pkg=$pkg nodes=${merged.size}")

        val ctx = ScreenContext(
            appPackage = pkg,
            title = pkg.substringAfterLast('.'),
            screenHint = ViewTreeScanner.guessScreenHint(merged),
            channel = "mobile",
            nodes = merged,
        )
        lastContext = ctx
        return ctx
    }

    /**
     * Fusionne les paires horizontales Nombre + Devise séparés en deux TextView
     * (ex. Orange Max it : "24 828,58" + "FCFA" -> "24 828,58 FCFA" avec bornes combinées).
     */
    private fun mergeAdjacentAmounts(nodes: List<ScreenNode>): List<ScreenNode> {
        val numRe = Regex("""^[+\-]?\d[\d\s.,\u00A0\u202F]*$""")
        val unitRe = Regex("""^(?:FCFA|XAF|CFA|F\s*CFA|F|U|€|\$)$""", RegexOption.IGNORE_CASE)
        val consumed = BooleanArray(nodes.size)
        val out = ArrayList<ScreenNode>(nodes.size)
        val maxGapX = dp(48)
        val maxDy = dp(32)

        for (i in nodes.indices) {
            if (consumed[i]) continue
            val a = nodes[i]
            val aTxt = a.text.trim()
            if (numRe.matches(aTxt)) {
                // Cherche une unité monétaire juste à droite sur la même ligne visuelle
                var matchIdx = -1
                for (j in nodes.indices) {
                    if (j == i || consumed[j]) continue
                    val b = nodes[j]
                    if (!unitRe.matches(b.text.trim())) continue
                    val gapX = b.bounds[0] - a.bounds[2]
                    val dy = abs(a.centerY() - b.centerY())
                    if (gapX in -dp(12)..maxGapX && dy <= maxDy) {
                        matchIdx = j
                        break
                    }
                }
                if (matchIdx != -1) {
                    val b = nodes[matchIdx]
                    consumed[matchIdx] = true
                    val unionBounds = intArrayOf(
                        minOf(a.bounds[0], b.bounds[0]),
                        minOf(a.bounds[1], b.bounds[1]),
                        maxOf(a.bounds[2], b.bounds[2]),
                        maxOf(a.bounds[3], b.bounds[3]),
                    )
                    out.add(a.copy(nodeId = "n_%02d".format(out.size + 1), text = "$aTxt ${b.text.trim()}", bounds = unionBounds))
                    continue
                }
            }
            out.add(a.copy(nodeId = "n_%02d".format(out.size + 1)))
        }
        return out
    }

    private fun walk(node: AccessibilityNodeInfo, path: String, depth: Int, out: ArrayList<ScreenNode>) {
        if (depth > 34 || out.size >= 120) return
        val sensitive = node.isPassword || node.className?.toString()?.contains("EditText") == true
        val text = node.text?.toString()?.trim().orEmpty()
        val desc = node.contentDescription?.toString()?.trim().orEmpty()
        var label = if (text.isNotEmpty()) text else desc
        val r = Rect()
        node.getBoundsInScreen(r)

        // Détecte aussi la flèche Retour ← en haut à gauche quand l'app (ex. Wave) n'a pas mis de contentDescription
        if (label.isEmpty() && !sensitive && node.isClickable && !r.isEmpty) {
            val isTopLeftBack = r.left <= dp(40) &&
                r.top in dp(16)..dp(96) &&
                r.width() in dp(24)..dp(88) &&
                r.height() in dp(24)..dp(88)
            if (isTopLeftBack) {
                label = "Back"
            }
        }

        if (label.isNotEmpty() && !sensitive) {
            if (r.width() > 10 && r.height() > 10 && !r.isEmpty) {
                out.add(
                    ScreenNode(
                        nodeId = "n_%02d".format(out.size + 1),
                        tag = if (node.isClickable) "button" else "span",
                        text = label.replace(Regex("\\s+"), " ").take(140),
                        bounds = intArrayOf(r.left, r.top, r.right, r.bottom),
                        clickable = node.isClickable,
                        tone = "unknown",
                        path = path,
                    )
                )
            }
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val seg = node.className?.toString()?.substringAfterLast('.') ?: "n"
            walk(child, "$path/$seg[$i]", depth + 1, out)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo?.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        val brainUrl = getSharedPreferences("nkap_sdk", Context.MODE_PRIVATE)
            .getString("brain_url", NkapSDK.DEFAULT_BRAIN_URL) ?: NkapSDK.DEFAULT_BRAIN_URL

        val s = NkapSession(
            context = this,
            config = NkapConfig(brainUrl = brainUrl),
            contextProvider = { snapshot() },
        )
        session = s

        // 1. Couche dessin plein écran bord-à-bord (alignement exact 0 px même avec encoche caméra)
        val overlayLp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        wm?.addView(s.overlayView, overlayLp)

        // 2. Orbe neuronal Jarvis (tactile + glisser-déposer manuel)
        val dm = resources.displayMetrics
        val orbSz = dp(74)
        val oLp = WindowManager.LayoutParams(
            orbSz,
            orbSz + dp(10),
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (dm.widthPixels - orbSz - dp(12)).coerceAtLeast(dp(8))
            y = dp(90)
        }
        orbLp = oLp
        wm?.addView(s.orbView, oLp)

        // 3. Tiroir de chat Jarvis (ajouté masqué, devient focusable à l'ouverture pour le clavier)
        val drawerW = (dm.widthPixels - dp(24)).coerceAtMost(dp(344))
        val dLp = WindowManager.LayoutParams(
            drawerW,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (dm.widthPixels - drawerW) / 2
            y = oLp.y + orbSz + dp(8)
        }
        drawerLp = dLp
        s.drawerView.visibility = View.GONE
        wm?.addView(s.drawerView, dLp)

        s.onOrbDraggedExternal = { dx, dy ->
            val maxX = (dm.widthPixels - orbSz - dp(6)).coerceAtLeast(dp(6))
            val maxY = (dm.heightPixels - orbSz - dp(24)).coerceAtLeast(dp(40))
            oLp.x = (oLp.x + dx.toInt()).coerceIn(dp(6), maxX)
            oLp.y = (oLp.y + dy.toInt()).coerceIn(dp(40), maxY)
            runCatching { wm?.updateViewLayout(s.orbView, oLp) }
        }
        s.onDrawerToggledExternal = { visible ->
            dLp.flags = if (visible) {
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            } else {
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            }
            dLp.x = (oLp.x + orbSz - drawerW).coerceIn(dp(10), (dm.widthPixels - drawerW - dp(10)).coerceAtLeast(dp(10)))
            dLp.y = if (oLp.y + orbSz + dp(280) > dm.heightPixels) {
                (oLp.y - dp(310)).coerceAtLeast(dp(40))
            } else {
                oLp.y + orbSz + dp(8)
            }
            runCatching { wm?.updateViewLayout(s.drawerView, dLp) }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val type = event?.eventType ?: return
        val shouldCheck = type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && session?.shouldWatchScreenChanges() == true)
        if (!shouldCheck) return
        snapshotCheckRunnable?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            val ctx = snapshot()
            session?.onScreenSnapshotUpdated(ctx)
        }
        snapshotCheckRunnable = r
        handler.postDelayed(r, 240)
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        session?.let { s ->
            runCatching { wm?.removeView(s.overlayView) }
            runCatching { wm?.removeView(s.orbView) }
            runCatching { wm?.removeView(s.drawerView) }
            s.destroy()
        }
        session = null
        return super.onUnbind(intent)
    }
}
