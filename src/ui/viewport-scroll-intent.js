let explicitViewportScrollUntil = 0;
const VERTICAL_GESTURE_THRESHOLD_PX = 8;

export function markExplicitViewportScrollIntent({
  durationMs = 700,
  now = Date.now()
} = {}) {
  explicitViewportScrollUntil = Math.max(
    explicitViewportScrollUntil,
    Number(now) + Math.max(0, Number(durationMs) || 0)
  );
  return explicitViewportScrollUntil;
}

export function hasExplicitViewportScrollIntent(now = Date.now()) {
  return Number(now) <= explicitViewportScrollUntil;
}

export function resetExplicitViewportScrollIntent() {
  explicitViewportScrollUntil = 0;
}

export function bindExplicitViewportScrollIntent({
  documentRef = document,
  onIntent = () => {},
  windowRef = window
} = {}) {
  let touchActive = false;
  let touchHandled = false;
  let touchStartX = 0;
  let touchStartY = 0;

  const activate = () => {
    markExplicitViewportScrollIntent();
    onIntent();
  };

  const onTouchStart = (event) => {
    if (event.touches?.length !== 1) {
      touchActive = false;
      return;
    }
    touchActive = true;
    touchHandled = false;
    touchStartX = Number(event.touches[0].clientX) || 0;
    touchStartY = Number(event.touches[0].clientY) || 0;
  };

  const onTouchMove = (event) => {
    if (!touchActive || touchHandled || event.touches?.length !== 1) return;
    const deltaX = (Number(event.touches[0].clientX) || 0) - touchStartX;
    const deltaY = (Number(event.touches[0].clientY) || 0) - touchStartY;
    if (Math.abs(deltaY) < VERTICAL_GESTURE_THRESHOLD_PX || Math.abs(deltaY) < Math.abs(deltaX)) return;
    touchHandled = true;
    activate();
  };

  const finishTouch = () => {
    touchActive = false;
    touchHandled = false;
  };

  const onWheel = (event) => {
    if (Math.abs(Number(event.deltaY) || 0) < Math.abs(Number(event.deltaX) || 0)) return;
    if (!event.deltaY) return;
    activate();
  };

  documentRef?.addEventListener?.("touchstart", onTouchStart, { capture: true, passive: true });
  documentRef?.addEventListener?.("touchmove", onTouchMove, { capture: true, passive: true });
  documentRef?.addEventListener?.("touchend", finishTouch, { capture: true, passive: true });
  documentRef?.addEventListener?.("touchcancel", finishTouch, { capture: true, passive: true });
  windowRef?.addEventListener?.("wheel", onWheel, { capture: true, passive: true });

  return () => {
    documentRef?.removeEventListener?.("touchstart", onTouchStart, true);
    documentRef?.removeEventListener?.("touchmove", onTouchMove, true);
    documentRef?.removeEventListener?.("touchend", finishTouch, true);
    documentRef?.removeEventListener?.("touchcancel", finishTouch, true);
    windowRef?.removeEventListener?.("wheel", onWheel, true);
  };
}
