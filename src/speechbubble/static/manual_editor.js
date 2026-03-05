"use strict";

const APP_VERSION = String(window.__APP_VERSION__ || "3.0.0");

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
  templateSearchInput: document.getElementById("templateSearchInput"),
  templateCategorySelect: document.getElementById("templateCategorySelect"),
  variantRegenerateBtn: document.getElementById("variantRegenerateBtn"),
  applyTemplateBtn: document.getElementById("applyTemplateBtn"),
  templateGrid: document.getElementById("templateGrid"),
  layerList: document.getElementById("layerList"),
  noSelectionText: document.getElementById("noSelectionText"),
  propPanel: document.getElementById("propPanel"),
  propKind: document.getElementById("propKind"),
  propRenderMode: document.getElementById("propRenderMode"),
  propTemplateId: document.getElementById("propTemplateId"),
  propTailVisible: document.getElementById("propTailVisible"),
  propTailSnap: document.getElementById("propTailSnap"),
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
  toggleTailBtn: document.getElementById("toggleTailBtn"),
  propFontFamily: document.getElementById("propFontFamily"),
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
  templateManifest: null,
  templateBases: [],
  templateById: new Map(),
  templateCatalog: [],
  selectedTemplateCatalogId: null,
  templateRotationCursor: {},
  recentTemplateIds: [],
  autoTemplateCategoryIndex: 0,
  templateLoadFailed: false,
};

const MAX_HISTORY = 80;
const SHAPE_SET = new Set(["ellipse", "rounded", "cloud", "shout", "thought", "whisper"]);
const TEXT_DIRECTION_SET = new Set(["horizontal", "vertical"]);
const RENDER_MODE_SET = new Set(["procedural", "template"]);
const TEMPLATE_CATEGORIES = ["normal", "shout", "thought", "whisper", "narration"];
const AUTO_CATEGORY_SEQUENCE = ["normal", "normal", "thought", "whisper", "normal", "shout", "narration"];
const LINE_WIDTH_LEVELS = [3, 4, 5];
const ROUGHNESS_LEVELS = [0.72, 1.2];
const WOBBLE_LEVELS = [0.85, 1.35];
const RECENT_TEMPLATE_LIMIT = 5;
const FONT_FAMILY_KEYS = new Set([
  "auto",
  "jp-gothic",
  "jp-mincho",
  "classic-serif",
  "classic-sans",
  "rounded",
  "comic",
  "mono",
]);
const FONT_FAMILY_STACKS = {
  "jp-gothic": '"BIZ UDPGothic", "Noto Sans JP", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
  "jp-mincho": '"BIZ UDPMincho", "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif',
  "classic-serif": '"Georgia", "Times New Roman", "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif',
  "classic-sans": '"Arial", "Helvetica Neue", "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif',
  rounded: '"Hiragino Maru Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif',
  comic: '"Comic Sans MS", "Trebuchet MS", "Noto Sans JP", "Yu Gothic UI", sans-serif',
  mono: '"Cascadia Mono", "Consolas", "Noto Sans Mono CJK JP", "MS Gothic", monospace',
};

const templatePathCache = new Map();
const roughCanvasCache = new WeakMap();

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

function normalizeFontFamily(value) {
  return FONT_FAMILY_KEYS.has(value) ? value : "auto";
}

function resolveFontStack(fontFamily, textDirection) {
  const normalized = normalizeFontFamily(fontFamily);
  if (normalized === "auto") {
    return textDirection === "vertical" ? FONT_FAMILY_STACKS["jp-mincho"] : FONT_FAMILY_STACKS["jp-gothic"];
  }
  return FONT_FAMILY_STACKS[normalized] || FONT_FAMILY_STACKS["jp-gothic"];
}

function normalizeRenderMode(value) {
  return RENDER_MODE_SET.has(value) ? value : "procedural";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function normalizeTemplateVariant(raw, templateId) {
  const h = hashString(String(templateId || "template"));
  const roughness = safeNumber(raw && raw.roughness, ROUGHNESS_LEVELS[h % ROUGHNESS_LEVELS.length]);
  const wobble = safeNumber(raw && raw.wobble, WOBBLE_LEVELS[(h >> 1) % WOBBLE_LEVELS.length]);
  const seed = Math.max(1, Math.round(safeNumber(raw && raw.seed, (h % 90000) + 1000)));
  return {
    roughness: clamp(roughness, 0.4, 2.2),
    wobble: clamp(wobble, 0.4, 2.2),
    seed,
  };
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

function parseViewBox(viewBox) {
  const parts = String(viewBox || "")
    .trim()
    .split(/\s+/)
    .map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    return { x: 0, y: 0, w: 1000, h: 800 };
  }
  return { x: parts[0], y: parts[1], w: Math.max(1, parts[2]), h: Math.max(1, parts[3]) };
}

function validateTemplate(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (typeof raw.id !== "string" || typeof raw.bodyPath !== "string" || typeof raw.viewBox !== "string") {
    return null;
  }
  if (!TEMPLATE_CATEGORIES.includes(raw.category)) {
    return null;
  }
  const box = raw.textBox || {};
  const tailAnchors = Array.isArray(raw.tailAnchors) ? raw.tailAnchors : [];
  const style = raw.defaultStyle || {};
  return {
    id: raw.id,
    category: raw.category,
    source: raw.source || null,
    viewBox: raw.viewBox,
    bodyPath: raw.bodyPath,
    textBox: {
      x: safeNumber(box.x, 180),
      y: safeNumber(box.y, 180),
      w: Math.max(10, safeNumber(box.w, 640)),
      h: Math.max(10, safeNumber(box.h, 400)),
    },
    tailAnchors: tailAnchors
      .map((anchor, index) => ({
        id: typeof anchor.id === "string" ? anchor.id : `anchor-${index + 1}`,
        x: safeNumber(anchor.x, 500),
        y: safeNumber(anchor.y, 400),
        normal: {
          x: clamp(safeNumber(anchor.normal && anchor.normal.x, 0), -1.2, 1.2),
          y: clamp(safeNumber(anchor.normal && anchor.normal.y, 1), -1.2, 1.2),
        },
      }))
      .slice(0, 20),
    defaultStyle: {
      lineWidth: Math.max(1, safeNumber(style.lineWidth, 4)),
      fill: colorOrFallback(style.fill, "#ffffff"),
      stroke: colorOrFallback(style.stroke, "#1b1e24"),
    },
    svgPath: typeof raw.svgPath === "string" ? raw.svgPath : "",
  };
}

function makeVariantByIndex(templateId, variantIndex) {
  const h = hashString(`${templateId}:${variantIndex}`);
  return {
    lineWidth: LINE_WIDTH_LEVELS[variantIndex % LINE_WIDTH_LEVELS.length],
    roughness: ROUGHNESS_LEVELS[h % ROUGHNESS_LEVELS.length],
    wobble: WOBBLE_LEVELS[(h >> 1) % WOBBLE_LEVELS.length],
    seed: (h % 90000) + 1000,
  };
}

function randomVariant(templateId) {
  const variantIndex = randomInt(0, LINE_WIDTH_LEVELS.length - 1);
  const v = makeVariantByIndex(templateId, variantIndex);
  return {
    lineWidth: v.lineWidth,
    roughness: ROUGHNESS_LEVELS[randomInt(0, ROUGHNESS_LEVELS.length - 1)],
    wobble: WOBBLE_LEVELS[randomInt(0, WOBBLE_LEVELS.length - 1)],
    seed: randomInt(1000, 99999),
  };
}

function buildTemplateCatalog(baseTemplates) {
  const list = [];
  for (const template of baseTemplates) {
    for (let i = 0; i < LINE_WIDTH_LEVELS.length; i += 1) {
      list.push({
        catalogId: `${template.id}::${i + 1}`,
        templateId: template.id,
        category: template.category,
        variant: makeVariantByIndex(template.id, i),
      });
    }
  }
  return list;
}

function templateById(id) {
  return state.templateById.get(id) || null;
}

function selectedCatalogItem() {
  return state.templateCatalog.find((item) => item.catalogId === state.selectedTemplateCatalogId) || null;
}

function rememberTemplateUsage(templateId) {
  if (!templateId) {
    return;
  }
  state.recentTemplateIds.push(templateId);
  if (state.recentTemplateIds.length > RECENT_TEMPLATE_LIMIT) {
    state.recentTemplateIds.shift();
  }
}

function pickAutoTemplateCatalog() {
  if (!state.templateBases.length || !state.templateCatalog.length) {
    return null;
  }
  const category = AUTO_CATEGORY_SEQUENCE[state.autoTemplateCategoryIndex % AUTO_CATEGORY_SEQUENCE.length];
  state.autoTemplateCategoryIndex += 1;
  const categoryBases = state.templateBases.filter((tpl) => tpl.category === category);
  if (!categoryBases.length) {
    return state.templateCatalog[0] || null;
  }
  const cursor = Number(state.templateRotationCursor[category] || 0);
  let base = categoryBases[cursor % categoryBases.length];
  for (let i = 0; i < categoryBases.length; i += 1) {
    const candidate = categoryBases[(cursor + i) % categoryBases.length];
    if (!state.recentTemplateIds.includes(candidate.id)) {
      base = candidate;
      state.templateRotationCursor[category] = (cursor + i + 1) % categoryBases.length;
      break;
    }
    if (i === categoryBases.length - 1) {
      state.templateRotationCursor[category] = (cursor + 1) % categoryBases.length;
    }
  }
  const variants = state.templateCatalog.filter((item) => item.templateId === base.id);
  if (!variants.length) {
    return null;
  }
  const chosen = variants[randomInt(0, variants.length - 1)];
  return { ...chosen, variant: randomVariant(chosen.templateId) };
}

function updateSelectedTemplateCardFromSelection() {
  const obj = currentSelection();
  if (!obj || obj.kind !== "bubble" || obj.renderMode !== "template" || !obj.templateId) {
    return;
  }
  const exact = state.templateCatalog.find(
    (item) => item.templateId === obj.templateId && item.variant.lineWidth === Math.round(Number(obj.strokeWidth) || 0)
  );
  if (exact) {
    state.selectedTemplateCatalogId = exact.catalogId;
    return;
  }
  const match = state.templateCatalog.find((item) => item.templateId === obj.templateId);
  if (match) {
    state.selectedTemplateCatalogId = match.catalogId;
  }
}

function syncTemplateSelectionUi() {
  updateSelectedTemplateCardFromSelection();
  renderTemplateGrid();
}

function pickTemplateCatalogForBubble(obj) {
  if (!obj || obj.kind !== "bubble") {
    return selectedCatalogItem();
  }
  if (obj.templateId) {
    const existing = state.templateCatalog.find((item) => item.templateId === obj.templateId);
    if (existing) {
      return existing;
    }
  }
  const selected = selectedCatalogItem();
  if (selected) {
    return selected;
  }
  return pickAutoTemplateCatalog();
}

function pickTemplateCatalogById(templateId) {
  if (!templateId) {
    return null;
  }
  return state.templateCatalog.find((item) => item.templateId === templateId) || null;
}

function templateAnchorExists(template, anchorId) {
  if (!template || !anchorId) {
    return false;
  }
  return template.tailAnchors.some((anchor) => anchor.id === anchorId);
}

function renderTemplateGrid() {
  if (!els.templateGrid) {
    return;
  }
  const hasCatalog = Array.isArray(state.templateCatalog) && state.templateCatalog.length > 0;
  if (!hasCatalog) {
    els.templateGrid.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "template-meta";
    empty.textContent = state.templateLoadFailed
      ? "Template catalog unavailable. Procedural mode only."
      : "Loading template catalog...";
    els.templateGrid.appendChild(empty);
    return;
  }
  const query = String(els.templateSearchInput.value || "").trim().toLowerCase();
  const category = String(els.templateCategorySelect.value || "all");
  const filtered = state.templateCatalog.filter((item) => {
    if (category !== "all" && item.category !== category) {
      return false;
    }
    if (!query) {
      return true;
    }
    return item.templateId.toLowerCase().includes(query) || item.catalogId.toLowerCase().includes(query);
  });

  els.templateGrid.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "template-meta";
    empty.textContent = "No template matches current filter.";
    els.templateGrid.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((item) => {
    const tpl = templateById(item.templateId);
    if (!tpl) {
      return;
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card" + (item.catalogId === state.selectedTemplateCatalogId ? " active" : "");
    card.dataset.catalogId = item.catalogId;
    card.innerHTML = `
      <svg viewBox="${tpl.viewBox}" aria-hidden="true">
        <path d="${tpl.bodyPath}" fill="#fff" stroke="#1b1e24" stroke-width="${item.variant.lineWidth}" stroke-linejoin="round" stroke-linecap="round"></path>
      </svg>
      <strong>${tpl.id}</strong>
      <span class="template-meta">${tpl.category} / lw ${item.variant.lineWidth}</span>
    `;
    card.addEventListener("click", () => {
      state.selectedTemplateCatalogId = item.catalogId;
      renderTemplateGrid();
    });
    frag.appendChild(card);
  });
  els.templateGrid.appendChild(frag);
}

async function loadTemplateManifest() {
  const url = `/assets/bubbles/manifest.json?v=${encodeURIComponent(APP_VERSION)}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`manifest fetch failed (${response.status})`);
    }
    const payload = await response.json();
    const templates = Array.isArray(payload.templates) ? payload.templates : [];
    const normalized = templates.map(validateTemplate).filter(Boolean);
    if (!normalized.length) {
      throw new Error("manifest is empty");
    }
    state.templateManifest = payload;
    state.templateBases = normalized;
    state.templateById = new Map(normalized.map((tpl) => [tpl.id, tpl]));
    state.templateCatalog = buildTemplateCatalog(normalized);
    state.templateLoadFailed = false;
    if (!state.selectedTemplateCatalogId && state.templateCatalog.length) {
      state.selectedTemplateCatalogId = state.templateCatalog[0].catalogId;
    }
    state.objects.forEach((obj) => {
      maybeRecoverTemplateBubble(obj);
      clampObjectBounds(obj);
    });
    syncTemplateSelectionUi();
    syncPropertyPanel();
    draw();
    status(`Template catalog loaded: ${state.templateCatalog.length} variants.`, "ok");
  } catch (error) {
    state.templateManifest = null;
    state.templateBases = [];
    state.templateById = new Map();
    state.templateCatalog = [];
    state.templateLoadFailed = true;
    state.objects.forEach((obj) => {
      maybeRecoverTemplateBubble(obj);
      clampObjectBounds(obj);
    });
    syncPropertyPanel();
    draw();
    renderTemplateGrid();
    status(`Template catalog unavailable. Procedural mode only. ${String(error.message || error)}`, "warn");
  }
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
    fontFamily: normalizeFontFamily(raw.fontFamily),
    padding: Math.max(0, safeNumber(raw.padding, 10)),
    align: raw.align === "left" ? "left" : "center",
    opacity: clamp(Math.round(safeNumber(raw.opacity, 100)), 5, 100),
    textDirection: normalizeTextDirection(raw.textDirection),
  };

  if (base.kind === "bubble") {
    base.shape = normalizeShape(raw.shape);
    base.renderMode = normalizeRenderMode(raw.renderMode);
    base.templateId = typeof raw.templateId === "string" ? raw.templateId : null;
    base.templateVariant = base.templateId
      ? normalizeTemplateVariant(raw.templateVariant, base.templateId)
      : null;
    base.tailAnchorId = typeof raw.tailAnchorId === "string" ? raw.tailAnchorId : null;
    base.tailSnap = base.renderMode === "template" ? raw.tailSnap !== false : false;
    base.tailVisible = raw.tailVisible !== false;
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
  syncTemplateSelectionUi();
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

function hexToRgba(hex, alpha) {
  const normalized = colorOrFallback(hex, "#1b1e24").replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(safeNumber(alpha, 1), 0, 1)})`;
}

function mapTemplateCategoryToShape(category) {
  if (category === "narration") {
    return "rounded";
  }
  if (category === "shout") {
    return "shout";
  }
  if (category === "thought") {
    return "thought";
  }
  if (category === "whisper") {
    return "whisper";
  }
  return "ellipse";
}

function hasTemplateCatalog() {
  return Array.isArray(state.templateCatalog) && state.templateCatalog.length > 0;
}

function maybeRecoverTemplateBubble(obj) {
  if (!obj || obj.kind !== "bubble" || obj.renderMode !== "template") {
    return;
  }
  if (state.templateLoadFailed) {
    obj.renderMode = "procedural";
    obj.tailSnap = false;
    obj.tailAnchorId = null;
    return;
  }
  if (!state.templateBases.length) {
    return;
  }
  if (obj.templateId && templateById(obj.templateId)) {
    return;
  }
  const choice = pickTemplateCatalogForBubble(obj);
  if (choice && applyCatalogItemToBubble(obj, choice)) {
    state.selectedTemplateCatalogId = choice.catalogId;
    return;
  }
  obj.renderMode = "procedural";
  obj.tailSnap = false;
  obj.tailAnchorId = null;
}

function setBubbleRenderMode(obj, mode) {
  const nextMode = normalizeRenderMode(mode);
  if (nextMode === "template") {
    if (state.templateLoadFailed || !hasTemplateCatalog()) {
      obj.renderMode = "procedural";
      status("Template catalog unavailable. Using procedural mode.", "warn");
      return;
    }
    const chosen = pickTemplateCatalogForBubble(obj);
    if (!chosen || !applyCatalogItemToBubble(obj, chosen)) {
      obj.renderMode = "procedural";
      status("No template available. Using procedural mode.", "warn");
      return;
    }
    state.selectedTemplateCatalogId = chosen.catalogId;
    obj.renderMode = "template";
    obj.tailSnap = true;
    obj.tailAnchorId = null;
    return;
  }
  obj.renderMode = "procedural";
  obj.tailSnap = false;
  obj.tailAnchorId = null;
}

function markTailManualControl(obj) {
  if (!obj || obj.kind !== "bubble") {
    return;
  }
  obj.tailVisible = true;
  if (obj.renderMode === "template") {
    obj.tailSnap = false;
    obj.tailAnchorId = null;
  }
}

function setTailVisible(obj, visible) {
  if (!obj || obj.kind !== "bubble") {
    return;
  }
  obj.tailVisible = Boolean(visible);
  if (!obj.tailVisible) {
    obj.tailSnap = false;
    obj.tailAnchorId = null;
  }
}

function toggleSelectedTailVisibility() {
  const obj = currentSelection();
  if (!obj || obj.kind !== "bubble") {
    return;
  }
  setTailVisible(obj, !obj.tailVisible);
  clampObjectBounds(obj);
  syncPropertyPanel();
  renderTemplateGrid();
  draw();
  pushHistory();
}

function formatTemplateIdForPanel(obj) {
  if (!obj || obj.kind !== "bubble") {
    return "-";
  }
  if (obj.renderMode !== "template") {
    return "-";
  }
  return obj.templateId || "(select from panel)";
}

function shouldShowShapeSelector(obj) {
  return obj && obj.kind === "bubble" && obj.renderMode !== "template";
}

function pointInTemplateBubble(point, obj) {
  const template = obj && obj.templateId ? templateById(obj.templateId) : null;
  if (!template) {
    return (
      point.x >= obj.x &&
      point.x <= obj.x + obj.w &&
      point.y >= obj.y &&
      point.y <= obj.y + obj.h
    );
  }
  const vb = parseViewBox(template.viewBox);
  const localX = ((point.x - obj.x) / Math.max(1, obj.w)) * vb.w + vb.x;
  const localY = ((point.y - obj.y) / Math.max(1, obj.h)) * vb.h + vb.y;
  const path = getTemplatePath2D(template);
  if (!path) {
    return (
      point.x >= obj.x &&
      point.x <= obj.x + obj.w &&
      point.y >= obj.y &&
      point.y <= obj.y + obj.h
    );
  }
  const offscreen = document.createElement("canvas");
  offscreen.width = 1;
  offscreen.height = 1;
  const testCtx = offscreen.getContext("2d");
  if (!testCtx) {
    return (
      point.x >= obj.x &&
      point.x <= obj.x + obj.w &&
      point.y >= obj.y &&
      point.y <= obj.y + obj.h
    );
  }
  return testCtx.isPointInPath(path, localX, localY);
}

function makeBubble() {
  const w = Math.max(180, state.imageWidth * 0.28);
  const h = Math.max(110, state.imageHeight * 0.16);
  const x = clamp(state.imageWidth * 0.3, 0, state.imageWidth - w);
  const y = clamp(state.imageHeight * 0.2, 0, state.imageHeight - h);
  const autoTemplate = pickAutoTemplateCatalog();
  const template = autoTemplate ? templateById(autoTemplate.templateId) : null;
  if (template) {
    rememberTemplateUsage(template.id);
  }
  return {
    id: state.nextId++,
    kind: "bubble",
    renderMode: template ? "template" : "procedural",
    templateId: template ? template.id : null,
    templateVariant: template
      ? {
          roughness: autoTemplate.variant.roughness,
          wobble: autoTemplate.variant.wobble,
          seed: autoTemplate.variant.seed,
        }
      : null,
    tailAnchorId: null,
    tailSnap: Boolean(template),
    tailVisible: true,
    shape: template ? mapTemplateCategoryToShape(template.category) : "ellipse",
    text: "dialogue",
    x,
    y,
    w,
    h,
    tailX: x + w * 0.5,
    tailY: y + h + Math.min(110, state.imageHeight * 0.12),
    tailSize: Math.max(10, Math.round(Math.min(w, h) * 0.12)),
    fill: template ? template.defaultStyle.fill : "#ffffff",
    stroke: template ? template.defaultStyle.stroke : "#1b1e24",
    strokeWidth: template ? autoTemplate.variant.lineWidth : 4,
    textColor: "#111111",
    fontSize: Math.max(24, Math.round(Math.min(w, h) * 0.24)),
    fontFamily: "auto",
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
    text: "text",
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
    fontFamily: "auto",
    padding: 10,
    align: "left",
    opacity: 100,
    textDirection: "horizontal",
  };
}

function applyCatalogItemToBubble(obj, item) {
  const template = templateById(item.templateId);
  if (!template) {
    return false;
  }
  obj.renderMode = "template";
  obj.templateId = template.id;
  obj.templateVariant = {
    roughness: item.variant.roughness,
    wobble: item.variant.wobble,
    seed: item.variant.seed,
  };
  obj.tailAnchorId = null;
  obj.tailSnap = true;
  obj.tailVisible = true;
  obj.strokeWidth = item.variant.lineWidth;
  obj.fill = colorOrFallback(template.defaultStyle.fill, obj.fill);
  obj.stroke = colorOrFallback(template.defaultStyle.stroke, obj.stroke);
  obj.shape = mapTemplateCategoryToShape(template.category);
  rememberTemplateUsage(template.id);
  return true;
}

function applySelectedTemplateToCurrentBubble() {
  const item = selectedCatalogItem();
  if (!item) {
    status("Select a template card first.", "err");
    return;
  }
  let obj = currentSelection();
  if (!obj) {
    addObject("bubble");
    obj = currentSelection();
  }
  if (!obj || obj.kind !== "bubble") {
    status("Select a bubble object first.", "err");
    return;
  }
  if (applyCatalogItemToBubble(obj, item)) {
    state.selectedTemplateCatalogId = item.catalogId;
    clampObjectBounds(obj);
    syncPropertyPanel();
    syncTemplateSelectionUi();
    draw();
    pushHistory();
    status(`Template applied: ${item.templateId}`, "ok");
  } else {
    status("Template not found in manifest.", "err");
  }
}

function regenerateVariant() {
  const obj = currentSelection();
  const item = selectedCatalogItem();
  if (obj && obj.kind === "bubble" && obj.renderMode === "template" && obj.templateId) {
    const next = randomVariant(obj.templateId);
    obj.templateVariant = {
      roughness: next.roughness,
      wobble: next.wobble,
      seed: next.seed,
    };
    obj.strokeWidth = next.lineWidth;
    draw();
    syncPropertyPanel();
    syncTemplateSelectionUi();
    pushHistory();
    status("Variant regenerated for selected bubble.", "ok");
    return;
  }
  if (item) {
    item.variant = randomVariant(item.templateId);
    renderTemplateGrid();
    status("Variant regenerated for selected template card.", "ok");
    return;
  }
  status("Select a template card or template bubble.", "err");
}

function addObject(kind) {
  if (!state.image) {
    status("Load an image first.", "err");
    return;
  }
  const obj = kind === "bubble" ? makeBubble() : makeText();
  state.objects.push(obj);
  state.selectedId = obj.id;
  syncTemplateSelectionUi();
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status(kind === "bubble" ? "Bubble added." : "Text object added.", "ok");
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
  renderTemplateGrid();
  draw();
  status("Selection deleted.", "ok");
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
  syncTemplateSelectionUi();
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status("Duplicated.", "ok");
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
    status("Load an image before saving.", "err");
    return;
  }
  const payload = {
    version: 3,
    appVersion: APP_VERSION,
    imageDataUrl: state.imageDataUrl,
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
    nextId: state.nextId,
    objects: state.objects,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, "speechbubble-project.json");
  status("Project saved.", "ok");
}

async function loadProjectFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid project json.");
  }
  if (!payload.imageDataUrl || !Array.isArray(payload.objects)) {
    throw new Error("Missing fields: imageDataUrl / objects");
  }
  await setBackgroundFromDataUrl(payload.imageDataUrl);
  state.objects = payload.objects.map((obj) => normalizeObject(obj));
  const maxId = state.objects.reduce((max, obj) => Math.max(max, Number(obj.id) || 0), 0);
  state.nextId = Math.max(Number(payload.nextId) || 1, maxId + 1);
  state.selectedId = state.objects.length ? state.objects[state.objects.length - 1].id : null;
  state.history = [];
  state.historyIndex = -1;
  normalizeAndClampAllObjects();
  syncTemplateSelectionUi();
  pushHistory();
  syncPropertyPanel();
  renderLayerList();
  draw();
  status(`Project loaded (v${payload.version || 1}).`, "ok");
}

function exportPng() {
  if (!state.image) {
    status("Load an image first.", "err");
    return;
  }
  const off = document.createElement("canvas");
  off.width = state.imageWidth;
  off.height = state.imageHeight;
  const ctx = off.getContext("2d");
  if (!ctx) {
    status("Cannot initialize canvas context.", "err");
    return;
  }
  renderScene(ctx, 1, false);
  off.toBlob((blob) => {
    if (!blob) {
      status("PNG export failed.", "err");
      return;
    }
    downloadBlob(blob, "speechbubble-export.png");
    status("PNG exported.", "ok");
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

function getTemplatePath2D(template) {
  const key = template.id;
  let path = templatePathCache.get(key);
  if (!path) {
    try {
      path = new Path2D(template.bodyPath);
      templatePathCache.set(key, path);
    } catch (_) {
      return null;
    }
  }
  return path;
}

function getTemplateAnchorPoints(obj, template) {
  const vb = parseViewBox(template.viewBox);
  const sx = obj.w / vb.w;
  const sy = obj.h / vb.h;
  return template.tailAnchors.map((anchor) => ({
    id: anchor.id,
    x: obj.x + (anchor.x - vb.x) * sx,
    y: obj.y + (anchor.y - vb.y) * sy,
    normal: {
      x: safeNumber(anchor.normal && anchor.normal.x, 0),
      y: safeNumber(anchor.normal && anchor.normal.y, 1),
    },
  }));
}

function chooseTemplateAnchor(obj, template) {
  const anchors = getTemplateAnchorPoints(obj, template);
  if (!anchors.length) {
    return null;
  }
  if (obj.tailSnap && obj.tailAnchorId) {
    const exact = anchors.find((a) => a.id === obj.tailAnchorId);
    if (exact) {
      return exact;
    }
  }
  let best = anchors[0];
  let bestDist = Infinity;
  for (const anchor of anchors) {
    const dx = obj.tailX - anchor.x;
    const dy = obj.tailY - anchor.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      best = anchor;
      bestDist = dist;
    }
  }
  return best;
}

function getRoughCanvas(canvas) {
  if (!window.rough || typeof window.rough.canvas !== "function" || !canvas) {
    return null;
  }
  let rc = roughCanvasCache.get(canvas);
  if (!rc) {
    rc = window.rough.canvas(canvas);
    roughCanvasCache.set(canvas, rc);
  }
  return rc;
}

function drawTemplateRoughOverlay(ctx, obj, template) {
  const rc = getRoughCanvas(ctx.canvas);
  if (!rc) {
    return;
  }
  const variant = normalizeTemplateVariant(obj.templateVariant, obj.templateId || template.id);
  const alpha = clamp(safeNumber(obj.opacity, 100), 5, 100) / 100;
  const options = {
    stroke: hexToRgba(colorOrFallback(obj.stroke, "#1b1e24"), alpha),
    strokeWidth: Math.max(1, Number(obj.strokeWidth) || 3),
    roughness: variant.roughness,
    bowing: variant.wobble,
    seed: variant.seed,
    fill: "transparent",
  };
  const x = obj.x;
  const y = obj.y;
  const w = obj.w;
  const h = obj.h;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([]);
  if (template.category === "narration") {
    rc.rectangle(x, y, w, h, options);
  } else if (template.category === "shout") {
    rc.ellipse(x + w / 2, y + h / 2, w * 1.03, h * 1.03, options);
  } else {
    rc.ellipse(x + w / 2, y + h / 2, w, h, options);
  }
  ctx.restore();
}

function drawTemplateBubble(ctx, obj, template) {
  const fill = colorOrFallback(obj.fill, template.defaultStyle.fill);
  const stroke = colorOrFallback(obj.stroke, template.defaultStyle.stroke);
  const strokeWidth = Math.max(0, Number(obj.strokeWidth) || template.defaultStyle.lineWidth);
  const path = getTemplatePath2D(template);
  const vb = parseViewBox(template.viewBox);
  const sx = obj.w / vb.w;
  const sy = obj.h / vb.h;
  const tx = obj.x - vb.x * sx;
  const ty = obj.y - vb.y * sy;
  const anchor = obj.tailVisible && obj.tailSnap ? chooseTemplateAnchor(obj, template) : null;
  const base = anchor || bubbleTailBase(obj);
  if (anchor) {
    obj.tailAnchorId = anchor.id;
  }

  ctx.save();
  ctx.globalAlpha = clamp(safeNumber(obj.opacity, 100), 5, 100) / 100;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(template.category === "whisper" ? [12, 10] : []);

  if (obj.tailVisible) {
    if (template.category === "thought") {
      drawThoughtTail(ctx, obj, base);
    } else if (template.category === "whisper") {
      drawTailTriangle(ctx, obj, base, 0.62);
    } else if (template.category === "shout") {
      drawTailTriangle(ctx, obj, base, 1.12);
    } else {
      drawTailTriangle(ctx, obj, base, 1);
    }
  }

  if (path) {
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(sx, sy);
    ctx.fill(path);
    if (strokeWidth > 0) {
      ctx.stroke(path);
    }
    ctx.restore();
  } else {
    roundedRectPath(ctx, obj.x, obj.y, obj.w, obj.h, Math.min(22, Math.min(obj.w, obj.h) * 0.2));
    ctx.fill();
    if (strokeWidth > 0) {
      ctx.stroke();
    }
  }
  drawTemplateRoughOverlay(ctx, obj, template);
  ctx.restore();
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
  ctx.font = `${fontSize}px ${resolveFontStack(obj.fontFamily, "horizontal")}`;
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

  ctx.font = `${fontSize}px ${resolveFontStack(obj.fontFamily, "vertical")}`;
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
  let drawTarget = obj;
  if (obj.kind === "bubble" && obj.renderMode === "template" && obj.templateId) {
    const template = templateById(obj.templateId);
    if (template) {
      const vb = parseViewBox(template.viewBox);
      const box = template.textBox;
      drawTarget = {
        ...obj,
        x: obj.x + ((box.x - vb.x) / vb.w) * obj.w,
        y: obj.y + ((box.y - vb.y) / vb.h) * obj.h,
        w: (box.w / vb.w) * obj.w,
        h: (box.h / vb.h) * obj.h,
      };
    }
  }
  ctx.save();
  ctx.globalAlpha = clamp(safeNumber(drawTarget.opacity, 100), 5, 100) / 100;
  if (drawTarget.textDirection === "vertical") {
    drawVerticalText(ctx, drawTarget, centered);
  } else {
    drawHorizontalText(ctx, drawTarget, centered);
  }
  ctx.restore();
}

function drawProceduralBubble(ctx, obj) {
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

  if (obj.tailVisible) {
    if (obj.shape === "thought") {
      drawThoughtTail(ctx, obj, base);
    } else if (obj.shape === "whisper") {
      drawTailTriangle(ctx, obj, base, 0.62);
    } else if (obj.shape === "shout") {
      drawTailTriangle(ctx, obj, base, 1.15);
    } else {
      drawTailTriangle(ctx, obj, base, 1);
    }
  }

  drawBubbleBodyPath(ctx, obj);
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.stroke();
  }
  ctx.restore();
}

function drawBubble(ctx, obj) {
  if (obj.renderMode === "template" && obj.templateId) {
    const template = templateById(obj.templateId);
    if (template) {
      drawTemplateBubble(ctx, obj, template);
      drawTextInObject(ctx, obj, true);
      return;
    }
  }
  drawProceduralBubble(ctx, obj);
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

  if (obj.kind === "bubble" && obj.tailVisible) {
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
    if (obj.renderMode === "template") {
      return pointInTemplateBubble(point, obj);
    }
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
  if (obj.kind === "bubble" && obj.tailVisible && Math.hypot(point.x - obj.tailX, point.y - obj.tailY) <= tailRadius) {
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
  obj.fontFamily = normalizeFontFamily(obj.fontFamily);
  if (obj.kind === "bubble") {
    obj.shape = normalizeShape(obj.shape);
    obj.renderMode = normalizeRenderMode(obj.renderMode);
    obj.templateId = typeof obj.templateId === "string" ? obj.templateId : null;
    obj.tailVisible = obj.tailVisible !== false;
    obj.tailSnap = obj.tailSnap === true;
    obj.tailAnchorId = typeof obj.tailAnchorId === "string" ? obj.tailAnchorId : null;
    if (obj.templateId) {
      obj.templateVariant = normalizeTemplateVariant(obj.templateVariant, obj.templateId);
    } else {
      obj.templateVariant = null;
      obj.tailAnchorId = null;
    }
    maybeRecoverTemplateBubble(obj);
    if (obj.renderMode === "template" && obj.templateId) {
      const template = templateById(obj.templateId);
      if (template && obj.tailAnchorId && !templateAnchorExists(template, obj.tailAnchorId)) {
        obj.tailAnchorId = null;
      }
    } else {
      obj.tailSnap = false;
      obj.tailAnchorId = null;
    }
    if (!obj.tailVisible) {
      obj.tailSnap = false;
      obj.tailAnchorId = null;
    }
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

  const isBubble = obj.kind === "bubble";
  const isTemplateBubble = isBubble && obj.renderMode === "template";
  const isTailVisible = isBubble && obj.tailVisible !== false;

  els.propKind.value = obj.kind;
  els.propRenderMode.value = isBubble ? normalizeRenderMode(obj.renderMode) : "procedural";
  els.propTemplateId.value = formatTemplateIdForPanel(obj);
  els.propShape.value = normalizeShape(obj.shape || "ellipse");
  els.propText.value = obj.text || "";
  els.propX.value = Math.round(obj.x);
  els.propY.value = Math.round(obj.y);
  els.propW.value = Math.round(obj.w);
  els.propH.value = Math.round(obj.h);
  els.propTailX.value = Math.round(obj.tailX || obj.x + obj.w / 2);
  els.propTailY.value = Math.round(obj.tailY || obj.y + obj.h + 60);
  els.propTailSize.value = Math.round(obj.tailSize || 16);
  els.propFontFamily.value = normalizeFontFamily(obj.fontFamily);
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
  els.propTailVisible.checked = isTailVisible;
  els.propTailSnap.checked = isTemplateBubble ? obj.tailSnap === true : false;
  if (els.toggleTailBtn) {
    els.toggleTailBtn.textContent = isTailVisible ? "Hide Tail" : "Show Tail";
  }

  els.propRenderMode.disabled = !isBubble || state.templateLoadFailed;
  els.propTailVisible.disabled = !isBubble;
  els.propTailSnap.disabled = !isTemplateBubble || !isTailVisible;
  els.propShapeWrap.classList.toggle("hidden", !shouldShowShapeSelector(obj));
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
    els.toggleTailBtn,
  ].forEach((element) => {
    element.disabled = !isBubble || !isTailVisible;
  });
  state.syncingProps = false;
}

function applyPropertyChanges(event) {
  if (state.syncingProps) {
    return;
  }
  const obj = currentSelection();
  if (!obj) {
    return;
  }
  const targetId = event && event.target ? event.target.id : "";
  obj.text = els.propText.value;
  obj.x = safeNumber(els.propX.value, 0);
  obj.y = safeNumber(els.propY.value, 0);
  obj.w = safeNumber(els.propW.value, 24);
  obj.h = safeNumber(els.propH.value, 24);
  obj.fontSize = Math.max(8, safeNumber(els.propFontSize.value, 24));
  obj.fontFamily = normalizeFontFamily(els.propFontFamily.value);
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
    if (targetId === "propRenderMode") {
      setBubbleRenderMode(obj, els.propRenderMode.value);
    }
    obj.renderMode = normalizeRenderMode(obj.renderMode);
    if (obj.renderMode !== "template") {
      obj.shape = normalizeShape(els.propShape.value);
      obj.tailSnap = false;
      obj.tailAnchorId = null;
    } else if (obj.templateId) {
      obj.templateVariant = normalizeTemplateVariant(obj.templateVariant, obj.templateId);
      obj.tailSnap = Boolean(els.propTailSnap.checked) && Boolean(els.propTailVisible.checked);
      if (!obj.tailSnap) {
        obj.tailAnchorId = null;
      }
      const matchedItem = pickTemplateCatalogById(obj.templateId);
      if (matchedItem) {
        state.selectedTemplateCatalogId = matchedItem.catalogId;
      }
      const template = templateById(obj.templateId);
      if (template) {
        obj.shape = mapTemplateCategoryToShape(template.category);
      }
    }
    obj.tailVisible = Boolean(els.propTailVisible.checked);
    obj.tailX = safeNumber(els.propTailX.value, obj.x + obj.w / 2);
    obj.tailY = safeNumber(els.propTailY.value, obj.y + obj.h + 50);
    obj.tailSize = Math.max(4, safeNumber(els.propTailSize.value, 16));
    if (targetId === "propTailX" || targetId === "propTailY" || targetId === "propTailSize") {
      markTailManualControl(obj);
      els.propTailSnap.checked = false;
      els.propTailVisible.checked = true;
    }
    if (targetId === "propTailSnap") {
      obj.tailSnap =
        Boolean(els.propTailSnap.checked) &&
        Boolean(els.propTailVisible.checked) &&
        obj.renderMode === "template";
      if (!obj.tailSnap) {
        obj.tailAnchorId = null;
      }
    }
    if (targetId === "propTailVisible" && !obj.tailVisible) {
      obj.tailSnap = false;
      obj.tailAnchorId = null;
    }
  } else {
    obj.useTextBox = Boolean(els.propUseTextBox.checked);
  }

  clampObjectBounds(obj);
  if (obj.kind === "bubble") {
    els.propTemplateId.value = formatTemplateIdForPanel(obj);
    els.propRenderMode.value = normalizeRenderMode(obj.renderMode);
  }
  if (targetId === "propRenderMode" || targetId === "propTailSnap" || targetId === "propTailVisible") {
    syncPropertyPanel();
  }
  if (obj.kind === "bubble") {
    syncTemplateSelectionUi();
  }
  draw();
  renderLayerList();
}

function commitPropertyChanges(event) {
  applyPropertyChanges(event);
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
      syncTemplateSelectionUi();
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
    renderTemplateGrid();
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
  syncTemplateSelectionUi();
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
  } else if (state.pointerMode === "tail" && obj.kind === "bubble" && obj.tailVisible) {
    obj.tailX = point.x;
    obj.tailY = point.y;
    markTailManualControl(obj);
  }
  clampObjectBounds(obj);
  state.changedDuringPointer = true;
  syncPropertyPanel();
  if (obj.kind === "bubble") {
    renderTemplateGrid();
  }
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
    renderTemplateGrid();
  }
}

function nudgeTail(dx, dy) {
  const obj = currentSelection();
  if (!obj || obj.kind !== "bubble" || !obj.tailVisible) {
    return;
  }
  markTailManualControl(obj);
  obj.tailX = clamp(obj.tailX + dx, 0, state.imageWidth);
  obj.tailY = clamp(obj.tailY + dy, 0, state.imageHeight);
  syncPropertyPanel();
  renderTemplateGrid();
  draw();
  pushHistory();
}

function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Invalid image format. Use PNG/JPEG/WEBP."));
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
    throw new Error("HEIC/HEIF is not supported. Use JPEG/PNG/WEBP.");
  }
  if (!type.startsWith("image/")) {
    throw new Error("Please select an image file.");
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
  status(`Image loaded: ${state.imageWidth}x${state.imageHeight}`, "ok");
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
  els.templateSearchInput.addEventListener("input", renderTemplateGrid);
  els.templateCategorySelect.addEventListener("change", renderTemplateGrid);
  els.applyTemplateBtn.addEventListener("click", applySelectedTemplateToCurrentBubble);
  els.variantRegenerateBtn.addEventListener("click", regenerateVariant);

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
    els.propRenderMode,
    els.propShape,
    els.propText,
    els.propX,
    els.propY,
    els.propW,
    els.propH,
    els.propTailX,
    els.propTailY,
    els.propTailSize,
    els.propFontFamily,
    els.propFontSize,
    els.propPadding,
    els.propStrokeWidth,
    els.propAlign,
    els.propDirection,
    els.propOpacity,
    els.propFill,
    els.propStroke,
    els.propTextColor,
    els.propTailVisible,
    els.propTailSnap,
    els.propUseTextBox,
  ].forEach((element) => {
    element.addEventListener("input", applyPropertyChanges);
    element.addEventListener("change", commitPropertyChanges);
  });

  els.tailLeftBtn.addEventListener("click", () => nudgeTail(-8, 0));
  els.tailUpBtn.addEventListener("click", () => nudgeTail(0, -8));
  els.tailDownBtn.addEventListener("click", () => nudgeTail(0, 8));
  els.tailRightBtn.addEventListener("click", () => nudgeTail(8, 0));
  els.toggleTailBtn.addEventListener("click", toggleSelectedTailVisibility);

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
  renderTemplateGrid();
  syncPropertyPanel();
  loadTemplateManifest();
  status("Load an image to start editing.", "ok");
}

boot();
