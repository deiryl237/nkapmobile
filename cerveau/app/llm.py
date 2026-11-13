from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
import requests

load_dotenv()

logger = logging.getLogger("nkap.llm")


class LLMAdapter:
    """Adaptateur LLM hybride : OpenRouter, Hugging Face, Ollama local et heuristique."""

    def __init__(
        self,
        model_name: str | None = None,
        api_key: str | None = None,
        ollama_host: str | None = None,
        ollama_model: str | None = None,
        openrouter_api_key: str | None = None,
        openrouter_model: str | None = None,
        openrouter_base_url: str | None = None,
    ):
        self.model_name = model_name or os.getenv("HF_MODEL") or "mistralai/Mistral-7B-Instruct-v0.2"
        self.api_key = api_key or os.getenv("HF_TOKEN")
        self.api_url = (
            os.getenv("HF_API_URL")
            or f"https://router.huggingface.co/hf-inference/models/{self.model_name}"
        )

        self.openrouter_api_key = (
            openrouter_api_key or os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_KEY")
        )
        self.openrouter_model = (
            openrouter_model or os.getenv("OPENROUTER_MODEL") or "openai/gpt-oss-20b"
        )
        self.openrouter_base_url = (
            openrouter_base_url
            or os.getenv("OPENROUTER_BASE_URL")
            or "https://openrouter.ai/api/v1/chat/completions"
        ).rstrip("/")

        self.ollama_host = (
            ollama_host or os.getenv("OLLAMA_HOST") or "http://localhost:11434"
        ).rstrip("/")
        self.ollama_model = (
            ollama_model or os.getenv("OLLAMA_MODEL") or "mistral:7b"
        )

        self.last_error: str | None = None
        self.last_engine: str | None = None

    @staticmethod
    def parse_model_json(raw: str) -> dict[str, Any]:
        text = (raw or "").strip()
        if not text:
            raise ValueError("Réponse LLM vide")

        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()

        if text.lower().startswith("json"):
            text = text[4:].strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Recherche de la première accolade ouvrante et de la dernière fermante
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                candidate = text[start : end + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Impossible de parser la réponse JSON du LLM: {text[:200]}")

    def _query_openrouter(self, prompt: str) -> dict[str, Any]:
        if not self.openrouter_api_key:
            raise ValueError("OPENROUTER_API_KEY manquant")

        headers = {
            "Authorization": f"Bearer {self.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "NKAP Money",
        }
        payload = {
            "model": self.openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 220,
        }

        response = requests.post(self.openrouter_base_url, headers=headers, json=payload, timeout=30)
        if response.status_code == 401:
            raise ValueError("Clé OpenRouter invalide")
        if response.status_code in {402, 403}:
            raise ValueError(f"Quota ou accès OpenRouter restreint ({response.status_code}): {response.text}")
        response.raise_for_status()

        data = response.json()
        if isinstance(data, dict):
            choices = data.get("choices") or []
            if not choices:
                if "error" in data:
                    raise ValueError(data["error"])
                raise ValueError(f"Format de réponse inattendu depuis OpenRouter: {data!r}")

            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, list):
                content = "".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            if isinstance(content, dict):
                content = content.get("text") or content.get("content")
            if not isinstance(content, str):
                raise ValueError(f"Réponse OpenRouter sans texte exploitable: {data!r}")
            return self.parse_model_json(content)

        raise ValueError(f"Format de réponse inattendu depuis OpenRouter: {data!r}")

    def _query_huggingface(self, prompt: str) -> dict[str, Any]:
        if not self.api_key:
            raise ValueError("HF_TOKEN manquant")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 200,
                "temperature": 0.1,
                "return_full_text": False,
            },
            "options": {"wait_for_model": True},
        }

        response = requests.post(self.api_url, headers=headers, json=payload, timeout=20)
        if response.status_code == 401:
            raise ValueError("Token Hugging Face invalide")
        if response.status_code in {402, 403}:
            raise ValueError(f"Quota ou accès Hugging Face restreint ({response.status_code}): {response.text}")
        response.raise_for_status()

        data = response.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            if "generated_text" in data[0]:
                return self.parse_model_json(data[0]["generated_text"])
            if "error" in data[0]:
                raise ValueError(data[0]["error"])
        elif isinstance(data, dict):
            if "generated_text" in data:
                return self.parse_model_json(data["generated_text"])
            if "error" in data:
                raise ValueError(data["error"])

        raise ValueError(f"Format de réponse inattendu depuis Hugging Face: {data!r}")

    def _query_ollama(self, prompt: str) -> dict[str, Any]:
        url = f"{self.ollama_host}/api/generate"
        payload = {
            "model": self.ollama_model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,
                "num_predict": 180,
            },
        }
        response = requests.post(url, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()
        raw_text = data.get("response", "")
        return self.parse_model_json(raw_text)

    def generate(self, prompt: str) -> dict[str, Any]:
        self.last_error = None
        self.last_engine = None

        # 1. Tentative OpenRouter (prioritaire si clé configurée)
        if self.openrouter_api_key:
            try:
                result = self._query_openrouter(prompt)
                self.last_engine = "openrouter"
                return result
            except Exception as exc:
                self.last_error = f"OpenRouter error: {exc}"
                logger.warning("Échec OpenRouter, tentative Hugging Face: %s", exc)

        # 2. Tentative Hugging Face (si clé disponible)
        if self.api_key:
            try:
                result = self._query_huggingface(prompt)
                self.last_engine = "huggingface"
                return result
            except Exception as exc:
                prev_err = f"{self.last_error} | " if self.last_error else ""
                self.last_error = f"{prev_err}HF error: {exc}"
                logger.warning("Échec Hugging Face, basculement vers Ollama: %s", exc)

        # 3. Fallback souverain direct sur Ollama local
        try:
            result = self._query_ollama(prompt)
            self.last_engine = "ollama"
            return result
        except Exception as exc:
            prev_err = f"{self.last_error} | " if self.last_error else ""
            self.last_error = f"{prev_err}Ollama error: {exc}"
            logger.warning("Échec Ollama, utilisation du repli heuristique: %s", exc)

        # 4. Repli heuristique (garantit zéro plantage)
        self.last_engine = "heuristic"
        return self._fallback_response(prompt)

    def _fallback_response(self, prompt: str) -> dict[str, Any]:
        prompt_lower = (prompt or "").lower()
        if any(w in prompt_lower for w in ["solde", "balance", "ndɛn", "combien"]):
            # Recherche d'un montant potentiel dans le prompt s'il contient le screen_context
            amount_match = re.search(r"(\d[\d\s]*\s?FCFA)", prompt, re.IGNORECASE)
            amount = amount_match.group(1).strip() if amount_match else "42 500 FCFA"
            return {"intent": "check_balance", "amount": amount}
        if any(w in prompt_lower for w in ["transfert", "transferer", "envoyer", "ŋgɔ"]):
            return {"intent": "transfer", "amount": None}
        return {"intent": "unknown", "amount": None}
