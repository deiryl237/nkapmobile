from io import BytesIO
import asyncio
from pathlib import Path
import wave

import httpx
import pytest

from app.config import Settings
from app.main import create_app
from app.models import TranslationPipeline, TranslationResult
from app.service import VoiceService


def wav_bytes() -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes(b"\x00\x00" * 16000)
    return output.getvalue()


class FakeTranslator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    def translate(self, text: str, source: str, target: str) -> str:
        self.calls.append((text, source, target))
        return f"ewo:{text}"

    def close(self) -> None:
        pass


class FakeSynthesizer:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def synthesize(self, text: str) -> bytes:
        self.calls.append(text)
        return wav_bytes()

    def close(self) -> None:
        pass


@pytest.fixture
def fake_service(tmp_path: Path) -> VoiceService:
    return VoiceService(
        Settings(output_dir=tmp_path),
        TranslationPipeline(FakeTranslator()),
        FakeSynthesizer(),
    )


def test_translation_english_and_french_use_the_same_model() -> None:
    translator = FakeTranslator()
    pipeline = TranslationPipeline(translator)

    english = pipeline.translate("Good morning", "en")
    french = pipeline.translate("Bonjour", "fr")

    assert english == TranslationResult("ewo:Good morning")
    assert french == TranslationResult("ewo:Bonjour")
    assert translator.calls == [
        ("Good morning", "en", "ewo"),
        ("Bonjour", "fr", "ewo"),
    ]


def test_ewondo_input_is_not_sent_for_translation() -> None:
    translator = FakeTranslator()
    pipeline = TranslationPipeline(translator)

    result = pipeline.translate("Mə̀kɔ́lɔ́", "ewo")

    assert result == TranslationResult("Mə̀kɔ́lɔ́")
    assert translator.calls == []


def test_synthesize_writes_cached_wav(fake_service: VoiceService) -> None:
    result, audio_id, cache_hit = fake_service.synthesize("Bonjour", "fr")
    audio_path = fake_service.audio_path(audio_id)

    assert result.text == "ewo:Bonjour"
    assert cache_hit is False
    assert audio_path.is_file()
    assert audio_path.read_bytes().startswith(b"RIFF")
    assert fake_service.sample_rate(audio_id) == 16000
    assert fake_service.duration_ms(audio_id) == 1000

    _, same_audio_id, second_cache_hit = fake_service.synthesize("Bonjour", "fr")
    assert same_audio_id == audio_id
    assert second_cache_hit is True


def test_api_returns_translation_and_retrievable_audio(
    fake_service: VoiceService,
) -> None:
    app = create_app(lambda _: fake_service)

    async def send_requests() -> None:
        transport = httpx.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(
                transport=transport, base_url="http://voice.test"
            ) as client:
                await assert_api_responses(client)

    async def assert_api_responses(client: httpx.AsyncClient) -> None:
        translation_response = await client.post(
            "/v1/translate", json={"text": "Bonjour", "source_lang": "fr"}
        )
        assert translation_response.status_code == 200
        assert translation_response.json()["text"] == "ewo:Bonjour"

        response = await client.post(
            "/v1/synthesize",
            json={"text": "Good morning", "source_lang": "en"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["text"] == "ewo:Good morning"
        assert body["audio_format"] == "wav"
        assert body["mode_used"] == "neural"
        assert body["sample_rate"] == 16000
        assert body["duration_ms"] == 1000

        audio_response = await client.get(body["audio_url"])
        assert audio_response.status_code == 200
        assert audio_response.headers["content-type"] == "audio/wav"
        assert audio_response.content.startswith(b"RIFF")

        direct_audio_response = await client.post(
            "/v1/tts", json={"text": "Mə̀kɔ́lɔ́"}
        )
        assert direct_audio_response.status_code == 200
        assert direct_audio_response.headers["content-type"] == "audio/wav"
        assert direct_audio_response.content.startswith(b"RIFF")

        invalid_language_response = await client.post(
            "/v1/translate",
            json={"text": "Hello", "source_lang": "de"},
        )
        assert invalid_language_response.status_code == 422

    asyncio.run(send_requests())
