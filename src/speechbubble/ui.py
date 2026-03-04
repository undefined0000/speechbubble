from __future__ import annotations

import json

import cv2
import gradio as gr
import numpy as np

from .pipeline import SpeechBubbleEngine
from .schemas import DialogueSpec, Rect


ENGINE = SpeechBubbleEngine()


def _parse_dialogues(raw: str) -> list[DialogueSpec]:
    lines = [line.strip() for line in raw.replace("\r\n", "\n").split("\n")]
    dialogues = [DialogueSpec(text=line) for line in lines if line]
    if not dialogues:
        raise ValueError("セリフを1行以上入力してください。")
    return dialogues


def _parse_face_hints(raw: str) -> list[Rect] | None:
    cleaned = raw.strip()
    if not cleaned:
        return None
    hints: list[Rect] = []
    for line in cleaned.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 4:
            raise ValueError("face hints は 1行ごとに x,y,w,h 形式で入力してください。")
        x, y, w, h = [int(part) for part in parts]
        if w <= 0 or h <= 0:
            raise ValueError("face hints の w/h は正の整数にしてください。")
        hints.append(Rect(x=x, y=y, w=w, h=h))
    return hints


def _run(
    image_rgb: np.ndarray,
    dialogue_text: str,
    face_hints_text: str,
    font_size: int,
    max_chars_per_line: int,
    reading_order: str,
) -> tuple[np.ndarray, str]:
    if image_rgb is None:
        raise ValueError("画像を入力してください。")

    dialogues = _parse_dialogues(dialogue_text)
    face_hints = _parse_face_hints(face_hints_text)
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    result = ENGINE.process(
        image_bgr,
        dialogues,
        font_size=int(font_size),
        max_chars_per_line=int(max_chars_per_line),
        reading_order=reading_order,
        face_hints=face_hints,
    )
    output_rgb = cv2.cvtColor(result.image_bgr, cv2.COLOR_BGR2RGB)
    metadata = json.dumps(result.to_dict(include_image=False), ensure_ascii=False, indent=2)
    return output_rgb, metadata


def build_gradio_app() -> gr.Blocks:
    with gr.Blocks(title="SpeechBubble Auto Inserter") as demo:
        gr.Markdown("## SpeechBubble Auto Inserter\nイラストに吹き出しを自動挿入します。")
        with gr.Row():
            image_input = gr.Image(label="入力画像", type="numpy")
            image_output = gr.Image(label="出力画像", type="numpy")
        dialogue_input = gr.Textbox(
            label="セリフ（1行=1吹き出し）",
            lines=6,
            value="こんにちは！\nそれじゃ、始めようか。",
        )
        face_hints = gr.Textbox(
            label="Face hints（任意、1行= x,y,w,h）",
            lines=3,
            placeholder="120,140,180,180",
        )
        with gr.Row():
            font_size = gr.Slider(minimum=16, maximum=96, value=42, step=1, label="フォントサイズ")
            max_chars = gr.Slider(minimum=6, maximum=30, value=14, step=1, label="1行の最大文字数")
            reading_order = gr.Dropdown(choices=["rtl", "ltr"], value="rtl", label="読み順")
        run_button = gr.Button("自動挿入")
        metadata_output = gr.Code(label="配置JSON", language="json")

        run_button.click(
            fn=_run,
            inputs=[image_input, dialogue_input, face_hints, font_size, max_chars, reading_order],
            outputs=[image_output, metadata_output],
        )

    return demo


def main() -> None:
    app = build_gradio_app()
    app.launch(server_name="0.0.0.0", server_port=7860, show_error=True)


if __name__ == "__main__":
    main()
