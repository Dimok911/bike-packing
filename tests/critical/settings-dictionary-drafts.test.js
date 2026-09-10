import test from "node:test";
import assert from "node:assert/strict";
import { captureSettingsDictionaryDrafts, restoreSettingsDictionaryDrafts } from "../../src/ui/settings-dictionary-drafts.js";

function fixture() {
  const document = { activeElement: null };
  const input = (id, value, type, source) => ({ id, value, dataset: { dictionaryEditInput: type }, ownerDocument: document,
    selectionStart: 2, selectionEnd: 4, selectionDirection: "backward",
    closest: () => ({ querySelector: () => source ? { getAttribute: () => source } : null }),
    focus(options) { assert.equal(options.preventScroll, true); document.activeElement = this; },
    setSelectionRange(start, end, direction) { Object.assign(this, { selectionStart: start, selectionEnd: end, selectionDirection: direction }); } });
  const root = { inputs: [], querySelectorAll() { return this.inputs; } };
  const render = (scope = "actor:list:personal", values = ["", ""], rename = null) => {
    const drafts = captureSettingsDictionaryDrafts(root, scope);
    root.inputs = [input("locationInput", values[0]), input("categoryInput", values[1]), ...(rename ? [input("", rename.value, "category", rename.source)] : [])];
    restoreSettingsDictionaryDrafts(root, scope, drafts);
  };
  return { root, document, render };
}

test("settings rerender retains unsubmitted dictionary input and caret without registering any operation", () => {
  const f = fixture(); f.render(); f.root.inputs[0].value = "Лагерь"; f.root.inputs[1].value = "Питание";
  f.document.activeElement = f.root.inputs[1]; f.render();
  assert.deepEqual(f.root.inputs.map(input => input.value), ["Лагерь", "Питание"]);
  assert.equal(f.document.activeElement, f.root.inputs[1]);
  assert.deepEqual([f.root.inputs[1].selectionStart, f.root.inputs[1].selectionEnd, f.root.inputs[1].selectionDirection], [2, 4, "backward"]);
  f.root.inputs[1].value = ""; f.render(); assert.equal(f.root.inputs[1].value, ""); // Accepted add clears it.
});

test("restoring a retained field cannot rewind a newer native input or selection", () => {
  const f = fixture(); f.render();
  const original = f.root.inputs[1], drafts = captureSettingsDictionaryDrafts(f.root, "actor:list:personal");
  original.value = "Native input after render";
  original.selectionStart = 1; original.selectionEnd = 7;
  restoreSettingsDictionaryDrafts(f.root, "actor:list:personal", drafts);
  assert.equal(f.root.inputs[1], original); assert.equal(f.root.inputs[1].value, "Native input after render");
  assert.deepEqual([original.selectionStart, original.selectionEnd], [1, 7]);
});

test("drafts cannot cross accounts lists private/template owners or the read-only boundary", () => {
  for (const other of ["another:list:personal", "actor:another:personal", "actor:list:template", null]) {
    const f = fixture(); f.render(); f.root.inputs[0].value = "Private unsent text"; f.render(other);
    assert.equal(f.root.inputs[0].value, ""); f.render(); assert.equal(f.root.inputs[0].value, "");
  }
});

test("rename draft belongs to its exact dictionary source; cancel/reopen and source replacement do not resurrect it", () => {
  const f = fixture(); f.render(undefined, undefined, { source: "Ремонт", value: "Ремонт" });
  f.root.inputs[2].value = "Новый ремонт";
  f.render(undefined, undefined, { source: "Ремонт", value: "Ремонт" }); assert.equal(f.root.inputs[2].value, "Новый ремонт");
  f.render(undefined, undefined, { source: "Еда", value: "Еда" }); assert.equal(f.root.inputs[2].value, "Еда");
  f.render(); f.render(undefined, undefined, { source: "Ремонт", value: "Ремонт" }); assert.equal(f.root.inputs[2].value, "Ремонт");
});
