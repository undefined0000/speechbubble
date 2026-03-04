from __future__ import annotations

import numpy as np

from speechbubble.pipeline import SpeechBubbleEngine
from speechbubble.schemas import DialogueSpec, Rect


def test_layout_places_bubbles_inside_canvas() -> None:
    image = np.full((900, 1400, 3), 235, dtype=np.uint8)
    engine = SpeechBubbleEngine()
    dialogues = [
        DialogueSpec(text="今日はよろしく！", speaker_id=0),
        DialogueSpec(text="了解、進めよう。", speaker_id=1),
        DialogueSpec(text="この位置で大丈夫？"),
    ]
    face_hints = [Rect(220, 220, 180, 180), Rect(920, 230, 190, 190)]

    result = engine.process(
        image,
        dialogues,
        font_size=34,
        max_chars_per_line=10,
        reading_order="rtl",
        face_hints=face_hints,
    )

    assert len(result.placements) == len(dialogues)
    height, width = image.shape[:2]
    for placement in result.placements:
        rect = placement.rect
        clipped = rect.clipped(width, height)
        assert clipped.area / max(1, rect.area) > 0.95
