from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .config import LayoutConfig, RenderConfig
from .schemas import BubblePlacement, DialogueSpec, MeasuredDialogue, Point


@dataclass(slots=True)
class TextMetrics:
    lines: list[str]
    text_width: int
    text_height: int
    line_height: int


def _split_paragraph(paragraph: str, max_chars_per_line: int) -> list[str]:
    if not paragraph:
        return [""]
    if len(paragraph) <= max_chars_per_line:
        return [paragraph]

    punctuation = set("、。，．,.!?！？)]】」』")
    lines: list[str] = []
    current: list[str] = []
    for char in paragraph:
        current.append(char)
        if len(current) >= max_chars_per_line and char not in punctuation:
            lines.append("".join(current).strip())
            current = []
    if current:
        lines.append("".join(current).strip())
    return [line for line in lines if line]


def wrap_text(text: str, max_chars_per_line: int) -> list[str]:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        return [""]
    lines: list[str] = []
    for paragraph in cleaned.split("\n"):
        if " " in paragraph:
            words = [word for word in paragraph.split(" ") if word]
            current = ""
            for word in words:
                candidate = f"{current} {word}".strip()
                if len(candidate) > max_chars_per_line and current:
                    lines.append(current)
                    current = word
                else:
                    current = candidate
            lines.append(current if current else "")
        else:
            lines.extend(_split_paragraph(paragraph, max_chars_per_line))
    return lines if lines else [""]


def load_font(font_path: str | None, font_size: int, config: RenderConfig) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: list[str] = []
    if font_path:
        candidates.append(font_path)
    candidates.extend(config.default_font_candidates)
    for candidate in candidates:
        path = Path(candidate)
        if not path.exists():
            continue
        try:
            return ImageFont.truetype(str(path), font_size)
        except OSError:
            continue
    return ImageFont.load_default()


def measure_dialogue(
    dialogue: DialogueSpec,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    layout_config: LayoutConfig,
    draw: ImageDraw.ImageDraw,
    max_chars_per_line: int,
) -> MeasuredDialogue:
    lines = wrap_text(dialogue.text, max_chars_per_line)
    line_boxes = [font.getbbox(line if line else "あ") for line in lines]
    line_heights = [box[3] - box[1] for box in line_boxes]
    line_height = max(1, max(line_heights, default=font.size if hasattr(font, "size") else 16))
    line_spacing = int(round(line_height * layout_config.line_spacing_ratio))

    widths = [int(round(draw.textlength(line if line else " ", font=font))) for line in lines]
    text_width = max(widths, default=1)
    text_height = line_height * len(lines) + line_spacing * max(0, len(lines) - 1)

    bubble_width = max(layout_config.min_bubble_width, text_width + layout_config.bubble_padding_x * 2)
    bubble_height = max(layout_config.min_bubble_height, text_height + layout_config.bubble_padding_y * 2)

    shape = dialogue.style
    if shape == "auto":
        longest_line = max((len(line) for line in lines), default=0)
        shape = "ellipse" if (len(lines) <= 2 and longest_line <= max_chars_per_line + 2) else "rounded"

    return MeasuredDialogue(
        dialogue=dialogue,
        lines=lines,
        text_width=text_width,
        text_height=text_height,
        line_height=line_height,
        bubble_width=bubble_width,
        bubble_height=bubble_height,
        shape=shape,
    )


def _tail_polygon(base: Point, tip: Point, width: float) -> list[tuple[float, float]]:
    vx = tip.x - base.x
    vy = tip.y - base.y
    length = math.hypot(vx, vy)
    if length < 1e-6:
        return [(tip.x, tip.y), (base.x - width, base.y), (base.x + width, base.y)]
    nx = vx / length
    ny = vy / length
    px = -ny
    py = nx
    left = (base.x + px * width, base.y + py * width)
    right = (base.x - px * width, base.y - py * width)
    return [(tip.x, tip.y), left, right]


def _draw_single_bubble(
    draw: ImageDraw.ImageDraw,
    placement: BubblePlacement,
    render_config: RenderConfig,
) -> None:
    rect = placement.rect
    x1, y1, x2, y2 = rect.x, rect.y, rect.x2, rect.y2
    tail_width = max(8.0, min(rect.w, rect.h) * render_config.tail_width_ratio)
    tail = _tail_polygon(placement.tail_base, placement.tail_tip, tail_width)

    draw.polygon(tail, fill=render_config.bubble_fill, outline=render_config.bubble_outline, width=render_config.outline_width)
    if placement.shape == "ellipse":
        draw.ellipse((x1, y1, x2, y2), fill=render_config.bubble_fill, outline=render_config.bubble_outline, width=render_config.outline_width)
    else:
        draw.rounded_rectangle(
            (x1, y1, x2, y2),
            radius=render_config.corner_radius,
            fill=render_config.bubble_fill,
            outline=render_config.bubble_outline,
            width=render_config.outline_width,
        )


def _draw_text(draw: ImageDraw.ImageDraw, placement: BubblePlacement, font: ImageFont.ImageFont, render_config: RenderConfig) -> None:
    rect = placement.rect
    line_boxes = [font.getbbox(line if line else "あ") for line in placement.lines]
    line_heights = [max(1, box[3] - box[1]) for box in line_boxes]
    line_height = max(line_heights, default=16)
    spacing = max(2, int(round(line_height * 0.22)))
    total_height = line_height * len(placement.lines) + spacing * max(0, len(placement.lines) - 1)
    current_y = rect.y + (rect.h - total_height) / 2.0

    for line in placement.lines:
        text_width = draw.textlength(line if line else " ", font=font)
        x = rect.x + (rect.w - text_width) / 2.0
        draw.text((x, current_y), line, font=font, fill=render_config.text_color)
        current_y += line_height + spacing


def render(
    image_bgr: np.ndarray,
    placements: list[BubblePlacement],
    font: ImageFont.ImageFont,
    render_config: RenderConfig,
) -> np.ndarray:
    rgba = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGBA)
    pil = Image.fromarray(rgba)
    draw = ImageDraw.Draw(pil, mode="RGBA")

    for placement in placements:
        _draw_single_bubble(draw, placement, render_config)
    for placement in placements:
        _draw_text(draw, placement, font, render_config)

    output_rgba = np.array(pil, dtype=np.uint8)
    return cv2.cvtColor(output_rgba, cv2.COLOR_RGBA2BGR)
