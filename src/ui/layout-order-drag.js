export function bindLayoutOrderPointerDrag({
  list,
  getSections = () => [],
  applySections = () => false,
  moveBeforeInSections = (sections) => sections,
  moveWithinSections = (sections) => sections,
  getTouchPoint = (event) => event.touches?.[0] || event.changedTouches?.[0] || null,
  isHoldDragInput = (input) => input === "touch" || input === "pen",
  markDragPending = (source) => source?.classList?.add("drag-pending"),
  clearDragPending = (source) => source?.classList?.remove("drag-pending"),
  preventDragContextMenu = (event) => event.preventDefault(),
  pointerDragStartDistance = 4,
  touchDragCancelDistance = 10,
  touchDragDelayMs = 260,
  touchScrollCancelDistance = 4,
  vibrateDragStart = () => {}
} = {}) {
  if (!list) return;

  const startDrag = ({ event, inputType = "pointer" }) => {
    const point = inputType === "touch" ? getTouchPoint(event) : event;
    if (!point) return;
    if (inputType !== "touch" && event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, label, a") && !event.target.closest(".layout-order-handle")) return;
    const sourceRow = event.target.closest("[data-layout-order-id]");
    if (!sourceRow || !list.contains(sourceRow)) return;
    const layoutId = sourceRow.dataset.layoutOrderId || "";
    const sectionId = sourceRow.dataset.layoutOrderSection || "";
    const sectionList = sourceRow.closest("[data-layout-order-section-list]");
    if (!layoutId || !sectionId || !sectionList) return;

    const dialog = list.closest("dialog");
    const ghostParent = dialog || document.body;
    const input = inputType === "touch" ? "touch" : event.pointerType || "mouse";
    const needsHold = isHoldDragInput(input);
    const startX = point.clientX;
    const startY = point.clientY;
    let latestX = startX;
    let latestY = startY;
    let started = false;
    let canceled = false;
    let finished = false;
    let blockingTouchMove = false;
    let holdTimer = null;
    let sourceBox = null;
    const placeholder = document.createElement("div");
    placeholder.className = "layout-order-placeholder";
    const ghost = sourceRow.cloneNode(true);
    ghost.classList.add("layout-order-drag-ghost");
    ghost.removeAttribute("data-layout-order-id");
    ghost.removeAttribute("draggable");

    if (needsHold) {
      markDragPending(sourceRow);
      if (inputType !== "touch") {
        event.preventDefault();
        sourceRow.setPointerCapture?.(event.pointerId);
      }
    }

    const setPlaceholderSize = () => {
      const box = sourceBox || sourceRow.getBoundingClientRect();
      placeholder.style.height = `${box.height}px`;
      placeholder.style.width = `${box.width}px`;
      placeholder.style.maxWidth = "100%";
    };

    const moveGhost = (clientX, clientY) => {
      ghost.style.transform = `translate(${clientX - startX}px, ${clientY - startY}px)`;
    };

    const rowAfterPointer = (clientY) => {
      const rows = [...sectionList.children].filter((child) =>
        child.classList?.contains("layout-order-row") &&
        child !== sourceRow &&
        !child.classList.contains("dragging")
      );
      return rows.reduce(
        (closest, row) => {
          const box = row.getBoundingClientRect();
          const offset = clientY - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) return { offset, row };
          return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, row: null }
      ).row;
    };

    const placePlaceholder = (beforeRow = null) => {
      if (beforeRow) sectionList.insertBefore(placeholder, beforeRow);
      else if (placeholder.parentElement !== sectionList || placeholder.nextElementSibling) sectionList.appendChild(placeholder);
    };

    const start = () => {
      if (started || canceled) return;
      started = true;
      if (inputType === "touch" && !blockingTouchMove) {
        document.removeEventListener("touchmove", onMove);
        document.addEventListener("touchmove", onMove, { passive: false });
        blockingTouchMove = true;
      } else {
        event.preventDefault();
      }
      clearDragPending(sourceRow);
      const box = sourceRow.getBoundingClientRect();
      sourceBox = box;
      ghost.style.width = `${box.width}px`;
      ghost.style.left = `${box.left}px`;
      ghost.style.top = `${box.top}px`;
      setPlaceholderSize();
      sourceRow.classList.add("dragging", "drag-source-collapsed");
      document.body.classList.add("dragging-ui");
      ghostParent.appendChild(ghost);
      sectionList.insertBefore(placeholder, sourceRow);
      vibrateDragStart(input);
      moveGhost(latestX, latestY);
      place(latestY);
    };

    const place = (clientY) => {
      setPlaceholderSize();
      sectionList.classList.add("drag-over");
      placePlaceholder(rowAfterPointer(clientY));
    };

    const cleanup = () => {
      if (holdTimer) window.clearTimeout(holdTimer);
      if (inputType !== "touch" && sourceRow.hasPointerCapture?.(event.pointerId)) {
        sourceRow.releasePointerCapture(event.pointerId);
      }
      clearDragPending(sourceRow);
      sourceRow.classList.remove("dragging", "drag-source-collapsed");
      sectionList.classList.remove("drag-over");
      placeholder.remove();
      ghost.remove();
      document.body.classList.remove("dragging-ui");
      if (inputType === "touch") {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
        document.removeEventListener("touchcancel", onEnd);
      } else {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onEnd);
      }
      document.removeEventListener("keydown", onKeyDown, true);
      dialog?.removeEventListener("cancel", onDialogCancel);
    };

    const onMove = (moveEvent) => {
      const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
      if (!movePoint || canceled) return;
      latestX = movePoint.clientX;
      latestY = movePoint.clientY;
      const dx = latestX - startX;
      const dy = latestY - startY;
      if (!started) {
        if (needsHold) {
          const distance = Math.hypot(dx, dy);
          const cancelDistance = inputType === "touch" ? touchScrollCancelDistance : touchDragCancelDistance;
          if (distance > cancelDistance) {
            canceled = true;
            clearDragPending(sourceRow);
            if (holdTimer) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
          }
          return;
        }
        if (Math.hypot(dx, dy) < pointerDragStartDistance) return;
        start();
      }
      moveEvent.preventDefault();
      start();
      moveGhost(latestX, latestY);
      place(latestY);
    };

    const onEnd = (endEvent) => {
      if (finished) return;
      finished = true;
      if (!canceled && started && placeholder.parentElement === sectionList) {
        endEvent.preventDefault();
        const beforeId = placeholder.nextElementSibling?.dataset?.layoutOrderId || "";
        const nextSections = beforeId
          ? moveBeforeInSections(getSections(), layoutId, beforeId)
          : moveWithinSections(getSections(), layoutId, Number.MAX_SAFE_INTEGER);
        applySections(nextSections);
      }
      cleanup();
    };

    const cancelDrag = (cancelEvent) => {
      cancelEvent?.preventDefault?.();
      cancelEvent?.stopPropagation?.();
      canceled = true;
      onEnd(cancelEvent || event);
    };

    const onKeyDown = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      cancelDrag(keyEvent);
    };

    const onDialogCancel = (cancelEvent) => {
      cancelDrag(cancelEvent);
    };

    if (needsHold) holdTimer = window.setTimeout(start, touchDragDelayMs);
    if (inputType === "touch") {
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", onEnd, { passive: false });
      document.addEventListener("touchcancel", onEnd, { passive: false });
    } else {
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd, { passive: false });
      document.addEventListener("pointercancel", onEnd, { passive: false });
    }
    document.addEventListener("keydown", onKeyDown, true);
    dialog?.addEventListener("cancel", onDialogCancel);
  };

  list.addEventListener("contextmenu", preventDragContextMenu);
  list.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    startDrag({ event });
  });
  list.addEventListener("touchstart", (event) => {
    startDrag({ event, inputType: "touch" });
  }, { passive: true });
}
