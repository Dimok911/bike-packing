import assert from "node:assert/strict";
import test from "node:test";

import {
  isLayoutNotesCollapsed,
  loadLayoutNotesCollapseState,
  setLayoutNotesCollapsed
} from "../../src/ui/layout-notes-collapse.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test("layout notes collapse preference is remembered independently for each layout", () => {
  const storage = memoryStorage();
  const key = "user-a:layout-notes";

  assert.equal(isLayoutNotesCollapsed(key, "layout-a", storage), false);
  assert.equal(setLayoutNotesCollapsed(key, "layout-a", true, storage), true);
  assert.equal(isLayoutNotesCollapsed(key, "layout-a", storage), true);
  assert.equal(isLayoutNotesCollapsed(key, "layout-b", storage), false);

  setLayoutNotesCollapsed(key, "layout-a", false, storage);
  assert.equal(isLayoutNotesCollapsed(key, "layout-a", storage), false);
});

test("layout notes collapse preference is isolated by user storage scope", () => {
  const storage = memoryStorage();

  setLayoutNotesCollapsed("user-a:layout-notes", "layout-a", true, storage);

  assert.equal(isLayoutNotesCollapsed("user-a:layout-notes", "layout-a", storage), true);
  assert.equal(isLayoutNotesCollapsed("user-b:layout-notes", "layout-a", storage), false);
});

test("invalid stored collapse preference is ignored", () => {
  const storage = memoryStorage({
    "layout-notes": JSON.stringify({ valid: true, stringValue: "true", empty: false })
  });

  assert.deepEqual(loadLayoutNotesCollapseState("layout-notes", storage), { valid: true, empty: false });
  assert.deepEqual(loadLayoutNotesCollapseState("missing", storage), {});
});
