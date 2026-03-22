from __future__ import annotations

import os
import mimetypes
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
EDITOR_HTML_PATH = STATIC_DIR / "manual_editor.html"

mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("font/otf", ".otf")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/woff2", ".woff2")


def _load_editor_html() -> str:
    if not EDITOR_HTML_PATH.exists():
        return "<h1>Editor file is missing</h1>"
    return EDITOR_HTML_PATH.read_text(encoding="utf-8")


def _build_app() -> FastAPI:
    app = FastAPI(
        title="SpeechBubble Manual Editor API",
        version="2.0.0",
        description="Manual speech bubble and text insertion tool",
    )
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")

    @app.get("/", response_class=HTMLResponse)
    async def home() -> str:
        return _load_editor_html()

    @app.get("/editor", response_class=HTMLResponse)
    async def editor() -> str:
        return _load_editor_html()

    @app.get("/favicon.ico")
    async def favicon() -> Response:
        return Response(status_code=204)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/process")
    async def deprecated_info() -> JSONResponse:
        return JSONResponse(
            status_code=410,
            content={
                "detail": "Automatic face-based placement is deprecated in this deployment. Use manual editor at /",
            },
        )

    @app.post("/v1/process")
    async def deprecated_info_post() -> JSONResponse:
        return JSONResponse(
            status_code=410,
            content={
                "detail": "Automatic face-based placement is deprecated in this deployment. Use manual editor at /",
            },
        )

    return app


app = _build_app()


def run() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("speechbubble.api:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    run()
