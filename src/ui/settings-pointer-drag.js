export function bindSettingsPointerDrag({
  addRootContainerToActiveLayout,
  cleanupLayoutDropState,
  dropList,
  getLayoutPlaceholderIndex,
  getLayoutRowAfterPointer,
  getState,
  getTouchPoint,
  isHoldDragInput,
  markDragPending,
  pointerDragStartDistance,
  preventDragContextMenu,
  render,
  touchDragCancelDistance,
  touchDragDelayMs,
  touchScrollCancelDistance,
  vibrateDragStart,
  clearDragPending
} = {}) {
  if (!dropList) return;

  const startDrag = ({ handle, event, inputType = "pointer" }) => {
    const point = inputType === "touch" ? getTouchPoint(event) : event;
    if (!point) return;
    if (inputType !== "touch" && event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, label")) return;
    const state = getState();
    const containerId = handle.dataset.layoutMemberRowDrag || handle.dataset.rootDrag;
    const sourceRow = handle.closest(".layout-member-row, .root-container-card");
    if (!containerId || !sourceRow || !state.containers[containerId]) return;

    const placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
    const ghost = sourceRow.cloneNode(true);
    ghost.classList.add("settings-drag-ghost");
    const startX = point.clientX;
    const startY = point.clientY;
    let latestX = startX;
    let latestY = startY;
    let started = false;
    let dropped = false;
    let canceled = false;
    let finished = false;
    let blockingTouchMove = false;
    const sourceIsLayoutMember = Boolean(handle.dataset.layoutMemberRowDrag);
    const originalLayoutIndex = sourceIsLayoutMember
      ? (state.layouts[state.activeLayoutId]?.rootContainerIds || []).indexOf(containerId)
      : -1;
    void originalLayoutIndex;
    const dragInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
    const needsHold = isHoldDragInput(dragInput);
    let holdTimer = null;

    if (needsHold) {
      markDragPending(sourceRow);
      if (inputType !== "touch") {
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
      }
    }

    const cleanup = () => {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (inputType !== "touch" && handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      clearDragPending(sourceRow);
      sourceRow.classList.remove("dragging");
      sourceRow.classList.remove("drag-origin");
      sourceRow.classList.remove("drag-source-collapsed");
      ghost.remove();
      cleanupLayoutDropState(dropList, placeholder);
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
      document.removeEventListener("keydown", onKeyDown);
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
      ghost.style.width = `${box.width}px`;
      ghost.style.left = `${box.left}px`;
      ghost.style.top = `${box.top}px`;
      placeholder.style.height = `${box.height}px`;
      placeholder.style.width = `${box.width}px`;
      placeholder.style.maxWidth = "100%";
      document.body.appendChild(ghost);
      sourceRow.classList.add("dragging", "drag-origin");
      if (sourceIsLayoutMember) {
        dropList.insertBefore(placeholder, sourceRow);
        sourceRow.classList.add("drag-source-collapsed");
      }
      document.body.classList.add("dragging-ui");
      vibrateDragStart(dragInput);
      moveGhost(latestX, latestY);
      place(latestX, latestY);
    };

    const moveGhost = (clientX, clientY) => {
      ghost.style.transform = `translate(${clientX - startX}px, ${clientY - startY}px)`;
    };

    const place = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || !dropList.contains(target)) {
        cleanupLayoutDropState(dropList, placeholder);
        return;
      }
      dropList.classList.add("drag-over");
      const afterRow = getLayoutRowAfterPointer(dropList, clientY);
      if (afterRow) dropList.insertBefore(placeholder, afterRow);
      else dropList.appendChild(placeholder);
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
            if (holdTimer) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
            canceled = true;
            clearDragPending(sourceRow);
          }
          return;
        }
        if (Math.hypot(dx, dy) < pointerDragStartDistance) return;
        start();
      }
      moveEvent.preventDefault();
      start();
      moveGhost(latestX, latestY);
      place(latestX, latestY);
    };

    const onEnd = (endEvent) => {
      if (finished) return;
      finished = true;
      if (holdTimer) window.clearTimeout(holdTimer);
      if (!canceled && started && placeholder.parentElement === dropList) {
        endEvent.preventDefault();
        dropped = true;
        const targetIndex = getLayoutPlaceholderIndex(dropList, placeholder);
        addRootContainerToActiveLayout(containerId, targetIndex, { closeDialog: false, renderAfter: false });
      }
      if (started) {
        sourceRow.dataset.justDragged = "true";
        window.setTimeout(() => {
          delete sourceRow.dataset.justDragged;
        }, 250);
      }
      cleanup();
      if (dropped) render();
    };

    const onKeyDown = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      canceled = true;
      onEnd(keyEvent);
    };

    if (needsHold) {
      holdTimer = window.setTimeout(start, touchDragDelayMs);
    }
    if (inputType === "touch") {
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", onEnd, { passive: false });
      document.addEventListener("touchcancel", onEnd, { passive: false });
    } else {
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd, { passive: false });
      document.addEventListener("pointercancel", onEnd, { passive: false });
    }
    document.addEventListener("keydown", onKeyDown);
  };

  document.querySelectorAll("[data-layout-member-row-drag], [data-root-drag]").forEach((handle) => {
    handle.draggable = false;
    handle.addEventListener("contextmenu", preventDragContextMenu);
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      startDrag({ handle, event });
    });
    handle.addEventListener("touchstart", (event) => {
      startDrag({ handle, event, inputType: "touch" });
    }, { passive: true });
  });
}
