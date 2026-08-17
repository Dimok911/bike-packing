const TOP_OVERLAY_SELECTOR = ".controls, .tabs-row, .packing-root-header-row.is-visible";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const ADAPTIVE_SCROLL_CURVE_EXPONENT = 1.7;
const ADAPTIVE_SCROLL_HOLD_DELAY_MS = 450;
const ADAPTIVE_SCROLL_HOLD_RAMP_MS = 900;

function adaptiveEdgeSpeed(distance, zone, {
  holdBoost = 1.35,
  holdMs = 0,
  maxSpeed,
  minSpeed = 1
} = {}) {
  if (!(zone > 0) || !(distance < zone) || !(maxSpeed > 0)) return 0;
  const pressure = clamp((zone - distance) / zone, 0, 1);
  if (!pressure) return 0;
  const holdProgress = clamp(
    (Math.max(0, holdMs) - ADAPTIVE_SCROLL_HOLD_DELAY_MS) / ADAPTIVE_SCROLL_HOLD_RAMP_MS,
    0,
    1
  );
  const boostedMaxSpeed = maxSpeed * (1 + holdProgress * (Math.max(1, holdBoost) - 1));
  const curvedPressure = pressure ** ADAPTIVE_SCROLL_CURVE_EXPONENT;
  return Math.max(minSpeed, Math.round(minSpeed + (boostedMaxSpeed - minSpeed) * curvedPressure));
}

export function getPackingAdaptiveEdgeScrollProfile({
  baseZone = 72,
  inputType = "mouse",
  maxSpeed = 24,
  viewportHeight = 800,
  viewportWidth = 1200
} = {}) {
  const coarse = inputType === "touch" || inputType === "pen";
  const horizontalTarget = Math.max(baseZone, coarse ? 88 : 72);
  const verticalTarget = Math.max(baseZone * 1.5, coarse ? 112 : 96);
  return {
    holdBoost: coarse ? 1.25 : 1.35,
    horizontalZone: Math.min(horizontalTarget, viewportWidth / 3),
    maxSpeed: coarse ? Math.max(18, Math.round(maxSpeed * 0.9)) : maxSpeed,
    verticalZone: Math.min(verticalTarget, viewportHeight / 4)
  };
}

function isVisibleOverlay(element, windowRef, viewportTop, viewportBottom) {
  if (!element?.getBoundingClientRect) return false;
  const style = windowRef?.getComputedStyle?.(element);
  if (style && !["fixed", "sticky"].includes(style.position)) return false;
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  if (element.hidden) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > viewportTop && rect.top < viewportBottom;
}

export function getPackingDragTopBoundary({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  viewportTop = 0,
  viewportHeight = windowRef?.innerHeight || 0
} = {}) {
  const viewportBottom = viewportTop + viewportHeight;
  const overlays = [...(documentRef?.querySelectorAll?.(TOP_OVERLAY_SELECTOR) || [])]
    .filter((element) => isVisibleOverlay(element, windowRef, viewportTop, viewportBottom))
    .map((element) => element.getBoundingClientRect())
    .sort((left, right) => left.top - right.top);
  let boundary = viewportTop;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const rect of overlays) {
      if (rect.top > boundary + 1 || rect.bottom <= boundary) continue;
      boundary = Math.min(viewportBottom, rect.bottom);
      expanded = true;
    }
  }
  return boundary;
}

export function getPackingDragBottomBoundary({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  viewportTop = 0,
  viewportHeight = windowRef?.innerHeight || 0,
  reserveAboveFixedBar = 16
} = {}) {
  const viewportBottom = viewportTop + viewportHeight;
  const fixedScrollbar = documentRef?.querySelector?.("#kanbanScrollbar:not(.hidden)");
  if (!isVisibleOverlay(fixedScrollbar, windowRef, viewportTop, viewportBottom)) {
    return viewportBottom - 18;
  }
  const fixedScrollbarTop = fixedScrollbar.getBoundingClientRect().top;
  return Math.min(viewportBottom - 18, fixedScrollbarTop - reserveAboveFixedBar);
}

export function calculatePackingEdgeScroll({
  clientX,
  clientY,
  holdBoost = 1.35,
  holdMsX = 0,
  holdMsY = 0,
  maxSpeed,
  horizontalZone,
  verticalZone,
  viewportLeft,
  viewportRight,
  topBoundary,
  bottomBoundary,
  dragTop = null,
  dragBottom = null,
  verticalDirection = 0
}) {
  const leftDistance = clientX - viewportLeft;
  const rightDistance = viewportRight - clientX;
  const topTriggerProbe = verticalDirection < 0 && Number.isFinite(dragTop) ? Math.min(clientY, dragTop) : clientY;
  const bottomTriggerProbe = verticalDirection > 0 && Number.isFinite(dragBottom) ? Math.max(clientY, dragBottom) : clientY;
  const topTriggerDistance = topTriggerProbe - topBoundary;
  const bottomTriggerDistance = bottomBoundary - bottomTriggerProbe;
  const topControlDistance = clientY - topBoundary;
  const bottomControlDistance = bottomBoundary - clientY;
  let speedX = 0;
  let speedY = 0;
  if (leftDistance < horizontalZone) {
    speedX = -adaptiveEdgeSpeed(leftDistance, horizontalZone, { holdBoost, holdMs: holdMsX, maxSpeed });
  } else if (rightDistance < horizontalZone) {
    speedX = adaptiveEdgeSpeed(rightDistance, horizontalZone, { holdBoost, holdMs: holdMsX, maxSpeed });
  }
  if (verticalDirection <= 0 && topTriggerDistance < verticalZone) {
    const controlDistance = Math.min(topControlDistance, Math.max(0, verticalZone - 0.01));
    speedY = -adaptiveEdgeSpeed(controlDistance, verticalZone, { holdBoost, holdMs: holdMsY, maxSpeed });
  } else if (verticalDirection >= 0 && bottomTriggerDistance < verticalZone) {
    const controlDistance = Math.min(bottomControlDistance, Math.max(0, verticalZone - 0.01));
    speedY = adaptiveEdgeSpeed(controlDistance, verticalZone, { holdBoost, holdMs: holdMsY, maxSpeed });
  }
  return { speedX, speedY };
}

export function getPackingBottomScrollRoom({
  baseBoardHeight,
  currentBoardHeight,
  dragHeight,
  remainingScroll,
  reserve,
  viewportHeight
}) {
  const needed = Math.max(48, dragHeight, reserve, viewportHeight * 0.25);
  if (remainingScroll >= needed) return { minBoardHeight: currentBoardHeight, needed };
  return {
    minBoardHeight: Math.min(baseBoardHeight + needed, currentBoardHeight + needed),
    needed
  };
}
