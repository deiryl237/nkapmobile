package cm.nkapmobile.sdk.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock
import android.view.View
import cm.nkapmobile.sdk.core.*

/**
 * Surface de dessin natif NkapSDK v1.2 (« le tableau » + ardoise Jarvis) :
 * - Gestes v1.1 : circle, underline, arrow, write, frame, caption
 * - Gestes v1.2 : box, callout, num (①②③), highlight, strike, check (✓), cross (✗),
 *   et ardoise `notebook` (lines, flow, bars, table, choices)
 * - Convertit automatiquement les coordonnées écran (getLocationOnScreen) en coordonnées surface.
 */
class NkapOverlayView(ctx: Context) : View(ctx) {

    private val density = ctx.resources.displayMetrics.density
    private val surfaceOffset = IntArray(2)

    private val inks = mapOf(
        Ink.INK to Color.parseColor("#12233A"),
        Ink.YELLOW to Color.parseColor("#F5B700"),
        Ink.RED to Color.parseColor("#FF3B5C"),
        Ink.GREEN to Color.parseColor("#10B981"),
        Ink.CYAN to Color.parseColor("#38BDF8"),
    )
    private val outlines = mapOf(
        Ink.INK to Color.argb(185, 255, 255, 255),
        Ink.YELLOW to Color.argb(175, 18, 35, 58),
        Ink.RED to Color.argb(180, 255, 255, 255),
        Ink.GREEN to Color.argb(175, 10, 25, 20),
        Ink.CYAN to Color.argb(175, 10, 20, 35),
    )

    private val fontBold: Typeface by lazy {
        runCatching { Typeface.createFromAsset(context.assets, "fonts/Andika-Bold.ttf") }
            .getOrDefault(Typeface.DEFAULT_BOLD)
    }
    private val fontReg: Typeface by lazy {
        runCatching { Typeface.createFromAsset(context.assets, "fonts/Andika-Regular.ttf") }
            .getOrDefault(Typeface.DEFAULT)
    }

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

        class HighlightMark(
            override val id: String,
            val rect: RectF,
            val color: Int,
            override val startedAt: Long,
            override val drawMs: Long,
        ) : Mark()

        class FrameMark(
            override val id: String,
            val rect: RectF,
            val label: String?,
            val color: Int,
            override val startedAt: Long,
            override val drawMs: Long = 180,
        ) : Mark()

        class CalloutMark(
            override val id: String,
            val anchorX: Float,
            val anchorY: Float,
            val label: String,
            val color: Int,
            override val startedAt: Long,
            override val drawMs: Long = 220,
        ) : Mark()

        class NumMark(
            override val id: String,
            val cx: Float,
            val cy: Float,
            val step: Int,
            val label: String,
            val color: Int,
            override val startedAt: Long,
            override val drawMs: Long = 200,
        ) : Mark()

        class WriteMark(
            override val id: String,
            val text: String,
            val cx: Float,
            val cy: Float,
            val sizeSp: Float,
            val color: Int,
            val backing: Boolean,
            val perLetterMs: Int,
            override val startedAt: Long,
            override val drawMs: Long,
        ) : Mark()

        class NotebookMark(
            override val id: String,
            val nb: NkapAction.Notebook,
            val anchorY: Float?,
            override val startedAt: Long,
            override val drawMs: Long = 3200,
            var borderPath: HandPath? = null,
            var cachedW: Float = 0f,
            var cachedH: Float = 0f,
            var cachedTop: Float = 0f,
        ) : Mark()
    }

    private val marks = LinkedHashMap<String, Mark>()
    private var captionChunks: List<String> = emptyList()
    private var captionChunkStartsMs: LongArray = LongArray(0)
    private var captionSub: String? = null
    private var captionStartedAt: Long = 0L
    private var captionTotalMs: Long = 0L

    init {
        tag = cm.nkapmobile.sdk.context.ViewTreeScanner.OVERLAY_TAG
    }

    private fun now(): Long = SystemClock.uptimeMillis()

    private fun toLocalRect(node: ScreenNode): RectF {
        getLocationOnScreen(surfaceOffset)
        val ox = surfaceOffset[0].toFloat()
        val oy = surfaceOffset[1].toFloat()
        return RectF(
            node.bounds[0] - ox,
            node.bounds[1] - oy,
            node.bounds[2] - ox,
            node.bounds[3] - oy,
        )
    }

    private fun strokePaint(color: Int, widthPx: Float, isOutline: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = if (isOutline) widthPx + 3.2f * density else widthPx
        this.color = color
    }

    private fun putMark(m: Mark) {
        synchronized(marks) { marks[m.id] = m }
        postInvalidateOnAnimation()
    }

    fun showCircle(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val path = handCircle(r.centerX(), r.centerY(), r.width() / 2f + 10f * density, r.height() / 2f + 8f * density, id)
        putMark(Mark.Stroke(id, path, null, inks[color]!!, outlines[color]!!, 3.6f * density, now(), drawMs.toLong()))
    }

    fun showBox(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val pad = 6f * density
        val path = handBox(r.left - pad, r.top - pad, r.width() + pad * 2, r.height() + pad * 2, id)
        putMark(Mark.Stroke(id, path, null, inks[color]!!, outlines[color]!!, 3.2f * density, now(), drawMs.toLong()))
    }

    fun showUnderline(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val path = handUnderline(r.left - 4f * density, r.bottom + 4f * density, r.width() + 8f * density, id)
        putMark(Mark.Stroke(id, path, null, inks[color]!!, outlines[color]!!, 3.4f * density, now(), drawMs.toLong()))
    }

    fun showHighlight(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        r.inset(-4f * density, -2f * density)
        putMark(Mark.HighlightMark(id, r, inks[color]!!, now(), drawMs.toLong()))
    }

    fun showStrike(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val path = handStrike(r.left, r.centerY(), r.width(), id)
        putMark(Mark.Stroke(id, path, null, inks[color]!!, outlines[color]!!, 3.4f * density, now(), drawMs.toLong()))
    }

    fun showCheck(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val cx = (r.right + 16f * density).coerceAtMost(width - 20f * density)
        val path = handCheck(cx, r.centerY(), 22f * density)
        putMark(Mark.Stroke(id, path, null, inks[color]!!, outlines[color]!!, 3.8f * density, now(), drawMs.toLong()))
    }

    fun showCross(node: ScreenNode?, color: Ink, drawMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val cx = (r.right + 16f * density).coerceAtMost(width - 20f * density)
        val cross = handCross(cx, r.centerY(), 20f * density)
        putMark(Mark.Stroke(id, cross.main, cross.head, inks[color]!!, outlines[color]!!, 3.8f * density, now(), drawMs.toLong()))
    }

    fun showArrow(fromNode: ScreenNode?, toNode: ScreenNode?, color: Ink, drawMs: Int, bow: Float, id: String) {
        if (fromNode == null || toNode == null) return
        val a = toLocalRect(fromNode)
        val b = toLocalRect(toNode)
        val arrow = handArrow(a.centerX(), a.centerY(), b.centerX(), b.centerY(), id, bow)
        putMark(Mark.Stroke(id, arrow.main, arrow.head, inks[color]!!, outlines[color]!!, 3f * density, now(), drawMs.toLong()))
    }

    fun showFrame(node: ScreenNode?, label: String?, color: Ink, padDp: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val pad = padDp * density
        r.inset(-pad, -pad)
        putMark(Mark.FrameMark(id, r, label, inks[color]!!, now()))
    }

    fun showCallout(node: ScreenNode?, label: String, color: Ink, id: String) {
        node ?: return
        if (label.isBlank()) return
        val r = toLocalRect(node)
        putMark(Mark.CalloutMark(id, r.centerX(), r.top, label, inks[color]!!, now()))
    }

    fun showNum(node: ScreenNode?, step: Int, label: String, color: Ink, id: String) {
        node ?: return
        val r = toLocalRect(node)
        val cx = (r.left - 14f * density).coerceAtLeast(18f * density)
        putMark(Mark.NumMark(id, cx, r.centerY(), step, label, inks[color]!!, now()))
    }

    fun showWrite(text: String, node: ScreenNode?, sizeSp: Float, color: Ink, backing: Boolean, perLetterMs: Int, id: String) {
        node ?: return
        val r = toLocalRect(node)
        putMark(
            Mark.WriteMark(
                id, text, r.centerX(), (r.top - 22f * density).coerceAtLeast(36f * density),
                sizeSp, inks[color]!!, backing, perLetterMs, now(), (text.length * perLetterMs).toLong().coerceAtLeast(160L)
            )
        )
    }

    fun showNotebook(nb: NkapAction.Notebook, anchorNode: ScreenNode?) {
        val ay = anchorNode?.let { toLocalRect(it).bottom }
        putMark(Mark.NotebookMark(nb.id, nb, ay, now()))
    }

    private fun splitCaptionChunks(raw: String, maxChars: Int = 66): List<String> {
        val clean = raw.replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return emptyList()
        if (clean.length <= maxChars) return listOf(clean)

        val sentences = clean.split(Regex("(?<=[.!?;])\\s+")).filter { it.isNotBlank() }
        val out = ArrayList<String>()
        for (sent in sentences) {
            if (sent.length <= maxChars) {
                out.add(sent)
                continue
            }
            // Découpe les longues phrases sur virgule / deux-points puis sur espace
            val clauses = sent.split(Regex("(?<=[,:])\\s+")).filter { it.isNotBlank() }
            val cur = StringBuilder()
            for (cl in clauses) {
                val cand = if (cur.isEmpty()) cl else "$cur $cl"
                if (cand.length <= maxChars) {
                    cur.clear().append(cand)
                } else {
                    if (cur.isNotEmpty()) {
                        out.add(cur.toString())
                        cur.clear()
                    }
                    if (cl.length <= maxChars) {
                        cur.append(cl)
                    } else {
                        for (w in cl.split(" ")) {
                            val t = if (cur.isEmpty()) w else "$cur $w"
                            if (t.length > maxChars && cur.isNotEmpty()) {
                                out.add(cur.toString())
                                cur.clear().append(w)
                            } else {
                                cur.clear().append(t)
                            }
                        }
                    }
                }
            }
            if (cur.isNotEmpty()) out.add(cur.toString())
        }
        return out
    }

    fun showCaption(text: String?, subFr: String? = null) {
        val clean = text?.trim().orEmpty()
        if (clean.isEmpty()) {
            captionChunks = emptyList()
            captionChunkStartsMs = LongArray(0)
            captionSub = null
            captionTotalMs = 0L
            postInvalidateOnAnimation()
            return
        }
        val chunks = splitCaptionChunks(clean, maxChars = 66)
        val starts = LongArray(chunks.size)
        var acc = 0L
        for (i in chunks.indices) {
            starts[i] = acc
            val dur = (chunks[i].length * 56L).coerceIn(1700L, 4200L)
            acc += dur
        }
        captionChunks = chunks
        captionChunkStartsMs = starts
        captionTotalMs = acc
        captionSub = subFr?.takeIf { it.isNotBlank() }
        captionStartedAt = now()
        postInvalidateOnAnimation()
    }

    fun hideMark(id: String) {
        synchronized(marks) { marks.remove(id) }
        postInvalidateOnAnimation()
    }

    fun hasActiveMarks(): Boolean = synchronized(marks) { marks.isNotEmpty() || captionChunks.isNotEmpty() }

    fun clearAll() {
        synchronized(marks) { marks.clear() }
        captionChunks = emptyList()
        captionChunkStartsMs = LongArray(0)
        captionSub = null
        captionTotalMs = 0L
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        val t = now()
        var animating = false

        synchronized(marks) {
            for (m in marks.values) {
                val elapsed = t - m.startedAt
                val prog = (elapsed.toFloat() / m.drawMs.coerceAtLeast(1L)).coerceIn(0f, 1f)
                when (m) {
                    is Mark.Stroke -> {
                        val p = trimmed(m.main.path, prog)
                        if (!p.isEmpty) {
                            canvas.drawPath(p, strokePaint(m.outlineColor, m.width, isOutline = true))
                            canvas.drawPath(p, strokePaint(m.color, m.width))
                        }
                        if (m.head != null && prog >= 1f) {
                            val hp = trimmed(m.head.path, ((elapsed - m.drawMs) / 180f).coerceIn(0f, 1f))
                            if (!hp.isEmpty) {
                                canvas.drawPath(hp, strokePaint(m.outlineColor, m.width, isOutline = true))
                                canvas.drawPath(hp, strokePaint(m.color, m.width))
                            }
                        }
                        if (elapsed < m.drawMs + (if (m.head != null) 200L else 0L)) animating = true
                    }
                    is Mark.HighlightMark -> {
                        val wCur = m.rect.width() * prog
                        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            color = Color.argb(85, Color.red(m.color), Color.green(m.color), Color.blue(m.color))
                        }
                        canvas.drawRoundRect(
                            m.rect.left, m.rect.top, m.rect.left + wCur, m.rect.bottom,
                            6f * density, 6f * density, paint
                        )
                        if (prog < 1f) animating = true
                    }
                    is Mark.FrameMark -> {
                        drawFrame(canvas, m, prog)
                        if (prog < 1f) animating = true
                    }
                    is Mark.CalloutMark -> {
                        drawCallout(canvas, m, prog)
                        if (prog < 1f) animating = true
                    }
                    is Mark.NumMark -> {
                        drawNumBadge(canvas, m, prog)
                        if (prog < 1f) animating = true
                    }
                    is Mark.WriteMark -> {
                        val chars = (elapsed / m.perLetterMs.coerceAtLeast(15)).toInt().coerceAtMost(m.text.length)
                        drawWrite(canvas, m, chars)
                        if (chars < m.text.length) animating = true
                    }
                    is Mark.NotebookMark -> {
                        if (drawNotebook(canvas, m, elapsed)) animating = true
                    }
                }
            }
        }

        if (captionChunks.isNotEmpty()) {
            if (drawCaptionPill(canvas, t)) animating = true
        }

        if (animating) postInvalidateOnAnimation()
    }

    private fun drawFrame(canvas: Canvas, m: Mark.FrameMark, alpha: Float) {
        val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f * density
            color = Color.argb((alpha * 170).toInt(), Color.red(m.color), Color.green(m.color), Color.blue(m.color))
        }
        val corner = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 3.5f * density
            color = Color.argb((alpha * 255).toInt(), Color.red(m.color), Color.green(m.color), Color.blue(m.color))
        }
        canvas.drawRoundRect(m.rect, 10f * density, 10f * density, border)
        val L = 14f * density
        val r = m.rect
        canvas.drawLine(r.left, r.top, r.left + L, r.top, corner)
        canvas.drawLine(r.left, r.top, r.left, r.top + L, corner)
        canvas.drawLine(r.right - L, r.top, r.right, r.top, corner)
        canvas.drawLine(r.right, r.top, r.right, r.top + L, corner)
        canvas.drawLine(r.left, r.bottom, r.left + L, r.bottom, corner)
        canvas.drawLine(r.left, r.bottom - L, r.left, r.bottom, corner)
        canvas.drawLine(r.right - L, r.bottom, r.right, r.bottom, corner)
        canvas.drawLine(r.right, r.bottom - L, r.right, r.bottom, corner)

        if (!m.label.isNullOrBlank()) {
            drawBadgeTag(canvas, r.centerX(), (r.top - 26f * density).coerceAtLeast(36f * density), m.label, m.color, alpha)
        }
    }

    private fun drawCallout(canvas: Canvas, m: Mark.CalloutMark, alpha: Float) {
        val cy = (m.anchorY - 22f * density).coerceAtLeast(38f * density)
        drawBadgeTag(canvas, m.anchorX, cy, m.label, m.color, alpha)
    }

    private fun drawBadgeTag(canvas: Canvas, cx: Float, cy: Float, text: String, accent: Int, alpha: Float) {
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontBold
            textSize = 13f * density
            color = Color.parseColor("#FEF9EE")
            textAlign = Paint.Align.CENTER
            this.alpha = (alpha * 255).toInt()
        }
        val tw = tp.measureText(text)
        val padH = 12f * density
        val h = 28f * density
        val left = (cx - tw / 2f - padH).coerceIn(10f * density, (width - tw - padH * 2 - 10f * density).coerceAtLeast(10f * density))
        val rect = RectF(left, cy - h / 2f, left + tw + padH * 2, cy + h / 2f)
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb((alpha * 238).toInt(), 20, 16, 12)
        }
        val bd = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.6f * density
            color = Color.argb((alpha * 235).toInt(), Color.red(accent), Color.green(accent), Color.blue(accent))
        }
        canvas.drawRoundRect(rect, h / 2f, h / 2f, bg)
        canvas.drawRoundRect(rect, h / 2f, h / 2f, bd)
        canvas.drawText(text, rect.centerX(), rect.centerY() + 4.5f * density, tp)
    }

    private fun drawNumBadge(canvas: Canvas, m: Mark.NumMark, alpha: Float) {
        val r = 14f * density
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb((alpha * 245).toInt(), Color.red(m.color), Color.green(m.color), Color.blue(m.color))
        }
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontBold
            textSize = 13f * density
            color = Color.parseColor("#140E07")
            textAlign = Paint.Align.CENTER
        }
        canvas.drawCircle(m.cx, m.cy, r, bg)
        canvas.drawText(m.step.toString(), m.cx, m.cy + 4.5f * density, tp)
        if (m.label.isNotBlank()) {
            drawBadgeTag(canvas, m.cx + 68f * density, m.cy - 22f * density, m.label, m.color, alpha)
        }
    }

    private fun drawWrite(canvas: Canvas, m: Mark.WriteMark, revealed: Int) {
        val sub = m.text.take(revealed)
        if (sub.isEmpty()) return
        drawBadgeTag(canvas, m.cx, m.cy, sub, m.color, 1f)
    }

    private fun wrapText(text: String, paint: Paint, maxW: Float): List<String> {
        val clean = text.trim()
        if (clean.isEmpty()) return emptyList()
        if (paint.measureText(clean) <= maxW) return listOf(clean)
        val out = ArrayList<String>()
        val cur = StringBuilder()
        for (word in clean.split(Regex("\\s+"))) {
            val test = if (cur.isEmpty()) word else "$cur $word"
            if (paint.measureText(test) > maxW && cur.isNotEmpty()) {
                out.add(cur.toString())
                cur.clear().append(word)
            } else {
                cur.clear().append(test)
            }
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out
    }

    /**
     * Ardoise HeyClicky dessinée et écrite EN DIRECT :
     * 1. Le cadre manuscrit se trace au trait (0 -> 440 ms) pendant que le fond apparaît doucement
     * 2. Le titre s'écrit lettre par lettre, le séparateur se trace de gauche à droite
     * 3. Chaque ligne/puce/cellule s'écrit progressivement (jamais d'apparition brusque !)
     * Retourne true tant que l'animation d'écriture est en cours.
     */
    private fun drawNotebook(canvas: Canvas, m: Mark.NotebookMark, elapsedMs: Long): Boolean {
        val nb = m.nb
        val cardW = (width - 28f * density).coerceAtMost(356f * density)
        val left = (width - cardW) / 2f
        val pad = 14f * density
        val innerW = cardW - pad * 2f

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontBold
            textSize = 14f * density
            color = Color.parseColor("#FDE68A")
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontReg
            textSize = 12.8f * density
            color = Color.parseColor("#FEF9EE")
        }
        val valPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontBold
            textSize = 13f * density
            color = Color.parseColor("#F5B700")
            textAlign = Paint.Align.RIGHT
        }

        val lineStep = 19.5f * density
        val itemGap = 6f * density
        val barBlockH = 36f * density

        val wrappedLines = ArrayList<Triple<NotebookLine, List<String>, Paint>>()
        var contentH = 0f
        when (nb.mode) {
            "flow" -> {
                val flowText = nb.steps.joinToString("  →  ").ifBlank { nb.lines.joinToString(" → ") { it.text } }
                val fl = wrapText(flowText, bodyPaint, innerW)
                wrappedLines.add(Triple(NotebookLine(text = flowText), fl, bodyPaint))
                contentH = (fl.size.coerceAtLeast(1) * lineStep) + itemGap
            }
            "bars" -> contentH = nb.lines.size.coerceAtLeast(1) * barBlockH
            "table" -> {
                val rowsTotal = (if (nb.headers.isNotEmpty()) 1 else 0) + nb.rows.size
                contentH = rowsTotal.coerceAtLeast(1) * 24f * density
            }
            "choices" -> {
                nb.choices.forEachIndexed { idx, c ->
                    val w = wrapText("${idx + 1}. $c", bodyPaint, innerW)
                    wrappedLines.add(Triple(NotebookLine(text = c), w, bodyPaint))
                    contentH += w.size * lineStep + itemGap
                }
            }
            else -> {
                for (ln in nb.lines) {
                    if (ln.divider) {
                        wrappedLines.add(Triple(ln, emptyList(), bodyPaint))
                        contentH += 12f * density
                        continue
                    }
                    val p = Paint(bodyPaint).apply {
                        if (ln.bold) typeface = fontBold
                        color = when (ln.color) {
                            Ink.YELLOW -> Color.parseColor("#FDE68A")
                            Ink.RED -> Color.parseColor("#FDA4AF")
                            Ink.GREEN -> Color.parseColor("#6EE7B7")
                            Ink.CYAN -> Color.parseColor("#7DD3FC")
                            else -> Color.parseColor("#FEF9EE")
                        }
                    }
                    val valReserve = if (ln.value.isNotBlank()) valPaint.measureText(ln.value) + 12f * density else 0f
                    val availW = (innerW - valReserve).coerceAtLeast(100f * density)
                    val w = wrapText(ln.text, p, availW)
                    wrappedLines.add(Triple(ln, w, p))
                    contentH += w.size.coerceAtLeast(1) * lineStep + itemGap
                }
            }
        }

        val cardH = 44f * density + contentH + pad
        val preferredTop = (m.anchorY ?: (height * 0.44f)) + 18f * density
        val maxTop = (height - cardH - 125f * density).coerceAtLeast(56f * density)
        val top = preferredTop.coerceIn(56f * density, maxTop)

        if (m.borderPath == null || m.cachedW != cardW || m.cachedH != cardH || m.cachedTop != top) {
            m.borderPath = handBox(left, top, cardW, cardH, m.id + "::frame")
            m.cachedW = cardW
            m.cachedH = cardH
            m.cachedTop = top
        }

        // 1. Fond translucide en fondu doux + cadre manuscrit qui se DESSINE au trait (0 -> 440 ms)
        val bgAlpha = (elapsedMs / 320f).coerceIn(0f, 1f)
        val borderProg = (elapsedMs / 440f).coerceIn(0f, 1f)
        val rect = RectF(left, top, left + cardW, top + cardH)
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb((bgAlpha * 238).toInt(), 20, 16, 13) }
        canvas.drawRoundRect(rect, 16f * density, 16f * density, bg)

        val bp = trimmed(m.borderPath!!.path, borderProg)
        if (!bp.isEmpty) {
            canvas.drawPath(bp, strokePaint(Color.argb(215, 245, 183, 0), 2.1f * density))
        }

        var stillAnimating = borderProg < 1f

        // 2. Titre écrit lettre par lettre (démarre à 200 ms, 20 ms/car)
        val titleStr = nb.title.ifBlank { "Explication" }
        var cursorMs = 200L
        val titleChars = ((elapsedMs - cursorMs) / 20L).toInt().coerceIn(0, titleStr.length)
        if (titleChars < titleStr.length) stillAnimating = true
        var y = top + 24f * density
        if (titleChars > 0) {
            canvas.drawText(titleStr.take(titleChars), left + pad, y, titlePaint)
        }
        cursorMs += (titleStr.length * 20L).coerceAtMost(420L)

        // 3. Séparateur horizontal tracé de gauche à droite
        y += 10f * density
        val sepProg = ((elapsedMs - cursorMs) / 180f).coerceIn(0f, 1f)
        if (sepProg < 1f) stillAnimating = true
        if (sepProg > 0f) {
            canvas.drawLine(
                left + pad, y,
                left + pad + innerW * sepProg, y,
                Paint().apply { color = Color.argb(95, 245, 183, 0); strokeWidth = density }
            )
        }
        cursorMs += 110L
        y += 20f * density

        val msPerChar = 15L

        when (nb.mode) {
            "flow", "choices" -> {
                for ((_, linesList, p) in wrappedLines) {
                    for (sub in linesList) {
                        val nChars = ((elapsedMs - cursorMs) / msPerChar).toInt().coerceIn(0, sub.length)
                        if (nChars < sub.length) stillAnimating = true
                        if (nChars > 0) canvas.drawText(sub.take(nChars), left + pad, y, p)
                        cursorMs += sub.length * msPerChar + 40L
                        y += lineStep
                    }
                    y += itemGap
                }
            }
            "bars" -> {
                val maxVal = nb.lines.mapNotNull { it.pct }.maxOrNull()?.takeIf { it > 0f } ?: 100f
                for (ln in nb.lines) {
                    val accent = inks[ln.color] ?: Color.parseColor("#F5B700")
                    val lblChars = ((elapsedMs - cursorMs) / msPerChar).toInt().coerceIn(0, ln.text.length)
                    val barProg = ((elapsedMs - cursorMs - 100L) / 360f).coerceIn(0f, 1f)
                    if (lblChars < ln.text.length || barProg < 1f) stillAnimating = true
                    if (lblChars > 0) canvas.drawText(ln.text.take(lblChars), left + pad, y, bodyPaint)
                    if (ln.value.isNotBlank() && barProg > 0.15f) canvas.drawText(ln.value, left + cardW - pad, y, valPaint)
                    val barY = y + 6f * density
                    val raw = ln.pct ?: (maxVal * 0.65f)
                    val ratio = (if (maxVal > 100f) raw / maxVal else raw / 100f).coerceIn(0.08f, 1f)
                    if (barProg > 0f) {
                        canvas.drawRoundRect(left + pad, barY, left + pad + innerW, barY + 7f * density, 4f * density, 4f * density,
                            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(40, 255, 255, 255) })
                        canvas.drawRoundRect(left + pad, barY, left + pad + innerW * ratio * barProg, barY + 7f * density, 4f * density, 4f * density,
                            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent })
                    }
                    cursorMs += 260L
                    y += barBlockH
                }
            }
            "table" -> {
                val cols = (nb.headers.size).coerceAtLeast(nb.rows.firstOrNull()?.size ?: 2).coerceAtLeast(1)
                val colW = innerW / cols
                if (nb.headers.isNotEmpty()) {
                    val hp = Paint(titlePaint).apply { textSize = 11.5f * density }
                    val hProg = ((elapsedMs - cursorMs) / 220f).coerceIn(0f, 1f)
                    if (hProg < 1f) stillAnimating = true
                    if (hProg > 0f) {
                        hp.alpha = (hProg * 255).toInt()
                        nb.headers.forEachIndexed { idx, h -> canvas.drawText(h.take(18), left + pad + idx * colW, y, hp) }
                    }
                    cursorMs += 180L
                    y += 24f * density
                }
                for (r in nb.rows) {
                    r.forEachIndexed { idx, cell ->
                        val cStr = cell.take(20)
                        val nc = ((elapsedMs - cursorMs) / msPerChar).toInt().coerceIn(0, cStr.length)
                        if (nc < cStr.length) stillAnimating = true
                        if (nc > 0) canvas.drawText(cStr.take(nc), left + pad + idx * colW, y, bodyPaint)
                    }
                    cursorMs += 240L
                    y += 24f * density
                }
            }
            else -> {
                for ((ln, linesList, p) in wrappedLines) {
                    if (ln.divider) {
                        val dProg = ((elapsedMs - cursorMs) / 160f).coerceIn(0f, 1f)
                        if (dProg < 1f) stillAnimating = true
                        if (dProg > 0f) {
                            canvas.drawLine(
                                left + pad, y - 6f * density,
                                left + pad + innerW * dProg, y - 6f * density,
                                Paint().apply { color = Color.argb(65, 255, 255, 255); strokeWidth = density }
                            )
                        }
                        cursorMs += 100L
                        y += 12f * density
                        continue
                    }
                    val itemStart = cursorMs
                    for (sub in linesList) {
                        val nChars = ((elapsedMs - cursorMs) / msPerChar).toInt().coerceIn(0, sub.length)
                        if (nChars < sub.length) stillAnimating = true
                        if (nChars > 0) canvas.drawText(sub.take(nChars), left + pad, y, p)
                        cursorMs += sub.length * msPerChar + 25L
                        y += lineStep
                    }
                    if (ln.value.isNotBlank()) {
                        val vChars = ((elapsedMs - itemStart - 80L) / msPerChar).toInt().coerceIn(0, ln.value.length)
                        if (vChars < ln.value.length) stillAnimating = true
                        if (vChars > 0) {
                            val valY = y - (linesList.size.coerceAtLeast(1) * lineStep)
                            canvas.drawText(ln.value.take(vChars), left + cardW - pad, valY, valPaint)
                        }
                    }
                    cursorMs += 70L
                    y += itemGap
                }
            }
        }
        return stillAnimating
    }

    /** Sous-titre compact façon HeyClicky (1 à 2 lignes max, défilement phrase par phrase). */
    private fun drawCaptionPill(canvas: Canvas, nowMs: Long): Boolean {
        if (captionChunks.isEmpty()) return false
        val elapsed = (nowMs - captionStartedAt).coerceAtLeast(0L)
        var idx = 0
        for (i in captionChunkStartsMs.indices) {
            if (elapsed >= captionChunkStartsMs[i]) idx = i else break
        }
        val chunkText = captionChunks[idx]
        val chunkAge = elapsed - captionChunkStartsMs[idx]
        val fadeIn = (chunkAge / 160f).coerceIn(0f, 1f)

        val maxW = width - 40f * density
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = fontBold
            textSize = 14f * density
            color = Color.WHITE
            alpha = (fadeIn * 255).toInt()
            textAlign = Paint.Align.CENTER
        }
        val lines = wrapText(chunkText, tp, maxW - 28f * density).take(2)
        if (lines.isEmpty()) return false

        val lineH = 19.5f * density
        val pillH = lines.size * lineH + 18f * density
        val pillW = (lines.maxOfOrNull { tp.measureText(it) } ?: 110f) + 32f * density
        val left = (width - pillW) / 2f
        val bottom = height - 74f * density
        val rect = RectF(left, bottom - pillH, left + pillW, bottom)

        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb((fadeIn * 218).toInt(), 12, 16, 26) }
        val bd = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.2f * density
            color = Color.argb((fadeIn * 125).toInt(), 245, 183, 0)
        }
        canvas.drawRoundRect(rect, 18f * density, 18f * density, bg)
        canvas.drawRoundRect(rect, 18f * density, 18f * density, bd)

        var y = rect.top + 21f * density
        for (l in lines) {
            canvas.drawText(l, rect.centerX(), y, tp)
            y += lineH
        }
        return idx < captionChunks.lastIndex || fadeIn < 1f
    }
}
