from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Le texte ne peut pas être vide.")
        return value


class TranslationRequest(TextRequest):
    source_lang: Literal["fr", "en", "ewo"] = "fr"


class TranslationResponse(BaseModel):
    source_text: str
    source_lang: str
    target_lang: Literal["ewo"] = "ewo"
    text: str
    intermediate_text: str | None = None


class SynthesisResponse(TranslationResponse):
    audio_url: str
    audio_format: Literal["wav"] = "wav"
    sample_rate: int
    duration_ms: int
    cache_hit: bool
    mode_used: Literal["neural"] = "neural"


class HealthResponse(BaseModel):
    status: Literal["ok", "loading"] = "loading"
    target_lang: Literal["ewo"] = "ewo"
