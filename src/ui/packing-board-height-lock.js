const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Spacebar"]);

export function createDeferredBoardHeightLock({
  getBoard = () => null,
  windowRef = () => globalThis.window,
  requestFrame = null
} = {}) {
  let activeLock = null;
  let pendingCleanup = null;

  const frame = (callback) => {
    const win = windowRef?.();
    const scheduler = requestFrame || win?.requestAnimationFrame?.bind(win);
    if (scheduler) scheduler(callback);
    else callback();
  };

  const readHeight = (board) => board?.getBoundingClientRect?.().height || 0;

  const isEditableTarget = (target) => {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const closest = target.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']");
    return Boolean(closest);
  };

  const isScrollKeyEvent = (event) => {
    if (!SCROLL_KEYS.has(event?.key)) return false;
    return !isEditableTarget(event.target);
  };

  const clearPendingUnlock = () => {
    if (!pendingCleanup) return;
    pendingCleanup();
    pendingCleanup = null;
  };

  const restoreBoard = (lock) => {
    if (!lock?.board) return;
    lock.board.style.height = lock.previousHeight;
    lock.board.style.minHeight = lock.previousMinHeight;
    delete lock.board.dataset.dragHeightLocked;
  };

  const applyLock = (board, height) => {
    if (!board || !height) return null;
    const lock = {
      board,
      height,
      previousHeight: board.style.height || "",
      previousMinHeight: board.style.minHeight || ""
    };
    board.dataset.dragHeightLocked = "true";
    board.style.height = `${height}px`;
    board.style.minHeight = `${height}px`;
    return lock;
  };

  const unlock = () => {
    clearPendingUnlock();
    restoreBoard(activeLock);
    activeLock = null;
  };

  const transferToCurrentBoard = (preferredBoard = null) => {
    if (!activeLock) return null;
    if (activeLock.board?.isConnected !== false) return activeLock.board;
    const currentBoard = preferredBoard?.isConnected !== false ? preferredBoard : getBoard?.();
    if (!currentBoard || currentBoard === activeLock.board) return activeLock.board;
    restoreBoard(activeLock);
    activeLock = applyLock(currentBoard, activeLock.height);
    return activeLock?.board || null;
  };

  const lock = (board = getBoard?.()) => {
    const target = board || getBoard?.();
    clearPendingUnlock();
    if (!target) return;
    if (activeLock?.board === target && target.dataset.dragHeightLocked === "true") return;
    if (activeLock) restoreBoard(activeLock);
    activeLock = applyLock(target, readHeight(target));
  };

  const ensureMinHeight = (board = activeLock?.board, minHeight = 0) => {
    const target = board || getBoard?.();
    if (!target || !minHeight) return;
    clearPendingUnlock();
    if (!activeLock || activeLock.board !== target) lock(target);
    transferToCurrentBoard(target);
    const currentHeight = parseFloat(activeLock?.board?.style.height) || readHeight(activeLock?.board);
    const nextHeight = Math.max(currentHeight, minHeight);
    if (!activeLock?.board || nextHeight <= currentHeight) return;
    activeLock.height = nextHeight;
    activeLock.board.style.height = `${nextHeight}px`;
    activeLock.board.style.minHeight = `${nextHeight}px`;
  };

  const deferUntilScroll = (board = activeLock?.board) => {
    if (!activeLock) return;
    const target = transferToCurrentBoard(board) || activeLock.board;
    if (!target || pendingCleanup) return;
    const win = windowRef?.();
    if (!win?.addEventListener) return;

    const release = () => {
      clearPendingUnlock();
      frame(() => unlock());
    };
    const releaseOnScrollKey = (event) => {
      if (isScrollKeyEvent(event)) release();
    };
    const options = { capture: true, passive: true };
    pendingCleanup = () => {
      win.removeEventListener("wheel", release, options);
      win.removeEventListener("touchmove", release, options);
      win.removeEventListener("keydown", releaseOnScrollKey, true);
    };
    win.addEventListener("wheel", release, options);
    win.addEventListener("touchmove", release, options);
    win.addEventListener("keydown", releaseOnScrollKey, true);
  };

  return {
    deferUntilScroll,
    ensureMinHeight,
    lock,
    unlock
  };
}
