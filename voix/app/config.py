from dataclasses import dataclass
import os
from pathlib import Path


VOIX_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = VOIX_DIR / "models"


@dataclass(frozen=True)
class Settings:
    tts_model_id: str = "OlameMend/mms-tts-ewo"
    tts_revision: str = "d1614d3b8002f663b660a7c0d982e7ca398566ba"
    griot_model_id: str = "bivariant/Griot-MT-1.3B-ALL"
    griot_revision: str = "2a19a8919d712db90774bb8d2e7e58a4b568c8d1"
    en_fr_model_id: str = "Helsinki-NLP/opus-mt-en-fr"
    en_fr_revision: str = "dd7f6540a7a48a7f4db59e5c0b9c42c8eea67f18"
    tts_model_path: Path = MODELS_DIR / "mms-tts-ewo"
    griot_model_path: Path = MODELS_DIR / "griot-mt-ewo"
    en_fr_model_path: Path = MODELS_DIR / "opus-mt-en-fr"
    output_dir: Path = VOIX_DIR / "generated"
    device: str = "auto"

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            tts_model_id=os.getenv("VOIX_TTS_MODEL_ID", defaults.tts_model_id),
            tts_revision=os.getenv("VOIX_TTS_REVISION", defaults.tts_revision),
            griot_model_id=os.getenv("VOIX_GRIOT_MODEL_ID", defaults.griot_model_id),
            griot_revision=os.getenv("VOIX_GRIOT_REVISION", defaults.griot_revision),
            en_fr_model_id=os.getenv("VOIX_EN_FR_MODEL_ID", defaults.en_fr_model_id),
            en_fr_revision=os.getenv("VOIX_EN_FR_REVISION", defaults.en_fr_revision),
            tts_model_path=Path(
                os.getenv("VOIX_TTS_MODEL_PATH", str(defaults.tts_model_path))
            ).expanduser(),
            griot_model_path=Path(
                os.getenv("VOIX_GRIOT_MODEL_PATH", str(defaults.griot_model_path))
            ).expanduser(),
            en_fr_model_path=Path(
                os.getenv("VOIX_EN_FR_MODEL_PATH", str(defaults.en_fr_model_path))
            ).expanduser(),
            output_dir=Path(
                os.getenv("VOIX_OUTPUT_DIR", str(defaults.output_dir))
            ).expanduser(),
            device=os.getenv("VOIX_DEVICE", defaults.device),
        )
