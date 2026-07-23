export const POST_DRAG_CLICK_SUPPRESSION_MS = 800;
export const POST_DRAG_CLICK_MAX_DISTANCE = 24;

const activeSuppressions = new WeakMap();

export function shouldSuppressClickAfterDragAttempt({
  started = false,
  blocked = false
} = {}) {
  return started || blocked;
}

export function suppressNextClickAfterDrag(source, {
  clientX = null,
  clientY = null,
  eventRoot = null,
  maxDistance = POST_DRAG_CLICK_MAX_DISTANCE,
  timeoutMs = POST_DRAG_CLICK_SUPPRESSION_MS,
  windowRef = window
} = {}) {
  if (!source?.addEventListener) return () => {};
  activeSuppressions.get(source)?.();

  const root = eventRoot || source.ownerDocument || source;
  const hasReleasePoint = Number.isFinite(clientX) && Number.isFinite(clientY);
  let active = true;
  let timer = null;

  const suppressClick = (event) => {
    const sourceRelated = event.target === source || source.contains?.(event.target);
    const hasClickPoint = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const nearReleasePoint = hasReleasePoint && hasClickPoint &&
      Math.hypot(event.clientX - clientX, event.clientY - clientY) <= maxDistance;
    clear();
    if (!sourceRelated && !nearReleasePoint) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  };

  const clear = () => {
    if (!active) return;
    active = false;
    if (timer !== null) windowRef.clearTimeout?.(timer);
    root.removeEventListener?.("click", suppressClick, true);
    if (source.dataset) delete source.dataset.justDragged;
    if (activeSuppressions.get(source) === clear) activeSuppressions.delete(source);
  };

  if (source.dataset) source.dataset.justDragged = "true";
  root.addEventListener("click", suppressClick, true);
  timer = windowRef.setTimeout?.(clear, timeoutMs) ?? null;
  activeSuppressions.set(source, clear);
  return clear;
}
