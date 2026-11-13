import hashlib
from io import BytesIO
import os
from pathlib import Path
import tempfile
import wave

from .config import Settings
from .models import (
    SpeechSynthesizer,
    TranslationPipeline,
    TranslationResult,
    build_synthesizer,
    build_translation_pipeline,
)


class VoiceService:
    def __init__(
        self,
        settings: Settings,
        translator: TranslationPipeline,
        synthesizer: SpeechSynthesizer,
    ) -> None:
        self._settings = settings
        self._translator = translator
        self._synthesizer = synthesizer
        self._settings.output_dir.mkdir(parents=True, exist_ok=True)

    def translate(self, text: str, source_lang: str) -> TranslationResult:
        return self._translator.translate(text, source_lang)

    def synthesize(
        self, text: str, source_lang: str = "ewo"
    ) -> tuple[TranslationResult, str, bool]:
        translated = self._translator.translate(text, source_lang)
        cache_key = (
            f"{self._settings.translation_model_id}@"
            f"{self._settings.translation_revision}\0"
            f"{self._settings.tts_model_id}@{self._settings.tts_revision}\0"
            f"{translated.text}"
        )
        audio_id = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:32]
        output_path = self._audio_path(audio_id)
        cache_hit = output_path.is_file()
        if not cache_hit:
            audio = self._synthesizer.synthesize(translated.text)
            self._validate_audio(audio)
            self._write_audio_atomically(output_path, audio)
        return translated, audio_id, cache_hit

    def audio_path(self, audio_id: str) -> Path:
        return self._audio_path(audio_id)

    def close(self) -> None:
        self._translator.close()
        self._synthesizer.close()

    def sample_rate(self, audio_id: str) -> int:
        with wave.open(str(self._audio_path(audio_id)), "rb") as wav_file:
            return wav_file.getframerate()

    def duration_ms(self, audio_id: str) -> int:
        with wave.open(str(self._audio_path(audio_id)), "rb") as wav_file:
            return round(wav_file.getnframes() * 1000 / wav_file.getframerate())

    def _audio_path(self, audio_id: str) -> Path:
        return self._settings.output_dir / f"{audio_id}.wav"

    @staticmethod
    def _validate_audio(audio: bytes) -> None:
        try:
            with wave.open(BytesIO(audio), "rb") as wav_file:
                if wav_file.getnframes() == 0 or wav_file.getframerate() <= 0:
                    raise ValueError("Le serveur TTS a renvoyé un audio WAV vide.")
        except (wave.Error, EOFError) as exc:
            raise ValueError(
                "Le serveur TTS Hugging Face doit renvoyer un fichier WAV valide."
            ) from exc

    @staticmethod
    def _write_audio_atomically(destination: Path, audio: bytes) -> None:
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=destination.parent,
                prefix=f".{destination.stem}-",
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)
                temp_file.write(audio)
            os.replace(temp_path, destination)
        finally:
            if temp_path is not None and temp_path.exists():
                temp_path.unlink()


def build_voice_service(settings: Settings) -> VoiceService:
    return VoiceService(
        settings=settings,
        translator=build_translation_pipeline(settings),
        synthesizer=build_synthesizer(settings),
    )
