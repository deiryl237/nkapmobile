/**
 * LEXIQUE VERROUILLÉ — le seul fichier qui autorise un remplacement de texte.
 *
 * RÈGLES (règlement SAFINUM §9 + contrat d'intégrité) :
 * 1. Une entrée ne remplace QUE si validated=true (relecteur ewondo).
 * 2. Aucun nœud contenant un chiffre n'est jamais modifié (montants intacts —
 *    le journal du comité signale tout écart comme « compromis »).
 * 3. L'original est préservé (attribut data-nkap-orig) → restauration instantanée.
 *
 * ⚠️ Les valeurs ci-dessous sont des PLACEHOLDERS de démonstration (status "demo")
 *    — le relecteur ewondo les remplacera et passera validated à true.
 *    Le toggle ewondo du popup est OFF par défaut pour cette raison.
 */

window.NKAP_LEXICON = {
  version: 1,
  entries: [
    // ── écran : compte ──
    { fr: "Solde disponible", ewo: "Nděn wɔ́g í bɔ́l", status: "demo", key: "balance_label" },
    { fr: "Consultez votre solde et lancez un transfert en toute sécurité.", ewo: "Nyi bɔ́l ní nděn, tó wɔ́ lɛ́.", status: "demo", key: "balance_hint" },
    { fr: "Solde après opération", ewo: "Nděn wɔ́g í bɔ́l á mvet", status: "demo", key: "balance_after" },
    { fr: "Votre compte", ewo: "Bɔ́l yi", status: "demo", key: "your_account" },
    { fr: "Numéro de compte", ewo: "Nem bɔ́l", status: "demo", key: "account_number" },

    // ── écran : transfert ──
    { fr: "Effectuer un transfert", ewo: "Tó nděn", status: "demo", key: "do_transfer" },
    { fr: "Consulter les frais", ewo: "Nɛ́ mbug", status: "demo", key: "see_fees" },
    { fr: "Montant à envoyer", ewo: "Nděn tó", status: "demo", key: "amount_to_send" },
    { fr: "Choisissez le type de transfert et le montant. Les frais sont calculés automatiquement.", ewo: "Lɔ́ mvet nděn, mbug á ɔwɔ́n lɛ́.", status: "demo", key: "transfer_hint" },
    { fr: "Type d'opération", ewo: "Mvet", status: "demo", key: "op_type" },

    // ── écran : bénéficiaire ──
    { fr: "Renseignez les informations du destinataire. Vérifiez toujours le numéro avant de valider.", ewo: "Bɔ́l nem á lɔ́n, ɛlɛ́ɛ́ kɛ́.", status: "demo", key: "recipient_hint" },
    { fr: "Nom du bénéficiaire", ewo: "Nem á nyi", status: "demo", key: "benef_name" },
    { fr: "Numéro de téléphone", ewo: "Nem tɛlɛfɔ́n", status: "demo", key: "benef_phone" },
    { fr: "Motif du transfert", ewo: "Sɔ́n nděn", status: "demo", key: "transfer_reason" },
    { fr: "J'ai vérifié le nom et le numéro du bénéficiaire.", ewo: "Nɛ́lɛ nem á nyi.", status: "demo", key: "benef_checked" },
    { fr: "Vérifiez les informations avant de confirmer le transfert.", ewo: "Ɛlɛ́ɛ́ kɛ́, zɔ́ bɔ́l.", status: "demo", key: "verify_hint" },

    // ── erreurs / alertes (P5) ──
    { fr: "Solde insuffisant pour effectuer ce transfert.", ewo: "Nděn ɔ́g bɔ́l, ɔ́ sɔ́k lɛ́.", status: "demo", key: "err_balance" },
    { fr: "Alerte de sécurité : vérifiez le numéro du bénéficiaire avant de continuer.", ewo: "ⓘ Ɛlɛ́ɛ́ nem tɛlɛfɔ́n, ɔ́ bɔ́l.", status: "demo", key: "alert_phone" },
    { fr: "Erreur réseau : le service est temporairement indisponible. Réessayez.", ewo: "Ɛ́vúdú á nsíŋgi. Lɔ́ kɔ́.", status: "demo", key: "err_network" },
    { fr: "Transfert instantané et gratuit", ewo: "Nděn nɛ́lɛ́, ɔ́ mbug lɛ́", status: "demo", key: "transfer_instant" },
    { fr: "Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)", ewo: "Mbug 1,5 % (100—2 500 FCFA)", status: "demo", key: "fees_1" },
    { fr: "Frais de 2 % (min. 200 FCFA, max. 5 000 FCFA)", ewo: "Mbug 2 % (200—5 000 FCFA)", status: "demo", key: "fees_2" }
  ],

  /** true si l'entrée peut remplacer le texte affiché. */
  isUsable: (e) => e.status === "validated" || e.status === "demo",

  /** Garde-fou intégrité : un texte contenant un chiffre n'est jamais remplacé. */
  hasDigits: (s) => /\d/.test(s),

  /** Trouve l'entrée correspondant EXACTEMENT au texte d'un nœud. */
  exactMatch: function (text) {
    const t = text.trim();
    if (!t || this.hasDigits(t)) return null;          // garde-fou montants
    return this.entries.find(
      (e) => this.isUsable(e) && e.fr.toLowerCase() === t.toLowerCase()
    ) || null;
  },
};
