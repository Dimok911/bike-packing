import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { normalizeContainerDimensions } from "../state/container-fields.js";
import { BIKE_GEOMETRY_M, bikeGeometryFrame } from "./bike-geometry.js";

const PACKING_VIEW_BIKE3D = "bike3d";
const PACKING_VIEW_COLUMNS = "columns";

const BIKE3D_COLOR_PALETTE = [
  "#2b7a67",
  "#3d6f9f",
  "#8a7a36",
  "#9a6b46",
  "#8b5f8f",
  "#4f7d8a",
  "#d34d3f",
  "#d9a441"
];

const BIKE3D_SLOT_ORDER = [
  "rear-left",
  "rear-right",
  "front-left",
  "front-right",
  "frame",
  "handlebar",
  "seat",
  "fork"
];

const BIKE3D_SLOT_CONFIG = {
  "rear-left": { x: -210, y: 34, z: -42, w: 86, h: 92, d: 34 },
  "rear-right": { x: -210, y: 34, z: 42, w: 86, h: 92, d: 34 },
  "front-left": { x: 204, y: 42, z: -36, w: 68, h: 76, d: 30 },
  "front-right": { x: 204, y: 42, z: 36, w: 68, h: 76, d: 30 },
  frame: { x: -12, y: 18, z: 0, w: 112, h: 48, d: 38 },
  handlebar: { x: 225, y: -82, z: 0, w: 86, h: 40, d: 76 },
  seat: { x: -136, y: -64, z: 0, w: 60, h: 42, d: 44 },
  fork: { x: 168, y: -8, z: 0, w: 52, h: 82, d: 30 }
};

const BIKE3D_BAG_DIMENSION_SCENE_SCALE = 0.022;
const BIKE3D_DEFAULT_VIEW_DIRECTION = Object.freeze({ x: 1.32, y: 0.66, z: 0.78 });
const BIKE3D_DEFAULT_FIT_PADDING = 1.34;

export function defaultBike3dViewState() {
  return { zoom: 1, panX: 0, panY: 0, rotateX: 62, rotateZ: -18 };
}

export function normalizeBike3dViewState(value) {
  const source = value && typeof value === "object" ? value : {};
  const defaults = defaultBike3dViewState();
  const clamp = (field, min, max) => {
    const number = Number(source[field]);
    if (!Number.isFinite(number)) return defaults[field];
    return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
  };
  const normalized = {
    zoom: clamp("zoom", 0.55, 2.4),
    panX: clamp("panX", -2400, 2400),
    panY: clamp("panY", -2400, 2400),
    rotateX: clamp("rotateX", 48, 76),
    rotateZ: clamp("rotateZ", -60, 36)
  };
  const vector = (field) => {
    const value = source[field];
    if (!value || typeof value !== "object") return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  };
  const position = vector("position");
  const target = vector("target");
  if (position) normalized.position = position;
  if (target) normalized.target = target;
  return normalized;
}

export function normalizePackingViewMode(value) {
  return value === PACKING_VIEW_BIKE3D ? PACKING_VIEW_BIKE3D : PACKING_VIEW_COLUMNS;
}

export function isBike3dPackingView(value) {
  return normalizePackingViewMode(value) === PACKING_VIEW_BIKE3D;
}

export function getBike3dPackingScrollHost(root) {
  return root?.querySelector("[data-bike3d-shell]") || null;
}

export function captureBike3dDetailViewport(root, { documentRef = globalThis.document } = {}) {
  const detail = root?.querySelector(".bike3d-detail:not([hidden])");
  if (!detail) return null;
  const activeElement = detail.contains(documentRef.activeElement) ? documentRef.activeElement : null;
  return {
    scrollTop: detail.scrollTop || 0,
    anchor: bike3dDetailAnchor(detail),
    focus: bike3dFocusSelector(activeElement)
  };
}

export function restoreBike3dDetailViewport(root, snapshot) {
  if (!snapshot) return;
  const restore = () => {
    const detail = root?.querySelector(".bike3d-detail:not([hidden])");
    if (!detail) return;
    detail.scrollTop = snapshot.scrollTop || 0;
    const anchor = snapshot.anchor;
    const anchorElement = anchor ? detail.querySelector(anchor.selector) : null;
    if (anchorElement) {
      const detailRect = detail.getBoundingClientRect();
      const anchorRect = anchorElement.getBoundingClientRect();
      detail.scrollTop += anchorRect.top - detailRect.top - anchor.top;
    }
    const focusTarget = snapshot.focus ? detail.querySelector(snapshot.focus) : null;
    focusTarget?.focus?.({ preventScroll: true });
  };
  restore();
  const raf = globalThis.requestAnimationFrame || ((callback) => callback());
  const timeout = globalThis.setTimeout || (() => {});
  raf(restore);
  timeout(restore, 120);
}

function bike3dDetailAnchor(detail) {
  const detailRect = detail.getBoundingClientRect();
  const stickyBottom = detail.querySelector(".bike3d-detail-actions")?.getBoundingClientRect().bottom || detailRect.top;
  const top = Math.max(stickyBottom, detailRect.top) + 1;
  const candidates = [...detail.querySelectorAll("[data-item-id], [data-subcontainer-id], [data-root-container-id]")]
    .filter((element) => element.offsetParent !== null)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > top && rect.top < detailRect.bottom)
    .sort((a, b) => Math.max(a.rect.top, top) - Math.max(b.rect.top, top));
  const candidate = candidates[0];
  const selector = candidate ? bike3dAnchorSelector(candidate.element) : "";
  return selector ? { selector, top: candidate.rect.top - detailRect.top } : null;
}

function bike3dAnchorSelector(element) {
  if (element.dataset.itemId) return `[data-item-id="${escapeSelectorValue(element.dataset.itemId)}"]`;
  if (element.dataset.subcontainerId) return `[data-subcontainer-id="${escapeSelectorValue(element.dataset.subcontainerId)}"]`;
  if (element.dataset.rootContainerId) return `[data-root-container-id="${escapeSelectorValue(element.dataset.rootContainerId)}"]`;
  return "";
}

function bike3dFocusSelector(element) {
  const target = element?.closest?.([
    "[data-toggle-container]",
    "[data-toggle-column]",
    "[data-edit-container]",
    "[data-add-to-container]",
    "[data-remove-from-layout]",
    "[data-replace-layout-item]",
    "[data-edit-item]",
    "[data-bike3d-settings]",
    "[data-bike3d-close]",
    "[data-bike3d-adjust]",
    "[data-bike3d-color]"
  ].join(","));
  if (!target) return "";
  for (const name of [
    "toggleContainer",
    "toggleColumn",
    "editContainer",
    "addToContainer",
    "removeFromLayout",
    "replaceLayoutItem",
    "editItem",
    "bike3dSettings",
    "bike3dAdjust",
    "bike3dColor"
  ]) {
    if (target.dataset[name]) return `[data-${dataAttributeName(name)}="${escapeSelectorValue(target.dataset[name])}"]`;
  }
  if (target.dataset.bike3dClose !== undefined) return "[data-bike3d-close]";
  return "";
}

function dataAttributeName(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escapeSelectorValue(value) {
  return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}

export function defaultBike3dTransform() {
  return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rx: 0, ry: 0, rz: 0, color: "" };
}

export function normalizeBike3dTransforms(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([id]) => String(id || "").trim())
      .map(([id, transform]) => [id, normalizeBike3dTransform(transform)])
  );
}

export function normalizeBike3dTransform(transform = {}) {
  const defaults = defaultBike3dTransform();
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
  };
  return {
    x: clamp(transform.x, -6, 6, defaults.x),
    y: clamp(transform.y, -3, 3.5, defaults.y),
    z: clamp(transform.z, -5, 5, defaults.z),
    sx: clamp(transform.sx, 0.15, 6, defaults.sx),
    sy: clamp(transform.sy, 0.15, 6, defaults.sy),
    sz: clamp(transform.sz, 0.15, 6, defaults.sz),
    rx: clamp(transform.rx, -180, 180, defaults.rx),
    ry: clamp(transform.ry, -180, 180, defaults.ry),
    rz: clamp(transform.rz, -180, 180, defaults.rz),
    color: /^#[0-9a-f]{6}$/i.test(String(transform.color || "")) ? String(transform.color) : ""
  };
}

export function bike3dColorPalette() {
  return [...BIKE3D_COLOR_PALETTE];
}

export function renderBike3dPackingView({
  target,
  beforeHtml = "",
  rootIds = [],
  containers = {},
  selectedContainerId = "",
  adjustingContainerId = "",
  transforms = {},
  viewState = defaultBike3dViewState(),
  renderContainer,
  containerWeight,
  formatWeight,
  escapeHtml,
  onSelect,
  onClose,
  onToggleAdjust,
  onAdjust,
  onColor,
  onViewStateChange,
  onResetView
} = {}) {
  if (!target) return;
  const validRootIds = rootIds.filter((id) => containers[id]);
  const selectedId = validRootIds.includes(selectedContainerId) ? selectedContainerId : "";
  const selected = selectedId ? containers[selectedId] : null;
  const bagSlots = bike3dBagSlots(validRootIds, { containers, transforms });
  const normalizedViewState = normalizeBike3dViewState(viewState);
  target.innerHTML = `
    ${beforeHtml}
    <section class="bike3d-shell ${selected ? "bike3d-has-selection" : ""}" data-bike3d-shell>
      <div class="bike3d-stage">
        <div class="bike3d-toolbar">
          <span>3D-укладка</span>
          <span data-bike3d-load-summary></span>
        </div>
        <div class="bike3d-viewport" data-bike3d-viewport>
          <div class="bike3d-webgl-host" data-bike3d-webgl></div>
          ${renderBikeModel(bagSlots, { selectedId, escapeHtml, viewState: normalizedViewState })}
          ${selected && adjustingContainerId === selected.id
            ? renderBike3dAdjustControls(selected.id, transforms[selected.id], escapeHtml)
            : ""}
          <button class="bike3d-view-reset" type="button" data-bike3d-reset-view title="Вид по умолчанию" aria-label="Вид по умолчанию">↺</button>
        </div>
      </div>
      <aside class="bike3d-detail" ${selected ? "" : "hidden"}>
        ${selected ? renderBike3dDetailPanel(selected.id, { renderContainer, escapeHtml }) : ""}
      </aside>
    </section>
  `;
  bindBike3dViewEvents(target, {
    onSelect,
    onClose,
    onToggleAdjust,
    onAdjust,
    onColor,
    onViewStateChange,
    onResetView
  });
  bindBike3dDetailScrollChain(target);
  createBike3dScene(target.querySelector("[data-bike3d-webgl]"), bagSlots, {
    selectedId,
    adjustingContainerId,
    transforms,
    viewState: normalizedViewState,
    onSelect,
    onViewStateChange
  });
  renderBike3dLoadSummary(target, bagSlots, { containerWeight, formatWeight });
}

function bindBike3dDetailScrollChain(target) {
  const detail = target.querySelector(".bike3d-detail:not([hidden])");
  if (!detail) return;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let verticalGesture = false;
  detail.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    lastY = touch.clientY;
    verticalGesture = false;
  }, { passive: true });
  detail.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const totalDx = touch.clientX - startX;
    const totalDy = touch.clientY - startY;
    if (!verticalGesture) {
      if (Math.abs(totalDy) < 6 || Math.abs(totalDy) <= Math.abs(totalDx)) {
        lastY = touch.clientY;
        return;
      }
      verticalGesture = true;
    }
    const dy = touch.clientY - lastY;
    lastY = touch.clientY;
    if (!dy) return;
    const pageDelta = -dy;
    if (!shouldChainBike3dDetailScroll(detail, pageDelta) || !canScrollPageBy(pageDelta)) return;
    if (event.cancelable) event.preventDefault();
    window.scrollBy({ top: pageDelta, left: 0, behavior: "auto" });
  }, { passive: false });
}

function shouldChainBike3dDetailScroll(detail, deltaY) {
  const maxScrollTop = Math.max(0, detail.scrollHeight - detail.clientHeight);
  if (maxScrollTop <= 1) return true;
  if (deltaY > 0) return detail.scrollTop >= maxScrollTop - 1;
  if (deltaY < 0) return detail.scrollTop <= 1;
  return false;
}

function canScrollPageBy(deltaY) {
  const scroller = document.scrollingElement || document.documentElement;
  if (!scroller) return false;
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (deltaY > 0) return scroller.scrollTop < maxScrollTop - 1;
  if (deltaY < 0) return scroller.scrollTop > 1;
  return false;
}

function renderBikeModel(bagSlots, { selectedId, escapeHtml, viewState }) {
  const style = [
    `--bike-zoom: ${viewState.zoom}`,
    `--bike-pan-x: ${viewState.panX}px`,
    `--bike-pan-y: ${viewState.panY}px`,
    `--bike-rotate-x: ${viewState.rotateX}deg`,
    `--bike-rotate-z: ${viewState.rotateZ}deg`
  ].join("; ");
  return `
    <div class="bike3d-space" aria-label="3D модель велосипеда">
      <div class="bike3d-ground"></div>
      <div class="bike3d-model" data-bike3d-model style="${style}">
        <div class="bike3d-wheel bike3d-wheel-rear"><span></span></div>
        <div class="bike3d-wheel bike3d-wheel-front"><span></span></div>
        <div class="bike3d-frame bike3d-frame-top"></div>
        <div class="bike3d-frame bike3d-frame-down"></div>
        <div class="bike3d-frame bike3d-frame-seat"></div>
        <div class="bike3d-frame bike3d-frame-chain"></div>
        <div class="bike3d-frame bike3d-frame-stay"></div>
        <div class="bike3d-frame bike3d-frame-fork"></div>
        <div class="bike3d-bar"></div>
        <div class="bike3d-seat"></div>
        <div class="bike3d-rack bike3d-rack-left"></div>
        <div class="bike3d-rack bike3d-rack-right"></div>
        ${bagSlots.map((slot) => renderBike3dBag(slot, {
          selected: slot.id === selectedId,
          escapeHtml
        })).join("")}
      </div>
    </div>
  `;
}

function renderBike3dBag(slot, { selected, escapeHtml }) {
  const name = slot.name || slot.id;
  const label = shortContainerName(name);
  const style = [
    `--bag-x: ${slot.x}px`,
    `--bag-y: ${slot.y}px`,
    `--bag-z: ${slot.z}px`,
    `--bag-w: ${slot.w}px`,
    `--bag-h: ${slot.h}px`,
    `--bag-d: ${slot.d}px`,
    `--bag-rx: ${slot.rx}deg`,
    `--bag-ry: ${slot.ry}deg`,
    `--bag-rz: ${slot.rz}deg`,
    `--bag-sx: ${slot.sx}`,
    `--bag-sy: ${slot.sy}`,
    `--bag-sz: ${slot.sz}`,
    `--bag-color: ${slot.color}`
  ].join("; ");
  return `
    <button
      class="bike3d-bag3d bike3d-bag-${slot.slot} ${selected ? "active" : ""}"
      type="button"
      data-bike3d-container="${escapeHtml(slot.id)}"
      style="${style}"
      aria-label="Открыть ${escapeHtml(name)}"
      title="${escapeHtml(name)}"
    >
      <span class="bike3d-bag-face bike3d-bag-front">${escapeHtml(label)}</span>
      <span class="bike3d-bag-face bike3d-bag-top"></span>
      <span class="bike3d-bag-face bike3d-bag-side"></span>
    </button>
  `;
}

function renderBike3dAdjustControls(containerId, transform, escapeHtml) {
  const normalized = normalizeBike3dTransform(transform);
  const controlRow = (key, axis, label, value, down, up) => `
    <div class="bike3d-adjust-axis bike3d-adjust-axis-${axis}">
      <span data-bike3d-adjust-value="${key}"><b>${axis.toUpperCase()}</b> ${escapeHtml(label)} ${escapeHtml(value)}</span>
      <button type="button" data-bike3d-adjust="${down}" title="${escapeHtml(label)} -">-</button>
      <button type="button" data-bike3d-adjust="${up}" title="${escapeHtml(label)} +">+</button>
    </div>
  `;
  return `
    <div class="bike3d-adjust-controls" data-bike3d-adjust-controls data-bike3d-adjusting="${escapeHtml(containerId)}">
      <div class="bike3d-adjust-head">
        <strong>Настройка</strong>
        <button type="button" data-bike3d-adjust="reset" title="Сбросить">Сброс</button>
      </div>
      <div class="bike3d-adjust-color" aria-label="Цвет">
        ${BIKE3D_COLOR_PALETTE.map((color) => `
          <button
            type="button"
            class="${(normalized.color || BIKE3D_COLOR_PALETTE[0]).toLowerCase() === color.toLowerCase() ? "active" : ""}"
            data-bike3d-color="${color}"
            style="--swatch: ${color}"
            title="Цвет ${color}"
            aria-label="Цвет ${color}"
          ></button>
        `).join("")}
      </div>
      <div class="bike3d-adjust-grid">
        <div class="bike3d-adjust-pad" aria-label="Позиция">
          <button type="button" data-bike3d-adjust="move-up" title="Выше">↑</button>
          <button type="button" data-bike3d-adjust="move-left" title="Левее">←</button>
          <button type="button" data-bike3d-adjust="move-down" title="Ниже">↓</button>
          <button type="button" data-bike3d-adjust="move-right" title="Правее">→</button>
          <button type="button" data-bike3d-adjust="move-back" title="Дальше">Z-</button>
          <button type="button" data-bike3d-adjust="move-forward" title="Ближе">Z+</button>
        </div>
        <div class="bike3d-adjust-values" aria-label="Масштаб и поворот">
          ${controlRow("sx", "x", "шир.", `${Math.round(normalized.sx * 100)}%`, "scale-x-down", "scale-x-up")}
          ${controlRow("sy", "y", "выс.", `${Math.round(normalized.sy * 100)}%`, "scale-y-down", "scale-y-up")}
          ${controlRow("sz", "z", "гл.", `${Math.round(normalized.sz * 100)}%`, "scale-z-down", "scale-z-up")}
          ${controlRow("rx", "x", "повор.", `${Math.round(normalized.rx)}°`, "rotate-x-down", "rotate-x-up")}
          ${controlRow("ry", "y", "повор.", `${Math.round(normalized.ry)}°`, "rotate-y-down", "rotate-y-up")}
          ${controlRow("rz", "z", "повор.", `${Math.round(normalized.rz)}°`, "rotate-z-down", "rotate-z-up")}
        </div>
      </div>
    </div>
  `;
}

function renderBike3dDetailPanel(containerId, { renderContainer, escapeHtml }) {
  if (typeof renderContainer !== "function") return "";
  return `
    <div class="bike3d-detail-actions">
      <button
        class="icon-button bike3d-detail-settings"
        type="button"
        data-bike3d-settings="${escapeHtml(containerId)}"
        aria-label="Настроить 3D-положение"
        title="Настроить 3D-положение"
      >⚙</button>
      <button class="icon-button bike3d-detail-close" type="button" data-bike3d-close aria-label="Закрыть">×</button>
    </div>
    <div class="bike3d-detail-column">
      ${renderContainer(containerId)}
    </div>
  `;
}

function bindBike3dViewEvents(target, handlers) {
  target.querySelector("[data-bike3d-close]")?.addEventListener("click", () => handlers.onClose?.());
  target.querySelector("[data-bike3d-settings]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onToggleAdjust?.(event.currentTarget.dataset.bike3dSettings);
  });
  target.querySelectorAll("[data-bike3d-adjust]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onAdjust?.(button.dataset.bike3dAdjust);
    });
  });
  target.querySelectorAll("[data-bike3d-color]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onColor?.(button.dataset.bike3dColor);
    });
  });
  target.querySelector("[data-bike3d-reset-view]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onResetView?.();
  });
  target.querySelectorAll("[data-bike3d-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onSelect?.(button.dataset.bike3dContainer);
    });
  });
}

function bindBike3dViewportControls(target, initialViewState, onViewStateChange) {
  const viewport = target.querySelector("[data-bike3d-viewport]");
  const model = target.querySelector("[data-bike3d-model]");
  if (!viewport || !model) return;
  let dragging = false;
  let dragMode = "rotate";
  let startX = 0;
  let startY = 0;
  let viewState = normalizeBike3dViewState(initialViewState);
  const applyViewState = (next = viewState) => {
    viewState = normalizeBike3dViewState(next);
    model.style.setProperty("--bike-zoom", String(viewState.zoom));
    model.style.setProperty("--bike-pan-x", `${viewState.panX}px`);
    model.style.setProperty("--bike-pan-y", `${viewState.panY}px`);
    model.style.setProperty("--bike-rotate-x", `${viewState.rotateX}deg`);
    model.style.setProperty("--bike-rotate-z", `${viewState.rotateZ}deg`);
  };
  const commitViewState = () => onViewStateChange?.(viewState);
  applyViewState();
  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    dragging = true;
    dragMode = event.button === 2 || event.shiftKey || event.pointerType === "touch" ? "rotate" : "pan";
    startX = event.clientX;
    startY = event.clientY;
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    startX = event.clientX;
    startY = event.clientY;
    if (dragMode === "pan") {
      applyViewState({ ...viewState, panX: viewState.panX + dx, panY: viewState.panY + dy });
    } else {
      applyViewState({
        ...viewState,
        rotateZ: viewState.rotateZ + dx * 0.16,
        rotateX: viewState.rotateX - dy * 0.12
      });
    }
  });
  const stop = (event) => {
    if (dragging) commitViewState();
    dragging = false;
    if (event?.pointerId !== undefined) viewport.releasePointerCapture?.(event.pointerId);
  };
  viewport.addEventListener("pointerup", stop);
  viewport.addEventListener("pointercancel", stop);
  viewport.addEventListener("pointerleave", stop);
  viewport.addEventListener("contextmenu", (event) => event.preventDefault());
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    applyViewState({ ...viewState, zoom: viewState.zoom + direction * 0.1 });
    commitViewState();
  }, { passive: false });
}

function createBike3dScene(host, bagSlots, options = {}) {
  try {
    return createBike3dSceneUnsafe(host, bagSlots, options);
  } catch (error) {
    host?.closest(".bike3d-viewport")?.classList.remove("bike3d-webgl-ready");
    host?.closest(".bike3d-viewport")?.classList.add("bike3d-webgl-failed");
    host?.replaceChildren();
    console.warn("Bike 3D WebGL fallback is shown:", error);
    return null;
  }
}

function createBike3dSceneUnsafe(host, bagSlots, {
  selectedId = "",
  adjustingContainerId = "",
  transforms = {},
  viewState = null,
  onSelect,
  onViewStateChange
} = {}) {
  if (!host || !bagSlots.length) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "bike3d-three-canvas";
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(7, 4.2, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enabled = false;
  controls.target.set(0, 0.9, 0);
  controls.minDistance = 4.8;
  controls.maxDistance = 13;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.enableRotate = true;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: null
  };

  scene.add(new THREE.HemisphereLight(0xf7fff9, 0x6f7a74, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(5, 7, 5);
  scene.add(key);

  const bikeGroup = new THREE.Group();
  scene.add(bikeGroup);
  const bikeFrame = bikeGeometryFrame(BIKE_GEOMETRY_M);
  const clickable = buildBike3dModel(bikeGroup, bagSlots, { bikeFrame, selectedId, adjustingContainerId, transforms });
  const orbitTarget = bike3dOrbitTarget(bikeFrame);
  let cameraDistanceLimits = { fit: 6.2, min: 1.8, max: 32 };
  let screenPanX = 0;
  let screenPanY = 0;

  const syncCameraToTarget = () => {
    camera.lookAt(controls.target);
    applyCameraViewOffset();
    camera.updateMatrixWorld(true);
  };

  const applyCameraViewOffset = () => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (Math.abs(screenPanX) < 0.01 && Math.abs(screenPanY) < 0.01) {
      camera.clearViewOffset();
    } else {
      camera.setViewOffset(width, height, -screenPanX, -screenPanY, width, height);
    }
    camera.updateProjectionMatrix();
  };

  const measureBikeFitDistance = () => {
    const box = new THREE.Box3().setFromObject(bikeGroup);
    const size = box.getSize(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const padding = BIKE3D_DEFAULT_FIT_PADDING;
    const distanceForHeight = (size.y * padding) / (2 * Math.tan(verticalFov / 2));
    const distanceForWidth = (size.x * padding) / (2 * Math.tan(horizontalFov / 2));
    return Math.max(distanceForHeight, distanceForWidth, 6.2);
  };

  const updateCameraDistanceLimits = () => {
    const fit = measureBikeFitDistance();
    cameraDistanceLimits = {
      fit,
      min: Math.max(1.5, fit * 0.32),
      max: Math.max(28, fit * 5.4)
    };
    controls.minDistance = cameraDistanceLimits.min;
    controls.maxDistance = cameraDistanceLimits.max;
  };

  const fitBikeToViewport = () => {
    updateCameraDistanceLimits();
    const direction = new THREE.Vector3(
      BIKE3D_DEFAULT_VIEW_DIRECTION.x,
      BIKE3D_DEFAULT_VIEW_DIRECTION.y,
      BIKE3D_DEFAULT_VIEW_DIRECTION.z
    ).normalize();
    const rect = host.getBoundingClientRect();
    screenPanX = rect.width >= 900 ? -Math.min(300, Math.round(rect.width * 0.12)) : 0;
    screenPanY = 0;
    controls.target.copy(orbitTarget);
    camera.position.copy(orbitTarget).add(direction.multiplyScalar(cameraDistanceLimits.fit));
    camera.zoom = 1;
    syncCameraToTarget();
  };

  const applyViewState = (nextViewState) => {
    const normalized = normalizeBike3dViewState(nextViewState);
    if (!normalized.position || !normalized.target) return false;
    const savedPosition = new THREE.Vector3(normalized.position.x, normalized.position.y, normalized.position.z);
    const savedTarget = new THREE.Vector3(normalized.target.x, normalized.target.y, normalized.target.z);
    const savedOffset = savedPosition.sub(savedTarget);
    if (!Number.isFinite(savedOffset.lengthSq()) || savedOffset.lengthSq() < 0.0001) return false;
    savedOffset.setLength(THREE.MathUtils.clamp(savedOffset.length(), cameraDistanceLimits.min, cameraDistanceLimits.max));
    screenPanX = normalized.panX;
    screenPanY = normalized.panY;
    controls.target.copy(orbitTarget);
    camera.position.copy(orbitTarget).add(savedOffset);
    camera.zoom = 1;
    syncCameraToTarget();
    return true;
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredObject = null;
  let pointerDownPoint = null;
  let pointerMovedSinceDown = false;
  let suppressNextClick = false;
  let panPointerId = null;
  let panStartX = 0;
  let panStartY = 0;
  let panDragging = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let rotatePointerId = null;
  let rotateLastX = 0;
  let rotateLastY = 0;
  let rotateDragging = false;
  const touchPointers = new Map();
  let touchPanZoomGesture = null;
  let viewStateSaveTimer = null;

  const currentViewState = () => normalizeBike3dViewState({
    ...viewState,
    zoom: 1,
    panX: screenPanX,
    panY: screenPanY,
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
  });

  const saveViewStateSoon = () => {
    if (!onViewStateChange) return;
    window.clearTimeout(viewStateSaveTimer);
    viewStateSaveTimer = window.setTimeout(() => onViewStateChange(currentViewState()), 120);
  };

  const pickObject = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(clickable, false)[0]?.object || null;
  };

  const refreshBagVisual = (object, hover = false) => {
    if (!object?.material) return;
    object.material.emissive.set(hover ? object.material.color : 0x000000);
    object.material.emissiveIntensity = hover ? 0.18 : 0;
    const visualScale = hover ? 1.06 : 1;
    object.scale.copy(object.userData.baseScale || new THREE.Vector3(1, 1, 1)).multiplyScalar(visualScale);
  };

  const setHoveredObject = (object) => {
    if (hoveredObject === object) return;
    refreshBagVisual(hoveredObject, false);
    hoveredObject = object;
    refreshBagVisual(hoveredObject, true);
    canvas.style.cursor = hoveredObject ? "pointer" : "grab";
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCameraDistanceLimits();
    if (!applyViewState(viewState)) fitBikeToViewport();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const onPointerDown = (event) => {
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerMovedSinceDown = false;
  };
  const onPointerMove = (event) => {
    if (pointerDownPoint && Math.hypot(event.clientX - pointerDownPoint.x, event.clientY - pointerDownPoint.y) > 4) {
      pointerMovedSinceDown = true;
    }
    setHoveredObject(pickObject(event));
  };
  const onPointerLeave = () => setHoveredObject(null);
  const onClick = (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      pointerDownPoint = null;
      pointerMovedSinceDown = false;
      return;
    }
    if (pointerMovedSinceDown) return;
    const hit = pickObject(event);
    if (hit?.userData?.containerId) onSelect?.(hit.userData.containerId);
    pointerDownPoint = null;
    pointerMovedSinceDown = false;
  };

  const panCameraInScreenPlane = (deltaX, deltaY) => {
    screenPanX += deltaX;
    screenPanY += deltaY;
    syncCameraToTarget();
    saveViewStateSoon();
  };

  const dollyCameraByScale = (scale) => {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const currentDistance = offset.length();
    if (!Number.isFinite(currentDistance) || currentDistance < 0.0001) return;
    const nextDistance = THREE.MathUtils.clamp(
      currentDistance * scale,
      cameraDistanceLimits.min,
      cameraDistanceLimits.max
    );
    offset.setLength(nextDistance);
    controls.target.copy(orbitTarget);
    camera.position.copy(orbitTarget).add(offset);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    syncCameraToTarget();
    saveViewStateSoon();
  };

  const rotateCameraAroundTarget = (deltaX, deltaY) => {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const distance = offset.length();
    if (!Number.isFinite(distance) || distance < 0.0001) return;
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= deltaX * 0.006;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi - deltaY * 0.0048,
      Math.PI * 0.08,
      controls.maxPolarAngle
    );
    spherical.radius = distance;
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.updateProjectionMatrix();
    syncCameraToTarget();
    saveViewStateSoon();
  };

  const touchGestureSnapshot = () => {
    if (touchPointers.size < 2) return null;
    const points = [...touchPointers.values()].slice(0, 2);
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    return {
      centerX,
      centerY,
      distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y))
    };
  };

  const stopNativeEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onCustomPointerDown = (event) => {
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        rotatePointerId = null;
        rotateDragging = false;
        touchPanZoomGesture = touchGestureSnapshot();
        pointerMovedSinceDown = true;
        suppressNextClick = true;
        stopNativeEvent(event);
        return;
      }
      rotatePointerId = event.pointerId;
      rotateLastX = event.clientX;
      rotateLastY = event.clientY;
      rotateDragging = false;
      canvas.setPointerCapture?.(event.pointerId);
      stopNativeEvent(event);
      return;
    }
    if (event.button === 2 || (event.button === 0 && event.shiftKey)) {
      rotatePointerId = event.pointerId;
      rotateLastX = event.clientX;
      rotateLastY = event.clientY;
      rotateDragging = false;
      pointerMovedSinceDown = false;
      suppressNextClick = false;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = "grabbing";
      stopNativeEvent(event);
      return;
    }
    if (event.button !== 0) return;
    panPointerId = event.pointerId;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panDragging = false;
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    pointerMovedSinceDown = false;
    suppressNextClick = false;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = "grabbing";
    stopNativeEvent(event);
  };

  const onCustomPointerMove = (event) => {
    if (event.pointerType === "touch") {
      if (!touchPointers.has(event.pointerId)) return;
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPanZoomGesture && touchPointers.size >= 2) {
        const nextGesture = touchGestureSnapshot();
        if (!nextGesture) return;
        panCameraInScreenPlane(
          nextGesture.centerX - touchPanZoomGesture.centerX,
          nextGesture.centerY - touchPanZoomGesture.centerY
        );
        dollyCameraByScale(touchPanZoomGesture.distance / nextGesture.distance);
        touchPanZoomGesture = nextGesture;
        stopNativeEvent(event);
        return;
      }
      if (event.pointerId !== rotatePointerId) return;
      if (Math.hypot(event.clientX - rotateLastX, event.clientY - rotateLastY) > 1) {
        rotateDragging = true;
        pointerMovedSinceDown = true;
        suppressNextClick = true;
      }
      rotateCameraAroundTarget(event.clientX - rotateLastX, event.clientY - rotateLastY);
      rotateLastX = event.clientX;
      rotateLastY = event.clientY;
      stopNativeEvent(event);
      return;
    }
    if (event.pointerId === rotatePointerId) {
      if (Math.hypot(event.clientX - rotateLastX, event.clientY - rotateLastY) > 1) {
        rotateDragging = true;
        pointerMovedSinceDown = true;
        suppressNextClick = true;
      }
      rotateCameraAroundTarget(event.clientX - rotateLastX, event.clientY - rotateLastY);
      rotateLastX = event.clientX;
      rotateLastY = event.clientY;
      stopNativeEvent(event);
      return;
    }
    if (event.pointerId !== panPointerId) return;
    if (!panDragging && Math.hypot(event.clientX - panStartX, event.clientY - panStartY) > 4) {
      panDragging = true;
      pointerMovedSinceDown = true;
      suppressNextClick = true;
    }
    if (!panDragging) return;
    panCameraInScreenPlane(event.clientX - lastPanX, event.clientY - lastPanY);
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    stopNativeEvent(event);
  };

  const endCustomPointer = (event) => {
    if (event.pointerType === "touch") {
      touchPointers.delete(event.pointerId);
      if (touchPointers.size < 2 && touchPanZoomGesture) {
        touchPanZoomGesture = null;
        onViewStateChange?.(currentViewState());
        stopNativeEvent(event);
      }
      if (event.pointerId === rotatePointerId) {
        rotatePointerId = null;
        rotateDragging = false;
        canvas.releasePointerCapture?.(event.pointerId);
        onViewStateChange?.(currentViewState());
        stopNativeEvent(event);
      }
      return;
    }
    if (event.pointerId === rotatePointerId) {
      rotatePointerId = null;
      rotateDragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.style.cursor = hoveredObject ? "pointer" : "grab";
      onViewStateChange?.(currentViewState());
      stopNativeEvent(event);
      return;
    }
    if (event.pointerId !== panPointerId) return;
    panPointerId = null;
    panDragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.style.cursor = hoveredObject ? "pointer" : "grab";
    onViewStateChange?.(currentViewState());
    stopNativeEvent(event);
  };

  const onWheel = (event) => {
    event.preventDefault();
    const scale = Math.exp(THREE.MathUtils.clamp(event.deltaY, -600, 600) * 0.0012);
    dollyCameraByScale(scale);
    onViewStateChange?.(currentViewState());
  };

  canvas.addEventListener("pointerdown", onCustomPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onCustomPointerMove, { capture: true });
  canvas.addEventListener("pointerup", endCustomPointer, { capture: true });
  canvas.addEventListener("pointercancel", endCustomPointer, { capture: true });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", stopNativeEvent);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  const onControlsChange = () => {
    saveViewStateSoon();
  };
  controls.addEventListener("change", onControlsChange);
  controls.addEventListener("end", () => {
    onViewStateChange?.(currentViewState());
  });

  let frame = 0;
  const animate = () => {
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  renderer.render(scene, camera);
  host.closest(".bike3d-viewport")?.classList.add("bike3d-webgl-ready");
  animate();

  return {
    dispose() {
      window.clearTimeout(viewStateSaveTimer);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onCustomPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onCustomPointerMove, { capture: true });
      canvas.removeEventListener("pointerup", endCustomPointer, { capture: true });
      canvas.removeEventListener("pointercancel", endCustomPointer, { capture: true });
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", stopNativeEvent);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      controls.removeEventListener("change", onControlsChange);
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      canvas.remove();
    }
  };
}

function bike3dOrbitTarget(bikeFrame) {
  const wheelCenter = bikeFrame?.points?.rotationCenter || { x: 0, y: 0 };
  const bottomBracket = bikeFrame?.points?.bottomBracket || wheelCenter;
  const x = Number(bottomBracket.x);
  const y = Number(wheelCenter.y);
  return new THREE.Vector3(
    Number.isFinite(x) ? x : Number(wheelCenter.x) || 0,
    Number.isFinite(y) ? y : Number(bottomBracket.y) || 0,
    0
  );
}

function buildBike3dModel(group, bagSlots, { bikeFrame, selectedId, adjustingContainerId, transforms }) {
  const frame = bikeFrame || bikeGeometryFrame(BIKE_GEOMETRY_M);
  const points = frame.points;
  const dimensions = frame.dimensions;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1f3a36, metalness: 0.35, roughness: 0.32 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x202826, metalness: 0.05, roughness: 0.72 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdbe6df, metalness: 0.25, roughness: 0.38 });
  const contactMaterial = new THREE.MeshStandardMaterial({ color: 0x52645e, metalness: 0.18, roughness: 0.42 });

  const makeTube = (name, start, end, radius = 0.045, material = frameMaterial) => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), material);
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
    return mesh;
  };

  const vector = (point, z = 0) => new THREE.Vector3(point.x, point.y, z);
  const rear = vector(points.rearAxle);
  const front = vector(points.frontAxle);
  const bottom = vector(points.bottomBracket);
  const seat = vector(points.seatTop);
  const headTop = vector(points.headTop);
  const headBottom = vector(points.headBottom);
  const seatPostTop = vector(points.seatPostTop);
  const stemEnd = vector(points.stemEnd);
  const saddleCenter = vector(points.saddleCenter);
  const handlebarCenter = vector(points.handlebarCenter);

  [rear, front].forEach((position) => {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(dimensions.wheelRadius, dimensions.tireRadius, 18, 96), tireMaterial);
    tire.position.copy(position);
    group.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(dimensions.rimRadius, dimensions.tireRadius * 0.22, 12, 72), rimMaterial);
    rim.position.copy(position);
    group.add(rim);
  });

  makeTube("top-tube", seat, headTop, dimensions.tubeRadius);
  makeTube("down-tube", headBottom, bottom, dimensions.tubeRadius);
  makeTube("seat-tube", bottom, seat, dimensions.tubeRadius);
  makeTube("head-tube", headBottom, headTop, dimensions.tubeRadius);
  makeTube("chain-stay", bottom, rear, dimensions.slimTubeRadius);
  makeTube("seat-stay", seat, rear, dimensions.slimTubeRadius);
  makeTube("fork", headBottom, front, dimensions.slimTubeRadius);
  makeTube("seat-post", seat, seatPostTop, dimensions.seatPostRadius, contactMaterial);
  makeTube("stem", headTop, stemEnd, dimensions.slimTubeRadius, contactMaterial);
  makeTube(
    "handlebar",
    handlebarCenter.clone().setZ(-dimensions.handlebarWidth / 2),
    handlebarCenter.clone().setZ(dimensions.handlebarWidth / 2),
    dimensions.slimTubeRadius,
    contactMaterial
  );

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(dimensions.saddleLength, dimensions.tireRadius * 0.55, dimensions.saddleWidth), contactMaterial);
  saddle.name = "saddle";
  saddle.position.copy(saddleCenter);
  group.add(saddle);

  return bagSlots.map((slot) => addBike3dBag(group, slot, {
    frame,
    selectedId,
    adjustingContainerId,
    transform: transforms[slot.id]
  }));
}

function addBike3dBag(group, slot, { frame, selectedId, adjustingContainerId, transform }) {
  const points = frame?.points || {};
  const rear = points.rearAxle || { x: 0, y: 0 };
  const front = points.frontAxle || { x: 0, y: 0 };
  const bottom = points.bottomBracket || { x: 0, y: 0 };
  const seat = points.seatTop || { x: 0, y: 0 };
  const head = points.headTop || { x: 0, y: 0 };
  const handlebar = points.handlebarCenter || head;
  const positions = {
    "rear-left": { p: [rear.x + 0.76, rear.y + 0.34, -0.82], s: [0.78, 0.92, 0.32] },
    "rear-right": { p: [rear.x + 0.76, rear.y + 0.34, 0.82], s: [0.78, 0.92, 0.32] },
    "front-left": { p: [front.x - 0.24, front.y + 0.22, -0.66], s: [0.58, 0.74, 0.28] },
    "front-right": { p: [front.x - 0.24, front.y + 0.22, 0.66], s: [0.58, 0.74, 0.28] },
    frame: { p: [(bottom.x + head.x) / 2, (bottom.y + head.y) / 2 - 0.12, 0], s: [0.98, 0.46, 0.34] },
    handlebar: { p: [handlebar.x, handlebar.y - 0.18, 0], s: [0.72, 0.34, 0.74] },
    seat: { p: [seat.x - 0.16, seat.y + 0.18, 0], s: [0.52, 0.42, 0.42] },
    fork: { p: [front.x - 0.42, front.y + 0.62, 0], s: [0.42, 0.7, 0.3] }
  };
  const config = positions[slot.slot] || positions.frame;
  const size = bike3dBagSize(config.s, slot.dimensions);
  const active = slot.id === selectedId;
  const normalized = normalizeBike3dTransform(transform);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(normalized.color || slot.color),
    metalness: 0.05,
    roughness: 0.48,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.userData.basePosition = new THREE.Vector3(...config.p);
  mesh.userData.containerId = slot.id;
  mesh.name = slot.name;
  applyBike3dTransformToMesh(mesh, normalized);
  if (active) mesh.add(createBike3dSelectionOutline(size));
  if (active && adjustingContainerId === slot.id) mesh.add(createBike3dAxesGizmo());
  group.add(mesh);
  return mesh;
}

function bike3dBagSize(fallbackSize, dimensions) {
  const normalized = normalizeContainerDimensions(dimensions);
  const [fallbackWidth, fallbackHeight, fallbackDepth] = fallbackSize;
  return [
    normalized.width ? normalized.width * BIKE3D_BAG_DIMENSION_SCENE_SCALE : fallbackWidth,
    normalized.height ? normalized.height * BIKE3D_BAG_DIMENSION_SCENE_SCALE : fallbackHeight,
    normalized.depth ? normalized.depth * BIKE3D_BAG_DIMENSION_SCENE_SCALE : fallbackDepth
  ];
}

function createBike3dSelectionOutline(size) {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(...size));
  const material = new THREE.LineBasicMaterial({ color: 0xf4fff9, linewidth: 2 });
  const outline = new THREE.LineSegments(geometry, material);
  outline.name = "selected-bag-outline";
  outline.scale.setScalar(1.055);
  const glowGeometry = new THREE.BoxGeometry(...size);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xe9fff6,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.BackSide
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = "selected-bag-glow";
  glow.scale.setScalar(1.14);
  outline.add(glow);
  return outline;
}

function createBike3dAxesGizmo() {
  const gizmo = new THREE.Group();
  const arrows = [
    { direction: new THREE.Vector3(1, 0, 0), color: 0xd34d3f },
    { direction: new THREE.Vector3(0, 1, 0), color: 0x2f8b57 },
    { direction: new THREE.Vector3(0, 0, 1), color: 0x386fbb }
  ];
  arrows.forEach(({ direction, color }) => {
    gizmo.add(new THREE.ArrowHelper(direction, new THREE.Vector3(0, 0, 0), 0.86, color, 0.18, 0.09));
  });
  gizmo.position.set(0, 0.55, 0);
  gizmo.scale.setScalar(1.2);
  return gizmo;
}

function applyBike3dTransformToMesh(mesh, transform) {
  const normalized = normalizeBike3dTransform(transform);
  const basePosition = mesh.userData.basePosition || new THREE.Vector3();
  mesh.position.set(
    basePosition.x + normalized.x,
    basePosition.y + normalized.y,
    basePosition.z + normalized.z
  );
  mesh.rotation.set(
    THREE.MathUtils.degToRad(normalized.rx),
    THREE.MathUtils.degToRad(normalized.ry),
    THREE.MathUtils.degToRad(normalized.rz)
  );
  mesh.userData.baseScale = new THREE.Vector3(normalized.sx, normalized.sy, normalized.sz);
  mesh.scale.copy(mesh.userData.baseScale);
}

function renderBike3dLoadSummary(target, slots, { containerWeight, formatWeight }) {
  if (typeof containerWeight !== "function" || typeof formatWeight !== "function") return;
  const total = slots.reduce((sum, slot) => sum + (Number(containerWeight(slot.id)) || 0), 0);
  const label = target.querySelector("[data-bike3d-load-summary]");
  if (label) label.textContent = `${slots.length} сумок · ${formatWeight(total)}`;
}

function bike3dBagSlots(rootIds, { containers, transforms }) {
  return rootIds.map((id, index) => {
    const container = containers[id];
    const slotName = BIKE3D_SLOT_ORDER[index % BIKE3D_SLOT_ORDER.length];
    const slot = BIKE3D_SLOT_CONFIG[slotName] || BIKE3D_SLOT_CONFIG.frame;
    const transform = normalizeBike3dTransform(transforms[id]);
    return {
      id,
      name: container?.name || id,
      slot: slotName,
      dimensions: normalizeContainerDimensions(container?.dimensions),
      x: Math.round(slot.x + transform.x * 24),
      y: Math.round(slot.y - transform.y * 24),
      z: Math.round(slot.z + transform.z * 18),
      w: Math.round(slot.w),
      h: Math.round(slot.h),
      d: Math.round(slot.d),
      sx: transform.sx,
      sy: transform.sy,
      sz: transform.sz,
      rx: transform.rx,
      ry: transform.ry,
      rz: transform.rz,
      color: transform.color || BIKE3D_COLOR_PALETTE[index % BIKE3D_COLOR_PALETTE.length]
    };
  });
}

function shortContainerName(name) {
  const words = String(name || "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || String(name || "");
}
