package cm.nkapmobile.engine.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.media.MediaPlayer
import android.view.View
import cm.nkapmobile.engine.Engine
import cm.nkapmobile.engine.core.*

/**
 * I4 — la surface de dessin « le tableau » : traits manuscrits progressifs
 * à double contour (lisibles sur fonds clairs ET sombres), écriture lettre
 * par lettre sur papier, cadre rouge net, flèches. Aucun crash sur nœud disparu :
 * la géométrie est résolue et figée au moment de l'exécution.
 */
class OverlaySurface(ctx: Context) : View(ctx) {

    val widthPx: Int get() = measuredWidth.takeIf { it > 0 } ?: context.resources.displayMetrics.widthPixels
    val heightPx: Int get() = measuredHeight.takeIf { it > 0 } ?: context.resources.displayMetrics.heightPixels

    var captionLayer: CaptionLayer? = null
    private var player: MediaPlayer? = null

    private val inks = mapOf(
        Ink.INK to Color.parseColor("#12233A"),
        Ink.YELLOW to Color.parseColor("#F5B700"),
        Ink.RED to Color.parseColor("#E23B3B"),
    )
    private val outline = mapOf(
        Ink.INK to Color.argb(160, 255, 255, 255),
        Ink.YELLOW to Color.argb(150, 18, 35, 58),
        Ink.RED to Color.argb(160, 255, 255, 255),
    )

    private val fontHand: Typeface by lazy {
        runCatching { Typeface.createFromAsset(context.assets, "fonts/Andika-Bold.ttf") }
            .getOrDefault(Typeface.DEFAULT_BOLD)
    }
    private val fontText: Typeface by lazy {
        runCatching { Typeface.createFromAsset(context.assets, "fonts/Andika-Regular.ttf") }
            .getOrDefault(Typeface.DEFAULT)
    }

    // ---- marques vivantes ---------------------------------------------------

    private sealed class Mark {
        abstract val id: String
        abstract val startedAt: Long
        abstract val drawMs: Long

        class Stroke(
            override val id: String,
            val main: HandPath,
            val head: HandPath?,
            val color: Int,
            val outlineColor: Int,
            val width: Float,
            override val startedAt: Long,
            override val drawMs: Long,
        ) : Mark()

        class WriteMark(
            override val id: String,
            val text: String,
            val cx: Float,
            val cy: Float,
            val size: Float,
            val color: Int,
            val backing: Boolean,
            val perLetterMs: Int,
            override val startedAt: Long,
            override val drawMs: Long,
        ) : Mark()

        class FrameMark(
            override val id: String,
            val x: Float, val y: Float, val w: Float, val h: Float,
            val label: String?,
            override val startedAt: Long,
            override val drawMs: Long = 120,
        ) : Mark()
    }

    private val marks = LinkedHashMap<String, Mark>()
    private var captionText: String? = null
    private var captionSub: String? = null
    private var captionAt: Long = 0

    fun onContextChanged() { /* réservation : invalidation des résolutions */ }

    private fun now(): Long = System.currentTimeMillis()

    private fun strokePaint(color: Int, width: Float, outline: Boolean = false): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeWidth = if (outline) width + 4f else width
            this.color = if (outline) withAlpha(color, 0.45f) else color
        }

    private fun withAlpha(color: Int, alpha: Float): Int =
        (alpha * 255).toInt() shl 24 or (color and 0xFFFFFF)

    // ---- API (appelée par Engine) --------------------------------------------

    fun showCircle(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = node.bounds
        val cx = (r[0] + r[2]) / 2f
        val cy = (r[1] + r[3]) / 2f
        val rx = (r[2] - r[0]) / 2f + 18f
        val ry = (r[3] - r[1]) / 2f + 16f
        addStroke(id, handCircle(cx, cy, rx, ry, id), null, inks[color]!!, outline[color]!!, 5f, drawMs)
    }

    fun showUnderline(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = node.bounds
        val safeBottom = heightPx - Engine.safeBottomPx
        var uy = r[3] + 8f
        if (uy > safeBottom - 6) uy = r[3] - 14f          // repli : à l'intérieur de l'élément
        addStroke(id, handUnderline(r[0] - 9f, uy, (r[2] - r[0]) + 18f, id), null,
            inks[color]!!, outline[color]!!, 5f, drawMs)
    }

    fun showArrow(from: Pair<Float, Float>?, to: Pair<Float, Float>?, color: Ink, drawMs: Int, bow: Float, id: String) {
        if (from == null || to == null) return
        val arrow = handArrow(from.first, from.second, to.first, to.second, id, bow)
        addStroke(id, arrow.main, arrow.head, inks[color]!!, outline[color]!!, 3.5f, drawMs)
    }

    fun showWrite(text: String, center: Pair<Float, Float>?, size: Float, color: Ink, backing: Boolean, perLetterMs: Int, id: String) {
        center ?: return
        synchronized(marks) {
            marks[id] = Mark.WriteMark(
                id, text, center.first, center.second, size,
                inks[color]!!, backing, perLetterMs, now(), (text.length * perLetterMs).toLong()
            )
            scheduleLoop()
        }
    }

    fun showFrame(node: ScreenNode?, label: String?, color: Ink, pad: Int, id: String) {
        node ?: return
        val r = node.bounds
        synchronized(marks) {
            marks[id] = Mark.FrameMark(
                id, r[0] - pad.toFloat(), r[1] - pad.toFloat(),
                (r[2] - r[0]) + pad * 2f, (r[3] - r[1]) + pad * 2f,
                label, now()
            )
            scheduleLoop()
        }
    }

    fun hideMark(id: String) {
        synchronized(marks) {
            marks.remove(id)
        }
        postInvalidateOnAnimation()
    }

    fun clearAll() {
        synchronized(marks) { marks.clear() }
        captionText = null
        captionSub = null
        captionLayer?.setCaption(null, null)
        postInvalidateOnAnimation()
    }

    fun showCaption(text: String, subFr: String? = null) {
        captionText = text
        captionSub = subFr
        captionAt = now()
        captionLayer?.setCaption(text, subFr)
    }

    fun playAudio(url: String) {
        runCatching {
            player?.release()
            player = MediaPlayer().apply {
                setDataSource(url)
                setOnPreparedListener { it.start() }
                setOnCompletionListener { it.release() }
                prepareAsync()
            }
        }
    }

    private fun addStroke(
        id: String, main: HandPath, head: HandPath?,
        color: Int, outlineColor: Int, width: Float, drawMs: Int
    ) {
        synchronized(marks) {
            marks[id] = Mark.Stroke(id, main, head, color, outlineColor, width, now(), drawMs.toLong())
            scheduleLoop()
        }
    }

    private var looping = false
    private fun scheduleLoop() {
        if (looping) return
        looping = true
        postInvalidateOnAnimation()
    }

    // ---- rendu ---------------------------------------------------------------

    override fun onDraw(canvas: Canvas) {
        val t = now()
        synchronized(marks) {
            val it = marks.entries.iterator()
            var anyAnimating = false
            while (it.hasNext()) {
                val entry = it.next()
                val mark = entry.value
                val elapsed = t - mark.startedAt
                val progress = (elapsed.toFloat() / mark.drawMs).coerceIn(0f, 1f)

                when (mark) {
                    is Mark.Stroke -> {
                        val p = trimmed(mark.main.path, progress)
                        if (!p.isEmpty) {
                            canvas.drawPath(p, strokePaint(mark.outlineColor, mark.width, outline = true))
                            canvas.drawPath(p, strokePaint(mark.color, mark.width))
                        }
                        if (mark.head != null && progress >= 1f) {
                            val h = trimmed(mark.head.path, ((elapsed - mark.drawMs) / 180f).coerceIn(0f, 1f))
                            if (!h.isEmpty) {
                                canvas.drawPath(h, strokePaint(mark.outlineColor, mark.width, outline = true))
                                canvas.drawPath(h, strokePaint(mark.color, mark.width))
                            }
                        }
                        if (elapsed < mark.drawMs + (if (mark.head != null) 180 else 0)) anyAnimating = true
                    }
                    is Mark.WriteMark -> {
                        val revealed = (elapsed / mark.perLetterMs).toInt().coerceAtMost(mark.text.length)
                        drawWrite(canvas, mark, revealed)
                        if (revealed < mark.text.length) anyAnimating = true
                    }
                    is Mark.FrameMark -> {
                        drawFrame(canvas, mark)
                        anyAnimating = anyAnimating || elapsed < 200
                    }
                }
            }
            if (marks.isNotEmpty() && anyAnimating) postInvalidateOnAnimation() else looping = false
        }
    }

    private fun drawWrite(canvas: Canvas, m: Mark.WriteMark, revealed: Int) {
        val rand = Seeded(m.id + m.text)
        val fm = android.graphics.Paint.FontMetrics()
        val probe = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontHand; textSize = m.size
            getFontMetrics(fm)
        }
        val fullW = probe.measureText(m.text)
        var x = m.cx - fullW / 2f
        val base = m.cy + (fm.descent - fm.ascent) / 2f + fm.descent

        if (m.backing) {
            val pad = 12f
            canvas.drawRoundRect(
                x - pad, m.cy - (fm.descent - fm.ascent) / 2f - pad,
                x + fullW + pad, m.cy + (fm.descent - fm.ascent) / 2f + pad,
                14f, 14f,
                Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(238, 255, 255, 255) }
            )
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontHand; textSize = m.size; color = m.color
        }
        for ((i, ch) in m.text.withIndex().take(revealed)) {
            val rot = (rand.next() - 0.5f) * 7f
            canvas.withRotate(rot, x + probe.measureText(ch.toString()) / 2f, base) {
                drawText(ch.toString(), x, base + (rand.next() - 0.5f) * 3f, paint)
            }
            x += probe.measureText(ch.toString())
        }
    }

    private fun drawFrame(canvas: Canvas, m: Mark.FrameMark) {
        val red = Color.parseColor("#E23B3B")
        val alpha = ((now() - m.startedAt).coerceAtMost(120) / 120f).coerceIn(0f, 1f)
        val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f
            color = withAlpha(red, 0.55f * alpha)
        }
        val corner = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 4f
            color = withAlpha(red, alpha)
        }
        canvas.drawRoundRect(m.x, m.y, m.x + m.w, m.y + m.h, 10f, 10f, border)
        val L = 16f
        // 4 coins en L
        canvas.drawLine(m.x, m.y, m.x + L, m.y, corner)
        canvas.drawLine(m.x, m.y, m.x, m.y + L, corner)
        canvas.drawLine(m.x + m.w - L, m.y, m.x + m.w, m.y, corner)
        canvas.drawLine(m.x + m.w, m.y, m.x + m.w, m.y + L, corner)
        canvas.drawLine(m.x, m.y + m.h, m.x + L, m.y + m.h, corner)
        canvas.drawLine(m.x, m.y + m.h - L, m.x, m.y + m.h, corner)
        canvas.drawLine(m.x + m.w - L, m.y + m.h, m.x + m.w, m.y + m.h, corner)
        canvas.drawLine(m.x + m.w, m.y + m.h - L, m.x + m.w, m.y + m.h, corner)

        if (m.label != null) {
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                typeface = fontHand; textSize = 34f; color = red; textAlign = Paint.Align.CENTER
            }
            val w = p.measureText(m.label) + 44f
            val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb(240, 255, 255, 255)
            }
            val chipTop = m.y - 78f
            canvas.drawRoundRect(m.x + m.w / 2f - w / 2f, chipTop, m.x + m.w / 2f + w / 2f, chipTop + 62f, 14f, 14f, bg)
            canvas.drawRoundRect(m.x + m.w / 2f - w / 2f, chipTop, m.x + m.w / 2f + w / 2f, chipTop + 62f, 14f, 14f, border)
            canvas.drawText(m.label, m.x + m.w / 2f, chipTop + 42f, p)
        }
    }
}

private inline fun Canvas.withRotate(deg: Float, px: Float, py: Float, block: Canvas.() -> Unit) {
    val s = save()
    rotate(deg, px, py)
    try { block() } finally { restoreToCount(s) }
}
