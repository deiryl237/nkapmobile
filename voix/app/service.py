import hashlib
import os
from pathlib import Path
import tempfile
import threading
import wave

import numpy as np

from .config import Settings
from .models import (
    SpeechSynthesizer,
    TranslationPipeline,
    TranslationResult,
    VitsEwondoSynthesizer,
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
        self._inference_lock = threading.RLock()

    @property
    def sample_rate(self) -> int:
        return self._synthesizer.sample_rate

    def translate(self, text: str, source_lang: str) -> TranslationResult:
        with self._inference_lock:
            return self._translator.translate(text, source_lang)

    def synthesize(
        self, text: str, source_lang: str = "ewo"
    ) -> tuple[TranslationResult, str, bool]:
        with self._inference_lock:
            translated = self._translator.translate(text, source_lang)
            cache_key = (
                f"{self._settings.tts_model_id}@{self._settings.tts_revision}"
                f":{self._settings.tts_model_path.resolve()}\0{translated.text}"
            )
            audio_id = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:32]
            output_path = self._audio_path(audio_id)
            cache_hit = output_path.is_file()
            if not cache_hit:
                waveform = self._synthesizer.synthesize(translated.text)
                self._write_wav_atomically(output_path, waveform)
            return translated, audio_id, cache_hit

    def audio_path(self, audio_id: str) -> Path:
        return self._audio_path(audio_id)

    def duration_ms(self, audio_id: str) -> int:
        with wave.open(str(self._audio_path(audio_id)), "rb") as wav_file:
            return round(wav_file.getnframes() * 1000 / wav_file.getframerate())

    def _audio_path(self, audio_id: str) -> Path:
        return self._settings.output_dir / f"{audio_id}.wav"

    def _write_wav_atomically(self, destination: Path, waveform: np.ndarray) -> None:
        samples = np.asarray(waveform, dtype=np.float32).reshape(-1)
        if samples.size == 0:
            raise ValueError("Le modèle TTS a renvoyé un audio vide.")
        if not np.isfinite(samples).all():
            raise ValueError("Le modèle TTS a renvoyé des valeurs audio invalides.")

        pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=destination.parent,
                prefix=f".{destination.stem}-",
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)
            with wave.open(str(temp_path), "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(self._synthesizer.sample_rate)
                wav_file.writeframes(pcm.tobytes())
            os.replace(temp_path, destination)
        finally:
            if temp_path is not None and temp_path.exists():
                temp_path.unlink()


def build_voice_service(settings: Settings) -> VoiceService:
    return VoiceService(
        settings=settings,
        translator=build_translation_pipeline(settings),
        synthesizer=VitsEwondoSynthesizer(
            settings.tts_model_path, settings.device
        ),
    )
