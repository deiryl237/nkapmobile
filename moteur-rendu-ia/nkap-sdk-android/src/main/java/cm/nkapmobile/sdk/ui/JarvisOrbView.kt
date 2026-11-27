package cm.nkapmobile.sdk.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Constellation neuronale holographique « Solar Jarvis » (60 fps pur Android Canvas) :
 * - Sans contour circulaire dur, fond 100 % transparent
 * - 16 neurones en orbite 3D + filaments synaptiques ambre/or + halo solaire diffus
 * - Pulse dynamiquement selon l'état (IDLE, THINKING, SPEAKING, LISTENING)
 * - Micro-pastille "nkap" masquée au repos (affichée uniquement au clic / ouverture)
 * - Glisser-déposer manuel fluide (sans jamais se déplacer seule)
 */
class JarvisOrbView(
    ctx: Context,
    private val onTap: () -> Unit,
    private val onDragDelta: (dx: Float, dy: Float) -> Unit = { _, _ -> },
    private val onDragEnd: () -> Unit = {},
) : View(ctx) {

    enum class OrbState { IDLE, THINKING, SPEAKING, LISTENING }

    @Volatile var state: OrbState = OrbState.IDLE
        set(value) {
            field = value
            postInvalidateOnAnimation()
        }

    @Volatile var showLabel: Boolean = false
        set(value) {
            field = value
            postInvalidateOnAnimation()
        }

    private data class Neuron(val phi: Float, val theta: Float, val r: Float, val speed: Float, val phase: Float)
    private data class ProjPt(val x: Float, val y: Float, val z: Float, val s: Float, val phase: Float)

    private val neurons: List<Neuron> = List(16) { i ->
        val phi = acos(1.0 - (2.0 * (i + 0.5)) / 16.0).toFloat()
        val theta = (Math.PI * (1.0 + sqrt(5.0)) * i).toFloat()
        Neuron(phi, theta, 0.21f + (i % 3) * 0.068f, 0.48f + (i % 4) * 0.16f, i * 0.7f)
    }

    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val nodePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val wavePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#F5B700")
        style = Paint.Style.FILL
    }
    private val pillTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#140E07")
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }

    private val density = ctx.resources.displayMetrics.density
    private var labelAlpha = 0f

    // Glisser-déposer manuel
    private var downRawX = 0f
    private var downRawY = 0f
    private var lastRawX = 0f
    private var lastRawY = 0f
    private var dragging = false
    private val dragSlopPx = 8f * density

    init {
        tag = cm.nkapmobile.sdk.context.ViewTreeScanner.OVERLAY_TAG
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val t = SystemClock.uptimeMillis() * 0.001f
        val baseSize = minOf(w, h - 14f * density)
        val cx = w / 2f
        val cy = baseSize / 2f

        val isSpeak = state == OrbState.SPEAKING
        val isListen = state == OrbState.LISTENING
        val isThink = state == OrbState.THINKING

        val speedMul = when {
            isSpeak -> 2.6f
            isListen -> 2.1f
            isThink -> 3.3f
            else -> 0.9f
        }
        val pulse = when {
            isSpeak -> 1f + 0.16f * sin(t * 9.5f) + 0.07f * sin(t * 17f)
            isListen -> 1f + 0.13f * sin(t * 7.2f)
            isThink -> 1f + 0.10f * sin(t * 5.5f)
            else -> 1f + 0.05f * sin(t * 2.1f)
        }

        val cR = if (isListen) 255 else 245
        val cG = if (isListen) 92 else 183
        val cB = if (isListen) 119 else 0

        val wR = if (isListen) 255 else 234
        val wG = if (isListen) 130 else 118
        val wB = if (isListen) 80 else 28

        // Lueur solaire diffuse (sans bord dur)
        val glowRadius = (baseSize * 0.44f * pulse).coerceAtLeast(8f)
        glowPaint.shader = RadialGradient(
            cx, cy, glowRadius,
            intArrayOf(
                Color.argb(if (isSpeak) 220 else 160, 255, 244, 196),
                Color.argb(if (isSpeak) 120 else 74, cR, cG, cB),
                Color.argb(if (isSpeak) 42 else 22, wR, wG, wB),
                Color.TRANSPARENT,
            ),
            floatArrayOf(0f, 0.34f, 0.68f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(cx, cy, glowRadius, glowPaint)

        // Onde organique diffuse pendant la parole / écoute / réflexion
        if (isSpeak || isListen || isThink) {
            val waveP = (t * if (isSpeak) 1.2f else if (isListen) 1.4f else 0.85f) % 1f
            val waveR = baseSize * (0.16f + waveP * 0.32f)
            val alpha = ((1f - waveP) * 125f).toInt().coerceIn(0, 255)
            wavePaint.color = Color.argb(alpha, cR, cG, cB)
            wavePaint.strokeWidth = (1.8f * density) * (1f - waveP * 0.6f)
            canvas.drawCircle(cx, cy, waveR, wavePaint)
        }

        // Projection 3D des 16 neurones
        val pts = neurons.map { n ->
            val a = n.theta + t * n.speed * speedMul
            val b = n.phi + sin(t * 0.7f + n.phase) * 0.24f
            val rad = baseSize * n.r * pulse
            val x3 = rad * sin(b) * cos(a)
            val y3 = rad * cos(b)
            val z3 = rad * sin(b) * sin(a)
            val s = (z3 + baseSize * 0.6f) / (baseSize * 0.84f)
            ProjPt(cx + x3, cy + y3, z3, s.coerceIn(0.4f, 1.4f), n.phase)
        }

        // Filaments synaptiques
        val maxD = baseSize * (if (isSpeak) 0.39f else 0.34f)
        linePaint.strokeWidth = (if (isSpeak) 1.35f else 1.05f) * density
        for (i in pts.indices) {
            for (j in i + 1 until pts.size) {
                val d = hypot((pts[i].x - pts[j].x).toDouble(), (pts[i].y - pts[j].y).toDouble()).toFloat()
                if (d < maxD) {
                    val alpha = ((1f - d / maxD) * (if (isSpeak) 225f else if (isThink) 190f else 155f)).toInt().coerceIn(0, 255)
                    linePaint.color = if (i % 2 == 0) Color.argb(alpha, cR, cG, cB) else Color.argb(alpha, wR, wG, wB)
                    canvas.drawLine(pts[i].x, pts[i].y, pts[j].x, pts[j].y, linePaint)
                }
            }
        }

        // Neurones lumineux (triés en profondeur)
        val sorted = pts.sortedBy { it.z }
        for (p in sorted) {
            val glow = 0.55f + 0.45f * sin(t * (if (isSpeak) 8.5f else 3.2f) + p.phase)
            val rNode = (1.6f + p.s * 1.4f) * density * (if (isSpeak) 1.12f else 1f)
            nodePaint.color = Color.argb(((0.38f + glow * 0.35f) * 255).toInt().coerceIn(0, 255), cR, cG, cB)
            canvas.drawCircle(p.x, p.y, rNode * 1.65f, nodePaint)
            nodePaint.color = Color.argb(((0.72f + glow * 0.28f) * 255).toInt().coerceIn(0, 255), 255, 248, 220)
            canvas.drawCircle(p.x, p.y, rNode * 0.85f, nodePaint)
        }

        // Micro-pastille "nkap" : invisible au repos, fade-in doux uniquement au clic / écoute
        val targetAlpha = if (showLabel || isListen) 1f else 0f
        labelAlpha += (targetAlpha - labelAlpha) * 0.22f
        if (labelAlpha > 0.02f) {
            val pw = 42f * density
            val ph = 16f * density
            val pillTop = h - ph - 1f * density
            val rect = RectF(cx - pw / 2f, pillTop, cx + pw / 2f, pillTop + ph)
            pillPaint.alpha = (labelAlpha * 255).toInt().coerceIn(0, 255)
            canvas.drawRoundRect(rect, ph / 2f, ph / 2f, pillPaint)
            pillTextPaint.textSize = 10f * density
            pillTextPaint.alpha = (labelAlpha * 255).toInt().coerceIn(0, 255)
            canvas.drawText("nkap", cx, pillTop + ph * 0.74f, pillTextPaint)
        }

        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downRawX = ev.rawX
                downRawY = ev.rawY
                lastRawX = ev.rawX
                lastRawY = ev.rawY
                dragging = false
                scaleX = 0.94f
                scaleY = 0.94f
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val totalD = hypot((ev.rawX - downRawX).toDouble(), (ev.rawY - downRawY).toDouble()).toFloat()
                if (!dragging && totalD > dragSlopPx) {
                    dragging = true
                    scaleX = 1.04f
                    scaleY = 1.04f
                }
                if (dragging) {
                    val dx = ev.rawX - lastRawX
                    val dy = ev.rawY - lastRawY
                    lastRawX = ev.rawX
                    lastRawY = ev.rawY
                    onDragDelta(dx, dy)
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                scaleX = 1f
                scaleY = 1f
                if (dragging) {
                    dragging = false
                    onDragEnd()
                } else if (ev.actionMasked == MotionEvent.ACTION_UP) {
                    performClick()
                }
                return true
            }
        }
        return super.onTouchEvent(ev)
    }

    override fun performClick(): Boolean {
        super.performClick()
        onTap()
        return true
    }
}
