package cm.nkapmobile.engine.demo

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Interface fintech SIMULÉE (règlement : aucune transaction réelle).
 * Volontairement typique : solde, CTA d'envoi, bénéficiaire, frais — les
 * contenus sont en français comme exigé par l'épreuve ; c'est nkapmobile qui
 * les rend compréhensibles en ewondo par-dessus.
 */
class DemoFintechActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        fun tv(text: String, size: Int, color: Int, bold: Boolean = false) = TextView(this).apply {
            this.text = text
            textSize = size.toFloat()
            setTextColor(color)
            paint.isFakeBoldText = bold
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 80, 40, 200)
        }

        content.addView(tv("KwikPay — Transfert d'argent", 26, Color.WHITE, true).apply { gravity = Gravity.CENTER })

        content.addView(View(this).apply { minimumHeight = 30 })

        // solde — cible P1 ("Solde")
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0B1B2B"))
            setPadding(40, 44, 40, 44)
            addView(tv("Solde disponible", 15, Color.parseColor("#8FA7BF")))
            addView(tv("42 500 FCFA", 40, Color.WHITE, true).apply { gravity = Gravity.CENTER })
        })

        // CTA — cible P3 ("Envoyer")
        content.addView(Button(this).apply {
            text = "Envoyer de l'argent"
            setBackgroundColor(Color.parseColor("#0ACF83"))
            setTextColor(Color.WHITE)
            textSize = 18f
        }.apply { (layoutParams as? ViewGroup.MarginLayoutParams) })

        content.addView(View(this).apply { minimumHeight = 24 })

        // bénéficiaire — cible P3 ("Aïssatou")
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(20, 30, 20, 30)
            setBackgroundColor(Color.WHITE)
            addView(tv("A", 24, Color.parseColor("#0AB4FF"), true).apply {
                gravity = Gravity.CENTER
                minimumWidth = 88
                minimumHeight = 88
                setBackgroundColor(Color.parseColor("#EAF7FF"))
            })
            addView(LinearLayout(this@DemoFintechActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(24, 0, 0, 0)
                addView(tv("Aïssatou (sœur)", 17, Color.BLACK, true))
                addView(tv("Douala · +237 6 90 00 00 00", 14, Color.parseColor("#54677D")))
            })
        })

        content.addView(View(this).apply { minimumHeight = 24 })

        // frais — cible P2 ("Frais")
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(28, 26, 28, 26)
            setBackgroundColor(Color.WHITE)
            addView(tv("Frais d'envoi", 16, Color.parseColor("#54677D")))
            addView(tv("25 FCFA (0,25 %)", 16, Color.BLACK, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT).apply { weight = 1f; gravity = Gravity.END })
        })

        // erreur / avertissement — cible P5 ("Ne partagez")
        content.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(28, 26, 28, 26)
            setBackgroundColor(Color.parseColor("#FFF3E0"))
            addView(tv("⚠ Ne partagez jamais votre code secret. Un agent ne vous le demandera pas.", 14, Color.parseColor("#8A5B00")))
        })

        setContentView(ScrollViewWrap(content))
    }

    private fun ScrollViewWrap(child: View): View = android.widget.ScrollView(this).apply {
        setBackgroundColor(Color.parseColor("#F5FAFD"))
        addView(child)
    }
}
