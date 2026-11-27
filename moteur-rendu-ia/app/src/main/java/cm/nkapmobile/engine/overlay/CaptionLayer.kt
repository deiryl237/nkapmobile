package cm.nkapmobile.engine.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import cm.nkapmobile.engine.Engine

/**
 * Sous-titres du contrat : la voix est TOUJOURS montrée (Andika), au-dessus du
 * chrome hôte, avec sous-titre français optionnel (démo jury). S'efface doucement
 * après 6 s sans renouvellement.
 */
class CaptionLayer(ctx: Context) : View(ctx) {

    private var text: String? = null
    private var sub: String? = null
    private var updatedAt: Long = 0

    private val chip = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(242, 255, 255, 255) }
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f; color = Color.parseColor("#E2EEF5")
    }
    private val main = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#12233A"); textSize = 34f
        typeface = runCatching { Typeface.createFromAsset(ctx.assets, "fonts/Andika-Regular.ttf") }
            .getOrDefault(Typeface.DEFAULT)
    }
    private val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#54677D"); textSize = 26f
        typeface = runCatching { Typeface.createFromAsset(ctx.assets, "fonts/Andika-Regular.ttf") }
            .getOrDefault(Typeface.DEFAULT)
    }

    fun setCaption(text: String?, subFr: String? = null) {
        if (text == null) {
            this.text = null; this.sub = null
            postInvalidateOnAnimation()
            return
        }
        this.text = text
        this.sub = subFr
        updatedAt = System.currentTimeMillis()
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        val t = text ?: return
        val fade = ((System.currentTimeMillis() - updatedAt).let { 1f - ((it - 6000) / 500f).coerceIn(0f, 1f) })
            .coerceIn(0f, 1f)
        if (fade <= 0f) { text = null; sub = null; return }

        val bottom = height - Engine.safeBottomPx
        val maxW = width * 0.72f
        val words = t.split(" ")
        val lines = ArrayList<String>()
        var cur = StringBuilder()
        for (w in words) {
            val test = if (cur.isEmpty()) w else "$cur $w"
            if (main.measureText(test) > maxW && cur.isNotEmpty()) {
                lines.add(cur.toString()); cur = StringBuilder(w)
            } else cur.clear().append(test)
        }
        if (cur.isNotEmpty()) lines.add(cur.toString())

        val subLines = sub?.let { listOf(it) } ?: emptyList()
        val lineH = 44f
        val chipH = lines.size * lineH + subLines.size * 34f + 36f
        val widths = ArrayList<Float>()
        for (l in lines) widths.add(main.measureText(l))
        for (l in subLines) widths.add(subPaint.measureText(l))
        val chipW = (widths.maxOrNull() ?: 100f) + 56f
        val left = 24f
        val top = bottom - chipH

        val chipA = chip.apply { setAlpha((fade * 242).toInt()) }
        val borderA = border.apply { setAlpha((fade * 255).toInt()) }
        canvas.drawRoundRect(left, top, left + chipW, top + chipH, 18f, 18f, chipA)
        canvas.drawRoundRect(left, top, left + chipW, top + chipH, 18f, 18f, borderA)

        var y = top + 44f
        for (line in lines) {
            val p = Paint(main).apply { setAlpha((fade * 255).toInt()) }
            canvas.drawText(line, left + 28f, y, p)
            y += lineH
        }
        for (line in subLines) {
            val p = Paint(subPaint).apply { setAlpha((fade * 200).toInt()) }
            canvas.drawText(line, left + 28f, y + 8f, p)
        }
        if (fade < 1f) postInvalidateOnAnimation()
    }
}
