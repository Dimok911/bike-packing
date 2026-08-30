import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createViewScrollMemory } from "../../src/ui/view-scroll-memory.js";

test("each main view restores its own vertical position and an unseen view starts at the top", () => {
  let current = { x: 0, y: 940 };
  const writes = [];
  const memory = createViewScrollMemory({
    readPosition: () => current,
    writePosition: (position) => {
      current = position;
      writes.push(position);
    }
  });

  memory.remember("packing");
  assert.deepEqual(memory.restore("items"), { x: 0, y: 0 });
  assert.deepEqual(writes.pop(), { x: 0, y: 0 });

  current = { x: 0, y: 520 };
  memory.remember("items");
  assert.deepEqual(memory.restore("packing"), { x: 0, y: 940 });
  assert.deepEqual(writes.pop(), { x: 0, y: 940 });

  memory.remember("packing");
  assert.deepEqual(memory.restore("bags"), { x: 0, y: 0 });
  assert.deepEqual(writes.pop(), { x: 0, y: 0 });
});

test("tab restoration is synchronous and leaves no callback that can overwrite a touch gesture", () => {
  let scheduled = false;
  const writes = [];
  const memory = createViewScrollMemory({
    schedule: () => {
      scheduled = true;
    },
    writePosition: (position) => writes.push(position)
  });

  memory.restore("items", { defaultPosition: { x: 0, y: 120 } });
  memory.restore("settings", { defaultPosition: { x: 0, y: 0 } });

  assert.equal(scheduled, false);
  assert.deepEqual(writes, [{ x: 0, y: 120 }, { x: 0, y: 0 }]);
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
  const memorySetupSource = source.slice(
    source.indexOf("const viewScrollMemory = createViewScrollMemory"),
    source.indexOf("const locations =", source.indexOf("const viewScrollMemory = createViewScrollMemory"))
  );
  assert.doesNotMatch(memorySetupSource, /requestAnimationFrame/);
  assert.doesNotMatch(
    switchViewSource,
    /renderFilters\(\)/,
    "switching views must not rebuild unchanged filter and category controls"
  );
  assert.ok(
    switchViewSource.indexOf("viewScrollMemory.remember(previousView)")
      < switchViewSource.indexOf('refs.packingView.classList.toggle("hidden"'),
    "the outgoing view must be captured before its layout is hidden"
  );
  assert.ok(
    switchViewSource.indexOf('refs.settingsView.classList.toggle("hidden"')
      < switchViewSource.indexOf("viewScrollMemory.restore(view)"),
    "the target view must be visible before its position is restored synchronously"
  );
});

test("every delayed search viewport restore yields to a later user scroll gesture", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const preserveSource = source.slice(
    source.indexOf("function preserveSearchBlurViewport()"),
    source.indexOf("function captureSearchBlurViewportLock()")
  );

  assert.match(preserveSource, /const restore = \(\) => \{\s*if \(hasExplicitViewportScrollIntent\(\)\) return;/);
  assert.match(preserveSource, /window\.setTimeout\(restore, 360\);/);
});
