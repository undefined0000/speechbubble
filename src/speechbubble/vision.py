from __future__ import annotations

from typing import Iterable

import cv2
import numpy as np

from .schemas import Rect


def _normalize_map(values: np.ndarray) -> np.ndarray:
    minimum = float(values.min())
    maximum = float(values.max())
    if maximum - minimum < 1e-6:
        return np.zeros_like(values, dtype=np.float32)
    return ((values - minimum) / (maximum - minimum)).astype(np.float32)


def detect_faces(image_bgr: np.ndarray) -> list[Rect]:
    if image_bgr is None or image_bgr.size == 0:
        return []

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return []

    min_dim = max(24, min(gray.shape[:2]) // 12)
    raw = detector.detectMultiScale(
        gray,
        scaleFactor=1.12,
        minNeighbors=4,
        flags=cv2.CASCADE_SCALE_IMAGE,
        minSize=(min_dim, min_dim),
    )
    faces = [Rect(int(x), int(y), int(w), int(h)) for x, y, w, h in raw]
    faces.sort(key=lambda rect: rect.area, reverse=True)
    return faces


def _face_penalty_mask(shape: tuple[int, int], faces: Iterable[Rect]) -> np.ndarray:
    height, width = shape
    mask = np.zeros((height, width), dtype=np.float32)
    for face in faces:
        x1 = max(0, min(width, face.x))
        y1 = max(0, min(height, face.y))
        x2 = max(0, min(width, face.x2))
        y2 = max(0, min(height, face.y2))
        if x2 <= x1 or y2 <= y1:
            continue
        mask[y1:y2, x1:x2] = 1.0
    if np.any(mask > 0):
        mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=11, sigmaY=11)
        mask = _normalize_map(mask)
    return mask


def build_obstruction_map(image_bgr: np.ndarray, faces: list[Rect]) -> np.ndarray:
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("image_bgr is empty")

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray_f = gray.astype(np.float32)

    edges = cv2.Canny(gray, 80, 180).astype(np.float32)
    edges = cv2.GaussianBlur(edges, (0, 0), sigmaX=4.0, sigmaY=4.0)
    edges = _normalize_map(edges)

    lap = cv2.Laplacian(gray_f, cv2.CV_32F, ksize=3)
    lap = np.abs(lap)
    lap = cv2.GaussianBlur(lap, (0, 0), sigmaX=3.0, sigmaY=3.0)
    lap = _normalize_map(lap)

    base = 0.65 * edges + 0.35 * lap
    base = _normalize_map(base)

    face_mask = _face_penalty_mask(gray.shape, faces)
    combined = np.clip(base + 0.85 * face_mask, 0.0, 1.0)

    height, width = gray.shape
    yy, xx = np.mgrid[0:height, 0:width]
    edge_distance = np.minimum.reduce([xx, yy, width - 1 - xx, height - 1 - yy]).astype(np.float32)
    border_penalty = 1.0 - np.clip(edge_distance / max(12.0, min(height, width) * 0.18), 0.0, 1.0)
    combined = np.clip(combined + 0.18 * border_penalty, 0.0, 1.0)
    return combined.astype(np.float32)
