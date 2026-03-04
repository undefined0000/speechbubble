from __future__ import annotations

import base64
import json
import os
import time
from typing import Any, Literal

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from .pipeline import SpeechBubbleEngine
from .schemas import DialogueSpec, Rect
from .vision import detect_faces


class DialoguePayload(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    speaker_id: int | None = None
    style: Literal["auto", "ellipse", "rounded"] = "auto"


class ProcessPayload(BaseModel):
    dialogues: list[DialoguePayload] | None = None
    auto_dialogues: bool = True
    max_auto_bubbles: int = Field(default=4, ge=1, le=8)
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


MAX_UPLOAD_BYTES = 20 * 1024 * 1024


HOME_HTML = r"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SpeechBubble API</title>
  <style>
    :root {
      --bg: #f4f6fb;
      --card: #ffffff;
      --ink: #1d2330;
      --muted: #61708a;
      --accent: #0f62fe;
      --border: #d7deed;
      --error: #b42318;
      --ok: #046c4e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
      background: linear-gradient(180deg, #eaf0ff 0%, var(--bg) 45%);
      color: var(--ink);
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      padding: 20px 14px 42px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 12px 25px rgba(30, 56, 124, 0.08);
    }
    h1 { margin: 4px 0 8px; font-size: 1.32rem; }
    p { margin: 8px 0; color: var(--muted); line-height: 1.5; }
    label {
      display: block;
      font-weight: 600;
      margin: 12px 0 6px;
    }
    input[type=file], textarea, select, button, input[type=number] {
      width: 100%;
      font: inherit;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 96px; resize: vertical; }
    .row {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 680px) {
      .row { grid-template-columns: 1fr; }
    }
    button {
      margin-top: 12px;
      background: var(--accent);
      border: none;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button[disabled] {
      opacity: 0.65;
      cursor: wait;
    }
    .hint { font-size: 0.9rem; color: var(--muted); }
    .result-wrap { display: grid; gap: 12px; }
    img {
      max-width: 100%;
      border: 1px solid var(--border);
      border-radius: 12px;
      display: none;
      background: #fff;
    }
    pre {
      margin: 0;
      padding: 12px;
      border-radius: 12px;
      background: #0d1526;
      color: #d6e5ff;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 72px;
      overflow: auto;
    }
    .ok { color: var(--ok); font-weight: 700; }
    .err { color: var(--error); font-weight: 700; }
    .status-inline { margin-top: 10px; }
    details {
      border: 1px dashed var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      margin-top: 10px;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: #2c3e64;
    }
    a { color: var(--accent); }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .checkbox-row input[type=checkbox] {
      width: auto;
      margin: 0;
    }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>SpeechBubble Auto Inserter</h1>
      <p>画像から顔を自動検出して、吹き出しを配置します。</p>
      <p class="hint">API docs: <a href="/docs">/docs</a> / health: <a href="/health">/health</a></p>
    </section>

    <section class="card">
      <form id="bubble-form">
        <label for="image">画像ファイル</label>
        <input id="image" name="image" type="file" accept="image/*" required>
        <p class="hint">iPhone の HEIC は未対応です。JPEG/PNG にしてからアップロードしてください。</p>

        <label for="dialogues">セリフ（1行 = 1吹き出し）</label>
        <textarea id="dialogues" name="dialogues" placeholder="空欄なら自動で吹き出し数を決定します"></textarea>

        <div class="checkbox-row">
          <input id="autoDialogues" name="autoDialogues" type="checkbox" checked>
          <label for="autoDialogues" style="margin:0;font-weight:500;">セリフ未入力時は自動で吹き出し数を決める</label>
        </div>

        <div class="row">
          <div>
            <label for="fontSize">フォントサイズ</label>
            <input id="fontSize" name="fontSize" type="number" min="12" max="128" value="42">
          </div>
          <div>
            <label for="maxChars">1行の最大文字数</label>
            <input id="maxChars" name="maxChars" type="number" min="4" max="40" value="14">
          </div>
        </div>

        <div class="row">
          <div>
            <label for="readingOrder">読み順</label>
            <select id="readingOrder" name="readingOrder">
              <option value="rtl">rtl</option>
              <option value="ltr">ltr</option>
            </select>
          </div>
          <div>
            <label for="maxAuto">自動吹き出し上限</label>
            <input id="maxAuto" name="maxAuto" type="number" min="1" max="8" value="4">
          </div>
        </div>

        <details>
          <summary>高度設定（通常は不要）</summary>
          <label for="faceHints">face_hints（1行 = x,y,w,h）</label>
          <textarea id="faceHints" name="faceHints" placeholder="120,140,180,180"></textarea>
          <p class="hint">face_hints は手動で顔位置を指定するオプションです。通常は空欄でOKです。</p>
        </details>

        <button id="submitBtn" type="submit">生成する</button>
        <div id="statusInline" class="status-inline hint">待機中</div>
      </form>
    </section>

    <section class="card result-wrap" id="resultCard">
      <img id="resultImage" alt="result image">
      <pre id="resultMeta">{}</pre>
    </section>
  </main>

  <script>
    const form = document.getElementById("bubble-form");
    const statusNode = document.getElementById("statusInline");
    const imageNode = document.getElementById("resultImage");
    const metaNode = document.getElementById("resultMeta");
    const resultCard = document.getElementById("resultCard");
    const submitBtn = document.getElementById("submitBtn");

    function setStatus(text, kind) {
      statusNode.className = "status-inline " + (kind || "hint");
      statusNode.textContent = text;
    }

    function parseFaceHints(raw) {
      const lines = raw.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      return lines.map((line) => {
        const parts = line.split(",").map(v => Number(v.trim()));
        if (parts.length !== 4 || parts.some(Number.isNaN)) {
          throw new Error("face_hints の形式が不正です。x,y,w,h を1行ずつ入力してください。");
        }
        return parts;
      });
    }

    async function loadImageElement(file) {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("画像を読み込めませんでした。JPEG/PNG を使ってください。"));
        img.src = URL.createObjectURL(file);
      });
    }

    async function prepareUploadFile(file) {
      const lower = (file.name || "").toLowerCase();
      if (file.type === "image/heic" || file.type === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif")) {
        throw new Error("HEIC/HEIF は未対応です。iPhoneで『互換性優先』にするか、JPEG/PNGに変換してください。");
      }
      if (!file.type.startsWith("image/")) {
        throw new Error("画像ファイルを選択してください。");
      }

      const img = await loadImageElement(file);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        return file;
      }
      return new File([blob], "upload.jpg", { type: "image/jpeg" });
    }

    async function parseResponse(response) {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return { detail: text.slice(0, 400) };
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = document.getElementById("image").files[0];
      if (!file) {
        setStatus("画像を選択してください。", "err");
        return;
      }

      const dialogueLines = document.getElementById("dialogues").value
        .split(/\r?\n/)
        .map(v => v.trim())
        .filter(Boolean);
      const autoDialogues = document.getElementById("autoDialogues").checked;

      if (!dialogueLines.length && !autoDialogues) {
        setStatus("セリフを入力するか、自動モードをONにしてください。", "err");
        return;
      }

      let faceHints = null;
      try {
        const rawHints = document.getElementById("faceHints").value.trim();
        faceHints = rawHints ? parseFaceHints(rawHints) : null;
      } catch (err) {
        setStatus(String(err), "err");
        return;
      }

      submitBtn.disabled = true;
      setStatus("画像を準備中...", "hint");
      imageNode.style.display = "none";

      try {
        const uploadFile = await prepareUploadFile(file);

        const payload = {
          dialogues: dialogueLines.length ? dialogueLines.map(text => ({ text })) : null,
          auto_dialogues: autoDialogues,
          max_auto_bubbles: Number(document.getElementById("maxAuto").value),
          font_size: Number(document.getElementById("fontSize").value),
          max_chars_per_line: Number(document.getElementById("maxChars").value),
          reading_order: document.getElementById("readingOrder").value,
          include_image_base64: true,
          face_hints: faceHints
        };

        const formData = new FormData();
        formData.append("image", uploadFile, uploadFile.name || "upload.jpg");
        formData.append("payload", JSON.stringify(payload));

        setStatus("生成中...（数秒かかることがあります）", "hint");
        const response = await fetch("/v1/process", { method: "POST", body: formData });
        const body = await parseResponse(response);

        if (!response.ok) {
          throw new Error(body.detail || "Request failed");
        }

        if (body.image_base64) {
          imageNode.src = `data:image/png;base64,${body.image_base64}`;
          imageNode.style.display = "block";
        }
        metaNode.textContent = JSON.stringify(body, null, 2);
        setStatus(`完了: ${body.elapsed_ms} ms`, "ok");
        resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        setStatus(String(err), "err");
      } finally {
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


def _decode_upload(content: bytes, content_type: str) -> np.ndarray:
    array = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        if content_type in {"image/heic", "image/heif"}:
            raise ValueError("HEIC/HEIF is not supported. Please upload JPEG or PNG")
        raise ValueError("Invalid image. Please upload JPEG or PNG")
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


def _resolve_dialogues(
    request: ProcessPayload,
    image_bgr: np.ndarray,
    face_hints: list[Rect] | None,
) -> tuple[list[DialogueSpec], list[Rect] | None]:
    if request.dialogues:
        dialogues = [
            DialogueSpec(text=item.text, speaker_id=item.speaker_id, style=item.style)
            for item in request.dialogues
        ]
        return dialogues, face_hints

    if not request.auto_dialogues:
        raise ValueError("dialogues is required when auto_dialogues=false")

    auto_faces = list(face_hints) if face_hints else detect_faces(image_bgr)
    count = min(request.max_auto_bubbles, len(auto_faces))
    if count <= 0:
        count = 1

    dialogues: list[DialogueSpec] = []
    for idx in range(count):
        speaker = idx if idx < len(auto_faces) else None
        dialogues.append(DialogueSpec(text="...", speaker_id=speaker, style="auto"))

    face_source = face_hints if face_hints else (auto_faces if auto_faces else None)
    return dialogues, face_source


def _build_app() -> FastAPI:
    app = FastAPI(title="SpeechBubble API", version="0.1.0")
    engine = SpeechBubbleEngine()

    @app.get("/", response_class=HTMLResponse)
    async def home() -> str:
        return HOME_HTML

    @app.get("/favicon.ico")
    async def favicon() -> Response:
        return Response(status_code=204)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/process", response_class=HTMLResponse)
    async def process_usage() -> str:
        usage = {
            "how_to_use": "POST multipart/form-data to /v1/process",
            "fields": ["image (file)", "payload (JSON string)"],
            "payload_example": {
                "dialogues": [{"text": "Hello"}],
                "auto_dialogues": True,
                "max_auto_bubbles": 4,
                "font_size": 42,
                "max_chars_per_line": 14,
                "reading_order": "rtl",
                "include_image_base64": True,
                "face_hints": [[120, 140, 180, 180]],
            },
        }
        return "<pre>" + json.dumps(usage, ensure_ascii=False, indent=2) + "</pre>"

    @app.post("/v1/process", response_model=ProcessResponse)
    async def process_image(
        image: UploadFile = File(...),
        payload: str = Form(...),
    ) -> ProcessResponse:
        content_type = image.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="image must be an image/* file")

        content = await image.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Uploaded image is too large (>{MAX_UPLOAD_BYTES} bytes)",
            )

        try:
            request = ProcessPayload.model_validate_json(payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid payload JSON: {exc}") from exc

        try:
            image_bgr = _decode_upload(content, content_type)
            face_hints = _parse_face_hints(request.face_hints)
            dialogues, resolved_face_hints = _resolve_dialogues(request, image_bgr, face_hints)
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
                face_hints=resolved_face_hints,
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
