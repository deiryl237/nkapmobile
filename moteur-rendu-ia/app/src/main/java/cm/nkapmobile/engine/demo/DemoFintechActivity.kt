package cm.nkapmobile.engine.demo

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import cm.nkapmobile.sdk.NkapConfig
import cm.nkapmobile.sdk.NkapSDK
import cm.nkapmobile.sdk.NkapSession

/**
 * Application bancaire mobile de démonstration intégrant le SDK Android `.aar`
 * NkapMobile en 2 lignes — sans aucune permission d'accessibilité requise !
 */
class DemoFintechActivity : Activity() {

    private var nkapSession: NkapSession? = null
    private var d: Float = 1f
    private fun dp(v: Int): Int = (v * d).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        d = resources.displayMetrics.density
        title = "Banque Démo · NkapPay"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F3F7FB"))
        }

        // En-tête vert banque mobile
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#047857"))
            setPadding(dp(20), dp(46), dp(20), dp(22))
        }
        topBar.addView(tv("Bonjour Achille Bello", 18f, Color.WHITE, bold = true))
        topBar.addView(tv("Compte 237652148466", 12f, Color.parseColor("#A7F3D0")).apply {
            setPadding(0, dp(3), 0, dp(16))
        })

        // Carte solde bleu-violet
        val balanceCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(18))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#3B33B5"), Color.parseColor("#251F8A"))
            ).apply { cornerRadius = 16f * d }
        }
        balanceCard.addView(tv("Solde disponible", 13f, Color.parseColor("#C7D2FE")))
        balanceCard.addView(tv("102 096 FCFA", 32f, Color.WHITE, bold = true).apply {
            setPadding(0, dp(4), 0, dp(4))
        })
        balanceCard.addView(tv("Plafond journalier : 500 000 FCFA", 11.5f, Color.parseColor("#A5B4FC")))
        topBar.addView(balanceCard)
        root.addView(topBar)

        // Corps principal
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(110))
        }

        // Actions rapides
        body.addView(tv("Que voulez-vous faire ?", 14.5f, Color.parseColor("#0F172A"), bold = true).apply {
            setPadding(0, 0, 0, dp(10))
        })
        val actionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(14)
            }
        }
        actionsRow.addView(actionButton("Envoyer de l'argent", "#059669", Color.WHITE).apply {
            layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f).apply { rightMargin = dp(8) }
        })
        actionsRow.addView(actionButton("Payer une facture", "#FFFFFF", Color.parseColor("#0F172A")).apply {
            layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f)
        })
        body.addView(actionsRow)

        // Carte Bénéficiaire & Frais
        val transferCard = cardBox()
        transferCard.addView(tv("Transfert rapide", 14f, Color.parseColor("#0F172A"), bold = true).apply {
            setPadding(0, 0, 0, dp(8))
        })
        transferCard.addView(kvRow("Bénéficiaire", "Aïssatou Bello (+237 690 00 00 00)"))
        transferCard.addView(kvRow("Frais d'envoi", "25 FCFA (0,25 %)"))
        transferCard.addView(kvRow("Total à débiter", "10 025 FCFA"))
        body.addView(transferCard)

        // Dernières opérations
        val histCard = cardBox()
        histCard.addView(tv("Dernières opérations", 14f, Color.parseColor("#0F172A"), bold = true).apply {
            setPadding(0, 0, 0, dp(8))
        })
        histCard.addView(kvRow("Facture ENEO · Confirmé", "-600 FCFA"))
        histCard.addView(kvRow("Facture CAMWATER · En attente", "-700 FCFA"))
        histCard.addView(kvRow("Transfert vers Carine Njoya", "-2 050 FCFA"))
        body.addView(histCard)

        // Bandeau de sécurité
        body.addView(TextView(this).apply {
            text = "⚠ Alerte sécurité : ne partagez jamais votre code PIN. Un agent ne vous le demandera jamais."
            textSize = 12.5f
            setTextColor(Color.parseColor("#92400E"))
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = 12f * d
                setColor(Color.parseColor("#FEF3C7"))
                setStroke(dp(1), Color.parseColor("#F59E0B"))
            }
        })

        root.addView(body)
        setContentView(ScrollView(this).apply { addView(root) })

        // =========================================================================
        // INTÉGRATION NKAP ANDROID SDK (.aar) EN 2 LIGNES !
        // =========================================================================
        val brainUrl = getSharedPreferences("nkap_sdk", Context.MODE_PRIVATE)
            .getString("brain_url", NkapSDK.DEFAULT_BRAIN_URL) ?: NkapSDK.DEFAULT_BRAIN_URL
        nkapSession = NkapSDK.attach(this, NkapConfig(brainUrl = brainUrl))
    }

    override fun onDestroy() {
        nkapSession?.destroy()
        nkapSession = null
        super.onDestroy()
    }

    private fun tv(text: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = sp
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun actionButton(label: String, bgHex: String, textColor: Int) = Button(this).apply {
        text = label
        textSize = 13f
        isAllCaps = false
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(textColor)
        background = GradientDrawable().apply {
            cornerRadius = 12f * d
            setColor(Color.parseColor(bgHex))
            if (bgHex == "#FFFFFF") setStroke(dp(1), Color.parseColor("#CBD5E1"))
        }
        setOnClickListener {
            Toast.makeText(this@DemoFintechActivity, "Démo : $label", Toast.LENGTH_SHORT).show()
        }
    }

    private fun cardBox() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(14), dp(14), dp(14), dp(12))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        }
        background = GradientDrawable().apply {
            cornerRadius = 14f * d
            setColor(Color.WHITE)
            setStroke(dp(1), Color.parseColor("#E2E8F0"))
        }
    }

    private fun kvRow(k: String, v: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(5), 0, dp(5))
        addView(tv(k, 13f, Color.parseColor("#475569")).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        addView(tv(v, 13f, Color.parseColor("#0F172A"), bold = true))
    }
}
