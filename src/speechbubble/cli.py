from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import SpeechBubbleEngine, load_image, save_image
from .schemas import DialogueSpec, Rect


def _load_dialogues(texts: list[str] | None, text_file: str | None) -> list[DialogueSpec]:
    dialogues: list[DialogueSpec] = []
    if text_file:
        path = Path(text_file)
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("text-file must contain a JSON list")
        for index, item in enumerate(data):
            if isinstance(item, str):
                dialogues.append(DialogueSpec(text=item))
                continue
            if not isinstance(item, dict):
                raise ValueError(f"dialogue[{index}] must be string or object")
            dialogues.append(
                DialogueSpec(
                    text=str(item.get("text", "")).strip(),
                    speaker_id=item.get("speaker_id"),
                    style=str(item.get("style", "auto")),
                )
            )
    if texts:
        dialogues.extend(DialogueSpec(text=text) for text in texts)
    dialogues = [dialogue for dialogue in dialogues if dialogue.text]
    if not dialogues:
        raise ValueError("No dialogue found. Use --text or --text-file.")
    return dialogues


def _parse_face_hints(raw_hints: list[str] | None) -> list[Rect]:
    if not raw_hints:
        return []
    hints: list[Rect] = []
    for raw in raw_hints:
        parts = [part.strip() for part in raw.split(",")]
        if len(parts) != 4:
            raise ValueError(f"Invalid face hint '{raw}'. Expected format: x,y,w,h")
        x, y, w, h = [int(part) for part in parts]
        if w <= 0 or h <= 0:
            raise ValueError(f"Invalid face hint '{raw}'. Width and height must be > 0")
        hints.append(Rect(x, y, w, h))
    return hints


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Automatic speech bubble insertion CLI")
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output image path")
    parser.add_argument("--text", action="append", help="Dialogue text. Repeat for multiple bubbles.")
    parser.add_argument("--text-file", help="JSON file containing dialogue list")
    parser.add_argument("--json-output", help="Path to save placement metadata JSON")
    parser.add_argument("--font-path", help="Optional path to TTF/TTC font")
    parser.add_argument("--font-size", type=int, default=42, help="Font size in px")
    parser.add_argument(
        "--max-chars-per-line",
        type=int,
        default=14,
        help="Soft wrap length per line",
    )
    parser.add_argument(
        "--reading-order",
        choices=["rtl", "ltr"],
        default="rtl",
        help="Reading order preference for placement optimization",
    )
    parser.add_argument(
        "--face-hint",
        action="append",
        help="Optional manual face rect hint (x,y,w,h). Repeat to add multiple hints.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    dialogues = _load_dialogues(args.text, args.text_file)
    face_hints = _parse_face_hints(args.face_hint)

    image = load_image(args.input)
    engine = SpeechBubbleEngine()
    result = engine.process(
        image,
        dialogues,
        font_size=args.font_size,
        font_path=args.font_path,
        max_chars_per_line=args.max_chars_per_line,
        reading_order=args.reading_order,
        face_hints=face_hints if face_hints else None,
    )

    save_image(args.output, result.image_bgr)
    metadata = result.to_dict(include_image=False)
    metadata["output_path"] = str(Path(args.output).resolve())
    if args.json_output:
        output_path = Path(args.json_output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[speechbubble] saved image: {args.output}")
    print(f"[speechbubble] faces: {len(result.faces)}, bubbles: {len(result.placements)}")
    if args.json_output:
        print(f"[speechbubble] metadata: {args.json_output}")


if __name__ == "__main__":
    main()
