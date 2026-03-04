from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Point:
    x: float
    y: float

    def as_dict(self) -> dict[str, float]:
        return {"x": round(float(self.x), 3), "y": round(float(self.y), 3)}


@dataclass(slots=True)
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        return self.x + self.w

    @property
    def y2(self) -> int:
        return self.y + self.h

    @property
    def cx(self) -> float:
        return self.x + self.w / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2.0

    @property
    def area(self) -> int:
        return max(self.w, 0) * max(self.h, 0)

    def inflate(self, value: int) -> "Rect":
        return Rect(self.x - value, self.y - value, self.w + value * 2, self.h + value * 2)

    def clipped(self, width: int, height: int) -> "Rect":
        x1 = max(0, min(self.x, width))
        y1 = max(0, min(self.y, height))
        x2 = max(0, min(self.x2, width))
        y2 = max(0, min(self.y2, height))
        return Rect(x1, y1, max(0, x2 - x1), max(0, y2 - y1))

    def intersection_area(self, other: "Rect") -> int:
        x1 = max(self.x, other.x)
        y1 = max(self.y, other.y)
        x2 = min(self.x2, other.x2)
        y2 = min(self.y2, other.y2)
        if x2 <= x1 or y2 <= y1:
            return 0
        return (x2 - x1) * (y2 - y1)

    def contains_point(self, point: Point) -> bool:
        return self.x <= point.x <= self.x2 and self.y <= point.y <= self.y2

    def as_dict(self) -> dict[str, int]:
        return {"x": int(self.x), "y": int(self.y), "w": int(self.w), "h": int(self.h)}


@dataclass(slots=True)
class DialogueSpec:
    text: str
    speaker_id: int | None = None
    style: str = "auto"


@dataclass(slots=True)
class MeasuredDialogue:
    dialogue: DialogueSpec
    lines: list[str]
    text_width: int
    text_height: int
    line_height: int
    bubble_width: int
    bubble_height: int
    shape: str


@dataclass(slots=True)
class BubblePlacement:
    dialogue_index: int
    text: str
    lines: list[str]
    rect: Rect
    shape: str
    anchor: Point
    tail_base: Point
    tail_tip: Point
    speaker_face_id: int | None
    score: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "dialogue_index": self.dialogue_index,
            "text": self.text,
            "lines": self.lines,
            "rect": self.rect.as_dict(),
            "shape": self.shape,
            "anchor": self.anchor.as_dict(),
            "tail_base": self.tail_base.as_dict(),
            "tail_tip": self.tail_tip.as_dict(),
            "speaker_face_id": self.speaker_face_id,
            "score": round(float(self.score), 4),
        }


@dataclass(slots=True)
class EngineOutput:
    image_bgr: Any
    faces: list[Rect] = field(default_factory=list)
    placements: list[BubblePlacement] = field(default_factory=list)
    debug: dict[str, Any] = field(default_factory=dict)

    def to_dict(self, include_image: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "faces": [face.as_dict() for face in self.faces],
            "placements": [placement.as_dict() for placement in self.placements],
            "debug": self.debug,
        }
        if include_image:
            payload["image_bgr"] = self.image_bgr
        return payload
