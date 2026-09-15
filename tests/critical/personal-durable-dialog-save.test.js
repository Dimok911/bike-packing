import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveItemDialogAction, saveRootContainerDialogAction } from "../../src/ui/item-dialog-save.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(mode) {
  const field = value => ({ value });
  const refs = { saveItemBtn: {}, saveRootContainerBtn: {}, dialog: { open: true }, rootContainerDialog: { open: true },
    itemName: field("Renamed item"), rootContainerName: field("Renamed bag"),
    itemContainer: field(mode === "item-move" ? "target" : ""), itemWeight: field("0"), itemNote: field(""), itemLocation: field(""),
    rootContainerWeight: field("0"), rootContainerVolume: field("0"), rootContainerNote: field(""), rootContainerLocation: field("") };
  const state = { activeLayoutId: "layout", items: { item: { id: "item", name: "Before" } },
    containers: { bag: { id: "bag", name: "Before" }, target: { id: "target" } }, layouts: { layout: {} } };
  const pending = deferred(), events = [];
  const options = { refs, state, createItemId: () => "new-item", createRootContainerId: () => "new-bag",
    getPublishedEditLayoutId: () => "layout", placeExistingItemInLayout: () => true,
    getItemContainerIdInLayout: () => mode === "item-remove" ? "target" : "",
    editingItemId: mode === "item-new" ? "" : "item", editingRootContainerId: mode === "container-new" ? "" : "bag",
    saveLayoutMutation: () => { events.push("capture"); return pending.promise; },
    closeDialogWithoutRestoringFocus: dialog => { events.push("close"); dialog.open = false; },
    render: () => events.push("render") };
  return { options, refs, pending, events, state };
}

for (const mode of ["item-new", "item-edit", "item-move", "item-remove", "container-new", "container-edit"]) {
  test(`${mode} closes only after durable capture and retains the form on quota failure`, async () => {
    for (const success of [true, false]) {
      const f = fixture(mode), item = mode.startsWith("item");
      const result = (item ? saveItemDialogAction : saveRootContainerDialogAction)(f.options);
      assert.equal(typeof result.then, "function");
      assert.deepEqual(f.events, ["capture"]);
      assert.equal((item ? f.refs.dialog : f.refs.rootContainerDialog).open, true);
      if (success) {
        f.pending.resolve(true); await result;
        assert.deepEqual(f.events, ["capture", "close", "render"]);
      } else {
        f.pending.reject(new DOMException("Quota", "QuotaExceededError"));
        await assert.rejects(result, { name: "QuotaExceededError" });
        assert.deepEqual(f.events, ["capture"]);
        assert.equal((item ? f.refs.dialog : f.refs.rootContainerDialog).open, true);
        const records = item ? f.state.items : f.state.containers;
        assert.ok(Object.values(records).some(record => record.name === (item ? "Renamed item" : "Renamed bag")), "draft is retained for recovery");
      }
    }
  });
}

const tail = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
for (const type of ["item", "container"]) {
  test(`actual ${type} controller awaits capture, ignores a second click and reports rejected persistence`, async () => {
    for (const success of [true, false]) {
      const pending = deferred(), events = [], dialog = { open: true, inert: false }, button = { disabled: false };
      let scope = "id:original";
      const name = type === "item" ? "saveDialogItem" : "saveRootContainerDialog";
      const source = tail.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))?.[0];
      assert.ok(source);
      const dependencies = Object.fromEntries([
        "applyItemAvailabilityStatus", "applyItemDimensions", "applyItemDialogPhotoDraft", "applyLayoutArrangement",
        "closeDialogWithoutRestoringFocus", "currentEditMeta", "getDialogSelectedCategories", "getItemContainerIdInLayout",
        "getPublishedEditLayoutId", "hasContainerDimensions", "markRecordActivePublicCatalog", "normalizeContainerColor",
        "normalizeItemAvailabilityStatus", "parseWeightInput", "placeExistingItemInLayout", "readItemDialogDimensions",
        "readItemDialogQuantity", "removeItemFromLayoutArrangement", "render", "requireUsageCapacity", "restoreAdminPublishedLayoutContext",
        "saveLayoutMutation", "showToast", "touchItem", "touchLayout", "capturePackingScroll", "warnLockedItemDialogPlacementChange",
        "warnLockedRootContainerDialogPlacementChange", "applyRootContainerDialogParent", "applyRootContainerDialogPhotoDraft",
        "applyRootContainerDialogPlacement", "applyRootContainerDimensions", "currentCreateMeta", "defaultRootContainerLocation",
        "getRootContainerDialogSelectedCategories", "parseVolumeInput", "readRootContainerDialogDimensions", "touchContainer"
      ].map(key => [key, () => {}]));
      Object.assign(dependencies, {
        adminTemplatePhotoForms: { save: () => false }, personalPhotoForms: { save: () => false },
        refs: { dialog, rootContainerDialog: dialog, saveItemBtn: button, saveRootContainerBtn: button },
        runtime: { editingItemId: "item", editingRootContainerId: "bag" }, state: {},
        nowIso: () => "time", localText: (en, ru) => ru, t: key => key,
        placeNewRootInCurrentLayout: false, rootContainerPlacementTargetLayoutId: "", pendingCopyTargetContainerSetup: null,
        clearStoredNewEntityFormDraft: () => events.push("clear"), getCurrentView: () => "packing",
        getPersonalSaveErrorScope: () => scope,
        reportPersonalSaveError: (error, options) => { assert.equal(options.scopeKey, "id:original"); events.push(error); },
        updateItemDialogSaveState: () => { button.disabled = false; }, updateRootContainerDialogSaveState: () => { button.disabled = false; },
        saveItemDialogAction: () => { events.push("capture"); return pending.promise; },
        saveRootContainerDialogAction: () => { events.push("capture"); return pending.promise; }
      });
      const save = new Function(...Object.keys(dependencies),
        `let itemFormDraftSaving = false, rootContainerFormDraftSaving = false, rootContainerCatalogSelection = null, rootContainerManufacturerPhotoSource = null; return (${source});`)(...Object.values(dependencies));
      const result = save();
      assert.deepEqual(events, ["capture"]);
      assert.equal(button.disabled, true); assert.equal(dialog.inert, true);
      assert.equal(await save(), false); assert.deepEqual(events, ["capture"]);
      if (success) {
        const saved = { created: false, id: type, type }; pending.resolve(saved);
        assert.equal(await result, saved); assert.deepEqual(events, ["capture"]);
      } else {
        scope = "id:changed";
        const failure = new DOMException("Quota", "QuotaExceededError"); pending.reject(failure);
        assert.equal(await result, false); assert.deepEqual(events, ["capture", failure]);
        assert.equal(dialog.open, true);
      }
      assert.equal(dialog.inert, false); assert.equal(button.disabled, false);
    }
  });
}
