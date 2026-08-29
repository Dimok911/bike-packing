import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createViewScrollMemory } from "../../src/ui/view-scroll-memory.js";

test("each main view restores its own vertical position and an unseen view starts at the top", () => {
  let current = { x: 0, y: 940 };
  const scheduled = [];
  const writes = [];
  const memory = createViewScrollMemory({
    readPosition: () => current,
    schedule: (callback) => scheduled.push(callback),
    writePosition: (position) => {
      current = position;
      writes.push(position);
    }
  });

  memory.remember("packing");
  assert.deepEqual(memory.restore("items"), { x: 0, y: 0 });
  scheduled.shift()();
  assert.deepEqual(writes.pop(), { x: 0, y: 0 });

  current = { x: 0, y: 520 };
  memory.remember("items");
  assert.deepEqual(memory.restore("packing"), { x: 0, y: 940 });
  scheduled.shift()();
  assert.deepEqual(writes.pop(), { x: 0, y: 940 });

  memory.remember("packing");
  assert.deepEqual(memory.restore("bags"), { x: 0, y: 0 });
  scheduled.shift()();
  assert.deepEqual(writes.pop(), { x: 0, y: 0 });
});

test("a rapid tab change cancels the stale scheduled restore", () => {
  const scheduled = [];
  const writes = [];
  const memory = createViewScrollMemory({
    schedule: (callback) => scheduled.push(callback),
    writePosition: (position) => writes.push(position)
  });

  memory.restore("items", { defaultPosition: { x: 0, y: 120 } });
  memory.restore("settings", { defaultPosition: { x: 0, y: 0 } });
  scheduled.forEach((callback) => callback());

  assert.deepEqual(writes, [{ x: 0, y: 0 }]);
});

test("tab switching remembers the previous viewport before showing and restoring the target view", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const switchViewSource = source.slice(
    source.indexOf("function switchView(view)"),
    source.indexOf("function handlePackingTabTouchEnd", source.indexOf("function switchView(view)"))
  );

  assert.match(switchViewSource, /const previousView = getCurrentView\(\);/);
  assert.match(switchViewSource, /viewScrollMemory\.remember\(previousView\);/);
  assert.match(switchViewSource, /viewScrollMemory\.restore\(view\);/);
  assert.ok(
    switchViewSource.indexOf("viewScrollMemory.remember(previousView)")
      < switchViewSource.indexOf('refs.packingView.classList.toggle("hidden"'),
    "the outgoing view must be captured before its layout is hidden"
  );
});
