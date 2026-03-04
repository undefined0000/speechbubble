from __future__ import annotations

import json

import cv2
import numpy as np
from fastapi.testclient import TestClient

from speechbubble.api import app


def _make_sample_png() -> bytes:
    image = np.full((640, 960, 3), 240, dtype=np.uint8)
    cv2.rectangle(image, (130, 170), (320, 360), (140, 120, 100), 3)
    cv2.rectangle(image, (640, 160), (860, 380), (140, 120, 100), 3)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def test_root_returns_html() -> None:
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "SpeechBubble Auto Inserter" in response.text


def test_process_endpoint_multipart_success() -> None:
    client = TestClient(app)
    payload = {
        "dialogues": [
            {"text": "one", "speaker_id": 0},
            {"text": "two", "speaker_id": 1},
        ],
        "include_image_base64": False,
        "face_hints": [[130, 170, 190, 190], [640, 160, 220, 220]],
    }
    response = client.post(
        "/v1/process",
        files={
            "image": ("sample.png", _make_sample_png(), "image/png"),
            "payload": (None, json.dumps(payload)),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["faces"]) == 2
    assert len(body["placements"]) == 2
    assert body["image_base64"] is None


def test_process_endpoint_auto_dialogues_when_empty() -> None:
    client = TestClient(app)
    payload = {
        "dialogues": None,
        "auto_dialogues": True,
        "max_auto_bubbles": 3,
        "include_image_base64": False,
        "face_hints": [[130, 170, 190, 190], [640, 160, 220, 220]],
    }
    response = client.post(
        "/v1/process",
        files={
            "image": ("sample.png", _make_sample_png(), "image/png"),
            "payload": (None, json.dumps(payload)),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["placements"]) == 2


def test_process_endpoint_requires_dialogues_if_auto_disabled() -> None:
    client = TestClient(app)
    payload = {
        "dialogues": None,
        "auto_dialogues": False,
        "include_image_base64": False,
    }
    response = client.post(
        "/v1/process",
        files={
            "image": ("sample.png", _make_sample_png(), "image/png"),
            "payload": (None, json.dumps(payload)),
        },
    )
    assert response.status_code == 400
    assert "auto_dialogues=false" in response.json()["detail"]


def test_process_endpoint_rejects_non_image_upload() -> None:
    client = TestClient(app)
    payload = {"dialogues": [{"text": "hello"}]}
    response = client.post(
        "/v1/process",
        files={
            "image": ("sample.txt", b"not-an-image", "text/plain"),
            "payload": (None, json.dumps(payload)),
        },
    )
    assert response.status_code == 400
    assert "image/*" in response.json()["detail"]
