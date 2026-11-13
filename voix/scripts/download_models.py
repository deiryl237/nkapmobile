import argparse
import os
from pathlib import Path

from huggingface_hub import snapshot_download

from app.config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Télécharge les checkpoints nécessaires au serveur voix."
    )
    parser.add_argument(
        "models",
        nargs="*",
        choices=("tts", "griot", "en-fr"),
        help="Modèles à télécharger (par défaut : tous).",
    )
    args = parser.parse_args()
    settings = Settings.from_env()

    downloads = {
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
        "griot": (
            settings.griot_model_id,
            settings.griot_revision,
            settings.griot_model_path,
            [
                "config.json",
                "generation_config.json",
                "model.safetensors",
                "tokenizer.json",
                "tokenizer_config.json",
                "adapters/ewo/adapter_config.json",
                "adapters/ewo/adapter_model.safetensors",
                "adapters/ewo/metadata.json",
            ],
        ),
        "en-fr": (
            settings.en_fr_model_id,
            settings.en_fr_revision,
            settings.en_fr_model_path,
            [
                "config.json",
                "generation_config.json",
                "pytorch_model.bin",
                "source.spm",
                "target.spm",
                "tokenizer_config.json",
                "vocab.json",
            ],
        ),
    }

    selected_models = args.models or list(downloads)
    for model_name in selected_models:
        model_id, revision, target_path, files = downloads[model_name]
        target_path = Path(os.path.expandvars(str(target_path))).expanduser()
        target_path.mkdir(parents=True, exist_ok=True)
        print(f"Téléchargement de {model_id} ({revision}) vers {target_path}")
        snapshot_download(
            repo_id=model_id,
            revision=revision,
            local_dir=target_path,
            allow_patterns=files,
        )
        print(f"Modèle {model_name} prêt.")


if __name__ == "__main__":
    main()

