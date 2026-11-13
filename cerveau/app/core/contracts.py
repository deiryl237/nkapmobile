from __future__ import annotations

from typing import Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    session_id: Optional[str] = None
    turn_id: Optional[str] = None
    ts: Optional[int] = None


class AppContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    package: str
    activity: str


class ScreenNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    path: str
    cls: str
    text: Optional[str] = None
    content_desc: Optional[str] = None
    clickable: bool = False
    password: bool = False
    bounds: list[int]
    tone: Literal["light", "dark", "unknown"] = "unknown"


class ScreenContext(Envelope):
    type: Literal["screen_context"] = "screen_context"
    app: AppContext
    screen_hint: str
    nodes: list[ScreenNode]

    @model_validator(mode="after")
    def validate_size(self) -> "ScreenContext":
        if len(self.nodes) > 200:
            raise ValueError("nodes must contain at most 200 nodes")
        return self


class Transcript(Envelope):
    type: Literal["transcript"] = "transcript"
    text: str
    lang: str = "fr"
    confidence: float = 0.0
    is_final: bool = True


class AudioStart(Envelope):
    type: Literal["audio_start"] = "audio_start"


class AudioEnd(Envelope):
    type: Literal["audio_end"] = "audio_end"


class ActionTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    dx: Optional[int] = None
    dy: Optional[int] = None


class ActionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    t: Literal["speak", "circle", "write", "caption", "underline", "arrow", "frame", "hide", "clear"]
    id: Optional[str] = None
    text: Optional[str] = None
    lang: Optional[str] = None
    mode: Optional[str] = "bank"
    phrase_key: Optional[str] = None
    target: Optional[ActionTarget] = None
    color: Optional[str] = None
    duration_ms: Optional[int] = None
    from_: Optional[ActionTarget] = Field(default=None, alias="from", validation_alias=AliasChoices("from", "from_"))
    to: Optional[ActionTarget] = None
    label: Optional[str] = None
    size: Optional[int] = None
    backing: Optional[str] = None
    per_letter_ms: Optional[int] = None
    sub_fr: Optional[str] = None

    @property
    def from_target(self) -> Optional[ActionTarget]:
        return self.from_


class ActionMessage(Envelope):
    type: Literal["action"] = "action"
    seq: int
    speak_seg: Optional[int] = 0
    run_after_ms: Optional[int] = 0
    action: ActionPayload


class ActionStream(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actions: list[ActionMessage]


class HelloMessage(Envelope):
    type: Literal["hello"] = "hello"
    device_id: Optional[str] = None


class HelloAck(Envelope):
    type: Literal["hello_ack"] = "hello_ack"
    accepted: bool = True


class ContextRequest(Envelope):
    type: Literal["context_request"] = "context_request"


class TurnEnd(Envelope):
    type: Literal["turn_end"] = "turn_end"


class AudioOut(Envelope):
    type: Literal["audio_out"] = "audio_out"
    url: str
    speak_id: str
    duration_ms: Optional[int] = None


class ErrorMessage(Envelope):
    type: Literal["error"] = "error"
    error: str
    details: Optional[str] = None

