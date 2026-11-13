package cm.nkapmobile.engine.core

import android.graphics.Path
import android.graphics.PathMeasure

/**
 * Géométrie manuscrite du style « le tableau » — paths à tremblé déterministe
 * (même entrée = même dessin, toujours) tracés progressivement via PathMeasure.
 */

/** PRNG déterministe (seed string). */
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

/** Un path lisse + sa longueur approximée (pour le tracé progressif). */
class HandPath(val path: Path, val length: Float)

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
        length += kotlin.math.hypot((p2.first - p1.first).toDouble(), (p2.second - p1.second).toDouble()).toFloat()
    }
    return HandPath(p, length * 1.12f)
}

/** Cercle manuscrit : départ ~10h, overshot ~30°, tremblé radial. */
fun handCircle(cx: Float, cy: Float, rx: Float, ry: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    val n = 16
    val start = -2.1f
    val sweep = (2 * Math.PI + 0.55).toFloat()
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val a = start + sweep * i / n
        val jr = 1f + (rand.next() - 0.5f) * 0.055f
        pts.add(Pair(cx + Math.cos(a.toDouble()).toFloat() * rx * jr,
                     cy + Math.sin(a.toDouble()).toFloat() * ry * jr))
    }
    return smoothThrough(pts)
}

/** Soulignement manuscrit : courbure vers le bas + tremblé. */
fun handUnderline(x: Float, y: Float, width: Float, seed: String): HandPath {
    val rand = Seeded(seed)
    val n = 8
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val t = i.toFloat() / n
        val sag = Math.sin((t * Math.PI).toDouble()).toFloat() * 5f
        pts.add(Pair(x + width * t + (rand.next() - 0.5f) * 2.2f,
                     y + sag + (rand.next() - 0.5f) * 2.2f))
    }
    return smoothThrough(pts)
}

/** Résultat d'une flèche : corps + tête dessinée après le corps. */
class HandArrow(val main: HandPath, val head: HandPath)

/** Flèche manuscrite : courbe bombée (bow) + tremblé + pointe en V. */
fun handArrow(
    fx: Float, fy: Float, tx: Float, ty: Float,
    seed: String, bow: Float = 0.16f,
): HandArrow {
    val rand = Seeded(seed)
    val n = 12
    val dx = tx - fx
    val dy = ty - fy
    val dist = kotlin.math.hypot(dx.toDouble(), dy.toDouble()).toFloat()
    val nx = -dy / (dist.takeIf { it > 0 } ?: 1f)
    val ny = dx / (dist.takeIf { it > 0 } ?: 1f)
    val pts = ArrayList<Pair<Float, Float>>(n + 1)
    for (i in 0..n) {
        val t = i.toFloat() / n
        val bulge = Math.sin((t * Math.PI).toDouble()).toFloat() * bow * dist * 0.35f
        pts.add(Pair(fx + dx * t + nx * bulge + (rand.next() - 0.5f) * 2.4f,
                     fy + dy * t + ny * bulge + (rand.next() - 0.5f) * 2.4f))
    }
    val main = smoothThrough(pts)

    val ang = Math.atan2(dy.toDouble(), dx.toDouble()).toFloat()
    val headLen = 16f
    val a1 = ang + Math.PI.toFloat() - 0.5f
    val a2 = ang + Math.PI.toFloat() + 0.5f
    val hp = Path()
    hp.moveTo(tx + headLen * Math.cos(a1.toDouble()).toFloat(), ty + headLen * Math.sin(a1.toDouble()).toFloat())
    hp.lineTo(tx, ty)
    hp.lineTo(tx + headLen * Math.cos(a2.toDouble()).toFloat(), ty + headLen * Math.sin(a2.toDouble()).toFloat())
    val head = HandPath(hp, headLen * 2f)
    return HandArrow(main, head)
}

/** Sous-segment progressif d'un path : t ∈ [0,1] (tracé qui « dessine »). */
fun trimmed(path: Path, t: Float): Path {
    if (t >= 1f) return path
    val pm = PathMeasure(path, false)
    val out = Path()
    val len = pm.length * t.coerceIn(0f, 1f)
    if (len > 0f) pm.getSegment(0f, len, out, true)
    return out
}
