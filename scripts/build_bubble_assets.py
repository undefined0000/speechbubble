from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "src" / "speechbubble" / "static"
BUBBLES_DIR = STATIC_DIR / "bubbles"
TEMPLATES_DIR = BUBBLES_DIR / "templates"
MANIFEST_PATH = BUBBLES_DIR / "manifest.json"
SOURCES_PATH = BUBBLES_DIR / "SOURCES.json"
LICENSES_PATH = BUBBLES_DIR / "LICENSES.md"

VIEWBOX_WIDTH = 1000
VIEWBOX_HEIGHT = 800
VIEWBOX = f"0 0 {VIEWBOX_WIDTH} {VIEWBOX_HEIGHT}"


@dataclass(frozen=True)
class TemplateSpec:
    template_id: str
    category: str
    path_d: str
    text_box: dict[str, int]
    tail_anchors: list[dict[str, object]]
    default_style: dict[str, object]


def _fmt(num: float) -> str:
    return f"{num:.2f}".rstrip("0").rstrip(".")


def _smooth_path(points: Iterable[tuple[float, float]]) -> str:
    pts = list(points)
    if len(pts) < 3:
        raise ValueError("Need at least 3 points for smooth path")

    first = pts[0]
    last = pts[-1]
    start_mid = ((first[0] + last[0]) / 2.0, (first[1] + last[1]) / 2.0)
    path = [f"M {_fmt(start_mid[0])} {_fmt(start_mid[1])}"]

    for idx, cur in enumerate(pts):
        nxt = pts[(idx + 1) % len(pts)]
        mid = ((cur[0] + nxt[0]) / 2.0, (cur[1] + nxt[1]) / 2.0)
        path.append(
            f"Q {_fmt(cur[0])} {_fmt(cur[1])} {_fmt(mid[0])} {_fmt(mid[1])}"
        )
    path.append("Z")
    return " ".join(path)


def _blob_points(
    *,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    count: int,
    amp_a: float,
    amp_b: float,
    f_a: float,
    f_b: float,
    phase: float,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for i in range(count):
        t = (i / count) * math.tau
        mod = (
            1.0
            + amp_a * math.sin(t * f_a + phase)
            + amp_b * math.cos(t * f_b - phase * 0.5)
        )
        points.append((cx + math.cos(t) * rx * mod, cy + math.sin(t) * ry * mod))
    return points


def _star_points(
    *,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    spikes: int,
    inner: float,
    rotate: float = 0.0,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    total = spikes * 2
    for i in range(total):
        t = (i / total) * math.tau + rotate
        ratio = 1.0 if i % 2 == 0 else inner
        points.append((cx + math.cos(t) * rx * ratio, cy + math.sin(t) * ry * ratio))
    return points


def _rounded_rect_path(x: float, y: float, w: float, h: float, r: float) -> str:
    rr = min(r, w / 2.0, h / 2.0)
    x2 = x + w
    y2 = y + h
    return (
        f"M {_fmt(x + rr)} {_fmt(y)} "
        f"L {_fmt(x2 - rr)} {_fmt(y)} "
        f"Q {_fmt(x2)} {_fmt(y)} {_fmt(x2)} {_fmt(y + rr)} "
        f"L {_fmt(x2)} {_fmt(y2 - rr)} "
        f"Q {_fmt(x2)} {_fmt(y2)} {_fmt(x2 - rr)} {_fmt(y2)} "
        f"L {_fmt(x + rr)} {_fmt(y2)} "
        f"Q {_fmt(x)} {_fmt(y2)} {_fmt(x)} {_fmt(y2 - rr)} "
        f"L {_fmt(x)} {_fmt(y + rr)} "
        f"Q {_fmt(x)} {_fmt(y)} {_fmt(x + rr)} {_fmt(y)} Z"
    )


def _ellipse_path(cx: float, cy: float, rx: float, ry: float) -> str:
    return (
        f"M {_fmt(cx - rx)} {_fmt(cy)} "
        f"A {_fmt(rx)} {_fmt(ry)} 0 1 0 {_fmt(cx + rx)} {_fmt(cy)} "
        f"A {_fmt(rx)} {_fmt(ry)} 0 1 0 {_fmt(cx - rx)} {_fmt(cy)} Z"
    )


def _anchors_for_box(
    *,
    x: float,
    y: float,
    w: float,
    h: float,
) -> list[dict[str, object]]:
    cx = x + w / 2.0
    cy = y + h / 2.0
    return [
        {"id": "top", "x": round(cx), "y": round(y), "normal": {"x": 0, "y": -1}},
        {"id": "top_right", "x": round(x + w * 0.82), "y": round(y + h * 0.16), "normal": {"x": 0.7, "y": -0.7}},
        {"id": "right", "x": round(x + w), "y": round(cy), "normal": {"x": 1, "y": 0}},
        {"id": "bottom_right", "x": round(x + w * 0.82), "y": round(y + h * 0.84), "normal": {"x": 0.7, "y": 0.7}},
        {"id": "bottom", "x": round(cx), "y": round(y + h), "normal": {"x": 0, "y": 1}},
        {"id": "bottom_left", "x": round(x + w * 0.18), "y": round(y + h * 0.84), "normal": {"x": -0.7, "y": 0.7}},
        {"id": "left", "x": round(x), "y": round(cy), "normal": {"x": -1, "y": 0}},
        {"id": "top_left", "x": round(x + w * 0.18), "y": round(y + h * 0.16), "normal": {"x": -0.7, "y": -0.7}},
    ]


def _text_box_for_category(category: str) -> dict[str, int]:
    if category == "narration":
        return {"x": 140, "y": 170, "w": 720, "h": 360}
    if category == "shout":
        return {"x": 200, "y": 180, "w": 600, "h": 360}
    if category == "thought":
        return {"x": 180, "y": 170, "w": 640, "h": 400}
    if category == "whisper":
        return {"x": 170, "y": 200, "w": 660, "h": 320}
    return {"x": 170, "y": 170, "w": 660, "h": 400}


def _default_style(category: str) -> dict[str, object]:
    line_width = 4
    if category == "narration":
        line_width = 3
    elif category == "shout":
        line_width = 5
    return {
        "lineWidth": line_width,
        "fill": "#ffffff",
        "stroke": "#1b1e24",
    }


def build_specs() -> list[TemplateSpec]:
    specs: list[TemplateSpec] = []
    rng = random.Random(20260305)

    # normal: 8
    for i in range(8):
        tid = f"normal-{i + 1:02d}"
        if i < 2:
            cx = 500 + i * 8
            cy = 400
            rx = 360 - i * 12
            ry = 250 + i * 10
            d = _ellipse_path(cx, cy, rx, ry)
            anchors = _anchors_for_box(x=cx - rx, y=cy - ry, w=rx * 2, h=ry * 2)
        else:
            points = _blob_points(
                cx=500 + rng.uniform(-8, 8),
                cy=400 + rng.uniform(-8, 8),
                rx=350 + rng.uniform(-20, 20),
                ry=245 + rng.uniform(-18, 18),
                count=26 + (i % 3) * 2,
                amp_a=0.06 + i * 0.005,
                amp_b=0.045 + (i % 2) * 0.01,
                f_a=3.4 + i * 0.17,
                f_b=5.7 + i * 0.21,
                phase=i * 0.42,
            )
            d = _smooth_path(points)
            anchors = _anchors_for_box(x=150, y=140, w=700, h=520)
        specs.append(
            TemplateSpec(
                template_id=tid,
                category="normal",
                path_d=d,
                text_box=_text_box_for_category("normal"),
                tail_anchors=anchors,
                default_style=_default_style("normal"),
            )
        )

    # shout: 5
    for i in range(5):
        tid = f"shout-{i + 1:02d}"
        spikes = 12 + i
        inner = 0.58 - i * 0.03
        points = _star_points(
            cx=500,
            cy=390,
            rx=360 - i * 8,
            ry=280 - i * 5,
            spikes=spikes,
            inner=max(0.4, inner),
            rotate=i * 0.14,
        )
        d = _smooth_path(points)
        specs.append(
            TemplateSpec(
                template_id=tid,
                category="shout",
                path_d=d,
                text_box=_text_box_for_category("shout"),
                tail_anchors=_anchors_for_box(x=150, y=120, w=700, h=540),
                default_style=_default_style("shout"),
            )
        )

    # thought: 4
    for i in range(4):
        tid = f"thought-{i + 1:02d}"
        points = _blob_points(
            cx=500,
            cy=390,
            rx=350 + i * 10,
            ry=240 + i * 8,
            count=30,
            amp_a=0.14 + i * 0.01,
            amp_b=0.09 + i * 0.008,
            f_a=4.2 + i * 0.2,
            f_b=7.8 + i * 0.25,
            phase=i * 0.58,
        )
        d = _smooth_path(points)
        specs.append(
            TemplateSpec(
                template_id=tid,
                category="thought",
                path_d=d,
                text_box=_text_box_for_category("thought"),
                tail_anchors=_anchors_for_box(x=145, y=135, w=710, h=520),
                default_style=_default_style("thought"),
            )
        )

    # whisper: 4
    for i in range(4):
        tid = f"whisper-{i + 1:02d}"
        points = _blob_points(
            cx=500,
            cy=410,
            rx=360 + i * 8,
            ry=190 + i * 6,
            count=24,
            amp_a=0.04 + i * 0.008,
            amp_b=0.03 + i * 0.006,
            f_a=2.7 + i * 0.15,
            f_b=4.1 + i * 0.2,
            phase=i * 0.4,
        )
        d = _smooth_path(points)
        specs.append(
            TemplateSpec(
                template_id=tid,
                category="whisper",
                path_d=d,
                text_box=_text_box_for_category("whisper"),
                tail_anchors=_anchors_for_box(x=120, y=190, w=760, h=430),
                default_style=_default_style("whisper"),
            )
        )

    # narration: 3
    for i in range(3):
        tid = f"narration-{i + 1:02d}"
        d = _rounded_rect_path(
            x=120 + i * 8,
            y=170 + i * 4,
            w=760 - i * 16,
            h=420 - i * 8,
            r=26 + i * 10,
        )
        specs.append(
            TemplateSpec(
                template_id=tid,
                category="narration",
                path_d=d,
                text_box=_text_box_for_category("narration"),
                tail_anchors=_anchors_for_box(x=130, y=180, w=740, h=400),
                default_style=_default_style("narration"),
            )
        )

    return specs


def _write_svg(path: Path, d: str, style: dict[str, object]) -> None:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEWBOX}" width="{VIEWBOX_WIDTH}" height="{VIEWBOX_HEIGHT}">
  <path d="{d}" fill="{style['fill']}" stroke="{style['stroke']}" stroke-width="{style['lineWidth']}" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
"""
    path.write_text(svg, encoding="utf-8")


def main() -> None:
    BUBBLES_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    specs = build_specs()
    source_info = {
        "name": "Speechbubble Project CC0 Template Pack",
        "url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "license": "CC0-1.0",
        "proofUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    }

    manifest = []
    for spec in specs:
        manifest.append(
            {
                "id": spec.template_id,
                "category": spec.category,
                "source": source_info,
                "viewBox": VIEWBOX,
                "bodyPath": spec.path_d,
                "textBox": spec.text_box,
                "tailAnchors": spec.tail_anchors,
                "defaultStyle": spec.default_style,
                "svgPath": f"/assets/bubbles/templates/{spec.template_id}.svg",
            }
        )
        _write_svg(TEMPLATES_DIR / f"{spec.template_id}.svg", spec.path_d, spec.default_style)

    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "version": 1,
                "generatedAt": "2026-03-05",
                "licensePolicy": "CC0-only",
                "templates": manifest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    SOURCES_PATH.write_text(
        json.dumps(
            {
                "policy": "CC0-only",
                "sources": [
                    source_info,
                    {
                        "name": "Kenney support page",
                        "url": "https://www.kenney.nl/support",
                        "license": "CC0-1.0",
                        "proofUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                        "note": "Reference source for CC0 asset policy.",
                    },
                    {
                        "name": "OpenGameArt Kenney Emotes Pack",
                        "url": "https://opengameart.org/content/emotes-pack",
                        "license": "CC0-1.0",
                        "proofUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
                        "note": "Reference source for CC0 speech/emote style assets.",
                    },
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    LICENSES_PATH.write_text(
        """# Bubble Template Licenses

- Policy: CC0-only
- Scope: `src/speechbubble/static/bubbles/templates/*.svg` and `manifest.json`

## License

All bubble template SVG files under this directory are released under:

- CC0 1.0 Universal (Public Domain Dedication)
- https://creativecommons.org/publicdomain/zero/1.0/

## Attribution

CC0 does not require attribution. You may use these templates in commercial and non-commercial works.

## Reference Sources

- https://www.kenney.nl/support
- https://opengameart.org/content/emotes-pack
""",
        encoding="utf-8",
    )

    print(f"[build_bubble_assets] generated templates: {len(specs)}")
    print(f"[build_bubble_assets] manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
