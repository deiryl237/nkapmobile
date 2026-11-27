from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import wave
from typing import Protocol

import numpy as np

from .config import Settings


class TextTranslator(Protocol):
    def translate(self, text: str, source: str, target: str) -> str: ...

    def close(self) -> None: ...


class SpeechSynthesizer(Protocol):
    def synthesize(self, text: str) -> bytes: ...

    def close(self) -> None: ...


@dataclass(frozen=True)
class TranslationResult:
    text: str
    intermediate_text: str | None = None


class TranslationPipeline:
    def __init__(self, translator: TextTranslator) -> None:
        self._translator = translator

    def translate(self, text: str, source_lang: str) -> TranslationResult:
        if source_lang == "ewo":
            return TranslationResult(text=text)
        return TranslationResult(
            text=self._translator.translate(text, source_lang, "ewo")
        )

    def close(self) -> None:
        self._translator.close()


class MarianEwondoTranslator:
    def __init__(self, model_path: Path, device: str) -> None:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        _require_local_model(model_path, "traduction Ewondo")
        self._torch = torch
        self._device = _resolve_device(torch, device)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=True
        )
        self._model = AutoModelForSeq2SeqLM.from_pretrained(
            model_path,
            local_files_only=True,
        ).to(self._device)
        self._model.eval()

    def translate(self, text: str, source: str, target: str) -> str:
        if source not in {"fr", "en"} or target != "ewo":
            raise ValueError(f"Direction de traduction non prise en charge : {source}→{target}.")

        inputs = self._tokenizer(
            f">>{target}<< {text}",
            return_tensors="pt",
            truncation=False,
        )
        _check_input_length(inputs["input_ids"].shape[-1], self._model.config)
        inputs = inputs.to(self._device)
        with self._torch.inference_mode():
            output_ids = self._model.generate(
                **inputs,
                num_beams=4,
                max_new_tokens=128,
            )
        translated = self._tokenizer.decode(
            output_ids[0], skip_special_tokens=True
        ).strip()
        if not translated:
            raise RuntimeError("Le modèle de traduction a renvoyé un texte vide.")
        return translated

    def close(self) -> None:
        del self._model
        del self._tokenizer


class VitsEwondoSynthesizer:
    def __init__(self, model_path: Path, device: str) -> None:
        import torch
        from transformers import AutoTokenizer, VitsModel

        _require_local_model(model_path, "synthèse vocale Ewondo")
        self._torch = torch
        self._device = _resolve_device(torch, device)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=True
        )
        self._model = VitsModel.from_pretrained(
            model_path,
            local_files_only=True,
        ).to(self._device)
        self._model.eval()
        self._sample_rate = int(self._model.config.sampling_rate)

    def synthesize(self, text: str) -> bytes:
        inputs = self._tokenizer(text, return_tensors="pt").to(self._device)
        with self._torch.inference_mode():
            waveform = self._model(**inputs).waveform.squeeze().cpu().numpy()

        if waveform.size == 0 or not np.isfinite(waveform).all():
            raise RuntimeError("Le modèle TTS a renvoyé un audio vide ou invalide.")

        pcm = (np.clip(waveform, -1.0, 1.0) * 32767).astype("<i2")
        output = BytesIO()
        with wave.open(output, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self._sample_rate)
            wav_file.writeframes(pcm.tobytes())
        return output.getvalue()

    def close(self) -> None:
        del self._model
        del self._tokenizer


def build_translation_pipeline(settings: Settings) -> TranslationPipeline:
    return TranslationPipeline(
        MarianEwondoTranslator(settings.translation_model_path, settings.device)
    )


def build_synthesizer(settings: Settings) -> VitsEwondoSynthesizer:
    return VitsEwondoSynthesizer(settings.tts_model_path, settings.device)


def _require_local_model(model_path: Path, label: str) -> None:
    if not model_path.is_dir():
        raise FileNotFoundError(
            f"Modèle local « {label} » introuvable dans {model_path}. "
            "Téléchargez-le avec `python -m scripts.download_models`."
        )


def _resolve_device(torch, requested_device: str):
    if requested_device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested_device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("VOIX_DEVICE=cuda, mais aucun GPU CUDA n'est disponible.")
    return torch.device(requested_device)


def _check_input_length(token_count: int, config) -> None:
    max_positions = getattr(config, "max_position_embeddings", None)
    if max_positions is not None and token_count > max_positions:
        raise ValueError(
            f"Le texte dépasse la limite du modèle ({max_positions} tokens)."
        )

