import json
import pytest

from app.llm import LLMAdapter


def test_parse_json_from_markdown_block():
    payload = '''
```json
{
  "intent": "check_balance",
  "amount": "42 500 FCFA"
}
```
'''
    result = LLMAdapter.parse_model_json(payload)
    assert result["intent"] == "check_balance"
    assert result["amount"] == "42 500 FCFA"


def test_parse_json_from_plain_text():
    payload = '{"intent": "check_balance", "amount": "42 500 FCFA"}'
    result = LLMAdapter.parse_model_json(payload)
    assert result["intent"] == "check_balance"


def test_ollama_fallback_when_hf_fails(monkeypatch):
    """Vérifie que si Hugging Face échoue, le système bascule immédiatement sur Ollama local."""
    def fake_post(url, **kwargs):
        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                if "huggingface" in url:
                    raise ValueError("Quota HF dépassé (402)")
                # Réponse Ollama
                return {"response": json.dumps({"intent": "check_balance", "amount": "42 500 FCFA"})}

        return FakeResponse()

    monkeypatch.setattr("app.llm.requests.post", fake_post)

    adapter = LLMAdapter(api_key="fake-hf-token")
    result = adapter.generate("Quel est mon solde ?")

    assert result["intent"] == "check_balance"
    assert adapter.last_engine == "ollama"


def test_openrouter_used_before_hf_and_ollama(monkeypatch):
    """Vérifie que OpenRouter est prioritaire quand une clé et un modèle sont configurés."""
    def fake_post(url, **kwargs):
        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {"message": {"content": json.dumps({"intent": "check_balance", "amount": "42 500 FCFA"})}}
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr("app.llm.requests.post", fake_post)

    adapter = LLMAdapter(
        model_name="openai/gpt-oss-20b",
        api_key="hf_optional_token",
        openrouter_api_key="or_valid_token",
    )
    result = adapter.generate("Quel est mon solde ?")

    assert result["intent"] == "check_balance"
    assert adapter.last_engine == "openrouter"


def test_heuristic_fallback_when_both_fail(monkeypatch):
    """Vérifie que si HF et Ollama échouent tous les deux, l'heuristique prend le relais sans planter."""
    def fake_failing_post(url, **kwargs):
        raise ConnectionError("Service inaccessible")

    monkeypatch.setattr("app.llm.requests.post", fake_failing_post)

    adapter = LLMAdapter(api_key="fake-token")
    result = adapter.generate("Quel est mon solde s'il vous plaît ?")

    assert result["intent"] == "check_balance"
    assert adapter.last_engine == "heuristic"
    assert adapter.last_error is not None
