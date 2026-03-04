from __future__ import annotations

import numpy as np

from speechbubble.pipeline import SpeechBubbleEngine
from speechbubble.schemas import DialogueSpec, Rect


def test_pipeline_returns_serializable_metadata() -> None:
    image = np.full((720, 1280, 3), 245, dtype=np.uint8)
    dialogues = [
        DialogueSpec(text="テスト吹き出しその1", speaker_id=0),
        DialogueSpec(text="テスト吹き出しその2", speaker_id=1),
    ]
    face_hints = [Rect(180, 170, 170, 170), Rect(830, 180, 180, 180)]
    engine = SpeechBubbleEngine()

    result = engine.process(image, dialogues, face_hints=face_hints, font_size=30)
    payload = result.to_dict(include_image=False)

    assert image.shape == result.image_bgr.shape
    assert len(payload["faces"]) == 2
    assert len(payload["placements"]) == 2
    assert payload["debug"]["dialogue_count"] == 2
