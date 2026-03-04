# speechbubble

Automatic speech bubble insertion tool for illustration workflows.

Current MVP features:

- Face detection (OpenCV Haar Cascade, with manual face hints supported)
- Candidate bubble generation around each speaker anchor
- Cost-based placement optimization
  - face overlap penalty
  - obstruction map penalty
  - bubble overlap penalty
  - tail length and distance penalty
  - reading order penalty (`rtl` / `ltr`)
- Bubble rendering (ellipse / rounded rectangle, tail, text)
- Interfaces: CLI, FastAPI, Gradio (local)
- Deployment target: Vercel (serverless FastAPI endpoint)

## 1. Setup

```bash
python -m pip install -e .
```

Dev dependencies:

```bash
python -m pip install -e ".[dev]"
```

## 2. Quick local run

Generate sample input:

```bash
python examples/generate_sample.py
```

Run CLI:

```bash
python -m speechbubble.cli \
  --input examples/sample_input.png \
  --output examples/sample_output.png \
  --text-file examples/dialogues.json \
  --json-output examples/sample_output.json \
  --face-hint 340,300,260,260 \
  --face-hint 1020,270,280,280
```

Run API locally:

```bash
python -m uvicorn speechbubble.api:app --host 127.0.0.1 --port 8000
```

- Health: `GET http://127.0.0.1:8000/health`
- Process: `POST http://127.0.0.1:8000/v1/process`

Run Gradio locally:

```bash
python -m speechbubble.ui
```

## 3. API request format

`POST /v1/process` expects `multipart/form-data`:

- `image`: image file (`png`, `jpg`, ...)
- `payload`: JSON string

Example payload:

```json
{
  "dialogues": [
    { "text": "Ready?", "speaker_id": 0 },
    { "text": "Lets start.", "speaker_id": 1 }
  ],
  "auto_dialogues": true,
  "max_auto_bubbles": 4,
  "font_size": 42,
  "max_chars_per_line": 14,
  "reading_order": "rtl",
  "include_image_base64": true,
  "face_hints": [[340, 300, 260, 260], [1020, 270, 280, 280]]
}

`face_hints` is optional.  
If `dialogues` is empty and `auto_dialogues` is `true`, the server creates bubbles automatically from detected faces.
```

## 4. Deploy on Vercel

This repo is configured for Vercel with:

- serverless entrypoint: `api/index.py`
- routing: `vercel.json`
- runtime deps: `requirements.txt`

### 4.1 First-time setup

```bash
npm i -g vercel
vercel login
```

### 4.2 Deploy (preview)

```bash
vercel
```

### 4.3 Deploy (production)

```bash
vercel --prod
```

After deploy:

- `GET https://<your-domain>/` (mobile-friendly web UI)
- `GET https://<your-domain>/health`
- `POST https://<your-domain>/v1/process`

Notes:

- Gradio UI is disabled on Vercel (`ENABLE_GRADIO=0` in `api/index.py`).
- Vercel Serverless has request size and execution limits; very large images are not recommended.

## 5. Project layout

```text
api/index.py                 # Vercel serverless entrypoint
src/speechbubble/api.py      # FastAPI app
src/speechbubble/cli.py      # CLI
src/speechbubble/pipeline.py # orchestration
src/speechbubble/layout.py   # candidate search + scoring
src/speechbubble/vision.py   # face detection + obstruction map
src/speechbubble/render.py   # drawing and text layout
tests/                       # unit tests
```

## 6. Test

```bash
python -m pytest -q
```

## 7. Current limitations

- Face detection quality depends on style and resolution of the illustration.
- Text layout is currently simple line wrapping, not full Japanese typesetting.
- Optimization scope is single-image only (no multi-page reading flow yet).
