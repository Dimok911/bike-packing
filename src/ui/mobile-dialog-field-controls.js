const NOTE_MIN_HEIGHT_PX = 96;
const NOTE_MAX_VIEWPORT_RATIO = 0.65;
const NOTE_MAX_HEIGHT_PX = 560;
const NOTE_KEYBOARD_STEP_PX = 32;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function noteResizeBounds({ viewportHeight = 0 } = {}) {
  const viewportMaximum = Math.floor((Number(viewportHeight) || NOTE_MAX_HEIGHT_PX) * NOTE_MAX_VIEWPORT_RATIO);
  return {
    min: NOTE_MIN_HEIGHT_PX,
    max: Math.max(NOTE_MIN_HEIGHT_PX, Math.min(NOTE_MAX_HEIGHT_PX, viewportMaximum))
  };
}

export function nextNoteHeight(currentHeight, deltaY, options = {}) {
  const bounds = noteResizeBounds(options);
  return clamp((Number(currentHeight) || bounds.min) + (Number(deltaY) || 0), bounds.min, bounds.max);
}

export function categoryScrollMaximum(list) {
  return Math.max(0, Math.round((Number(list?.scrollHeight) || 0) - (Number(list?.clientHeight) || 0)));
}

function bindNoteResize(textarea, handle, windowRef) {
  if (!textarea || !handle) return () => {};
  let activePointerId = null;
  let startY = 0;
  let startHeight = 0;

  const viewportHeight = () => Number(windowRef?.visualViewport?.height || windowRef?.innerHeight) || NOTE_MAX_HEIGHT_PX;
  const setHeight = (height) => {
    const bounds = noteResizeBounds({ viewportHeight: viewportHeight() });
    const next = clamp(height, bounds.min, bounds.max);
    textarea.style.height = `${Math.round(next)}px`;
    textarea.style.minHeight = `${bounds.min}px`;
    handle.setAttribute?.("aria-valuemin", String(bounds.min));
    handle.setAttribute?.("aria-valuemax", String(bounds.max));
    handle.setAttribute?.("aria-valuenow", String(Math.round(next)));
    return next;
  };

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    activePointerId = event.pointerId;
    startY = Number(event.clientY) || 0;
    startHeight = textarea.getBoundingClientRect?.().height || textarea.offsetHeight || NOTE_MIN_HEIGHT_PX;
    handle.setPointerCapture?.(event.pointerId);
    handle.classList?.add?.("dragging");
    event.preventDefault?.();
  };

  const onPointerMove = (event) => {
    if (activePointerId == null || event.pointerId !== activePointerId) return;
    setHeight(nextNoteHeight(startHeight, (Number(event.clientY) || 0) - startY, {
      viewportHeight: viewportHeight()
    }));
    event.preventDefault?.();
  };

  const finishPointer = (event) => {
    if (activePointerId == null || event.pointerId !== activePointerId) return;
    handle.releasePointerCapture?.(activePointerId);
    activePointerId = null;
    handle.classList?.remove?.("dragging");
    event.preventDefault?.();
  };

  const onKeyDown = (event) => {
    const currentHeight = textarea.getBoundingClientRect?.().height || textarea.offsetHeight || NOTE_MIN_HEIGHT_PX;
    const bounds = noteResizeBounds({ viewportHeight: viewportHeight() });
    let next = null;
    if (event.key === "ArrowDown") next = currentHeight + NOTE_KEYBOARD_STEP_PX;
    if (event.key === "ArrowUp") next = currentHeight - NOTE_KEYBOARD_STEP_PX;
    if (event.key === "Home") next = bounds.min;
    if (event.key === "End") next = bounds.max;
    if (next == null) return;
    setHeight(next);
    event.preventDefault?.();
  };

  const onViewportResize = () => {
    if (!textarea.style.height) return;
    setHeight(textarea.getBoundingClientRect?.().height || textarea.offsetHeight || NOTE_MIN_HEIGHT_PX);
  };

  handle.setAttribute?.("role", "separator");
  handle.setAttribute?.("aria-orientation", "horizontal");
  handle.addEventListener?.("pointerdown", onPointerDown);
  handle.addEventListener?.("pointermove", onPointerMove);
  handle.addEventListener?.("pointerup", finishPointer);
  handle.addEventListener?.("pointercancel", finishPointer);
  handle.addEventListener?.("keydown", onKeyDown);
  windowRef?.addEventListener?.("resize", onViewportResize, { passive: true });

  return () => {
    handle.removeEventListener?.("pointerdown", onPointerDown);
    handle.removeEventListener?.("pointermove", onPointerMove);
    handle.removeEventListener?.("pointerup", finishPointer);
    handle.removeEventListener?.("pointercancel", finishPointer);
    handle.removeEventListener?.("keydown", onKeyDown);
    windowRef?.removeEventListener?.("resize", onViewportResize);
  };
}

function bindCategoryScroll(list, control, windowRef) {
  if (!list || !control) return () => {};
  let refreshFrame = 0;

  const syncControl = () => {
    refreshFrame = 0;
    const maximum = categoryScrollMaximum(list);
    if (list.scrollTop > maximum) list.scrollTop = maximum;
    control.max = String(maximum);
    control.value = String(clamp(list.scrollTop, 0, maximum));
    control.hidden = maximum <= 1;
    control.disabled = maximum <= 1;
    control.closest?.(".category-picker-shell")?.toggleAttribute?.("data-scrollable", maximum > 1);
  };

  const scheduleSync = () => {
    if (refreshFrame) return;
    refreshFrame = windowRef?.requestAnimationFrame?.(syncControl) || 0;
    if (!refreshFrame) syncControl();
  };

  const onInput = () => {
    list.scrollTop = clamp(control.value, 0, categoryScrollMaximum(list));
  };
  const onListScroll = () => {
    control.value = String(clamp(list.scrollTop, 0, categoryScrollMaximum(list)));
  };

  control.addEventListener?.("input", onInput);
  list.addEventListener?.("scroll", onListScroll, { passive: true });

  const MutationObserverCtor = windowRef?.MutationObserver || globalThis.MutationObserver;
  const mutationObserver = typeof MutationObserverCtor === "function"
    ? new MutationObserverCtor(scheduleSync)
    : null;
  mutationObserver?.observe?.(list, {
    attributes: true,
    attributeFilter: ["hidden"],
    childList: true,
    subtree: true
  });

  const ResizeObserverCtor = windowRef?.ResizeObserver || globalThis.ResizeObserver;
  const resizeObserver = typeof ResizeObserverCtor === "function"
    ? new ResizeObserverCtor(scheduleSync)
    : null;
  resizeObserver?.observe?.(list);
  scheduleSync();

  return () => {
    if (refreshFrame) windowRef?.cancelAnimationFrame?.(refreshFrame);
    mutationObserver?.disconnect?.();
    resizeObserver?.disconnect?.();
    control.removeEventListener?.("input", onInput);
    list.removeEventListener?.("scroll", onListScroll);
  };
}

export function createMobileDialogFieldControls({
  refs = {},
  windowRef = window
} = {}) {
  const cleanups = [
    bindNoteResize(refs.itemNote, refs.itemNoteResizeHandle, windowRef),
    bindNoteResize(refs.rootContainerNote, refs.rootContainerNoteResizeHandle, windowRef),
    bindCategoryScroll(refs.itemCategoryList, refs.itemCategoryScroll, windowRef),
    bindCategoryScroll(refs.rootContainerCategoryList, refs.rootContainerCategoryScroll, windowRef)
  ];

  return {
    destroy() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  };
}
