package cm.nkapmobile.sdk.core

import android.graphics.Path
import android.graphics.PathMeasure
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Géométrie manuscrite déterministe (style « le tableau ») tracée progressivement
 * via PathMeasure : cercle, boîte, soulignement, flèche, rature, coche, croix.
 */
class Seeded(seed: String) {
    private var h: Int = 1779033703 xor seed.length
    init {
        for (c in seed) {
            h = imul(h xor c.code, 3432918353L.toInt())
            h = (h shl 13) or (h ushr 19)
        }
    }
    fun next(): Float {
        h = imul(h xor (h ushr 16), 2246822507L.toInt())
        h = imul(h xor (h ushr 13), 3266489909L.toInt())
        h = h xor (h ushr 16)
        return (h.toLong() and 0xFFFFFFFFL).toFloat() / 0xFFFFFFFFL.toFloat()
    }
    private fun imul(a: Int, b: Int): Int = (a.toLong() * b.toLong()).toInt()
}

class HandPath(val path: Path, val length: Float)
class HandArrow(val main: HandPath, val head: HandPath)

private fun smoothThrough(pts: List<Pair<Float, Float>>): HandPath {
    if (pts.size < 2) return HandPath(Path(), 0f)
    val p = Path()
    p.moveTo(pts[0].first, pts[0].second)
    var length = 0f
    for (i in 0 until pts.size - 1) {
        val p0 = pts[maxOf(0, i - 1)]
        val p1 = pts[i]
        val p2 = pts[i + 1]
        val p3 = pts[minOf(pts.size - 1, i + 2)]
        val c1x = p1.first + (p2.first - p0.first) / 6f
        val c1y = p1.second + (p2.second - p0.second) / 6f
        val c2x = p2.first - (p3.first - p1.first) / 6f
        val c2y = p2.second - (p3.second - p1.second) / 6f
        p.cubicTo(c1x, c1y, c2x, c2y, p2.first, p2.second)
        length += hypot((p2.first - p1.first).toDouble(), (p2.second - p1.second).toDouble()).toFloat()
    }
    return HandPath(p, length * 1.12f)
}

fun handCircle(cx: Float, cy: Float, rx: Float, ry: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    val n = 16
    val start = -2.1f
    val sweep = (2 * Math.PI + 0.55).toFloat()
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val a = start + sweep * i / n
        val jr = 1f + (rand.next() - 0.5f) * 0.055f
        pts.add(Pair(cx + cos(a.toDouble()).toFloat() * rx * jr, cy + sin(a.toDouble()).toFloat() * ry * jr))
    }
    return smoothThrough(pts)
}

fun handBox(x: Float, y: Float, w: Float, h: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    fun j() = (rand.next() - 0.5f) * 3.2f
    val r = minOf(18f, w * 0.12f, h * 0.25f)
    val p = Path()
    // Rectangle manuscrit légèrement organique (sans pincement sur les grands blocs larges)
    p.moveTo(x + r + j(), y + j())
    p.quadTo(x + w * 0.5f, y + j() * 1.4f, x + w - r + j(), y + j())
    p.quadTo(x + w + j(), y + j(), x + w + j(), y + r + j())
    p.quadTo(x + w + j() * 1.3f, y + h * 0.5f, x + w + j(), y + h - r + j())
    p.quadTo(x + w + j(), y + h + j(), x + w - r + j(), y + h + j())
    p.quadTo(x + w * 0.5f, y + h + j() * 1.4f, x + r + j(), y + h + j())
    p.quadTo(x + j(), y + h + j(), x + j(), y + h - r + j())
    p.quadTo(x + j() * 1.3f, y + h * 0.5f, x + j(), y + r + j())
    p.quadTo(x + j(), y + j(), x + r + 4f + j(), y + j())
    return HandPath(p, (w + h) * 2.05f)
}

fun handUnderline(x: Float, y: Float, width: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    val n = 8
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val t = i.toFloat() / n
        val sag = sin((t * Math.PI).toDouble()).toFloat() * 5f
        pts.add(Pair(x + width * t + (rand.next() - 0.5f) * 2.2f, y + sag + (rand.next() - 0.5f) * 2.2f))
    }
    return smoothThrough(pts)
}

fun handStrike(x: Float, y: Float, width: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    val pts = listOf(
        Pair(x - 4f, y + 3f + (rand.next() - 0.5f) * 3f),
        Pair(x + width * 0.5f, y + (rand.next() - 0.5f) * 3f),
        Pair(x + width + 4f, y - 3f + (rand.next() - 0.5f) * 3f),
    )
    return smoothThrough(pts)
}

fun handCheck(cx: Float, cy: Float, size: Float): HandPath {
    val p = Path()
    p.moveTo(cx - size * 0.45f, cy + size * 0.05f)
    p.lineTo(cx - size * 0.1f, cy + size * 0.42f)
    p.lineTo(cx + size * 0.52f, cy - size * 0.38f)
    return HandPath(p, size * 1.8f)
}

fun handCross(cx: Float, cy: Float, size: Float): HandArrow {
    val r = size * 0.4f
    val p1 = Path().apply { moveTo(cx - r, cy - r); lineTo(cx + r, cy + r) }
    val p2 = Path().apply { moveTo(cx + r, cy - r); lineTo(cx - r, cy + r) }
    return HandArrow(HandPath(p1, r * 2.8f), HandPath(p2, r * 2.8f))
}

fun handArrow(fx: Float, fy: Float, tx: Float, ty: Float, seed: String, bow: Float = 0.16f): HandArrow {
    val rand = Seeded(seed)
    val n = 12
    val dx = tx - fx
    val dy = ty - fy
    val dist = hypot(dx.toDouble(), dy.toDouble()).toFloat()
    val nx = -dy / (dist.takeIf { it > 0 } ?: 1f)
    val ny = dx / (dist.takeIf { it > 0 } ?: 1f)
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val t = i.toFloat() / n
        val bulge = sin((t * Math.PI).toDouble()).toFloat() * bow * dist * 0.35f
        pts.add(
            Pair(
                fx + dx * t + nx * bulge + (rand.next() - 0.5f) * 2.4f,
                fy + dy * t + ny * bulge + (rand.next() - 0.5f) * 2.4f
            )
        )
    }
    val main = smoothThrough(pts)

    val ang = atan2(dy.toDouble(), dx.toDouble()).toFloat()
    val headLen = 18f
    val a1 = ang + Math.PI.toFloat() - 0.5f
    val a2 = ang + Math.PI.toFloat() + 0.5f
    val hp = Path().apply {
        moveTo(tx + headLen * cos(a1.toDouble()).toFloat(), ty + headLen * sin(a1.toDouble()).toFloat())
        lineTo(tx, ty)
        lineTo(tx + headLen * cos(a2.toDouble()).toFloat(), ty + headLen * sin(a2.toDouble()).toFloat())
    }
    return HandArrow(main, HandPath(hp, headLen * 2f))
}

fun trimmed(path: Path, t: Float): Path {
    if (t >= 1f) return path
    val pm = PathMeasure(path, false)
    val out = Path()
    val len = pm.length * t.coerceIn(0f, 1f)
    if (len > 0f) pm.getSegment(0f, len, out, true)
    return out
}
