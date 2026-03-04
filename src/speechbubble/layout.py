from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .config import LayoutConfig
from .schemas import BubblePlacement, MeasuredDialogue, Point, Rect


@dataclass(slots=True)
class LayoutDecision:
    rect: Rect
    score: float


def _outside_area(rect: Rect, width: int, height: int) -> int:
    inside = rect.clipped(width, height).area
    return max(0, rect.area - inside)


def _region_mean(integral: np.ndarray, rect: Rect) -> float:
    height, width = integral.shape
    x1 = max(0, min(width - 1, rect.x))
    y1 = max(0, min(height - 1, rect.y))
    x2 = max(0, min(width - 1, rect.x2))
    y2 = max(0, min(height - 1, rect.y2))
    if x2 <= x1 or y2 <= y1:
        return 1.0

    total = integral[y2 - 1, x2 - 1]
    top = integral[y1 - 1, x2 - 1] if y1 > 0 else 0.0
    left = integral[y2 - 1, x1 - 1] if x1 > 0 else 0.0
    corner = integral[y1 - 1, x1 - 1] if (x1 > 0 and y1 > 0) else 0.0
    area = float((x2 - x1) * (y2 - y1))
    if area <= 0.0:
        return 1.0
    return float((total - top - left + corner) / area)


def _candidate_directions(reading_order: str) -> list[tuple[float, float]]:
    if reading_order == "ltr":
        return [
            (-0.7, -1.0),
            (0.0, -1.0),
            (1.0, -0.6),
            (-1.0, -0.6),
            (1.0, 0.2),
            (-1.0, 0.2),
            (0.0, 1.0),
            (0.8, 0.9),
            (-0.8, 0.9),
        ]
    return [
        (0.7, -1.0),
        (0.0, -1.0),
        (-1.0, -0.6),
        (1.0, -0.6),
        (-1.0, 0.2),
        (1.0, 0.2),
        (0.0, 1.0),
        (-0.8, 0.9),
        (0.8, 0.9),
    ]


def _generate_candidates(
    bubble_width: int,
    bubble_height: int,
    anchor: Point,
    image_width: int,
    image_height: int,
    config: LayoutConfig,
    reading_order: str,
) -> list[Rect]:
    candidates: list[Rect] = []
    directions = _candidate_directions(reading_order)
    diagonal = math.sqrt(float(bubble_width**2 + bubble_height**2))
    base_distance = int(diagonal * 0.45)
    for step in config.candidate_distance_steps:
        for dx, dy in directions:
            distance = base_distance + step
            cx = anchor.x + dx * distance
            cy = anchor.y + dy * distance
            x = int(round(cx - bubble_width / 2))
            y = int(round(cy - bubble_height / 2))
            candidates.append(Rect(x, y, bubble_width, bubble_height))

    # Fallback candidates that stay close to the top area.
    candidates.append(Rect(int(anchor.x - bubble_width / 2), int(config.margin), bubble_width, bubble_height))
    candidates.append(Rect(int(image_width / 2 - bubble_width / 2), int(config.margin), bubble_width, bubble_height))

    seen: set[tuple[int, int, int, int]] = set()
    unique: list[Rect] = []
    for rect in candidates:
        key = (rect.x, rect.y, rect.w, rect.h)
        if key in seen:
            continue
        seen.add(key)
        unique.append(rect)
    return unique


def _reading_order_penalty(
    previous_rect: Rect | None,
    current_rect: Rect,
    reading_order: str,
) -> float:
    if previous_rect is None:
        return 0.0
    penalty = 0.0
    vertical_delta = current_rect.cy - previous_rect.cy
    horizontal_delta = current_rect.cx - previous_rect.cx

    if vertical_delta < -40:
        penalty += 1.4

    if abs(vertical_delta) < 90:
        if reading_order == "ltr":
            if horizontal_delta < -20:
                penalty += 1.0
        else:
            if horizontal_delta > 20:
                penalty += 1.0
    return penalty


def _tail_base_point(rect: Rect, anchor: Point, shape: str) -> Point:
    center_x = rect.cx
    center_y = rect.cy
    if shape == "ellipse":
        rx = max(1.0, rect.w / 2.0)
        ry = max(1.0, rect.h / 2.0)
        vx = anchor.x - center_x
        vy = anchor.y - center_y
        norm = math.sqrt((vx * vx) / (rx * rx) + (vy * vy) / (ry * ry))
        if norm < 1e-6:
            return Point(center_x, rect.y + rect.h)
        return Point(center_x + vx / norm, center_y + vy / norm)

    x = min(max(anchor.x, rect.x), rect.x2)
    y = min(max(anchor.y, rect.y), rect.y2)
    distances = {
        "left": abs(x - rect.x),
        "right": abs(x - rect.x2),
        "top": abs(y - rect.y),
        "bottom": abs(y - rect.y2),
    }
    edge = min(distances, key=distances.get)
    if edge == "left":
        return Point(rect.x, y)
    if edge == "right":
        return Point(rect.x2, y)
    if edge == "top":
        return Point(x, rect.y)
    return Point(x, rect.y2)


def place_bubbles(
    image_shape: tuple[int, int, int],
    measured_dialogues: list[MeasuredDialogue],
    anchors: list[Point],
    faces: list[Rect],
    obstruction_map: np.ndarray,
    config: LayoutConfig,
    reading_order: str,
) -> list[BubblePlacement]:
    image_height, image_width = image_shape[:2]
    weights = config.weights
    integral = np.cumsum(np.cumsum(obstruction_map.astype(np.float32), axis=0), axis=1)

    placements: list[BubblePlacement] = []
    occupied: list[Rect] = []
    previous: Rect | None = None

    for index, (measured, anchor) in enumerate(zip(measured_dialogues, anchors, strict=True)):
        candidates = _generate_candidates(
            measured.bubble_width,
            measured.bubble_height,
            anchor,
            image_width,
            image_height,
            config,
            reading_order,
        )

        best: LayoutDecision | None = None
        for candidate in candidates:
            outside = _outside_area(candidate, image_width, image_height)
            face_overlap_area = sum(candidate.intersection_area(face) for face in faces)
            bubble_overlap_area = sum(candidate.intersection_area(other) for other in occupied)
            obstruction = _region_mean(integral, candidate)
            distance = math.hypot(candidate.cx - anchor.x, candidate.cy - anchor.y)
            tail_base = _tail_base_point(candidate, anchor, measured.shape)
            tail_length = math.hypot(tail_base.x - anchor.x, tail_base.y - anchor.y)
            reading_penalty = _reading_order_penalty(previous, candidate, reading_order)

            area = max(1.0, float(candidate.area))
            score = 0.0
            score += weights.outside * (outside / area)
            score += weights.face_overlap * (face_overlap_area / area)
            score += weights.bubble_overlap * (bubble_overlap_area / area)
            score += weights.obstruction * obstruction
            score += weights.distance * distance
            score += weights.tail_length * tail_length
            score += weights.reading_order * reading_penalty

            if best is None or score < best.score:
                best = LayoutDecision(candidate, score)

        if best is None:
            fallback_rect = Rect(
                config.margin,
                config.margin + index * (measured.bubble_height + config.margin),
                measured.bubble_width,
                measured.bubble_height,
            )
            best = LayoutDecision(fallback_rect, 1e9)

        rect = best.rect
        tail_base = _tail_base_point(rect, anchor, measured.shape)
        placement = BubblePlacement(
            dialogue_index=index,
            text=measured.dialogue.text,
            lines=measured.lines,
            rect=rect,
            shape=measured.shape,
            anchor=anchor,
            tail_base=tail_base,
            tail_tip=anchor,
            speaker_face_id=measured.dialogue.speaker_id,
            score=best.score,
        )
        placements.append(placement)
        previous = rect
        occupied.append(rect.inflate(10))

    return placements
