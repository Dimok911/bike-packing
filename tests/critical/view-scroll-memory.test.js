import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createViewScrollMemory } from "../../src/ui/view-scroll-memory.js";

test("CRITICAL view scroll memory: every tab restores its own document position synchronously", () => {
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
});

test("CRITICAL view scroll memory: rapid tab changes leave no delayed restore behind", () => {
  let scheduled = false;
  const writes = [];
  const memory = createViewScrollMemory({
    schedule: () => {
      scheduled = true;
    },
    writePosition: (position) => writes.push(position)
  });

  memory.restore("items", { defaultPosition: { x: 0, y: 120 } });
  memory.restore("bags", { defaultPosition: { x: 0, y: 0 } });

  assert.equal(scheduled, false);
  assert.deepEqual(writes, [{ x: 0, y: 120 }, { x: 0, y: 0 }]);
});

test("CRITICAL view scroll memory: catalog redraw stays before synchronous tab restoration", () => {
  const source = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const start = source.indexOf("function switchView(view)");
  const end = source.indexOf("\nfunction ", start + 1);
  const switchViewSource = source.slice(start, end);
  const memorySetupStart = source.indexOf("const viewScrollMemory = createViewScrollMemory");
  const memorySetupEnd = source.indexOf("const locations =", memorySetupStart);
  const memorySetupSource = source.slice(memorySetupStart, memorySetupEnd);

  assert.doesNotMatch(memorySetupSource, /requestAnimationFrame/);
  assert.ok(
    switchViewSource.indexOf('refs.settingsView.classList.toggle("hidden"')
      < switchViewSource.indexOf("renderFilters()"),
    "the catalog target view must be visible before its filters redraw"
  );
  assert.ok(
    switchViewSource.indexOf("renderFilters()")
      < switchViewSource.indexOf("viewScrollMemory.restore(view)"),
    "the experiment catalog redraw must finish before the synchronous restore"
  );
});

test("CRITICAL view scroll memory: document anchoring and coarse duplicate headers stay disabled", () => {
  const styles = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.app\s*\{[\s\S]*?overflow-anchor:\s*none;/);
  assert.match(styles, /html:not\(\.isolated-viewport-scroll\) \.packing-root-header-row\s*\{[\s\S]*?display:\s*none\s*!important;/);
});

test("CRITICAL view scroll memory: a delayed packing restore cannot overwrite another tab", () => {
  const source = fs.readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const start = source.indexOf("function restorePendingPackingScroll(board,");
  const end = source.indexOf("\nfunction ", start + 1);
  const restoreSource = source.slice(start, end);
  assert.match(
    restoreSource,
    /requestAnimationFrame\(\(\)\s*=>\s*\{\s*if \(refs\.packingView\.classList\.contains\("hidden"\)\) return;/s
  );
  assert.match(
    appSource,
    /const restoredViewPosition = viewChanged \? viewScrollMemory\.restore\(view\) : null;[\s\S]*?restorePendingPackingScroll\(getPackingScrollHost\(\), restoredViewPosition\)/
  );
  assert.match(restoreSource, /restoredViewPosition\?\.y[\s\S]*?top: restoredWindowY/);
});
