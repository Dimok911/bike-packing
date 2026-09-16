import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { bindDictionaryControls, renameDictionaryEntry } from "../../src/ui/dictionary-bindings.js";

const source = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = source.slice(start), end = tail.search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(name, commit) {
  const effects = [], state = { activeLayoutId: "layout", items: { item: {}, other: {} },
    containers: { bag: { nestable: true }, target: {} }, packedItems: {}, collapsedContainers: {},
    layouts: { layout: { rootContainerIds: ["bag"], arrangement: { containers: { bag: { parentId: "target" } } } } } };
  const context = { state, runtime: {}, pendingCopyTargetContainerSetup: false,
    showToast: (_, tone) => effects.push(tone), render: () => effects.push("render"),
    refs: { layoutRootDialog: { open: true, close: () => effects.push("close") },
      containerPickerDialog: { close: () => effects.push("close") } },
    preparePersonalPlacementAction: () => commit, preparePersonalLayoutDeletionAction: () => commit,
    getPublishedEditLayoutId: () => "layout", getLayoutRootTargetLayoutId: () => "layout",
    warnLockedLayoutMutation: () => false, adminTemplateUiEnabled: () => false, adminTemplatePhotoCreateFormEnabled: () => false,
    requireUsageCapacity: () => true, canDeleteActiveLayout: () => true,
    capturePackingScroll: () => {}, nowIso: () => "now", createEntityId: () => "group",
    localText: en => en, getLayoutItemIdSet: () => new Set(),
    markRecentlyAddedItem: () => {}, openCopiedTargetLayout: () => {}, closeSourceEditorAfterCopy: () => {},
    requestAnimationFrame: () => {}, touchItem: () => {}, saveState: () => effects.push("save") };
  const invoke = runInNewContext(`${declaration("finishPreparedPersonalMutation")}\n${declaration(name)}\n${name}`, context);
  return { effects, state, context, invoke };
}

const placements = [
  ["togglePacked", ["item"]], ["moveItem", ["item", "target"]],
  ["moveContainer", ["bag", "target"]], ["moveRootColumn", ["bag", 1]],
  ["createGroupFromItems", ["item", "other"]],
  ["addRootContainerToActiveLayout", ["bag"]],
  ["placeExistingContainerInLayout", ["bag", "target"]],
  ["linkExistingItemToContainerInLayout", ["item", "target"]],
  ["deleteActiveLayout", []]
];
for (const [name, args] of placements) {
  test(`${name}: deferred durable commit does not announce success or close UI early`, async () => {
    const gate = deferred(), f = fixture(name, () => gate.promise);
    const pending = f.invoke(...args);
    assert.deepEqual(f.effects, []);
    gate.resolve(true); assert.equal(await pending, true);
    assert.ok(f.effects.includes("render"));
  });
  test(`${name}: refused or rejected capture never renders success`, async () => {
    for (const rejected of [false, true]) {
      const gate = deferred(), f = fixture(name, () => gate.promise), pending = f.invoke(...args);
      if (rejected) gate.reject(Error("storage unavailable")); else gate.resolve(false);
      assert.equal(await pending, false);
      assert.deepEqual(f.effects, rejected ? ["error"] : []);
      assert.equal(f.context.runtime.editingContainerId, undefined);
    }
  });
}

test("existing synchronous prepared placement retains synchronous completion", () => {
  const f = fixture("addRootContainerToActiveLayout", () => true);
  assert.equal(f.invoke("bag"), true);
  assert.deepEqual(f.effects, ["close", "render"]);
});

test("guest packing still mutates and renders synchronously without a prepared commit", () => {
  const f = fixture("togglePacked", null);
  assert.equal(f.invoke("item"), undefined);
  assert.equal(f.state.packedItems.item, true);
  assert.deepEqual(f.effects, ["save", "render"]);
});

function dictionaryFixture(commit) {
  const effects = [], callbacks = {}, input = { value: "New place" }, owner = {};
  const options = { owner, activeDictionaryOwner: () => owner, dictionaryEditScope: () => ({ items: [], containers: [] }),
    dictionaryOptionsForOwner: () => ["Old place"], prepareDictionaryMutation: () => commit,
    render: () => effects.push("render"), setEditingDictionaryEntry: () => effects.push("clear"),
    onRenamed: () => effects.push("rename"), showToast: (_, tone) => effects.push(tone),
    requireUsageCapacity: () => true, capitalize: value => value[0].toUpperCase() + value.slice(1),
    itemCategories: () => [], formatThingCount: () => "0", openConfirmDialog: value => { callbacks.confirm = value.onConfirm; } };
  const button = { dataset: { removeLocation: "Old place" }, addEventListener: (_, fn) => { callbacks.remove = fn; } };
  const document = { documentElement: { lang: "en" },
    querySelector: selector => selector === "#locationInput" ? input : { addEventListener: (_, fn) => { callbacks.add = fn; } },
    querySelectorAll: selector => selector === "[data-remove-location]" ? [button] : [] };
  return { options, effects, callbacks, input, document };
}

for (const action of ["add", "delete", "rename"]) {
  test(`dictionary ${action}: keep editor unchanged until durable acceptance, including errors`, async () => {
    for (const result of [true, false, "reject"]) {
      const gate = deferred(), f = dictionaryFixture(() => gate.promise);
      const previous = globalThis.document;
      globalThis.document = f.document;
      try {
        let pending;
        if (action === "rename") pending = renameDictionaryEntry("location", "Old place", "New place", f.options);
        else {
          bindDictionaryControls("location", f.options);
          if (action === "delete") { f.callbacks.remove(); pending = f.callbacks.confirm(); }
          else pending = f.callbacks.add();
        }
        assert.deepEqual(f.effects, []);
        assert.equal(f.input.value, "New place");
        if (result === "reject") gate.reject(Error("storage unavailable")); else gate.resolve(result);
        assert.equal(await pending, result === true);
        if (result === true) {
          assert.ok(f.effects.includes("render"));
          if (action === "add") assert.equal(f.input.value, "");
        } else {
          assert.deepEqual(f.effects, result === "reject" ? ["error"] : []);
          assert.equal(f.input.value, "New place");
        }
      } finally { globalThis.document = previous; }
    }
  });
}
