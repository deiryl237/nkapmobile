package cm.nkapmobile.sdk.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Tiroir de chat « Solar Jarvis » (obsidienne/ambre chaud) :
 * - Chips contextuels selon l'écran actif
 * - Mini-pilules d'éducation financière (Microfinance ?, Les frais ?, Plafond ?)
 * - Saisie libre + bouton Envoyer doré + bouton Micro Push-to-Talk + Voix/Muet + Effacer
 */
class NkapChatDrawer(
    ctx: Context,
    private val onAsk: (String) -> Unit,
    private val onClear: () -> Unit,
    private val onToggleVoice: () -> Boolean,
    private val onToggleMic: () -> Unit,
    private val onClose: () -> Unit,
) : LinearLayout(ctx) {

    private val d = ctx.resources.displayMetrics.density
    private fun dp(v: Int): Int = (v * d).toInt()

    private val titleView: TextView
    private val subView: TextView
    private val chipsContainer: LinearLayout
    private val muteBtn: TextView
    private val input: EditText
    private val micBtn: TextView

    init {
        tag = cm.nkapmobile.sdk.context.ViewTreeScanner.OVERLAY_TAG
        orientation = VERTICAL
        setPadding(dp(14), dp(13), dp(14), dp(13))
        background = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.argb(245, 26, 20, 15), Color.argb(248, 12, 17, 30))
        ).apply {
            cornerRadius = 20f * d
            setStroke(dp(1), Color.argb(120, 245, 183, 0))
        }
        elevation = 16f * d

        // 1. En-tête
        val header = LinearLayout(ctx).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(9))
        }
        val dot = TextView(ctx).apply {
            text = "●"
            textSize = 11f
            setTextColor(Color.parseColor("#F5B700"))
            setPadding(0, 0, dp(7), 0)
        }
        val titleCol = LinearLayout(ctx).apply {
            orientation = VERTICAL
            layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
        }
        titleView = TextView(ctx).apply {
            text = "Assistant Nkap"
            textSize = 13.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FDE68A"))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        subView = TextView(ctx).apply {
            text = "Copilote vivant · connecté"
            textSize = 10.5f
            setTextColor(Color.parseColor("#A8A29E"))
        }
        titleCol.addView(titleView)
        titleCol.addView(subView)

        val clearBtn = smallPill(ctx, "Effacer", "#D6D3D1", Color.argb(22, 255, 255, 255), Color.argb(40, 255, 255, 255)) {
            onClear()
            onClose()
        }
        muteBtn = smallPill(ctx, "Voix", "#FDE68A", Color.argb(34, 245, 183, 0), Color.argb(90, 245, 183, 0)) {}
        muteBtn.setOnClickListener {
            val enabled = onToggleVoice()
            muteBtn.text = if (enabled) "Voix" else "Muet"
        }
        val closeBtn = TextView(ctx).apply {
            text = "×"
            textSize = 20f
            setTextColor(Color.parseColor("#A8A29E"))
            setPadding(dp(8), 0, dp(2), 0)
            setOnClickListener { onClose() }
        }

        header.addView(dot)
        header.addView(titleCol)
        header.addView(clearBtn)
        header.addView(muteBtn)
        header.addView(closeBtn)
        addView(header)

        // 2. Chips contextuels
        chipsContainer = LinearLayout(ctx).apply {
            orientation = VERTICAL
            setPadding(0, dp(4), 0, dp(6))
        }
        val scroll = ScrollView(ctx).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
            addView(chipsContainer)
        }
        addView(scroll)

        // 3. Pilules éducation financière
        val conceptsRow = LinearLayout(ctx).apply {
            orientation = HORIZONTAL
            setPadding(0, dp(2), 0, dp(8))
        }
        listOf(
            "Microfinance ?" to "C'est quoi une microfinance ?",
            "Les frais ?" to "C'est quoi les frais ?",
            "Plafond ?" to "C'est quoi un plafond ?",
        ).forEach { (lbl, q) ->
            val p = smallPill(ctx, lbl, "#FDE68A", Color.argb(28, 245, 183, 0), Color.argb(80, 245, 183, 0)) {
                onAsk(q)
            }
            conceptsRow.addView(p)
        }
        addView(conceptsRow)

        // 4. Ligne de saisie : Micro + EditText + Envoyer doré
        val form = LinearLayout(ctx).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, 0)
        }
        micBtn = TextView(ctx).apply {
            text = "🎙"
            textSize = 15f
            gravity = Gravity.CENTER
            layoutParams = LayoutParams(dp(36), dp(36)).apply { rightMargin = dp(6) }
            background = GradientDrawable().apply {
                cornerRadius = 11f * d
                setColor(Color.argb(35, 245, 183, 0))
                setStroke(dp(1), Color.argb(90, 245, 183, 0))
            }
            setOnClickListener { onToggleMic() }
        }
        input = EditText(ctx).apply {
            hint = "Demande-moi n'importe quoi…"
            setHintTextColor(Color.parseColor("#8A837C"))
            setTextColor(Color.parseColor("#FEF9EE"))
            textSize = 12.5f
            isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEND
            setPadding(dp(11), dp(7), dp(11), dp(7))
            layoutParams = LayoutParams(0, dp(36), 1f).apply { rightMargin = dp(6) }
            background = GradientDrawable().apply {
                cornerRadius = 11f * d
                setColor(Color.argb(20, 255, 248, 235))
                setStroke(dp(1), Color.argb(75, 245, 183, 0))
            }
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_SEND) {
                    submitInput()
                    true
                } else false
            }
        }
        val sendBtn = Button(ctx).apply {
            text = "➤"
            textSize = 14f
            setTextColor(Color.parseColor("#140E07"))
            setPadding(0, 0, 0, 0)
            layoutParams = LayoutParams(dp(38), dp(36))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#F5B700"), Color.parseColor("#FF8C42"))
            ).apply { cornerRadius = 11f * d }
            setOnClickListener { submitInput() }
        }
        form.addView(micBtn)
        form.addView(input)
        form.addView(sendBtn)
        addView(form)
    }

    private fun submitInput() {
        val q = input.text?.toString()?.trim().orEmpty()
        if (q.isNotEmpty()) {
            input.setText("")
            onAsk(q)
        }
    }

    fun setMicActive(active: Boolean) {
        micBtn.background = GradientDrawable().apply {
            cornerRadius = 11f * d
            setColor(if (active) Color.parseColor("#FF3B5C") else Color.argb(35, 245, 183, 0))
            setStroke(dp(1), if (active) Color.parseColor("#FF3B5C") else Color.argb(90, 245, 183, 0))
        }
    }

    fun refreshSuggestions(screenHint: String, connected: Boolean) {
        refreshSuggestions("generic", screenHint, connected)
    }

    fun refreshSuggestions(appId: String, screenKey: String, connected: Boolean) {
        val (headerTitle, questions) = when (appId) {
            "wave" -> when (screenKey) {
                "send_money" -> "Wave · Envoyer" to listOf(
                    "Je dois faire quoi ici ?",
                    "Envoyer à un nouveau numéro",
                    "Comment scanner un QR code ?",
                    "C'est quoi mon solde ?",
                )
                "send_new_number" -> "Wave · Nouveau numéro" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment revenir en arrière ?",
                )
                "send_amount" -> "Wave · Montant" to listOf(
                    "Je dois faire quoi ici ?",
                    "C'est quoi les frais ?",
                    "Comment revenir en arrière ?",
                )
                "bills" -> "Wave · Paiements" to listOf(
                    "C'est quoi ENEO Prepaid vs Postpaid ?",
                    "Comment payer CAM-WATER ou Canal+ ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "vault" -> "Wave · Coffre" to listOf(
                    "Comment mettre ou retirer de l'argent ?",
                    "À quoi sert Lock your Vault ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "more" -> "Wave · Plus" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "settings" -> "Wave · Paramètres" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment changer mon code secret ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "card_qr" -> "Wave · Mon QR code" to listOf(
                    "À quoi sert ce QR code ?",
                    "Comment envoyer de l'argent ?",
                    "Comment revenir à l'accueil ?",
                )
                else -> "Wave · Accueil" to listOf(
                    "C'est quoi mon solde ?",
                    "Comment envoyer de l'argent ?",
                    "Comment payer une facture ?",
                    "C'est quoi Vault ?",
                )
            }
            "maxit" -> when (screenKey) {
                "transfer" -> "Max it · Transfert" to listOf(
                    "Je dois faire quoi ici ?",
                    "C'est quoi mon solde ?",
                    "Comment acheter un forfait ?",
                )
                "bundle" -> "Max it · Forfaits" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "topup" -> "Max it · Recharge" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                "cancel" -> "Max it · Annulation" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment envoyer de l'argent ?",
                    "C'est quoi mon solde ?",
                )
                else -> "Max it · Accueil" to listOf(
                    "C'est quoi mon solde ?",
                    "Comment envoyer de l'argent ?",
                    "Comment annuler une transaction ?",
                    "Comment acheter un forfait ?",
                )
            }
            "safinum" -> when (screenKey) {
                "transfer", "beneficiary" -> "Banque Démo · Envoyer" to listOf(
                    "Je dois faire quoi ici ?",
                    "C'est quoi la liste Mes bénéficiaires ?",
                    "Je dois envoyer 500 000 FCFA ?",
                    "Quel est mon solde ?",
                )
                "pay_bill" -> "Banque Démo · Factures" to listOf(
                    "Je dois faire quoi ici ?",
                    "Comment payer une facture ENEO ?",
                    "Je veux plutôt acheter du crédit",
                )
                "pay_airtime" -> "Banque Démo · Crédit" to listOf(
                    "Je dois faire quoi ici ?",
                    "Je veux plutôt payer une facture",
                    "Quel est mon solde ?",
                )
                "review", "recap" -> "Banque Démo · Récapitulatif" to listOf(
                    "Je dois faire quoi ici ?",
                    "Combien il me restera après ?",
                    "Comment modifier si je me suis trompé ?",
                    "Comment confirmer ?",
                )
                "receipt" -> "Banque Démo · Reçu" to listOf(
                    "L'argent est bien parti ?",
                    "Quel est mon nouveau solde ?",
                )
                "history" -> "Banque Démo · Historique" to listOf(
                    "Quelles sont mes dernières opérations ?",
                    "Comment filtrer entrants et sortants ?",
                    "Quel est mon solde ?",
                )
                else -> "Banque Démo · Accueil" to listOf(
                    "Quel est mon solde ?",
                    "Comment envoyer de l'argent ?",
                    "Comment payer une facture ?",
                    "Je dois faire quoi ici ?",
                )
            }
            else -> when (screenKey) {
                "recap", "review" -> "Récapitulatif" to listOf(
                    "Résume-moi les montants et les frais",
                    "À qui va partir l'argent ?",
                    "Comment confirmer ?",
                )
                "receipt" -> "Confirmation" to listOf(
                    "L'argent est bien parti ?",
                    "Quel est mon nouveau solde ?",
                )
                else -> "Assistant Nkap" to listOf(
                    "Je dois faire quoi ici ?",
                    "C'est quoi mon solde ?",
                    "Comment envoyer de l'argent ?",
                    "Explique-moi cet écran",
                )
            }
        }

        titleView.text = headerTitle
        subView.text = if (connected) "Copilote vivant · connecté" else "Copilote visuel · hors-ligne"
        chipsContainer.removeAllViews()

        for (q in questions) {
            val row = TextView(context).apply {
                text = "•  $q"
                textSize = 13f
                setTextColor(Color.parseColor("#FEF3C7"))
                setPadding(dp(12), dp(9), dp(12), dp(9))
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(6)
                }
                background = GradientDrawable().apply {
                    cornerRadius = 12f * d
                    setColor(Color.argb(24, 255, 214, 130))
                    setStroke(dp(1), Color.argb(65, 245, 183, 0))
                }
                setOnClickListener { onAsk(q) }
            }
            chipsContainer.addView(row)
        }
    }

    private fun smallPill(
        ctx: Context,
        label: String,
        textColorHex: String,
        bgColor: Int,
        strokeColor: Int,
        onClick: () -> Unit,
    ): TextView = TextView(ctx).apply {
        text = label
        textSize = 11f
        setTextColor(Color.parseColor(textColorHex))
        setPadding(dp(9), dp(4), dp(9), dp(4))
        layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            rightMargin = dp(5)
        }
        background = GradientDrawable().apply {
            cornerRadius = 999f
            setColor(bgColor)
            setStroke(dp(1), strokeColor)
        }
        setOnClickListener { onClick() }
    }
}
