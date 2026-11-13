from pathlib import Path

import numpy as np
import pytest

from app.config import Settings
from app.main import create_app
from app.models import TranslationPipeline
from app.service import VoiceService


class FakeEwondoTranslator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    def translate(self, text: str, source: str, target: str) -> str:
        self.calls.append((text, source, target))
        return f"ewo:{text}"


class FakeEnglishTranslator:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def translate(self, text: str) -> str:
        self.calls.append(text)
        return f"fr:{text}"


class FakeSynthesizer:
    sample_rate = 16000

    def __init__(self) -> None:
        self.calls: list[str] = []

    def synthesize(self, text: str) -> np.ndarray:
        self.calls.append(text)
        return np.full(self.sample_rate, 0.25, dtype=np.float32)


@pytest.fixture
def fake_service(tmp_path: Path) -> VoiceService:
    settings = Settings(output_dir=tmp_path)
    translator = TranslationPipeline(
        FakeEwondoTranslator(), FakeEnglishTranslator()
    )
    return VoiceService(settings, translator, FakeSynthesizer())


def test_translation_english_uses_french_pivot() -> None:
    english = FakeEnglishTranslator()
    ewondo = FakeEwondoTranslator()
    pipeline = TranslationPipeline(ewondo, english)

    result = pipeline.translate("Good morning", "en")

    assert english.calls == ["Good morning"]
    assert ewondo.calls == [("fr:Good morning", "fr", "ewo")]
    assert result.text == "ewo:fr:Good morning"
    assert result.intermediate_text == "fr:Good morning"


def test_ewondo_input_is_not_translated() -> None:
    ewondo = FakeEwondoTranslator()
    pipeline = TranslationPipeline(ewondo, FakeEnglishTranslator())

    result = pipeline.translate("Mə̀kɔ́lɔ́", "ewo")

    assert result.text == "Mə̀kɔ́lɔ́"
    assert ewondo.calls == []


def test_synthesize_writes_cached_wav(fake_service: VoiceService) -> None:
    result, audio_id, cache_hit = fake_service.synthesize("Bonjour", "fr")
    audio_path = fake_service.audio_path(audio_id)

    assert result.text == "ewo:Bonjour"
    assert cache_hit is False
    assert audio_path.is_file()
    assert audio_path.read_bytes().startswith(b"RIFF")

    _, same_audio_id, second_cache_hit = fake_service.synthesize("Bonjour", "fr")
    assert same_audio_id == audio_id
    assert second_cache_hit is True


def test_api_returns_translation_and_retrievable_audio(fake_service: VoiceService) -> None:
    from fastapi.testclient import TestClient

    app = create_app(lambda _: fake_service)
    with TestClient(app) as client:
        translation_response = client.post(
            "/v1/translate",
            json={"text": "Bonjour", "source_lang": "fr"},
        )
        assert translation_response.status_code == 200
        assert translation_response.json()["text"] == "ewo:Bonjour"

        response = client.post(
            "/v1/synthesize",
            json={"text": "Good morning", "source_lang": "en"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["text"] == "ewo:fr:Good morning"
        assert body["intermediate_text"] == "fr:Good morning"
        assert body["audio_format"] == "wav"
        assert body["mode_used"] == "neural"
        assert body["duration_ms"] == 1000

        audio_response = client.get(body["audio_url"])
        assert audio_response.status_code == 200
        assert audio_response.headers["content-type"] == "audio/wav"
        assert audio_response.content.startswith(b"RIFF")

        direct_audio_response = client.post(
            "/v1/tts", json={"text": "Mə̀kɔ́lɔ́"}
        )
        assert direct_audio_response.status_code == 200
        assert direct_audio_response.headers["content-type"] == "audio/wav"
        assert direct_audio_response.content.startswith(b"RIFF")

        invalid_language_response = client.post(
            "/v1/translate",
            json={"text": "Hello", "source_lang": "de"},
        )
        assert invalid_language_response.status_code == 422
