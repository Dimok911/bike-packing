const activeCopyProgress = new Map();

export function beginSharedLayoutCopyProgress({
  layoutId = "",
  name = "",
  triggerButton = null,
  toastRegion = null,
  documentRef = globalThis.document,
  t = (key) => key
} = {}) {
  const key = String(layoutId || "").trim();
  if (!key || activeCopyProgress.has(key)) return null;

  const buttons = sharedLayoutCopyButtons(documentRef, key, triggerButton);
  const buttonSnapshots = buttons.map((button) => ({
    button,
    text: button.textContent,
    disabled: button.disabled,
    ariaBusy: button.getAttribute("aria-busy")
  }));
  const panel = documentRef?.createElement?.("div") || null;
  const label = documentRef?.createElement?.("div") || null;
  const progress = documentRef?.createElement?.("progress") || null;
  if (panel && label && progress) {
    panel.className = "toast template-copy-progress";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    label.className = "template-copy-progress-label";
    progress.className = "template-copy-progress-bar";
    progress.max = 100;
    progress.value = 0;
    panel.append(label, progress);
    toastRegion?.appendChild?.(panel);
  }

  const controller = {
    update(percent, stageKey) {
      const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
      const stage = t(stageKey);
      const statusText = t("shared.copyProgress", { name, percent: value, stage });
      const buttonText = t("shared.copyProgressButton", { percent: value });
      buttonSnapshots.forEach(({ button }) => {
        if (!button?.isConnected && button !== triggerButton) return;
        button.disabled = true;
        button.classList.add("button-loading");
        button.setAttribute("aria-busy", "true");
        button.textContent = buttonText;
      });
      if (label) label.textContent = statusText;
      if (progress) progress.value = value;
      return statusText;
    },
    finish() {
      controller.update(100, "shared.copyStageDone");
      restoreButtons(buttonSnapshots);
      globalThis.setTimeout?.(() => panel?.remove?.(), 900);
      activeCopyProgress.delete(key);
    },
    cancel() {
      restoreButtons(buttonSnapshots);
      panel?.remove?.();
      activeCopyProgress.delete(key);
    },
    fail(message = "") {
      restoreButtons(buttonSnapshots);
      if (label) label.textContent = message || t("shared.copyFailed");
      panel?.classList?.add("error");
      globalThis.setTimeout?.(() => panel?.remove?.(), 3600);
      activeCopyProgress.delete(key);
    }
  };

  activeCopyProgress.set(key, controller);
  controller.update(5, "shared.copyStagePreparing");
  return controller;
}

export function isSharedLayoutCopyInProgress(layoutId) {
  return activeCopyProgress.has(String(layoutId || "").trim());
}

function sharedLayoutCopyButtons(documentRef, layoutId, triggerButton) {
  const buttons = [];
  if (triggerButton) buttons.push(triggerButton);
  const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(layoutId) : layoutId.replace(/["\\]/g, "\\$&");
  documentRef?.querySelectorAll?.(`[data-copy-shared-layout="${escapedId}"]`)?.forEach?.((button) => {
    if (!buttons.includes(button)) buttons.push(button);
  });
  return buttons;
}

function restoreButtons(snapshots) {
  snapshots.forEach(({ button, text, disabled, ariaBusy }) => {
    if (!button) return;
    button.disabled = disabled;
    button.classList.remove("button-loading");
    button.textContent = text;
    if (ariaBusy == null) button.removeAttribute("aria-busy");
    else button.setAttribute("aria-busy", ariaBusy);
  });
}
