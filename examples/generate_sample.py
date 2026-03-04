from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np


def draw_face(canvas: np.ndarray, center: tuple[int, int], radius: int) -> tuple[int, int, int, int]:
    cx, cy = center
    cv2.circle(canvas, (cx, cy), radius, (205, 220, 245), -1)
    cv2.circle(canvas, (cx - radius // 3, cy - radius // 6), radius // 8, (50, 50, 50), -1)
    cv2.circle(canvas, (cx + radius // 3, cy - radius // 6), radius // 8, (50, 50, 50), -1)
    cv2.ellipse(canvas, (cx, cy + radius // 5), (radius // 3, radius // 5), 0, 0, 180, (70, 70, 70), 3)
    cv2.rectangle(canvas, (cx - radius, cy - radius), (cx + radius, cy + radius), (130, 140, 170), 2)
    return (cx - radius, cy - radius, radius * 2, radius * 2)


def generate_sample(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    image = np.full((1080, 1620, 3), (238, 240, 245), dtype=np.uint8)
    cv2.rectangle(image, (80, 720), (1540, 980), (210, 205, 190), -1)
    cv2.rectangle(image, (120, 620), (760, 980), (180, 165, 145), -1)
    cv2.rectangle(image, (900, 580), (1500, 980), (160, 150, 135), -1)

    face_1 = draw_face(image, (470, 430), 130)
    face_2 = draw_face(image, (1160, 410), 140)

    cv2.putText(image, "Sample Scene", (60, 90), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (80, 80, 95), 4, cv2.LINE_AA)

    sample_image = output_dir / "sample_input.png"
    cv2.imwrite(str(sample_image), image)

    face_hints = {
        "face_hints": [list(face_1), list(face_2)],
    }
    (output_dir / "sample_face_hints.json").write_text(
        json.dumps(face_hints, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Generated: {sample_image}")
    print(f"Generated: {output_dir / 'sample_face_hints.json'}")


if __name__ == "__main__":
    generate_sample(Path(__file__).resolve().parent)
