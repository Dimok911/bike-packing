export function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    if (document.body.classList.contains("dragging-ui") || document.body.classList.contains("drag-pending-ui")) return;
    const now = Date.now();
    if (now - lastTouchEnd <= 320) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false, capture: true });

  document.addEventListener("dblclick", (event) => {
    event.preventDefault();
  }, { capture: true });
}

export function blurActiveEditableBeforeButtonAction(event, { ignoredButton = null } = {}) {
  const button = event.target.closest?.("button");
  if (!button || button.disabled) return;
  if (button.closest?.("dialog")?.open) return;
  if (button.closest?.(".search-control-row, .filter-field")) return;
  if (ignoredButton && button === ignoredButton) return;
  const active = document.activeElement;
  if (!isEditableElement(active) || button.contains(active)) return;
  active.blur();
}

export function isEditableElement(element) {
  if (!element || element === document.body) return false;
  if (element.matches?.("input, textarea, select")) return true;
  return Boolean(element.isContentEditable);
}

export function setupTouchActionButtonFeedback() {
  let activeButton = null;
  let startX = 0;
  let startY = 0;
  let feedbackTimer = null;
  let moved = false;
  const selector = "button, .item-photo-pick, .backup-file-pick";

  const clearFeedbackTimer = () => {
    if (!feedbackTimer) return;
    window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
  };

  const clearActiveButton = () => {
    clearFeedbackTimer();
    activeButton?.classList.remove("touch-feedback-active");
    activeButton = null;
  };

  const scheduleFeedback = () => {
    clearFeedbackTimer();
    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      if (!moved) activeButton?.classList.add("touch-feedback-active");
    }, 70);
  };

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    const button = event.target.closest?.(selector);
    if (!button || button.disabled || button.classList.contains("disabled")) return;
    clearActiveButton();
    const touch = event.touches[0];
    activeButton = button;
    startX = touch.clientX;
    startY = touch.clientY;
    moved = false;
    scheduleFeedback();
  }, { passive: true, capture: true });

  document.addEventListener("touchmove", (event) => {
    if (!activeButton || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const distance = Math.hypot(touch.clientX - startX, touch.clientY - startY);
    if (distance <= 8) return;
    moved = true;
    clearActiveButton();
  }, { passive: true, capture: true });

  document.addEventListener("touchend", () => {
    if (!activeButton) return;
    clearFeedbackTimer();
    if (!moved) {
      activeButton.classList.add("touch-feedback-active");
      window.setTimeout(clearActiveButton, 130);
      return;
    }
    clearActiveButton();
  }, { passive: true, capture: true });

  document.addEventListener("touchcancel", clearActiveButton, { passive: true, capture: true });
}
