from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ScoringWeights:
    outside: float = 12000.0
    face_overlap: float = 1600.0
    bubble_overlap: float = 1400.0
    obstruction: float = 900.0
    distance: float = 0.5
    tail_length: float = 0.4
    reading_order: float = 260.0


@dataclass(frozen=True)
class LayoutConfig:
    bubble_padding_x: int = 30
    bubble_padding_y: int = 24
    min_bubble_width: int = 150
    min_bubble_height: int = 92
    margin: int = 18
    max_chars_per_line: int = 14
    line_spacing_ratio: float = 0.22
    candidate_distance_steps: tuple[int, ...] = (90, 130, 170, 220, 280)
    reading_order: str = "rtl"
    weights: ScoringWeights = field(default_factory=ScoringWeights)


@dataclass(frozen=True)
class RenderConfig:
    outline_width: int = 4
    corner_radius: int = 26
    bubble_fill: tuple[int, int, int, int] = (255, 255, 255, 240)
    bubble_outline: tuple[int, int, int, int] = (25, 25, 25, 255)
    text_color: tuple[int, int, int, int] = (20, 20, 20, 255)
    tail_width_ratio: float = 0.11
    default_font_candidates: tuple[str, ...] = (
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
    )
