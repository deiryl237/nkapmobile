"""Couche linguistique multicanale SAFINUM (Ewondo, Duala, Français, Anglais)."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from app.sandbox.gsm7 import fit_gsm7

TRANSLATIONS_DIR = Path(__file__).resolve().parent / "translations"
SUPPORTED_LANGS = {"ewo", "dua", "en", "fr"}

_DICT_CACHE: dict[str, dict[str, str]] = {}
_UI_CACHE: dict[tuple[str, str, tuple[str, ...]], dict[str, Any]] = {}


def _norm(text: str | None) -> str:
    s = unicodedata.normalize("NFD", str(text or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("ɛ", "e").replace("ɔ", "o").replace("ŋ", "n").replace("ə", "e").replace("ɓ", "b")
    return re.sub(r"\s+", " ", s).strip()


def load_dictionary(lang: str) -> dict[str, str] | None:
    code = (lang or "").strip().lower()
    if code not in {"ewo", "dua", "en"}:
        return None
    if code in _DICT_CACHE:
        return _DICT_CACHE[code]
    path = TRANSLATIONS_DIR / f"{code}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    _DICT_CACHE[code] = data
    return data


def _extract_placeholders(text: str) -> list[str]:
    return sorted(set(re.findall(r"\{[a-z_]+\}", str(text or ""))))


def _fit_max_chars(value: str, limit: int | None) -> str:
    if not limit or len(value) <= limit:
        return value
    # Si aucun placeholder dans la zone tronquée, raccourcit proprement
    candidate = value[:limit].rstrip()
    if _extract_placeholders(candidate) == _extract_placeholders(value):
        return candidate
    return value[:limit]


def translate_ui(payload: dict[str, Any]) -> dict[str, Any]:
    """Implémente le contrat officiel `ui_translation` (canaux mobile & web)."""
    requested = str(payload.get("language") or "fr").strip().lower()
    screen = str(payload.get("screen") or "unknown")
    source = payload.get("strings") or {}

    if requested == "fr" or requested not in {"ewo", "dua", "en"}:
        return {
            "language": "fr",
            "strings": {k: str((v or {}).get("text", "")) for k, v in source.items()},
        }

    cache_key = (requested, screen, tuple(sorted(source.keys())))
    if cache_key in _UI_CACHE:
        return _UI_CACHE[cache_key]

    dictionary = load_dictionary(requested)
    if dictionary is None:
        return {
            "language": "fr",
            "strings": {k: str((v or {}).get("text", "")) for k, v in source.items()},
        }

    translated: dict[str, str] = {}
    for key, entry in source.items():
        entry_dict = entry if isinstance(entry, dict) else {"text": str(entry)}
        src_text = str(entry_dict.get("text") or "")
        max_chars = entry_dict.get("max_chars")
        val = dictionary.get(key)
        if not isinstance(val, str) or not val.strip():
            continue
        if _extract_placeholders(val) != _extract_placeholders(src_text):
            continue
        val = _fit_max_chars(val.strip(), int(max_chars) if max_chars else None)
        translated[key] = val

    result = {"language": requested, "strings": translated}
    if len(_UI_CACHE) < 128:
        _UI_CACHE[cache_key] = result
    return result


# ── Compréhension multilingue (Ewondo, Duala, Français, Anglais) ───────────

def detect_language_switch(text: str) -> str | None:
    n = _norm(text)
    switch_triggers = (
        "langue", "language", "parle", "parler", "passe en", "passer en", "en ",
        "switch", "change to", "kobo", "bato", "nkobo", "bwele", "tyende nkobo",
        "tukwa bwambo", "wengisane eyeme", "wenginane bwambo", "eyeme", "bwambo",
    )
    lang_map = {
        "ewo": ("ewondo", "ewo"),
        "dua": ("duala", "douala", "dua"),
        "fr": ("francais", "french", "fr"),
        "en": ("anglais", "english", "en"),
    }
    has_trigger = any(t in n for t in switch_triggers)
    for code, tokens in lang_map.items():
        for tok in tokens:
            if n == tok or (has_trigger and re.search(rf"\b{tok}\b", n)):
                return code
    return None


def detect_term_question(text: str) -> str | None:
    n = _norm(text)
    asks_def = any(
        k in n
        for k in (
            "c'est quoi", "cest quoi", "veut dire", "signifie", "explique",
            "definition", "what is", "za ne", "nje ne", "e ne dze", "e ne za",
            "terme", "mot", "sens", "teleya mba",
        )
    )
    if "microfinance" in n or "micro finance" in n or "micro-finance" in n:
        return "microfinance"
    if "plafond" in n or "limite" in n or "limit" in n or "nkuk" in n or "ndongo" in n or "jasame" in n or "mwasame" in n:
        return "limit" if (asks_def or len(n.split()) <= 3) else None
    if "beneficiaire" in n or "destinataire" in n or "beneficiary" in n or "mukusa" in n or "mukusedi" in n or "mukuse" in n or "mutombwedi" in n or "mutombwanedi" in n:
        return "beneficiary" if (asks_def or len(n.split()) <= 3) else None
    if asks_def and any(k in n for k in ("frais", "fee", "mbug", "mabala", "musen", "mususedi", "commission", "tarif")):
        return "fee"
    if asks_def and any(k in n for k in ("epargne", "epargner", "saving")):
        return "epargne"
    if asks_def and any(k in n for k in ("credit", "pret", "emprunt", "loan", "microcredit")):
        return "credit"
    if asks_def and any(k in n for k in ("tontine", "njangi")):
        return "tontine"
    if asks_def and any(k in n for k in ("mobile money", "momo", "orange money", "wallet")):
        return "mobile_money"
    if asks_def and any(k in n for k in ("ussd", "code court")):
        return "ussd"
    if asks_def and any(k in n for k in ("code pin", "code secret", "pin")):
        return "pin"
    return None


def parse_amount(text: str) -> int | None:
    # Évite de confondre un numéro camerounais (6XXXXXXXX ou 2376XXXXXXXX) avec un montant
    cleaned = re.sub(r"\b(?:237)?6\d{8}\b", " ", text or "")
    matches = re.findall(r"\b\d[\d\s.]{0,9}\d\b|\b\d+\b", cleaned)
    for m in matches:
        digits = re.sub(r"\D+", "", m)
        if digits and 1 <= len(digits) <= 7:
            val = int(digits)
            if val > 0:
                return val
    return None


def parse_phone(text: str) -> str | None:
    compact = re.sub(r"[\s.-]+", "", text or "")
    m = re.search(r"(?:237)?(6\d{8})", compact)
    if m:
        return "237" + m.group(1)
    return None


def detect_biller(text: str) -> str | None:
    n = _norm(text)
    if any(k in n for k in ("eneo", "electricite", "courant", "lumiere", "mfie", "weya")):
        return "ENEO"
    if any(k in n for k in ("camwater", "eau", "mendim", "madiba", "water")):
        return "CAMWATER"
    if any(k in n for k in ("canal", "tele", "tv")):
        return "CANAL"
    if any(k in n for k in ("camtel", "internet", "wifi")):
        return "CAMTEL"
    return None


def detect_intent_keyword(text: str) -> str | None:
    n = _norm(text)
    if not n:
        return None
    if any(k in n for k in ("confirmer", "confirme", "oui", "valider", "ok", "yes", "yemban", "bamse", "mbamse", "na kasi", "ne medi")):
        return "CONFIRM"
    if any(k in n for k in ("annuler", "annule", "non", "stop", "cancel", "vaa", "buka", "esele", "essele", "a bangi", "kem")):
        return "CANCEL"
    if any(k in n for k in ("corriger", "corrige", "modifier", "modifie", "changer", "change", "finalement", "plutot", "tyende", "tukwa", "wengisane", "engele", "na wondi")):
        return "CORRECTION"
    if any(k in n for k in ("frais", "combien coute", "cout", "tarif", "fee", "mbug", "mabala", "musen", "mususedi", "busise", "jombwa mbolo")):
        return "FEE_INQUIRY"
    if any(k in n for k in ("historique", "dernieres operations", "transactions", "operations", "history", "itang", "bebolo", "misongi", "misondi", "miango")):
        return "TRANSACTION_HISTORY"
    if any(k in n for k in ("credit", "airtime", "recharge", "unites", "kredi", "ebale", "djanda la mudi", "djanta musinga", "musinga", "londe la beboledi")):
        return "AIRTIME_PURCHASE"
    if any(k in n for k in ("facture", "bill", "eneo", "camwater", "canal", "camtel", "kalara", "kalati", "sawa", "saweya", "musawedi", "na pula wasa", "dipapa la")):
        return "BILL_PAYMENT"
    if any(k in n for k in ("retrait", "retirer", "withdraw", "gab", "atm", "nong moni", "busa moni", "kusa la moni", "sumua")):
        return "WITHDRAWAL"
    if any(k in n for k in ("envoyer", "envoie", "transfert", "transferer", "send", "lomo", "lom", "loma", "lomea", "tombise", "na ni tombele")):
        return "TRANSFER"
    if any(k in n for k in ("solde", "combien j'ai", "combien il me reste", "mon argent", "balance", "itan", "nden", "moni ma pene", "moni ma dia", "ekotedi", "nje e peti", "moni mu peti", "epetele", "nje ye etom yam", "edia", "bongo bene")):
        return "BALANCE_INQUIRY"
    return None


# ── Templates USSD/SMS localisés (garantis GSM-7 <= 182 car.) ──────────────

PHRASES: dict[str, dict[str, str]] = {
    "menu": {
        "ewo": "Safinum (Ewondo):\n1. Itan ineu\n2. Lomo moni\n3. Mbug\n4. Itang mvet\n5. Kredi\n6. Kalara\n7. Aide termes",
        "dua": "Idiba bwam! Safinum (Duala):\n1. Edia\n2. Loma moni\n3. Mususedi\n4. Miango\n5. Ebale\n6. Sawa diyo\n7. Jongwane",
        "fr": "Safinum:\n1. Mon solde\n2. Transfert\n3. Frais\n4. Historique\n5. Credit\n6. Facture\n7. Termes",
        "en": "Safinum:\n1. Balance\n2. Transfer\n3. Fees\n4. History\n5. Airtime\n6. Bills\n7. Terms",
    },
    "balance": {
        "ewo": "Itan ineu a nkwap {phone}: {balance}.",
        "dua": "Moni mu peti ({phone}): {balance}.",
        "fr": "Votre solde ({phone}) est de {balance}.",
        "en": "Your balance ({phone}) is {balance}.",
    },
    "ask_transfer_to": {
        "ewo": "Tili dzoé nge nombo mod wa lom moni:",
        "dua": "Dina la mukusedi nga number:",
        "fr": "Nom ou numero du beneficiaire:",
        "en": "Beneficiary name or phone number:",
    },
    "ask_amount": {
        "ewo": "Itan ya lom (FCFA):",
        "dua": "Moni o maloma na (FCFA):",
        "fr": "Montant en FCFA:",
        "en": "Amount in FCFA:",
    },
    "ask_fee_amount": {
        "ewo": "Itan ya fombo mbug (FCFA):",
        "dua": "Moni ma ombwa mabala (FCFA):",
        "fr": "Montant pour calculer les frais (FCFA):",
        "en": "Amount to check fees (FCFA):",
    },
    "fee_answer": {
        "ewo": "Lomo {amount}: mbug {fee}, ntolan {total}.",
        "dua": "Loma {amount}: mususedi {fee}, musongi mu londi {total}.",
        "fr": "Envoi {amount}: frais {fee}, total {total}.",
        "en": "Send {amount}: fee {fee}, total {total}.",
    },
    "ambiguous_benef": {
        "ewo": "Bot biba be bele dzoé di. Tob:\n{choices}",
        "dua": "Bato biba ba bene di dina. Poso:\n{choices}",
        "fr": "Plusieurs beneficiaires trouves. Choisissez:\n{choices}",
        "en": "Multiple beneficiaries found. Pick one:\n{choices}",
    },
    "confirm_transfer": {
        "ewo": "Lomo {amount} a {to}. Mbug {fee}, ntolan {total}.\n1. Yemban\n2. Vaa\n3. Tyende itan\n4. Tyende mod",
        "dua": "Loma {amount} o dina la {to}. Mususedi {fee}, total {total}.\n1. Bamse\n2. Sumua\n3. Tukwa musongi\n4. Tukwa mukusedi",
        "fr": "Envoi {amount} a {to}. Frais {fee}, total {total}.\n1. Confirmer\n2. Annuler\n3. Modifier montant\n4. Modifier destinataire",
        "en": "Send {amount} to {to}. Fee {fee}, total {total}.\n1. Confirm\n2. Cancel\n3. Edit amount\n4. Edit recipient",
    },
    "confirm_airtime": {
        "ewo": "Kredi {operator} {amount} a {to}. Mbug {fee}, ntolan {total}.\n1. Yemban\n2. Vaa\n3. Tyende itan",
        "dua": "Ebale {operator} {amount} o {to}. Mususedi {fee}, total {total}.\n1. Bamse\n2. Sumua\n3. Tukwa musongi",
        "fr": "Credit {operator} {amount} au {to}. Frais {fee}, total {total}.\n1. Confirmer\n2. Annuler\n3. Modifier montant",
        "en": "{operator} airtime {amount} to {to}. Fee {fee}, total {total}.\n1. Confirm\n2. Cancel\n3. Edit amount",
    },
    "confirm_bill": {
        "ewo": "Kalara {biller} {amount}. Mbug {fee}, ntolan {total}.\n1. Yemban\n2. Vaa\n3. Tyende itan",
        "dua": "Sawa {biller} {amount}. Mususedi {fee}, total {total}.\n1. Bamse\n2. Sumua\n3. Tukwa musongi",
        "fr": "Facture {biller} {amount}. Frais {fee}, total {total}.\n1. Confirmer\n2. Annuler\n3. Modifier montant",
        "en": "{biller} bill {amount}. Fee {fee}, total {total}.\n1. Confirm\n2. Cancel\n3. Edit amount",
    },
    "confirmed": {
        "ewo": "Mvet o boban mben! {amount} a {to}. Ref {ref}.",
        "dua": "Tombi bwam! {amount} o dina la {to}. Epasi {ref}.",
        "fr": "Operation confirmee! {amount} pour {to}. Ref {ref}.",
        "en": "Confirmed! {amount} for {to}. Ref {ref}.",
    },
    "cancelled": {
        "ewo": "Mvet o vaban. Te ke itan e tsigban.",
        "dua": "Sumua. Moni mu si lomabe.",
        "fr": "Operation annulee. Aucun montant debite.",
        "en": "Transaction cancelled. Nothing debited.",
    },
    "ask_new_amount": {
        "ewo": "Tili itan mfefe (FCFA):",
        "dua": "Tila musongi mpepe (FCFA):",
        "fr": "Entrez le nouveau montant (FCFA):",
        "en": "Enter the new amount (FCFA):",
    },
    "ask_new_beneficiary": {
        "ewo": "Tili dzoé nge nombo mod mfe:",
        "dua": "Dina la mukusedi mpepe nga number:",
        "fr": "Nom ou numero du nouveau destinataire:",
        "en": "New recipient name or phone number:",
    },
    "ask_airtime_target": {
        "ewo": "Kredi asu:\n1. Nombo wam\n2. Nombo mfe",
        "dua": "Kredi o:\n1. Nimero am\n2. Nimero mpepe",
        "fr": "Credit pour:\n1. Mon numero\n2. Autre numero",
        "en": "Airtime for:\n1. My number\n2. Another number",
    },
    "ask_airtime_phone": {
        "ewo": "Tili nombo telefon (9 chiffres):",
        "dua": "Tila nimero a telefone (9 chiffres):",
        "fr": "Numero a recharger (9 chiffres):",
        "en": "Phone number to top up (9 digits):",
    },
    "ask_biller": {
        "ewo": "Tob kalara:\n1. ENEO\n2. CAMWATER\n3. CANAL\n4. CAMTEL",
        "dua": "Pona kalati:\n1. ENEO\n2. CAMWATER\n3. CANAL\n4. CAMTEL",
        "fr": "Facturier:\n1. ENEO\n2. CAMWATER\n3. CANAL\n4. CAMTEL",
        "en": "Biller:\n1. ENEO\n2. CAMWATER\n3. CANAL\n4. CAMTEL",
    },
    "ask_term": {
        "ewo": "Za dzam wa yi yem?\n1. Mbug (frais)\n2. Nkuk (plafond)\n3. Mod a non (beneficiaire)",
        "dua": "Nje o tondi bia?\n1. Mabala (frais)\n2. Ndongo (plafond)\n3. Mukusa (beneficiaire)",
        "fr": "Quel terme expliquer?\n1. Frais\n2. Plafond\n3. Beneficiaire",
        "en": "Which term to explain?\n1. Fee\n2. Limit\n3. Beneficiary",
    },
    "term_fee": {
        "ewo": "Mbug: itan etun banki a tsig asu na a lom moni wog (ex: 50 a 400 FCFA).",
        "dua": "Mususedi mwe nde moni bank mba ma nongo no o loma (50 a 400 FCFA).",
        "fr": "Frais: petite somme retenue par la banque pour faire l'envoi (ex: 50 a 400 FCFA).",
        "en": "Fee: small amount the bank charges to process your transfer.",
    },
    "term_limit": {
        "ewo": "Nkuk: itan enen o ne dzam lom a mvet wua (500 000 FCFA).",
        "dua": "Jasame le nde musongi mwa moni o titi no na o loma nguedi po (500 000 FCFA).",
        "fr": "Plafond: montant maximum autorise par operation (500 000 FCFA).",
        "en": "Limit: maximum amount allowed in a single transaction (500 000 FCFA).",
    },
    "term_beneficiary": {
        "ewo": "Mod a non moni: nyi wa lom itan. Fombo dzoé ai nombo ossussua.",
        "dua": "Mukusedi nde a makuse moni. Ombwa dina na number oboso.",
        "fr": "Beneficiaire: la personne qui recoit votre argent. Verifiez toujours son numero.",
        "en": "Beneficiary: the person receiving your money. Always check their number.",
    },
    "term_microfinance": {
        "ewo": "Microfinance: nda moni etun e ne bebebe, e bo na o baale moni, o lom itan, o nong kredi etun.",
        "dua": "Microfinance: ndabo a moni e siti o boso, e ma-bobea o bamba moni, loma na nongo kredi.",
        "fr": "Microfinance: etablissement financier de proximite pour epargner, transferer et obtenir de petits prets.",
        "en": "Microfinance: local financial institution offering savings, transfers and small loans.",
    },
    "term_epargne": {
        "ewo": "Epargne: itan wa baale a nkwap asu melu ma zu nge eban.",
        "dua": "Epargne: moni o ma-bamba o konto asu ponda e ma-ya.",
        "fr": "Epargne: argent mis de cote en securite pour vos projets ou imprevus.",
        "en": "Savings: money set aside safely for future needs or emergencies.",
    },
    "term_credit": {
        "ewo": "Credit: itan banki a ve wa tatan, wa bulan dzom a melu ma zu ai mbug.",
        "dua": "Credit: moni banki e ma-bola wa tatan, o timbise mo na mabala.",
        "fr": "Credit: somme pretee par une banque ou microfinance a rembourser progressivement.",
        "en": "Loan: money borrowed from a bank or microfinance and repaid over time.",
    },
    "term_tontine": {
        "ewo": "Tontine: bbot be kote itan a ngum, mod ese a non a ebe dzie.",
        "dua": "Tontine: bato ba ma-kote moni mwambo, moto te a kusa o ponda ao.",
        "fr": "Tontine: epargne collective ou chaque membre cotise et recoit la cagnotte a tour de role.",
        "en": "Tontine: group savings circle where members contribute and take turns receiving the pot.",
    },
    "term_mobile_money": {
        "ewo": "Mobile Money: nkwap moni a nombo telefon wog asu lomo, yan kalara ai nong moni.",
        "dua": "Mobile Money: konto a moni o nimero a telefone ango o loma na sawa.",
        "fr": "Mobile Money: porte-monnaie lie a votre numero pour envoyer, payer et retirer.",
        "en": "Mobile Money: phone-linked wallet to send, pay bills and withdraw cash.",
    },
    "term_ussd": {
        "ewo": "USSD: menu a telefon ai *123#, e bo isae te ke internet.",
        "dua": "USSD: menu o telefone na *123#, e ma-bolane to internet te.",
        "fr": "USSD: menu bancaire par code court (*123#) qui marche sans internet.",
        "en": "USSD: short-code banking menu (*123#) that works without internet.",
    },
    "term_pin": {
        "ewo": "Code PIN: nombo nsolan wog. Te ve mod ese, to agent banki.",
        "dua": "Code PIN: kode ango ya dimbambe. O si langwea to moto.",
        "fr": "Code PIN: votre code secret personnel. Ne le partagez jamais, meme a un agent.",
        "en": "PIN code: your personal secret code. Never share it with anyone.",
    },
    "lang_switched": {
        "ewo": "Nkobo o tyendeban: Ewondo. {resume}",
        "dua": "Na wengisane eyeme: Duala. To lambo di si bolone. {resume}",
        "fr": "Langue changee: Francais. {resume}",
        "en": "Language switched: English. {resume}",
    },
    "history_empty": {
        "ewo": "Te ke mvet a tatan.",
        "dua": "To lambo.",
        "fr": "Aucune operation recente.",
        "en": "No recent transactions.",
    },
    "invalid_amount": {
        "ewo": "Nombo itan a ne abe. Tili nombo (ex: 5000):",
        "dua": "Number e si tem. Tila nombo (ex: 5000):",
        "fr": "Montant invalide. Tapez un nombre (ex: 5000):",
        "en": "Invalid amount. Enter a number (e.g. 5000):",
    },
    "invalid_phone": {
        "ewo": "Nombo a ne abe. 9 chiffres, ex: 699000002",
        "dua": "Number e si tem. 9 chiffres, ex: 699000002",
        "fr": "Numero invalide. 9 chiffres, ex: 699000002",
        "en": "Invalid phone. 9 digits, e.g. 699000002",
    },
    "confirm_prompt_retry": {
        "ewo": "Tili 1 (Yemban), 2 (Vaa), 3 (Tyende itan) nge 4 (Tyende mod).",
        "dua": "Tila 1 (Bamse), 2 (Sumua), 3 (Musongi) nga 4 (Mukusedi).",
        "fr": "Tapez 1 (Confirmer), 2 (Annuler), 3 (Montant) ou 4 (Destinataire).",
        "en": "Reply 1 (Confirm), 2 (Cancel), 3 (Amount) or 4 (Recipient).",
    },
    "atm_multiple": {
        "ewo": "Nong moni a GAB: multiples 5 000 FCFA (ex: 5000, 10000).",
        "dua": "Sumua o GAB: multiples 5 000 FCFA (ex: 5000, 10000).",
        "fr": "Retrait GAB uniquement par multiples de 5 000 FCFA.",
        "en": "ATM withdrawals must be multiples of 5,000 FCFA.",
    },
    "err_INSUFFICIENT_FUNDS": {
        "ewo": "Itan yoe e se dzam asu mvet nyi. Lomo itan etun.",
        "dua": "Moni mu si dongamene. Loma moni musadi.",
        "fr": "Solde insuffisant pour couvrir le montant et les frais. Essayez un montant plus petit.",
        "en": "Insufficient balance for this amount and fee. Try a smaller amount.",
    },
    "err_LIMIT_EXCEEDED": {
        "ewo": "Itan e lod nkuk (500 000 FCFA a mvet).",
        "dua": "Diwuse! Nongo jangamene, moni mwasame (500 000 FCFA).",
        "fr": "Montant superieur au plafond autorise (500 000 FCFA).",
        "en": "Amount exceeds maximum limit (500,000 FCFA).",
    },
    "err_UNKNOWN_BENEFICIARY": {
        "ewo": "Mod a nji yenban. Fombo dzoé ai nombo.",
        "dua": "Si jene la mutombwanedi. Jombwa dina na number.",
        "fr": "Beneficiaire introuvable. Verifiez le nom ou le numero.",
        "en": "Beneficiary not found. Check name or number.",
    },
    "err_UNKNOWN_ACCOUNT": {
        "ewo": "Nkwap o nji yenban.",
        "dua": "Bekotedi e si yenbe.",
        "fr": "Compte introuvable.",
        "en": "Account not found.",
    },
    "err_UNKNOWN_BILLER": {
        "ewo": "Isae e nji yenban. Tob ENEO, CAMWATER, CANAL nge CAMTEL.",
        "dua": "Diyo di titi. Poso ENEO, CAMWATER, CANAL nga CAMTEL.",
        "fr": "Facturier inconnu. Choisissez ENEO, CAMWATER, CANAL ou CAMTEL.",
        "en": "Unknown biller. Choose ENEO, CAMWATER, CANAL or CAMTEL.",
    },
    "err_GENERIC": {
        "ewo": "Mvet o nji boban. Kele ko.",
        "dua": "Moni mu si lomabe. Kekise pete.",
        "fr": "Operation impossible pour le moment. Reessayez.",
        "en": "Operation unavailable right now. Please try again.",
    },
}


def resolve_lang(requested: str | None) -> str:
    code = str(requested or "").strip().lower()
    if code in SUPPORTED_LANGS:
        return code
    return "fr"


def render_phrase(key: str, lang: str | None, max_septets: int = 182, **kwargs: Any) -> tuple[str, str]:
    """Renvoie (texte GSM-7 <= max_septets, langue réellement déclarée)."""
    declared = resolve_lang(lang)
    table = PHRASES.get(key) or PHRASES["err_GENERIC"]
    tpl = table.get(declared) or table["fr"]
    if declared not in table:
        declared = "fr"
    try:
        raw = tpl.format(**kwargs)
    except Exception:
        raw = tpl
    return fit_gsm7(raw, max_septets=max_septets), declared
