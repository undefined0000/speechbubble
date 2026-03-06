from __future__ import annotations

from fastapi.testclient import TestClient

from speechbubble.api import app


def test_root_returns_editor_html() -> None:
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "吹き出し手動エディタ" in response.text
    assert "/assets/manual_editor.js" in response.text
    assert "templateSearchInput" in response.text
    assert "templateGrid" in response.text
    assert "propRenderMode" in response.text
    assert "propTemplateId" in response.text
    assert "propFontFamily" in response.text
    assert "propTailVisible" in response.text
    assert "propTailSize" in response.text
    assert "propDirection" in response.text
    assert "propOpacity" in response.text
    assert "whisper" in response.text


def test_assets_js_is_served() -> None:
    client = TestClient(app)
    response = client.get("/assets/manual_editor.js")
    assert response.status_code == 200
    assert "javascript" in response.headers.get("content-type", "")
    assert "function boot()" in response.text
    assert "function drawVerticalText" in response.text
    assert "function nudgeTail" in response.text
    assert "function loadTemplateManifest" in response.text


def test_assets_manifest_is_served() -> None:
    client = TestClient(app)
    response = client.get("/assets/bubbles/manifest.json")
    assert response.status_code == 200
    assert "application/json" in response.headers.get("content-type", "")
    payload = response.json()
    assert isinstance(payload.get("templates"), list)
    assert len(payload["templates"]) >= 20


def test_health_and_deprecated_endpoint() -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    deprecated = client.post("/v1/process")
    assert deprecated.status_code == 410
    assert "deprecated" in deprecated.json()["detail"]
