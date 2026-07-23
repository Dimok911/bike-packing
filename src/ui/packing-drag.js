import { createDeferredBoardHeightLock } from "./packing-board-height-lock.js";
import { createPackingDragCancelTarget } from "./packing-drag-cancel.js";
import {
  shouldSuppressClickAfterDragAttempt,
  suppressNextClickAfterDrag
} from "./drag-click-suppression.js";
import { getPackingEntryAfterPointer } from "./packing-drop-target.js";
import {
  calculatePackingEdgeScroll,
  getPackingBottomScrollRoom,
  getPackingDragBottomBoundary,
  getPackingDragTopBoundary
} from "./packing-edge-scroll.js";
import {
  scrollViewportBy,
  viewportScrollHost,
  viewportScrollLeft,
  viewportScrollTop
} from "./viewport-scroll-host.js";

export function createPackingDragController({
  edgeScrollMaxSpeed,
  edgeScrollZone,
  getContainerItemIdsDeep,
  getCurrentView = () => "",
  getDragCancelLabel = () => "",
  getDescendantContainerIds,
  getDraggingContainerId,
  getDraggingItemId,
  getPackingRoot = () => null,
  getPackingTab = () => document.querySelector?.('.tab[data-view="packing"]') || null,
  getColumnPlaceholderIndex = () => -1,
  getItemContainerIdInLayout,
  getState,
  onBeforePackingDragEnter = () => {},
  isOriginalRootColumnPosition,
  canStartPackingDrag = () => true,
  moveContainer,
  moveContainerIntoContainerTop,
  moveContainerToRoot = () => false,
  moveItem,
  moveItemIntoContainerTop,
  moveRootColumn,
  nestedGroupHoverDelayMs,
  pointerDragStartDistance,
  setDraggingContainerId,
  setDraggingItemId,
  switchToPacking = () => {},
  touchDragCancelDistance,
  touchDragDelayMs,
  touchScrollCancelDistance,
  createGroupFromItems
} = {}) {
  const state = () => getState?.() || {};
  const boardHeightLock = createDeferredBoardHeightLock({ getBoard: getPackingBoard });

  function isHoldDragInput(inputType) {
    return inputType === "touch" || inputType === "pen";
  }

  function needsHoldToDrag(event) {
    return event.pointerType === "touch" || event.pointerType === "pen" || event.type?.startsWith("touch");
  }

  function vibrateDragStart(input) {
    const shouldVibrate = typeof input === "string" ? isHoldDragInput(input) : needsHoldToDrag(input);
    if (!shouldVibrate || !navigator.vibrate) return;
    navigator.vibrate(12);
  }

  function getTouchPoint(event) {
    return event.touches?.[0] || event.changedTouches?.[0] || null;
  }

  function markDragPending(source) {
    source.classList.add("drag-pending");
    document.body.classList.add("drag-pending-ui");
  }

  function clearDragPending(source) {
    source.classList.remove("drag-pending");
    document.body.classList.remove("drag-pending-ui");
  }

  function preventDragContextMenu(event) {
    if (!document.body.classList.contains("drag-pending-ui") && !document.body.classList.contains("dragging-ui")) return;
    event.preventDefault();
  }

  function isCatalogDragActionTarget(target) {
    return Boolean(target?.closest?.("button, input, select, textarea, label, a, [data-photo-controls], [data-photo-open]"));
  }

  function getPackingBoard() {
    return getPackingRoot?.()?.querySelector?.(".board") || null;
  }

  function createDragCancelTarget() {
    return createPackingDragCancelTarget({
      getLabel: getDragCancelLabel,
      getStickyBottom: ({ viewportTop, viewportHeight }) =>
        getPackingDragTopBoundary({ viewportTop, viewportHeight })
    });
  }

  function getPackingPortalTabTarget(target) {
    const tab = getPackingTab?.();
    if (!tab || !target) return null;
    return target === tab || tab.contains(target) ? tab : null;
  }

  function clearPackingPortalTabTarget() {
    getPackingTab?.()?.classList?.remove("drag-over");
  }

  function lockBoardHeightForDrag(board) {
    boardHeightLock.lock(board);
  }

  function deferBoardHeightUnlockUntilScroll(board) {
    boardHeightLock.deferUntilScroll(board);
  }

  function ensureBoardMinHeightForDrag(board, minHeight) {
    boardHeightLock.ensureMinHeight(board, minHeight);
  }

  function fittedDragGhostTop(targetTop, ghost) {
    if (!ghost) return targetTop;
    const viewportTop = window.visualViewport?.offsetTop || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const topLimit = getPackingDragTopBoundary({ viewportTop, viewportHeight }) + 8;
    const bottomLimit = getDragSafeViewportBottom(viewportTop, viewportHeight);
    const ghostHeight = ghost.getBoundingClientRect?.().height || ghost.offsetHeight || 0;
    if (!ghostHeight) return Math.max(topLimit, targetTop);
    return Math.max(topLimit, Math.min(targetTop, bottomLimit - ghostHeight));
  }

  function getDragSafeViewportBottom(viewportTop = window.visualViewport?.offsetTop || 0, viewportHeight = window.visualViewport?.height || window.innerHeight) {
    return getPackingDragBottomBoundary({ viewportTop, viewportHeight, reserveAboveFixedBar: 42 });
  }

  function getDragScrollTriggerBottom(viewportTop = window.visualViewport?.offsetTop || 0, viewportHeight = window.visualViewport?.height || window.innerHeight) {
    return getPackingDragBottomBoundary({ viewportTop, viewportHeight, reserveAboveFixedBar: 16 });
  }

  function setDragGhostPosition(ghost, left, top, { fitTop = true } = {}) {
    if (!ghost) return;
    ghost.style.left = `${left}px`;
    ghost.style.top = `${fitTop ? fittedDragGhostTop(top, ghost) : top}px`;
  }

  function createPreDragScroller(board, startX, startY) {
    let axis = null;
    let lastX = startX;
    let lastY = startY;
    let frame = null;
    let pendingX = 0;
    let pendingY = 0;

    const apply = () => {
      frame = null;
      if (axis === "x" && board) {
        board.scrollLeft -= pendingX;
      } else if (axis === "y") {
        scrollViewportBy({ left: 0, top: -pendingY, behavior: "auto" });
      }
      pendingX = 0;
      pendingY = 0;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const update = (clientX, clientY) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (!axis) {
        if (Math.max(absX, absY) < 5) return;
        axis = absX > absY * 1.15 ? "x" : "y";
      }
      if (axis === "x") {
        pendingX += clientX - lastX;
      } else {
        pendingY += clientY - lastY;
      }
      lastX = clientX;
      lastY = clientY;
      schedule();
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    };

    return { update, stop };
  }

  function createBoardEdgeScroller(board, onScroll, getDragMetrics = () => ({})) {
    let frame = null;
    let speedX = 0;
    let speedY = 0;
    let baseBoardHeight = 0;
    let lastClientY = null;
    let verticalDirection = 0;

    const ensureBottomScrollRoom = (reserve = 0) => {
      if (!board) return;
      const page = viewportScrollHost();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const pageScrollTop = viewportScrollTop();
      const maxScroll = Math.max(0, page.scrollHeight - page.clientHeight);
      const remaining = Math.max(0, maxScroll - pageScrollTop);
      const dragHeight = Math.ceil(Number(getDragMetrics?.()?.height) || 0);
      const currentHeight = parseFloat(board.style.height) || board.getBoundingClientRect?.().height || 0;
      if (!baseBoardHeight) baseBoardHeight = currentHeight;
      const { minBoardHeight } = getPackingBottomScrollRoom({
        baseBoardHeight,
        currentBoardHeight: currentHeight,
        dragHeight,
        remainingScroll: remaining,
        reserve,
        viewportHeight
      });
      ensureBoardMinHeightForDrag(board, minBoardHeight);
    };

    const scrollTarget = (target, delta) => {
      if (!target || !delta) return false;
      const before = target.scrollLeft;
      target.scrollTo({ left: before + delta, behavior: "auto" });
      if (target.scrollLeft !== before) return true;
      target.scrollLeft = before + delta;
      return target.scrollLeft !== before;
    };

    const scrollPageX = (delta) => {
      const page = viewportScrollHost();
      const maxScroll = Math.max(0, page.scrollWidth - page.clientWidth);
      if (!maxScroll) return false;
      const before = viewportScrollLeft();
      scrollViewportBy({ left: delta, top: 0, behavior: "auto" });
      return viewportScrollLeft() !== before;
    };

    const scrollPageY = (delta) => {
      if (delta > 0) ensureBottomScrollRoom();
      const page = viewportScrollHost();
      const maxScroll = Math.max(0, page.scrollHeight - page.clientHeight);
      if (!maxScroll) return false;
      const before = viewportScrollTop();
      scrollViewportBy({ left: 0, top: delta, behavior: "auto" });
      if (viewportScrollTop() !== before) return true;
      page.scrollTop = before + delta;
      return viewportScrollTop() !== before;
    };

    const tick = () => {
      frame = null;
      if (!board || (!speedX && !speedY)) return;
      const movedX = speedX ? (scrollTarget(board, speedX) || scrollPageX(speedX)) : false;
      const movedY = speedY ? scrollPageY(speedY) : false;
      const moved = movedX || movedY;
      if (moved) onScroll?.();
      if (!moved) {
        speedX = 0;
        speedY = 0;
        board.classList.remove("edge-scrolling");
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const update = (clientX, clientY) => {
      if (!board) return;
      if (Number.isFinite(lastClientY)) {
        const deltaY = clientY - lastClientY;
        if (Math.abs(deltaY) >= 0.5) verticalDirection = Math.sign(deltaY);
      }
      lastClientY = clientY;
      const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
      const viewportLeft = window.visualViewport?.offsetLeft || 0;
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const scrollTriggerTop = getPackingDragTopBoundary({ viewportTop, viewportHeight });
      const scrollTriggerBottom = getDragScrollTriggerBottom(viewportTop, viewportHeight);
      const horizontalZone = Math.min(edgeScrollZone, viewportWidth / 3);
      const verticalZone = Math.min(Math.max(edgeScrollZone * 1.5, 60), viewportHeight / 4);
      const dragMetrics = getDragMetrics?.(clientY) || {};
      ({ speedX, speedY } = calculatePackingEdgeScroll({
        clientX,
        clientY,
        maxSpeed: edgeScrollMaxSpeed,
        horizontalZone,
        verticalZone,
        viewportLeft,
        viewportRight,
        topBoundary: scrollTriggerTop,
        bottomBoundary: scrollTriggerBottom,
        dragTop: dragMetrics.top,
        dragBottom: dragMetrics.bottom,
        verticalDirection
      }));
      const page = viewportScrollHost();
      if (speedY > 0) ensureBottomScrollRoom(verticalZone + 80);
      const pageMaxScroll = Math.max(0, page.scrollWidth - page.clientWidth);
      const pageMaxScrollY = Math.max(0, page.scrollHeight - page.clientHeight);
      const pageScrollLeft = viewportScrollLeft();
      const pageScrollTop = viewportScrollTop();
      const canScrollLeft = board.scrollLeft > 0 || pageScrollLeft > 0;
      const canScrollRight = board.scrollLeft < maxScroll || pageScrollLeft < pageMaxScroll;
      const canScrollUp = pageScrollTop > 0;
      const canScrollDown = pageScrollTop < pageMaxScrollY;
      if (speedX < 0 && !canScrollLeft) speedX = 0;
      if (speedX > 0 && !canScrollRight) speedX = 0;
      if (speedY < 0 && !canScrollUp) speedY = 0;
      if (speedY > 0 && !canScrollDown) speedY = 0;
      board.classList.toggle("edge-scrolling", Boolean(speedX || speedY));
      if ((speedX || speedY) && !frame) frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      speedX = 0;
      speedY = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      if (!board) return;
      const lockedLeft = board.scrollLeft;
      board.scrollTo({ left: lockedLeft, behavior: "auto" });
      window.setTimeout(() => {
        board.scrollTo({ left: lockedLeft, behavior: "auto" });
        board.classList.remove("edge-scrolling");
      }, 180);
      deferBoardHeightUnlockUntilScroll(board);
    };

    const pause = () => {
      speedX = 0;
      speedY = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      board?.classList?.remove("edge-scrolling");
    };

    return { pause, update, stop };
  }

  function bindRootColumnDrag(root) {
    const board = root.querySelector(".board");
    if (!board) return;

    root.querySelectorAll(".container-card > .container-header").forEach((header) => {
      header.addEventListener("contextmenu", preventDragContextMenu);
      const startColumnDrag = (event, inputType = "pointer") => {
        const point = inputType === "touch" ? getTouchPoint(event) : event;
        if (!point) return;
        if (inputType !== "touch" && event.button !== 0) return;
        if (event.target.closest("button")) return;
        const source = header.closest(".container-card");
        const containerId = source?.dataset.rootContainerId;
        if (!source || !containerId) return;

        const holdInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
        const needsHold = isHoldDragInput(holdInput);
        if (needsHold) {
          if (inputType !== "touch") markDragPending(source);
          if (inputType !== "touch") {
            event.preventDefault();
            header.setPointerCapture?.(event.pointerId);
          }
        }
        let started = false;
        let canceled = false;
        let finished = false;
        let preScrollGesture = false;
        let dragStartBlocked = false;
        const startX = point.clientX;
        const startY = point.clientY;
        let latestX = startX;
        let latestY = startY;
        let ghost = null;
        let ghostFrame = null;
        let ghostX = startX;
        let ghostY = startY;
        let ghostTargetX = startX;
        let ghostTargetY = startY;
        let currentIndex = -1;
        let nestedTargetContainerId = "";
        let nestedTargetZone = null;
        let holdTimer = null;
        let blockingTouchMove = false;
        const dragCancelTarget = createDragCancelTarget();
        const rect = source.getBoundingClientRect();
        const dragOffsetX = startX - rect.left;
        const dragOffsetY = startY - rect.top;
        const preDragScroller = createPreDragScroller(board, startX, startY);
        const edgeScroller = createBoardEdgeScroller(board, () => {
          if (started) place(latestX, latestY);
        }, () => ({ height: Math.min(rect.height, 180) }));
        const placeholder = document.createElement("div");
        placeholder.className = "column-placeholder";
        placeholder.style.width = `${rect.width}px`;

        const begin = () => {
          if (started) return true;
          if (dragStartBlocked) return false;
          if (!canStartPackingDrag({ kind: "root-container", id: containerId })) {
            canceled = true;
            dragStartBlocked = true;
            clearDragPending(source);
            return false;
          }
          started = true;
          if (inputType === "touch" && !blockingTouchMove) {
            document.removeEventListener("touchmove", onMove);
            document.addEventListener("touchmove", onMove, { passive: false });
            blockingTouchMove = true;
          } else {
            event.preventDefault();
          }
          clearDragPending(source);
          document.body.classList.add("dragging-ui");
          if (needsHold) dragCancelTarget.show();
          vibrateDragStart(holdInput);
          source.classList.add("dragging");
          lockBoardHeightForDrag(board);
          ghost = source.cloneNode(true);
          ghost.classList.add("drag-ghost", "column-ghost");
          ghost.style.width = `${rect.width}px`;
          document.body.appendChild(ghost);
          board.insertBefore(placeholder, source);
          source.classList.add("drag-source-collapsed");
          moveGhost(latestX, latestY, true);
          edgeScroller.update(latestX, latestY);
          return true;
        };

        const moveGhost = (clientX, clientY, immediate = false) => {
          if (!ghost) return;
          ghostTargetX = clientX - dragOffsetX;
          ghostTargetY = clientY - dragOffsetY;
          if (immediate) {
            ghostX = ghostTargetX;
            ghostY = ghostTargetY;
            setDragGhostPosition(ghost, ghostX, ghostY, { fitTop: false });
            return;
          }
          if (ghostFrame) return;
          const tick = () => {
            ghostX += (ghostTargetX - ghostX) * 0.45;
            ghostY += (ghostTargetY - ghostY) * 0.45;
            setDragGhostPosition(ghost, ghostX, ghostY, { fitTop: false });
            if (Math.abs(ghostTargetX - ghostX) < 0.5 && Math.abs(ghostTargetY - ghostY) < 0.5) {
              setDragGhostPosition(ghost, ghostTargetX, ghostTargetY, { fitTop: false });
              ghostFrame = null;
              return;
            }
            ghostFrame = requestAnimationFrame(tick);
          };
          ghostFrame = requestAnimationFrame(tick);
        };

        const place = (clientX, clientY) => {
          const pointerTarget = document.elementFromPoint(clientX, clientY);
          const targetContainer = pointerTarget?.closest?.("[data-root-container-id], [data-subcontainer-id]");
          const targetZone = pointerTarget?.closest?.(".dropzone") || targetContainer?.querySelector?.(":scope > .dropzone");
          const targetContainerId = targetZone?.dataset?.containerId || "";
          const sourceCanBeNested = state().containers?.[containerId]?.nestable === true;
          const invalidNestedTarget = !targetContainerId ||
            targetContainerId === containerId ||
            getDescendantContainerIds(containerId).includes(targetContainerId);
          if (sourceCanBeNested && targetZone && board.contains(targetZone) && !invalidNestedTarget) {
            placeholder.className = "drop-placeholder";
            placeholder.style.width = `${Math.max(0, Math.min(rect.width, targetZone.clientWidth || rect.width))}px`;
            markDropzoneDragOver(root, targetZone);
            placePlaceholder(targetZone, placeholder, getEntryAfterPointer(targetZone, clientY, placeholder));
            nestedTargetContainerId = targetContainerId;
            nestedTargetZone = targetZone;
            currentIndex = -1;
            return;
          }
          clearDropzoneDragOvers(root);
          nestedTargetContainerId = "";
          nestedTargetZone = null;
          placeholder.className = "column-placeholder";
          placeholder.style.width = `${rect.width}px`;
          const cards = [...board.children].filter((child) =>
            child.classList?.contains("container-card") && child !== source && !child.classList.contains("dragging")
          );
          const after = cards.reduce(
            (closest, card) => {
              const box = card.getBoundingClientRect();
              const offset = clientX - box.left - box.width / 2;
              if (offset < 0 && offset > closest.offset) return { offset, card };
              return closest;
            },
            { offset: Number.NEGATIVE_INFINITY, card: null }
          ).card;
          placePlaceholder(board, placeholder, after);
          currentIndex = getColumnPlaceholderIndex(board, placeholder, containerId);
          placeholder.classList.remove("hidden");
        };

        const onMove = (moveEvent) => {
          const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
          if (!movePoint) return;
          latestX = movePoint.clientX;
          latestY = movePoint.clientY;
          const dx = movePoint.clientX - startX;
          const dy = movePoint.clientY - startY;
          if (!started) {
            if (needsHold) {
              const distance = Math.hypot(dx, dy);
              const cancelDistance = inputType === "touch" ? touchScrollCancelDistance : touchDragCancelDistance;
              if (distance > cancelDistance && !preScrollGesture) {
                if (holdTimer) {
                  window.clearTimeout(holdTimer);
                  holdTimer = null;
                }
                canceled = true;
                clearDragPending(source);
                preScrollGesture = true;
              }
              if (!started && preScrollGesture && inputType !== "touch") {
                moveEvent.preventDefault();
                preDragScroller.update(movePoint.clientX, movePoint.clientY);
              }
              if (!started) return;
            }
            if (Math.hypot(dx, dy) < pointerDragStartDistance) return;
            if (!begin()) return;
          }
          moveEvent.preventDefault();
          if (!begin()) return;
          moveGhost(movePoint.clientX, movePoint.clientY);
          if (dragCancelTarget.update(movePoint.clientX, movePoint.clientY)) {
            edgeScroller.pause();
            clearDropzoneDragOvers(root);
            nestedTargetContainerId = "";
            nestedTargetZone = null;
            currentIndex = -1;
            placeholder.classList.add("hidden");
            return;
          }
          edgeScroller.update(movePoint.clientX, movePoint.clientY);
          place(movePoint.clientX, movePoint.clientY);
        };

        const finish = () => {
          if (finished) return;
          finished = true;
          if (holdTimer) window.clearTimeout(holdTimer);
          preDragScroller.stop();
          if (started) edgeScroller.stop();
          if (dragCancelTarget.isActive()) canceled = true;
          dragCancelTarget.hide();
          if (inputType !== "touch" && header.hasPointerCapture?.(event.pointerId)) {
            header.releasePointerCapture(event.pointerId);
          }
          if (!canceled && started && nestedTargetContainerId && nestedTargetZone && placeholder.parentElement === nestedTargetZone) {
            moveContainer(containerId, nestedTargetContainerId, getPlaceholderContainerIndex(nestedTargetZone, placeholder));
          } else if (!canceled && started && currentIndex >= 0 && !isOriginalRootColumnPosition(containerId, currentIndex)) {
            moveRootColumn(containerId, currentIndex);
          }
          if (ghostFrame) cancelAnimationFrame(ghostFrame);
          ghost?.remove();
          placeholder.remove();
          clearDropzoneDragOvers(root);
          clearDragPending(source);
          source.classList.remove("dragging");
          source.classList.remove("drag-source-collapsed");
          if (shouldSuppressClickAfterDragAttempt({ started, blocked: dragStartBlocked })) {
            suppressNextClickAfterDrag(source, { clientX: latestX, clientY: latestY });
          }
          deferBoardHeightUnlockUntilScroll(board);
          document.body.classList.remove("dragging-ui");
          if (inputType === "touch") {
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", finish);
            document.removeEventListener("touchcancel", cancelAndFinish);
          } else {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", finish);
            document.removeEventListener("pointercancel", cancelAndFinish);
          }
          window.removeEventListener("blur", cancelAndFinish);
          document.removeEventListener("visibilitychange", cancelWhenHidden);
          document.removeEventListener("keydown", onKeyDown);
        };

        function cancelAndFinish() {
          canceled = true;
          finish();
        }

        function cancelWhenHidden() {
          if (document.hidden) cancelAndFinish();
        }

        const onKeyDown = (keyEvent) => {
          if (keyEvent.key !== "Escape") return;
          keyEvent.preventDefault();
          canceled = true;
          finish();
        };

        if (needsHold) {
          holdTimer = window.setTimeout(begin, touchDragDelayMs);
        }
        if (inputType === "touch") {
          document.addEventListener("touchmove", onMove, { passive: true });
          document.addEventListener("touchend", finish, { passive: false });
          document.addEventListener("touchcancel", cancelAndFinish, { passive: false });
        } else {
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", finish);
          document.addEventListener("pointercancel", cancelAndFinish);
        }
        window.addEventListener("blur", cancelAndFinish);
        document.addEventListener("visibilitychange", cancelWhenHidden);
        document.addEventListener("keydown", onKeyDown);
      };

      header.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;
        startColumnDrag(event);
      });
      header.addEventListener("touchstart", (event) => startColumnDrag(event, "touch"), { passive: true });
    });
  }

  function bindPointerPackingDrag(root, placeholder) {
    const startDrag = ({ kind, id, handle, source, event, inputType = "pointer" }) => {
      const point = inputType === "touch" ? getTouchPoint(event) : event;
      if (!point) return;
      if (inputType !== "touch" && event.button !== 0) return;

      const holdInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
      const needsHold = isHoldDragInput(holdInput);
      if (needsHold) {
        if (inputType !== "touch") markDragPending(source);
        if (inputType !== "touch") {
          event.preventDefault();
          handle.setPointerCapture?.(event.pointerId);
        }
      }
      let started = false;
      let canceled = false;
      let finished = false;
      let preScrollGesture = false;
      let dragStartBlocked = false;
      let currentZone = null;
      let groupTargetItemId = null;
      let packageTargetContainerId = null;
      let packageTargetUsesPointer = false;
      let rootTargetIndex = -1;
      let itemIntoDraggedContainerId = null;
      let nestedGroupCandidateItemId = null;
      let nestedGroupCandidateStartedAt = 0;
      let nestedGroupCandidateTimer = null;
      const startX = point.clientX;
      const startY = point.clientY;
      let latestX = startX;
      let latestY = startY;
      let ghost = null;
      let ghostFrame = null;
      let ghostX = startX;
      let ghostY = startY;
      let ghostTargetX = startX;
      let ghostTargetY = startY;
      let holdTimer = null;
      let blockingTouchMove = false;
      const dragCancelTarget = createDragCancelTarget();
      const board = root.querySelector(".board");
      const sourcePlacement = state().layouts?.[state().activeLayoutId]?.arrangement?.containers?.[id];
      const sourceIsNestedContainer = kind === "container" && Boolean(sourcePlacement?.parentId);
      const sourceRect = source.getBoundingClientRect();
      const dragOffsetY = startY - sourceRect.top;
      const preDragScroller = createPreDragScroller(board, startX, startY);
      const edgeScroller = createBoardEdgeScroller(board, () => {
        if (!started) return;
        place(latestX, latestY);
      }, (clientY) => {
        const top = clientY - dragOffsetY;
        return {
          height: sourceRect.height,
          top: kind === "item" ? top : null,
          bottom: kind === "item" ? top + sourceRect.height : null
        };
      });
      const dragOffsetX = startX - sourceRect.left;

      const resetNestedGroupCandidate = () => {
        nestedGroupCandidateItemId = null;
        nestedGroupCandidateStartedAt = 0;
        if (nestedGroupCandidateTimer) window.clearTimeout(nestedGroupCandidateTimer);
        nestedGroupCandidateTimer = null;
      };

      const canActivateGroupTarget = (targetCard, targetItemId, clientX, clientY) => {
        if (!isInsideGroupDropZone(targetCard, clientX, clientY)) {
          resetNestedGroupCandidate();
          return false;
        }
        if (!isCardInsideOpenSubcontainer(targetCard)) {
          resetNestedGroupCandidate();
          return true;
        }
        const now = performance.now();
        if (nestedGroupCandidateItemId !== targetItemId) {
          resetNestedGroupCandidate();
          nestedGroupCandidateItemId = targetItemId;
          nestedGroupCandidateStartedAt = now;
          nestedGroupCandidateTimer = window.setTimeout(() => {
            nestedGroupCandidateTimer = null;
            if (started && !finished) place(latestX, latestY);
          }, nestedGroupHoverDelayMs);
          return false;
        }
        return now - nestedGroupCandidateStartedAt >= nestedGroupHoverDelayMs;
      };

      const begin = () => {
        if (started) return true;
        if (dragStartBlocked) return false;
        if (!canStartPackingDrag({ kind, id })) {
          canceled = true;
          dragStartBlocked = true;
          clearDragPending(source);
          return false;
        }
        started = true;
        if (inputType === "touch" && !blockingTouchMove) {
          document.removeEventListener("touchmove", onMove);
          document.addEventListener("touchmove", onMove, { passive: false });
          blockingTouchMove = true;
        } else {
          event.preventDefault();
        }
        clearDragPending(source);
        document.body.classList.add("dragging-ui");
        if (needsHold) dragCancelTarget.show();
        vibrateDragStart(holdInput);
        setDraggingItemId(kind === "item" ? id : null);
        setDraggingContainerId(kind === "container" ? id : null);
        source.classList.add("dragging");
        lockBoardHeightForDrag(board);
        ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost");
        if (kind === "item") ghost.classList.add("item-ghost");
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.transform = "none";
        placeholder.style.height = `${sourceRect.height}px`;
        placeholder.style.width = `${sourceRect.width}px`;
        placeholder.style.maxWidth = "100%";
        document.body.appendChild(ghost);
        placePlaceholder(source.parentElement, placeholder, source);
        source.classList.add("drag-source-collapsed");
        moveGhost(latestX, latestY, true);
        edgeScroller.update(latestX, latestY);
        return true;
      };

      const moveGhost = (clientX, clientY, immediate = false) => {
        if (!ghost) return;
        const targetLeft = clientX - dragOffsetX;
        const targetTop = clientY - dragOffsetY;
        ghostTargetX = targetLeft;
        ghostTargetY = targetTop;
        if (immediate) {
          ghostX = targetLeft;
          ghostY = targetTop;
          setDragGhostPosition(ghost, ghostX, ghostY);
          return;
        }
        if (ghostFrame) return;
        const tick = () => {
          const easing = kind === "item" ? 0.28 : 0.38;
          ghostX += (ghostTargetX - ghostX) * easing;
          ghostY += (ghostTargetY - ghostY) * easing;
          setDragGhostPosition(ghost, ghostX, ghostY);
          if (Math.abs(ghostTargetX - ghostX) < 0.5 && Math.abs(ghostTargetY - ghostY) < 0.5) {
            setDragGhostPosition(ghost, ghostTargetX, ghostTargetY);
            ghostFrame = null;
            return;
          }
          ghostFrame = requestAnimationFrame(tick);
        };
        ghostFrame = requestAnimationFrame(tick);
      };

      const clearZones = () => {
        clearDropzoneDragOvers(root);
        root.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
        root.querySelectorAll(".item-card.move-into-target").forEach((card) => card.classList.remove("move-into-target"));
        placeholder.remove();
        currentZone = null;
        groupTargetItemId = null;
        packageTargetContainerId = null;
        packageTargetUsesPointer = false;
        rootTargetIndex = -1;
        itemIntoDraggedContainerId = null;
        resetNestedGroupCandidate();
      };

      const place = (clientX, clientY) => {
        const target = document.elementFromPoint(clientX, clientY);

        if (kind === "container") {
          const targetCard = target?.closest?.(".item-card");
          const targetItemId = targetCard?.dataset.itemId;
          if (
            targetCard &&
            targetItemId &&
            !targetCard.classList.contains("dragging") &&
            !isItemInsideContainer(targetItemId, id) &&
            isInsideGroupDropZone(targetCard, clientX, clientY)
          ) {
            clearDropzoneDragOvers(root);
            root.querySelectorAll(".item-card.move-into-target").forEach((card) => {
              if (card !== targetCard) card.classList.remove("move-into-target");
            });
            placeholder.remove();
            targetCard.classList.add("move-into-target");
            currentZone = null;
            groupTargetItemId = null;
            packageTargetContainerId = null;
            packageTargetUsesPointer = false;
            rootTargetIndex = -1;
            itemIntoDraggedContainerId = targetItemId;
            return;
          }
        }

        const packageTarget = getPackageDropTarget(target, kind, id, root);
        if (packageTarget) {
          root.querySelectorAll(".item-card.group-target, .item-card.move-into-target").forEach((card) => card.classList.remove("group-target", "move-into-target"));
          markDropzoneDragOver(root, packageTarget.zone);
          currentZone = packageTarget.zone;
          groupTargetItemId = null;
          itemIntoDraggedContainerId = null;
          packageTargetContainerId = packageTarget.containerId;
          packageTargetUsesPointer = packageTarget.insertByPointer;
          rootTargetIndex = -1;
          resetNestedGroupCandidate();
          placeholder.className = "drop-placeholder";
          placeholder.style.height = `${sourceRect.height}px`;
          placeholder.style.width = `${sourceRect.width}px`;
          placeholder.style.maxWidth = "100%";
          const insertBefore = packageTarget.insertByPointer
            ? getEntryAfterPointer(packageTarget.zone, clientY, placeholder)
            : getFirstEntry(packageTarget.zone);
          placePlaceholder(packageTarget.zone, placeholder, insertBefore);
          return;
        }

        const rootCard = target?.closest?.(".container-card");
        const rootSurface = target === board || target === placeholder || Boolean(
          rootCard &&
          board?.contains(rootCard) &&
          !target?.closest?.(".dropzone") &&
          !target?.closest?.(".subcontainer")
        );
        if (sourceIsNestedContainer && board && rootSurface) {
          clearDropzoneDragOvers(root);
          root.querySelectorAll(".item-card.group-target, .item-card.move-into-target").forEach((card) => card.classList.remove("group-target", "move-into-target"));
          currentZone = null;
          groupTargetItemId = null;
          packageTargetContainerId = null;
          packageTargetUsesPointer = false;
          itemIntoDraggedContainerId = null;
          resetNestedGroupCandidate();
          placeholder.className = "column-placeholder";
          placeholder.style.height = "";
          placeholder.style.maxWidth = "none";
          const referenceCard = board.querySelector(".container-card");
          placeholder.style.width = `${referenceCard?.getBoundingClientRect?.().width || sourceRect.width}px`;
          const cards = [...board.children].filter((child) =>
            child.classList?.contains("container-card") && !child.classList.contains("dragging")
          );
          const after = cards.reduce(
            (closest, card) => {
              const box = card.getBoundingClientRect();
              const offset = clientX - box.left - box.width / 2;
              if (offset < 0 && offset > closest.offset) return { offset, card };
              return closest;
            },
            { offset: Number.NEGATIVE_INFINITY, card: null }
          ).card;
          placePlaceholder(board, placeholder, after);
          rootTargetIndex = getColumnPlaceholderIndex(board, placeholder, id);
          return;
        }

        const zone = target?.closest?.(".dropzone");
        if (!zone || !root.contains(zone) || isBlockedDropzone(zone)) {
          clearZones();
          return;
        }

        if (kind === "item") {
          const targetCard = target?.closest?.(".item-card");
          const targetItemId = targetCard?.dataset.itemId;
          const canGroupWithTarget = targetCard &&
            targetItemId &&
            targetItemId !== id &&
            !targetCard.classList.contains("dragging");
          if (canGroupWithTarget) {
            if (canActivateGroupTarget(targetCard, targetItemId, clientX, clientY)) {
              clearDropzoneDragOvers(root);
              root.querySelectorAll(".item-card.group-target").forEach((card) => {
                if (card !== targetCard) card.classList.remove("group-target");
              });
              placeholder.remove();
              targetCard.classList.add("group-target");
              currentZone = zone;
              groupTargetItemId = targetItemId;
              rootTargetIndex = -1;
              return;
            }
          } else {
            resetNestedGroupCandidate();
          }
        }

        root.querySelectorAll(".item-card.group-target, .item-card.move-into-target").forEach((card) => card.classList.remove("group-target", "move-into-target"));
        groupTargetItemId = null;
        itemIntoDraggedContainerId = null;
        packageTargetContainerId = null;
        packageTargetUsesPointer = false;
        rootTargetIndex = -1;
        markDropzoneDragOver(root, zone);
        currentZone = zone;

        placeholder.className = "drop-placeholder";
        placeholder.style.height = `${sourceRect.height}px`;
        placeholder.style.width = `${sourceRect.width}px`;
        placeholder.style.maxWidth = "100%";
        const afterEntry = getEntryAfterPointer(zone, clientY, placeholder);
        placePlaceholder(zone, placeholder, afterEntry);
      };

      const onMove = (moveEvent) => {
        const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
        if (!movePoint) return;
        latestX = movePoint.clientX;
        latestY = movePoint.clientY;
        const dx = movePoint.clientX - startX;
        const dy = movePoint.clientY - startY;
        if (!started) {
          if (needsHold) {
            const distance = Math.hypot(dx, dy);
            const cancelDistance = inputType === "touch" ? touchScrollCancelDistance : touchDragCancelDistance;
            if (distance > cancelDistance && !preScrollGesture) {
              if (holdTimer) {
                window.clearTimeout(holdTimer);
                holdTimer = null;
              }
              canceled = true;
              clearDragPending(source);
              preScrollGesture = true;
            }
            if (!started && preScrollGesture && inputType !== "touch") {
              moveEvent.preventDefault();
              preDragScroller.update(movePoint.clientX, movePoint.clientY);
            }
            if (!started) return;
          }
          if (Math.hypot(dx, dy) < pointerDragStartDistance) return;
          if (!begin()) return;
        }
        moveEvent.preventDefault();
        if (!begin()) return;
        moveGhost(movePoint.clientX, movePoint.clientY);
        if (dragCancelTarget.update(movePoint.clientX, movePoint.clientY)) {
          edgeScroller.pause();
          clearZones();
          return;
        }
        edgeScroller.update(movePoint.clientX, movePoint.clientY);
        place(movePoint.clientX, movePoint.clientY);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        resetNestedGroupCandidate();
        if (holdTimer) window.clearTimeout(holdTimer);
        preDragScroller.stop();
        if (started) edgeScroller.stop();
        if (dragCancelTarget.isActive()) canceled = true;
        dragCancelTarget.hide();
        if (inputType !== "touch" && handle.hasPointerCapture?.(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId);
        }
        if (!canceled && started && kind === "container" && itemIntoDraggedContainerId) {
          moveItemIntoContainerTop(itemIntoDraggedContainerId, id);
        } else if (!canceled && started && kind === "item" && groupTargetItemId) {
          createGroupFromItems(id, groupTargetItemId);
        } else if (!canceled && started && kind === "container" && rootTargetIndex >= 0 && placeholder.parentElement === board) {
          moveContainerToRoot(id, rootTargetIndex);
        } else if (!canceled && started && currentZone && packageTargetContainerId && placeholder.parentElement === currentZone) {
          if (kind === "container") {
            if (!isOriginalContainerPosition(currentZone, placeholder)) {
              if (packageTargetUsesPointer) {
                moveContainer(id, packageTargetContainerId, getPlaceholderContainerIndex(currentZone, placeholder));
              } else {
                moveContainerIntoContainerTop(id, packageTargetContainerId);
              }
            }
          } else if (!isOriginalItemPosition(currentZone, placeholder)) {
            if (packageTargetUsesPointer) {
              moveItem(id, packageTargetContainerId, getPlaceholderItemIndex(currentZone, placeholder));
            } else {
              moveItemIntoContainerTop(id, packageTargetContainerId);
            }
          }
        } else if (!canceled && started && currentZone && placeholder.parentElement === currentZone) {
          if (kind === "container") {
            const index = getPlaceholderContainerIndex(currentZone, placeholder);
            if (!isOriginalContainerPosition(currentZone, placeholder)) {
              moveContainer(id, currentZone.dataset.containerId, index);
            }
          } else {
            const index = getPlaceholderItemIndex(currentZone, placeholder);
            if (!isOriginalItemPosition(currentZone, placeholder)) {
              moveItem(id, currentZone.dataset.containerId, index);
            }
          }
        }
        if (ghostFrame) cancelAnimationFrame(ghostFrame);
        ghost?.remove();
        clearDragPending(source);
        source.classList.remove("drag-source-collapsed");
        source.classList.remove("dragging");
        if (shouldSuppressClickAfterDragAttempt({ started, blocked: dragStartBlocked })) {
          suppressNextClickAfterDrag(source, { clientX: latestX, clientY: latestY });
        }
        placeholder.removeAttribute("style");
        placeholder.className = "drop-placeholder";
        setDraggingItemId(null);
        setDraggingContainerId(null);
        document.body.classList.remove("dragging-ui");
        root.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
        clearZones();
        deferBoardHeightUnlockUntilScroll(board);
        if (inputType === "touch") {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", finish);
          document.removeEventListener("touchcancel", cancelAndFinish);
        } else {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", finish);
          document.removeEventListener("pointercancel", cancelAndFinish);
        }
        window.removeEventListener("blur", cancelAndFinish);
        document.removeEventListener("visibilitychange", cancelWhenHidden);
        document.removeEventListener("keydown", onKeyDown);
      };

      function cancelAndFinish() {
        canceled = true;
        finish();
      }

      function cancelWhenHidden() {
        if (document.hidden) cancelAndFinish();
      }

      const onKeyDown = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        canceled = true;
        finish();
      };

      if (needsHold) {
        holdTimer = window.setTimeout(begin, touchDragDelayMs);
      }
      if (inputType === "touch") {
        document.addEventListener("touchmove", onMove, { passive: true });
        document.addEventListener("touchend", finish, { passive: false });
        document.addEventListener("touchcancel", cancelAndFinish, { passive: false });
      } else {
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", finish);
        document.addEventListener("pointercancel", cancelAndFinish);
      }
      window.addEventListener("blur", cancelAndFinish);
      document.addEventListener("visibilitychange", cancelWhenHidden);
      document.addEventListener("keydown", onKeyDown);
    };

    root.querySelectorAll("[data-item-drag]").forEach((handle) => {
      handle.addEventListener("contextmenu", preventDragContextMenu);
      handle.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;
        const source = handle.closest(".item-card");
        if (!source) return;
        startDrag({ kind: "item", id: handle.dataset.itemDrag, handle, source, event });
      });
      handle.addEventListener("touchstart", (event) => {
        const source = handle.closest(".item-card");
        if (!source) return;
        startDrag({ kind: "item", id: handle.dataset.itemDrag, handle, source, event, inputType: "touch" });
      }, { passive: true });
    });

    root.querySelectorAll(".subcontainer-title").forEach((title) => {
      title.addEventListener("contextmenu", preventDragContextMenu);
      title.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;
        if (event.target.closest("button, input")) return;
        const source = title.closest(".subcontainer");
        const id = source?.dataset.subcontainerId;
        if (!source || !id) return;
        startDrag({ kind: "container", id, handle: title, source, event });
      });
      title.addEventListener("touchstart", (event) => {
        if (event.target.closest("button, input")) return;
        const source = title.closest(".subcontainer");
        const id = source?.dataset.subcontainerId;
        if (!source || !id) return;
        startDrag({ kind: "container", id, handle: title, source, event, inputType: "touch" });
      }, { passive: true });
    });
  }

  function bindCatalogItemPackingDrag(sourceRoot) {
    if (!sourceRoot) return;

    const startDrag = ({ id, source, event, inputType = "pointer" }) => {
      const point = inputType === "touch" ? getTouchPoint(event) : event;
      if (!point) return;
      if (inputType !== "touch" && event.button !== 0) return;
      if (!id || !state().items?.[id]) return;
      if (isCatalogDragActionTarget(event.target)) return;

      const holdInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
      const needsHold = isHoldDragInput(holdInput);
      if (needsHold) {
        if (inputType !== "touch") markDragPending(source);
        if (inputType !== "touch") {
          event.preventDefault();
          source.setPointerCapture?.(event.pointerId);
        }
      }

      let started = false;
      let canceled = false;
      let finished = false;
      let preScrollGesture = false;
      let dragStartBlocked = false;
      let currentZone = null;
      let groupTargetItemId = null;
      let packageTargetContainerId = null;
      let packageTargetUsesPointer = false;
      let nestedGroupCandidateItemId = null;
      let nestedGroupCandidateStartedAt = 0;
      let nestedGroupCandidateTimer = null;
      const startX = point.clientX;
      const startY = point.clientY;
      let latestX = startX;
      let latestY = startY;
      let ghost = null;
      let ghostFrame = null;
      let ghostX = startX;
      let ghostY = startY;
      let ghostTargetX = startX;
      let ghostTargetY = startY;
      let holdTimer = null;
      let blockingTouchMove = false;
      const dragCancelTarget = createDragCancelTarget();
      const sourceRect = source.getBoundingClientRect();
      const dragOffsetY = startY - sourceRect.top;
      const preDragScroller = createPreDragScroller(null, startX, startY);
      const edgeScroller = createBoardEdgeScroller(getPackingBoard(), () => {
        if (!started) return;
        place(latestX, latestY);
      }, (clientY) => {
        const top = clientY - dragOffsetY;
        return { height: sourceRect.height, top, bottom: top + sourceRect.height };
      });
      const dragOffsetX = startX - sourceRect.left;
      const placeholder = document.createElement("div");
      placeholder.className = "drop-placeholder";

      const resetNestedGroupCandidate = () => {
        nestedGroupCandidateItemId = null;
        nestedGroupCandidateStartedAt = 0;
        if (nestedGroupCandidateTimer) window.clearTimeout(nestedGroupCandidateTimer);
        nestedGroupCandidateTimer = null;
      };

      const canActivateGroupTarget = (targetCard, targetItemId, clientX, clientY) => {
        if (!isInsideGroupDropZone(targetCard, clientX, clientY)) {
          resetNestedGroupCandidate();
          return false;
        }
        if (!isCardInsideOpenSubcontainer(targetCard)) {
          resetNestedGroupCandidate();
          return true;
        }
        const now = performance.now();
        if (nestedGroupCandidateItemId !== targetItemId) {
          resetNestedGroupCandidate();
          nestedGroupCandidateItemId = targetItemId;
          nestedGroupCandidateStartedAt = now;
          nestedGroupCandidateTimer = window.setTimeout(() => {
            nestedGroupCandidateTimer = null;
            if (started && !finished) place(latestX, latestY);
          }, nestedGroupHoverDelayMs);
          return false;
        }
        return now - nestedGroupCandidateStartedAt >= nestedGroupHoverDelayMs;
      };

      const begin = () => {
        if (started) return true;
        if (dragStartBlocked) return false;
        if (!canStartPackingDrag({ kind: "catalog-item", id })) {
          canceled = true;
          dragStartBlocked = true;
          clearDragPending(source);
          return false;
        }
        started = true;
        if (inputType === "touch" && !blockingTouchMove) {
          document.removeEventListener("touchmove", onMove);
          document.addEventListener("touchmove", onMove, { passive: false });
          blockingTouchMove = true;
        } else {
          event.preventDefault();
        }
        clearDragPending(source);
        document.body.classList.add("dragging-ui");
        if (needsHold) dragCancelTarget.show();
        vibrateDragStart(holdInput);
        setDraggingItemId(id);
        setDraggingContainerId(null);
        source.classList.add("dragging");
        ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost", "item-ghost");
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.transform = "none";
        placeholder.style.height = `${sourceRect.height}px`;
        placeholder.style.width = `${sourceRect.width}px`;
        placeholder.style.maxWidth = "100%";
        document.body.appendChild(ghost);
        placePlaceholder(source.parentElement, placeholder, source);
        source.classList.add("drag-source-collapsed");
        moveGhost(latestX, latestY, true);
        edgeScroller.update(latestX, latestY);
        return true;
      };

      const moveGhost = (clientX, clientY, immediate = false) => {
        if (!ghost) return;
        const targetLeft = clientX - dragOffsetX;
        const targetTop = clientY - dragOffsetY;
        ghostTargetX = targetLeft;
        ghostTargetY = targetTop;
        if (immediate) {
          ghostX = targetLeft;
          ghostY = targetTop;
          setDragGhostPosition(ghost, ghostX, ghostY);
          return;
        }
        if (ghostFrame) return;
        const tick = () => {
          ghostX += (ghostTargetX - ghostX) * 0.28;
          ghostY += (ghostTargetY - ghostY) * 0.28;
          setDragGhostPosition(ghost, ghostX, ghostY);
          if (Math.abs(ghostTargetX - ghostX) < 0.5 && Math.abs(ghostTargetY - ghostY) < 0.5) {
            setDragGhostPosition(ghost, ghostTargetX, ghostTargetY);
            ghostFrame = null;
            return;
          }
          ghostFrame = requestAnimationFrame(tick);
        };
        ghostFrame = requestAnimationFrame(tick);
      };

      const clearZones = () => {
        const packingRoot = getPackingRoot?.();
        if (packingRoot) {
          clearDropzoneDragOvers(packingRoot);
          packingRoot.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
        }
        placeholder.remove();
        currentZone = null;
        groupTargetItemId = null;
        packageTargetContainerId = null;
        packageTargetUsesPointer = false;
        resetNestedGroupCandidate();
      };

      const place = (clientX, clientY) => {
        const target = document.elementFromPoint(clientX, clientY);
        const tab = getPackingPortalTabTarget(target);
        if (tab && getCurrentView?.() !== "packing") {
          tab.classList.add("drag-over");
          clearZones();
          onBeforePackingDragEnter();
          switchToPacking?.();
          return;
        }
        clearPackingPortalTabTarget();

        const packingRoot = getPackingRoot?.();
        if (getCurrentView?.() !== "packing" || !packingRoot || !target || !packingRoot.contains(target)) {
          clearZones();
          return;
        }

        const packageTarget = getPackageDropTarget(target, "item", id, packingRoot);
        if (packageTarget) {
          packingRoot.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
          markDropzoneDragOver(packingRoot, packageTarget.zone);
          currentZone = packageTarget.zone;
          groupTargetItemId = null;
          packageTargetContainerId = packageTarget.containerId;
          packageTargetUsesPointer = packageTarget.insertByPointer;
          resetNestedGroupCandidate();
          const insertBefore = packageTarget.insertByPointer
            ? getEntryAfterPointer(packageTarget.zone, clientY, placeholder)
            : getFirstEntry(packageTarget.zone);
          placePlaceholder(packageTarget.zone, placeholder, insertBefore);
          return;
        }

        const zone = target.closest?.(".dropzone");
        if (!zone || !packingRoot.contains(zone) || isBlockedDropzone(zone)) {
          clearZones();
          return;
        }

        const targetCard = target.closest?.(".item-card");
        const targetItemId = targetCard?.dataset.itemId;
        const canGroupWithTarget = targetCard &&
          targetItemId &&
          targetItemId !== id &&
          !targetCard.classList.contains("dragging");
        if (canGroupWithTarget) {
          if (canActivateGroupTarget(targetCard, targetItemId, clientX, clientY)) {
            clearDropzoneDragOvers(packingRoot);
            packingRoot.querySelectorAll(".item-card.group-target").forEach((card) => {
              if (card !== targetCard) card.classList.remove("group-target");
            });
            placeholder.remove();
            targetCard.classList.add("group-target");
            currentZone = zone;
            groupTargetItemId = targetItemId;
            return;
          }
        } else {
          resetNestedGroupCandidate();
        }

        packingRoot.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
        groupTargetItemId = null;
        packageTargetContainerId = null;
        packageTargetUsesPointer = false;
        markDropzoneDragOver(packingRoot, zone);
        currentZone = zone;
        placePlaceholder(zone, placeholder, getEntryAfterPointer(zone, clientY, placeholder));
      };

      const onMove = (moveEvent) => {
        const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
        if (!movePoint) return;
        latestX = movePoint.clientX;
        latestY = movePoint.clientY;
        const dx = latestX - startX;
        const dy = latestY - startY;
        if (!started) {
          if (needsHold) {
            const distance = Math.hypot(dx, dy);
            const cancelDistance = inputType === "touch" ? touchScrollCancelDistance : touchDragCancelDistance;
            if (distance > cancelDistance && !preScrollGesture) {
              if (holdTimer) {
                window.clearTimeout(holdTimer);
                holdTimer = null;
              }
              canceled = true;
              clearDragPending(source);
              preScrollGesture = true;
            }
            if (!started && preScrollGesture && inputType !== "touch") {
              moveEvent.preventDefault();
              preDragScroller.update(latestX, latestY);
            }
            if (!started) return;
          }
          if (Math.hypot(dx, dy) < pointerDragStartDistance) return;
          if (!begin()) return;
        }
        moveEvent.preventDefault();
        if (!begin()) return;
        moveGhost(latestX, latestY);
        if (dragCancelTarget.update(latestX, latestY)) {
          edgeScroller.pause();
          clearZones();
          return;
        }
        edgeScroller.update(latestX, latestY);
        place(latestX, latestY);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        resetNestedGroupCandidate();
        if (holdTimer) window.clearTimeout(holdTimer);
        preDragScroller.stop();
        if (started) edgeScroller.stop();
        if (dragCancelTarget.isActive()) canceled = true;
        dragCancelTarget.hide();
        if (inputType !== "touch" && source.hasPointerCapture?.(event.pointerId)) {
          source.releasePointerCapture(event.pointerId);
        }
        if (!canceled && started && groupTargetItemId) {
          createGroupFromItems(id, groupTargetItemId);
        } else if (!canceled && started && currentZone && packageTargetContainerId && placeholder.parentElement === currentZone) {
          if (packageTargetUsesPointer) {
            moveItem(id, packageTargetContainerId, getPlaceholderItemIndex(currentZone, placeholder));
          } else {
            moveItemIntoContainerTop(id, packageTargetContainerId);
          }
        } else if (!canceled && started && currentZone && placeholder.parentElement === currentZone) {
          const index = getPlaceholderItemIndex(currentZone, placeholder);
          if (!isOriginalItemPosition(currentZone, placeholder)) {
            moveItem(id, currentZone.dataset.containerId, index);
          }
        }
        if (ghostFrame) cancelAnimationFrame(ghostFrame);
        ghost?.remove();
        clearDragPending(source);
        source.classList.remove("drag-source-collapsed");
        source.classList.remove("dragging");
        if (shouldSuppressClickAfterDragAttempt({ started, blocked: dragStartBlocked })) {
          suppressNextClickAfterDrag(source, { clientX: latestX, clientY: latestY });
        }
        placeholder.removeAttribute("style");
        setDraggingItemId(null);
        setDraggingContainerId(null);
        document.body.classList.remove("dragging-ui");
        clearPackingPortalTabTarget();
        clearZones();
        if (inputType === "touch") {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", finish);
          document.removeEventListener("touchcancel", cancelAndFinish);
        } else {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", finish);
          document.removeEventListener("pointercancel", cancelAndFinish);
        }
        window.removeEventListener("blur", cancelAndFinish);
        document.removeEventListener("visibilitychange", cancelWhenHidden);
        document.removeEventListener("keydown", onKeyDown);
      };

      function cancelAndFinish() {
        canceled = true;
        finish();
      }

      function cancelWhenHidden() {
        if (document.hidden) cancelAndFinish();
      }

      const onKeyDown = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        canceled = true;
        finish();
      };

      if (needsHold) {
        holdTimer = window.setTimeout(begin, touchDragDelayMs);
      }
      if (inputType === "touch") {
        document.addEventListener("touchmove", onMove, { passive: true });
        document.addEventListener("touchend", finish, { passive: false });
        document.addEventListener("touchcancel", cancelAndFinish, { passive: false });
      } else {
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", finish);
        document.addEventListener("pointercancel", cancelAndFinish);
      }
      window.addEventListener("blur", cancelAndFinish);
      document.addEventListener("visibilitychange", cancelWhenHidden);
      document.addEventListener("keydown", onKeyDown);
    };

    sourceRoot.querySelectorAll("[data-list-item-id]").forEach((source) => {
      source.addEventListener("contextmenu", preventDragContextMenu);
      source.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;
        startDrag({ id: source.dataset.listItemId, source, event });
      });
      source.addEventListener("touchstart", (event) => {
        startDrag({ id: source.dataset.listItemId, source, event, inputType: "touch" });
      }, { passive: true });
    });
  }

  function isBlockedDropzone(zone) {
    const currentState = state();
    const draggingItemId = getDraggingItemId();
    const draggingContainerId = getDraggingContainerId();
    const item = draggingItemId ? currentState.items?.[draggingItemId] : null;
    if (item) return false;
    if (!draggingContainerId) return false;
    const targetContainerId = zone.dataset.containerId;
    if (targetContainerId === draggingContainerId) return true;
    return getDescendantContainerIds(draggingContainerId).includes(targetContainerId);
  }

  function getPackageDropTarget(target, kind, draggedId, root) {
    const currentState = state();
    const container = target?.closest?.(".subcontainer");
    if (!container || !root.contains(container) || container.classList.contains("dragging")) return null;
    const containerId = container.dataset.subcontainerId;
    if (!containerId || !currentState.containers?.[containerId]) return null;
    if (kind === "container") {
      if (containerId === draggedId) return null;
      if (getDescendantContainerIds(draggedId).includes(containerId)) return null;
    }
    const zone = getDirectDropzone(container);
    if (!zone || isBlockedDropzone(zone)) return null;
    const title = target.closest(".subcontainer-title");
    const directZone = target.closest(".dropzone");
    const closestEntry = target.closest(".item-card, .subcontainer");
    const directEmptySpace = directZone === zone && (!closestEntry || closestEntry === container);
    if (!title && !container.classList.contains("collapsed") && !directEmptySpace) return null;
    return { container, containerId, zone, insertByPointer: directEmptySpace && !container.classList.contains("collapsed") };
  }

  function isCardInsideOpenSubcontainer(card) {
    const container = card?.closest?.(".subcontainer");
    return Boolean(container && !container.classList.contains("collapsed"));
  }

  function getDirectDropzone(containerElement) {
    return [...containerElement.children].find((child) => child.classList?.contains("dropzone")) || null;
  }

  function getFirstEntry(zone) {
    return [...zone.children].find((child) =>
      (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
      !child.classList.contains("dragging")
    ) || null;
  }

  function isItemInsideContainer(itemId, containerId) {
    const currentState = state();
    if (!currentState.items?.[itemId] || !currentState.containers?.[containerId]) return false;
    return getContainerItemIdsDeep(containerId).includes(itemId);
  }

  function isOriginalItemPosition(zone, placeholder) {
    const draggingItemId = getDraggingItemId();
    if (!draggingItemId) return false;
    const currentState = state();
    const layout = currentState.layouts?.[currentState.activeLayoutId];
    const containerId = getItemContainerIdInLayout(layout, draggingItemId);
    if (!currentState.items?.[draggingItemId] || containerId !== zone.dataset.containerId) return false;
    const order = layout?.arrangement?.containers?.[containerId]?.order || [];
    const originalIndex = order.findIndex((entry) => entry.type === "item" && entry.id === draggingItemId);
    const targetIndex = getPlaceholderItemIndex(zone, placeholder);
    return targetIndex === originalIndex;
  }

  function isOriginalContainerPosition(zone, placeholder) {
    const draggingContainerId = getDraggingContainerId();
    if (!draggingContainerId) return false;
    const currentState = state();
    const layout = currentState.layouts?.[currentState.activeLayoutId];
    const placement = layout?.arrangement?.containers?.[draggingContainerId];
    if (!currentState.containers?.[draggingContainerId] || placement?.parentId !== zone.dataset.containerId) return false;
    const order = layout?.arrangement?.containers?.[placement.parentId]?.order || [];
    const originalIndex = order.findIndex((entry) => entry.type === "container" && entry.id === draggingContainerId);
    const targetIndex = getPlaceholderContainerIndex(zone, placeholder);
    return targetIndex === originalIndex;
  }

  function getEntryAfterPointer(zone, pointerY, placeholder = null) {
    return getPackingEntryAfterPointer(zone, pointerY, placeholder);
  }

  function isInsideGroupDropZone(card, pointerX, pointerY) {
    const box = card.getBoundingClientRect();
    const insideSubcontainer = Boolean(card.closest(".subcontainer"));
    const horizontalInsetRatio = insideSubcontainer ? 0.22 : 0.14;
    const bandRatio = insideSubcontainer ? 0.26 : 0.34;
    const horizontalInset = Math.min(box.width * 0.3, Math.max(28, box.width * horizontalInsetRatio));
    const bandHeight = Math.max(20, Math.min(42, box.height * bandRatio));
    const bandTop = box.top + (box.height - bandHeight) / 2;
    const bandBottom = bandTop + bandHeight;
    return pointerX >= box.left + horizontalInset &&
      pointerX <= box.right - horizontalInset &&
      pointerY >= bandTop &&
      pointerY <= bandBottom;
  }

  function placePlaceholder(parent, placeholder, beforeNode = null) {
    if (!parent) return;
    const targetNext = beforeNode || null;
    if (placeholder.parentElement === parent && placeholder.nextElementSibling === targetNext) return;
    if (targetNext) parent.insertBefore(placeholder, targetNext);
    else if (placeholder.parentElement !== parent || placeholder.nextElementSibling) parent.appendChild(placeholder);
  }

  function getPlaceholderItemIndex(zone, placeholder) {
    return getPlaceholderOrderIndex(zone, placeholder);
  }

  function getPlaceholderContainerIndex(zone, placeholder) {
    return getPlaceholderOrderIndex(zone, placeholder);
  }

  function getPlaceholderOrderIndex(zone, placeholder) {
    const directEntries = [...zone.children].filter((child) =>
      child === placeholder ||
      (
        (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
        !child.classList.contains("dragging")
      )
    );
    const index = directEntries.indexOf(placeholder);
    return index >= 0 ? index : directEntries.length;
  }

  function cleanupDropState(root, placeholder) {
    placeholder.remove();
    clearDropzoneDragOvers(root);
  }

  function getDropzoneSubcontainer(zone) {
    const container = zone?.parentElement;
    return container?.classList?.contains("subcontainer") ? container : null;
  }

  function removeDropzoneDragOver(zone) {
    zone?.classList?.remove("drag-over");
    getDropzoneSubcontainer(zone)?.classList.remove("container-drop-target");
  }

  function clearDropzoneDragOvers(root, exceptZone = null) {
    root.querySelectorAll(".dropzone.drag-over").forEach((zone) => {
      if (zone !== exceptZone) removeDropzoneDragOver(zone);
    });
    const exceptContainer = getDropzoneSubcontainer(exceptZone);
    root.querySelectorAll(".subcontainer.container-drop-target").forEach((container) => {
      if (container !== exceptContainer) container.classList.remove("container-drop-target");
    });
  }

  function markDropzoneDragOver(root, zone) {
    if (!zone) return;
    clearDropzoneDragOvers(root, zone);
    zone.classList.add("drag-over");
    getDropzoneSubcontainer(zone)?.classList.add("container-drop-target");
  }

  return {
    bindCatalogItemPackingDrag,
    bindPointerPackingDrag,
    bindRootColumnDrag,
    createBoardEdgeScroller,
    cleanupDropState,
    clearDragPending,
    getEntryAfterPointer,
    getPlaceholderContainerIndex,
    getPlaceholderItemIndex,
    getTouchPoint,
    isBlockedDropzone,
    isHoldDragInput,
    isOriginalContainerPosition,
    isOriginalItemPosition,
    markDropzoneDragOver,
    markDragPending,
    placePlaceholder,
    preventDragContextMenu,
    removeDropzoneDragOver,
    vibrateDragStart
  };
}
