from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from .config import Settings


class TextTranslator(Protocol):
    def translate(self, text: str, source: str, target: str) -> str: ...


class EnglishToFrenchTranslator(Protocol):
    def translate(self, text: str) -> str: ...


class SpeechSynthesizer(Protocol):
    @property
    def sample_rate(self) -> int: ...

    def synthesize(self, text: str) -> np.ndarray: ...


@dataclass(frozen=True)
class TranslationResult:
    text: str
    intermediate_text: str | None = None


class TranslationPipeline:
    def __init__(
        self,
        ewondo_translator: TextTranslator,
        english_translator: EnglishToFrenchTranslator,
    ) -> None:
        self._ewondo_translator = ewondo_translator
        self._english_translator = english_translator

    def translate(self, text: str, source_lang: str) -> TranslationResult:
        if source_lang == "ewo":
            return TranslationResult(text=text)

        if source_lang == "en":
            french_text = self._english_translator.translate(text)
            return TranslationResult(
                text=self._ewondo_translator.translate(french_text, "fr", "ewo"),
                intermediate_text=french_text,
            )

        return TranslationResult(
            text=self._ewondo_translator.translate(text, "fr", "ewo")
        )


class MarianEnglishToFrench:
    def __init__(self, model_path: Path, device: str) -> None:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        _require_local_model(model_path, "Anglais-français")
        self._device = _resolve_device(torch, device)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=True
        )
        self._model = AutoModelForSeq2SeqLM.from_pretrained(
            model_path,
            local_files_only=True,
            torch_dtype=_model_dtype(torch, self._device),
        ).to(self._device)
        self._model.eval()

    def translate(self, text: str) -> str:
        inputs = self._tokenizer(text, return_tensors="pt", truncation=False)
        _check_input_length(inputs["input_ids"].shape[-1], self._model.config)
        inputs = inputs.to(self._device)
        with self._torch_inference_mode():
            output_ids = self._model.generate(**inputs, max_new_tokens=256)
        return self._tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    def _torch_inference_mode(self):
        import torch

        return torch.inference_mode()


class GriotEwondoTranslator:
    def __init__(self, model_path: Path, device: str) -> None:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        _require_local_model(model_path, "Griot-MT français-ewondo")
        adapter_path = model_path / "adapters" / "ewo"
        if not adapter_path.is_dir():
            raise FileNotFoundError(
                f"Adaptateur Ewondo introuvable dans {adapter_path}. "
                "Relancez `python -m scripts.download_models`."
            )

        self._device = _resolve_device(torch, device)
        dtype = _model_dtype(torch, self._device)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=True
        )
        base_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_path,
            local_files_only=True,
            torch_dtype=dtype,
        ).to(self._device)
        self._model = PeftModel.from_pretrained(
            base_model,
            str(model_path),
            subfolder="adapters/ewo",
        )
        self._model.eval()

    def translate(self, text: str, source: str, target: str) -> str:
        language_tokens = {"fr": "fra_Latn", "ewo": "ewo_Latn"}
        self._tokenizer.src_lang = language_tokens[source]
        inputs = self._tokenizer(text, return_tensors="pt", truncation=False)
        _check_input_length(inputs["input_ids"].shape[-1], self._model.config)
        inputs = inputs.to(self._device)
        target_token_id = self._tokenizer.convert_tokens_to_ids(
            language_tokens[target]
        )
        with self._torch_inference_mode():
            output_ids = self._model.generate(
                **inputs,
                forced_bos_token_id=target_token_id,
                num_beams=4,
                max_length=257,
                repetition_penalty=1.3,
                no_repeat_ngram_size=3,
            )
        return self._tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    def _torch_inference_mode(self):
        import torch

        return torch.inference_mode()


class VitsEwondoSynthesizer:
    def __init__(self, model_path: Path, device: str) -> None:
        import torch
        from transformers import AutoTokenizer, VitsModel

        _require_local_model(model_path, "Synthèse vocale Ewondo")
        self._device = _resolve_device(torch, device)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=True
        )
        self._model = VitsModel.from_pretrained(
            model_path,
            local_files_only=True,
            torch_dtype=_model_dtype(torch, self._device),
        ).to(self._device)
        self._model.eval()
        self._sample_rate = int(self._model.config.sampling_rate)

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def synthesize(self, text: str) -> np.ndarray:
        import torch

        inputs = self._tokenizer(text, return_tensors="pt")
        inputs = inputs.to(self._device)
        with torch.inference_mode():
            waveform = self._model(**inputs).waveform
        return waveform.squeeze().cpu().numpy()


def build_translation_pipeline(settings: Settings) -> TranslationPipeline:
    return TranslationPipeline(
        ewondo_translator=GriotEwondoTranslator(
            settings.griot_model_path, settings.device
        ),
        english_translator=MarianEnglishToFrench(
            settings.en_fr_model_path, settings.device
        ),
    )


def _require_local_model(model_path: Path, label: str) -> None:
    if not model_path.is_dir():
        raise FileNotFoundError(
            f"Modèle local « {label} » introuvable dans {model_path}. "
            "Téléchargez les modèles avec `python -m scripts.download_models`."
        )


def _resolve_device(torch, requested_device: str):
    if requested_device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested_device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("VOIX_DEVICE=cuda, mais aucun GPU CUDA n'est disponible.")
    return torch.device(requested_device)


def _model_dtype(torch, device):
    return torch.float16 if device.type == "cuda" else torch.float32


def _check_input_length(token_count: int, config) -> None:
    max_positions = getattr(config, "max_position_embeddings", None)
    if max_positions is not None and token_count > max_positions:
        raise ValueError(
            f"Le texte dépasse la limite du modèle ({max_positions} tokens)."
        )

