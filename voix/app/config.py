from dataclasses import dataclass
import os
from pathlib import Path


VOIX_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = VOIX_DIR / "models"


@dataclass(frozen=True)
class Settings:
    translation_model_id: str = "dadv12/nkap-translate-ewo-en-fr"
    translation_revision: str = "91ce16cf042782922c1854f840df9c3600058b8b"
    tts_model_id: str = "OlameMend/mms-tts-ewo"
    tts_revision: str = "d1614d3b8002f663b660a7c0d982e7ca398566ba"
    translation_model_path: Path = MODELS_DIR / "nkap-translate-ewo-en-fr"
    tts_model_path: Path = MODELS_DIR / "mms-tts-ewo"
    device: str = "auto"
    output_dir: Path = VOIX_DIR / "generated"

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            translation_model_id=os.getenv(
                "VOIX_TRANSLATION_MODEL_ID", defaults.translation_model_id
            ),
            translation_revision=os.getenv(
                "VOIX_TRANSLATION_REVISION", defaults.translation_revision
            ),
            tts_model_id=os.getenv("VOIX_TTS_MODEL_ID", defaults.tts_model_id),
            tts_revision=os.getenv("VOIX_TTS_REVISION", defaults.tts_revision),
            translation_model_path=Path(
                os.getenv(
                    "VOIX_TRANSLATION_MODEL_PATH",
                    str(defaults.translation_model_path),
                )
            ).expanduser(),
            tts_model_path=Path(
                os.getenv("VOIX_TTS_MODEL_PATH", str(defaults.tts_model_path))
            ).expanduser(),
            device=os.getenv("VOIX_DEVICE", defaults.device),
            output_dir=Path(
                os.getenv("VOIX_OUTPUT_DIR", str(defaults.output_dir))
            ).expanduser(),
        )
