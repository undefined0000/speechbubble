from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .config import LayoutConfig, RenderConfig
from .layout import place_bubbles
from .render import load_font, measure_dialogue, render
from .schemas import DialogueSpec, EngineOutput, Point, Rect
from .vision import build_obstruction_map, detect_faces


def load_image(path: str | Path) -> np.ndarray:
    image_path = Path(path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    data = np.fromfile(str(image_path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unsupported image file: {image_path}")
    return image


def save_image(path: str | Path, image_bgr: np.ndarray) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = output_path.suffix.lower() if output_path.suffix else ".png"
    extension = suffix if suffix in {".png", ".jpg", ".jpeg", ".webp"} else ".png"
    success, encoded = cv2.imencode(extension, image_bgr)
    if not success:
        raise RuntimeError(f"Failed to encode image: {output_path}")
    encoded.tofile(str(output_path))


def _normalize_dialogues(dialogues: Iterable[DialogueSpec | str]) -> list[DialogueSpec]:
    normalized: list[DialogueSpec] = []
    for item in dialogues:
        if isinstance(item, DialogueSpec):
            style = item.style if item.style in {"auto", "ellipse", "rounded"} else "auto"
            normalized.append(DialogueSpec(text=item.text.strip(), speaker_id=item.speaker_id, style=style))
        else:
            normalized.append(DialogueSpec(text=str(item).strip(), speaker_id=None, style="auto"))
    normalized = [dialogue for dialogue in normalized if dialogue.text]
    if not normalized:
        raise ValueError("At least one non-empty dialogue is required.")
    return normalized


def _sorted_face_indices(faces: list[Rect], reading_order: str) -> list[int]:
    if reading_order == "ltr":
        indexed = sorted(enumerate(faces), key=lambda item: (item[1].y, item[1].x))
    else:
        indexed = sorted(enumerate(faces), key=lambda item: (item[1].y, -item[1].x))
    return [index for index, _ in indexed]


def _anchors_without_faces(image_width: int, image_height: int, count: int) -> list[Point]:
    anchors: list[Point] = []
    if count <= 0:
        return anchors
    for index in range(count):
        ratio = (index + 1) / (count + 1)
        x = image_width * (0.15 + 0.7 * ratio)
        y = image_height * (0.22 + 0.04 * (index % 2))
        anchors.append(Point(x, y))
    return anchors


class SpeechBubbleEngine:
    def __init__(
        self,
        layout_config: LayoutConfig | None = None,
        render_config: RenderConfig | None = None,
    ) -> None:
        self.layout_config = layout_config or LayoutConfig()
        self.render_config = render_config or RenderConfig()

    def process(
        self,
        image_bgr: np.ndarray,
        dialogues: Iterable[DialogueSpec | str],
        *,
        font_size: int = 42,
        font_path: str | None = None,
        max_chars_per_line: int | None = None,
        reading_order: str | None = None,
        face_hints: list[Rect] | None = None,
    ) -> EngineOutput:
        if image_bgr is None or image_bgr.size == 0:
            raise ValueError("image_bgr is empty")

        normalized_dialogues = _normalize_dialogues(dialogues)
        reading = reading_order or self.layout_config.reading_order
        max_chars = max_chars_per_line or self.layout_config.max_chars_per_line
        active_layout = replace(self.layout_config, max_chars_per_line=max_chars, reading_order=reading)

        faces = list(face_hints) if face_hints else detect_faces(image_bgr)
        image_height, image_width = image_bgr.shape[:2]

        if faces:
            order = _sorted_face_indices(faces, reading)
            resolved_dialogues: list[DialogueSpec] = []
            anchors: list[Point] = []
            for index, dialogue in enumerate(normalized_dialogues):
                if dialogue.speaker_id is not None and 0 <= dialogue.speaker_id < len(faces):
                    face_id = dialogue.speaker_id
                else:
                    face_id = order[index % len(order)]
                face = faces[face_id]
                anchor = Point(face.cx, face.y + face.h * 0.72)
                resolved_dialogues.append(
                    DialogueSpec(text=dialogue.text, speaker_id=face_id, style=dialogue.style)
                )
                anchors.append(anchor)
        else:
            resolved_dialogues = [DialogueSpec(text=d.text, speaker_id=None, style=d.style) for d in normalized_dialogues]
            anchors = _anchors_without_faces(image_width, image_height, len(resolved_dialogues))

        obstruction = build_obstruction_map(image_bgr, faces)
        font = load_font(font_path, font_size, self.render_config)
        canvas = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        measured = [
            measure_dialogue(dialogue, font, active_layout, draw, max_chars)
            for dialogue in resolved_dialogues
        ]

        placements = place_bubbles(
            image_shape=image_bgr.shape,
            measured_dialogues=measured,
            anchors=anchors,
            faces=faces,
            obstruction_map=obstruction,
            config=active_layout,
            reading_order=reading,
        )

        rendered = render(image_bgr, placements, font, self.render_config)
        debug = {
            "face_count": len(faces),
            "dialogue_count": len(normalized_dialogues),
            "reading_order": reading,
            "font_size": font_size,
            "max_chars_per_line": max_chars,
        }
        return EngineOutput(image_bgr=rendered, faces=faces, placements=placements, debug=debug)
