"""Client HTTP de l'API bancaire simulée SAFINUM (propage X-Team-Key et X-Trace-Id)."""

from __future__ import annotations

import os
import urllib.parse
from typing import Any

import requests


class SafinumBankClient:
    def __init__(
        self,
        base_url: str | None = None,
        trace_id: str | None = None,
        team_key: str | None = None,
        timeout_s: float = 2.4,
    ):
        self.root = (
            base_url
            or os.getenv("SAFINUM_BANK_URL")
            or "https://safinum.cm/api/v1"
        ).rstrip("/")
        self.trace_id = trace_id
        self.team_key = team_key if team_key is not None else os.getenv("SAFINUM_TEAM_KEY", "")
        self.timeout_s = timeout_s

    def call(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> tuple[bool, int, dict[str, Any]]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Team-Key": self.team_key,
        }
        if self.trace_id:
            headers["X-Trace-Id"] = self.trace_id

        try:
            resp = requests.request(
                method=method,
                url=f"{self.root}{path}",
                headers=headers,
                json=body,
                timeout=self.timeout_s,
            )
            try:
                data = resp.json() if resp.content else {}
            except ValueError:
                data = {}
            return resp.ok, resp.status_code, data if isinstance(data, dict) else {"items": data}
        except requests.RequestException as exc:
            return False, 0, {"error": "UNREACHABLE", "message": str(exc)}

    def balance(self, phone: str) -> tuple[bool, int, dict[str, Any]]:
        return self.call("GET", f"/accounts/{_q(phone)}")

    def history(self, phone: str, limit: int = 5) -> tuple[bool, int, dict[str, Any]]:
        return self.call("GET", f"/accounts/{_q(phone)}/transactions?limit={int(limit)}")

    def beneficiaries(self, query: str | None = None, phone: str | None = None) -> tuple[bool, int, dict[str, Any]]:
        """Recherche un bénéficiaire par nom (`q`) OU par numéro (`phone`). Ne jamais passer le numéro de l'expéditeur ici !"""
        params: list[str] = []
        if query:
            params.append(f"q={_q(query)}")
        if phone:
            params.append(f"phone={_q(phone)}")
        qs = "&".join(params)
        return self.call("GET", f"/beneficiaries?{qs}" if qs else "/beneficiaries")

    def fees(self, kind: str, amount: int) -> tuple[bool, int, dict[str, Any]]:
        return self.call("GET", f"/fees?type={_q(kind)}&amount={int(amount)}")

    def create_transaction(self, body: dict[str, Any]) -> tuple[bool, int, dict[str, Any]]:
        return self.call("POST", "/transactions", body)

    def update(self, reference: str, body: dict[str, Any]) -> tuple[bool, int, dict[str, Any]]:
        return self.call("POST", f"/transactions/{_q(reference)}/update", body)

    def confirm(self, reference: str) -> tuple[bool, int, dict[str, Any]]:
        return self.call("POST", f"/transactions/{_q(reference)}/confirm", {})

    def cancel(self, reference: str) -> tuple[bool, int, dict[str, Any]]:
        return self.call("POST", f"/transactions/{_q(reference)}/cancel", {})


def _q(value: Any) -> str:
    return urllib.parse.quote(str(value or ""), safe="")
