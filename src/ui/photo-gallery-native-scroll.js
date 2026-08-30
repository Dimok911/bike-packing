const bindings = new WeakMap();
const VERTICAL_GESTURE_THRESHOLD_PX = 7;
const TRACK_SELECTOR = ".photo-gallery-track, .vpg-track";

function touchPoint(event) {
  return event?.touches?.[0] || event?.changedTouches?.[0] || null;
}

function catalogTrackForEvent(event) {
  const track = event?.target?.closest?.(TRACK_SELECTOR) || null;
  return track && !track.closest?.(".board") ? track : null;
}

function isVerticalGesture(gesture, point) {
  if (!gesture || !point) return false;
  const deltaX = (Number(point.clientX) || 0) - gesture.startX;
  const deltaY = (Number(point.clientY) || 0) - gesture.startY;
  return Math.abs(deltaY) >= VERTICAL_GESTURE_THRESHOLD_PX
    && Math.abs(deltaY) >= Math.abs(deltaX);
}

// The shared inline gallery recenters its horizontal track on touchend and
// touchcancel. On iOS WebKit that programmatic scroll can interrupt the native
// vertical document momentum which owns the same gesture. Capture at the view
// boundary before the gallery target and leave taps/horizontal swipes intact.
export function bindNativePhotoGalleryVerticalScroll(root = document) {
  const scope = root?.addEventListener ? root : document;
  bindings.get(scope)?.();
  let gesture = null;

  const onTouchStart = (event) => {
    const track = event?.touches?.length === 1 ? catalogTrackForEvent(event) : null;
    const point = track ? touchPoint(event) : null;
    gesture = point ? {
      startX: Number(point.clientX) || 0,
      startY: Number(point.clientY) || 0,
      track,
      vertical: false
    } : null;
  };

  const updateGesture = (event) => {
    const point = touchPoint(event);
    if (!gesture || !point || catalogTrackForEvent(event) !== gesture.track) return false;
    gesture.vertical = isVerticalGesture(gesture, point);
    return gesture.vertical;
  };

  const finishGesture = (event) => {
    const vertical = updateGesture(event) || gesture?.vertical === true;
    gesture = null;
    if (vertical) event?.stopImmediatePropagation?.();
  };

  const cancelGesture = (event) => {
    const vertical = gesture?.vertical === true;
    gesture = null;
    if (vertical) event?.stopImmediatePropagation?.();
  };

  scope.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  scope.addEventListener("touchmove", updateGesture, { capture: true, passive: true });
  scope.addEventListener("touchend", finishGesture, { capture: true, passive: true });
  scope.addEventListener("touchcancel", cancelGesture, { capture: true, passive: true });

  const cleanup = () => {
    scope.removeEventListener("touchstart", onTouchStart, true);
    scope.removeEventListener("touchmove", updateGesture, true);
    scope.removeEventListener("touchend", finishGesture, true);
    scope.removeEventListener("touchcancel", cancelGesture, true);
  };
  bindings.set(scope, cleanup);

  return {
    destroy() {
      if (bindings.get(scope) !== cleanup) return;
      cleanup();
      bindings.delete(scope);
    }
  };
}
