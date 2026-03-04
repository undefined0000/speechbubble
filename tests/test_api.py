from __future__ import annotations

from fastapi.testclient import TestClient

from speechbubble.api import app


def test_root_returns_editor_html() -> None:
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Manual Speech Bubble Editor" in response.text
    assert "/assets/manual_editor.js" in response.text


def test_assets_js_is_served() -> None:
    client = TestClient(app)
    response = client.get("/assets/manual_editor.js")
    assert response.status_code == 200
    assert "javascript" in response.headers.get("content-type", "")
    assert "function boot()" in response.text


def test_health_and_deprecated_endpoint() -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    deprecated = client.post("/v1/process")
    assert deprecated.status_code == 410
    assert "deprecated" in deprecated.json()["detail"]
