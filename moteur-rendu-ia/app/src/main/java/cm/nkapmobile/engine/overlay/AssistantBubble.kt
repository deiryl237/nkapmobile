package cm.nkapmobile.engine.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View

/**
 * La bulle assistant — l'unique couche tactile. Discrète (elle respire),
 * elle déclenche le tour utilisateur (push-to-talk en mode serveur,
 * parcours suivant en mode démo offline).
 */
class AssistantBubble(ctx: Context, private val onPress: () -> Unit) : View(ctx) {

    enum class State { IDLE, LISTENING, PROCESSING }

    @Volatile var state: State = State.IDLE
        set(value) {
            field = value
            postInvalidateOnAnimation()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val emojiPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 52f; textAlign = Paint.Align.CENTER }

    private val blue = Color.parseColor("#0AB4FF")
    private val red = Color.parseColor("#E23B3B")
    private val dark = Color.parseColor("#12233A")

    override fun onDraw(canvas: Canvas) {
        val size = width.coerceAtMost(height).toFloat()
        val cx = width / 2f
        val cy = height / 2f
        val r = size / 2f - 6f

        val color = when (state) { State.LISTENING -> red; State.PROCESSING -> dark; else -> blue }
        paint.color = color
        canvas.drawCircle(cx, cy, r, paint)
        val glyph = when (state) { State.LISTENING -> "👂"; State.PROCESSING -> "⏳"; else -> "🧠" }
        emojiPaint.color = Color.WHITE
        canvas.drawText(glyph, cx, cy + 18f, emojiPaint)
        if (state != State.PROCESSING) postInvalidateOnAnimation() // respiration continue
    }

    override fun onTouchEvent(e: android.view.MotionEvent): Boolean {
        if (e.action == android.view.MotionEvent.ACTION_DOWN) {
            performClick()
            return true
        }
        return super.onTouchEvent(e)
    }

    override fun performClick(): Boolean {
        onPress()
        return true
    }
}
