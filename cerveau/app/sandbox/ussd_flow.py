"""Moteur conversationnel multicanal SAFINUM (USSD *123#, SMS, ATM, IVR).

Respecte intégralement le contrat officiel :
- X-Trace-Id propagé sur chaque appel banque
- Confirmation dans un tour séparé (jamais dans le même tour que POST /transactions)
- 13 intentions officielles en MAJUSCULES
- Zéro devinette sur montant ou bénéficiaire homonyme (CLARIFICATION_NEEDED)
- Correction avant confirmation (annulation pending + recalcul frais + nouvelle relecture)
- Changement de langue en cours de session sans perte de contexte
- GSM-7 strict <= 182 septets (USSD) / <= 160 septets (SMS)
"""

from __future__ import annotations

import re
import threading
import time
from typing import Any

from app.sandbox.bank_client import SafinumBankClient
from app.sandbox.gsm7 import fit_gsm7
from app.sandbox.language import (
    detect_biller,
    detect_intent_keyword,
    detect_language_switch,
    detect_term_question,
    parse_amount,
    parse_phone,
    render_phrase,
    resolve_lang,
)

SESSIONS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()
SESSION_TTL_S = 180


def _money(amount: Any) -> str:
    try:
        return f"{int(round(float(amount or 0))):,} FCFA".replace(",", " ")
    except Exception:
        return f"{amount} FCFA"


def _local_phone(phone: str | None) -> str:
    return re.sub(r"^237", "", str(phone or ""))


def _prune_sessions(now: float) -> None:
    expired = [sid for sid, st in SESSIONS.items() if now - st.get("updated_at", 0) > SESSION_TTL_S * 3]
    for sid in expired:
        SESSIONS.pop(sid, None)


def _reply(
    text: str,
    intent: str,
    lang: str,
    *,
    parameters: dict[str, Any] | None = None,
    options: list[str] | None = None,
    end: bool = False,
    transaction: dict[str, Any] | None = None,
    max_septets: int = 182,
) -> dict[str, Any]:
    return {
        "response": {
            "text": fit_gsm7(text, max_septets=max_septets),
            "end_session": end,
            "options": [fit_gsm7(o, max_septets=40) for o in (options or [])],
        },
        "interpretation": {
            "intent": intent,
            "parameters": parameters or {},
            "language": lang,
        },
        "transaction": transaction or {"id": None, "status": "none"},
    }


def _bank_error(
    data: dict[str, Any],
    intent: str,
    lang: str,
    reference: str | None = None,
    max_septets: int = 182,
) -> dict[str, Any]:
    code = str((data or {}).get("error") or "GENERIC").upper()
    key = f"err_{code}" if code in {
        "INSUFFICIENT_FUNDS",
        "LIMIT_EXCEEDED",
        "UNKNOWN_BENEFICIARY",
        "UNKNOWN_ACCOUNT",
        "UNKNOWN_BILLER",
    } else "err_GENERIC"
    txt, declared = render_phrase(key, lang, max_septets=max_septets)
    return _reply(
        txt,
        intent,
        declared,
        parameters={"error": code},
        end=True,
        transaction={"id": reference, "status": "failed"} if reference else None,
        max_septets=max_septets,
    )


def _format_recap(state: dict[str, Any], lang: str, max_septets: int) -> tuple[str, str]:
    op = state.get("op_type", "transfer")
    fee_s = _money(state.get("fee", 0))
    amt_s = _money(state.get("amount", 0))
    tot_s = _money(state.get("total", state.get("amount", 0)))
    if op == "airtime":
        return render_phrase(
            "confirm_airtime",
            lang,
            max_septets=max_septets,
            operator=state.get("operator") or "",
            amount=amt_s,
            to=_local_phone(state.get("to")),
            fee=fee_s,
            total=tot_s,
        )
    if op == "bill":
        return render_phrase(
            "confirm_bill",
            lang,
            max_septets=max_septets,
            biller=state.get("biller") or "",
            amount=amt_s,
            fee=fee_s,
            total=tot_s,
        )
    to_label = state.get("to_name") or _local_phone(state.get("to"))
    return render_phrase(
        "confirm_transfer",
        lang,
        max_septets=max_septets,
        amount=amt_s,
        to=to_label,
        fee=fee_s,
        total=tot_s,
    )


def _create_pending_operation(
    state: dict[str, Any],
    phone: str,
    bank: SafinumBankClient,
    lang: str,
    intent: str,
    max_septets: int,
) -> dict[str, Any]:
    op = state.get("op_type", "transfer")
    amount = int(state["amount"])
    body: dict[str, Any] = {"type": op, "from": phone, "amount": amount}
    if op == "transfer":
        body["to"] = state["to"]
    elif op == "airtime":
        body["to"] = state["to"]
    elif op == "bill":
        body["biller"] = state["biller"]

    ok, _status, tx = bank.create_transaction(body)
    if not ok:
        return _bank_error(tx, intent, lang, max_septets=max_septets)

    state["step"] = "confirm"
    state["reference"] = tx.get("id")
    state["fee"] = tx.get("fee", 0)
    state["total"] = tx.get("total", amount)
    if tx.get("operator"):
        state["operator"] = tx["operator"]

    txt, declared = _format_recap(state, lang, max_septets)
    params: dict[str, Any] = {"amount": amount, "currency": "XAF", "fee": state["fee"], "total": state["total"]}
    if state.get("to"):
        params["to"] = state["to"]
    if state.get("to_name"):
        params["beneficiary"] = state["to_name"]
    if state.get("biller"):
        params["biller"] = state["biller"]
    confirm_options = (
        ["Confirmer", "Annuler", "Modifier montant", "Modifier destinataire"]
        if op == "transfer"
        else ["Confirmer", "Annuler", "Modifier montant"]
    )
    return _reply(
        txt,
        intent,
        declared,
        parameters=params,
        options=confirm_options,
        transaction={"id": state["reference"], "status": "pending"},
        max_septets=max_septets,
    )


def _do_balance(phone: str, bank: SafinumBankClient, lang: str, max_septets: int) -> dict[str, Any]:
    ok, _st, data = bank.balance(phone)
    if not ok:
        return _bank_error(data, "BALANCE_INQUIRY", lang, max_septets=max_septets)
    bal = data.get("balance", 0)
    txt, declared = render_phrase("balance", lang, max_septets=max_septets, phone=_local_phone(phone), balance=_money(bal))
    return _reply(
        txt,
        "BALANCE_INQUIRY",
        declared,
        parameters={"account": phone, "balance": bal, "currency": "XAF"},
        end=True,
        max_septets=max_septets,
    )


def _do_fees(amount: int, bank: SafinumBankClient, lang: str, max_septets: int, kind: str = "transfer") -> dict[str, Any]:
    ok, _st, data = bank.fees(kind, amount)
    if not ok:
        return _bank_error(data, "FEE_INQUIRY", lang, max_septets=max_septets)
    fee = data.get("fee", 0)
    total = data.get("total", amount + fee)
    txt, declared = render_phrase(
        "fee_answer",
        lang,
        max_septets=max_septets,
        amount=_money(amount),
        fee=_money(fee),
        total=_money(total),
    )
    return _reply(
        txt,
        "FEE_INQUIRY",
        declared,
        parameters={"type": kind, "amount": amount, "fee": fee, "total": total, "currency": "XAF"},
        end=True,
        max_septets=max_septets,
    )


def _do_history(phone: str, bank: SafinumBankClient, lang: str, max_septets: int) -> dict[str, Any]:
    ok, _st, data = bank.history(phone, limit=4)
    if not ok:
        return _bank_error(data, "TRANSACTION_HISTORY", lang, max_septets=max_septets)
    txs = data.get("transactions") or data.get("items") or data.get("data") or []
    if not txs:
        txt, declared = render_phrase("history_empty", lang, max_septets=max_septets)
        return _reply(txt, "TRANSACTION_HISTORY", declared, parameters={"count": 0}, end=True, max_septets=max_septets)

    lines = []
    for item in txs[:3]:
        kind = str(item.get("type") or "op")[:8]
        amt = _money(item.get("amount", 0))
        st = str(item.get("status") or "")[:7]
        who = str(
            item.get("beneficiary")
            or item.get("to_name")
            or item.get("biller")
            or item.get("operator")
            or _local_phone(item.get("to"))
            or ""
        )[:12]
        lines.append(f"- {kind} {who} {amt} ({st})".replace("  ", " ").strip())
    declared = resolve_lang(lang)
    header = {"ewo": "Itang mvet:", "dua": "Miango:", "en": "History:"}.get(declared, "Historique:")
    return _reply(
        header + "\n" + "\n".join(lines),
        "TRANSACTION_HISTORY",
        declared,
        parameters={"count": len(txs)},
        end=True,
        max_septets=max_septets,
    )


def _resolve_beneficiary_or_clarify(
    state: dict[str, Any],
    query: str,
    phone: str,
    bank: SafinumBankClient,
    lang: str,
    max_septets: int,
) -> dict[str, Any] | None:
    """Résout un bénéficiaire ; renvoie une réponse CLARIFICATION_NEEDED si ambigu ou introuvable, sinon None (state mis à jour)."""
    parsed_phone = parse_phone(query)
    if parsed_phone:
        state["to"] = parsed_phone
        state["to_name"] = _local_phone(parsed_phone)
        return None

    clean_q = re.sub(
        r"\b(?:envoyer|envoie|transfert|transferer|send|lomo|loma|moni|a|pour|vers|to|fcfa|xaf)\b",
        " ",
        query,
        flags=re.IGNORECASE,
    )
    clean_q = re.sub(r"\b\d[\d\s.]*\b", " ", clean_q).strip(" ,.-:;")
    if not clean_q:
        state["step"] = "transfer_to"
        txt, declared = render_phrase("ask_transfer_to", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    # IMPORTANT : GET /beneficiaries?q=&phone= cherche par nom OU par numéro du bénéficiaire
    # (ne JAMAIS passer le numéro de l'expéditeur `phone` dans `phone=`, sinon l'API renvoie [] !)
    ok, _st, data = bank.beneficiaries(clean_q)
    if not ok:
        return _bank_error(data, "TRANSFER", lang, max_septets=max_septets)

    raw_items = data.get("beneficiaries") or data.get("items") or data.get("data") or []
    # Si la saisie contient "Prénom Nom" et ne renvoie rien, tente le prénom seul pour permettre la clarification
    if not raw_items and " " in clean_q:
        first_tok = clean_q.split()[0]
        if len(first_tok) >= 2:
            ok2, _st2, data2 = bank.beneficiaries(first_tok)
            if ok2:
                raw_items = data2.get("beneficiaries") or data2.get("items") or data2.get("data") or []

    # Déduplique par téléphone (l'API SAFINUM peut renvoyer un même bénéficiaire sur plusieurs institutions)
    # et évite de proposer l'expéditeur lui-même quand d'autres bénéficiaires correspondent.
    dedup_by_phone: dict[str, dict[str, Any]] = {}
    for it in raw_items:
        ph = str(it.get("phone") or "").strip()
        if not ph:
            continue
        if ph not in dedup_by_phone or str(it.get("institution") or "").upper() == "SAFINUM":
            dedup_by_phone[ph] = it
    items = list(dedup_by_phone.values()) if dedup_by_phone else raw_items
    non_self = [it for it in items if str(it.get("phone") or "").strip() != phone]
    if non_self:
        items = non_self
    if not items:
        return _bank_error({"error": "UNKNOWN_BENEFICIARY"}, "TRANSFER", lang, max_septets=max_septets)
    if len(items) > 1:
        state["step"] = "transfer_pick_benef"
        state["candidates"] = items[:4]
        choice_lines = "\n".join(
            f"{i}. {c.get('name', '?')} ({_local_phone(c.get('phone'))})"
            for i, c in enumerate(state["candidates"], start=1)
        )
        txt, declared = render_phrase("ambiguous_benef", lang, max_septets=max_septets, choices=choice_lines)
        return _reply(
            txt,
            "CLARIFICATION_NEEDED",
            declared,
            parameters={"query": clean_q, "matches": len(items)},
            options=[str(c.get("name", i)) for i, c in enumerate(state["candidates"], start=1)],
            max_septets=max_septets,
        )

    hit = items[0]
    state["to"] = hit.get("phone")
    state["to_name"] = hit.get("name") or _local_phone(hit.get("phone"))
    return None


def handle_channel_turn(
    payload: dict[str, Any],
    trace_id: str | None = None,
    bank_client: SafinumBankClient | None = None,
) -> dict[str, Any]:
    """Point d'entrée unique pour USSD, SMS, ATM et IVR sur la passerelle SAFINUM."""
    channel = str(payload.get("channel") or "ussd").lower()
    constraints = payload.get("constraints") or {}
    max_septets = int(constraints.get("max_chars") or (160 if channel == "sms" else 182))
    session_id = str(payload.get("session_id") or f"{channel}_{payload.get('phone') or 'anon'}")
    phone = str(payload.get("phone") or "")
    req_lang = payload.get("language")
    inp = payload.get("input") or {}
    raw_text = str(inp.get("text") or "").strip()

    bank = bank_client or SafinumBankClient(
        base_url=(payload.get("bank_api") or {}).get("base_url"),
        trace_id=trace_id or payload.get("trace_id"),
    )

    now = time.monotonic()
    with LOCK:
        _prune_sessions(now)
        state = dict(SESSIONS.get(session_id) or {"step": "idle"})
    if req_lang and not state.get("lang_locked"):
        state["lang"] = resolve_lang(req_lang)
    lang = state.get("lang") or resolve_lang(req_lang)

    # 1. Changement de langue en cours de session SANS perdre l'opération en cours
    switched = detect_language_switch(raw_text)
    if switched:
        state["lang"] = switched
        state["lang_locked"] = True
        if state.get("step") == "confirm" and state.get("reference"):
            resume_txt, _ = _format_recap(state, switched, max_septets - 30)
        else:
            resume_txt, _ = render_phrase("menu", switched, max_septets - 30)
            if state.get("step") == "idle":
                state["step"] = "menu"
        txt, declared = render_phrase("lang_switched", switched, max_septets=max_septets, resume=resume_txt)
        res = _reply(
            txt,
            "LANGUAGE_SWITCH",
            declared,
            parameters={"language": switched},
            transaction={"id": state.get("reference"), "status": "pending"} if state.get("reference") else None,
            max_septets=max_septets,
        )
        _save_state(session_id, state, res, channel, now)
        return res

    # 2. Explication de terminologie financière à tout moment
    term = detect_term_question(raw_text)
    if term:
        txt, declared = render_phrase(f"term_{term}", lang, max_septets=max_septets)
        res = _reply(txt, "TERM_EXPLANATION", declared, parameters={"term": term}, end=(channel == "sms"), max_septets=max_septets)
        _save_state(session_id, state, res, channel, now)
        return res

    res = _route_turn(state, raw_text, phone, bank, lang, channel, max_septets)
    _save_state(session_id, state, res, channel, now)
    return res


def _save_state(session_id: str, state: dict[str, Any], res: dict[str, Any], channel: str, now: float) -> None:
    if channel == "sms":
        return
    with LOCK:
        if res["response"]["end_session"]:
            SESSIONS.pop(session_id, None)
        else:
            state["updated_at"] = now
            SESSIONS[session_id] = state


def _route_turn(
    state: dict[str, Any],
    text: str,
    phone: str,
    bank: SafinumBankClient,
    lang: str,
    channel: str,
    max_septets: int,
) -> dict[str, Any]:
    step = state.get("step", "idle")
    kw_intent = detect_intent_keyword(text)

    # Ouverture session USSD (*123#)
    if text == "" and step != "confirm":
        state["step"] = "menu"
        txt, declared = render_phrase("menu", lang, max_septets=max_septets)
        return _reply(txt, "UNKNOWN", declared, options=["Solde", "Transfert", "Frais", "Historique", "Credit", "Facture", "Termes"], max_septets=max_septets)

    # ── Étape Confirmation (tour séparé obligatoire + Correction avant confirmation) ──
    if step == "confirm":
        if text == "1" or kw_intent == "CONFIRM":
            ok, _st, tx = bank.confirm(state["reference"])
            if not ok:
                return _bank_error(tx, "CONFIRM", lang, reference=state.get("reference"), max_septets=max_septets)
            to_lbl = state.get("to_name") or state.get("biller") or _local_phone(tx.get("to") or state.get("to"))
            txt, declared = render_phrase("confirmed", lang, max_septets=max_septets, amount=_money(tx.get("amount") or state.get("amount")), to=to_lbl, ref=tx.get("id") or state["reference"])
            return _reply(
                txt,
                "CONFIRM",
                declared,
                parameters={"transaction_id": tx.get("id") or state["reference"]},
                end=True,
                transaction={"id": tx.get("id") or state["reference"], "status": "confirmed"},
                max_septets=max_septets,
            )

        if text == "2" or kw_intent == "CANCEL":
            ok, _st, data = bank.cancel(state["reference"])
            if not ok:
                return _bank_error(data, "CANCEL", lang, reference=state.get("reference"), max_septets=max_septets)
            txt, declared = render_phrase("cancelled", lang, max_septets=max_septets)
            return _reply(
                txt,
                "CANCEL",
                declared,
                parameters={"transaction_id": state["reference"]},
                end=True,
                transaction={"id": state["reference"], "status": "cancelled"},
                max_septets=max_septets,
            )

        if text == "4" and state.get("op_type", "transfer") == "transfer":
            state["step"] = "correction_beneficiary"
            txt, declared = render_phrase("ask_new_beneficiary", lang, max_septets=max_septets)
            return _reply(
                txt,
                "CORRECTION",
                declared,
                transaction={"id": state.get("reference"), "status": "pending"} if state.get("reference") else None,
                max_septets=max_septets,
            )

        if text == "3" or kw_intent == "CORRECTION":
            new_amt = None if text == "3" else parse_amount(text)
            # 1. Correction directe de montant via POST /transactions/{ref}/update si disponible (sinon cancel + recreate)
            if new_amt:
                if state.get("reference") and callable(getattr(bank, "update", None)):
                    res_u = bank.update(state["reference"], {"amount": new_amt})
                    if isinstance(res_u, tuple) and len(res_u) == 3:
                        ok_u, _st_u, tx_u = res_u
                    else:
                        ok_u, tx_u = False, {}
                    if ok_u and isinstance(tx_u, dict) and tx_u.get("id"):
                        state["amount"] = int(tx_u.get("amount", new_amt))
                        state["fee"] = tx_u.get("fee", 0)
                        state["total"] = tx_u.get("total", state["amount"] + state["fee"])
                        txt, declared = _format_recap(state, lang, max_septets)
                        return _reply(
                            txt,
                            "CORRECTION",
                            declared,
                            parameters={"amount": state["amount"], "fee": state["fee"], "total": state["total"], "currency": "XAF"},
                            options=["Confirmer", "Annuler", "Modifier"],
                            transaction={"id": state["reference"], "status": "pending"},
                            max_septets=max_septets,
                        )
                if state.get("reference"):
                    bank.cancel(state["reference"])
                    state["reference"] = None
                state["amount"] = new_amt
                return _create_pending_operation(state, phone, bank, lang, "CORRECTION", max_septets)

            # 2. Correction de bénéficiaire avant confirmation (ex: "modifier beneficiaire Franck" / "plutot a Carine")
            benef_clean = re.sub(
                r"\b(?:corriger|corrige|modifier|modifie|changer|change|finalement|plutot|tyende|tukwa|beneficiaire|destinataire|a|pour|vers|le|la|de)\b",
                " ",
                text,
                flags=re.IGNORECASE,
            ).strip(" ,.-:;")
            if text != "3" and state.get("op_type", "transfer") == "transfer" and len(benef_clean) >= 2:
                if state.get("reference"):
                    bank.cancel(state["reference"])
                    state["reference"] = None
                err_or_clarify = _resolve_beneficiary_or_clarify(state, benef_clean, phone, bank, lang, max_septets)
                if err_or_clarify:
                    return err_or_clarify
                return _create_pending_operation(state, phone, bank, lang, "CORRECTION", max_septets)

            state["step"] = "correction_amount"
            txt, declared = render_phrase("ask_new_amount", lang, max_septets=max_septets)
            return _reply(
                txt,
                "CORRECTION",
                declared,
                transaction={"id": state.get("reference"), "status": "pending"} if state.get("reference") else None,
                max_septets=max_septets,
            )

        txt, declared = render_phrase("confirm_prompt_retry", lang, max_septets=max_septets)
        return _reply(
            txt,
            "CLARIFICATION_NEEDED",
            declared,
            transaction={"id": state.get("reference"), "status": "pending"},
            max_septets=max_septets,
        )

    if step == "correction_beneficiary":
        if state.get("reference"):
            bank.cancel(state["reference"])
            state["reference"] = None
        err_or_clarify = _resolve_beneficiary_or_clarify(state, text, phone, bank, lang, max_septets)
        if err_or_clarify:
            return err_or_clarify
        return _create_pending_operation(state, phone, bank, lang, "CORRECTION", max_septets)

    if step == "correction_amount":
        new_amt = parse_amount(text)
        if new_amt:
            if state.get("reference") and callable(getattr(bank, "update", None)):
                res_u = bank.update(state["reference"], {"amount": new_amt})
                if isinstance(res_u, tuple) and len(res_u) == 3:
                    ok_u, _st_u, tx_u = res_u
                else:
                    ok_u, tx_u = False, {}
                if ok_u and isinstance(tx_u, dict) and tx_u.get("id"):
                    state["step"] = "confirm"
                    state["amount"] = int(tx_u.get("amount", new_amt))
                    state["fee"] = tx_u.get("fee", 0)
                    state["total"] = tx_u.get("total", state["amount"] + state["fee"])
                    txt, declared = _format_recap(state, lang, max_septets)
                    return _reply(
                        txt,
                        "CORRECTION",
                        declared,
                        parameters={"amount": state["amount"], "fee": state["fee"], "total": state["total"], "currency": "XAF"},
                        options=["Confirmer", "Annuler", "Modifier"],
                        transaction={"id": state["reference"], "status": "pending"},
                        max_septets=max_septets,
                    )
            if state.get("reference"):
                bank.cancel(state["reference"])
                state["reference"] = None
            state["amount"] = new_amt
            return _create_pending_operation(state, phone, bank, lang, "CORRECTION", max_septets)
        # Permet aussi de modifier le bénéficiaire (ex. taper "Brenda" après avoir choisi "3. Modifier")
        if state.get("op_type", "transfer") == "transfer" and len(text.strip()) >= 2:
            if state.get("reference"):
                bank.cancel(state["reference"])
                state["reference"] = None
            err_or_clarify = _resolve_beneficiary_or_clarify(state, text, phone, bank, lang, max_septets)
            if err_or_clarify:
                return err_or_clarify
            return _create_pending_operation(state, phone, bank, lang, "CORRECTION", max_septets)
        txt, declared = render_phrase("invalid_amount", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    # ── Choix bénéficiaire homonyme ──
    if step == "transfer_pick_benef":
        cands = state.get("candidates") or []
        if text.isdigit() and 1 <= int(text) <= len(cands):
            chosen = cands[int(text) - 1]
            state["to"] = chosen.get("phone")
            state["to_name"] = chosen.get("name") or _local_phone(chosen.get("phone"))
            state.pop("candidates", None)
            if state.get("amount"):
                return _create_pending_operation(state, phone, bank, lang, "TRANSFER", max_septets)
            state["step"] = "transfer_amount"
            txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"beneficiary": state["to_name"]}, max_septets=max_septets)
        choice_lines = "\n".join(f"{i}. {c.get('name', '?')} ({_local_phone(c.get('phone'))})" for i, c in enumerate(cands, start=1))
        txt, declared = render_phrase("ambiguous_benef", lang, max_septets=max_septets, choices=choice_lines)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    # ── Étapes Transfert ──
    if step == "transfer_to":
        err_or_clarify = _resolve_beneficiary_or_clarify(state, text, phone, bank, lang, max_septets)
        if err_or_clarify:
            return err_or_clarify
        if state.get("amount"):
            return _create_pending_operation(state, phone, bank, lang, "TRANSFER", max_septets)
        state["step"] = "transfer_amount"
        txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"beneficiary": state.get("to_name")}, max_septets=max_septets)

    if step == "transfer_amount":
        amt = parse_amount(text)
        if not amt:
            txt, declared = render_phrase("invalid_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["amount"] = amt
        return _create_pending_operation(state, phone, bank, lang, "TRANSFER", max_septets)

    # ── Étape Calcul de Frais ──
    if step == "fee_amount":
        amt = parse_amount(text)
        if not amt:
            txt, declared = render_phrase("invalid_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        return _do_fees(amt, bank, lang, max_septets)

    # ── Étapes Crédit (Airtime) ──
    if step == "airtime_target":
        if text == "1":
            state["to"] = phone
            state["step"] = "airtime_amount"
            txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"to": phone}, max_septets=max_septets)
        if text == "2":
            state["step"] = "airtime_phone"
            txt, declared = render_phrase("ask_airtime_phone", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        p = parse_phone(text)
        if p:
            state["to"] = p
            state["step"] = "airtime_amount"
            txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"to": p}, max_septets=max_septets)
        txt, declared = render_phrase("ask_airtime_target", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    if step == "airtime_phone":
        p = parse_phone(text)
        if not p:
            txt, declared = render_phrase("invalid_phone", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["to"] = p
        state["step"] = "airtime_amount"
        txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"to": p}, max_septets=max_septets)

    if step == "airtime_amount":
        amt = parse_amount(text)
        if not amt:
            txt, declared = render_phrase("invalid_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["amount"] = amt
        state["op_type"] = "airtime"
        return _create_pending_operation(state, phone, bank, lang, "AIRTIME_PURCHASE", max_septets)

    # ── Étapes Factures ──
    if step == "bill_pick":
        biller_map = {"1": "ENEO", "2": "CAMWATER", "3": "CANAL", "4": "CAMTEL"}
        biller = biller_map.get(text) or detect_biller(text)
        if not biller:
            txt, declared = render_phrase("ask_biller", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["biller"] = biller
        state["op_type"] = "bill"
        state["step"] = "bill_amount"
        txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"biller": biller}, max_septets=max_septets)

    if step == "bill_amount":
        amt = parse_amount(text)
        if not amt:
            txt, declared = render_phrase("invalid_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["amount"] = amt
        return _create_pending_operation(state, phone, bank, lang, "BILL_PAYMENT", max_septets)

    # ── Étape Terminologie ──
    if step == "term_pick":
        tmap = {"1": "fee", "2": "limit", "3": "beneficiary"}
        term_key = tmap.get(text) or detect_term_question(text) or "fee"
        txt, declared = render_phrase(f"term_{term_key}", lang, max_septets=max_septets)
        return _reply(txt, "TERM_EXPLANATION", declared, parameters={"term": term_key}, end=True, max_septets=max_septets)

    # ── Menu principal ou commande directe en langage naturel (Ewondo / Duala / FR / EN) ──
    if text == "1" or kw_intent == "BALANCE_INQUIRY":
        return _do_balance(phone, bank, lang, max_septets)

    if text == "2" or kw_intent == "TRANSFER":
        state["op_type"] = "transfer"
        amt = None if text == "2" else parse_amount(text)
        if amt:
            state["amount"] = amt
        if text != "2":
            err_or_clarify = _resolve_beneficiary_or_clarify(state, text, phone, bank, lang, max_septets)
            if err_or_clarify:
                return err_or_clarify
            if state.get("amount"):
                return _create_pending_operation(state, phone, bank, lang, "TRANSFER", max_septets)
            state["step"] = "transfer_amount"
            txt, declared = render_phrase("ask_amount", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, parameters={"beneficiary": state.get("to_name")}, max_septets=max_septets)
        state["step"] = "transfer_to"
        txt, declared = render_phrase("ask_transfer_to", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    if text == "3" or kw_intent == "FEE_INQUIRY":
        amt = None if text == "3" else parse_amount(text)
        if amt:
            return _do_fees(amt, bank, lang, max_septets)
        state["step"] = "fee_amount"
        txt, declared = render_phrase("ask_fee_amount", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    if text == "4" or kw_intent == "TRANSACTION_HISTORY":
        return _do_history(phone, bank, lang, max_septets)

    if text == "5" or kw_intent == "AIRTIME_PURCHASE":
        state["op_type"] = "airtime"
        amt = None if text == "5" else parse_amount(text)
        target_p = None if text == "5" else parse_phone(text)
        if amt and target_p:
            state["to"] = target_p
            state["amount"] = amt
            return _create_pending_operation(state, phone, bank, lang, "AIRTIME_PURCHASE", max_septets)
        state["step"] = "airtime_target"
        txt, declared = render_phrase("ask_airtime_target", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    if text == "6" or kw_intent == "BILL_PAYMENT":
        state["op_type"] = "bill"
        biller = None if text == "6" else detect_biller(text)
        amt = None if text == "6" else parse_amount(text)
        if biller and amt:
            state["biller"] = biller
            state["amount"] = amt
            return _create_pending_operation(state, phone, bank, lang, "BILL_PAYMENT", max_septets)
        state["step"] = "bill_pick"
        txt, declared = render_phrase("ask_biller", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    if text == "7":
        state["step"] = "term_pick"
        txt, declared = render_phrase("ask_term", lang, max_septets=max_septets)
        return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)

    # Canal ATM : retrait en multiples de 5 000 FCFA
    if channel == "atm" or kw_intent == "WITHDRAWAL":
        amt = parse_amount(text)
        if not amt or amt % 5000 != 0:
            txt, declared = render_phrase("atm_multiple", lang, max_septets=max_septets)
            return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
        state["op_type"] = "withdrawal"
        state["amount"] = amt
        return _create_pending_operation(state, phone, bank, lang, "TRANSFER", max_septets)

    state["step"] = "menu"
    txt, declared = render_phrase("menu", lang, max_septets=max_septets)
    return _reply(txt, "CLARIFICATION_NEEDED", declared, max_septets=max_septets)
