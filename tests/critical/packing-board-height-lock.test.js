import test from "node:test";
import assert from "node:assert/strict";
import { createDeferredBoardHeightLock } from "../../src/ui/packing-board-height-lock.js";

function createBoard(height, { connected = true, heightStyle = "", minHeightStyle = "" } = {}) {
  return {
    dataset: {},
    isConnected: connected,
    style: {
      height: heightStyle,
      minHeight: minHeightStyle
    },
    getBoundingClientRect() {
      return { height };
    }
  };
}

function createFakeWindow() {
  const listeners = new Map();
  const callbacks = (type) => {
    if (!listeners.has(type)) listeners.set(type, []);
    return listeners.get(type);
  };
  return {
    addEventListener(type, callback) {
      callbacks(type).push(callback);
    },
    dispatch(type, event = {}) {
      for (const callback of [...callbacks(type)]) callback(event);
    },
    listenerCount(type) {
      return callbacks(type).length;
    },
    removeEventListener(type, callback) {
      const entries = callbacks(type);
      const index = entries.indexOf(callback);
      if (index >= 0) entries.splice(index, 1);
    }
  };
}

function createLockHarness(board) {
  const fakeWindow = createFakeWindow();
  const frames = [];
  let currentBoard = board;
  const lock = createDeferredBoardHeightLock({
    getBoard: () => currentBoard,
    windowRef: () => fakeWindow,
    requestFrame: (callback) => frames.push(callback)
  });
  return {
    fakeWindow,
    flushFrames() {
      while (frames.length) frames.shift()();
    },
    lock,
    setBoard(nextBoard) {
      currentBoard = nextBoard;
    }
  };
}

test("packing board stays height-locked after drop until an explicit scroll gesture", () => {
  const board = createBoard(420);
  const { fakeWindow, flushFrames, lock } = createLockHarness(board);

  lock.lock(board);
  lock.deferUntilScroll(board);

  assert.equal(board.style.height, "420px");
  assert.equal(board.style.minHeight, "420px");

  fakeWindow.dispatch("scroll");
  flushFrames();
  assert.equal(board.style.height, "420px");

  fakeWindow.dispatch("wheel");
  assert.equal(board.style.height, "420px");
  flushFrames();
  assert.equal(board.style.height, "");
  assert.equal(board.style.minHeight, "");
  assert.equal(board.dataset.dragHeightLocked, undefined);
});

test("height lock transfers to the freshly rendered board before deferred unlock", () => {
  const oldBoard = createBoard(500);
  const newBoard = createBoard(280, { heightStyle: "auto" });
  const { fakeWindow, flushFrames, lock, setBoard } = createLockHarness(oldBoard);

  lock.lock(oldBoard);
  oldBoard.isConnected = false;
  setBoard(newBoard);
  lock.deferUntilScroll(oldBoard);

  assert.equal(oldBoard.style.height, "");
  assert.equal(newBoard.style.height, "500px");
  assert.equal(newBoard.style.minHeight, "500px");

  fakeWindow.dispatch("touchmove");
  flushFrames();
  assert.equal(newBoard.style.height, "auto");
  assert.equal(newBoard.style.minHeight, "");
});

test("starting a new drag before scroll cancels the deferred unlock", () => {
  const board = createBoard(360);
  const { fakeWindow, flushFrames, lock } = createLockHarness(board);

  lock.lock(board);
  lock.deferUntilScroll(board);
  assert.equal(fakeWindow.listenerCount("wheel"), 1);

  lock.lock(board);
  assert.equal(fakeWindow.listenerCount("wheel"), 0);

  fakeWindow.dispatch("wheel");
  flushFrames();
  assert.equal(board.style.height, "360px");
  assert.equal(board.dataset.dragHeightLocked, "true");
});

test("scroll keys unlock only when the key can express page scroll intent", () => {
  const board = createBoard(310);
  const { fakeWindow, flushFrames, lock } = createLockHarness(board);

  lock.lock(board);
  lock.deferUntilScroll(board);
  fakeWindow.dispatch("keydown", {
    key: "ArrowDown",
    target: { closest: () => ({ tagName: "INPUT" }) }
  });
  flushFrames();
  assert.equal(board.style.height, "310px");

  fakeWindow.dispatch("keydown", {
    key: "PageDown",
    target: { closest: () => null }
  });
  flushFrames();
  assert.equal(board.style.height, "");
});
