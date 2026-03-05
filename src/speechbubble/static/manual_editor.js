"use strict";

const els = {
  canvas: document.getElementById("editorCanvas"),
  viewport: document.getElementById("canvasViewport"),
  emptyState: document.getElementById("emptyState"),
  statusBar: document.getElementById("statusBar"),
  imageInput: document.getElementById("imageInput"),
  projectInput: document.getElementById("projectInput"),
  loadImageBtn: document.getElementById("loadImageBtn"),
  addBubbleBtn: document.getElementById("addBubbleBtn"),
  addTextBtn: document.getElementById("addTextBtn"),
  duplicateBtn: document.getElementById("duplicateBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  fitBtn: document.getElementById("fitBtn"),
  zoomRange: document.getElementById("zoomRange"),
  zoomLabel: document.getElementById("zoomLabel"),
  saveProjectBtn: document.getElementById("saveProjectBtn"),
  loadProjectBtn: document.getElementById("loadProjectBtn"),
  exportPngBtn: document.getElementById("exportPngBtn"),
  layerList: document.getElementById("layerList"),
  noSelectionText: document.getElementById("noSelectionText"),
  propPanel: document.getElementById("propPanel"),
  propKind: document.getElementById("propKind"),
  propShapeWrap: document.getElementById("propShapeWrap"),
  propShape: document.getElementById("propShape"),
  propText: document.getElementById("propText"),
  propX: document.getElementById("propX"),
  propY: document.getElementById("propY"),
  propW: document.getElementById("propW"),
  propH: document.getElementById("propH"),
  propTailX: document.getElementById("propTailX"),
  propTailY: document.getElementById("propTailY"),
  propTailSize: document.getElementById("propTailSize"),
  tailLeftBtn: document.getElementById("tailLeftBtn"),
  tailUpBtn: document.getElementById("tailUpBtn"),
  tailDownBtn: document.getElementById("tailDownBtn"),
  tailRightBtn: document.getElementById("tailRightBtn"),
  propFontSize: document.getElementById("propFontSize"),
  propPadding: document.getElementById("propPadding"),
  propStrokeWidth: document.getElementById("propStrokeWidth"),
  propAlign: document.getElementById("propAlign"),
  propDirection: document.getElementById("propDirection"),
  propOpacity: document.getElementById("propOpacity"),
  propOpacityLabel: document.getElementById("propOpacityLabel"),
  propFill: document.getElementById("propFill"),
  propStroke: document.getElementById("propStroke"),
  propTextColor: document.getElementById("propTextColor"),
  propTextBoxField: document.getElementById("propTextBoxField"),
  propUseTextBox: document.getElementById("propUseTextBox"),
  bubbleTailFields: document.getElementById("bubbleTailFields"),
};

const state = {
  image: null,
  imageDataUrl: null,
  imageWidth: 0,
  imageHeight: 0,
  fitScale: 1,
  zoom: 1,
  objects: [],
  selectedId: null,
  nextId: 1,
  pointerMode: null,
  pointerId: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  changedDuringPointer: false,
  history: [],
  historyIndex: -1,
  syncingProps: false,
};

const MAX_HISTORY = 80;
const SHAPE_SET = new Set(["ellipse", "rounded", "cloud", "shout", "thought", "whisper"]);
const TEXT_DIRECTION_SET = new Set(["horizontal", "vertical"]);

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeShape(value) {
  return SHAPE_SET.has(value) ? value : "ellipse";
}

function normalizeTextDirection(value) {
  return TEXT_DIRECTION_SET.has(value) ? value : "horizontal";
}

function status(text, kind = "") {
  els.statusBar.textContent = text;
  els.statusBar.className = "status";
  if (kind) {
    els.statusBar.classList.add(kind);
  }
}

function byId(id) {
  return state.objects.find((obj) => obj.id === id) || null;
}

function currentSelection() {
  return byId(state.selectedId);
}

function normalizeObject(raw) {
  const base = {
    id: Number(raw.id) || 0,
    kind: raw.kind === "text" ? "text" : "bubble",
    text: String(raw.text || ""),
    x: safeNumber(raw.x, 0),
    y: safeNumber(raw.y, 0),
    w: Math.max(24, safeNumber(raw.w, 120)),
    h: Math.max(24, safeNumber(raw.h, 60)),
    fill: colorOrFallback(raw.fill, "#ffffff"),
    stroke: colorOrFallback(raw.stroke, "#1b1e24"),
    strokeWidth: Math.max(0, safeNumber(raw.strokeWidth, 0)),
    textColor: colorOrFallback(raw.textColor, "#111111"),
    fontSize: Math.max(8, safeNumber(raw.fontSize, 24)),
    padding: Math.max(0, safeNumber(raw.padding, 10)),
    align: raw.align === "left" ? "left" : "center",
    opacity: clamp(Math.round(safeNumber(raw.opacity, 100)), 5, 100),
    textDirection: normalizeTextDirection(raw.textDirection),
  };

  if (base.kind === "bubble") {
    base.shape = normalizeShape(raw.shape);
    base.tailX = safeNumber(raw.tailX, base.x + base.w / 2);
    base.tailY = safeNumber(raw.tailY, base.y + base.h + 40);
    base.tailSize = Math.max(4, safeNumber(raw.tailSize, 16));
  } else {
    base.useTextBox = Boolean(raw.useTextBox);
  }
  return base;
}

function normalizeAndClampAllObjects() {
  state.objects = state.objects.map((obj) => normalizeObject(obj));
  for (const obj of state.objects) {
    clampObjectBounds(obj);
  }
  const maxId = state.objects.reduce((max, obj) => Math.max(max, Number(obj.id) || 0), 0);
  state.nextId = Math.max(state.nextId, maxId + 1);
}

function pushHistory() {
  const snap = {
    objects: deepCopy(state.objects),
    selectedId: state.selectedId,
  };
  const prev = state.history[state.historyIndex];
  if (prev && JSON.stringify(prev) === JSON.stringify(snap)) {
    return;
  }
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snap);
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }
  state.historyIndex = state.history.length - 1;
  syncUndoRedoButtons();
}

function restoreHistory(index) {
  if (index < 0 || index >= state.history.length) {
    return;
  }
  const snap = state.history[index];
  state.objects = deepCopy(snap.objects);
  state.selectedId = snap.selectedId;
  normalizeAndClampAllObjects();
  state.historyIndex = index;
  syncUndoRedoButtons();
  syncPropertyPanel();
  renderLayerList();
  draw();
}

function undo() {
  restoreHistory(state.historyIndex - 1);
}

function redo() {
  restoreHistory(state.historyIndex + 1);
}

function syncUndoRedoButtons() {
  els.undoBtn.disabled = state.historyIndex <= 0;
  els.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

function getCanvasScale() {
  return state.fitScale * state.zoom;
}

function fitToViewport() {
  state.zoom = 1;
  els.zoomRange.value = "100";
  els.zoomLabel.textContent = "100%";
  updateCanvasMetrics();
  draw();
}

function updateCanvasMetrics() {
  if (!state.image) {
    els.canvas.width = 1;
    els.canvas.height = 1;
    els.canvas.style.width = "1px";
    els.canvas.style.height = "1px";
    return;
  }
  const rect = els.viewport.getBoundingClientRect();
  const availableW = Math.max(260, rect.width - 10);
  const availableH = Math.max(280, rect.height - 10);
  const fit = Math.min(availableW / state.imageWidth, availableH / state.imageHeight, 1);
  state.fitScale = Number.isFinite(fit) && fit > 0 ? fit : 1;

  const scale = getCanvasScale();
  const cssW = Math.max(1, Math.round(state.imageWidth * scale));
  const cssH = Math.max(1, Math.round(state.imageHeight * scale));
  const dpr = window.devicePixelRatio || 1;

  els.canvas.style.width = cssW + "px";
  els.canvas.style.height = cssH + "px";
  els.canvas.width = Math.max(1, Math.round(cssW * dpr));
  els.canvas.height = Math.max(1, Math.round(cssH * dpr));
}

function toImagePoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const scale = getCanvasScale();
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
}

function colorOrFallback(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function makeBubble() {
  const w = Math.max(180, state.imageWidth * 0.28);
  const h = Math.max(110, state.imageHeight * 0.16);
  const x = clamp(state.imageWidth * 0.3, 0, state.imageWidth - w);
  const y = clamp(state.imageHeight * 0.2, 0, state.imageHeight - h);
  return {
    id: state.nextId++,
    kind: "bubble",
    shape: "ellipse",
    text: "セリフ",
    x,
    y,
    w,
    h,
    tailX: x + w * 0.5,
    tailY: y + h + Math.min(110, state.imageHeight * 0.12),
    tailSize: Math.max(10, Math.round(Math.min(w, h) * 0.12)),
    fill: "#ffffff",
    stroke: "#1b1e24",
    strokeWidth: 4,
    textColor: "#111111",
    fontSize: Math.max(24, Math.round(Math.min(w, h) * 0.24)),
    padding: 22,
    align: "center",
    opacity: 100,
    textDirection: "horizontal",
  };
}

function makeText() {
  const w = Math.max(200, state.imageWidth * 0.25);
  const h = Math.max(90, state.imageHeight * 0.12);
  const x = clamp(state.imageWidth * 0.35, 0, state.imageWidth - w);
  const y = clamp(state.imageHeight * 0.35, 0, state.imageHeight - h);
  return {
    id: state.nextId++,
    kind: "text",
    text: "テキスト",
    x,
    y,
    w,
    h,
    fill: "#ffffff",
    stroke: "#1b1e24",
    strokeWidth: 0,
    useTextBox: false,
    textColor: "#111111",
    fontSize: Math.max(24, Math.round(Math.min(w, h) * 0.35)),
    padding: 10,
    align: "left",
    opacity: 100,
    textDirection: "horizontal",
  };
}
function addObject(kind) {
  if (!state.image) {
    status("先に画像を読み込んでください。", "err");
    return;
  }
  const obj = kind === "bubble" ? makeBubble() : makeText();
  state.objects.push(obj);
  state.selectedId = obj.id;
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status(kind === "bubble" ? "吹き出しを追加しました。" : "テキストを追加しました。", "ok");
}

function deleteSelected() {
  if (!state.selectedId) {
    return;
  }
  state.objects = state.objects.filter((obj) => obj.id !== state.selectedId);
  state.selectedId = null;
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status("選択中のオブジェクトを削除しました。", "ok");
}

function duplicateSelected() {
  const obj = currentSelection();
  if (!obj) {
    return;
  }
  const copy = deepCopy(obj);
  copy.id = state.nextId++;
  copy.x = clamp(copy.x + 24, 0, Math.max(0, state.imageWidth - copy.w));
  copy.y = clamp(copy.y + 24, 0, Math.max(0, state.imageHeight - copy.h));
  if (copy.kind === "bubble") {
    copy.tailX += 24;
    copy.tailY += 24;
  }
  state.objects.push(copy);
  state.selectedId = copy.id;
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status("複製しました。", "ok");
}

function moveLayer(id, direction) {
  const idx = state.objects.findIndex((obj) => obj.id === id);
  if (idx < 0) {
    return;
  }
  const nextIdx = clamp(idx + direction, 0, state.objects.length - 1);
  if (nextIdx === idx) {
    return;
  }
  const [item] = state.objects.splice(idx, 1);
  state.objects.splice(nextIdx, 0, item);
  pushHistory();
  renderLayerList();
  draw();
}

function downloadBlob(blob, filename) {
  if (!blob) {
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function saveProject() {
  if (!state.image || !state.imageDataUrl) {
    status("保存前に画像を読み込んでください。", "err");
    return;
  }
  const payload = {
    version: 2,
    imageDataUrl: state.imageDataUrl,
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
    nextId: state.nextId,
    objects: state.objects,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, "speechbubble-project.json");
  status("プロジェクトJSONを保存しました。", "ok");
}

async function loadProjectFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object") {
    throw new Error("不正なJSONです。");
  }
  if (!payload.imageDataUrl || !Array.isArray(payload.objects)) {
    throw new Error("imageDataUrl / objects が不足しています。");
  }
  await setBackgroundFromDataUrl(payload.imageDataUrl);
  state.objects = payload.objects.map((obj) => normalizeObject(obj));
  const maxId = state.objects.reduce((max, obj) => Math.max(max, Number(obj.id) || 0), 0);
  state.nextId = Math.max(Number(payload.nextId) || 1, maxId + 1);
  state.selectedId = state.objects.length ? state.objects[state.objects.length - 1].id : null;
  state.history = [];
  state.historyIndex = -1;
  normalizeAndClampAllObjects();
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status("プロジェクトを読み込みました。", "ok");
}

function exportPng() {
  if (!state.image) {
    status("先に画像を読み込んでください。", "err");
    return;
  }
  const off = document.createElement("canvas");
  off.width = state.imageWidth;
  off.height = state.imageHeight;
  const ctx = off.getContext("2d");
  if (!ctx) {
    status("キャンバスの初期化に失敗しました。", "err");
    return;
  }
  renderScene(ctx, 1, false);
  off.toBlob((blob) => {
    if (!blob) {
      status("PNG書き出しに失敗しました。", "err");
      return;
    }
    downloadBlob(blob, "speechbubble-export.png");
    status("PNGを書き出しました。", "ok");
  }, "image/png");
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function ellipsePath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(
    x + w / 2,
    y + h / 2,
    Math.max(4, w / 2),
    Math.max(4, h / 2),
    0,
    0,
    Math.PI * 2
  );
  ctx.closePath();
}

function cloudPath(ctx, x, y, w, h, roughness = 0.14) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(10, w / 2);
  const ry = Math.max(10, h / 2);
  const points = [];
  const count = clamp(Math.round((w + h) / 28), 14, 34);

  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const mod = 1 + roughness * Math.sin(t * 3.7) + roughness * 0.65 * Math.cos(t * 6.2);
    points.push({
      x: cx + Math.cos(t) * rx * mod,
      y: cy + Math.sin(t) * ry * mod,
    });
  }

  const first = points[0];
  const last = points[points.length - 1];
  const firstMid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  ctx.beginPath();
  ctx.moveTo(firstMid.x, firstMid.y);
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const mid = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }
  ctx.closePath();
}

function shoutPath(ctx, x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(10, w / 2);
  const ry = Math.max(10, h / 2);
  const spikes = clamp(Math.round((w + h) / 18), 20, 52);
  ctx.beginPath();
  for (let i = 0; i < spikes; i += 1) {
    const t = (i / spikes) * Math.PI * 2;
    const ratio = i % 2 === 0 ? 1.05 : 0.72;
    const px = cx + Math.cos(t) * rx * ratio;
    const py = cy + Math.sin(t) * ry * ratio;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function bubbleTailBase(obj) {
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const tx = obj.tailX;
  const ty = obj.tailY;
  if (obj.shape === "ellipse") {
    const rx = Math.max(2, obj.w / 2);
    const ry = Math.max(2, obj.h / 2);
    const vx = tx - cx;
    const vy = ty - cy;
    const norm = Math.sqrt((vx * vx) / (rx * rx) + (vy * vy) / (ry * ry));
    if (!Number.isFinite(norm) || norm < 1e-5) {
      return { x: cx, y: obj.y + obj.h };
    }
    return { x: cx + vx / norm, y: cy + vy / norm };
  }
  const localX = clamp(tx, obj.x, obj.x + obj.w);
  const localY = clamp(ty, obj.y, obj.y + obj.h);
  const dLeft = Math.abs(localX - obj.x);
  const dRight = Math.abs(localX - (obj.x + obj.w));
  const dTop = Math.abs(localY - obj.y);
  const dBottom = Math.abs(localY - (obj.y + obj.h));
  const minDist = Math.min(dLeft, dRight, dTop, dBottom);
  if (minDist === dLeft) {
    return { x: obj.x, y: localY };
  }
  if (minDist === dRight) {
    return { x: obj.x + obj.w, y: localY };
  }
  if (minDist === dTop) {
    return { x: localX, y: obj.y };
  }
  return { x: localX, y: obj.y + obj.h };
}

function drawTailTriangle(ctx, obj, base, scaleRatio = 1) {
  const rawTail = safeNumber(obj.tailSize, Math.min(obj.w, obj.h) * 0.12);
  const tailWidth = Math.max(6, rawTail * scaleRatio);
  const vx = obj.tailX - base.x;
  const vy = obj.tailY - base.y;
  const len = Math.max(1, Math.hypot(vx, vy));
  const px = -vy / len;
  const py = vx / len;
  const left = { x: base.x + px * tailWidth, y: base.y + py * tailWidth };
  const right = { x: base.x - px * tailWidth, y: base.y - py * tailWidth };

  ctx.beginPath();
  ctx.moveTo(obj.tailX, obj.tailY);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  if ((Number(obj.strokeWidth) || 0) > 0) {
    ctx.stroke();
  }
}

function drawThoughtTail(ctx, obj, base) {
  const radius = Math.max(4, safeNumber(obj.tailSize, 16));
  const dx = obj.tailX - base.x;
  const dy = obj.tailY - base.y;
  const steps = 3;

  for (let i = 1; i <= steps; i += 1) {
    const t = i / (steps + 1);
    const cx = base.x + dx * t;
    const cy = base.y + dy * t;
    const r = radius * (0.88 - t * 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, r), 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    if ((Number(obj.strokeWidth) || 0) > 0) {
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(obj.tailX, obj.tailY, Math.max(2, radius * 0.34), 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  if ((Number(obj.strokeWidth) || 0) > 0) {
    ctx.stroke();
  }
}

function drawBubbleBodyPath(ctx, obj) {
  switch (obj.shape) {
    case "rounded":
      roundedRectPath(ctx, obj.x, obj.y, obj.w, obj.h, Math.min(obj.w, obj.h) * 0.22);
      break;
    case "cloud":
      cloudPath(ctx, obj.x, obj.y, obj.w, obj.h, 0.14);
      break;
    case "shout":
      shoutPath(ctx, obj.x, obj.y, obj.w, obj.h);
      break;
    case "thought":
      cloudPath(ctx, obj.x, obj.y, obj.w, obj.h, 0.1);
      break;
    case "whisper":
      roundedRectPath(ctx, obj.x, obj.y, obj.w, obj.h, Math.min(obj.w, obj.h) * 0.32);
      break;
    case "ellipse":
    default:
      ellipsePath(ctx, obj.x, obj.y, obj.w, obj.h);
      break;
  }
}

function wrapText(ctx, text, maxWidth) {
  const result = [];
  const paragraphs = String(text || "").replace(/\r/g, "").split("\n");
  for (let pIndex = 0; pIndex < paragraphs.length; pIndex += 1) {
    const paragraph = paragraphs[pIndex];
    if (!paragraph) {
      result.push("");
      continue;
    }
    const tokens = paragraph.includes(" ")
      ? paragraph.split(/(\s+)/).filter(Boolean)
      : Array.from(paragraph);
    let line = "";
    for (const token of tokens) {
      const candidate = line + token;
      const width = ctx.measureText(candidate).width;
      if (width > maxWidth && line.length > 0) {
        result.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    result.push(line.trimEnd());
    if (pIndex < paragraphs.length - 1) {
      result.push("");
    }
  }
  return result.length ? result : [""];
}

function layoutVerticalColumns(text, maxRows, maxCols) {
  const columns = [[]];
  const chars = Array.from(String(text || "").replace(/\r/g, ""));
  for (const ch of chars) {
    if (ch === "\n") {
      if (columns.length >= maxCols) {
        break;
      }
      columns.push([]);
      continue;
    }
    let col = columns[columns.length - 1];
    if (col.length >= maxRows) {
      if (columns.length >= maxCols) {
        break;
      }
      columns.push([]);
      col = columns[columns.length - 1];
    }
    col.push(ch);
  }
  return columns.length ? columns : [[""]];
}

function drawHorizontalText(ctx, obj, centered) {
  const fontSize = Math.max(8, Number(obj.fontSize) || 24);
  const padding = Math.max(0, Number(obj.padding) || 0);
  const align = obj.align === "left" ? "left" : "center";
  const maxTextWidth = Math.max(1, obj.w - padding * 2);
  ctx.font = `${fontSize}px "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif`;
  ctx.fillStyle = colorOrFallback(obj.textColor, "#111111");
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const lines = wrapText(ctx, obj.text || "", maxTextWidth);
  const lineHeight = fontSize * 1.28;
  const textHeight = lines.length * lineHeight;
  let y = centered
    ? obj.y + (obj.h - textHeight) / 2 + fontSize
    : obj.y + padding + fontSize;
  const x = align === "left" ? obj.x + padding : obj.x + obj.w / 2;
  const clipLines = Math.max(1, Math.floor((obj.h - padding * 2) / lineHeight));
  for (let i = 0; i < Math.min(lines.length, clipLines); i += 1) {
    ctx.fillText(lines[i], x, y);
    y += lineHeight;
  }
}

function drawVerticalText(ctx, obj, centered) {
  const fontSize = Math.max(8, Number(obj.fontSize) || 24);
  const padding = Math.max(0, Number(obj.padding) || 0);
  const innerW = Math.max(1, obj.w - padding * 2);
  const innerH = Math.max(1, obj.h - padding * 2);
  const colWidth = Math.max(fontSize * 1.15, 10);
  const rowStep = Math.max(fontSize * 1.15, 10);
  const maxRows = Math.max(1, Math.floor(innerH / rowStep));
  const maxCols = Math.max(1, Math.floor(innerW / colWidth));
  const columns = layoutVerticalColumns(obj.text || "", maxRows, maxCols);
  const usedCols = Math.min(columns.length, maxCols);
  const totalColsWidth = usedCols * colWidth;

  ctx.font = `${fontSize}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx.fillStyle = colorOrFallback(obj.textColor, "#111111");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const blockRight = obj.align === "left"
    ? obj.x + obj.w - padding
    : obj.x + (obj.w + totalColsWidth) / 2;
  if (centered) {
    const maxUsedRows = columns.reduce((max, col) => Math.max(max, col.length), 1);
    const totalRowsHeight = maxUsedRows * rowStep;
    const offsetY = Math.max(0, (innerH - totalRowsHeight) / 2);
    const baseY = obj.y + padding + offsetY + rowStep / 2;
    for (let colIndex = 0; colIndex < usedCols; colIndex += 1) {
      const x = blockRight - colWidth * colIndex - colWidth / 2;
      const col = columns[colIndex];
      for (let rowIndex = 0; rowIndex < col.length && rowIndex < maxRows; rowIndex += 1) {
        const y = baseY + rowStep * rowIndex;
        ctx.fillText(col[rowIndex], x, y);
      }
    }
    return;
  }

  const topY = obj.y + padding + rowStep / 2;
  for (let colIndex = 0; colIndex < usedCols; colIndex += 1) {
    const x = blockRight - colWidth * colIndex - colWidth / 2;
    const col = columns[colIndex];
    for (let rowIndex = 0; rowIndex < col.length && rowIndex < maxRows; rowIndex += 1) {
      const y = topY + rowStep * rowIndex;
      ctx.fillText(col[rowIndex], x, y);
    }
  }
}

function drawTextInObject(ctx, obj, centered) {
  ctx.save();
  ctx.globalAlpha = clamp(safeNumber(obj.opacity, 100), 5, 100) / 100;
  if (obj.textDirection === "vertical") {
    drawVerticalText(ctx, obj, centered);
  } else {
    drawHorizontalText(ctx, obj, centered);
  }
  ctx.restore();
}

function drawBubble(ctx, obj) {
  const fill = colorOrFallback(obj.fill, "#ffffff");
  const stroke = colorOrFallback(obj.stroke, "#1b1e24");
  const strokeWidth = Math.max(0, Number(obj.strokeWidth) || 0);
  const base = bubbleTailBase(obj);

  ctx.save();
  ctx.globalAlpha = clamp(safeNumber(obj.opacity, 100), 5, 100) / 100;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = obj.shape === "shout" ? "miter" : "round";
  ctx.lineCap = "round";
  ctx.setLineDash(obj.shape === "whisper" ? [12, 10] : []);

  if (obj.shape === "thought") {
    drawThoughtTail(ctx, obj, base);
  } else if (obj.shape === "whisper") {
    drawTailTriangle(ctx, obj, base, 0.62);
  } else if (obj.shape === "shout") {
    drawTailTriangle(ctx, obj, base, 1.15);
  } else {
    drawTailTriangle(ctx, obj, base, 1);
  }

  drawBubbleBodyPath(ctx, obj);
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.stroke();
  }
  ctx.restore();
  drawTextInObject(ctx, obj, true);
}

function drawTextObject(ctx, obj) {
  const useBox = Boolean(obj.useTextBox);
  const strokeWidth = Math.max(0, Number(obj.strokeWidth) || 0);
  if (useBox) {
    ctx.save();
    ctx.globalAlpha = clamp(safeNumber(obj.opacity, 100), 5, 100) / 100;
    ctx.fillStyle = colorOrFallback(obj.fill, "#ffffff");
    ctx.strokeStyle = colorOrFallback(obj.stroke, "#1b1e24");
    ctx.lineWidth = strokeWidth;
    roundedRectPath(ctx, obj.x, obj.y, obj.w, obj.h, Math.min(16, Math.min(obj.w, obj.h) * 0.18));
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.stroke();
    }
    ctx.restore();
  }
  drawTextInObject(ctx, obj, false);
}

function drawSelection(ctx, obj, scale) {
  const handleRadius = 12 / scale;
  const tailHandleRadius = 14 / scale;
  ctx.save();
  ctx.strokeStyle = "#0b5fff";
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash([8 / scale, 6 / scale]);
  ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
  ctx.setLineDash([]);
  const resize = { x: obj.x + obj.w, y: obj.y + obj.h };
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(resize.x, resize.y, handleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (obj.kind === "bubble") {
    const centerX = obj.x + obj.w / 2;
    const centerY = obj.y + obj.h / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(obj.tailX, obj.tailY);
    ctx.stroke();

    ctx.fillStyle = "#e6f0ff";
    ctx.beginPath();
    ctx.arc(obj.tailX, obj.tailY, tailHandleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function renderScene(ctx, scale, includeSelection) {
  if (!state.image) {
    return;
  }
  ctx.save();
  ctx.scale(scale, scale);
  ctx.drawImage(state.image, 0, 0, state.imageWidth, state.imageHeight);
  for (const obj of state.objects) {
    if (obj.kind === "bubble") {
      drawBubble(ctx, obj);
    } else {
      drawTextObject(ctx, obj);
    }
  }
  if (includeSelection) {
    const selected = currentSelection();
    if (selected) {
      drawSelection(ctx, selected, scale);
    }
  }
  ctx.restore();
}

function draw() {
  const ctx = els.canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (!state.image) {
    return;
  }
  renderScene(ctx, getCanvasScale() * dpr, true);
}

function pointInObject(point, obj) {
  if (obj.kind === "bubble") {
    if (obj.shape === "ellipse") {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      const rx = Math.max(2, obj.w / 2);
      const ry = Math.max(2, obj.h / 2);
      const nx = (point.x - cx) / rx;
      const ny = (point.y - cy) / ry;
      return nx * nx + ny * ny <= 1;
    }
    if (obj.shape === "cloud" || obj.shape === "thought") {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.h / 2;
      const rx = Math.max(2, obj.w / 2);
      const ry = Math.max(2, obj.h / 2);
      const nx = (point.x - cx) / rx;
      const ny = (point.y - cy) / ry;
      return nx * nx + ny * ny <= 1.28;
    }
  }
  return (
    point.x >= obj.x &&
    point.x <= obj.x + obj.w &&
    point.y >= obj.y &&
    point.y <= obj.y + obj.h
  );
}

function handleHit(point, obj) {
  const scale = getCanvasScale();
  const resizeRadius = 18 / scale;
  const tailRadius = 22 / scale;
  const resize = { x: obj.x + obj.w, y: obj.y + obj.h };
  if (Math.hypot(point.x - resize.x, point.y - resize.y) <= resizeRadius) {
    return "resize";
  }
  if (obj.kind === "bubble" && Math.hypot(point.x - obj.tailX, point.y - obj.tailY) <= tailRadius) {
    return "tail";
  }
  return null;
}

function hitTest(point) {
  for (let i = state.objects.length - 1; i >= 0; i -= 1) {
    const obj = state.objects[i];
    if (pointInObject(point, obj)) {
      return obj;
    }
  }
  return null;
}

function clampObjectBounds(obj) {
  obj.w = Math.max(24, obj.w);
  obj.h = Math.max(24, obj.h);
  obj.x = clamp(obj.x, 0, Math.max(0, state.imageWidth - obj.w));
  obj.y = clamp(obj.y, 0, Math.max(0, state.imageHeight - obj.h));
  obj.opacity = clamp(Math.round(safeNumber(obj.opacity, 100)), 5, 100);
  obj.textDirection = normalizeTextDirection(obj.textDirection);
  if (obj.kind === "bubble") {
    obj.shape = normalizeShape(obj.shape);
    obj.tailX = clamp(obj.tailX, 0, state.imageWidth);
    obj.tailY = clamp(obj.tailY, 0, state.imageHeight);
    obj.tailSize = Math.max(4, safeNumber(obj.tailSize, 16));
  }
}

function syncOpacityLabel(value) {
  const opacity = clamp(Math.round(safeNumber(value, 100)), 5, 100);
  els.propOpacityLabel.textContent = `${opacity}%`;
}

function syncPropertyPanel() {
  const obj = currentSelection();
  state.syncingProps = true;
  if (!obj) {
    els.noSelectionText.classList.remove("hidden");
    els.propPanel.classList.add("hidden");
    state.syncingProps = false;
    return;
  }
  els.noSelectionText.classList.add("hidden");
  els.propPanel.classList.remove("hidden");

  els.propKind.value = obj.kind;
  els.propShape.value = normalizeShape(obj.shape || "ellipse");
  els.propText.value = obj.text || "";
  els.propX.value = Math.round(obj.x);
  els.propY.value = Math.round(obj.y);
  els.propW.value = Math.round(obj.w);
  els.propH.value = Math.round(obj.h);
  els.propTailX.value = Math.round(obj.tailX || obj.x + obj.w / 2);
  els.propTailY.value = Math.round(obj.tailY || obj.y + obj.h + 60);
  els.propTailSize.value = Math.round(obj.tailSize || 16);
  els.propFontSize.value = Math.round(obj.fontSize || 28);
  els.propPadding.value = Math.round(obj.padding || 0);
  els.propStrokeWidth.value = Math.round(obj.strokeWidth || 0);
  els.propAlign.value = obj.align === "left" ? "left" : "center";
  els.propDirection.value = normalizeTextDirection(obj.textDirection);
  els.propOpacity.value = clamp(Math.round(safeNumber(obj.opacity, 100)), 5, 100);
  syncOpacityLabel(els.propOpacity.value);
  els.propFill.value = colorOrFallback(obj.fill, "#ffffff");
  els.propStroke.value = colorOrFallback(obj.stroke, "#1b1e24");
  els.propTextColor.value = colorOrFallback(obj.textColor, "#111111");
  els.propUseTextBox.checked = Boolean(obj.useTextBox);

  const isBubble = obj.kind === "bubble";
  els.propShapeWrap.classList.toggle("hidden", !isBubble);
  els.bubbleTailFields.classList.toggle("hidden", !isBubble);
  els.propTextBoxField.classList.toggle("hidden", isBubble);
  [
    els.propTailX,
    els.propTailY,
    els.propTailSize,
    els.tailLeftBtn,
    els.tailUpBtn,
    els.tailDownBtn,
    els.tailRightBtn,
  ].forEach((element) => {
    element.disabled = !isBubble;
  });
  state.syncingProps = false;
}

function applyPropertyChanges() {
  if (state.syncingProps) {
    return;
  }
  const obj = currentSelection();
  if (!obj) {
    return;
  }
  obj.text = els.propText.value;
  obj.x = safeNumber(els.propX.value, 0);
  obj.y = safeNumber(els.propY.value, 0);
  obj.w = safeNumber(els.propW.value, 24);
  obj.h = safeNumber(els.propH.value, 24);
  obj.fontSize = Math.max(8, safeNumber(els.propFontSize.value, 24));
  obj.padding = Math.max(0, safeNumber(els.propPadding.value, 0));
  obj.strokeWidth = Math.max(0, safeNumber(els.propStrokeWidth.value, 0));
  obj.align = els.propAlign.value === "left" ? "left" : "center";
  obj.textDirection = normalizeTextDirection(els.propDirection.value);
  obj.opacity = clamp(Math.round(safeNumber(els.propOpacity.value, 100)), 5, 100);
  syncOpacityLabel(obj.opacity);
  obj.fill = colorOrFallback(els.propFill.value, "#ffffff");
  obj.stroke = colorOrFallback(els.propStroke.value, "#1b1e24");
  obj.textColor = colorOrFallback(els.propTextColor.value, "#111111");

  if (obj.kind === "bubble") {
    obj.shape = normalizeShape(els.propShape.value);
    obj.tailX = safeNumber(els.propTailX.value, obj.x + obj.w / 2);
    obj.tailY = safeNumber(els.propTailY.value, obj.y + obj.h + 50);
    obj.tailSize = Math.max(4, safeNumber(els.propTailSize.value, 16));
  } else {
    obj.useTextBox = Boolean(els.propUseTextBox.checked);
  }
  clampObjectBounds(obj);
  draw();
  renderLayerList();
}

function commitPropertyChanges() {
  applyPropertyChanges();
  pushHistory();
}

function renderLayerList() {
  els.layerList.innerHTML = "";
  const reversed = [...state.objects].reverse();
  reversed.forEach((obj) => {
    const li = document.createElement("li");
    li.className = "layer-item" + (obj.id === state.selectedId ? " active" : "");
    const topIndex = state.objects.length - 1 - state.objects.indexOf(obj);
    li.innerHTML = `
      <button class="layer-name" type="button">${topIndex + 1}. ${obj.kind} #${obj.id}</button>
      <div class="layer-actions">
        <button type="button" data-dir="1">Up</button>
        <button type="button" data-dir="-1">Down</button>
      </div>
    `;
    li.querySelector(".layer-name").addEventListener("click", () => {
      state.selectedId = obj.id;
      syncPropertyPanel();
      renderLayerList();
      draw();
    });
    li.querySelectorAll("[data-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        moveLayer(obj.id, Number(btn.dataset.dir));
      });
    });
    els.layerList.appendChild(li);
  });
}

function pointerDown(event) {
  if (!state.image) {
    return;
  }
  event.preventDefault();
  const point = toImagePoint(event);
  const selected = currentSelection();
  if (selected) {
    const handle = handleHit(point, selected);
    if (handle) {
      state.pointerMode = handle;
      state.pointerId = event.pointerId;
      state.changedDuringPointer = false;
      els.canvas.setPointerCapture(event.pointerId);
      return;
    }
  }
  const target = hitTest(point);
  if (!target) {
    state.selectedId = null;
    syncPropertyPanel();
    renderLayerList();
    draw();
    return;
  }
  state.selectedId = target.id;
  state.pointerMode = "drag";
  state.pointerId = event.pointerId;
  state.dragOffsetX = point.x - target.x;
  state.dragOffsetY = point.y - target.y;
  state.changedDuringPointer = false;
  els.canvas.setPointerCapture(event.pointerId);
  syncPropertyPanel();
  renderLayerList();
  draw();
}

function pointerMove(event) {
  if (state.pointerMode == null || event.pointerId !== state.pointerId) {
    return;
  }
  event.preventDefault();
  const obj = currentSelection();
  if (!obj) {
    return;
  }
  const point = toImagePoint(event);
  if (state.pointerMode === "drag") {
    obj.x = point.x - state.dragOffsetX;
    obj.y = point.y - state.dragOffsetY;
  } else if (state.pointerMode === "resize") {
    obj.w = Math.max(24, point.x - obj.x);
    obj.h = Math.max(24, point.y - obj.y);
  } else if (state.pointerMode === "tail" && obj.kind === "bubble") {
    obj.tailX = point.x;
    obj.tailY = point.y;
  }
  clampObjectBounds(obj);
  state.changedDuringPointer = true;
  syncPropertyPanel();
  draw();
}

function pointerUp(event) {
  if (state.pointerMode == null || event.pointerId !== state.pointerId) {
    return;
  }
  try {
    els.canvas.releasePointerCapture(event.pointerId);
  } catch (_) {
    // ignore
  }
  const changed = state.changedDuringPointer;
  state.pointerMode = null;
  state.pointerId = null;
  state.changedDuringPointer = false;
  if (changed) {
    pushHistory();
    renderLayerList();
  }
}

function nudgeTail(dx, dy) {
  const obj = currentSelection();
  if (!obj || obj.kind !== "bubble") {
    return;
  }
  obj.tailX = clamp(obj.tailX + dx, 0, state.imageWidth);
  obj.tailY = clamp(obj.tailY + dy, 0, state.imageHeight);
  syncPropertyPanel();
  draw();
  pushHistory();
}

function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像形式が不正です。PNG/JPEG/WEBPを使ってください。"));
    img.src = dataUrl;
  });
}

async function setBackgroundFromDataUrl(dataUrl) {
  const img = await imageFromDataUrl(dataUrl);
  state.image = img;
  state.imageDataUrl = dataUrl;
  state.imageWidth = img.naturalWidth || img.width;
  state.imageHeight = img.naturalHeight || img.height;
  els.emptyState.classList.add("hidden");
  updateCanvasMetrics();
  draw();
}

async function loadImageFile(file) {
  if (!file) {
    return;
  }
  const type = file.type || "";
  const name = file.name.toLowerCase();
  if (type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif")) {
    throw new Error("HEIC/HEIFは未対応です。JPEG/PNG/WEBPを使ってください。");
  }
  if (!type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }
  const dataUrl = await dataUrlFromFile(file);
  await setBackgroundFromDataUrl(dataUrl);
  state.objects = [];
  state.selectedId = null;
  state.nextId = 1;
  state.history = [];
  state.historyIndex = -1;
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  status(`画像を読み込みました: ${state.imageWidth}x${state.imageHeight}`, "ok");
}

function bindEvents() {
  els.loadImageBtn.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", async () => {
    const file = els.imageInput.files && els.imageInput.files[0];
    if (!file) {
      return;
    }
    try {
      await loadImageFile(file);
    } catch (error) {
      status(String(error.message || error), "err");
    } finally {
      els.imageInput.value = "";
    }
  });

  els.addBubbleBtn.addEventListener("click", () => addObject("bubble"));
  els.addTextBtn.addEventListener("click", () => addObject("text"));
  els.deleteBtn.addEventListener("click", deleteSelected);
  els.duplicateBtn.addEventListener("click", duplicateSelected);
  els.undoBtn.addEventListener("click", undo);
  els.redoBtn.addEventListener("click", redo);
  els.fitBtn.addEventListener("click", fitToViewport);
  els.saveProjectBtn.addEventListener("click", saveProject);
  els.loadProjectBtn.addEventListener("click", () => els.projectInput.click());
  els.exportPngBtn.addEventListener("click", exportPng);

  els.projectInput.addEventListener("change", async () => {
    const file = els.projectInput.files && els.projectInput.files[0];
    if (!file) {
      return;
    }
    try {
      await loadProjectFile(file);
    } catch (error) {
      status(String(error.message || error), "err");
    } finally {
      els.projectInput.value = "";
    }
  });

  els.zoomRange.addEventListener("input", () => {
    const ratio = Number(els.zoomRange.value) || 100;
    state.zoom = ratio / 100;
    els.zoomLabel.textContent = `${ratio}%`;
    updateCanvasMetrics();
    draw();
  });

  [
    els.propShape,
    els.propText,
    els.propX,
    els.propY,
    els.propW,
    els.propH,
    els.propTailX,
    els.propTailY,
    els.propTailSize,
    els.propFontSize,
    els.propPadding,
    els.propStrokeWidth,
    els.propAlign,
    els.propDirection,
    els.propOpacity,
    els.propFill,
    els.propStroke,
    els.propTextColor,
    els.propUseTextBox,
  ].forEach((element) => {
    element.addEventListener("input", applyPropertyChanges);
    element.addEventListener("change", commitPropertyChanges);
  });

  els.tailLeftBtn.addEventListener("click", () => nudgeTail(-8, 0));
  els.tailUpBtn.addEventListener("click", () => nudgeTail(0, -8));
  els.tailDownBtn.addEventListener("click", () => nudgeTail(0, 8));
  els.tailRightBtn.addEventListener("click", () => nudgeTail(8, 0));

  els.canvas.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove, { passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  window.addEventListener("resize", () => {
    updateCanvasMetrics();
    draw();
  });
}

function requiredElementsPresent() {
  return Object.values(els).every((element) => element !== null);
}

function boot() {
  if (!requiredElementsPresent()) {
    console.error("manual_editor: required DOM elements are missing");
    return;
  }
  bindEvents();
  syncUndoRedoButtons();
  renderLayerList();
  syncPropertyPanel();
  status("画像を読み込んで編集を開始してください。");
}

boot();
