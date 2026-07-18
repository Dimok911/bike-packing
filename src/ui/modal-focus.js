export function currentPageScrollPosition() {
  const body = document.body;
  const locked = body?.classList.contains("modal-scroll-locked") && body.style.position === "fixed";
  if (!locked) {
    return {
      x: window.scrollX || 0,
      y: window.scrollY || 0
    };
  }
  const lockedX = Number.parseFloat(body.style.left || "");
  const lockedY = Number.parseFloat(body.style.top || "");
  return {
    x: Number.isFinite(lockedX) ? Math.max(0, -lockedX) : (window.scrollX || 0),
    y: Number.isFinite(lockedY) ? Math.max(0, -lockedY) : (window.scrollY || 0)
  };
}

export function closeDialogWithoutRestoringFocus(dialog, returnValue = "") {
  if (!dialog?.open) return Promise.resolve();
  const scroll = currentPageScrollPosition();
  dialog.close(returnValue);
  const restore = () => {
    const active = document.activeElement;
    if (active && active !== document.body && !dialog.contains(active)) active.blur();
    window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "auto" });
  };
  return Promise.all([
    new Promise((resolve) => requestAnimationFrame(() => { restore(); resolve(); })),
    new Promise((resolve) => window.setTimeout(() => { restore(); resolve(); }, 80)),
    new Promise((resolve) => window.setTimeout(() => { restore(); resolve(); }, 180))
  ]);
}

export function resetDialogScrollPosition(
  dialog,
  { requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback) } = {}
) {
  if (!dialog) return false;
  const reset = () => {
    dialog.scrollTop = 0;
    const card = dialog.querySelector?.(".dialog-card");
    if (card) card.scrollTop = 0;
  };
  reset();
  requestFrame(reset);
  return true;
}

export function setupDialogKeyboardScrollGuard(dialogs = []) {
  const trackedDialogs = dialogs.filter(Boolean);
  if (!trackedDialogs.length) return;
  let focusLock = null;
  let restoreFrame = null;

  const shouldGuard = () => {
    try {
      return window.visualViewport || window.matchMedia?.("(pointer: coarse), (max-width: 760px)")?.matches;
    } catch {
      return true;
    }
  };

  const scheduleRestore = () => {
    if (!focusLock || restoreFrame) return;
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = null;
      restoreFocusedDialogPosition();
    });
  };

  const restoreFocusedDialogPosition = () => {
    if (!focusLock?.dialog?.open || document.activeElement !== focusLock.field) return;
    const { x, y } = focusLock.pageScroll;
    window.scrollTo({ left: x, top: y, behavior: "auto" });
    scrollFieldIntoDialogViewport(focusLock);
  };

  const captureFocusLock = (event) => {
    const field = event.target;
    if (!field?.matches?.("input, textarea, select")) return;
    if (!shouldGuard()) return;
    const dialog = trackedDialogs.find((candidate) => candidate.open && candidate.contains(field));
    if (!dialog) return;
    focusLock = {
      dialog,
      field,
      scroller: field.closest(".dialog-card") || dialog,
      pageScroll: currentPageScrollPosition()
    };
    dialog.classList.add("keyboard-focus-active");
    scheduleRestore();
    window.setTimeout(scheduleRestore, 80);
    window.setTimeout(scheduleRestore, 180);
    window.setTimeout(scheduleRestore, 360);
    window.setTimeout(scheduleRestore, 650);
  };

  const releaseFocusLock = () => {
    window.setTimeout(() => {
      if (focusLock && document.activeElement !== focusLock.field) {
        focusLock.dialog?.classList.remove("keyboard-focus-active");
        focusLock = null;
      }
    }, 80);
  };

  trackedDialogs.forEach((dialog) => {
    dialog.addEventListener("focusin", captureFocusLock);
    dialog.addEventListener("focusout", releaseFocusLock);
    dialog.addEventListener("close", () => {
      dialog.classList.remove("keyboard-focus-active");
      focusLock = null;
    });
  });
  window.visualViewport?.addEventListener("resize", scheduleRestore, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleRestore, { passive: true });
}

function scrollFieldIntoDialogViewport({ field, scroller }) {
  if (!field?.isConnected || !scroller) return;
  const viewport = window.visualViewport;
  const visibleTop = (viewport?.offsetTop || 0) + 12;
  const keyboardOpen = viewport && viewport.height < window.innerHeight - 80;
  const bottomReserve = keyboardOpen
    ? (field.matches?.("textarea") ? 96 : 56)
    : 16;
  const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - bottomReserve;
  const rect = field.getBoundingClientRect();
  if (rect.bottom > visibleBottom) {
    scroller.scrollTop += rect.bottom - visibleBottom;
  } else if (rect.top < visibleTop) {
    scroller.scrollTop -= visibleTop - rect.top;
  }
}
