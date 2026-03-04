"""SpeechBubble package."""

from __future__ import annotations

__all__ = ["SpeechBubbleEngine", "DialogueSpec", "Rect"]


def __getattr__(name: str):
    if name == "SpeechBubbleEngine":
        from .pipeline import SpeechBubbleEngine

        return SpeechBubbleEngine
    if name in {"DialogueSpec", "Rect"}:
        from .schemas import DialogueSpec, Rect

        return {"DialogueSpec": DialogueSpec, "Rect": Rect}[name]
    raise AttributeError(name)
