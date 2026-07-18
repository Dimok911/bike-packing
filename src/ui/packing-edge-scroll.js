const TOP_OVERLAY_SELECTOR = ".controls, .tabs-row, .packing-root-header-row.is-visible";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const topProbe = verticalDirection < 0 && Number.isFinite(dragTop) ? Math.min(clientY, dragTop) : clientY;
  const bottomProbe = verticalDirection > 0 && Number.isFinite(dragBottom) ? Math.max(clientY, dragBottom) : clientY;
  const topDistance = topProbe - topBoundary;
  const bottomDistance = bottomBoundary - bottomProbe;
  let speedX = 0;
  let speedY = 0;
  if (leftDistance < horizontalZone) {
    const ratio = clamp((horizontalZone - leftDistance) / horizontalZone, 0, 1) ** 1.35;
    speedX = -Math.ceil(ratio * maxSpeed);
  } else if (rightDistance < horizontalZone) {
    const ratio = clamp((horizontalZone - rightDistance) / horizontalZone, 0, 1) ** 1.35;
    speedX = Math.ceil(ratio * maxSpeed);
  }
  if (verticalDirection <= 0 && topDistance < verticalZone) {
    const ratio = clamp((verticalZone - topDistance) / verticalZone, 0, 1) ** 1.35;
    speedY = -Math.ceil(ratio * maxSpeed);
  } else if (verticalDirection >= 0 && bottomDistance < verticalZone) {
    const ratio = clamp((verticalZone - bottomDistance) / verticalZone, 0, 1) ** 1.35;
    speedY = Math.ceil(ratio * maxSpeed);
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
