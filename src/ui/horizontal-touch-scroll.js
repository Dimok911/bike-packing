// A vertical page pan must win over the small sideways wobble that is common
// at the beginning of an iPhone gesture. Horizontal controls can afford a
// little more touch slop; capturing them too early prevents the parent scroll
// host from ever receiving the vertical pan.
const HORIZONTAL_AXIS_LOCK_DISTANCE = 10;
const VERTICAL_AXIS_LOCK_DISTANCE = 7;
const HORIZONTAL_AXIS_DOMINANCE = 1.2;
const VERTICAL_AXIS_DOMINANCE = 1.1;
const boardControllers = new WeakMap();

export function classifyTouchScrollAxis(dx, dy, {
  horizontalDistance = HORIZONTAL_AXIS_LOCK_DISTANCE,
  verticalDistance = VERTICAL_AXIS_LOCK_DISTANCE,
  horizontalDominance = HORIZONTAL_AXIS_DOMINANCE,
  verticalDominance = VERTICAL_AXIS_DOMINANCE
} = {}) {
  const distanceX = Math.abs(Number(dx) || 0);
  const distanceY = Math.abs(Number(dy) || 0);
  if (
    distanceX >= Math.max(0, Number(horizontalDistance) || 0) &&
    distanceX > distanceY * Math.max(1, Number(horizontalDominance) || 1)
  ) {
    return "horizontal";
  }
  if (
    distanceY >= Math.max(0, Number(verticalDistance) || 0) &&
    distanceY > distanceX * Math.max(1, Number(verticalDominance) || 1)
  ) {
    return "vertical";
  }
  return "";
}

export function resetHorizontalTouchScroll(board) {
  const controller = boardControllers.get(board);
  controller?.reset();
  if (board) board.scrollLeft = 0;
}

export function packingBoardUsesDedicatedTouchPan(board) {
  return Boolean(
    board?.classList?.contains?.("packing-board-zoom-active")
    || board?.classList?.contains?.("packing-board-zooming")
  );
}

export function bindHorizontalTouchScroll(board, {
  pointerEventsSupported = typeof PointerEvent !== "undefined"
} = {}) {
  if (!board || board.dataset.touchScrollBound === "true") return;
  board.dataset.touchScrollBound = "true";
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let touchScrollAxis = "";
  let suppressClickUntil = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let momentumFrame = null;
  let resetFrame = null;
  let activePointerId = null;
  let pointerCaptured = false;

  const stopMomentum = () => {
    if (!momentumFrame) return;
    cancelAnimationFrame(momentumFrame);
    momentumFrame = null;
  };

  const cancelScheduledReset = () => {
    if (resetFrame == null) return;
    cancelAnimationFrame(resetFrame);
    resetFrame = null;
  };

  const releasePointer = () => {
    if (!pointerCaptured || activePointerId == null) return;
    try {
      if (board.hasPointerCapture?.(activePointerId)) board.releasePointerCapture(activePointerId);
    } catch {
      // The browser may release capture while beginning a native vertical pan.
    }
    pointerCaptured = false;
  };

  const resetGesture = () => {
    releasePointer();
    activePointerId = null;
    touchScrollAxis = "";
    velocityX = 0;
  };

  const cancelForPagePan = () => {
    stopMomentum();
    resetGesture();
  };

  const reset = () => {
    stopMomentum();
    cancelScheduledReset();
    resetGesture();
    suppressClickUntil = 0;
    board.scrollLeft = 0;
    if (typeof requestAnimationFrame === "function") {
      resetFrame = requestAnimationFrame(() => {
        resetFrame = null;
        board.scrollLeft = 0;
      });
    }
  };

  const clampScrollLeft = (value) => {
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    return Math.max(0, Math.min(max, value));
  };

  const beginGesture = (clientX, clientY) => {
    stopMomentum();
    cancelScheduledReset();
    startX = clientX;
    startY = clientY;
    startLeft = board.scrollLeft;
    touchScrollAxis = "";
    lastX = clientX;
    lastTime = performance.now();
    velocityX = 0;
  };

  const moveGesture = (clientX, clientY) => {
    if (packingBoardUsesDedicatedTouchPan(board)) {
      cancelForPagePan();
      return false;
    }
    if (board.classList?.contains?.("packing-board-page-panning")) {
      cancelForPagePan();
      return false;
    }
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (!touchScrollAxis) touchScrollAxis = classifyTouchScrollAxis(dx, dy);
    if (touchScrollAxis !== "horizontal") return false;
    const now = performance.now();
    const elapsed = Math.max(1, now - lastTime);
    velocityX = (clientX - lastX) / elapsed;
    lastX = clientX;
    lastTime = now;
    board.scrollLeft = clampScrollLeft(startLeft - dx);
    suppressClickUntil = Date.now() + 350;
    return true;
  };

  const startMomentum = () => {
    stopMomentum();
    if (packingBoardUsesDedicatedTouchPan(board)) {
      resetGesture();
      return;
    }
    if (touchScrollAxis !== "horizontal" || Math.abs(velocityX) < 0.08) return;
    let velocity = velocityX;
    let previousTime = performance.now();
    const step = (time) => {
      const elapsed = Math.min(32, time - previousTime);
      previousTime = time;
      const nextLeft = clampScrollLeft(board.scrollLeft - velocity * elapsed);
      const hitEdge = nextLeft === 0 || nextLeft >= Math.max(0, board.scrollWidth - board.clientWidth);
      board.scrollLeft = nextLeft;
      velocity *= Math.pow(0.94, elapsed / 16);
      if (hitEdge) velocity *= 0.35;
      if (Math.abs(velocity) < 0.015) {
        momentumFrame = null;
        return;
      }
      momentumFrame = requestAnimationFrame(step);
    };
    momentumFrame = requestAnimationFrame(step);
  };

  if (pointerEventsSupported) {
    board.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" || activePointerId != null) return;
      if (packingBoardUsesDedicatedTouchPan(board)) return;
      activePointerId = event.pointerId;
      pointerCaptured = false;
      beginGesture(event.clientX, event.clientY);
    }, { passive: true });

    board.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || event.pointerId !== activePointerId) return;
      if (!moveGesture(event.clientX, event.clientY)) return;
      if (!pointerCaptured) {
        try {
          board.setPointerCapture?.(event.pointerId);
          pointerCaptured = Boolean(board.hasPointerCapture?.(event.pointerId));
        } catch {
          pointerCaptured = false;
        }
      }
    }, { passive: true });

    board.addEventListener("pointerup", (event) => {
      if (event.pointerId !== activePointerId) return;
      startMomentum();
      releasePointer();
      activePointerId = null;
    }, { passive: true });

    board.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== activePointerId) return;
      stopMomentum();
      resetGesture();
    }, { passive: true });
  } else {
    board.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      if (packingBoardUsesDedicatedTouchPan(board)) return;
      const touch = event.touches[0];
      beginGesture(touch.clientX, touch.clientY);
    }, { passive: true });

    board.addEventListener("touchmove", (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (moveGesture(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    }, { passive: false });

    board.addEventListener("touchend", startMomentum, { passive: true });
    board.addEventListener("touchcancel", () => {
      stopMomentum();
      resetGesture();
    }, { passive: true });
  }

  board.addEventListener("click", (event) => {
    if (Date.now() <= suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  board.addEventListener("packing-board-page-pan-start", cancelForPagePan);
  board.addEventListener("packing-board-pinch-start", cancelForPagePan);

  boardControllers.set(board, { reset });
}
