from __future__ import annotations

from typing import Any, Literal, Optional

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


class PageContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    title: Optional[str] = ""


class ScreenNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    path: Optional[str] = None
    cls: Optional[str] = None
    tag: Optional[str] = None
    text: Optional[str] = None
    content_desc: Optional[str] = None
    clickable: bool = False
    password: bool = False
    bounds: list[int]
    tone: Literal["light", "dark", "unknown"] = "unknown"


class ScreenContext(Envelope):
    type: Literal["screen_context"] = "screen_context"
    app: Optional[AppContext] = None
    page: Optional[PageContext] = None
    channel: Optional[str] = None
    screen_hint: str
    nodes: list[ScreenNode]

    @model_validator(mode="after")
    def validate_context(self) -> "ScreenContext":
        if self.app is None and self.page is None:
            raise ValueError("ScreenContext must include either 'app' (Android) or 'page' (Web)")
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


class NotebookLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = None
    label: Optional[str] = None
    value: Optional[str] = None
    text: Optional[str] = None
    color: Optional[str] = None
    bold: Optional[bool] = None
    box: Optional[bool] = None
    circle: Optional[bool] = None
    underline: Optional[bool] = None
    divider: Optional[bool] = None


class FlowStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: Optional[str] = None
    tone: Optional[str] = None


class BarItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: float
    amount_text: Optional[str] = None
    tone: Optional[str] = None


class ChoiceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    value: str
    key: Optional[str] = None
    tone: Optional[str] = None


class TurnMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel: str = "web"
    lang: str = "fr"
    intent: str = "UNKNOWN"
    params: dict[str, Any] = Field(default_factory=dict)
    status: str = "ok"


class ActionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    t: Literal[
        "speak",
        "circle",
        "box",
        "write",
        "caption",
        "underline",
        "arrow",
        "frame",
        "notebook",
        "callout",
        "num",
        "highlight",
        "strike",
        "check",
        "cross",
        "edit",
        "hide",
        "clear",
    ]
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
    step: Optional[int] = None
    size: Optional[int] = None
    backing: Optional[str] = None
    per_letter_ms: Optional[int] = None
    sub_fr: Optional[str] = None
    caption_fr: Optional[str] = None
    vars: Optional[dict[str, str]] = None
    title: Optional[str] = None
    lines: Optional[list[NotebookLine]] = None
    flow_steps: Optional[list[FlowStep]] = None
    bars: Optional[list[BarItem]] = None
    columns: Optional[list[str]] = None
    rows: Optional[list[list[str]]] = None
    choices: Optional[list[ChoiceItem]] = None
    anchor: Optional[ActionTarget] = None

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


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: Optional[str] = "web_session"
    turn_id: Optional[str] = None
    channel: Optional[str] = None
    transcript: str
    lang_hint: str = "fr"
    context: ScreenContext


class FollowUpGoal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_screens: list[str] = Field(default_factory=list)
    target_cues: list[str] = Field(default_factory=list)
    question: str
    ttl_ms: int = 30000


class AnswerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turn_id: str
    actions: list[ActionMessage]
    meta: Optional[TurnMeta] = None
    text_fallback: Optional[str] = None
    choices: Optional[list[ChoiceItem]] = None
    follow_up: Optional[FollowUpGoal] = None

