from __future__ import annotations

import base64
import os
import time
from typing import Any, Literal

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .pipeline import SpeechBubbleEngine
from .schemas import DialogueSpec, Rect


class DialoguePayload(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    speaker_id: int | None = None
    style: Literal["auto", "ellipse", "rounded"] = "auto"


class ProcessPayload(BaseModel):
    dialogues: list[DialoguePayload] = Field(min_length=1, max_length=20)
    font_size: int = Field(default=42, ge=12, le=128)
    max_chars_per_line: int = Field(default=14, ge=4, le=40)
    reading_order: Literal["rtl", "ltr"] = "rtl"
    include_image_base64: bool = True
    face_hints: list[list[int]] | None = None


class ProcessResponse(BaseModel):
    faces: list[dict[str, Any]]
    placements: list[dict[str, Any]]
    debug: dict[str, Any]
    elapsed_ms: float
    image_base64: str | None = None


def _decode_upload(content: bytes) -> np.ndarray:
    array = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image")
    return image


def _encode_png_base64(image_bgr: np.ndarray) -> str:
    success, encoded = cv2.imencode(".png", image_bgr)
    if not success:
        raise RuntimeError("Failed to encode output image")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def _parse_face_hints(raw_hints: list[list[int]] | None) -> list[Rect] | None:
    if not raw_hints:
        return None
    hints: list[Rect] = []
    for item in raw_hints:
        if len(item) != 4:
            raise ValueError("face_hints entries must be [x, y, w, h]")
        x, y, w, h = [int(value) for value in item]
        if w <= 0 or h <= 0:
            raise ValueError("face_hints width and height must be > 0")
        hints.append(Rect(x=x, y=y, w=w, h=h))
    return hints


def _build_app() -> FastAPI:
    app = FastAPI(title="SpeechBubble API", version="0.1.0")
    engine = SpeechBubbleEngine()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/process", response_model=ProcessResponse)
    async def process_image(
        image: UploadFile = File(...),
        payload: str = Form(...),
    ) -> ProcessResponse:
        try:
            request = ProcessPayload.model_validate_json(payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid payload JSON: {exc}") from exc

        content = await image.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")

        try:
            image_bgr = _decode_upload(content)
            dialogues = [
                DialogueSpec(text=item.text, speaker_id=item.speaker_id, style=item.style)
                for item in request.dialogues
            ]
            face_hints = _parse_face_hints(request.face_hints)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        started = time.perf_counter()
        try:
            result = engine.process(
                image_bgr,
                dialogues,
                font_size=request.font_size,
                max_chars_per_line=request.max_chars_per_line,
                reading_order=request.reading_order,
                face_hints=face_hints,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        metadata = result.to_dict(include_image=False)
        return ProcessResponse(
            faces=metadata["faces"],
            placements=metadata["placements"],
            debug=metadata["debug"],
            elapsed_ms=round(elapsed_ms, 3),
            image_base64=_encode_png_base64(result.image_bgr) if request.include_image_base64 else None,
        )

    return app


app = _build_app()


def _try_mount_gradio(app_instance: FastAPI) -> FastAPI:
    if os.getenv("ENABLE_GRADIO", "1").lower() not in {"1", "true", "yes"}:
        return app_instance
    try:
        import gradio as gr
        from .ui import build_gradio_app

        return gr.mount_gradio_app(app_instance, build_gradio_app(), path="/ui")
    except Exception:
        return app_instance


app = _try_mount_gradio(app)


def run() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("speechbubble.api:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    run()
