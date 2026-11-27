package cm.nkapmobile.sdk.context

import android.app.Activity
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import cm.nkapmobile.sdk.core.ScreenContext
import cm.nkapmobile.sdk.core.ScreenNode

/**
 * Extracteur M4 intégré au SDK (.aar) : lit l'arbre de vues d'une Activity
 * bancaire hôte sans hook spécifique, tout en appliquant le filtre strict
 * sécurité (règle d'or #3 : aucun champ EditText / mot de passe / PIN lu).
 */
object ViewTreeScanner {

    const val OVERLAY_TAG = "nkap-sdk-overlay"

    fun scan(activity: Activity, screenHintOverride: String? = null): ScreenContext {
        val root = activity.window?.decorView ?: return ScreenContext(
            appPackage = activity.packageName,
            title = activity.title?.toString() ?: "Application",
            screenHint = screenHintOverride ?: "home",
            nodes = emptyList(),
        )
        val nodes = ArrayList<ScreenNode>(40)
        walk(root, "root", 0, nodes)
        val hint = screenHintOverride ?: guessScreenHint(nodes)
        return ScreenContext(
            appPackage = activity.packageName,
            title = activity.title?.toString()?.takeIf { it.isNotBlank() } ?: "Banque mobile",
            screenHint = hint,
            channel = "mobile",
            nodes = nodes,
        )
    }

    private fun isSensitive(v: View): Boolean {
        if (v is EditText) return true
        if (v is TextView) {
            val itype = v.inputType
            val variation = itype and InputType.TYPE_MASK_VARIATION
            if (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
            ) return true
        }
        val desc = v.contentDescription?.toString().orEmpty()
        if (Regex("pin|mot de passe|password|code secret|otp|cvv", RegexOption.IGNORE_CASE).containsMatchIn(desc)) {
            return true
        }
        return false
    }

    private fun walk(v: View, path: String, depth: Int, out: ArrayList<ScreenNode>) {
        if (depth > 28 || out.size >= 80) return
        if (v.visibility != View.VISIBLE || v.alpha <= 0.02f) return
        if (v.tag == OVERLAY_TAG) return
        if (isSensitive(v)) return

        val loc = IntArray(2)
        v.getLocationOnScreen(loc)
        val l = loc[0]
        val t = loc[1]
        val r = l + v.width
        val b = t + v.height

        if (v.width > 12 && v.height > 10) {
            val txt = when (v) {
                is TextView -> v.text?.toString()?.trim().orEmpty()
                else -> ""
            }
            val desc = v.contentDescription?.toString()?.trim().orEmpty()
            val label = if (txt.isNotEmpty()) txt else desc
            if (label.length >= 2 || label.any { it.isDigit() }) {
                val tag = when {
                    v is Button -> "button"
                    v.isClickable -> "button"
                    else -> "span"
                }
                out.add(
                    ScreenNode(
                        nodeId = "n_%02d".format(out.size + 1),
                        tag = tag,
                        text = label.replace(Regex("\\s+"), " ").take(140),
                        bounds = intArrayOf(l, t, r, b),
                        clickable = v.isClickable || v is Button,
                        tone = "unknown",
                        path = path,
                    )
                )
            }
        }

        if (v is ViewGroup) {
            for (i in 0 until v.childCount) {
                val c = v.getChildAt(i) ?: continue
                walk(c, "$path/${c.javaClass.simpleName}[$i]", depth + 1, out)
            }
        }
    }

    fun guessScreenHint(nodes: List<ScreenNode>): String {
        val joined = nodes.joinToString(" ") { it.text }.lowercase()
        return when {
            joined.contains("opération réussie") || joined.contains("transfert confirmé") || joined.contains("nouveau solde") -> "receipt"
            joined.contains("récapitulatif") || joined.contains("vérifiez avant") -> "recap"
            joined.contains("nom du bénéficiaire") && joined.contains("numéro") -> "beneficiary"
            joined.contains("frais de transfert") || joined.contains("montant à envoyer") -> "fees"
            else -> "home"
        }
    }
}
