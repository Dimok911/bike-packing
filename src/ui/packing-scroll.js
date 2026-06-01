export function bindBoardScroll(board) {
  if (!board) return;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  const isInteractiveTarget = (target) =>
    target.closest(".item-card, .subcontainer-title, .container-header, button, input, select, textarea, label, dialog, .drag-handle, .subcontainer-drag-handle");

  board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    isDown = true;
    startX = event.clientX;
    scrollLeft = board.scrollLeft;
    board.classList.add("drag-scroll");
    board.setPointerCapture(event.pointerId);
  });

  board.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const walk = event.clientX - startX;
    board.scrollLeft = scrollLeft - walk;
  });

  const stop = (event) => {
    if (!isDown) return;
    isDown = false;
    board.classList.remove("drag-scroll");
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  };

  board.addEventListener("pointerup", stop);
  board.addEventListener("pointercancel", stop);
  board.addEventListener("pointerleave", () => {
    isDown = false;
    board.classList.remove("drag-scroll");
  });
}

export function bindStickyRootHeaderRow(board) {
  const headerRow = board?.previousElementSibling?.classList?.contains("packing-root-header-row")
    ? board.previousElementSibling
    : null;
  const track = headerRow?.querySelector(".packing-root-header-track");
  if (!board || !headerRow || !track) return null;

  let geometryFrame = null;
  let positionLoopActive = false;
  let positionLoopStopTimer = null;
  const readRootPx = (name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
    return name === "--sticky-tabs-height" ? 44 : 0;
  };
  const syncPosition = () => {
    track.style.transform = `translate3d(${-board.scrollLeft}px, 0, 0)`;
  };
  const stopPositionLoopSoon = () => {
    if (positionLoopStopTimer) window.clearTimeout(positionLoopStopTimer);
    positionLoopStopTimer = window.setTimeout(() => {
      positionLoopActive = false;
      positionLoopStopTimer = null;
    }, 360);
  };
  const startPositionLoop = () => {
    if (positionLoopActive) return;
    positionLoopActive = true;
    const tick = () => {
      syncPosition();
      if (!positionLoopActive) return;
      window.requestAnimationFrame(tick);
    };
    tick();
  };
  const keepPositionSynced = () => {
    syncPosition();
    startPositionLoop();
    stopPositionLoopSoon();
  };
  const syncGeometry = () => {
    geometryFrame = null;
    const rect = board.getBoundingClientRect();
    const stickyTop = readRootPx("--sticky-controls-height") + readRootPx("--sticky-tabs-height");
    const visible = rect.top < stickyTop - 1 && rect.bottom > stickyTop + 24;
    headerRow.classList.toggle("is-visible", visible);
    headerRow.style.setProperty("--packing-root-header-left", `${Math.max(0, rect.left)}px`);
    headerRow.style.setProperty("--packing-root-header-width", `${Math.max(0, rect.width)}px`);
    track.style.width = `${board.scrollWidth}px`;
    syncPosition();
    const cardById = new Map([...board.querySelectorAll("[data-root-container-id]")]
      .map((card) => [card.dataset.rootContainerId, card]));
    let height = 44;
    track.querySelectorAll("[data-sticky-root-container-id]").forEach((cell) => {
      const card = cardById.get(cell.dataset.stickyRootContainerId);
      if (!card) {
        cell.hidden = true;
        return;
      }
      const cardRect = card.getBoundingClientRect();
      cell.hidden = false;
      cell.style.width = `${cardRect.width}px`;
      cell.style.left = `${cardRect.left - rect.left + board.scrollLeft}px`;
      height = Math.max(height, cell.offsetHeight || 0);
    });
    track.style.setProperty("--packing-root-header-height", `${height}px`);
  };
  const requestGeometrySync = () => {
    if (geometryFrame) return;
    geometryFrame = requestAnimationFrame(syncGeometry);
  };

  board.addEventListener("scroll", keepPositionSynced, { passive: true });
  board.addEventListener("touchstart", startPositionLoop, { passive: true });
  board.addEventListener("touchmove", keepPositionSynced, { passive: true });
  board.addEventListener("touchend", stopPositionLoopSoon, { passive: true });
  board.addEventListener("touchcancel", stopPositionLoopSoon, { passive: true });
  board.addEventListener("pointerdown", startPositionLoop, { passive: true });
  board.addEventListener("pointermove", keepPositionSynced, { passive: true });
  board.addEventListener("pointerup", stopPositionLoopSoon, { passive: true });
  board.addEventListener("pointercancel", stopPositionLoopSoon, { passive: true });
  board.addEventListener("pointerleave", stopPositionLoopSoon, { passive: true });
  window.addEventListener("scroll", requestGeometrySync, { passive: true });
  window.addEventListener("resize", requestGeometrySync, { passive: true });
  requestGeometrySync();
  requestAnimationFrame(syncGeometry);
  return {
    syncGeometry: requestGeometrySync,
    syncPosition
  };
}

export function bindFixedScrollbar(board) {
  const bar = document.querySelector("#kanbanScrollbar");
  const track = document.querySelector("#kanbanScrollTrack");
  const thumb = document.querySelector("#kanbanScrollThumb");
  if (!board || !bar || !track || !thumb) return;

  let isDragging = false;
  let startX = 0;
  let startLeft = 0;
  let thumbFrame = null;

  const getGeometry = () => {
    const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    const trackWidth = track.clientWidth;
    const ratio = board.scrollWidth ? board.clientWidth / board.scrollWidth : 1;
    const thumbWidth = Math.max(48, Math.min(trackWidth, trackWidth * ratio));
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    return { maxScroll, trackWidth, thumbWidth, maxThumbLeft };
  };

  const updateThumb = () => {
    thumbFrame = null;
    const { maxScroll, thumbWidth, maxThumbLeft } = getGeometry();
    const progress = maxScroll ? board.scrollLeft / maxScroll : 0;
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translate3d(${progress * maxThumbLeft}px, 0, 0)`;
  };

  const requestThumbUpdate = () => {
    if (thumbFrame) return;
    thumbFrame = requestAnimationFrame(updateThumb);
  };

  const updateWidth = () => {
    updateThumb();
  };

  board.addEventListener("scroll", requestThumbUpdate, { passive: true });

  thumb.addEventListener("pointerdown", (event) => {
    isDragging = true;
    startX = event.clientX;
    startLeft = board.scrollLeft;
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  thumb.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const { maxScroll, maxThumbLeft } = getGeometry();
    const dx = event.clientX - startX;
    const scrollDx = maxThumbLeft ? (dx / maxThumbLeft) * maxScroll : 0;
    board.scrollLeft = startLeft + scrollDx;
  });

  const stopDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
  };

  thumb.addEventListener("pointerup", stopDrag);
  thumb.addEventListener("pointercancel", stopDrag);

  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const { maxScroll, maxThumbLeft, thumbWidth } = getGeometry();
    const rect = track.getBoundingClientRect();
    const thumbLeft = Math.max(0, Math.min(event.clientX - rect.left - thumbWidth / 2, maxThumbLeft));
    board.scrollTo({
      left: maxThumbLeft ? (thumbLeft / maxThumbLeft) * maxScroll : 0,
      behavior: "smooth"
    });
  });

  updateWidth();
  window.addEventListener("resize", updateWidth, { passive: true });
}
