/**
 * content.js — M4-web : Extraction du contexte DOM, résolution de cibles et traduction locale
 *
 * Calibré sur l'environnement officiel https://safinum.cm/hackathon-test :
 * - Gère les boutons contenant des icônes SVG (<button><svg/> Texte</button>)
 * - Résout les paires Libellé → Valeur (`NKAP_QUERY_VALUE_OF`) pour les lignes
 *   de Frais, Total à débiter, Solde après opération, Récapitulatif (<dt>/<dd>) et Reçu
 * - Détecte l'écran actif (1 Solde, 2 Frais, 3 Bénéficiaire, 4 Récapitulatif, 5 Confirmation)
 *   ainsi que les bannières d'erreur et de contenu inédit injecté par le jury
 * - Nettoie automatiquement les marques quand l'utilisateur change d'étape
 */

(function () {
  if (
    document.documentElement?.hasAttribute("data-nkap-standalone") ||
    document.querySelector('meta[name="nkap-standalone"]')
  ) {
    return;
  }
  if (window.__NKAP_CONTENT__) return;
  window.__NKAP_CONTENT__ = true;

  const hasChrome = typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
  let langOn = false;
  let lastStep = null;
  const restoredTextNodes = new Map(); // TextNode → string original

  const OVERLAY_SEL =
    "#nkap-overlay-host, #nkap-caption, #nkap-bubble, #nkap-cursor, #nkap-cursor-buddy, #nkap-status-pill, #nkap-question-panel, #nkap-notebook";

  const DEFAULT_SANDBOX_BRAIN_URL = "https://13.51.168.107.sslip.io";

  /** True sur le bac à sable officiel SAFINUM (/sandbox/ussd, /sandbox/channel/web, /sandbox/channel/mobile). */
  function isSafinumSandbox() {
    return /^\/sandbox(\/|$)/i.test(location.pathname || "");
  }

  /** True sur le simulateur USSD texte seul (où l'orbe visuel flottant Nkap ne doit jamais apparaître). */
  function isSafinumUssd() {
    return /^\/sandbox\/ussd(\/|$)/i.test(location.pathname || "");
  }

  let lastKnownPath = location.pathname || "";

  function syncUssdOrbVisibility() {
    const bubble = document.getElementById("nkap-bubble");
    const host = document.getElementById("nkap-overlay-host");
    if (isSafinumUssd()) {
      window.NKAP_ASSISTANT?.closePanel?.();
      window.NKAP_ASSISTANT?.onScreenChanged?.("ussd");
      if (bubble) bubble.style.display = "none";
      if (host) host.style.display = "none";
      return false;
    }
    if (host) host.style.display = "";
    if (bubble) {
      bubble.style.display = "";
    } else {
      window.NKAP_OVERLAY?.bubble?.(() => window.NKAP_ASSISTANT?.next());
    }
    return true;
  }

  function detectSandboxChannel() {
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("/sandbox/channel/mobile")) return "mobile";
    if (p.includes("/sandbox/ussd")) return "ussd";
    return "web";
  }

  /**
   * Isole le conteneur DOM de la seule appli bancaire simulée dans safinum.cm/sandbox/*
   * (exclut les panneaux Équipe, Compte de test, Lecture vocale et Diagnostics).
   */
  function getSandboxAppRoot() {
    if (!isSafinumSandbox()) return null;
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("/sandbox/channel/mobile")) {
      return (
        document.querySelector('[class*="rounded-[1.8rem]"]') ||
        document.querySelector('[class*="rounded-[2.5rem]"]')
      );
    }
    if (p.includes("/sandbox/ussd")) {
      const scr = document.querySelector('[class*="bg-emerald-950"]');
      return (scr && scr.closest('[class*="rounded-[2rem]"]')) || scr || null;
    }
    if (p.includes("/sandbox/channel/web")) {
      const SIDEBAR_CTRL_RE = /Lecture vocale|Diagnostics de traduction|Nouvelle session|Langue annoncée/i;
      const addrEl = Array.from(document.querySelectorAll("div, span, p")).find(
        (el) =>
          !el.querySelector("div, section, main, article, header, aside") &&
          /banque-demo\.sandbox/i.test(el.textContent || "")
      );
      if (addrEl) {
        let cur = addrEl.parentElement;
        for (let i = 0; i < 8 && cur && cur !== document.body; i++, cur = cur.parentElement) {
          const r = cur.getBoundingClientRect();
          if (r.width >= 420 && r.height >= 280 && !SIDEBAR_CTRL_RE.test(cur.textContent || "")) {
            return cur;
          }
        }
      }
      const bankTitle = Array.from(document.querySelectorAll("div, span, h1, h2, h3, p")).find(
        (el) =>
          !el.querySelector("div, section, main") &&
          /Banque d[ée]mo/i.test(el.textContent || "")
      );
      if (bankTitle) {
        let cur = bankTitle.parentElement;
        for (let i = 0; i < 8 && cur && cur !== document.body; i++, cur = cur.parentElement) {
          const r = cur.getBoundingClientRect();
          if (r.width >= 420 && r.height >= 280 && !SIDEBAR_CTRL_RE.test(cur.textContent || "")) {
            return cur;
          }
        }
      }
      const grid = document.querySelector("main .grid, .grid");
      if (grid) {
        for (const child of grid.children) {
          const r = child.getBoundingClientRect();
          const txt = child.textContent || "";
          if (r.width >= 420 && r.height >= 280 && !SIDEBAR_CTRL_RE.test(txt) && txt.trim().length > 10) {
            return child;
          }
        }
      }
    }
    return null;
  }

  function getScanRoot() {
    return getSandboxAppRoot() || document.body;
  }

  function isSandboxChromeDecor(el) {
    if (!el || !isSafinumSandbox()) return false;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/^banque-demo\.sandbox/i.test(t)) return true;
    if (/^(09:41|4G|5G|Wi-?Fi)$/i.test(t)) return true;
    return false;
  }

  /** Convertit les 89 textes officiels Ewondo/Duálá du bac à sable en français pour le cerveau (sans jamais modifier le DOM). */
  const SANDBOX_LOCAL_TO_FR = {
    "nda": "Accueil",
    "mboa": "Accueil",
    "botea": "Accueil",
    "lomo": "Transfert",
    "loma": "Transfert",
    "yaan": "Payer",
    "sawedi": "Payer",
    "sawa": "Payer",
    "itang": "Historique",
    "bebolo": "Historique",
    "miango": "Historique",
    "misongi": "Historique",
    "itan ineu": "Solde disponible",
    "moni ma pene": "Solde disponible",
    "ekotedi": "Solde disponible",
    "edia": "Solde",
    "za dzam wa yi bo?": "Que voulez-vous faire ?",
    "nje o tondi bola?": "Que voulez-vous faire ?",
    "wa pula bola nje ?": "Que voulez-vous faire ?",
    "lomo moni": "Envoyer de l'argent",
    "loma moni": "Envoyer de l'argent",
    "tombise mbolo": "Effectuer un transfert",
    "yaan mfie ai kalara": "Payer une facture",
    "sawedi kalati": "Payer une facture",
    "sawa la moni": "Payer une facture",
    "kus kredi telefon": "Acheter du crédit",
    "ande kredi telefone": "Acheter du crédit",
    "djanda la mudi": "Acheter du crédit",
    "londe la beboledi": "Acheter du crédit",
    "itang mvet yam": "Mes opérations",
    "bebolo bam": "Mes opérations",
    "itang o nga kene nong": "Dernières opérations",
    "bebolo ba sukan": "Dernières opérations",
    "fombo mese": "Tout voir",
    "ombwa mese": "Tout voir",
    "miango mese": "Tout voir",
    "misongi mese": "Tout voir",
    "ewolo connexion": "Connexion sécurisée",
    "diwuta la musango": "Connexion sécurisée",
    "kui": "Déconnexion",
    "busa": "Déconnexion",
    "wog": "Écouter",
    "senga": "Écouter",
    "tele wog": "Arrêter la lecture",
    "tele senga": "Arrêter la lecture",
    "embe": "Arrêter la lecture",
    "telame": "Chargement",
    "e maneya": "Confirmé",
    "e bodi": "Confirmé",
    "di tombi bwam": "Effectuée",
    "e vaban": "Annulé",
    "e bukabe": "Annulé",
    "a bangi": "Annulée",
    "e ne a yange": "En attente",
    "e ma-enge": "En attente",
    "jenguele": "En attente",
    "e nji bo": "Échoué",
    "e bobi": "Échoué",
    "kem": "Échouée",
    "mod a non": "Bénéficiaire",
    "mod a non moni": "Bénéficiaire",
    "mukusa": "Bénéficiaire",
    "mukusedi": "Bénéficiaire",
    "mutombwedi": "Bénéficiaire",
    "itan": "Montant",
    "moni": "Montant",
    "musongi": "Montant",
    "mbug": "Frais",
    "mabala": "Frais",
    "musen": "Frais",
    "mususedi": "Frais",
    "ntolan wog": "Total à débiter",
    "botali ba busa": "Total à débiter",
    "musongi mu londi": "Total à débiter",
    "itan e li'i": "Solde après opération",
    "moni ombusa": "Solde après opération",
    "itan mfefe": "Nouveau solde",
    "moni ma pene ma dia": "Nouveau solde",
    "epetele": "Nouveau solde",
    "kwese": "Terminer",
    "fombo ossussua eneu wa yemban": "Vérifiez avant de confirmer",
    "ombwa oboso ba bamse": "Vérifiez avant de confirmer",
    "sele jombwa miango mese to denga wa bamse": "Vérifiez avant de confirmer",
    "kotele": "Récapitulatif",
    "yemban": "Confirmer",
    "bamse": "Confirmer",
    "tyende": "Modifier",
    "tukwa": "Modifier",
    "vaa": "Annuler",
    "buka": "Annuler",
    "esele": "Annuler",
    "essele": "Annuler",
    "sumua": "Annuler",
    "bulan": "Retour",
    "timba": "Retour",
    "kele obusu": "Continuer",
    "ala oboso": "Continuer",
    "wa la ne": "Continuer",
    "itang mvet": "Historique des opérations",
    "mvet o boban mben": "Opération réussie",
    "ebolo e tilabe na bwam": "Opération réussie",
    "nombo ndem": "Référence",
    "edun": "Référence",
    "epasi": "Référence",
    "bot bam ba non moni": "Mes bénéficiaires",
    "bakusa bam": "Mes bénéficiaires",
    "bakuse moni": "Mes bénéficiaires",
    "nombo telefon nge dzoe": "Numéro de téléphone ou nom",
    "number musinga to dina longo": "Numéro de téléphone ou nom",
    "number ebelane": "Numéro de téléphone",
    "nombo ya lomo kredi": "Numéro à recharger",
    "tob isae": "Choisir le service",
    "poso": "Choisir le service",
    "nsaa telefon": "Opérateur téléphone",
    "miiyo": "Opérateur",
    "te ke mvet a tatan.": "Aucune opération pour le moment.",
    "to ebolo tatan.": "Aucune opération pour le moment.",
    "to lambo": "Aucune opération pour le moment.",
    "ayaane mfie": "Électricité (ENEO)",
    "kalati a weya": "Électricité (ENEO)",
    "dipapa la beturkan": "Électricité (ENEO)",
    "mendim": "Eau (CAMWATER)",
    "madiba": "Eau (CAMWATER)",
    "dipapa la madiba": "Eau (CAMWATER)",
    "elimb'a dikalo": "Télévision (Canal+)",
    "kredi": "Crédit téléphone",
    "ebale": "Crédit",
    "kalara": "Facture",
    "kalati": "Facture",
    "musawedi": "Factures",
    "mese": "Tout",
    "bi bi": "Entrants",
    "ma-poy": "Entrants",
    "moni mu mingeye": "Entrants",
    "bi lom": "Sortants",
    "ma-ala": "Sortants",
    "moni mu mabuse": "Sortants",
    "kusa la moni": "Retrait",
  };

  function sandboxPhraseToFr(rawText) {
    const clean = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const n = norm(clean);
    if (SANDBOX_LOCAL_TO_FR[n]) return SANDBOX_LOCAL_TO_FR[n];
    let m;
    if ((m = clean.match(/^Mbembe kiri\s+(.+)$/i))) return `Bonjour ${m[1]}`;
    if ((m = clean.match(/^(?:Idiba bwam|Mbole)\s+(.+)$/i))) return `Bonjour ${m[1]}`;
    if ((m = clean.match(/^(?:Nkwap|Konto|Bekotedi)\s+(\d[\d\s]+)$/i))) return `Compte ${m[1]}`;
    if ((m = clean.match(/^(?:Bi lom a|Loma na|Lomea|Loma la betombedi)\s+(.+)$/i))) return `Transfert vers ${m[1]}`;
    if ((m = clean.match(/^(?:Bi bi a|Kusa na|Moni mwa|Kusa la betombedi)\s+(.+)$/i))) return `Reçu de ${m[1]}`;
    if ((m = clean.match(/^(?:Kredi|Ekotedi mwa musinga|Londe la beboledi)\s+(.+)$/i))) return `Crédit ${m[1]}`;
    if ((m = clean.match(/^(?:Kalara|Kalati|Sawa la)\s+(.+)$/i))) return `Facture ${m[1]}`;
    if ((m = clean.match(/^(?:Mbug|Mabala|Musen|Mususedi)\s*:\s*(.+)$/i))) return `Frais : ${m[1]}`;
    if ((m = clean.match(/^Miiyo\s*:\s*(.+)$/i))) return `Opérateur détecté : ${m[1]}`;
    if ((m = clean.match(/^Moni mud[èe]n[èe]\s*:\s*(.+)$/i))) return `Jusqu'à ${m[1]} par opération`;
    if ((m = clean.match(/^Akui\s+(.+?)\s+a\s+mvet\s+wuo$/i))) return `Jusqu'à ${m[1]} par opération`;
    if ((m = clean.match(/^Tena\s+(.+?)\s+o\s+ebolo\s+ewo$/i))) return `Jusqu'à ${m[1]} par opération`;
    return clean;
  }

  /** Normalise : minuscules, sans accents/diacritiques, voyelles africaines et homoglyphes unifiés. */
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[ɔ]/g, "o")
      .replace(/[ɛ]/g, "e")
      .replace(/[ŋ]/g, "n")
      .replace(/а/g, "a")
      .replace(/е/g, "e")
      .replace(/о/g, "o")
      .replace(/р/g, "p")
      .replace(/с/g, "c")
      .replace(/у/g, "y")
      .replace(/х/g, "x")
      .replace(/м/g, "m")
      .replace(/т/g, "t")
      .replace(/к/g, "k")
      .replace(/\s+/g, " ")
      .trim();

  /** Un élément est visible et hors de notre propre overlay / panneau jury. */
  function isVisibleTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest(OVERLAY_SEL) || el.closest("[data-nkap]")) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "svg" || tag === "path") return false;
    if (el.offsetParent === null && window.getComputedStyle(el).position !== "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  /** True si l'élément est à l'intérieur du tiroir outil interne jury Safinum. */
  function isJuryDrawer(el) {
    if (!el) return false;
    const pane = el.closest("aside, .fixed, [class*='overflow-y']");
    return !!(
      pane &&
      /Outil interne Safinum|DÉCLENCHER UNE ERREUR|INJECTER DU CONTENU INÉDIT|Safinum internal tool|Trigger an error|Inject unseen content/i.test(
        pane.textContent || ""
      )
    );
  }

  /** True si l'élément fait partie du bandeau jaune d'environnement de test tout en haut de Safinum. */
  function isTestBanner(el) {
    if (!el) return false;
    let cur = el;
    for (let depth = 0; depth < 5 && cur && cur !== document.body; depth++, cur = cur.parentElement) {
      const r = cur.getBoundingClientRect();
      if (r.height > 0 && r.height <= 85 && r.top <= 45) {
        const t = (cur.textContent || "").trim();
        if (/Environnement de test\s*[—–-]\s*données fictives|Protocole de test/i.test(t)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Un élément fait partie du contenu lisible (exclut le stepper <ol>, <nav>, <footer>, le tiroir jury et le bandeau test). */
  function isMainTarget(el) {
    if (!isVisibleTarget(el)) return false;
    const sbxRoot = getSandboxAppRoot();
    if (sbxRoot) {
      if (!sbxRoot.contains(el)) return false;
      if (isSandboxChromeDecor(el)) return false;
      return true;
    }
    if (el.closest("ol, nav, footer")) return false;
    if (isJuryDrawer(el) || isTestBanner(el)) return false;
    return true;
  }

  /**
   * Un élément est un bloc de texte atomique ciblable s'il n'a pas d'enfants
   * sous-blocs de texte (on autorise les enfants purement graphiques comme <svg>).
   */
  function isTextAtom(el) {
    if (!isVisibleTarget(el)) return false;
    for (const child of el.children) {
      const cTag = child.tagName.toLowerCase();
      if (cTag !== "svg" && cTag !== "img" && cTag !== "br") {
        return false;
      }
    }
    return el.textContent.trim().length >= 2;
  }

  /** Texte original (français) d'un élément ou son texte courant. */
  function origOrCurrentText(el) {
    if (!el) return "";
    return (el.getAttribute("data-nkap-orig") || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  /** Premier nœud texte direct d'un élément (ex: "Frais " dans <span>Frais <span>Gratuit</span></span>). */
  function directText(el) {
    if (!el) return "";
    let out = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        out += restoredTextNodes.get(n) || n.nodeValue;
      }
    }
    return out.trim();
  }

  function priorityScore(el, exactMatch) {
    let score = 0;
    if (exactMatch) score += 100;
    if (el.closest("section")) score += 50; // Zone principale de safinum.cm
    if (el.closest("aside")) score -= 60;   // Sidebar secondaire ou panneau jury
    const tag = el.tagName.toLowerCase();
    if (tag === "button" || tag === "a") score += 15;
    score -= Math.min(30, el.textContent.trim().length * 0.2);
    return score;
  }

  // ---- 1. Couche de traduction locale (TreeWalker respectueux des SVG) -----

  function translateTextNode(textNode) {
    // Sur le bac à sable officiel SAFINUM (/sandbox/*), la traduction écrite est déjà assurée par POST /sandbox (zéro conflit).
    if (isSafinumSandbox()) return false;
    if (!langOn || !window.NKAP_LEXICON) return false;
    const parent = textNode.parentElement;
    if (!parent || !isVisibleTarget(parent)) return false;
    const tag = parent.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || parent.isContentEditable) {
      return false;
    }

    const raw = textNode.nodeValue || "";
    const trimmed = raw.trim();
    if (trimmed.length < 2) return false;
    if (window.NKAP_LEXICON.hasDigits(trimmed)) return false; // Règle d'or : montants intacts

    const entry = window.NKAP_LEXICON.exactMatch(trimmed);
    if (!entry) return false;

    // Ewondo est la langue principale du projet (fallback Douala si absent)
    const translated = entry.ewo || entry.dua;
    if (!translated) return false;

    if (!restoredTextNodes.has(textNode) || trimmed.toLowerCase() !== translated.toLowerCase()) {
      restoredTextNodes.set(textNode, raw);
      parent.setAttribute("data-nkap-orig", trimmed);
    }
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    textNode.nodeValue = lead + translated + trail;
    parent.setAttribute("data-nkap-translated", entry.key);
    return true;
  }

  function translateVisible(root = document.body) {
    if (isSafinumSandbox()) return 0;
    if (!root || !langOn) return 0;
    let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const tn of nodes) {
      if (translateTextNode(tn)) count++;
    }
    return count;
  }

  function restoreAll() {
    restoredTextNodes.forEach((orig, textNode) => {
      try {
        textNode.nodeValue = orig;
        if (textNode.parentElement) {
          textNode.parentElement.removeAttribute("data-nkap-translated");
          textNode.parentElement.removeAttribute("data-nkap-orig");
        }
      } catch (_) { }
    });
    restoredTextNodes.clear();
    if (window.NKAP_OVERLAY) window.NKAP_OVERLAY.clear();
  }

  // ---- 2. Détection de l'écran actif & des bannières (safinum.cm + mock) ---

  function detectScreenState() {
    // 1. Détection via les marqueurs textuels et formulaires uniques de chaque étape
    const scopeRoot = getScanRoot();
    const bodyText = norm(scopeRoot ? scopeRoot.innerText : "");
    const origTexts = Array.from((scopeRoot || document).querySelectorAll("[data-nkap-orig]"))
      .map((el) => norm(el.getAttribute("data-nkap-orig")))
      .join(" ");
    const fullText = (bodyText + " " + origTexts).replace(/\s+/g, " ");

    let step = "home";

    // Étape 5 : Reçu / Confirmation (FR + EN + EWO + DUA)
    if (
      /transfert confirme|transfert effectue|operation reussie|operation a ete enregistree|nouveau transfert|nouveau solde|retour a l'accueil|transfer completed|your transfer has been sent successfully|new transfer|loma dibamsebe|ebolo ango e tilabe|timba o bekombo|loma dipepe|mvet o boban mben|ebolo e tilabe na bwam|itan mfefe|epetele|(?:essele|sumua)\. moni mu si lomabe/.test(fullText)
    ) {
      step = "receipt";
    }
    // Étape 4 : Récapitulatif avant confirmation (FR + EN + EWO + DUA)
    else if (
      /confirmer le transfert|verifiez avant de confirmer|verifiez les informations avant de confirmer|je confirme que les informations|total debite.*modifier|confirm transfer|check the details before confirming|check before you confirm|i confirm the information above|total debited|ombwa myango mese|na bamse na myango|bamse loma|fombo ossussua eneu wa yemban|ombwa oboso ba bamse|sele jombwa miango mese|musongi mu londi|timba la mbusa si titi/.test(fullText) ||
      (window.NKAP_QUERY && (window.NKAP_QUERY("Confirmer le transfert") || window.NKAP_QUERY("Bamse loma")) && !window.NKAP_QUERY("Nom du bénéficiaire"))
    ) {
      step = isSafinumSandbox() ? "review" : "recap";
    }
    // Transfert / Bénéficiaire (FR + EN + EWO + DUA)
    else if (
      /nom du beneficiaire|renseignez les informations du destinataire|motif du transfert|j'ai verifie le nom et le numero|jai verifie le nom|beneficiary name|enter the recipient details|transfer reason|i have verified the beneficiary|dina la mukusa|tila myango ma mukusa|nimero a telefone|na ombwe dina na nimero|mes beneficiaires|bot bam ba non moni|bakusa bam|bakuse moni|jusqu'a 500 000|akui 500 000|moni mudene/.test(fullText) ||
      (window.NKAP_QUERY && (window.NKAP_QUERY("Nom du bénéficiaire") || window.NKAP_QUERY("Dina la mukusa") || window.NKAP_QUERY("Renseignez les informations du destinataire")))
    ) {
      step = isSafinumSandbox() ? "transfer" : "beneficiary";
    }
    // Historique des opérations (FR + EN + EWO + DUA) — AVANT Paiement pour éviter collision Facture/Crédit !
    else if (
      !/solde disponible|itan ineu|moni ma pene|available balance|que voulez-vous faire|za dzam wa yi bo|wa pula bola nje/.test(fullText) &&
      (/entrants.*sortants|sortants.*entrants|recus.*envoyes|bi bi.*bi lom|moni mu mingeye.*moni mu mabuse|incoming.*outgoing|historique des operations|itang mvet/.test(fullText))
    ) {
      step = "history";
    }
    // Paiement Crédit téléphonique (FR + EN + EWO + DUA)
    else if (
      !/solde disponible|itan ineu|moni ma pene|available balance/.test(fullText) &&
      (/numero a recharger|nombo ya lomo kredi|nimero ya kredi|number to top up|operateur detecte|nsaa a yenban|miiyo :|numb'a ngo/.test(fullText))
    ) {
      step = "pay_airtime";
    }
    // Paiement Facture (FR + EN + EWO + DUA)
    else if (
      !/solde disponible|itan ineu|moni ma pene|available balance/.test(fullText) &&
      (/choisir le service|tob isae|pona ebolo|choose the service|\bposo\b/.test(fullText))
    ) {
      step = "pay_bill";
    }
    // Étape 2 : Frais de transfert & Montant (legacy hackathon-test)
    else if (
      /frais de transfert|choisissez le type de transfert|type d'operation|montant a envoyer|transfer fees|choose the transfer type|operation type|amount to send|balance after transfer|mabala ma loma|moni ma loma|botali ba busa|moni ma dia ombusa/.test(fullText) ||
      (window.NKAP_QUERY && (window.NKAP_QUERY("Frais de transfert") || window.NKAP_QUERY("Mabála ma loma") || window.NKAP_QUERY("Montant à envoyer")))
    ) {
      step = "fees";
    }
    // Étape 1 : Solde & Accueil
    else {
      step = "home";
    }

    // Détection d'une bannière d'erreur / alerte critique active (hors boutons et panneau jury)
    const hasError = !!findActiveErrorBanner();

    // Détection d'un bloc de contenu inédit injecté (#injected-* ou "Message important" / "Important message")
    const hasUnseen =
      !!document.querySelector('[id^="injected-"]') ||
      !!window.NKAP_QUERY("Message important") ||
      !!window.NKAP_QUERY("Important message");

    return { step, hasError, hasUnseen };
  }

  window.NKAP_DETECT_SCREEN = detectScreenState;

  // ---- 3. MutationObserver (contenu inédit & changements d'étape Vue) ------

  /** Extrait le texte canonique (FR d'origine si déjà traduit) d'une bannière d'erreur. */
  function extractErrorKeyText(container) {
    if (!container) return "";
    const parts = [];
    container.querySelectorAll("*").forEach((el) => {
      if (el.children.length > 0) return;
      const t = (el.getAttribute("data-nkap-orig") || el.textContent || "").trim();
      if (t && !parts.includes(t)) parts.push(t);
    });
    if (!parts.length) {
      return (container.getAttribute("data-nkap-orig") || container.textContent || "").trim();
    }
    return parts.join(" — ").slice(0, 260);
  }

  /** Détecte une bannière d'erreur/alerte réelle hors boutons et hors tiroir interne jury. */
  function findActiveErrorBanner() {
    const candidates = [
      "Une erreur est survenue",
      "An error occurred",
      "Solde insuffisant pour effectuer ce transfert.",
      "Insufficient balance for this transfer.",
      "Le montant doit être supérieur à zéro.",
      "The amount must be greater than zero.",
      "Veuillez renseigner le nom et le numéro du bénéficiaire.",
      "Please provide the beneficiary name and phone number.",
      "Vous devez confirmer les informations avant de valider le transfert.",
      "You must confirm the details before validating the transfer.",
      "Alerte de sécurité",
      "Security warning",
      "Erreur réseau :",
      "Network error:",
      "Le service est temporairement indisponible. Réessayez.",
      "The service is temporarily unavailable. Please try again.",
    ];
    for (const phrase of candidates) {
      const target = phrase.toLowerCase();
      for (const el of document.querySelectorAll("body *")) {
        if (!isMainTarget(el) || !isTextAtom(el)) continue;
        if (el.closest("button")) continue;
        if (isJuryDrawer(el)) {
          continue;
        }
        const card = el.closest('[class*="border-"]');
        if (card && /border-emerald|bg-emerald|border-green|bg-green/i.test(card.className || "")) {
          continue;
        }
        const cur = (el.textContent || "").trim().toLowerCase();
        const orig = (el.getAttribute("data-nkap-orig") || "").trim().toLowerCase();
        if (cur.includes(target) || orig.includes(target)) {
          return (
            el.closest('[role="alert"], [class*="border-red"], [class*="bg-red"], [class*="border-amber"], .rounded-xl, .rounded-lg') ||
            el.parentElement ||
            el
          );
        }
      }
    }
    return null;
  }

  let lastHasError = false;
  let lastErrorText = "";
  let stepCheckTimer = null;
  let isTranslatingDom = false;
  const mo = new MutationObserver((mutations) => {
    if (isTranslatingDom) return;
    let domChanged = false;
    for (const m of mutations) {
      const targetEl = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
      if (targetEl && (targetEl.id === "nkap-overlay-host" || targetEl.closest?.(OVERLAY_SEL))) {
        continue;
      }
      if (m.type === "characterData" || m.type === "attributes") {
        domChanged = true;
        continue;
      }
      if (m.removedNodes && m.removedNodes.length > 0) domChanged = true;
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.id === "nkap-overlay-host" || node.closest?.(OVERLAY_SEL)) return;
        domChanged = true;

        if (langOn) {
          isTranslatingDom = true;
          try {
            translateVisible(node);
          } finally {
            mo.takeRecords();
            isTranslatingDom = false;
          }
        }

        // Détection immédiate de contenu inédit injecté par le jury
        if ((node.id && node.id.startsWith("injected-")) || /message important|important message/i.test(node.textContent || "")) {
          const txt = node.textContent.trim();
          if (txt && window.NKAP_ASSISTANT) {
            setTimeout(() => window.NKAP_ASSISTANT.onUnseenContent(txt), 120);
          }
        }
      });
    }

    if (domChanged) {
      if (stepCheckTimer) clearTimeout(stepCheckTimer);
      stepCheckTimer = setTimeout(() => {
        const curPath = location.pathname || "";
        if (curPath !== lastKnownPath) {
          lastKnownPath = curPath;
          if (!syncUssdOrbVisibility()) return;
        } else if (isSafinumUssd()) {
          return;
        }
        // Re-traduit après layout/transition (bannières dynamiques, texte asynchrone)
        if (langOn) {
          isTranslatingDom = true;
          try {
            translateVisible();
          } finally {
            mo.takeRecords();
            isTranslatingDom = false;
          }
        }
        const state = detectScreenState();
        const errBanner = state.hasError ? findActiveErrorBanner() : null;
        const errText = errBanner ? extractErrorKeyText(errBanner) : "";

        if (lastStep !== null && state.step !== lastStep) {
          lastStep = state.step;
          lastHasError = state.hasError;
          lastErrorText = errText;
          window.NKAP_ASSISTANT?.onScreenChanged?.(state.step);
          if (state.hasError) {
            setTimeout(() => window.NKAP_ASSISTANT?.onErrorDetected?.(errText), 150);
          }
        } else {
          lastStep = state.step;
          window.NKAP_OVERLAY?.pruneDetachedMarks?.();
          if (window.NKAP_ASSISTANT?.hasPendingGoal?.()) {
            window.NKAP_ASSISTANT.checkPendingGoal(state.step);
          }
          if (state.hasError && (!lastHasError || errText !== lastErrorText)) {
            lastHasError = true;
            lastErrorText = errText;
            window.NKAP_ASSISTANT?.onErrorDetected?.(errText);
          } else if (!state.hasError && lastHasError) {
            lastHasError = false;
            lastErrorText = "";
          }
        }
      }, 100);
    }
  });

  // ---- 4. Cibles & Contexte I5-web (docs/02 v1.1 §2) -----------------------

  /** Déplie les variantes FR/EN du lexique pour trouver la cible quelle que soit la langue du site. */
  function expandTargets(rawLabel) {
    const base = norm(rawLabel);
    if (!base) return [];
    const set = new Set([base]);
    const lex = window.NKAP_LEXICON;
    if (lex && Array.isArray(lex.entries) && typeof lex.sourceForms === "function") {
      for (const e of lex.entries) {
        const forms = lex.sourceForms(e).map(norm);
        if (forms.includes(base)) {
          forms.forEach((f) => f && set.add(f));
        }
      }
    }
    return Array.from(set);
  }

  window.NKAP_QUERY = function (textFragment) {
    const targets = expandTargets(textFragment);
    if (!targets.length) return null;

    const candidates = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!isMainTarget(el) || !isTextAtom(el)) continue;
      const currentNorm = norm(el.textContent);
      const origNorm = norm(el.getAttribute("data-nkap-orig") || "");
      for (const target of targets) {
        if (currentNorm.includes(target) || origNorm.includes(target)) {
          const isExact = currentNorm === target || origNorm === target;
          candidates.push({ el, score: priorityScore(el, isExact) });
          break;
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].el;
  };

  /**
   * Trouve la valeur placée en face d'un libellé (ex: "Frais" → "0 FCFA",
   * "Total à débiter" → "25 000 FCFA", "Référence" → "SAF-2026-...",
   * "Salaire reçu" → "+180 000 FCFA").
   */
  window.NKAP_QUERY_VALUE_OF = function (labels) {
    const list = Array.isArray(labels) ? labels : [labels];
    for (const rawLabel of list) {
      const targets = expandTargets(rawLabel);
      if (!targets.length) continue;

      for (const el of document.querySelectorAll("body *")) {
        if (!isMainTarget(el)) continue;
        if (el.querySelector("label, dt, dd, p, div, input, select, textarea")) continue;
        const full = norm(origOrCurrentText(el));
        const direct = norm(directText(el));
        if (targets.some((t) => full === t || direct === t)) {
          // Cas 1 : voisin direct (<dt>Frais</dt><dd>0 FCFA</dd> ou <span>Frais</span><span>0 FCFA</span>)
          if (el.nextElementSibling && isMainTarget(el.nextElementSibling)) {
            const sib = el.nextElementSibling;
            // Évite de retourner la sous-ligne de date dans l'historique ("04 nov. 2026")
            const row = el.closest(".justify-between");
            if (row && row.lastElementChild && !row.lastElementChild.contains(el) && row.lastElementChild !== sib) {
              return row.lastElementChild;
            }
            return sib;
          }
          // Cas 2 : ligne flex .justify-between (ex: historique des transactions)
          const row = el.closest(".justify-between");
          if (row && row.lastElementChild && !row.lastElementChild.contains(el) && isMainTarget(row.lastElementChild)) {
            return row.lastElementChild;
          }
          // Cas 3 : parent direct suivi de la valeur
          if (
            el.parentElement &&
            el.parentElement.nextElementSibling &&
            isMainTarget(el.parentElement.nextElementSibling)
          ) {
            return el.parentElement.nextElementSibling;
          }
        }
      }
    }
    return null;
  };

  /**
   * Trouve le champ de saisie (<input>, <select>, <textarea> ou conteneur .relative)
   * situé juste sous un <label> (ex: "Montant à envoyer", "Nom du bénéficiaire", "Numéro de téléphone").
   */
  window.NKAP_QUERY_FIELD_OF = function (labels) {
    const list = Array.isArray(labels) ? labels : [labels];
    for (const rawLabel of list) {
      const targets = expandTargets(rawLabel);
      if (!targets.length) continue;

      for (const el of document.querySelectorAll("label, span, p")) {
        if (!isMainTarget(el) || !isTextAtom(el)) continue;
        const full = norm(origOrCurrentText(el));
        if (targets.some((t) => full === t || full.includes(t))) {
          const next = el.nextElementSibling;
          if (next && isMainTarget(next)) {
            const tag = next.tagName.toLowerCase();
            if (
              tag === "input" ||
              tag === "select" ||
              tag === "textarea" ||
              next.querySelector("input, select, textarea")
            ) {
              return next;
            }
          }
        }
      }
    }
    return null;
  };

  window.NKAP_QUERY_REGEX = function (pattern, pick = "first") {
    let re;
    try {
      re = new RegExp(pattern, "iu");
    } catch (_) {
      return null;
    }

    const cands = Array.from(document.querySelectorAll("body *")).filter(
      (el) =>
        isMainTarget(el) &&
        isTextAtom(el) &&
        (re.test(el.textContent) || re.test(el.getAttribute("data-nkap-orig") || ""))
    );
    if (!cands.length) return null;

    const num = (s) => {
      const m = String(s).match(/[\d][\d\s.,\u00A0\u202F]*/g);
      if (!m) return -1;
      const raw = m[m.length - 1].replace(/[\s\u00A0\u202F]/g, "");
      const val = parseFloat(raw.replace(/,(?=\d{1,2}\b)/, "."));
      return isNaN(val) ? -1 : val;
    };

    switch (pick) {
      case "largest_value":
        return cands.reduce((a, b) => (num(b.textContent) > num(a.textContent) ? b : a));
      case "smallest_value":
        return cands.reduce((a, b) => (num(b.textContent) < num(a.textContent) ? b : a));
      case "last":
        return cands[cands.length - 1];
      case "largest":
        return cands.reduce((a, b) => (b.textContent.length > a.textContent.length ? b : a));
      default:
        return cands[0];
    }
  };

  window.NKAP_QUERY_BY_ID = function (nodeId) {
    if (!nodeId) return null;
    try {
      return document.querySelector(`[data-nkap-id="${CSS.escape(nodeId)}"]`);
    } catch (_) {
      return null;
    }
  };

  /** Filtre strict M4 (règle d'or #3) : ne jamais lire un champ PIN / mot de passe / OTP. */
  function isSensitiveInput(el) {
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && !el.isContentEditable) return false;
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (t === "password") return true;
    const meta = [
      el.getAttribute("name") || "",
      el.id || "",
      el.getAttribute("placeholder") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("autocomplete") || "",
    ].join(" ");
    return /pin|password|mot de passe|secret|code|otp|cvv/i.test(meta);
  }

  window.NKAP_EXTRACT_CONTEXT = function () {
    const nodes = [];
    let counter = window.__nkapIdCounter || 1;
    const state = detectScreenState();
    const scanRoot = getScanRoot();
    const inSandbox = isSafinumSandbox();

    let textNodeCount = 0;
    let interactiveCount = 0;
    for (const el of (scanRoot || document.body).querySelectorAll("*")) {
      if (nodes.length >= 200) break;
      if (!isMainTarget(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === "textarea" || el.isContentEditable) continue;
      if (tag === "input" && isSensitiveInput(el)) continue;

      const isInputOrSelect = tag === "input" || tag === "select";
      const clickable =
        tag === "button" || tag === "a" || el.getAttribute("role") === "button";
      const atom = isTextAtom(el);
      if (!isInputOrSelect && !atom && !clickable) continue;
      // Contrat I5-web : <= 200 nœuds stricts (140 textes + 60 boutons/champs garantis, donc la barre de nav basse n'est jamais coupée)
      if (!clickable && !isInputOrSelect) {
        if (textNodeCount >= 140) continue;
      } else if (interactiveCount >= 60) {
        continue;
      }
      // Dans le simulateur, évite de dupliquer le <button> et son <span> enfant identique
      if (clickable && !atom && el.querySelector("span, p, div")) {
        const direct = directText(el);
        if (!direct && (el.textContent || "").trim().length > 0) {
          // On garde le bouton cliquable mais on lui donne le texte global
        }
      }

      let rawText = "";
      if (tag === "input") {
        const inpType = (el.getAttribute("type") || "").toLowerCase();
        if (inpType === "checkbox" || inpType === "radio") {
          rawText = el.checked ? "[Coché]" : "[Case à cocher]";
        } else {
          rawText = String(el.value || "").trim();
        }
      } else if (tag === "select") {
        const opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
        rawText = String((opt && opt.text) || el.value || "").trim();
      } else {
        rawText = origOrCurrentText(el);
      }
      if (rawText.length < 1) continue;
      if (rawText.length < 2 && !/\d/.test(rawText)) continue;

      let contextText = rawText.slice(0, 140);
      if (inSandbox) {
        contextText = sandboxPhraseToFr(contextText).slice(0, 140);
      }
      if (window.NKAP_LEXICON && Array.isArray(window.NKAP_LEXICON.entries)) {
        const findFr = (txt) => {
          const low = txt.toLowerCase();
          const nrmTxt = norm(txt);
          const hit = window.NKAP_LEXICON.entries.find(
            (e) =>
              (e.dua && (e.dua.toLowerCase() === low || norm(e.dua) === nrmTxt)) ||
              (e.ewo && (e.ewo.toLowerCase() === low || norm(e.ewo) === nrmTxt)) ||
              (typeof window.NKAP_LEXICON.sourceForms === "function" &&
                window.NKAP_LEXICON.sourceForms(e).some((f) => f.toLowerCase() === low || norm(f) === nrmTxt))
          );
          if (!hit) return null;
          return typeof window.NKAP_LEXICON.canonicalFr === "function"
            ? window.NKAP_LEXICON.canonicalFr(hit)
            : hit.fr || null;
        };
        const directFr = findFr(contextText);
        if (directFr) {
          contextText = directFr.slice(0, 140);
        } else if (contextText.includes(":")) {
          const [head, ...rest] = contextText.split(":");
          const headFr = findFr(head.trim());
          if (headFr) {
            const tail = rest.join(":").trim();
            const tailFr = tail ? findFr(tail) || tail : "";
            contextText = (tailFr ? `${headFr} : ${tailFr}` : headFr).slice(0, 140);
          }
        }
      }

      let id = el.getAttribute("data-nkap-id");
      if (!id) {
        id = "n_" + String(counter).padStart(2, "0");
        counter++;
        el.setAttribute("data-nkap-id", id);
      }
      const r = el.getBoundingClientRect();
      if (clickable || isInputOrSelect) interactiveCount++;
      else textNodeCount++;
      nodes.push({
        node_id: id,
        tag,
        text: contextText,
        clickable,
        bounds: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        tone: window.NKAP_RULES ? window.NKAP_RULES.detectTone(el) : "dark",
      });
    }
    window.__nkapIdCounter = counter;
    return {
      type: "screen_context",
      channel: inSandbox ? detectSandboxChannel() : "web",
      page: { url: location.href, title: inSandbox ? "Safinum Banque démo" : document.title },
      screen_hint: state.step,
      nodes,
    };
  };

  window.NKAP_IS_SAFINUM_SANDBOX = isSafinumSandbox;
  window.NKAP_GET_SANDBOX_ROOT = getSandboxAppRoot;

  window.NKAP_SETTINGS = {
    get langOn() {
      return langOn;
    },
    set langOn(v) {
      langOn = !!v;
      if (isSafinumSandbox()) return;
      if (!langOn) restoreAll();
      else translateVisible();
    },
  };

  if (hasChrome) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "settings") {
        langOn = !!msg.ewondoOn;
        if (!isSafinumSandbox()) {
          if (!langOn) restoreAll();
          else translateVisible();
        }
        if (msg.brainUrl !== undefined) window.NKAP_ASSISTANT?.setBrainUrl(msg.brainUrl);
      }
    });
  }

  function boot(cfg) {
    langOn = isSafinumSandbox() ? false : !!cfg.ewondoOn;
    lastStep = detectScreenState().step;
    if (langOn && !isSafinumSandbox()) translateVisible();
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    const effectiveBrainUrl = (cfg.brainUrl || "").trim() || (isSafinumSandbox() ? DEFAULT_SANDBOX_BRAIN_URL : "");
    if (effectiveBrainUrl) window.NKAP_ASSISTANT?.setBrainUrl(effectiveBrainUrl);
    lastKnownPath = location.pathname || "";
    syncUssdOrbVisibility();
    window.addEventListener("popstate", () => {
      lastKnownPath = location.pathname || "";
      syncUssdOrbVisibility();
    });
    console.log(
      "[nkap] prêt sur",
      location.href,
      "— écran actif:",
      lastStep,
      isSafinumUssd()
        ? "(USSD détecté — orbe visuel flottant désactivé)"
        : isSafinumSandbox()
        ? "(mode copilote SAFINUM sandbox, traduction DOM désactivée)"
        : ""
    );
  }

  function start() {
    if (hasChrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ ewondoOn: false, brainUrl: "" }, boot);
    } else {
      boot({ ewondoOn: false, brainUrl: "" });
    }
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
