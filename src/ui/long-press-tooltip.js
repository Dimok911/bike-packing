export function closestEventTarget(event, selector) {
  return event?.target?.closest?.(selector) || null;
}

export function bindLongPressTooltips({
  root,
  selector = "[data-touch-tooltip]",
  holdDelayMs = 650,
  visibleMs = 1800,
  moveCancelDistance = 10
} = {}) {
  if (!root) return;

  let timer = null;
  let startX = 0;
  let startY = 0;
  let activeTarget = null;
  let suppressClickTarget = null;
  let hideTimer = null;
  let tooltip = null;
  let tooltipTarget = null;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };

  const hideTooltip = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = null;
    tooltipTarget?.classList.remove("touch-tooltip-open");
    tooltipTarget = null;
    tooltip?.remove();
    tooltip = null;
  };

  const scheduleHide = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideTooltip, visibleMs);
  };

  const showTooltip = (target) => {
    const text = target?.dataset?.touchTooltip || target?.getAttribute?.("title") || "";
    if (!text) return;
    hideTooltip();
    tooltip = document.createElement("div");
    tooltip.className = "touch-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("popover", "manual");
    tooltip.textContent = text;
    const dialog = target.closest("dialog");
    (dialog || document.body).append(tooltip);

    let usesTopLayer = false;
    if (typeof tooltip.showPopover === "function") {
      try {
        tooltip.showPopover();
        usesTopLayer = true;
      } catch {
        // Older modal implementations can reject popovers; the dialog-local fallback remains visible.
      }
    }
    if (!usesTopLayer) {
      tooltip.removeAttribute("popover");
      tooltip.classList.add("touch-tooltip-dialog-local");
    }

    const targetBox = target.getBoundingClientRect();
    const tooltipBox = tooltip.getBoundingClientRect();
    const margin = 10;
    const left = Math.max(
      margin,
      Math.min(window.innerWidth - tooltipBox.width - margin, targetBox.left + targetBox.width / 2 - tooltipBox.width / 2)
    );
    const aboveTop = targetBox.top - tooltipBox.height - 8;
    const top = aboveTop >= margin ? aboveTop : Math.min(window.innerHeight - tooltipBox.height - margin, targetBox.bottom + 8);
    const hostBox = !usesTopLayer && dialog ? dialog.getBoundingClientRect() : { left: 0, top: 0 };
    const hostScrollLeft = !usesTopLayer && dialog ? dialog.scrollLeft : 0;
    const hostScrollTop = !usesTopLayer && dialog ? dialog.scrollTop : 0;
    tooltip.style.left = `${left - hostBox.left + hostScrollLeft}px`;
    tooltip.style.top = `${Math.max(margin, top) - hostBox.top + hostScrollTop}px`;
    tooltip.classList.add("visible");
    target.classList.add("touch-tooltip-open");
    target.blur?.();
    tooltipTarget = target;
    window.getSelection?.()?.removeAllRanges?.();
    suppressClickTarget = target;
    scheduleHide();
  };

  const resetPress = () => {
    clearTimer();
    activeTarget = null;
    document.removeEventListener("pointermove", handleMove, true);
    document.removeEventListener("pointerup", handleEnd, true);
    document.removeEventListener("pointercancel", handleEnd, true);
  };

  function handleMove(event) {
    if (!activeTarget) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (distance > moveCancelDistance) resetPress();
  }

  function handleEnd() {
    resetPress();
  }

  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.button !== 0) return;
    const target = closestEventTarget(event, selector);
    if (!target || !root.contains(target) || target.disabled) return;
    hideTooltip();
    clearTimer();
    activeTarget = target;
    startX = event.clientX;
    startY = event.clientY;
    timer = window.setTimeout(() => {
      timer = null;
      if (!activeTarget) return;
      showTooltip(activeTarget);
    }, holdDelayMs);
    document.addEventListener("pointermove", handleMove, true);
    document.addEventListener("pointerup", handleEnd, true);
    document.addEventListener("pointercancel", handleEnd, true);
  }, { capture: true });

  root.addEventListener("click", (event) => {
    if (!suppressClickTarget) return;
    const target = closestEventTarget(event, selector);
    if (!target) return;
    if (target !== suppressClickTarget) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickTarget = null;
  }, true);

  root.addEventListener("contextmenu", (event) => {
    const target = closestEventTarget(event, selector);
    if (!target || !root.contains(target) || target.disabled) return;
    event.preventDefault();
  });

  root.addEventListener("selectstart", (event) => {
    const target = closestEventTarget(event, selector);
    if (!target || !root.contains(target) || target.disabled) return;
    event.preventDefault();
  });

  document.addEventListener("pointerdown", (event) => {
    if (tooltip && !tooltip.contains(event.target)) hideTooltip();
    if (suppressClickTarget && closestEventTarget(event, selector) !== suppressClickTarget) suppressClickTarget = null;
  }, true);
}
