import { classifyTouchScrollAxis } from "./horizontal-touch-scroll.js";

const fixedScrollbarControllers = new WeakMap();
const boardMomentumTakeoverControllers = new WeakMap();
const BOARD_PHOTO_PASS_THROUGH_SETTLE_MS = 140;
const LEGACY_MOMENTUM_DECAY_PER_FRAME = 0.94;
const LEGACY_MOMENTUM_STOP_VELOCITY = 0.015;
const FIXED_BAR_MAX_VELOCITY = 1.5;
const FIXED_BAR_MOMENTUM_PROJECTION_MS = 180;

export function shouldStartBoardPointerDrag(event, { interactive = false } = {}) {
  const pointerType = String(event?.pointerType || "").trim().toLowerCase();
  const mousePointer = !pointerType || pointerType === "mouse";
  return event?.button === 0 && mousePointer && !interactive;
}

export function bindBoardScroll(board) {
  if (!board) return;
  bindBoardMomentumTakeover(board);
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  const isInteractiveTarget = (target) =>
    target.closest(".item-card, .subcontainer-title, .container-header, button, input, select, textarea, label, dialog, .drag-handle, .subcontainer-drag-handle");

  board.addEventListener("pointerdown", (event) => {
    if (!shouldStartBoardPointerDrag(event, { interactive: isInteractiveTarget(event.target) })) return;
    isDown = true;
    startX = event.clientX;
    scrollLeft = board.scrollLeft;
    board.classList.add("drag-scroll");
    board.setPointerCapture(event.pointerId);
  });

  board.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const walk = event.clientX - startX;
    board.scrollLeft = scrollLeft - walk;
  });

  const stop = (event) => {
    if (!isDown) return;
    isDown = false;
    board.classList.remove("drag-scroll");
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  };

  board.addEventListener("pointerup", stop);
  board.addEventListener("pointercancel", stop);
  board.addEventListener("pointerleave", () => {
    isDown = false;
    board.classList.remove("drag-scroll");
  });
}

export function bindBoardMomentumTakeover(board, {
  windowRef = globalThis,
  settleDelay = BOARD_PHOTO_PASS_THROUGH_SETTLE_MS
} = {}) {
  if (!board) return null;
  boardMomentumTakeoverControllers.get(board)?.destroy();
  let settleTimer = null;
  const clearPassThrough = () => {
    settleTimer = null;
    board.classList.remove("photo-scroll-pass-through");
  };
  const onScroll = () => {
    board.classList.add("photo-scroll-pass-through");
    if (settleTimer !== null) windowRef.clearTimeout(settleTimer);
    settleTimer = windowRef.setTimeout(clearPassThrough, Math.max(0, settleDelay));
  };

  const destroy = () => {
    if (settleTimer !== null) windowRef.clearTimeout(settleTimer);
    settleTimer = null;
    board.classList.remove("photo-scroll-pass-through");
    board.removeEventListener?.("scroll", onScroll);
  };

  board.addEventListener("scroll", onScroll, { passive: true });

  const controller = { destroy };
  boardMomentumTakeoverControllers.set(board, controller);
  return controller;
}

export function bindStickyRootHeaderRow(board, {
  ScrollTimelineCtor = globalThis.ScrollTimeline
} = {}) {
  const headerRow = board?.previousElementSibling?.classList?.contains("packing-root-header-row")
    ? board.previousElementSibling
    : null;
  const track = headerRow?.querySelector(".packing-root-header-track");
  if (!board || !headerRow || !track) return null;

  let geometryFrame = null;
  let positionAnimation = null;
  let animatedMaxScroll = null;
  let usesScrollTimeline = false;
  let pinchActive = false;
  const readRootPx = (name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
    return name === "--sticky-tabs-height" ? 44 : 0;
  };
  const syncPosition = () => {
    if (usesScrollTimeline && !pinchActive) return;
    const nextLeft = Math.max(0, Number(board.scrollLeft) || 0);
    if (Math.abs(headerRow.scrollLeft - nextLeft) > 0.5) headerRow.scrollLeft = nextLeft;
  };
  const cancelPositionTimeline = () => {
    positionAnimation?.cancel?.();
    positionAnimation = null;
    animatedMaxScroll = null;
    usesScrollTimeline = false;
  };
  const syncPositionTimeline = () => {
    if (pinchActive) return false;
    if (typeof ScrollTimelineCtor !== "function" || typeof track.animate !== "function") return false;
    const maxScroll = Math.max(0, Number(board.scrollWidth) - Number(board.clientWidth));
    if (usesScrollTimeline && animatedMaxScroll === maxScroll) return true;
    try {
      cancelPositionTimeline();
      const timeline = new ScrollTimelineCtor({ source: board, axis: "x" });
      positionAnimation = track.animate([
        { transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(${-maxScroll}px, 0, 0)` }
      ], {
        fill: "both",
        timeline
      });
      animatedMaxScroll = maxScroll;
      usesScrollTimeline = true;
      headerRow.scrollLeft = 0;
      return true;
    } catch {
      positionAnimation = null;
      animatedMaxScroll = null;
      usesScrollTimeline = false;
      return false;
    }
  };
  const syncGeometry = () => {
    geometryFrame = null;
    const rect = board.getBoundingClientRect();
    const stickyTop = readRootPx("--sticky-controls-height") + readRootPx("--sticky-tabs-height");
    const remainsVisibleDuringPagePan = (
      board.classList?.contains?.("packing-board-page-panning") &&
      headerRow.classList.contains("is-visible")
    );
    const remainsVisibleDuringPinch = pinchActive && headerRow.classList.contains("is-visible");
    const visible = remainsVisibleDuringPagePan || remainsVisibleDuringPinch || (
      rect.top < stickyTop - 1 && rect.bottom > stickyTop + 24
    );
    headerRow.classList.toggle("is-visible", visible);
    headerRow.style.setProperty("--packing-root-header-left", `${Math.max(0, rect.left)}px`);
    headerRow.style.setProperty("--packing-root-header-width", `${Math.max(0, rect.width)}px`);
    track.style.width = `${board.scrollWidth}px`;
    syncPositionTimeline();
    syncPosition();
    const cardById = new Map([...board.querySelectorAll("[data-root-container-id]")]
      .map((card) => [card.dataset.rootContainerId, card]));
    let height = 44;
    track.querySelectorAll("[data-sticky-root-container-id]").forEach((cell) => {
      const card = cardById.get(cell.dataset.stickyRootContainerId);
      if (!card) {
        cell.hidden = true;
        return;
      }
      const cardRect = card.getBoundingClientRect();
      cell.hidden = false;
      cell.style.width = `${cardRect.width}px`;
      cell.style.left = `${cardRect.left - rect.left + board.scrollLeft}px`;
      height = Math.max(height, cell.offsetHeight || 0);
    });
    track.style.setProperty("--packing-root-header-height", `${height}px`);
  };
  const requestGeometrySync = () => {
    if (geometryFrame) return;
    geometryFrame = requestAnimationFrame(syncGeometry);
  };
  const onPinchStart = () => {
    pinchActive = true;
    cancelPositionTimeline();
    syncPosition();
    requestGeometrySync();
  };
  const onPinchEnd = () => {
    pinchActive = false;
    requestGeometrySync();
  };

  board.addEventListener("scroll", syncPosition, { passive: true });
  board.addEventListener("packing-board-pinch-start", onPinchStart);
  board.addEventListener("packing-board-pinch-end", onPinchEnd);
  window.addEventListener("scroll", requestGeometrySync, { passive: true });
  window.addEventListener("resize", requestGeometrySync, { passive: true });
  // Initialize before the browser can paint the freshly rendered header row.
  // Deferring the first visibility update by one frame makes sticky headers flash off.
  syncGeometry();
  requestAnimationFrame(syncGeometry);
  return {
    syncGeometry: requestGeometrySync,
    syncPosition,
    usesScrollTimeline: () => usesScrollTimeline
  };
}

function bindPrimaryFixedScrollbar(board, {
  bar,
  track,
  thumb,
  surface,
  windowRef,
  now,
  requestFrame,
  cancelFrame
}) {
  let thumbFrame = null;
  let suppressClickUntil = 0;
  let mouseDragging = false;
  let mouseStartX = 0;
  let mouseStartLeft = 0;
  let mousePointerId = null;
  let touchPointerId = null;
  let touchAxis = "";
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartLeft = 0;
  let touchLastX = 0;
  let touchLastTime = 0;
  let touchVelocity = 0;
  let touchMode = "";
  let touchPreviewLeft = null;
  let activeTouchIdentifier = null;
  let smoothMomentumActive = false;
  const stickyTrack = board?.previousElementSibling?.classList?.contains("packing-root-header-row")
    ? board.previousElementSibling.querySelector?.(".packing-root-header-track")
    : null;

  const getGeometry = () => {
    const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    const trackWidth = track.clientWidth;
    const ratio = board.scrollWidth ? board.clientWidth / board.scrollWidth : 1;
    const thumbWidth = Math.max(48, Math.min(trackWidth, trackWidth * ratio));
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    return { maxScroll, trackWidth, thumbWidth, maxThumbLeft };
  };

  const clampScrollLeft = (value) => {
    const { maxScroll } = getGeometry();
    return Math.max(0, Math.min(maxScroll, value));
  };

  const updateThumb = (scrollPosition = board.scrollLeft) => {
    thumbFrame = null;
    const { maxScroll, thumbWidth, maxThumbLeft } = getGeometry();
    const numericScrollPosition = Number.isFinite(scrollPosition) ? scrollPosition : board.scrollLeft;
    const safeScrollPosition = Math.max(0, Math.min(maxScroll, numericScrollPosition));
    const progress = maxScroll ? safeScrollPosition / maxScroll : 0;
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.left = `${progress * maxThumbLeft}px`;
  };

  const requestThumbUpdate = () => {
    if (thumbFrame) return;
    // requestAnimationFrame passes its timestamp to the callback. Do not pass
    // updateThumb directly: the timestamp would be mistaken for scrollLeft
    // and move the thumb far beyond the track after the first Safari scroll.
    thumbFrame = requestFrame(() => updateThumb());
  };

  const stopMomentum = () => {
    if (!smoothMomentumActive) return;
    smoothMomentumActive = false;
    board.scrollTo?.({ left: board.scrollLeft, behavior: "auto" });
  };

  const startMomentum = () => {
    stopMomentum();
    if (touchAxis !== "horizontal" || Math.abs(touchVelocity) < 0.08) return;
    const velocity = Math.max(-FIXED_BAR_MAX_VELOCITY, Math.min(FIXED_BAR_MAX_VELOCITY, touchVelocity));
    const targetLeft = clampScrollLeft(
      board.scrollLeft + velocity * FIXED_BAR_MOMENTUM_PROJECTION_MS
    );
    if (Math.abs(targetLeft - board.scrollLeft) < 1) return;
    smoothMomentumActive = true;
    // One smooth-scroll handoff keeps every subsequent frame in Safari's
    // scrolling/compositor pipeline. Repeated JS scrollLeft writes during
    // release momentum can leave stale painted copies of the columns on iOS.
    board.scrollTo?.({ left: targetLeft, behavior: "smooth" });
  };

  const syncGeometry = () => updateThumb();

  const pointHitsThumb = (clientX) => {
    const { maxScroll, maxThumbLeft, thumbWidth } = getGeometry();
    const progress = maxScroll ? board.scrollLeft / maxScroll : 0;
    const rect = track.getBoundingClientRect();
    const localX = clientX - rect.left;
    const thumbLeft = progress * maxThumbLeft;
    return localX >= thumbLeft && localX <= thumbLeft + thumbWidth;
  };

  const beginTouchGesture = (clientX, clientY, pointerId) => {
    if (touchPointerId !== null) return false;
    stopMomentum();
    // Give WebKit a touch event boundary to promote the columns before their
    // first translated frame. Creating those layers on the first move itself
    // produces a small but visible hitch on iPhone.
    board.classList?.add("fixed-bar-scroll-ready");
    touchPointerId = pointerId;
    touchAxis = "";
    touchStartX = clientX;
    touchStartY = clientY;
    touchStartLeft = board.scrollLeft;
    touchPreviewLeft = touchStartLeft;
    touchMode = pointHitsThumb(clientX) ? "thumb" : "surface";
    touchLastX = clientX;
    touchLastTime = now();
    touchVelocity = 0;
    return true;
  };

  const applyTouchPreview = (nextLeft) => {
    touchPreviewLeft = nextLeft;
    const visualOffset = -(nextLeft - touchStartLeft);
    board.classList?.add("fixed-bar-scroll-preview");
    board.style?.setProperty("--fixed-bar-scroll-preview-x", `${visualOffset}px`);
    if (stickyTrack?.style) stickyTrack.style.translate = `${visualOffset}px 0`;
    updateThumb(nextLeft);
  };

  const commitTouchPreview = () => {
    if (touchPreviewLeft === null) return;
    const nextLeft = touchPreviewLeft;
    // Commit once, then remove the compositor-only preview in the same task.
    // The visual position stays unchanged without per-move scrollLeft writes.
    board.scrollLeft = nextLeft;
    board.classList?.remove("fixed-bar-scroll-preview");
    board.style?.removeProperty?.("--fixed-bar-scroll-preview-x");
    if (stickyTrack?.style) stickyTrack.style.translate = "";
    touchPreviewLeft = null;
    updateThumb(nextLeft);
  };

  const moveTouchGesture = (clientX, clientY, preventDefault, capturePointer) => {
    const dx = clientX - touchStartX;
    const dy = clientY - touchStartY;
    if (!touchAxis) {
      touchAxis = classifyTouchScrollAxis(dx, dy);
      if (touchAxis === "horizontal") {
        // Consume the touch-slop used for axis recognition. Applying those
        // accumulated pixels with the thumb ratio causes a visible jump at
        // the beginning of a drag, especially on narrow iPhone screens.
        touchStartX = clientX;
        touchStartY = clientY;
        touchStartLeft = board.scrollLeft;
        touchPreviewLeft = touchStartLeft;
        touchLastX = clientX;
        touchLastTime = now();
        suppressClickUntil = Date.now() + 350;
        capturePointer?.();
        preventDefault?.();
        return true;
      }
    }
    if (touchAxis !== "horizontal") return false;
    const currentTime = now();
    const elapsed = Math.max(1, currentTime - touchLastTime);
    const instantaneousVelocity = (clientX - touchLastX) / elapsed;
    touchVelocity = touchVelocity * 0.55 + instantaneousVelocity * 0.45;
    touchLastX = clientX;
    touchLastTime = currentTime;
    const { maxScroll, maxThumbLeft } = getGeometry();
    const scrollPerFingerPixel = touchMode === "thumb" && maxThumbLeft
      ? maxScroll / maxThumbLeft
      : 1;
    // A direct drag of the colored thumb keeps it under the finger. A swipe
    // started on the wider track remains a softer 1:1 touchpad gesture.
    const nextLeft = clampScrollLeft(touchStartLeft + dx * scrollPerFingerPixel);
    applyTouchPreview(nextLeft);
    suppressClickUntil = Date.now() + 350;
    capturePointer?.();
    preventDefault?.();
    return true;
  };

  const stopTouchGesture = ({ withMomentum = false, releasePointer = false } = {}) => {
    if (touchPointerId === null) return;
    commitTouchPreview();
    board.classList?.remove("fixed-bar-scroll-ready");
    if (withMomentum) startMomentum();
    if (releasePointer && surface.hasPointerCapture?.(touchPointerId)) {
      surface.releasePointerCapture(touchPointerId);
    }
    touchPointerId = null;
    touchAxis = "";
    touchVelocity = 0;
    touchMode = "";
    activeTouchIdentifier = null;
  };

  const onPointerDown = (event) => {
    const pointerType = String(event.pointerType || "mouse").toLowerCase();
    // iOS Safari is more reliable here with Touch Events. Handling the same
    // finger through both event models can cancel the gesture before move.
    if (pointerType === "touch") return;
    if (pointerType !== "mouse") {
      beginTouchGesture(event.clientX, event.clientY, event.pointerId);
      return;
    }
    if (event.button !== 0 || !pointHitsThumb(event.clientX)) return;
    stopMomentum();
    mouseDragging = true;
    mouseStartX = event.clientX;
    mouseStartLeft = board.scrollLeft;
    mousePointerId = event.pointerId;
    surface.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  };

  const onPointerMove = (event) => {
    if (event.pointerId === touchPointerId) {
      moveTouchGesture(event.clientX, event.clientY, () => event.preventDefault?.(), () => {
        if (!surface.hasPointerCapture?.(event.pointerId)) surface.setPointerCapture?.(event.pointerId);
      });
      return;
    }
    if (!mouseDragging || event.pointerId !== mousePointerId) return;
    const { maxScroll, maxThumbLeft } = getGeometry();
    const dx = event.clientX - mouseStartX;
    const scrollDx = maxThumbLeft ? (dx / maxThumbLeft) * maxScroll : 0;
    board.scrollLeft = clampScrollLeft(mouseStartLeft + scrollDx);
    suppressClickUntil = Date.now() + 300;
    requestThumbUpdate();
  };

  const stopMouseDrag = (event) => {
    if (event.pointerId === touchPointerId) {
      stopTouchGesture({ withMomentum: true, releasePointer: true });
      return;
    }
    if (!mouseDragging || event.pointerId !== mousePointerId) return;
    mouseDragging = false;
    if (surface.hasPointerCapture?.(mousePointerId)) surface.releasePointerCapture(mousePointerId);
    mousePointerId = null;
  };

  const onTouchStart = (event) => {
    if (event.touches?.length !== 1) return;
    const touch = event.touches[0];
    activeTouchIdentifier = touch.identifier;
    beginTouchGesture(touch.clientX, touch.clientY, `touch:${touch.identifier}`);
  };

  const onTouchMove = (event) => {
    const touches = [...(event.touches || [])];
    const touch = touches.find((candidate) => candidate.identifier === activeTouchIdentifier);
    if (!touch) return;
    moveTouchGesture(
      touch.clientX,
      touch.clientY,
      () => {
        if (event.cancelable !== false) event.preventDefault?.();
      }
    );
  };

  const onTouchEnd = (event) => {
    const stillActive = [...(event.touches || [])]
      .some((touch) => touch.identifier === activeTouchIdentifier);
    if (!stillActive) stopTouchGesture({ withMomentum: true });
  };

  const onTouchCancel = () => {
    stopMomentum();
    stopTouchGesture();
  };

  const onSurfaceClick = (event) => {
    if (Date.now() <= suppressClickUntil || pointHitsThumb(event.clientX)) return;
    const { maxScroll, maxThumbLeft, thumbWidth } = getGeometry();
    const rect = track.getBoundingClientRect();
    const thumbLeft = Math.max(0, Math.min(event.clientX - rect.left - thumbWidth / 2, maxThumbLeft));
    board.scrollTo({
      left: maxThumbLeft ? (thumbLeft / maxThumbLeft) * maxScroll : 0,
      behavior: "smooth"
    });
  };

  const destroy = () => {
    stopMomentum();
    if (thumbFrame) cancelFrame(thumbFrame);
    thumbFrame = null;
    board.classList?.remove("fixed-bar-scroll-ready");
    board.classList?.remove("fixed-bar-scroll-preview");
    board.style?.removeProperty?.("--fixed-bar-scroll-preview-x");
    if (stickyTrack?.style) stickyTrack.style.translate = "";
    board.removeEventListener?.("scroll", requestThumbUpdate);
    surface.removeEventListener?.("pointerdown", onPointerDown);
    surface.removeEventListener?.("pointermove", onPointerMove);
    surface.removeEventListener?.("pointerup", stopMouseDrag);
    surface.removeEventListener?.("pointercancel", stopMouseDrag);
    surface.removeEventListener?.("touchstart", onTouchStart);
    surface.removeEventListener?.("touchmove", onTouchMove);
    surface.removeEventListener?.("touchend", onTouchEnd);
    surface.removeEventListener?.("touchcancel", onTouchCancel);
    surface.removeEventListener?.("click", onSurfaceClick);
    windowRef.removeEventListener?.("resize", syncGeometry);
    surface.remove?.();
  };

  board.addEventListener("scroll", requestThumbUpdate, { passive: true });
  surface.addEventListener("pointerdown", onPointerDown, { passive: false });
  surface.addEventListener("pointermove", onPointerMove, { passive: false });
  surface.addEventListener("pointerup", stopMouseDrag, { passive: true });
  surface.addEventListener("pointercancel", stopMouseDrag, { passive: true });
  surface.addEventListener("touchstart", onTouchStart, { passive: true });
  surface.addEventListener("touchmove", onTouchMove, { passive: false });
  surface.addEventListener("touchend", onTouchEnd, { passive: true });
  surface.addEventListener("touchcancel", onTouchCancel, { passive: true });
  surface.addEventListener("click", onSurfaceClick);
  windowRef.addEventListener("resize", syncGeometry, { passive: true });
  syncGeometry();

  const controller = { destroy };
  fixedScrollbarControllers.set(bar, controller);
  return controller;
}

export function bindFixedScrollbar(board, {
  documentRef = document,
  windowRef = window,
  pointerEventsSupported = typeof PointerEvent !== "undefined",
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frame) => cancelAnimationFrame(frame)
} = {}) {
  const bar = documentRef.querySelector("#kanbanScrollbar");
  const track = documentRef.querySelector("#kanbanScrollTrack");
  const thumb = documentRef.querySelector("#kanbanScrollThumb");
  if (!board || !bar || !track || !thumb) return;

  fixedScrollbarControllers.get(bar)?.destroy();
  const surface = documentRef.createElement?.("div");
  if (surface && typeof board.appendChild === "function") {
    surface.className = "kanban-board-touch-surface";
    surface.setAttribute?.("aria-hidden", "true");
    board.appendChild(surface);
    return bindPrimaryFixedScrollbar(board, {
      bar,
      track,
      thumb,
      surface,
      windowRef,
      now,
      requestFrame,
      cancelFrame
    });
  }

  let mouseDragging = false;
  let mouseStartX = 0;
  let mouseStartLeft = 0;
  let activePointerId = null;
  let pointerCaptured = false;
  let gestureAxis = "";
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureStartLeft = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let suppressClickUntil = 0;
  let thumbFrame = null;
  let momentumFrame = null;

  const clampScrollLeft = (value) => {
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    return Math.max(0, Math.min(max, value));
  };

  const getGeometry = () => {
    const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    const trackWidth = track.clientWidth;
    const ratio = board.scrollWidth ? board.clientWidth / board.scrollWidth : 1;
    const thumbWidth = Math.max(48, Math.min(trackWidth, trackWidth * ratio));
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    return { maxScroll, trackWidth, thumbWidth, maxThumbLeft };
  };

  const updateThumb = () => {
    thumbFrame = null;
    const { maxScroll, thumbWidth, maxThumbLeft } = getGeometry();
    const progress = maxScroll ? board.scrollLeft / maxScroll : 0;
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.left = `${progress * maxThumbLeft}px`;
  };

  const requestThumbUpdate = () => {
    if (thumbFrame) return;
    thumbFrame = requestFrame(updateThumb);
  };

  const stopMomentum = () => {
    if (!momentumFrame) return;
    cancelFrame(momentumFrame);
    momentumFrame = null;
  };

  const releasePointer = () => {
    if (!pointerCaptured || activePointerId == null) return;
    try {
      if (bar.hasPointerCapture?.(activePointerId)) bar.releasePointerCapture(activePointerId);
    } catch {
      // Safari can release capture itself when it commits to a native vertical pan.
    }
    pointerCaptured = false;
  };

  const beginSwipe = (clientX, clientY) => {
    stopMomentum();
    gestureAxis = "";
    gestureStartX = clientX;
    gestureStartY = clientY;
    gestureStartLeft = board.scrollLeft;
    lastX = clientX;
    lastTime = now();
    velocityX = 0;
  };

  const moveSwipe = (clientX, clientY) => {
    const dx = clientX - gestureStartX;
    const dy = clientY - gestureStartY;
    if (!gestureAxis) gestureAxis = classifyTouchScrollAxis(dx, dy);
    if (gestureAxis !== "horizontal") return false;
    const { maxScroll, maxThumbLeft } = getGeometry();
    const scrollPerThumbPixel = maxThumbLeft ? maxScroll / maxThumbLeft : 0;
    const currentTime = now();
    const elapsed = Math.max(1, currentTime - lastTime);
    velocityX = (clientX - lastX) / elapsed;
    lastX = clientX;
    lastTime = currentTime;
    board.scrollLeft = clampScrollLeft(gestureStartLeft + dx * scrollPerThumbPixel);
    suppressClickUntil = Date.now() + 350;
    requestThumbUpdate();
    return true;
  };

  const startMomentum = () => {
    stopMomentum();
    if (gestureAxis !== "horizontal" || Math.abs(velocityX) < 0.08) return;
    let velocity = velocityX;
    let previousTime = now();
    const step = (time) => {
      const elapsed = Math.min(32, Math.max(1, time - previousTime));
      previousTime = time;
      const nextLeft = clampScrollLeft(board.scrollLeft + velocity * elapsed);
      const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
      const hitEdge = nextLeft === 0 || nextLeft >= maxScroll;
      board.scrollLeft = nextLeft;
      requestThumbUpdate();
      velocity *= Math.pow(LEGACY_MOMENTUM_DECAY_PER_FRAME, elapsed / 16);
      if (hitEdge) velocity *= 0.35;
      if (Math.abs(velocity) < LEGACY_MOMENTUM_STOP_VELOCITY) {
        momentumFrame = null;
        return;
      }
      momentumFrame = requestFrame(step);
    };
    momentumFrame = requestFrame(step);
  };

  const stopSwipe = ({ withMomentum = false } = {}) => {
    if (withMomentum) startMomentum();
    releasePointer();
    activePointerId = null;
    gestureAxis = "";
    velocityX = 0;
  };

  const scrollTrackTo = (clientX) => {
    const { maxScroll, maxThumbLeft, thumbWidth } = getGeometry();
    const rect = track.getBoundingClientRect();
    const thumbLeft = Math.max(0, Math.min(clientX - rect.left - thumbWidth / 2, maxThumbLeft));
    board.scrollTo({
      left: maxThumbLeft ? (thumbLeft / maxThumbLeft) * maxScroll : 0,
      behavior: "smooth"
    });
  };

  const onBarClick = (event) => {
    if (event.target === thumb || Date.now() <= suppressClickUntil) return;
    scrollTrackTo(event.clientX);
  };

  const onPointerDown = (event) => {
    const pointerType = String(event.pointerType || "mouse").toLowerCase();
    if (pointerType === "mouse") {
      if (event.button !== 0 || event.target !== thumb) return;
      stopMomentum();
      mouseDragging = true;
      mouseStartX = event.clientX;
      mouseStartLeft = board.scrollLeft;
      activePointerId = event.pointerId;
      bar.setPointerCapture?.(event.pointerId);
      pointerCaptured = Boolean(bar.hasPointerCapture?.(event.pointerId));
      event.preventDefault?.();
      return;
    }
    if (activePointerId != null) return;
    activePointerId = event.pointerId;
    beginSwipe(event.clientX, event.clientY);
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== activePointerId) return;
    if (mouseDragging) {
      const { maxScroll, maxThumbLeft } = getGeometry();
      const dx = event.clientX - mouseStartX;
      const scrollDx = maxThumbLeft ? (dx / maxThumbLeft) * maxScroll : 0;
      board.scrollLeft = clampScrollLeft(mouseStartLeft + scrollDx);
      requestThumbUpdate();
      return;
    }
    if (!moveSwipe(event.clientX, event.clientY)) return;
    if (!pointerCaptured) {
      try {
        bar.setPointerCapture?.(event.pointerId);
        pointerCaptured = Boolean(bar.hasPointerCapture?.(event.pointerId));
      } catch {
        pointerCaptured = false;
      }
    }
    event.preventDefault?.();
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== activePointerId) return;
    if (mouseDragging) {
      mouseDragging = false;
      releasePointer();
      activePointerId = null;
      return;
    }
    stopSwipe({ withMomentum: true });
  };

  const onPointerCancel = (event) => {
    if (event.pointerId !== activePointerId) return;
    mouseDragging = false;
    stopMomentum();
    stopSwipe();
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    beginSwipe(touch.clientX, touch.clientY);
  };

  const onTouchMove = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (moveSwipe(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
  };

  const onTouchEnd = () => stopSwipe({ withMomentum: true });
  const onTouchCancel = () => {
    stopMomentum();
    stopSwipe();
  };

  const cancelForBoardGesture = () => {
    mouseDragging = false;
    stopMomentum();
    stopSwipe();
  };

  const updateWidth = () => updateThumb();
  const destroy = () => {
    stopMomentum();
    if (thumbFrame) cancelFrame(thumbFrame);
    thumbFrame = null;
    releasePointer();
    board.removeEventListener?.("scroll", requestThumbUpdate);
    board.removeEventListener?.("packing-board-pinch-start", cancelForBoardGesture);
    board.removeEventListener?.("packing-board-page-pan-start", cancelForBoardGesture);
    bar.removeEventListener?.("click", onBarClick);
    if (pointerEventsSupported) {
      bar.removeEventListener?.("pointerdown", onPointerDown);
      bar.removeEventListener?.("pointermove", onPointerMove);
      bar.removeEventListener?.("pointerup", onPointerUp);
      bar.removeEventListener?.("pointercancel", onPointerCancel);
    } else {
      bar.removeEventListener?.("touchstart", onTouchStart);
      bar.removeEventListener?.("touchmove", onTouchMove);
      bar.removeEventListener?.("touchend", onTouchEnd);
      bar.removeEventListener?.("touchcancel", onTouchCancel);
    }
    windowRef.removeEventListener?.("resize", updateWidth);
  };

  board.addEventListener("scroll", requestThumbUpdate, { passive: true });
  board.addEventListener("packing-board-pinch-start", cancelForBoardGesture);
  board.addEventListener("packing-board-page-pan-start", cancelForBoardGesture);
  bar.addEventListener("click", onBarClick);
  if (pointerEventsSupported) {
    bar.addEventListener("pointerdown", onPointerDown, { passive: false });
    bar.addEventListener("pointermove", onPointerMove, { passive: false });
    bar.addEventListener("pointerup", onPointerUp, { passive: true });
    bar.addEventListener("pointercancel", onPointerCancel, { passive: true });
  } else {
    bar.addEventListener("touchstart", onTouchStart, { passive: true });
    bar.addEventListener("touchmove", onTouchMove, { passive: false });
    bar.addEventListener("touchend", onTouchEnd, { passive: true });
    bar.addEventListener("touchcancel", onTouchCancel, { passive: true });
  }

  updateWidth();
  windowRef.addEventListener("resize", updateWidth, { passive: true });
  const controller = { destroy };
  fixedScrollbarControllers.set(bar, controller);
  return controller;
}
