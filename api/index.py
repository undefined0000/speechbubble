from __future__ import annotations

import os
import sys
from pathlib import Path


# Vercel does not install this project package in editable mode by default.
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# Disable Gradio mount on serverless functions.
os.environ.setdefault("ENABLE_GRADIO", "0")

from speechbubble.api import app  # noqa: E402
