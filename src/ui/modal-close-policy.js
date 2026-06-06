export function bindDialogBackdropClickGuard(dialog, shouldKeepOpen = () => false) {
  if (!dialog || typeof dialog.addEventListener !== "function") return () => {};
  const listenerOptions = { capture: true };
  const preventBackdropClick = (event) => {
    if (event.target !== dialog || !shouldKeepOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  dialog.addEventListener("click", preventBackdropClick, listenerOptions);
  return () => dialog.removeEventListener("click", preventBackdropClick, listenerOptions);
}

export function bindFilePickerDialogDismissGuard(dialog, inputs = [], {
  maxActiveMs = 30000,
  now = () => Date.now(),
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  if (!dialog || typeof dialog.addEventListener !== "function") return () => {};
  const listenerOptions = { capture: true };
  const triggers = collectFilePickerTriggers(inputs);
  let active = false;
  let activeUntil = 0;
  let timer = null;

  const clear = () => {
    active = false;
    activeUntil = 0;
    if (timer && typeof clearTimeoutFn === "function") clearTimeoutFn(timer);
    timer = null;
  };
  const arm = () => {
    active = true;
    activeUntil = now() + maxActiveMs;
    if (timer && typeof clearTimeoutFn === "function") clearTimeoutFn(timer);
    timer = typeof setTimeoutFn === "function" ? setTimeoutFn(clear, maxActiveMs) : null;
  };
  const isActive = () => {
    if (!active) return false;
    if (now() <= activeUntil) return true;
    clear();
    return false;
  };
  const consume = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    clear();
  };
  const handleDialogClick = (event) => {
    if (!isActive()) return;
    if (event.target === dialog) {
      consume(event);
      return;
    }
    clear();
  };
  const handleDialogCancel = (event) => {
    if (isActive()) consume(event);
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("pointerdown", arm, listenerOptions);
    trigger.addEventListener("mousedown", arm, listenerOptions);
    trigger.addEventListener("touchstart", arm, listenerOptions);
    trigger.addEventListener("click", arm, listenerOptions);
    trigger.addEventListener("focus", arm, listenerOptions);
    trigger.addEventListener("change", clear, listenerOptions);
  });
  dialog.addEventListener("click", handleDialogClick, listenerOptions);
  dialog.addEventListener("cancel", handleDialogCancel, listenerOptions);

  return () => {
    clear();
    triggers.forEach((trigger) => {
      trigger.removeEventListener("pointerdown", arm, listenerOptions);
      trigger.removeEventListener("mousedown", arm, listenerOptions);
      trigger.removeEventListener("touchstart", arm, listenerOptions);
      trigger.removeEventListener("click", arm, listenerOptions);
      trigger.removeEventListener("focus", arm, listenerOptions);
      trigger.removeEventListener("change", clear, listenerOptions);
    });
    dialog.removeEventListener("click", handleDialogClick, listenerOptions);
    dialog.removeEventListener("cancel", handleDialogCancel, listenerOptions);
  };
}

function collectFilePickerTriggers(inputs) {
  const result = new Set();
  (Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean).forEach((input) => {
    if (typeof input.addEventListener === "function") result.add(input);
    const label = input.closest?.("label");
    if (label && typeof label.addEventListener === "function") result.add(label);
  });
  return [...result];
}
