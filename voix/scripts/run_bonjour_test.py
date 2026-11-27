import json
import shutil

from app.config import Settings
from app.service import build_voice_service


def main() -> None:
    settings = Settings.from_env()
    service = build_voice_service(settings)
    try:
        translation, audio_id, cache_hit = service.synthesize("Bonjour", "fr")
        generated_audio = settings.output_dir / "bonjour.wav"
        shutil.copyfile(service.audio_path(audio_id), generated_audio)
        print(
            json.dumps(
                {
                    "source": "Bonjour",
                    "ewondo": translation.text,
                    "audio": str(generated_audio.resolve()),
                    "sample_rate": service.sample_rate(audio_id),
                    "duration_ms": service.duration_ms(audio_id),
                    "cache_hit": cache_hit,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        service.close()


if __name__ == "__main__":
    main()

