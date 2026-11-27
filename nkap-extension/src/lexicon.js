/**
 * LEXIQUE VERROUILLÉ — le seul fichier qui autorise un remplacement de texte DOM.
 *
 * RÈGLES D'OR (règlement SAFINUM §9 + contrat d'intégrité) :
 * 1. Aucun nœud contenant un chiffre n'est JAMAIS modifié (`hasDigits` = garde-fou absolu :
 *    montants, frais, numéros de compte, numéros de téléphone et références restent 100 % intacts).
 * 2. L'original (français ou anglais) est préservé dans `data-nkap-orig` → restauration instantanée ET
 *    résolution de cibles (`NKAP_QUERY`) insensible à la langue active.
 * 3. Couvre les libellés FR et EN des 5 étapes de `safinum.cm/hackathon-test`
 *    (Solde, Frais, Bénéficiaire, Récapitulatif, Confirmation + Erreurs + Sécurité).
 */

window.NKAP_LEXICON = {
  version: 3,
  entries: [
    // ── En-tête & Navigation (Stepper) ──
    { fr: "Banque en ligne", en: "Online banking", dua: "Ndabo a moni o муссо", ewo: "Nkwap", status: "validated", key: "online_bank" },
    { fr: "Solde", en: "Balance", dua: "Edia", ewo: "Nděn", status: "validated", key: "step_balance" },
    { fr: "Frais", en: ["Fees", "Fee"], dua: "Mususedi", ewo: "Mbug", status: "validated", key: "step_fees" },
    { fr: "Bénéficiaire", en: "Beneficiary", dua: "Mukusedi", ewo: "Nyi á nɔŋ", status: "validated", key: "step_beneficiary" },
    { fr: "Récapitulatif", en: "Summary", dua: "Kotele", ewo: "Ntolán", status: "validated", key: "step_recap" },
    { fr: "Confirmation", en: "Confirmation", dua: "Bamse", ewo: "Yemban", status: "validated", key: "step_confirm" },

    // ── Écran 1 : Compte & Solde (Bloc 1 validé NSIA / Maylis + lexique manuscrit Duálá) ──
    { fr: "Votre compte", en: "Your account", dua: "Konto ango", ewo: "Nkwap woué", status: "validated", key: "your_account" },
    { fr: "Bonjour, Amina", en: "Hello, Amina", dua: "Idiba bwam, Amina", ewo: "Mbə̀mbə̀ kírí, Amina", status: "validated", key: "hello_amina" },
    { fr: "Bonjour", en: "Hello", dua: "Idiba bwam", ewo: "Mbə̀mbə̀ kírí", status: "validated", key: "hello" },
    { fr: "Compte courant", en: "Current account", dua: "Konto ya pondi", ewo: "Bɔ́l á mɛlú", status: "demo", key: "current_account" },
    { fr: "Solde disponible", en: "Available balance", dua: "Moni ma peńe", ewo: "Itan ineu", status: "validated", key: "balance_label" },
    { fr: "Consultez votre solde et lancez un transfert en toute sécurité.", en: "Check your balance and start a secure transfer.", dua: "Ombwa moni mango pe loma moni na musango.", ewo: "Bebgeu itan o beleu ou lom moany voae.", status: "validated", key: "balance_hint" },
    { fr: "Numéro de compte", en: "Account number", dua: "Number benengedi ba mbolo", ewo: "Nombo nkwap", status: "validated", key: "account_number" },
    { fr: "Effectuer un transfert", en: "Make a transfer", dua: "Tombise mbolo", ewo: "Lomo moni", status: "validated", key: "do_transfer" },
    { fr: "Consulter les frais", en: "View fees", dua: "Jombwa mbolo", ewo: "Fombo itan ya yi wa tsig", status: "validated", key: "see_fees" },
    { fr: "Transactions récentes", en: "Recent transactions", dua: "Bebolo ba sukan", ewo: "Itang o nga kène nong itang ou dzali", status: "validated", key: "recent_tx" },
    { fr: "Dernières opérations", dua: "Bebolo ba sukan", ewo: "Itang o nga kène nong itang ou dzali", status: "validated", key: "recent_ops" },
    { fr: "Paiement marchand", en: "Merchant payment", dua: "Musawedi ma nyunga", ewo: "Maane", status: "validated", key: "tx_merchant" },
    { fr: "Salaire reçu", en: "Salary received", dua: "Kusa la musawedi", ewo: "I maane o bi", status: "validated", key: "tx_salary" },
    { fr: "Transfert reçu", en: "Transfer received", dua: "Kusa la betombedi", ewo: "Itan ineu nloman", status: "validated", key: "tx_transfer_in" },
    { fr: ["Facture électricité", "Facture d'électricité"], en: "Electricity bill", dua: "Dipapa la beturkan", ewo: "Ayaane mfiè", status: "validated", key: "tx_electricity" },
    { fr: "Facture d'eau", en: "Water bill", dua: "Dipapa la madiba", ewo: "Kalara mendim", status: "validated", key: "tx_water" },
    { fr: "Recharge téléphone", en: "Phone top-up", dua: "Londe la beboledi", ewo: "Kus kredi telefon", status: "validated", key: "tx_airtime" },
    { fr: "Retrait", en: "Withdrawal", dua: "Sumua", ewo: "Nong moni", status: "validated", key: "tx_withdrawal" },
    { fr: "Dépôt", en: "Deposit", dua: "Wele", ewo: "Bulu moni", status: "validated", key: "tx_deposit" },
    { fr: "Remboursement", en: "Refund", dua: "Timbisele", ewo: "Bulan moni", status: "validated", key: "tx_refund" },
    { fr: "Abonnement", en: "Subscription", dua: "Tidise", ewo: "Tidise", status: "validated", key: "tx_subscription" },

    // ── Carte latérale Sécurité (Bloc 1 validé NSIA / Maylis) ──
    { fr: "Sécurité", en: "Security", dua: "Musango", ewo: "Mebalan", status: "validated", key: "security_title" },
    { fr: "Vérifiez toujours le nom et le numéro du bénéficiaire avant de confirmer un transfert.", en: "Always verify the beneficiary name and number before confirming a transfer.", dua: "Jombwa la dina na number mutombwedi.", ewo: "Kèguè tône fombo dzoé ai number e mod wa lom moni ossussua eneu wa lom.", status: "validated", key: "security_hint" },
    { fr: "Connexion sécurisée", en: "Secure connection", dua: "Diwuta la musango", ewo: "Ewolo connexion", status: "validated", key: "secure_conn" },

    // ── Écran 2 : Frais de transfert ──
    { fr: "Frais de transfert", en: "Transfer fees", dua: "Mususedi mwa betombedi", ewo: "Mbug í nděn", status: "validated", key: "fees_header" },
    { fr: "Choisissez le type de transfert et le montant. Les frais sont calculés automatiquement.", en: "Choose the transfer type and amount. Fees are calculated automatically.", dua: "Pona njika loma na муtango. Mususedi mabolan muso.", ewo: "Lɔ́ mvet nděn, mbug á ɔwɔ́n lɛ́.", status: "demo", key: "transfer_hint" },
    { fr: "Type d'opération", en: "Operation type", dua: "Njika ebolo", ewo: "Mvet", status: "demo", key: "op_type" },
    { fr: "Compte Safinum", en: "Safinum account", dua: "Konto Safinum", ewo: "Bɔ́l Safinum", status: "demo", key: "op_safinum" },
    { fr: "Autre banque", en: "Other bank", dua: "Banki epepe", ewo: "Bɔ́l éfe", status: "demo", key: "op_other_bank" },
    { fr: "Transfert instantané et gratuit", en: "Instant, free transfer", dua: "Loma la dibokimene pe mususedi to mô", ewo: "Nděn nɛ́lɛ́, ɔ́ mbug lɛ́", status: "demo", key: "transfer_instant" },
    { fr: "Transfert standard", dua: "Loma la pondi", ewo: "Nděn ya mɛlú", status: "demo", key: "transfer_standard" },
    { fr: "Transfert express", dua: "Loma la ponda", ewo: "Nděn avól", status: "demo", key: "transfer_express" },
    { fr: "Montant à envoyer", en: "Amount to send", dua: "Musongi mwa muloloma", ewo: "Nděn tó", status: "validated", key: "amount_to_send" },
    { fr: "Gratuit", en: "Free", dua: "Mususedi to mô", ewo: "Zɛ́zɛ", status: "validated", key: "free_badge" },
    { fr: "Total à débiter", en: "Total to debit", dua: "Nje yese bangamene no o sumua", ewo: "Ntolán wɔ́g", status: "validated", key: "total_to_debit" },
    { fr: "Solde après opération", en: "Balance after transfer", dua: "Moni ma dia ombusa", ewo: "Nděn wɔ́g í bɔ́l á mvet", status: "demo", key: "balance_after" },
    { fr: "Retour", en: "Back", dua: "Timba", ewo: "Bulan", status: "validated", key: "btn_back" },
    { fr: "Continuer", en: "Continue", dua: "Wa la ne", ewo: "Kɛlɛ́ obúsú", status: "validated", key: "btn_continue" },

    // ── Écran 3 : Bénéficiaire ──
    { fr: "Renseignez les informations du destinataire. Vérifiez toujours le numéro avant de valider.", en: "Enter the recipient details. Always verify the number before confirming.", dua: "Tila myango ma mukusedi. Jombwa number oboso ba bamse.", ewo: "Bɔ́l nem á lɔ́n, ɛlɛ́ɛ́ kɛ́.", status: "demo", key: "recipient_hint" },
    { fr: "Ce bénéficiaire n'a jamais été utilisé sur ce compte. Vérifiez le numéro avant de continuer.", en: "This beneficiary has never been used on this account. Verify the number before continuing.", dua: "Nu mutombwedi a si bolane o konto. Jombwa number oboso ba ala.", ewo: "Nyi nyɔ́ a ngenan tekeulan. Fombɔ́k nɔ́mbɔ.", status: "demo", key: "new_benef_warn" },
    { fr: "Nom du bénéficiaire", en: "Beneficiary name", dua: "Dina la mutombwedi", ewo: "Nem á nyi", status: "validated", key: "benef_name" },
    { fr: "Numéro de téléphone", en: "Phone number", dua: "Number ebelane", ewo: "Nem tɛlɛfɔ́n", status: "validated", key: "benef_phone" },
    { fr: "Motif du transfert", en: "Transfer reason", dua: "Nyoma betombedi", ewo: "Sɔ́n nděn", status: "validated", key: "transfer_reason" },
    { fr: "Note (optionnel)", en: "Note (optional)", dua: "Mwendi (o tondi te)", ewo: "Efíá", status: "demo", key: "note_opt" },
    { fr: "J'ai vérifié le nom et le numéro du bénéficiaire.", en: "I have verified the beneficiary name and phone number.", dua: "Na ombwe dina na number mutombwedi.", ewo: "Nɛ́lɛ nem á nyi.", status: "demo", key: "benef_checked" },

    // ── Écran 4 : Récapitulatif ──
    { fr: "Vérifiez les informations avant de confirmer le transfert.", en: "Check the details before confirming the transfer.", dua: "Sele jombwa miango mese to denga wa bamse.", ewo: "Ɛlɛ́ɛ́ kɛ́, zɔ́ bɔ́l.", status: "validated", key: "verify_hint" },
    { fr: "Montant", en: "Amount", dua: "Musongi", ewo: "Nděn", status: "validated", key: "label_amount" },
    { fr: "Total débité", en: "Total debited", dua: "Musongi mu londi", ewo: "Ntolán", status: "validated", key: "label_total_debited" },
    { fr: "Téléphone", en: "Phone", dua: "Number ebelane", ewo: "Tɛlɛfɔ́n", status: "validated", key: "label_phone" },
    { fr: "Référence", en: "Reference", dua: "Epasi", ewo: "Nɔ́mbɔ ndem", status: "validated", key: "label_ref" },
    { fr: "Opération", en: "Operation", dua: "Ebolo", ewo: "Mvet", status: "demo", key: "label_op" },
    { fr: "Motif", dua: "Nyoma", ewo: "Sɔ́n", status: "validated", key: "label_reason" },
    { fr: "Je confirme que les informations ci-dessus sont correctes.", en: "I confirm the information above is correct.", dua: "Na bamse na miango ma tenge.", ewo: "Me yemban ná mam mese me ne mbɛn.", status: "demo", key: "confirm_checkbox" },
    { fr: "Modifier", en: "Edit", dua: "Tukwa", ewo: "Tyendé", status: "validated", key: "btn_edit" },
    { fr: "Confirmer le transfert", en: "Confirm transfer", dua: "Bamse", ewo: "Yemban nděn", status: "validated", key: "btn_confirm_transfer" },
    { fr: "Annuler", en: "Cancel", dua: "Sumua", ewo: "Vaa", status: "validated", key: "btn_cancel" },
    { fr: "Réessayer", en: "Try again", dua: "Kekise pete", ewo: "Kele ko", status: "validated", key: "btn_retry" },
    { fr: "Télécharger le reçu", en: "Download receipt", dua: "Sane la dipapa", ewo: "Nong kalara", status: "validated", key: "btn_download_receipt" },
    { fr: "Aide", en: "Help", dua: "Jongwane", ewo: "Vol", status: "validated", key: "btn_help" },

    // ── Écran 5 : Reçu / Confirmation ──
    { fr: ["Transfert effectué", "Transfert confirmé"], en: "Transfer completed", dua: "Loma dibamsebe", ewo: "Nděn é kɛ́ya", status: "demo", key: "receipt_title" },
    { fr: ["Votre transfert a été envoyé avec succès.", "Votre opération a été enregistrée avec succès."], en: "Your transfer has been sent successfully.", dua: "Ebolo ango e tilabe na bwam.", ewo: "Mvet wɔ́g ó tiliban mbɛn.", status: "demo", key: "receipt_sub" },
    { fr: "Nouveau solde disponible", dua: "Moni ma peńe ma dia", ewo: "Nděn mfefé í bɔ́l", status: "demo", key: "receipt_new_balance" },
    { fr: "Nouveau transfert", en: "New transfer", dua: "Loma dipepe", ewo: "Nděn mfefé", status: "demo", key: "btn_new_transfer" },
    { fr: "Retour à l'accueil", dua: "Timba o bekombo", ewo: "Bulan á ndá", status: "demo", key: "btn_back_home" },

    // ── Bannières d'erreurs & Contenu inédit (P5 / Jury) ──
    { fr: "Une erreur est survenue", en: "An error occurred", dua: "Njom e bodi", ewo: "Ékop é kuiya", status: "demo", key: "err_header" },
    { fr: "Solde insuffisant pour effectuer ce transfert.", en: "Insufficient balance for this transfer.", dua: "Moni ma si kolisane o bola loma.", ewo: "Nděn ɔ́g bɔ́l, ɔ́ sɔ́k lɛ́.", status: "demo", key: "err_balance" },
    { fr: "Solde insuffisant", en: "Insufficient balance", dua: "Moni ma si kolisane", ewo: "Nděn ɔ́g bɔ́l", status: "demo", key: "err_balance_short" },
    { fr: "Alerte de sécurité", en: "Security warning", dua: "Bediedi ba musango", ewo: "Měbɛndé m'ékálí", status: "demo", key: "alert_header" },
    { fr: "Alerte de sécurité : vérifiez le numéro du bénéficiaire avant de continuer.", en: "Security warning: verify the beneficiary phone number before continuing.", dua: "Bediedi ba musango : ombwa nimero ya mukusa oboso ba ala.", ewo: "Ɛlɛ́ɛ́ nem tɛlɛfɔ́n, ɔ́ bɔ́l.", status: "demo", key: "alert_phone" },
    { fr: "Vérifiez le numéro du bénéficiaire avant de continuer.", en: "Verify the beneficiary phone number before continuing.", dua: "Ombwa nimero ya mukusa oboso ba ala.", ewo: "Bɛ́gɛ̌ nem tɛlɛfɔ́n mɔt ô bɛsú.", status: "demo", key: "alert_phone_body" },
    { fr: "Ne partagez jamais votre code secret. Un agent ne vous le demandera pas.", dua: "O si langwea moto kode ango ya dimbambe.", ewo: "Te ve mɔt kode wɔ́g ya nsolán.", status: "demo", key: "err_pin_warn" },
    { fr: "Erreur réseau", en: "Network error", dua: "Njom a singi", ewo: "Ɛ́vúdú á nsíŋgi", status: "demo", key: "err_network_short" },
    { fr: "Erreur réseau : le service est temporairement indisponible. Réessayez.", en: "Network error: the service is temporarily unavailable. Please try again.", dua: "Njom a singi : kekise peńe.", ewo: "Ɛ́vúdú á nsíŋgi. Lɔ́ kɔ́.", status: "demo", key: "err_network" },
    { fr: "Le service est temporairement indisponible. Réessayez.", en: "The service is temporarily unavailable. Please try again.", dua: "Ebolo e si ma-babe tatan. Kekise peńe.", ewo: "Isáɛ é sě bɛ́n. Lɔ́ kɔ́.", status: "demo", key: "err_network_body" },
    { fr: "Message important", en: "Important message", dua: "Mwendi ma mweńa", ewo: "Efíá é ne mfi", status: "demo", key: "unseen_header" },
  ],

  /** true si l'entrée peut remplacer le texte affiché. */
  isUsable: (e) => e.status === "validated" || e.status === "demo",

  /** Garde-fou intégrité : un texte contenant un chiffre n'est jamais remplacé. */
  hasDigits: (s) => /\d/.test(s),

  /** Tous les libellés source (FR + EN) d'une entrée. */
  sourceForms: function (entry) {
    const out = [];
    const push = (v) => {
      if (Array.isArray(v)) v.forEach((x) => x && out.push(x));
      else if (v) out.push(v);
    };
    push(entry.fr);
    push(entry.en);
    return out;
  },

  /** Forme française canonique d'une entrée. */
  canonicalFr: (entry) => (Array.isArray(entry.fr) ? entry.fr[0] : entry.fr) || "",

  /** Trouve l'entrée correspondant EXACTEMENT au texte d'un nœud (FR ou EN). */
  exactMatch: function (text) {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || this.hasDigits(t)) return null; // garde-fou montants
    const lower = t.toLowerCase();
    return (
      this.entries.find(
        (e) =>
          this.isUsable(e) &&
          this.sourceForms(e).some((f) => f.toLowerCase() === lower)
      ) || null
    );
  },
};
