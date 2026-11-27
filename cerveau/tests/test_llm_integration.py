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


def test_ollama_local_open_weight_inference(monkeypatch):
    """Vérifie l'appel au modèle open-weight local via Ollama (aucune API cloud)."""
    def fake_post(url, **kwargs):
        assert url == "http://localhost:11434/api/generate"

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"response": json.dumps({"intent": "check_balance", "amount": "42 500 FCFA"})}

        return FakeResponse()

    monkeypatch.setattr("app.llm.requests.post", fake_post)

    adapter = LLMAdapter(ollama_host="http://localhost:11434")
    result = adapter.generate("Quel est mon solde ?")

    assert result["intent"] == "check_balance"
    assert adapter.last_engine == "ollama"


def test_local_openai_fallback_to_ollama(monkeypatch):
    """Vérifie le basculement sur Ollama local si un serveur llama.cpp/vLLM configuré échoue."""
    def fake_post(url, **kwargs):
        if "8080" in url:
            raise ConnectionError("llama.cpp éteint")

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"response": json.dumps({"intent": "fees", "amount": None})}

        return FakeResponse()

    monkeypatch.setattr("app.llm.requests.post", fake_post)

    adapter = LLMAdapter(local_llm_url="http://127.0.0.1:8080/v1/chat/completions")
    result = adapter.generate("Combien coûtent les frais ?")

    assert result["intent"] == "fees"
    assert adapter.last_engine == "ollama"


def test_heuristic_fallback_when_local_engines_fail(monkeypatch):
    """Vérifie que si les moteurs locaux échouent, l'heuristique prend le relais sans planter."""
    def fake_failing_post(url, **kwargs):
        raise ConnectionError("Service inaccessible")

    monkeypatch.setattr("app.llm.requests.post", fake_failing_post)

    adapter = LLMAdapter(ollama_host="http://localhost:11434")
    result = adapter.generate("Quel est mon solde s'il vous plaît ?")

    assert result["intent"] == "check_balance"
    assert adapter.last_engine == "heuristic"
    assert adapter.last_error is not None
