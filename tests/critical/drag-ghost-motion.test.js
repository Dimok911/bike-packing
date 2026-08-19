import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createDragGhostMotion } from "../../src/ui/drag-ghost-motion.js";

function createFrameHarness() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    requestFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
    flushNext() {
      const entry = callbacks.entries().next().value;
      if (!entry) return false;
      const [id, callback] = entry;
      callbacks.delete(id);
      callback();
      return true;
    },
    get size() {
      return callbacks.size;
    }
  };
}

test("desktop drag ghost coalesces pointer moves and reaches the latest point in one frame", () => {
  const frames = createFrameHarness();
  const positions = [];
  const motion = createDragGhostMotion({
    responsiveness: 1,
    applyPosition: (x, y) => positions.push([x, y]),
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame
  });

  motion.move(10, 20);
  motion.move(30, 40);

  assert.equal(frames.size, 1);
  frames.flushNext();
  assert.deepEqual(positions, [[30, 40]]);
  assert.equal(frames.size, 0);
});

test("touch drag ghost preserves gradual follow movement", () => {
  const frames = createFrameHarness();
  const positions = [];
  const motion = createDragGhostMotion({
    responsiveness: 0.28,
    applyPosition: (x, y) => positions.push([x, y]),
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame
  });

  motion.move(100, 50, { immediate: true });
  motion.move(200, 100);
  frames.flushNext();

  assert.deepEqual(positions, [[100, 50], [128, 64]]);
  assert.equal(frames.size, 1);
  motion.stop();
  assert.equal(frames.size, 0);
});

test("drag ghost overrides the item card transform transition", async () => {
  const styles = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  const dragGhostRule = styles.match(/\.drag-ghost\s*\{([^}]+)\}/)?.[1] || "";

  assert.match(dragGhostRule, /transition:\s*none\s*!important/);
  assert.match(dragGhostRule, /will-change:\s*transform/);
});
