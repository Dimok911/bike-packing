import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
    panX: clamp("panX", -260, 260),
    panY: clamp("panY", -180, 180),
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
  onViewStateChange
} = {}) {
  if (!target) return;
  const validRootIds = rootIds.filter((id) => containers[id]);
  const selectedId = validRootIds.includes(selectedContainerId) ? selectedContainerId : "";
  const selected = selectedId ? containers[selectedId] : null;
  const bagSlots = bike3dBagSlots(validRootIds, { containers, transforms });
  const normalizedViewState = normalizeBike3dViewState(viewState);
  target.innerHTML = `
    ${beforeHtml}
    <section class="bike3d-shell ${selected ? "bike3d-inspecting" : ""}" data-bike3d-shell>
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
    onViewStateChange
  });
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

function createBike3dScene(host, bagSlots, {
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
  host.closest(".bike3d-viewport")?.classList.add("bike3d-webgl-ready");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(7, 4.2, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.9, 0);
  controls.minDistance = 4.8;
  controls.maxDistance = 13;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };

  scene.add(new THREE.HemisphereLight(0xf7fff9, 0x6f7a74, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(5, 7, 5);
  scene.add(key);

  const bikeGroup = new THREE.Group();
  scene.add(bikeGroup);
  const clickable = buildBike3dModel(bikeGroup, bagSlots, { selectedId, adjustingContainerId, transforms });

  const fitBikeToViewport = () => {
    const box = new THREE.Box3().setFromObject(bikeGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const padding = selectedId ? 1.62 : 1.22;
    const distanceForHeight = (size.y * padding) / (2 * Math.tan(verticalFov / 2));
    const distanceForWidth = (size.x * padding) / (2 * Math.tan(horizontalFov / 2));
    const distance = Math.max(distanceForHeight, distanceForWidth, selectedId ? 8.4 : 6.2);
    const direction = new THREE.Vector3(7, 3.3, 8).normalize();
    const target = center.clone();
    target.y += 0.25;
    controls.target.copy(target);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.minDistance = Math.max(4.8, distance * 0.58);
    controls.maxDistance = Math.max(13, distance * 1.75);
    controls.update();
  };

  const applyViewState = (nextViewState) => {
    const normalized = normalizeBike3dViewState(nextViewState);
    if (!normalized.position || !normalized.target) return false;
    camera.position.set(normalized.position.x, normalized.position.y, normalized.position.z);
    controls.target.set(normalized.target.x, normalized.target.y, normalized.target.z);
    camera.zoom = normalized.zoom || 1;
    camera.updateProjectionMatrix();
    controls.update();
    return true;
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredObject = null;
  let pointerDownPoint = null;
  let pointerMovedSinceDown = false;
  let viewStateSaveTimer = null;

  const currentViewState = () => normalizeBike3dViewState({
    ...viewState,
    zoom: camera.zoom || 1,
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
    const active = object.userData.containerId === selectedId;
    object.material.emissive.set(active || hover ? 0xffdf6b : 0x000000);
    object.material.emissiveIntensity = active && hover ? 1.15 : active ? 0.95 : hover ? 0.58 : 0;
    const visualScale = active && hover ? 1.14 : active ? 1.1 : hover ? 1.06 : 1;
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
    if (pointerMovedSinceDown) return;
    const hit = pickObject(event);
    if (hit?.userData?.containerId) onSelect?.(hit.userData.containerId);
    pointerDownPoint = null;
    pointerMovedSinceDown = false;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  controls.addEventListener("change", saveViewStateSoon);
  controls.addEventListener("end", () => onViewStateChange?.(currentViewState()));

  let frame = 0;
  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  animate();

  return {
    dispose() {
      window.clearTimeout(viewStateSaveTimer);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
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

function buildBike3dModel(group, bagSlots, { selectedId, adjustingContainerId, transforms }) {
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1f3a36, metalness: 0.35, roughness: 0.32 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x202826, metalness: 0.05, roughness: 0.72 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdbe6df, metalness: 0.25, roughness: 0.38 });

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

  const rear = new THREE.Vector3(-2.5, 0.72, 0);
  const front = new THREE.Vector3(2.55, 0.72, 0);
  const bottom = new THREE.Vector3(-0.35, 0.84, 0);
  const seat = new THREE.Vector3(-1.15, 2.05, 0);
  const head = new THREE.Vector3(1.42, 1.9, 0);
  const bar = new THREE.Vector3(2.08, 2.22, 0);

  [rear, front].forEach((position) => {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 18, 72), tireMaterial);
    tire.position.copy(position);
    group.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 12, 60), rimMaterial);
    rim.position.copy(position);
    group.add(rim);
  });

  makeTube("top-tube", seat, head);
  makeTube("down-tube", head, bottom);
  makeTube("seat-tube", seat, bottom);
  makeTube("chain-stay", bottom, rear);
  makeTube("seat-stay", seat, rear);
  makeTube("fork", head, front, 0.04);
  makeTube("handlebar", head, bar, 0.035);
  makeTube("rear-rack", new THREE.Vector3(-2.35, 1.55, -0.72), new THREE.Vector3(-1.2, 1.55, -0.72), 0.035);
  makeTube("rear-rack-2", new THREE.Vector3(-2.35, 1.55, 0.72), new THREE.Vector3(-1.2, 1.55, 0.72), 0.035);

  const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.32), frameMaterial);
  seatMesh.position.set(-1.32, 2.18, 0);
  group.add(seatMesh);

  return bagSlots.map((slot) => addBike3dBag(group, slot, {
    selectedId,
    adjustingContainerId,
    transform: transforms[slot.id]
  }));
}

function addBike3dBag(group, slot, { selectedId, adjustingContainerId, transform }) {
  const positions = {
    "rear-left": { p: [-2.1, 1.08, -0.82], s: [0.78, 0.92, 0.32] },
    "rear-right": { p: [-2.1, 1.08, 0.82], s: [0.78, 0.92, 0.32] },
    "front-left": { p: [2.35, 0.98, -0.66], s: [0.58, 0.74, 0.28] },
    "front-right": { p: [2.35, 0.98, 0.66], s: [0.58, 0.74, 0.28] },
    frame: { p: [-0.25, 1.32, 0], s: [0.98, 0.46, 0.34] },
    handlebar: { p: [2.34, 2.05, 0], s: [0.72, 0.34, 0.74] },
    seat: { p: [-1.72, 1.72, 0], s: [0.52, 0.42, 0.42] },
    fork: { p: [1.72, 1.32, 0], s: [0.42, 0.7, 0.3] }
  };
  const config = positions[slot.slot] || positions.frame;
  const active = slot.id === selectedId;
  const normalized = normalizeBike3dTransform(transform);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(normalized.color || slot.color),
    metalness: 0.05,
    roughness: 0.48,
    emissive: active ? new THREE.Color(0xffdf6b) : new THREE.Color(0x000000),
    emissiveIntensity: active ? 0.95 : 0
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...config.s), material);
  mesh.userData.basePosition = new THREE.Vector3(...config.p);
  mesh.userData.containerId = slot.id;
  mesh.name = slot.name;
  applyBike3dTransformToMesh(mesh, normalized);
  if (active) mesh.scale.multiplyScalar(1.1);
  if (active && adjustingContainerId === slot.id) mesh.add(createBike3dAxesGizmo());
  group.add(mesh);
  return mesh;
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
