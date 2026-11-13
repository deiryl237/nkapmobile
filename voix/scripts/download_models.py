import argparse

from huggingface_hub import snapshot_download

from app.config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Télécharge les modèles de traduction et TTS dans voix/models."
    )
    parser.add_argument(
        "models",
        nargs="*",
        choices=("translation", "tts"),
        help="Modèles à télécharger (par défaut : les deux).",
    )
    args = parser.parse_args()
    settings = Settings.from_env()

    downloads = {
        "translation": (
            settings.translation_model_id,
            settings.translation_revision,
            settings.translation_model_path,
            [
                "added_tokens.json",
                "config.json",
                "generation_config.json",
                "model.safetensors",
                "source.spm",
                "target.spm",
                "tokenizer_config.json",
                "vocab.json",
            ],
        ),
        "tts": (
            settings.tts_model_id,
            settings.tts_revision,
            settings.tts_model_path,
            [
                "added_tokens.json",
                "config.json",
                "model.safetensors",
                "preprocessor_config.json",
                "special_tokens_map.json",
                "tokenizer_config.json",
                "vocab.json",
            ],
        ),
    }

    for model_name in args.models or downloads:
        model_id, revision, target_path, files = downloads[model_name]
        target_path.mkdir(parents=True, exist_ok=True)
        print(f"Téléchargement de {model_id}@{revision} vers {target_path}")
        snapshot_download(
            repo_id=model_id,
            revision=revision,
            local_dir=target_path,
            allow_patterns=files,
            token=False,
        )
        print(f"Modèle {model_name} prêt.")


if __name__ == "__main__":
    main()

