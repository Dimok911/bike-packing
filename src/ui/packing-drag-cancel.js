export function isPointInPackingDragCancelTarget(clientX, clientY, rect, padding = 0) {
  if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
  return clientX >= rect.left - padding && clientX <= rect.right + padding &&
    clientY >= rect.top - padding && clientY <= rect.bottom + padding;
}

export function getPackingDragCancelTargetTop({
  stickyBottom,
  viewportTop,
  viewportHeight,
  targetHeight,
  gap = 8
}) {
  const desiredTop = Math.max(viewportTop + gap, stickyBottom + gap);
  const maximumTop = viewportTop + viewportHeight - targetHeight - gap;
  return Math.max(viewportTop + gap, Math.min(desiredTop, maximumTop));
}

export function createPackingDragCancelTarget({
  getLabel = () => "",
  getStickyBottom = () => 0,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  let element = null;
  let active = false;

  const syncPosition = () => {
    if (!element) return;
    const viewportTop = windowRef?.visualViewport?.offsetTop || 0;
    const viewportHeight = windowRef?.visualViewport?.height || windowRef?.innerHeight || 0;
    const targetHeight = element.getBoundingClientRect?.().height || 54;
    const stickyBottom = getStickyBottom({ viewportTop, viewportHeight });
    const top = getPackingDragCancelTargetTop({
      stickyBottom,
      viewportTop,
      viewportHeight,
      targetHeight
    });
    element.style.top = `${top}px`;
  };

  const show = () => {
    documentRef?.querySelector?.(".packing-drag-cancel-target")?.remove?.();
    element = documentRef?.createElement?.("div") || null;
    if (!element) return;
    element.className = "packing-drag-cancel-target";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    const icon = documentRef.createElement("span");
    icon.className = "packing-drag-cancel-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↩";
    const label = documentRef.createElement("span");
    label.textContent = getLabel?.() || "";
    element.append(icon, label);
    documentRef.body?.appendChild?.(element);
    syncPosition();
  };

  const update = (clientX, clientY) => {
    if (!element) return false;
    syncPosition();
    const nextActive = isPointInPackingDragCancelTarget(clientX, clientY, element.getBoundingClientRect(), 6);
    if (nextActive !== active) {
      active = nextActive;
      element.classList.toggle("is-active", active);
      if (active) windowRef?.navigator?.vibrate?.(8);
    }
    return active;
  };

  const hide = () => {
    active = false;
    element?.remove?.();
    element = null;
  };

  return {
    hide,
    isActive: () => active,
    show,
    update
  };
}
