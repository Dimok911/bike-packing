export function bindSettingsPointerDrag({
  addRootContainerToActiveLayout,
  cleanupLayoutDropState,
  dropList,
  getCurrentView = () => "",
  getLayoutPlaceholderIndex,
  getLayoutRowAfterPointer,
  getPackingRoot = () => null,
  getPackingTab = () => document.querySelector?.('.tab[data-view="packing"]') || null,
  getColumnPlaceholderIndex = null,
  getState,
  getTouchPoint,
  onBeforePackingDragEnter = () => {},
  isHoldDragInput,
  markDragPending,
  pointerDragStartDistance,
  preventDragContextMenu,
  render,
  switchToPacking = () => {},
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
    const sourceIsRootCatalog = Boolean(handle.dataset.rootDrag);
    const originalLayoutIndex = sourceIsLayoutMember
      ? (state.layouts[state.activeLayoutId]?.rootContainerIds || []).indexOf(containerId)
      : -1;
    void originalLayoutIndex;
    const dragInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
    const needsHold = isHoldDragInput(dragInput);
    let holdTimer = null;
    let packingDrop = null;
    let packingDropBoard = null;

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
      cleanupPackingDropState();
      clearPackingPortalTabTarget();
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

    const getPackingPortalTabTarget = (target) => {
      const tab = getPackingTab?.();
      if (!tab || !target) return null;
      return target === tab || tab.contains(target) ? tab : null;
    };

    const clearPackingPortalTabTarget = () => {
      getPackingTab?.()?.classList?.remove("drag-over");
    };

    const cleanupLayoutListDropState = () => {
      if (placeholder.parentElement === dropList) {
        cleanupLayoutDropState(dropList, placeholder);
        return;
      }
      dropList?.classList.remove("drag-over");
    };

    const cleanupPackingDropState = () => {
      const packingRoot = getPackingRoot?.();
      packingRoot?.querySelectorAll?.(".dropzone.drag-over").forEach((zone) => zone.classList.remove("drag-over"));
      packingRoot?.querySelectorAll?.(".subcontainer.container-drop-target").forEach((container) => container.classList.remove("container-drop-target"));
      placeholder.remove();
      packingDrop = null;
      packingDropBoard = null;
    };

    const getPackingColumnPlaceholderIndex = (board) => {
      if (typeof getColumnPlaceholderIndex === "function") {
        return getColumnPlaceholderIndex(board, placeholder, containerId);
      }
      const entries = [...(board?.children || [])].filter((child) =>
        child === placeholder ||
        (
          child.classList?.contains("container-card") &&
          child.dataset.rootContainerId !== containerId &&
          !child.classList.contains("dragging")
        )
      );
      const index = entries.indexOf(placeholder);
      return index >= 0 ? index : entries.length;
    };

    const getColumnAfterPointer = (board, pointerX) => {
      const cards = [...(board?.children || [])].filter((child) =>
        child.classList?.contains("container-card") &&
        child.dataset.rootContainerId !== containerId &&
        !child.classList.contains("dragging")
      );
      return cards.reduce(
        (closest, card) => {
          const box = card.getBoundingClientRect();
          const offset = pointerX - box.left - box.width / 2;
          if (offset < 0 && offset > closest.offset) return { offset, card };
          return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, card: null }
      ).card;
    };

    const placePlaceholder = (parent, beforeNode = null) => {
      if (!parent) return;
      const targetNext = beforeNode || null;
      if (placeholder.parentElement === parent && placeholder.nextElementSibling === targetNext) return;
      if (beforeNode) parent.insertBefore(placeholder, beforeNode);
      else if (placeholder.parentElement !== parent || placeholder.nextElementSibling) parent.appendChild(placeholder);
    };

    const packingColumnPlaceholderWidth = (board) => {
      const reference = board?.querySelector?.(".container-card");
      const referenceWidth = reference?.getBoundingClientRect?.().width || 0;
      if (referenceWidth) return referenceWidth;
      const boardWidth = board?.clientWidth || window.innerWidth || 360;
      const isMobile = window.matchMedia?.("(max-width: 560px)")?.matches;
      if (isMobile) return Math.max(285, boardWidth - 36);
      return Math.min(360, Math.max(300, boardWidth - 12));
    };

    const setPackingColumnPlaceholderSize = (board) => {
      const width = packingColumnPlaceholderWidth(board);
      placeholder.style.width = `${width}px`;
      placeholder.style.height = "";
      placeholder.style.maxWidth = "none";
      placeholder.style.minHeight = "";
    };

    const setLayoutPlaceholderSize = (box) => {
      placeholder.style.height = `${box.height}px`;
      placeholder.style.width = `${box.width}px`;
      placeholder.style.maxWidth = "100%";
      placeholder.style.minHeight = "";
    };

    const placePacking = (target, clientX, clientY) => {
      const packingRoot = getPackingRoot?.();
      if (!packingRoot || !target || !packingRoot.contains(target)) {
        cleanupPackingDropState();
        return false;
      }

      const board = packingRoot.querySelector?.(".board");
      const boardTarget = target.closest?.(".board");
      if (board && boardTarget === board) {
        packingRoot.querySelectorAll?.(".dropzone.drag-over").forEach((entry) => entry.classList.remove("drag-over"));
        packingRoot.querySelectorAll?.(".subcontainer.container-drop-target").forEach((entry) => entry.classList.remove("container-drop-target"));
        placeholder.className = "column-placeholder";
        setPackingColumnPlaceholderSize(board);
        placePlaceholder(board, getColumnAfterPointer(board, clientX));
        packingDrop = {
          type: "root",
          index: getPackingColumnPlaceholderIndex(board)
        };
        packingDropBoard = board;
        return true;
      }

      if (packingDrop && packingDropBoard && packingRoot.contains(target)) {
        return true;
      }

      cleanupPackingDropState();
      return false;
    };

    const place = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);
      if (sourceIsRootCatalog) {
        const packingTab = getPackingPortalTabTarget(target);
        if (packingTab && getCurrentView?.() !== "packing") {
          packingTab.classList.add("drag-over");
          cleanupLayoutListDropState();
          cleanupPackingDropState();
          onBeforePackingDragEnter();
          switchToPacking?.();
          return;
        }
        clearPackingPortalTabTarget();
        if (getCurrentView?.() === "packing") {
          cleanupLayoutListDropState();
          placePacking(target, clientX, clientY);
          return;
        }
      }
      if (!target || !dropList.contains(target)) {
        cleanupLayoutDropState(dropList, placeholder);
        return;
      }
      cleanupPackingDropState();
      placeholder.className = "drop-placeholder";
      setLayoutPlaceholderSize(sourceRow.getBoundingClientRect());
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
      } else if (!canceled && started && sourceIsRootCatalog && packingDrop) {
        endEvent.preventDefault();
        dropped = true;
        if (packingDrop.type === "root") {
          addRootContainerToActiveLayout(containerId, packingDrop.index, { closeDialog: false, renderAfter: false });
        }
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
