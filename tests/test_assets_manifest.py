from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "src" / "speechbubble" / "static" / "bubbles" / "manifest.json"


def _load_manifest() -> dict:
    assert MANIFEST_PATH.exists(), f"Manifest not found: {MANIFEST_PATH}"
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def test_manifest_templates_have_required_keys_and_cc0_license() -> None:
    payload = _load_manifest()
    templates = payload.get("templates")
    assert isinstance(templates, list)
    assert len(templates) >= 20

    required_top_keys = {
        "id",
        "category",
        "source",
        "viewBox",
        "bodyPath",
        "textBox",
        "tailAnchors",
        "defaultStyle",
    }

    for item in templates:
        assert required_top_keys.issubset(item.keys())
        assert item["source"]["license"] == "CC0-1.0"
        assert isinstance(item["bodyPath"], str) and item["bodyPath"].strip()

        text_box = item["textBox"]
        assert {"x", "y", "w", "h"}.issubset(text_box.keys())
        assert text_box["w"] > 0
        assert text_box["h"] > 0

        anchors = item["tailAnchors"]
        assert isinstance(anchors, list)
        assert len(anchors) >= 1
        for anchor in anchors:
            assert {"id", "x", "y", "normal"}.issubset(anchor.keys())
            assert {"x", "y"}.issubset(anchor["normal"].keys())
