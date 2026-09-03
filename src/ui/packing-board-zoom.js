import { classifyTouchScrollAxis } from "./horizontal-touch-scroll.js";

export const PACKING_BOARD_ZOOM_STORAGE_KEY = "bike-packing-board-zoom-v1";
export const PACKING_BOARD_ZOOM_MIN = 0.2;
export const PACKING_BOARD_ZOOM_MAX = 1.6;
export const PACKING_BOARD_ZOOM_ELASTIC_MAX = 1.8;
export const PACKING_BOARD_ZOOM_SNAP_PERCENT = 100;
export const PACKING_BOARD_ZOOM_SNAP_RADIUS_PERCENT = 2;
export const PACKING_BOARD_ZOOM_SNAP_SPEED_PERCENT_PER_MS = 0.06;
export const PACKING_BOARD_FIXED_SCROLLBAR_CLEARANCE = 52;
export const PACKING_BOARD_POST_PINCH_PAN_DELAY_MS = 80;
export const PACKING_BOARD_PAN_MAX_VELOCITY = 1.5;

let activePackingBoardZoomController = null;

export function packingBoardZoomControllerFor(board) {
  return activePackingBoardZoomController?.board === board
    ? activePackingBoardZoomController
    : null;
}

export function packingBoardHorizontalGeometry(board, {
  basePaddingRight,
  includeRetainedGutter = true
} = {}) {
  const clientWidth = Math.max(0, Number(board?.clientWidth) || 0);
  const configuredGutter = Number(board?.dataset?.packingBoardRetainedRightGutter);
  const retainedGutter = Number.isFinite(configuredGutter) ? Math.max(0, configuredGutter) : 0;
  const visibleRetainedGutter = includeRetainedGutter ? retainedGutter : 0;
  const rawContentWidth = Math.max(
    clientWidth,
    (Number(board?.scrollWidth) || 0) - (includeRetainedGutter ? 0 : retainedGutter)
  );
  const rawMaxScroll = Math.max(0, rawContentWidth - clientWidth);
  if (!board?.classList?.contains?.("packing-board-zoom-active")) {
    return { clientWidth, contentWidth: rawContentWidth, maxScroll: rawMaxScroll };
  }

  const zoom = Number(board?.dataset?.packingBoardZoom);
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return { clientWidth, contentWidth: rawContentWidth, maxScroll: rawMaxScroll };
  }

  const targets = [...(board?.children || [])].filter((child) => (
    child?.classList?.contains?.("container-card") ||
    child?.classList?.contains?.("packing-add-root-card") ||
    child?.classList?.contains?.("comparison-root")
  ));
  const visualRight = targets.reduce((right, target) => {
    const offsetLeft = Number(target?.offsetLeft);
    const offsetWidth = Number(target?.offsetWidth);
    if (!Number.isFinite(offsetLeft) || !Number.isFinite(offsetWidth) || offsetWidth <= 0) return right;
    return Math.max(right, offsetLeft + offsetWidth * zoom);
  }, 0);
  if (!visualRight) {
    return { clientWidth, contentWidth: rawContentWidth, maxScroll: rawMaxScroll };
  }

  const configuredPadding = Number(basePaddingRight ?? board?.dataset?.packingBoardBasePaddingRight);
  const safePaddingRight = Number.isFinite(configuredPadding) ? Math.max(0, configuredPadding) : 0;
  const contentWidth = Math.max(clientWidth, visualRight + safePaddingRight + visibleRetainedGutter);
  return {
    clientWidth,
    contentWidth,
    maxScroll: Math.max(0, contentWidth - clientWidth)
  };
}

export function clampPackingBoardZoom(value, {
  max = PACKING_BOARD_ZOOM_MAX,
  min = PACKING_BOARD_ZOOM_MIN
} = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(Number(min) || PACKING_BOARD_ZOOM_MIN, Math.min(Number(max) || PACKING_BOARD_ZOOM_MAX, parsed));
}

export function packingBoardSliderZoomPercent(value, {
  pointerActive = false,
  gestureStartPercent = value,
  elapsedMs = Number.POSITIVE_INFINITY,
  snapPercent = PACKING_BOARD_ZOOM_SNAP_PERCENT,
  snapRadiusPercent = PACKING_BOARD_ZOOM_SNAP_RADIUS_PERCENT,
  snapSpeedPercentPerMs = PACKING_BOARD_ZOOM_SNAP_SPEED_PERCENT_PER_MS
} = {}) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return snapPercent;
  if (!pointerActive || Math.abs(percent - snapPercent) > snapRadiusPercent) return percent;
  const startPercent = Number(gestureStartPercent);
  if (!Number.isFinite(startPercent) || Math.abs(startPercent - snapPercent) <= snapRadiusPercent) {
    return percent;
  }
  const duration = Math.max(1, Number(elapsedMs) || 0);
  const speed = Math.abs(percent - startPercent) / duration;
  return speed >= snapSpeedPercentPerMs ? snapPercent : percent;
}

export function packingBoardFitMaxZoom({
  boardWidth,
  columnWidth,
  max = PACKING_BOARD_ZOOM_MAX
} = {}) {
  const availableWidth = Math.max(0, Number(boardWidth) || 0);
  const baseWidth = Math.max(0, Number(columnWidth) || 0);
  if (!availableWidth || !baseWidth) return 1;
  return Math.max(1, Math.min(Number(max) || PACKING_BOARD_ZOOM_MAX, availableWidth / baseWidth));
}

export function packingBoardPresentationZooms() {
  return {
    overview: PACKING_BOARD_ZOOM_MIN,
    detail: 1
  };
}

export function packingBoardUsableColumnWidth(...values) {
  const width = values
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value >= 48);
  return width || null;
}

export function packingBoardPinchZoom(startZoom, startDistance, currentDistance, {
  elastic = false,
  maxZoom = PACKING_BOARD_ZOOM_MAX
} = {}) {
  const safeStartDistance = Math.max(1, Number(startDistance) || 1);
  const rawZoom = (Number(startZoom) || 1) * (Math.max(1, Number(currentDistance) || 1) / safeStartDistance);
  const safeMax = Math.max(1, Math.min(PACKING_BOARD_ZOOM_MAX, Number(maxZoom) || PACKING_BOARD_ZOOM_MAX));
  const overshootLimit = Math.min(PACKING_BOARD_ZOOM_ELASTIC_MAX, safeMax * 1.1);
  const zoom = elastic && rawZoom > safeMax
    ? Math.min(overshootLimit, safeMax + (rawZoom - safeMax) * 0.24)
    : clampPackingBoardZoom(rawZoom, { max: safeMax });
  return Math.round(zoom * 1000) / 1000;
}

export function packingBoardWheelZoom(currentZoom, deltaY, {
  maxZoom = PACKING_BOARD_ZOOM_MAX
} = {}) {
  const boundedDelta = Math.max(-100, Math.min(100, Number(deltaY) || 0));
  const nextZoom = (Number(currentZoom) || 1) * Math.exp(-boundedDelta * 0.00075);
  return Math.round(clampPackingBoardZoom(nextZoom, { max: maxZoom }) * 1000) / 1000;
}

export function packingBoardWheelPageDelta({
  deltaMode = 0,
  deltaY = 0,
  viewportHeight = 0
} = {}) {
  const amount = Number(deltaY) || 0;
  if (Number(deltaMode) === 1) return amount * 16;
  if (Number(deltaMode) === 2) return amount * Math.max(1, Number(viewportHeight) || 0);
  return amount;
}

export function packingBoardGestureTargetsOpenDialog(event, {
  documentRef = globalThis.document
} = {}) {
  const dialog = event?.target?.closest?.("dialog");
  if (dialog?.open) return true;
  return Boolean(documentRef?.querySelector?.("dialog[open]"));
}

export function packingBoardGestureTargetsFixedScrollbar(event, {
  documentRef = globalThis.document
} = {}) {
  if (event?.target?.closest?.(
    ".kanban-board-touch-surface, #kanbanScrollbar, #kanbanScrollThumb"
  )) return true;
  const touch = event?.touches?.[0] || event?.changedTouches?.[0] || null;
  if (!touch) return false;
  const surface = documentRef?.querySelector?.(".kanban-board-touch-surface")
    || documentRef?.querySelector?.("#kanbanScrollbar");
  const rect = surface?.getBoundingClientRect?.();
  if (!rect) return false;
  const x = Number(touch.clientX);
  const y = Number(touch.clientY);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= Number(rect.left)
    && x <= Number(rect.right)
    && y >= Number(rect.top)
    && y <= Number(rect.bottom);
}

export function packingBoardTwoFingerMode({
  currentDistance,
  startDistance
} = {}) {
  const safeStartDistance = Math.max(1, Number(startDistance) || 1);
  const distanceDelta = Math.abs((Number(currentDistance) || safeStartDistance) - safeStartDistance);
  const zoomThreshold = Math.max(6, safeStartDistance * 0.035);
  return distanceDelta >= zoomThreshold ? "zoom" : "";
}

export function packingBoardZoomedTouchScrollAxis(dx, dy) {
  return classifyTouchScrollAxis(dx, dy, {
    horizontalDistance: 10,
    verticalDistance: 7,
    verticalDominance: 1.1
  });
}

export function packingBoardAllowsDiagonalPan(value) {
  return clampPackingBoardZoom(value, { max: PACKING_BOARD_ZOOM_ELASTIC_MAX }) < 0.995;
}

export function packingBoardPostPinchPanReady(elapsedMs, {
  delayMs = PACKING_BOARD_POST_PINCH_PAN_DELAY_MS
} = {}) {
  return Math.max(0, Number(elapsedMs) || 0) >= Math.max(0, Number(delayMs) || 0);
}

export function packingBoardProportionalScrollLeft({
  nextMaxScrollLeft,
  startMaxScrollLeft,
  startScrollLeft
} = {}) {
  const safeStartMax = Math.max(0, Number(startMaxScrollLeft) || 0);
  const safeNextMax = Math.max(0, Number(nextMaxScrollLeft) || 0);
  if (!safeStartMax || !safeNextMax) return 0;
  const progress = Math.max(0, Math.min(1, (Number(startScrollLeft) || 0) / safeStartMax));
  return progress * safeNextMax;
}

export function packingBoardCenteredScrollPosition({
  currentScroll,
  maxScroll,
  targetClientCenter,
  viewportClientCenter
} = {}) {
  const maximum = Math.max(0, Number(maxScroll) || 0);
  const desired = (Number(currentScroll) || 0) +
    (Number(targetClientCenter) || 0) -
    (Number(viewportClientCenter) || 0);
  return Math.max(0, Math.min(maximum, desired));
}

export function packingBoardAnchoredScrollLeft({
  anchorClientX,
  anchorContentX,
  boardClientLeft,
  maxScrollLeft = Number.POSITIVE_INFINITY,
  zoom
} = {}) {
  const viewportX = (Number(anchorClientX) || 0) - (Number(boardClientLeft) || 0);
  const desired = (Number(anchorContentX) || 0) * clampPackingBoardZoom(zoom, { max: PACKING_BOARD_ZOOM_ELASTIC_MAX }) - viewportX;
  return Math.max(0, Math.min(Math.max(0, Number(maxScrollLeft) || 0), desired));
}

export function packingBoardPagePanScrollTop({
  currentClientY,
  currentScrollTop,
  previousClientY
} = {}) {
  return Math.max(0, (Number(currentScrollTop) || 0) + (Number(previousClientY) || 0) - (Number(currentClientY) || 0));
}

export function packingBoardPanVelocity({
  currentClientCoordinate,
  elapsedMs,
  maxVelocity = PACKING_BOARD_PAN_MAX_VELOCITY,
  previousClientCoordinate,
  previousVelocity = 0,
  sampleWeight = 0.75
} = {}) {
  const elapsed = Math.max(1, Number(elapsedMs) || 1);
  const maximum = Math.max(0, Number(maxVelocity) || PACKING_BOARD_PAN_MAX_VELOCITY);
  const rawSample = (
    (Number(previousClientCoordinate) || 0) - (Number(currentClientCoordinate) || 0)
  ) / elapsed;
  const sample = Math.max(-maximum, Math.min(maximum, rawSample));
  const prior = Number(previousVelocity) || 0;
  const weight = Math.max(0, Math.min(1, Number(sampleWeight) || 0));
  const velocity = prior ? prior * (1 - weight) + sample * weight : sample;
  return Math.max(-maximum, Math.min(maximum, velocity));
}

export function packingBoardPagePanVelocity({
  currentClientY,
  elapsedMs,
  previousClientY,
  previousVelocity = 0
} = {}) {
  return packingBoardPanVelocity({
    currentClientCoordinate: currentClientY,
    elapsedMs,
    previousClientCoordinate: previousClientY,
    previousVelocity
  });
}

export function packingBoardPageMomentumScrollTop({
  currentScrollTop,
  elapsedMs,
  maxScrollTop,
  velocity
} = {}) {
  const maximum = Math.max(0, Number(maxScrollTop) || 0);
  const next = (Number(currentScrollTop) || 0) + (Number(velocity) || 0) * Math.max(0, Number(elapsedMs) || 0);
  return Math.max(0, Math.min(maximum, next));
}

export function packingBoardMomentumScrollLeft({
  currentScrollLeft,
  elapsedMs,
  maxScrollLeft,
  velocity
} = {}) {
  const maximum = Math.max(0, Number(maxScrollLeft) || 0);
  const next = (Number(currentScrollLeft) || 0) + (Number(velocity) || 0) * Math.max(0, Number(elapsedMs) || 0);
  return Math.max(0, Math.min(maximum, next));
}

export function packingBoardZoomMomentumValue({
  currentZoom,
  elapsedMs,
  maxZoom = PACKING_BOARD_ZOOM_ELASTIC_MAX,
  velocity
} = {}) {
  return clampPackingBoardZoom(
    (Number(currentZoom) || 1) + (Number(velocity) || 0) * Math.max(0, Number(elapsedMs) || 0),
    { max: maxZoom }
  );
}

export function packingBoardVisualMaxScrollTop({
  boardClientBottom,
  currentScrollTop,
  hostMaxScrollTop,
  scrollHostClientTop = 0,
  viewportHeight
} = {}) {
  const hostMaximum = Math.max(0, Number(hostMaxScrollTop) || 0);
  const boardDocumentBottom = (Number(currentScrollTop) || 0) +
    (Number(boardClientBottom) || 0) -
    (Number(scrollHostClientTop) || 0);
  const visualMaximum = Math.max(0, boardDocumentBottom - Math.max(0, Number(viewportHeight) || 0));
  return Math.min(hostMaximum, visualMaximum);
}

export function packingBoardAnchoredPageScrollTop({
  anchorClientY,
  anchorContentY,
  boardDocumentTop,
  maxScrollTop = Number.POSITIVE_INFINITY,
  zoom
} = {}) {
  const desired = (Number(boardDocumentTop) || 0) +
    (Number(anchorContentY) || 0) * clampPackingBoardZoom(zoom, { max: PACKING_BOARD_ZOOM_ELASTIC_MAX }) -
    (Number(anchorClientY) || 0);
  return Math.max(0, Math.min(Math.max(0, Number(maxScrollTop) || 0), desired));
}

export function packingBoardScaledHeight({
  bottomClearance = 0,
  contentHeight,
  paddingBottom = 0,
  paddingTop = 0,
  zoom = 1
} = {}) {
  const safeContentHeight = Math.max(0, Number(contentHeight) || 0);
  const safePadding = Math.max(0, Number(paddingTop) || 0) + Math.max(0, Number(paddingBottom) || 0);
  return safeContentHeight * clampPackingBoardZoom(zoom, { max: PACKING_BOARD_ZOOM_ELASTIC_MAX }) +
    safePadding +
    Math.max(0, Number(bottomClearance) || 0);
}

function touchPair(touches) {
  const points = [...(touches || [])].slice(0, 2);
  if (points.length < 2) return null;
  const first = points[0];
  const second = points[1];
  const dx = Number(second.clientX) - Number(first.clientX);
  const dy = Number(second.clientY) - Number(first.clientY);
  return {
    centerX: (Number(first.clientX) + Number(second.clientX)) / 2,
    centerY: (Number(first.clientY) + Number(second.clientY)) / 2,
    distance: Math.max(1, Math.hypot(dx, dy))
  };
}

export function packingBoardStoredZoom(storage, storageKey, maxZoom = PACKING_BOARD_ZOOM_MAX) {
  try {
    const storedValue = storage?.getItem?.(storageKey);
    if (storedValue === null || storedValue === undefined || storedValue === "") return 1;
    return clampPackingBoardZoom(storedValue, { max: maxZoom });
  } catch {
    return 1;
  }
}

function saveZoom(storage, storageKey, zoom, maxZoom = PACKING_BOARD_ZOOM_MAX) {
  try {
    storage?.setItem?.(storageKey, String(Math.round(clampPackingBoardZoom(zoom, { max: maxZoom }) * 100) / 100));
  } catch {
    // A local display preference must never block the packing board.
  }
}

function zoomTargets(board) {
  return [...(board?.children || [])].filter((child) => (
    child.classList?.contains("container-card") ||
    child.classList?.contains("packing-add-root-card") ||
    child.classList?.contains("comparison-root")
  ));
}

function scrollHostForBoard(board, documentRef) {
  const isolatedHost = board?.closest?.("[data-viewport-scroll-host]");
  if (documentRef?.body?.classList?.contains?.("isolated-viewport-scroll") && isolatedHost) return isolatedHost;
  return documentRef?.scrollingElement || documentRef?.documentElement || null;
}

function ensureZoomControl(documentRef) {
  let button = documentRef?.querySelector?.("#packingBoardZoomReset");
  if (!button && documentRef?.createElement && documentRef?.body?.appendChild) {
    button = documentRef.createElement("button");
    button.id = "packingBoardZoomReset";
    button.className = "ghost packing-board-zoom-reset";
    button.type = "button";
    button.hidden = true;
    documentRef.body.appendChild(button);
  }
  if (!button) return { button: null, panel: null, range: null };
  let panel = documentRef?.querySelector?.("#packingBoardZoomPanel");
  let range = documentRef?.querySelector?.("#packingBoardZoomRange");
  if (!panel && documentRef?.createElement && documentRef?.body?.appendChild) {
    const candidate = documentRef.createElement("div");
    if (candidate !== button && typeof candidate?.appendChild === "function") {
      panel = candidate;
      panel.id = "packingBoardZoomPanel";
      panel.className = "packing-board-zoom-panel";
      panel.hidden = true;
      range = documentRef.createElement("input");
      range.id = "packingBoardZoomRange";
      range.className = "packing-board-zoom-range";
      range.type = "range";
      range.min = String(PACKING_BOARD_ZOOM_MIN * 100);
      range.max = String(PACKING_BOARD_ZOOM_MAX * 100);
      range.step = "1";
      panel.appendChild(range);
      documentRef.body.appendChild(panel);
    }
  }
  return { button, panel, range };
}

export function packingBoardRetainedHorizontalGutter({
  currentGutter,
  currentScrollLeft,
  naturalMaxScrollLeft
} = {}) {
  const retained = Math.max(0, Number(currentGutter) || 0);
  const requiredAtCurrentPosition = Math.max(
    0,
    (Number(currentScrollLeft) || 0) - Math.max(0, Number(naturalMaxScrollLeft) || 0)
  );
  return Math.min(retained, requiredAtCurrentPosition);
}

export function packingBoardMissingAnchorGutter({
  actualMaxScrollLeft,
  desiredScrollLeft
} = {}) {
  return Math.max(
    0,
    (Number(desiredScrollLeft) || 0) - Math.max(0, Number(actualMaxScrollLeft) || 0)
  );
}

function notifyGeometryChanged(board, windowRef) {
  const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback());
  requestFrame(() => {
    const EventCtor = windowRef?.Event || globalThis.Event;
    if (EventCtor && typeof windowRef?.dispatchEvent === "function") {
      windowRef.dispatchEvent(new EventCtor("resize"));
    }
    if (EventCtor && typeof board?.dispatchEvent === "function") {
      board.dispatchEvent(new EventCtor("scroll"));
    }
  });
}

export function applyPackingBoardZoomToDragGhost(source, ghost, sourceRect) {
  const board = source?.closest?.(".board.packing-board-zoom-active");
  const zoom = board
    ? clampPackingBoardZoom(board.dataset?.packingBoardZoom, { max: PACKING_BOARD_ZOOM_ELASTIC_MAX })
    : 1;
  const rectWidth = Math.max(0, Number(sourceRect?.width) || 0);
  if (!ghost?.style) return zoom;
  ghost.style.width = `${rectWidth / zoom}px`;
  ghost.style.setProperty?.("--packing-board-drag-ghost-scale", String(zoom));
  ghost.style.removeProperty?.("scale");
  if (zoom === 1) {
    ghost.style.removeProperty?.("transform-origin");
  } else {
    ghost.style.transformOrigin = "top left";
  }
  return zoom;
}

export function bindPackingBoardZoom(board, {
  controlLabel = "Adjust packing board zoom",
  documentRef = document,
  resetLabel = "Reset packing board zoom",
  storage = globalThis.localStorage,
  storageKey = PACKING_BOARD_ZOOM_STORAGE_KEY,
  windowRef = window
} = {}) {
  activePackingBoardZoomController?.destroy?.();
  activePackingBoardZoomController = null;
  const targets = zoomTargets(board);
  if (!board || !targets.length) return null;

  const measureBaseColumnWidth = () => packingBoardUsableColumnWidth(
    targets[0]?.getBoundingClientRect?.()?.width
  );
  let baseColumnWidth = measureBaseColumnWidth();
  const computedBoardStyle = windowRef?.getComputedStyle?.(board);
  const baseGap = Math.max(0, Number.parseFloat(computedBoardStyle?.columnGap || computedBoardStyle?.gap) || 12);
  const basePaddingRight = Math.max(0, Number.parseFloat(computedBoardStyle?.paddingRight) || 0);
  board.dataset.packingBoardBasePaddingRight = String(basePaddingRight);
  const boardPaddingTop = Math.max(0, Number.parseFloat(computedBoardStyle?.paddingTop) || 0);
  const boardPaddingBottom = Math.max(0, Number.parseFloat(computedBoardStyle?.paddingBottom) || 0);
  const headerRow = board.previousElementSibling?.classList?.contains("packing-root-header-row")
    ? board.previousElementSibling
    : null;
  const computedHeaderStyle = headerRow ? windowRef?.getComputedStyle?.(headerRow) : null;
  const baseHeaderHeight = Math.max(1, Number.parseFloat(
    computedHeaderStyle?.getPropertyValue?.("--packing-root-header-cell-height")
  ) || 78);
  const { button: resetButton, panel: zoomPanel, range: zoomRange } = ensureZoomControl(documentRef);
  let zoomRangePointerActive = false;
  let zoomRangeGestureStartPercent = PACKING_BOARD_ZOOM_SNAP_PERCENT;
  let zoomRangeGestureStartedAt = 0;
  const desktopZoomControl = Boolean(
    zoomPanel &&
    zoomRange &&
    windowRef?.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches
  );
  const verticalScrollHost = scrollHostForBoard(board, documentRef);
  const gestureSurface = documentRef;
  let zoom = 1;
  let pinching = false;
  let startZoom = 1;
  let startDistance = 1;
  let pinchStartScrollLeft = 0;
  let pinchAnchorClientX = 0;
  let pinchAnchorContentX = 0;
  let pinchBoardClientLeft = 0;
  let pinchAnchorClientY = 0;
  let pinchAnchorContentY = 0;
  let pinchBoardDocumentTop = 0;
  let photoScrollPositions = new Map();
  let postPinchPanning = false;
  let postPinchPanActivated = false;
  let postPinchStartedAt = 0;
  let postPinchLastX = 0;
  let postPinchLastY = 0;
  let singleTouchAxis = "";
  let singleTouchStartX = 0;
  let singleTouchStartY = 0;
  let singleTouchStartScrollTop = 0;
  let singleTouchStartBoardScrollLeft = 0;
  let singleTouchLastX = 0;
  let singleTouchLastTime = 0;
  let singleTouchBoardVelocity = 0;
  let pagePanBoardScrollLeft = 0;
  let pagePanLastY = 0;
  let pagePanLastTime = 0;
  let pagePanVelocity = 0;
  let pageMomentumFrame = null;
  let boardMomentumFrame = null;
  let heightFrame = null;
  let geometrySettleFrame = null;
  let zoomSettleFrame = null;
  let zoomMomentumFrame = null;
  let zoomNeedsSettle = false;
  let pinchZoomLastTime = 0;
  let pinchZoomLastValue = 1;
  let pinchZoomVelocity = 0;
  let lastPinchCenterX = 0;
  let lastPinchCenterY = 0;
  let twoFingerMode = "";
  let gestureActive = false;
  let horizontalAnchorGutter = 0;
  let verticalClampFrame = null;
  let presentationTimer = null;
  let presentationZoomFrame = null;

  const frameNow = () => Number(windowRef?.performance?.now?.()) || Date.now();

  const naturalHorizontalMaximum = () => packingBoardHorizontalGeometry(board, {
    basePaddingRight,
    includeRetainedGutter: false
  }).maxScroll;

  const setHorizontalAnchorGutter = (value) => {
    const next = Math.max(0, Number(value) || 0);
    horizontalAnchorGutter = next > 0.5 ? next : 0;
    if (horizontalAnchorGutter) {
      board.dataset.packingBoardRetainedRightGutter = String(horizontalAnchorGutter);
      board.style.paddingRight = `${basePaddingRight + horizontalAnchorGutter}px`;
      return;
    }
    board.style.removeProperty("padding-right");
    delete board.dataset.packingBoardRetainedRightGutter;
  };

  const trimHorizontalAnchorGutter = () => {
    if (!horizontalAnchorGutter) return false;
    const previous = horizontalAnchorGutter;
    const actualNaturalMaxScrollLeft = Math.max(
      0,
      (Number(board.scrollWidth) || 0) -
        (Number(board.clientWidth) || 0) -
        horizontalAnchorGutter
    );
    setHorizontalAnchorGutter(packingBoardRetainedHorizontalGutter({
      currentGutter: horizontalAnchorGutter,
      currentScrollLeft: board.scrollLeft,
      naturalMaxScrollLeft: actualNaturalMaxScrollLeft
    }));
    return Math.abs(previous - horizontalAnchorGutter) > 0.5;
  };

  const horizontalMaximum = () => naturalHorizontalMaximum() + horizontalAnchorGutter;

  const clampBoardScrollLeft = (value) => Math.max(
    0,
    Math.min(
      horizontalMaximum(),
      Number(value) || 0
    )
  );

  const fitMaxZoom = () => packingBoardFitMaxZoom({
    boardWidth: Math.max(0, (Number(board.clientWidth) || 0) - basePaddingRight),
    columnWidth: baseColumnWidth
  });

  const elasticMaxZoom = () => Math.min(PACKING_BOARD_ZOOM_ELASTIC_MAX, fitMaxZoom() * 1.1);

  const verticalScrollMaximum = () => {
    if (!verticalScrollHost) return 0;
    const hostMaximum = Math.max(
      0,
      Number(verticalScrollHost.scrollHeight) - Number(verticalScrollHost.clientHeight)
    );
    if (Math.abs(zoom - 1) < 0.005) return hostMaximum;
    return packingBoardVisualMaxScrollTop({
      boardClientBottom: board.getBoundingClientRect?.()?.bottom,
      currentScrollTop: verticalScrollHost.scrollTop,
      hostMaxScrollTop: hostMaximum,
      scrollHostClientTop: verticalScrollHost.getBoundingClientRect?.()?.top,
      viewportHeight: verticalScrollHost.clientHeight
    });
  };

  const verticalViewportTop = () => {
    if (
      verticalScrollHost === documentRef?.scrollingElement ||
      verticalScrollHost === documentRef?.documentElement
    ) return 0;
    return Number(verticalScrollHost?.getBoundingClientRect?.()?.top) || 0;
  };

  const requestVerticalScrollClamp = () => {
    if (!verticalScrollHost || Math.abs(zoom - 1) < 0.005 || verticalClampFrame !== null) return;
    const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback());
    verticalClampFrame = requestFrame(() => {
      verticalClampFrame = null;
      const maxScrollTop = verticalScrollMaximum();
      if ((Number(verticalScrollHost.scrollTop) || 0) > maxScrollTop + 0.5) {
        verticalScrollHost.scrollTop = maxScrollTop;
      }
    });
  };

  const stopPageMomentum = () => {
    if (pageMomentumFrame === null) return;
    windowRef?.cancelAnimationFrame?.(pageMomentumFrame);
    pageMomentumFrame = null;
  };

  const stopBoardMomentum = () => {
    if (boardMomentumFrame === null) return;
    windowRef?.cancelAnimationFrame?.(boardMomentumFrame);
    boardMomentumFrame = null;
  };

  const stopZoomMomentum = () => {
    if (zoomMomentumFrame === null) return;
    windowRef?.cancelAnimationFrame?.(zoomMomentumFrame);
    zoomMomentumFrame = null;
  };

  const startBoardMomentum = () => {
    stopBoardMomentum();
    if (
      frameNow() - singleTouchLastTime > 100 ||
      Math.abs(singleTouchBoardVelocity) < 0.08
    ) return;
    let velocity = Math.max(-1.5, Math.min(1.5, singleTouchBoardVelocity));
    let previousTime = frameNow();
    const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback(frameNow()));
    const step = (time) => {
      const elapsed = Math.min(32, Math.max(1, Number(time) - previousTime));
      previousTime = Number(time) || frameNow();
      const maximum = horizontalMaximum();
      const current = Number(board.scrollLeft) || 0;
      const next = packingBoardMomentumScrollLeft({
        currentScrollLeft: current,
        elapsedMs: elapsed,
        maxScrollLeft: maximum,
        velocity
      });
      board.scrollLeft = next;
      velocity *= Math.pow(0.94, elapsed / 16);
      if (next <= 0 || next >= maximum || Math.abs(velocity) < 0.015) {
        boardMomentumFrame = null;
        return;
      }
      boardMomentumFrame = requestFrame(step);
    };
    boardMomentumFrame = requestFrame(step);
  };

  const beginPagePan = (clientY) => {
    pagePanLastY = Number(clientY) || 0;
    pagePanLastTime = frameNow();
    pagePanVelocity = 0;
    pagePanBoardScrollLeft = Number(board.scrollLeft) || 0;
  };

  const activatePagePan = () => {
    if (board.classList.contains("packing-board-page-panning")) return;
    board.classList.add("packing-board-page-panning");
    const PagePanEventCtor = windowRef?.Event || globalThis.Event;
    if (PagePanEventCtor) {
      board.dispatchEvent?.(new PagePanEventCtor("packing-board-page-pan-start", { bubbles: true }));
    }
  };

  const keepPagePanAxisLocked = () => {
    if (
      !packingBoardAllowsDiagonalPan(zoom) &&
      Math.abs((Number(board.scrollLeft) || 0) - pagePanBoardScrollLeft) > 0.5
    ) {
      board.scrollLeft = pagePanBoardScrollLeft;
    }
    restorePhotoScrollPositions();
  };

  const updatePagePanVelocity = (clientY) => {
    const now = frameNow();
    pagePanVelocity = packingBoardPagePanVelocity({
      currentClientY: clientY,
      elapsedMs: now - pagePanLastTime,
      previousClientY: pagePanLastY,
      previousVelocity: pagePanVelocity
    });
    pagePanLastY = Number(clientY) || 0;
    pagePanLastTime = now;
  };

  const updateBoardPanVelocity = (clientX) => {
    const now = frameNow();
    singleTouchBoardVelocity = packingBoardPanVelocity({
      currentClientCoordinate: clientX,
      elapsedMs: now - singleTouchLastTime,
      previousClientCoordinate: singleTouchLastX,
      previousVelocity: singleTouchBoardVelocity
    });
    singleTouchLastX = Number(clientX) || 0;
    singleTouchLastTime = now;
  };

  const startPageMomentum = () => {
    stopPageMomentum();
    if (
      !verticalScrollHost ||
      frameNow() - pagePanLastTime > 100 ||
      Math.abs(pagePanVelocity) < 0.08
    ) return;
    let velocity = Math.max(
      -PACKING_BOARD_PAN_MAX_VELOCITY,
      Math.min(PACKING_BOARD_PAN_MAX_VELOCITY, pagePanVelocity)
    );
    let previousTime = frameNow();
    const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback(frameNow()));
    const step = (time) => {
      const elapsed = Math.min(32, Math.max(1, Number(time) - previousTime));
      previousTime = Number(time) || frameNow();
      const maxScrollTop = verticalScrollMaximum();
      const currentScrollTop = Number(verticalScrollHost.scrollTop) || 0;
      const nextScrollTop = packingBoardPageMomentumScrollTop({
        currentScrollTop,
        elapsedMs: elapsed,
        maxScrollTop,
        velocity
      });
      verticalScrollHost.scrollTop = nextScrollTop;
      velocity *= Math.pow(0.94, elapsed / 16);
      const hitEdge = nextScrollTop <= 0 || nextScrollTop >= maxScrollTop;
      if (hitEdge || Math.abs(velocity) < 0.015) {
        pageMomentumFrame = null;
        return;
      }
      pageMomentumFrame = requestFrame(step);
    };
    pageMomentumFrame = requestFrame(step);
  };

  const capturePhotoScrollPositions = () => {
    photoScrollPositions = new Map(
      [...(board.querySelectorAll?.(".photo-gallery-track") || [])]
        .map((gallery) => [gallery, Number(gallery.scrollLeft) || 0])
    );
  };

  const restorePhotoScrollPositions = () => {
    photoScrollPositions.forEach((scrollLeft, gallery) => {
      if (Math.abs((Number(gallery?.scrollLeft) || 0) - scrollLeft) > 0.5) gallery.scrollLeft = scrollLeft;
    });
  };

  const syncBoardHeight = () => {
    heightFrame = null;
    if (board.dataset?.dragHeightLocked !== "true") {
      board.style.removeProperty("min-height");
    }
    if (Math.abs(zoom - 1) < 0.005) {
      board.style.removeProperty("height");
      return;
    }
    const contentHeight = targets.reduce((height, target) => (
      Math.max(height, Number(target?.offsetHeight) || 0)
    ), 0);
    const fixedScrollbar = documentRef?.querySelector?.("#kanbanScrollbar");
    const bottomClearance = fixedScrollbar?.classList?.contains?.("hidden") === false
      ? PACKING_BOARD_FIXED_SCROLLBAR_CLEARANCE
      : 0;
    board.style.height = `${packingBoardScaledHeight({
      bottomClearance,
      contentHeight,
      paddingBottom: boardPaddingBottom,
      paddingTop: boardPaddingTop,
      zoom
    })}px`;
  };

  const requestBoardHeightSync = () => {
    if (heightFrame !== null) return;
    const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback());
    heightFrame = requestFrame(syncBoardHeight);
  };

  const stopGeometrySettle = () => {
    if (geometrySettleFrame === null) return;
    windowRef?.cancelAnimationFrame?.(geometrySettleFrame);
    geometrySettleFrame = null;
  };

  const settleBoardGeometry = () => {
    stopGeometrySettle();
    trimHorizontalAnchorGutter();
    const maxScrollLeft = horizontalMaximum();
    if ((Number(board.scrollLeft) || 0) > maxScrollLeft + 0.5) {
      board.scrollLeft = maxScrollLeft;
    }
    const requestFrame = windowRef?.requestAnimationFrame;
    const clampVerticalScroll = () => {
      syncBoardHeight();
      if (!verticalScrollHost) return;
      const maxScrollTop = verticalScrollMaximum();
      if ((Number(verticalScrollHost.scrollTop) || 0) > maxScrollTop) {
        verticalScrollHost.scrollTop = maxScrollTop;
      }
    };
    if (typeof requestFrame !== "function") {
      clampVerticalScroll();
      return;
    }
    geometrySettleFrame = requestFrame(() => {
      geometrySettleFrame = requestFrame(() => {
        geometrySettleFrame = null;
        clampVerticalScroll();
        notifyGeometryChanged(board, windowRef);
      });
    });
  };

  const syncResetButton = () => {
    if (!resetButton) return;
    resetButton.textContent = `${Math.round(zoom * 100)}%`;
    resetButton.hidden = false;
    resetButton.setAttribute("aria-label", desktopZoomControl ? controlLabel : resetLabel);
    resetButton.title = desktopZoomControl ? controlLabel : resetLabel;
    resetButton.setAttribute("aria-expanded", String(Boolean(desktopZoomControl && zoomPanel && !zoomPanel.hidden)));
    if (desktopZoomControl) resetButton.setAttribute("aria-controls", "packingBoardZoomPanel");
    if (zoomRange) {
      zoomRange.min = String(PACKING_BOARD_ZOOM_MIN * 100);
      zoomRange.max = String(Math.round(fitMaxZoom() * 100));
      zoomRange.value = String(Math.round(zoom * 100));
      zoomRange.setAttribute?.("aria-label", controlLabel);
      zoomRange.setAttribute?.("aria-valuetext", `${Math.round(zoom * 100)}%`);
    }
  };

  const applyZoom = (nextZoom, anchor = null, {
    maxZoom = fitMaxZoom(),
    notify = true
  } = {}) => {
    const normalized = Math.round(clampPackingBoardZoom(nextZoom, { max: maxZoom }) * 1000) / 1000;
    const active = Math.abs(normalized - 1) >= 0.005;
    zoom = normalized;
    board.dataset.packingBoardZoom = String(normalized);
    board.style.setProperty("--packing-board-zoom", String(normalized));
    if (!baseColumnWidth) baseColumnWidth = measureBaseColumnWidth();
    if (baseColumnWidth) {
      board.style.setProperty("--packing-board-base-column-width", `${baseColumnWidth}px`);
    }
    if (active && !baseColumnWidth) {
      board.classList.remove("packing-board-zoom-active");
      board.style.removeProperty("grid-auto-columns");
      board.style.removeProperty("gap");
      board.style.removeProperty("height");
      headerRow?.classList?.remove?.("packing-board-zoom-active");
      syncResetButton();
      return normalized;
    }
    board.classList.toggle("packing-board-zoom-active", active);
    if (active) {
      board.style.gridAutoColumns = `${baseColumnWidth * normalized}px`;
      board.style.gap = `${baseGap * normalized}px`;
    } else {
      board.style.removeProperty("grid-auto-columns");
      board.style.removeProperty("gap");
    }
    if (!anchor?.preserveHorizontalPoint) trimHorizontalAnchorGutter();
    if (headerRow) {
      headerRow.style.setProperty("--packing-board-zoom", String(normalized));
      if (baseColumnWidth) {
        headerRow.style.setProperty("--packing-board-base-column-width", `${baseColumnWidth}px`);
      }
      headerRow.style.setProperty("--packing-root-header-base-cell-height", `${baseHeaderHeight}px`);
      headerRow.classList.toggle("packing-board-zoom-active", active);
      if (active) {
        headerRow.style.setProperty("--packing-root-header-cell-height", `${baseHeaderHeight * normalized}px`);
      } else {
        headerRow.style.removeProperty("--packing-root-header-cell-height");
      }
    }
    syncBoardHeight();
    requestBoardHeightSync();
    if (anchor?.preserveScrollProgress) {
      board.scrollLeft = packingBoardProportionalScrollLeft({
        nextMaxScrollLeft: naturalHorizontalMaximum(),
        startMaxScrollLeft: anchor.startMaxScrollLeft,
        startScrollLeft: anchor.startScrollLeft
      });
    }
    if (anchor?.preserveHorizontalPoint) {
      setHorizontalAnchorGutter(0);
      const desiredScrollLeft = packingBoardAnchoredScrollLeft({
        anchorClientX: anchor.anchorClientX,
        anchorContentX: anchor.anchorContentX,
        boardClientLeft: anchor.boardClientLeft,
        maxScrollLeft: Number.POSITIVE_INFINITY,
        zoom: normalized
      });
      const naturalMaxScrollLeft = naturalHorizontalMaximum();
      setHorizontalAnchorGutter(Math.max(0, desiredScrollLeft - naturalMaxScrollLeft));
      const actualMaxScrollLeft = Math.max(
        0,
        (Number(board.scrollWidth) || 0) - (Number(board.clientWidth) || 0)
      );
      const missingAnchorGutter = packingBoardMissingAnchorGutter({
        actualMaxScrollLeft,
        desiredScrollLeft
      });
      if (missingAnchorGutter > 0.5) {
        setHorizontalAnchorGutter(horizontalAnchorGutter + missingAnchorGutter);
      }
      board.scrollLeft = packingBoardAnchoredScrollLeft({
        anchorClientX: anchor.anchorClientX,
        anchorContentX: anchor.anchorContentX,
        boardClientLeft: anchor.boardClientLeft,
        maxScrollLeft: horizontalMaximum(),
        zoom: normalized
      });
    }
    if (!anchor?.preserveHorizontalPoint && !anchor?.preserveScrollProgress) {
      board.scrollLeft = clampBoardScrollLeft(board.scrollLeft);
    }
    if (anchor?.preserveVerticalPoint && verticalScrollHost) {
      const nextScrollTop = packingBoardAnchoredPageScrollTop({
        anchorClientY: anchor.anchorClientY,
        anchorContentY: anchor.anchorContentY,
        boardDocumentTop: anchor.boardDocumentTop,
        maxScrollTop: verticalScrollMaximum(),
        zoom: normalized
      });
      if (Math.abs((Number(verticalScrollHost.scrollTop) || 0) - nextScrollTop) > 0.5) {
        verticalScrollHost.scrollTop = nextScrollTop;
      }
    }
    syncResetButton();
    requestVerticalScrollClamp();
    if (notify) notifyGeometryChanged(board, windowRef);
    return normalized;
  };

  const stopZoomSettle = () => {
    if (zoomSettleFrame === null) return;
    windowRef?.cancelAnimationFrame?.(zoomSettleFrame);
    zoomSettleFrame = null;
  };

  const currentPinchAnchor = () => ({
    preserveHorizontalPoint: true,
    preserveVerticalPoint: true,
    anchorClientX: lastPinchCenterX || pinchAnchorClientX,
    anchorContentX: pinchAnchorContentX,
    anchorClientY: lastPinchCenterY || pinchAnchorClientY,
    anchorContentY: pinchAnchorContentY,
    boardClientLeft: pinchBoardClientLeft,
    boardDocumentTop: pinchBoardDocumentTop
  });

  const settleZoomToFit = () => {
    stopZoomMomentum();
    stopZoomSettle();
    zoomNeedsSettle = false;
    const maximum = fitMaxZoom();
    if (zoom <= maximum + 0.001) {
      saveZoom(storage, storageKey, zoom, maximum);
      settleBoardGeometry();
      return;
    }
    const startValue = zoom;
    const startTime = frameNow();
    const duration = 220;
    const requestFrame = windowRef?.requestAnimationFrame;
    if (typeof requestFrame !== "function") {
      const finalZoom = applyZoom(maximum, currentPinchAnchor(), { maxZoom: maximum });
      saveZoom(storage, storageKey, finalZoom, maximum);
      settleBoardGeometry();
      return;
    }
    const step = (time) => {
      const progress = Math.max(0, Math.min(1, (Number(time) - startTime) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextZoom = startValue + (maximum - startValue) * eased;
      applyZoom(nextZoom, currentPinchAnchor(), {
        maxZoom: elasticMaxZoom(),
        notify: false
      });
      if (progress < 1) {
        zoomSettleFrame = requestFrame(step);
        return;
      }
      zoomSettleFrame = null;
      const finalZoom = applyZoom(maximum, currentPinchAnchor(), { maxZoom: maximum });
      saveZoom(storage, storageKey, finalZoom, maximum);
      settleBoardGeometry();
    };
    zoomSettleFrame = requestFrame(step);
  };

  const startZoomMomentum = () => {
    stopZoomMomentum();
    stopZoomSettle();
    if (
      frameNow() - pinchZoomLastTime > 100 ||
      Math.abs(pinchZoomVelocity) < 0.00018
    ) return false;
    const anchor = currentPinchAnchor();
    let velocity = Math.max(-0.0032, Math.min(0.0032, pinchZoomVelocity));
    let previousTime = frameNow();
    const requestFrame = windowRef?.requestAnimationFrame;
    if (typeof requestFrame !== "function") return false;
    const finish = () => {
      zoomMomentumFrame = null;
      zoomNeedsSettle = zoom > fitMaxZoom() + 0.001;
      if (zoomNeedsSettle) settleZoomToFit();
      else {
        saveZoom(storage, storageKey, zoom, fitMaxZoom());
        settleBoardGeometry();
      }
    };
    const step = (time) => {
      const elapsed = Math.min(32, Math.max(1, Number(time) - previousTime));
      previousTime = Number(time) || frameNow();
      const previousZoom = zoom;
      applyZoom(packingBoardZoomMomentumValue({
        currentZoom: zoom,
        elapsedMs: elapsed,
        maxZoom: elasticMaxZoom(),
        velocity
      }), anchor, { maxZoom: elasticMaxZoom(), notify: false });
      velocity *= Math.pow(0.86, elapsed / 16);
      const hitLimit = Math.abs(zoom - previousZoom) < 0.0005;
      if (hitLimit || Math.abs(velocity) < 0.00004) {
        finish();
        return;
      }
      zoomMomentumFrame = requestFrame(step);
    };
    zoomMomentumFrame = requestFrame(step);
    return true;
  };

  const isNativeGestureInsideBoard = (event) => {
    if (packingBoardGestureTargetsOpenDialog(event, { documentRef })) return false;
    if (gestureActive) return true;
    if (board.contains?.(event?.target)) return true;
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const rect = board.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const preventNativeBoardZoom = (event) => {
    if (!isNativeGestureInsideBoard(event)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event?.type === "gesturestart") {
      const PinchEventCtor = windowRef?.Event || globalThis.Event;
      if (PinchEventCtor) {
        board.dispatchEvent?.(new PinchEventCtor("packing-board-pinch-start", { bubbles: true }));
      }
    }
  };

  const onWheel = (event) => {
    if (!isNativeGestureInsideBoard(event)) return;
    if (!event?.ctrlKey) {
      if (
        Math.abs(zoom - 1) < 0.005 ||
        !verticalScrollHost ||
        event?.shiftKey
      ) return;
      const deltaX = Number(event?.deltaX) || 0;
      const deltaY = Number(event?.deltaY) || 0;
      if (!deltaY || Math.abs(deltaY) < Math.abs(deltaX)) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      stopPageMomentum();
      const nextScrollTop = Math.max(0, Math.min(
        verticalScrollMaximum(),
        (Number(verticalScrollHost.scrollTop) || 0) + packingBoardWheelPageDelta({
          deltaMode: event.deltaMode,
          deltaY,
          viewportHeight: verticalScrollHost.clientHeight
        })
      ));
      verticalScrollHost.scrollTop = nextScrollTop;
      return;
    }
    const boardRect = board.getBoundingClientRect?.();
    if (!boardRect) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    stopPresentation();
    stopPageMomentum();
    stopBoardMomentum();
    stopZoomMomentum();
    stopZoomSettle();
    stopGeometrySettle();
    if (!baseColumnWidth) baseColumnWidth = measureBaseColumnWidth();
    const pageScrollTop = Number(verticalScrollHost?.scrollTop) || 0;
    const anchorClientX = Number(event.clientX) || Number(boardRect.left);
    const anchorClientY = Number(event.clientY) || Number(boardRect.top);
    const nextZoom = packingBoardWheelZoom(zoom, event.deltaY, { maxZoom: fitMaxZoom() });
    const appliedZoom = applyZoom(nextZoom, {
      preserveHorizontalPoint: true,
      preserveVerticalPoint: true,
      anchorClientX,
      anchorContentX: ((Number(board.scrollLeft) || 0) + anchorClientX - Number(boardRect.left)) / zoom,
      anchorClientY,
      anchorContentY: (anchorClientY - Number(boardRect.top)) / zoom,
      boardClientLeft: Number(boardRect.left) || 0,
      boardDocumentTop: Number(boardRect.top) + pageScrollTop
    });
    saveZoom(storage, storageKey, appliedZoom, fitMaxZoom());
    settleBoardGeometry();
  };

  const onTouchStart = (event) => {
    if (packingBoardGestureTargetsOpenDialog(event, { documentRef })) return;
    if (packingBoardGestureTargetsFixedScrollbar(event, { documentRef })) return;
    stopPresentation();
    stopPageMomentum();
    stopBoardMomentum();
    stopZoomMomentum();
    stopZoomSettle();
    stopGeometrySettle();
    const pair = touchPair(event.touches);
    const firstTouch = event?.touches?.[0] || null;
    const boardRect = board.getBoundingClientRect();
    const gestureX = Number(pair?.centerX ?? firstTouch?.clientX);
    const gestureY = Number(pair?.centerY ?? firstTouch?.clientY);
    const startsInBoardRegion = (
      Number.isFinite(gestureX) &&
      Number.isFinite(gestureY) &&
      Number(boardRect.width) >= 48 &&
      gestureX >= Number(boardRect.left) &&
      gestureX <= Number(boardRect.right) &&
      gestureY >= Number(boardRect.top)
    );
    if (!gestureActive && !startsInBoardRegion) return;
    if (!pair) {
      if (Number(event?.touches?.length || 0) === 1) {
        gestureActive = true;
        postPinchPanning = false;
        postPinchPanActivated = false;
        postPinchStartedAt = 0;
        const touch = event.touches[0];
        singleTouchAxis = "";
        singleTouchStartX = Number(touch?.clientX) || 0;
        singleTouchStartY = Number(touch?.clientY) || 0;
        singleTouchStartScrollTop = Number(verticalScrollHost?.scrollTop) || 0;
        singleTouchStartBoardScrollLeft = Number(board.scrollLeft) || 0;
        singleTouchLastX = singleTouchStartX;
        singleTouchLastTime = frameNow();
        singleTouchBoardVelocity = 0;
        beginPagePan(touch?.clientY);
        capturePhotoScrollPositions();
      }
      return;
    }
    if (!baseColumnWidth) applyZoom(zoom, null, { notify: false });
    pinching = true;
    twoFingerMode = "";
    startZoom = zoom;
    pinchZoomLastValue = zoom;
    pinchZoomLastTime = frameNow();
    pinchZoomVelocity = 0;
    startDistance = pair.distance;
    pinchStartScrollLeft = Number(board.scrollLeft) || 0;
    board.scrollTo?.({ left: pinchStartScrollLeft, behavior: "auto" });
    gestureActive = true;
    pinchAnchorClientX = pair.centerX;
    lastPinchCenterX = pair.centerX;
    pinchBoardClientLeft = Number(boardRect.left) || 0;
    const visibleTargetRight = targets.reduce((right, target) => (
      Math.max(right, Number(target?.getBoundingClientRect?.()?.right) || pinchBoardClientLeft)
    ), pinchBoardClientLeft);
    pinchAnchorContentX = (
      pinchStartScrollLeft + Math.min(
        pinchAnchorClientX - pinchBoardClientLeft,
        visibleTargetRight - pinchBoardClientLeft
      )
    ) / startZoom;
    const pageScrollTop = Number(verticalScrollHost?.scrollTop) || 0;
    pinchAnchorClientY = pair.centerY;
    lastPinchCenterY = pair.centerY;
    pinchAnchorContentY = (pair.centerY - Number(boardRect.top)) / startZoom;
    pinchBoardDocumentTop = Number(boardRect.top) + pageScrollTop;
    if (!photoScrollPositions.size) capturePhotoScrollPositions();
    const PinchEventCtor = windowRef?.Event || globalThis.Event;
    if (PinchEventCtor) board.dispatchEvent?.(new PinchEventCtor("packing-board-pinch-start", { bubbles: true }));
    restorePhotoScrollPositions();
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const onTouchMove = (event) => {
    if (packingBoardGestureTargetsOpenDialog(event, { documentRef })) return;
    if (!gestureActive) return;
    // A deliberate long-press drag owns the remaining one-finger gesture.
    // Adding a second finger still reaches onTouchStart, which cancels the
    // drag before starting a pinch.
    if (documentRef?.body?.classList?.contains?.("dragging-ui")) return;
    if (!pinching) {
      const remainingTouch = event?.touches?.length === 1 ? event.touches[0] : null;
      if (postPinchPanning && remainingTouch && verticalScrollHost) {
        activatePagePan();
        const currentX = Number(remainingTouch.clientX) || 0;
        const currentY = Number(remainingTouch.clientY) || 0;
        if (!packingBoardPostPinchPanReady(frameNow() - postPinchStartedAt)) {
          postPinchLastX = currentX;
          postPinchLastY = currentY;
          beginPagePan(currentY);
          singleTouchLastX = currentX;
          singleTouchLastTime = frameNow();
          singleTouchBoardVelocity = 0;
          event.preventDefault?.();
          event.stopPropagation?.();
          return;
        }
        postPinchPanActivated = true;
        if (packingBoardAllowsDiagonalPan(zoom)) {
          updateBoardPanVelocity(currentX);
          board.scrollLeft = clampBoardScrollLeft(
            (Number(board.scrollLeft) || 0) + postPinchLastX - currentX
          );
          postPinchLastX = currentX;
          singleTouchAxis = "diagonal";
        }
        updatePagePanVelocity(remainingTouch.clientY);
        const nextScrollTop = Math.min(verticalScrollMaximum(), packingBoardPagePanScrollTop({
          currentClientY: remainingTouch.clientY,
          currentScrollTop: verticalScrollHost.scrollTop,
          previousClientY: postPinchLastY
        }));
        postPinchLastY = currentY;
        if (Math.abs((Number(verticalScrollHost.scrollTop) || 0) - nextScrollTop) > 0.5) {
          verticalScrollHost.scrollTop = nextScrollTop;
        }
        keepPagePanAxisLocked();
        event.preventDefault?.();
        event.stopPropagation?.();
      } else if (remainingTouch && verticalScrollHost) {
        const currentX = Number(remainingTouch.clientX) || 0;
        const currentY = Number(remainingTouch.clientY) || 0;
        const deltaX = currentX - singleTouchStartX;
        const deltaY = currentY - singleTouchStartY;
        if (packingBoardAllowsDiagonalPan(zoom)) {
          if (!singleTouchAxis && Math.hypot(deltaX, deltaY) >= 7) {
            singleTouchAxis = "diagonal";
            activatePagePan();
          }
          if (singleTouchAxis === "diagonal") {
            updateBoardPanVelocity(currentX);
            updatePagePanVelocity(currentY);
            board.scrollLeft = clampBoardScrollLeft(singleTouchStartBoardScrollLeft - deltaX);
            const nextScrollTop = Math.min(verticalScrollMaximum(), packingBoardPagePanScrollTop({
              currentClientY: currentY,
              currentScrollTop: singleTouchStartScrollTop,
              previousClientY: singleTouchStartY
            }));
            if (Math.abs((Number(verticalScrollHost.scrollTop) || 0) - nextScrollTop) > 0.5) {
              verticalScrollHost.scrollTop = nextScrollTop;
            }
            restorePhotoScrollPositions();
            event.preventDefault?.();
            event.stopPropagation?.();
          }
          return;
        }
        if (!singleTouchAxis) {
          singleTouchAxis = packingBoardZoomedTouchScrollAxis(
            deltaX,
            deltaY
          );
        }
        if (singleTouchAxis === "horizontal" && Math.abs(zoom - 1) >= 0.005) {
          updateBoardPanVelocity(currentX);
          board.scrollLeft = clampBoardScrollLeft(
            singleTouchStartBoardScrollLeft - deltaX
          );
          restorePhotoScrollPositions();
          event.preventDefault?.();
          event.stopPropagation?.();
        } else if (
          singleTouchAxis === "vertical" &&
          Math.abs(zoom - 1) >= 0.005
        ) {
          activatePagePan();
          updatePagePanVelocity(currentY);
          const nextScrollTop = Math.min(verticalScrollMaximum(), packingBoardPagePanScrollTop({
            currentClientY: currentY,
            currentScrollTop: singleTouchStartScrollTop,
            previousClientY: singleTouchStartY
          }));
          if (Math.abs((Number(verticalScrollHost.scrollTop) || 0) - nextScrollTop) > 0.5) {
            verticalScrollHost.scrollTop = nextScrollTop;
          }
          keepPagePanAxisLocked();
          event.preventDefault?.();
          event.stopPropagation?.();
        }
      }
      return;
    }
    const pair = touchPair(event.touches);
    if (!pair) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!twoFingerMode) {
      twoFingerMode = packingBoardTwoFingerMode({
        currentDistance: pair.distance,
        startDistance
      });
      if (!twoFingerMode) {
        restorePhotoScrollPositions();
        return;
      }
      board.classList.add("packing-board-zooming");
    }
    lastPinchCenterX = pair.centerX;
    lastPinchCenterY = pair.centerY;
    const nextZoom = packingBoardPinchZoom(startZoom, startDistance, pair.distance, {
      elastic: true,
      maxZoom: fitMaxZoom()
    });
    const appliedZoom = applyZoom(nextZoom, {
      preserveHorizontalPoint: true,
      preserveVerticalPoint: true,
      anchorClientX: pair.centerX,
      anchorContentX: pinchAnchorContentX,
      anchorClientY: pair.centerY,
      anchorContentY: pinchAnchorContentY,
      boardClientLeft: pinchBoardClientLeft,
      boardDocumentTop: pinchBoardDocumentTop,
    }, { maxZoom: elasticMaxZoom() });
    const zoomSampleTime = frameNow();
    const zoomSampleElapsed = Math.max(1, zoomSampleTime - pinchZoomLastTime);
    const zoomSampleVelocity = (appliedZoom - pinchZoomLastValue) / zoomSampleElapsed;
    pinchZoomVelocity = pinchZoomVelocity
      ? pinchZoomVelocity * 0.3 + zoomSampleVelocity * 0.7
      : zoomSampleVelocity;
    pinchZoomLastValue = appliedZoom;
    pinchZoomLastTime = zoomSampleTime;
    restorePhotoScrollPositions();
  };

  const finishPinch = (event) => {
    const remainingTouchCount = Number(event?.touches?.length || 0);
    if (!pinching) {
      if (!remainingTouchCount) {
        const continueZoomMomentum = postPinchPanning && !postPinchPanActivated && event?.type !== "touchcancel";
        if (singleTouchAxis === "diagonal") {
          event.preventDefault?.();
          event.stopPropagation?.();
        }
        if (event?.type === "touchcancel") stopPageMomentum();
        else {
          if (postPinchPanning || singleTouchAxis === "vertical" || singleTouchAxis === "diagonal") {
            startPageMomentum();
          }
          if (singleTouchAxis === "diagonal" || (singleTouchAxis === "horizontal" && Math.abs(zoom - 1) >= 0.005)) {
            startBoardMomentum();
          }
        }
        postPinchPanning = false;
        postPinchPanActivated = false;
        postPinchStartedAt = 0;
        singleTouchAxis = "";
        board.classList.remove("packing-board-page-panning");
        gestureActive = false;
        if (!continueZoomMomentum || !startZoomMomentum()) {
          if (zoomNeedsSettle) settleZoomToFit();
          else settleBoardGeometry();
        }
        singleTouchBoardVelocity = 0;
      }
      return;
    }
    if (remainingTouchCount >= 2) return;
    pinching = false;
    const PinchEndEventCtor = windowRef?.Event || globalThis.Event;
    if (PinchEndEventCtor) {
      board.dispatchEvent?.(new PinchEndEventCtor("packing-board-pinch-end", { bubbles: true }));
    }
    restorePhotoScrollPositions();
    photoScrollPositions.clear();
    board.classList.remove("packing-board-zooming");
    board.classList.remove("packing-board-page-panning");
    const remainingTouch = remainingTouchCount === 1 ? event.touches[0] : null;
    postPinchPanning = Boolean(remainingTouch && event?.type !== "touchcancel" && verticalScrollHost);
    postPinchPanActivated = false;
    postPinchStartedAt = postPinchPanning ? frameNow() : 0;
    gestureActive = Boolean(remainingTouch);
    postPinchLastX = Number(remainingTouch?.clientX) || 0;
    postPinchLastY = Number(remainingTouch?.clientY) || 0;
    if (postPinchPanning) {
      beginPagePan(remainingTouch?.clientY);
      singleTouchLastX = postPinchLastX;
      singleTouchLastTime = frameNow();
      singleTouchBoardVelocity = 0;
    }
    zoomNeedsSettle = zoom > fitMaxZoom() + 0.001;
    if (!remainingTouch && event?.type !== "touchcancel" && startZoomMomentum()) {
      // The fixed pinch anchor keeps scale inertia separate from panning.
    } else if (!remainingTouch) settleZoomToFit();
    else if (!zoomNeedsSettle) saveZoom(storage, storageKey, zoom, fitMaxZoom());
    notifyGeometryChanged(board, windowRef);
    twoFingerMode = "";
  };

  const resetZoom = () => {
    stopZoomMomentum();
    stopZoomSettle();
    stopGeometrySettle();
    zoomNeedsSettle = false;
    const startScrollLeft = Number(board.scrollLeft) || 0;
    const startMaxScrollLeft = naturalHorizontalMaximum();
    applyZoom(1, {
      preserveScrollProgress: true,
      startMaxScrollLeft,
      startScrollLeft
    });
    saveZoom(storage, storageKey, 1, fitMaxZoom());
    settleBoardGeometry();
  };

  const closeZoomPanel = () => {
    if (!zoomPanel || zoomPanel.hidden) return;
    zoomPanel.hidden = true;
    syncResetButton();
  };

  const onZoomButtonClick = () => {
    if (!desktopZoomControl) {
      resetZoom();
      return;
    }
    zoomPanel.hidden = !zoomPanel.hidden;
    syncResetButton();
    if (!zoomPanel.hidden) zoomRange.focus?.({ preventScroll: true });
  };

  const onZoomRangeInput = () => {
    stopZoomMomentum();
    stopZoomSettle();
    stopGeometrySettle();
    const startScrollLeft = Number(board.scrollLeft) || 0;
    const startMaxScrollLeft = naturalHorizontalMaximum();
    const rawPercent = Number(zoomRange?.value);
    const adjustedPercent = packingBoardSliderZoomPercent(rawPercent, {
      pointerActive: zoomRangePointerActive,
      gestureStartPercent: zoomRangeGestureStartPercent,
      elapsedMs: zoomRangePointerActive
        ? Math.max(1, (Number(windowRef?.performance?.now?.()) || Date.now()) - zoomRangeGestureStartedAt)
        : Number.POSITIVE_INFINITY
    });
    applyZoom(adjustedPercent / 100, {
      preserveScrollProgress: true,
      startMaxScrollLeft,
      startScrollLeft
    });
    saveZoom(storage, storageKey, zoom, fitMaxZoom());
  };

  const onZoomRangeChange = () => settleBoardGeometry();

  const onZoomRangePointerDown = () => {
    zoomRangePointerActive = true;
    zoomRangeGestureStartPercent = Number(zoomRange?.value) || PACKING_BOARD_ZOOM_SNAP_PERCENT;
    zoomRangeGestureStartedAt = Number(windowRef?.performance?.now?.()) || Date.now();
  };

  const onZoomRangePointerEnd = () => {
    zoomRangePointerActive = false;
  };

  const onZoomControlPointerDown = (event) => {
    if (!desktopZoomControl || zoomPanel?.hidden) return;
    if (event?.target === resetButton || zoomPanel?.contains?.(event?.target)) return;
    closeZoomPanel();
  };

  const onZoomControlKeyDown = (event) => {
    if (event?.key !== "Escape" || zoomPanel?.hidden) return;
    closeZoomPanel();
    resetButton?.focus?.({ preventScroll: true });
  };

  const onBoardScroll = () => {
    if (trimHorizontalAnchorGutter()) notifyGeometryChanged(board, windowRef);
  };

  const stopPresentation = () => {
    if (presentationTimer !== null) {
      (windowRef?.clearTimeout || globalThis.clearTimeout)?.(presentationTimer);
      presentationTimer = null;
    }
    if (presentationZoomFrame !== null) {
      windowRef?.cancelAnimationFrame?.(presentationZoomFrame);
      presentationZoomFrame = null;
    }
  };

  const presentElement = (element, {
    detailDelayMs = 760,
    durationMs = 560,
    scrollSettleMs = 360
  } = {}) => {
    if (!element || !board.contains?.(element)) return false;
    stopPresentation();
    stopZoomMomentum();
    stopZoomSettle();
    stopGeometrySettle();
    stopPageMomentum();
    stopBoardMomentum();
    if (!baseColumnWidth) baseColumnWidth = measureBaseColumnWidth();
    const zooms = packingBoardPresentationZooms();
    applyZoom(zooms.overview, null, { notify: false });
    board.scrollLeft = 0;
    notifyGeometryChanged(board, windowRef);

    const reducedMotion = Boolean(windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const setTimer = windowRef?.setTimeout || globalThis.setTimeout;
    const requestFrame = windowRef?.requestAnimationFrame || ((callback) => callback(frameNow()));
    const beginDetail = () => {
      presentationTimer = null;
      element.scrollIntoView?.({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "center"
      });
      presentationTimer = setTimer(() => {
        presentationTimer = null;
        const boardRect = board.getBoundingClientRect?.();
        const elementRect = element.getBoundingClientRect?.();
        if (!boardRect || !elementRect) return;
        const startValue = zoom;
        const targetValue = zooms.detail;
        const targetClientX = Number(elementRect.left) + Number(elementRect.width) / 2;
        const targetClientY = Number(elementRect.top) + Number(elementRect.height) / 2;
        const anchorClientX = Number(boardRect.left) + Number(board.clientWidth) / 2;
        const anchorClientY = verticalViewportTop() + Number(verticalScrollHost?.clientHeight) / 2;
        const pageScrollTop = Number(verticalScrollHost?.scrollTop) || 0;
        const anchor = {
          preserveHorizontalPoint: true,
          preserveVerticalPoint: true,
          anchorClientX,
          anchorContentX: ((Number(board.scrollLeft) || 0) + targetClientX - Number(boardRect.left)) / startValue,
          anchorClientY,
          anchorContentY: (targetClientY - Number(boardRect.top)) / startValue,
          boardClientLeft: Number(boardRect.left) || 0,
          boardDocumentTop: Number(boardRect.top) + pageScrollTop
        };
        const centerTarget = () => {
          const currentBoardRect = board.getBoundingClientRect?.();
          const currentElementRect = element.getBoundingClientRect?.();
          if (!currentBoardRect || !currentElementRect) return;
          const elementCenterX = Number(currentElementRect.left) + Number(currentElementRect.width) / 2;
          const boardCenterX = Number(currentBoardRect.left) + Number(board.clientWidth) / 2;
          board.scrollLeft = packingBoardCenteredScrollPosition({
            currentScroll: board.scrollLeft,
            maxScroll: naturalHorizontalMaximum(),
            targetClientCenter: elementCenterX,
            viewportClientCenter: boardCenterX
          });
          if (!verticalScrollHost) return;
          const elementCenterY = Number(currentElementRect.top) + Number(currentElementRect.height) / 2;
          const viewportCenterY = verticalViewportTop() + Number(verticalScrollHost.clientHeight) / 2;
          verticalScrollHost.scrollTop = packingBoardCenteredScrollPosition({
            currentScroll: verticalScrollHost.scrollTop,
            maxScroll: verticalScrollMaximum(),
            targetClientCenter: elementCenterY,
            viewportClientCenter: viewportCenterY
          });
        };
        if (reducedMotion || durationMs <= 0 || Math.abs(targetValue - startValue) < 0.005) {
          applyZoom(targetValue, anchor, { maxZoom: PACKING_BOARD_ZOOM_MAX });
          centerTarget();
          settleBoardGeometry();
          return;
        }
        const startedAt = frameNow();
        const step = (time) => {
          const progress = Math.max(0, Math.min(1, (Number(time) - startedAt) / durationMs));
          const eased = 1 - Math.pow(1 - progress, 3);
          applyZoom(startValue + (targetValue - startValue) * eased, anchor, {
            maxZoom: PACKING_BOARD_ZOOM_MAX,
            notify: progress >= 1
          });
          if (progress < 1) {
            presentationZoomFrame = requestFrame(step);
            return;
          }
          presentationZoomFrame = null;
          centerTarget();
          settleBoardGeometry();
          requestFrame(centerTarget);
        };
        presentationZoomFrame = requestFrame(step);
      }, reducedMotion ? 0 : Math.max(0, Number(scrollSettleMs) || 0));
    };
    presentationTimer = setTimer(beginDetail, reducedMotion ? 0 : Math.max(0, Number(detailDelayMs) || 0));
    return true;
  };

  const onTargetResize = () => {
    if (!baseColumnWidth && measureBaseColumnWidth()) {
      applyZoom(zoom);
      return;
    }
    if (!pinching && zoom > fitMaxZoom() + 0.001) {
      settleZoomToFit();
      return;
    }
    requestBoardHeightSync();
  };
  const ResizeObserverCtor = windowRef?.ResizeObserver || globalThis.ResizeObserver;
  const resizeObserver = typeof ResizeObserverCtor === "function"
    ? new ResizeObserverCtor(onTargetResize)
    : null;
  targets.forEach((target) => resizeObserver?.observe?.(target));

  const destroy = () => {
    stopPresentation();
    gestureSurface?.removeEventListener?.("touchstart", onTouchStart, true);
    gestureSurface?.removeEventListener?.("touchmove", onTouchMove, true);
    gestureSurface?.removeEventListener?.("touchend", finishPinch, true);
    gestureSurface?.removeEventListener?.("touchcancel", finishPinch, true);
    gestureSurface?.removeEventListener?.("gesturestart", preventNativeBoardZoom, true);
    gestureSurface?.removeEventListener?.("gesturechange", preventNativeBoardZoom, true);
    gestureSurface?.removeEventListener?.("gestureend", preventNativeBoardZoom, true);
    gestureSurface?.removeEventListener?.("wheel", onWheel, true);
    verticalScrollHost?.removeEventListener?.("scroll", requestVerticalScrollClamp);
    board.removeEventListener?.("scroll", onBoardScroll);
    resetButton?.removeEventListener?.("click", onZoomButtonClick);
    zoomRange?.removeEventListener?.("input", onZoomRangeInput);
    zoomRange?.removeEventListener?.("change", onZoomRangeChange);
    zoomRange?.removeEventListener?.("pointerdown", onZoomRangePointerDown);
    documentRef?.removeEventListener?.("pointerup", onZoomRangePointerEnd, true);
    documentRef?.removeEventListener?.("pointercancel", onZoomRangePointerEnd, true);
    documentRef?.removeEventListener?.("pointerdown", onZoomControlPointerDown, true);
    documentRef?.removeEventListener?.("keydown", onZoomControlKeyDown, true);
    resizeObserver?.disconnect?.();
    if (heightFrame !== null) windowRef?.cancelAnimationFrame?.(heightFrame);
    if (verticalClampFrame !== null) windowRef?.cancelAnimationFrame?.(verticalClampFrame);
    stopZoomSettle();
    stopZoomMomentum();
    stopGeometrySettle();
    stopPageMomentum();
    stopBoardMomentum();
    heightFrame = null;
    verticalClampFrame = null;
    board.classList.remove("packing-board-zooming");
    board.classList.remove("packing-board-page-panning");
    setHorizontalAnchorGutter(0);
    delete board.dataset.packingBoardBasePaddingRight;
    postPinchPanning = false;
    postPinchPanActivated = false;
    postPinchStartedAt = 0;
    zoomNeedsSettle = false;
    singleTouchAxis = "";
    singleTouchBoardVelocity = 0;
    twoFingerMode = "";
    if (resetButton) resetButton.hidden = true;
    if (zoomPanel) zoomPanel.hidden = true;
  };

  gestureSurface?.addEventListener?.("touchstart", onTouchStart, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("touchmove", onTouchMove, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("touchend", finishPinch, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("touchcancel", finishPinch, { capture: true, passive: true });
  gestureSurface?.addEventListener?.("gesturestart", preventNativeBoardZoom, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("gesturechange", preventNativeBoardZoom, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("gestureend", preventNativeBoardZoom, { capture: true, passive: false });
  gestureSurface?.addEventListener?.("wheel", onWheel, { capture: true, passive: false });
  verticalScrollHost?.addEventListener?.("scroll", requestVerticalScrollClamp, { passive: true });
  board.addEventListener?.("scroll", onBoardScroll, { passive: true });
  resetButton?.addEventListener?.("click", onZoomButtonClick);
  zoomRange?.addEventListener?.("input", onZoomRangeInput);
  zoomRange?.addEventListener?.("change", onZoomRangeChange);
  zoomRange?.addEventListener?.("pointerdown", onZoomRangePointerDown);
  documentRef?.addEventListener?.("pointerup", onZoomRangePointerEnd, true);
  documentRef?.addEventListener?.("pointercancel", onZoomRangePointerEnd, true);
  documentRef?.addEventListener?.("pointerdown", onZoomControlPointerDown, true);
  documentRef?.addEventListener?.("keydown", onZoomControlKeyDown, true);
  const initialMaximum = fitMaxZoom();
  applyZoom(packingBoardStoredZoom(storage, storageKey, initialMaximum), null, {
    maxZoom: initialMaximum,
    notify: false
  });

  const controller = {
    applyZoom,
    board,
    destroy,
    getZoom: () => zoom,
    presentElement,
    resetZoom
  };
  activePackingBoardZoomController = controller;
  return controller;
}
