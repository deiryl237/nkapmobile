from contextlib import asynccontextmanager
from collections.abc import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

from .config import Settings
from .models import TranslationResult
from .schemas import (
    HealthResponse,
    SynthesisResponse,
    TextRequest,
    TranslationRequest,
    TranslationResponse,
)
from .service import VoiceService, build_voice_service


def create_app(
    service_factory: Callable[[Settings], VoiceService] = build_voice_service,
) -> FastAPI:
    settings = Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.voice_service = service_factory(settings)
        try:
            yield
        finally:
            app.state.voice_service.close()
            app.state.voice_service = None

    app = FastAPI(
        title="nkapmobile Voix",
        description=(
            "Traduction française ou anglaise vers l'ewondo et synthèse vocale "
            "avec des modèles téléchargés et exécutés localement."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    def get_service(request: Request) -> VoiceService:
        service = getattr(request.app.state, "voice_service", None)
        if service is None:
            raise HTTPException(
                status_code=503,
                detail="Le service voix n'est pas initialisé.",
            )
        return service

    @app.get("/health", response_model=HealthResponse)
    def health(request: Request) -> HealthResponse:
        if getattr(request.app.state, "voice_service", None) is None:
            return HealthResponse(status="loading")
        return HealthResponse(status="ok")

    @app.post("/v1/translate", response_model=TranslationResponse)
    def translate(body: TranslationRequest, request: Request) -> TranslationResponse:
        service = get_service(request)
        result = _translate(service, body.text, body.source_lang)
        return _translation_response(body.text, body.source_lang, result)

    @app.post("/v1/synthesize", response_model=SynthesisResponse)
    def synthesize(
        body: TranslationRequest, request: Request
    ) -> SynthesisResponse:
        service = get_service(request)
        try:
            result, audio_id, cache_hit = service.synthesize(
                body.text, body.source_lang
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        return SynthesisResponse(
            **_translation_response(
                body.text, body.source_lang, result
            ).model_dump(),
            audio_url=str(request.url_for("get_audio", audio_id=audio_id)),
            sample_rate=service.sample_rate(audio_id),
            duration_ms=service.duration_ms(audio_id),
            cache_hit=cache_hit,
        )

    @app.post("/v1/tts")
    def tts(body: TextRequest, request: Request) -> FileResponse:
        service = get_service(request)
        try:
            _, audio_id, _ = service.synthesize(body.text, "ewo")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return _audio_response(service, audio_id)

    @app.get("/v1/audio/{audio_id}.wav", name="get_audio")
    def get_audio(audio_id: str, request: Request) -> FileResponse:
        if len(audio_id) != 32 or any(
            char not in "0123456789abcdef" for char in audio_id
        ):
            raise HTTPException(status_code=404, detail="Audio introuvable.")
        return _audio_response(get_service(request), audio_id)

    return app


def _translate(service: VoiceService, text: str, source_lang: str) -> TranslationResult:
    try:
        return service.translate(text, source_lang)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _translation_response(
    source_text: str, source_lang: str, result: TranslationResult
) -> TranslationResponse:
    return TranslationResponse(
        source_text=source_text,
        source_lang=source_lang,
        text=result.text,
        intermediate_text=result.intermediate_text,
    )


def _audio_response(service: VoiceService, audio_id: str) -> FileResponse:
    audio_path = service.audio_path(audio_id)
    if not audio_path.is_file():
        raise HTTPException(status_code=404, detail="Audio introuvable.")
    return FileResponse(
        audio_path,
        media_type="audio/wav",
        filename=f"{audio_id}.wav",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


app = create_app()
