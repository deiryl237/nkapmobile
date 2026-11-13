from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Charger les variables d'environnement depuis .env s'il existe
load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str = "nkap-m2"
    kb_root: Path = Path(__file__).resolve().parent.parent / "m5_kb"
    ws_origin: str = "*"


settings = Settings()

