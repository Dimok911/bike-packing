import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAdminTemplatePhotoCopyPickerController } from "../../src/app/app-tail-controllers.js";

const source = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
function button(dataset = {}) {
  const events = new Map();
  return { dataset, disabled: false, hidden: false, classList: { toggle: noop },
    addEventListener: (name, fn) => events.set(name, fn), click: () => events.get("click")?.() };
}
function board() {
  let html = "", roots = [], photo = null;
  const parse = text => {
    for (const match of text.matchAll(/data-pick-root-index="(\d+)"/g)) roots.push(button({ pickRootIndex: match[1] }));
    if (text.includes("data-pick-admin-photo-catalog")) photo = button();
  };
  return { classList: { toggle: noop },
    get innerHTML() { return html; }, set innerHTML(value) { html = value; roots = []; photo = null; parse(value); },
    insertAdjacentHTML(_where, value) { html += value; parse(value); },
    querySelectorAll: selector => selector === "[data-pick-root-index]" ? roots : [],
    querySelector: selector => selector === "[data-pick-admin-photo-catalog]" ? photo : null,
    roots: () => roots, photo: () => photo };
}

// Execute the real tail initialization, renderer and event handlers with the
// exported routing factory. Only DOM surfaces and app-owned eligibility/submit
// boundaries are supplied here; protocol/capture proof belongs to app tests.
function fixture({ type = "container", contents = true, tree = true, v8 = true } = {}) {
  const state = { layouts: { source: { id: "source", rootContainerIds: ["root"] },
    target: { id: "target", rootContainerIds: ["target-a", "target-b"] } },
    containers: { root: { id: "root", photos: [], children: ["nested"], items: ["item"] },
      nested: { id: "nested", parentId: "root", photos: [{ id: "nested-photo" }] } },
    items: { item: { id: "item", photos: [{ id: "item-photo" }] } } };
  const form = { name: "Saved", photos: clone(type === "item" ? state.items.item.photos : state.containers.root.photos) };
  const runtime = { editingRootContainerId: "root", editingItemId: "item",
    rootContainerDialogInitialSnapshot: clone(form), itemDialogInitialSnapshot: clone(form) };
  const refs = { containerPickerDialog: { open: false }, rootContainerDialog: { open: true }, dialog: { open: true },
    containerPickerBoard: board(), containerPickerNoneBtn: button(), itemContainer: { value: "" }, rootContainerNestable: { checked: false } };
  const flags = { tree, v8 }, controls = { eligible: true }, calls = { tree: [], v8: [], eligible: [], legacy: [], errors: [], closed: [], views: [] };
  const durable = { snapshot: { copiedOwners: [{ entityType: "container", localId: "new-root" }] } };
  const submit = route => async (input, options) => {
    calls[route].push({ input, options });
    if (controls.submit) return controls.submit(input, options, route);
    assert.equal(options.isCurrent(), true); options.onDurable(durable); return { state: "committed", applied: true };
  };
  const deps = {
    state, runtime, refs, clone, snapshotsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    getItemDialogSnapshot: () => clone(form), getRootContainerDialogSnapshot: layoutId => { assert.equal(layoutId, "source"); return clone(form); },
    createAdminTemplatePhotoCopyPickerController,
    adminTemplatePhotoCopyFormEnabled: () => flags.v8,
    adminTemplatePhotoCopyEligible: value => { calls.eligible.push(["v8", clone(value)]); return controls.eligible && !value.includeContents; },
    submitAdminTemplatePhotoCopyForm: submit("v8"),
    adminTemplatePhotoTreeCopyFormEnabled: () => flags.tree,
    adminTemplatePhotoTreeCopyEligible: value => {
      calls.eligible.push(["tree", clone(value)]);
      return controls.eligible && value.entityType === "container" && value.includeContents === true
        && Number.isSafeInteger(value.placementIndex) && value.placementIndex >= 0
        && value.placementIndex <= state.layouts[value.targetLayoutId].rootContainerIds.length;
    },
    submitAdminTemplatePhotoTreeCopyForm: submit("tree"),
    openModalDialog: dialog => { dialog.open = true; },
    closeDialogWithoutRestoringFocus: dialog => { calls.closed.push(dialog); dialog.open = false; },
    switchView: view => calls.views.push(view), render: noop, showToast: text => calls.errors.push(text),
    getPublishedEditLayoutId: () => "source", getPublishedWorkLayout: () => state.layouts.source,
    isAdminEditablePublishedLayout: id => ["source", "target"].includes(id),
    isContainerNestedInLayout: () => false, warnUnavailableItemDialogPlacement: () => false,
    ensureAdminPublicCopyTargetsAvailable: async () => {}, offerCreateLayoutWhenNoCopyTargets: async () => false,
    getContainerPickerLayoutOptions: () => [state.layouts.target], isNewItemPlacementPickerMode: () => false,
    updateContainerPickerTitle: noop, renderContainerPickerLayoutSelect: noop,
    shouldUseRootCopyPlacementPicker: () => runtime.containerPickerMode === "container-copy",
    withLayoutArrangementApplied: (_id, fn) => fn(), getVisibleLayoutRootIds: layout => layout.rootContainerIds,
    renderRootPlacementColumn: () => "", renderContainerPickerColumn: () => "", renderPackingAddRootCard: () => "",
    isContainerPickerItemCopyMode: () => runtime.containerPickerMode === "item-copy",
    isContainerPickerContainerCopyMode: () => runtime.containerPickerMode === "container-copy",
    PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED: false, bindHorizontalTouchScroll: noop, resetHorizontalTouchScroll: noop,
    escapeHtml: value => value, t: value => value, localText: (_en, ru) => ru,
    copyContainerTreeToLayout: (...args) => { calls.legacy.push(args); },
    SHARED_ITEM_COPY_PICKER_MODE: "shared-item", SHARED_CONTAINER_COPY_PICKER_MODE: "shared-container"
  };
  const names = ["openRootContainerCopyPickerDialog", "openItemCopyContainerPickerDialog", "renderContainerPicker",
    "renderRootCopyPlacementBoard", "renderRootCopyPlacementSlot", "adminTemplatePhotoCopyPickerSelection",
    "isAdminTemplatePhotoTreeCopyPickerRoute", "selectContainerPickerRootTarget", "selectContainerPickerTarget"];
  const functions = names.map(name => { const found = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(found, name); return found[0]; });
  const initialization = source.match(/const adminTemplatePhotoCopies = createAdminTemplatePhotoCopyPickerController\(\{[^]*?\n  \}\);/);
  assert.ok(initialization);
  const api = new Function(...Object.keys(deps), `let adminTemplatePhotoCopyPickerSession = null;
    let containerPickerSourceIsNestedContainer = false, containerPickerCopyIncludesContents = ${contents}, rootContainerDialogCopyIncludesContents = ${contents};
    ${functions.join("\n")}
    ${initialization[0]}
    return { ${names.join(",")}, controller: adminTemplatePhotoCopies };`)(...Object.values(deps));
  const open = () => type === "item" ? api.openItemCopyContainerPickerDialog() : api.openRootContainerCopyPickerDialog();
  return { state, form, runtime, refs, flags, controls, calls, api, durable, open };
}

test("actual initial root picker routes descendant-only photos at the chosen root index and uses frozen input for durable UI", async () => {
  const f = fixture(), before = clone(f.state); await f.open();
  assert.equal(f.state.containers.root.photos.length, 0); assert.ok(f.state.containers.nested.photos.length);
  assert.ok(f.refs.containerPickerDialog.open); assert.match(f.refs.containerPickerBoard.innerHTML, /С содержимым и фотографиями/);
  assert.doesNotMatch(f.refs.containerPickerBoard.innerHTML, /без содержимого|без размещения/);
  await f.refs.containerPickerBoard.roots()[1].click();
  assert.equal(f.calls.tree.length, 1); assert.equal(f.calls.tree[0].input.placementIndex, 1);
  assert.equal(f.calls.tree[0].input.includeContents, true); assert.ok(Object.isFrozen(f.calls.tree[0].input.formSnapshot));
  assert.equal(f.calls.v8.length, 0); assert.equal(f.calls.legacy.length, 0); assert.deepEqual(f.state, before);
  assert.deepEqual(f.calls.closed, [f.refs.containerPickerDialog, f.refs.rootContainerDialog]); assert.deepEqual(f.calls.views, ["bags"]);
});

test("explicit tree button appends, while item and shell catalog buttons retain V8 and never gain a placement field", async () => {
  for (const options of [{}, { type: "item" }, { contents: false }]) {
    const f = fixture(options); await f.open(); await f.refs.containerPickerBoard.photo().click();
    const tree = options.type !== "item" && options.contents !== false, calls = f.calls[tree ? "tree" : "v8"];
    assert.equal(calls.length, 1); assert.equal(f.calls[tree ? "v8" : "tree"].length, 0);
    if (tree) assert.equal(calls[0].input.placementIndex, 2);
    else { assert.equal(Object.hasOwn(calls[0].input, "placementIndex"), false); assert.equal(calls[0].input.includeContents, false); }
    assert.deepEqual(f.calls.views, [options.type === "item" ? "items" : "bags"]);
  }
});

test("quota retries preserve the identical chosen index/input; concurrent different-slot clicks cannot change the running attempt", async () => {
  const f = fixture(); let calls = 0, entered, release;
  const wait = new Promise(resolve => { entered = resolve; });
  f.controls.submit = async (input, options) => {
    if (++calls === 1) throw Error("Quota");
    entered(); await new Promise(resolve => { release = resolve; });
    assert.equal(options.isCurrent(), true); options.onDurable(f.durable); return "committed";
  };
  await f.open(); const firstButton = f.refs.containerPickerBoard.roots()[0];
  assert.equal(await firstButton.click(), false); assert.ok(f.refs.containerPickerDialog.open); assert.ok(f.refs.rootContainerDialog.open);
  const retry = firstButton.click(); await wait; const double = f.refs.containerPickerBoard.roots()[2].click();
  assert.equal(f.api.controller.busy(), true); assert.equal(f.refs.containerPickerBoard.photo().disabled, true);
  release(); assert.equal(await retry, "committed"); assert.equal(await double, "committed");
  assert.equal(calls, 2); assert.equal(f.calls.tree[0].input, f.calls.tree[1].input);
  assert.equal(f.calls.tree[1].input.placementIndex, 0); assert.deepEqual(f.calls.errors, ["Quota"]);
});

test("changed source, target, route flag or reopened identical session invalidates asynchronous tree capture without a shell fallback", async () => {
  for (const fault of ["source", "target", "flag", "reopen"]) {
    const f = fixture(); let entered, release;
    const wait = new Promise(resolve => { entered = resolve; });
    f.controls.submit = async (_input, options) => {
      entered(); await new Promise(resolve => { release = resolve; });
      if (!options.isCurrent()) throw Error("Changed selection"); assert.fail("Stale durable callback");
    };
    await f.open(); const saving = f.refs.containerPickerBoard.roots()[1].click(); await wait;
    if (fault === "source") f.form.name = "Unsaved edit";
    if (fault === "target") f.runtime.containerPickerLayoutId = "source";
    if (fault === "flag") f.flags.tree = false;
    if (fault === "reopen") { f.refs.containerPickerDialog.open = false; await f.open(); }
    release(); assert.equal(await saving, false); assert.deepEqual(f.calls.errors, ["Changed selection"]);
    assert.equal(f.calls.v8.length, 0); assert.equal(f.calls.legacy.length, 0); assert.equal(f.calls.closed.length, 0);
  }
});

test("tree-ineligible root slots and nested targets pause explicitly instead of running legacy or V8", async () => {
  const f = fixture(); f.controls.eligible = false; await f.open();
  assert.equal(f.refs.containerPickerBoard.photo(), null);
  for (const index of [0, -1, 3, 0.5, null]) await f.api.selectContainerPickerRootTarget(index);
  await f.api.selectContainerPickerTarget("target-a", 0);
  assert.equal(f.calls.errors.length, 6); assert.equal(f.calls.tree.length, 0); assert.equal(f.calls.v8.length, 0); assert.equal(f.calls.legacy.length, 0);
  assert.ok(f.refs.containerPickerDialog.open);
});

test("V9 own pending handoff keeps picker identity current while V8 still rechecks eligibility", async () => {
  for (const contents of [true, false]) {
    const f = fixture({ contents });
    f.controls.submit = async (_input, options) => {
      assert.equal(options.isCurrent(), true);
      // The real app has independently captured/proved its pending namespace.
      // UI eligibility must cease to be a second business proof at that point.
      f.controls.eligible = false;
      assert.equal(options.isCurrent(), contents);
      if (!contents) throw Error("V8 eligibility changed");
      options.onDurable(f.durable); return { state: "committed", applied: true };
    };
    await f.open(); const result = await f.refs.containerPickerBoard.photo().click();
    if (contents) { assert.deepEqual(result, { state: "committed", applied: true }); assert.equal(f.calls.closed.length, 2); }
    else { assert.equal(result, false); assert.equal(f.calls.closed.length, 0); }
  }
});

test("tree OFF keeps the pre-existing full-tree placement path and never falls back to the shell photo button", async () => {
  const f = fixture({ tree: false }); await f.open(); assert.equal(f.refs.containerPickerBoard.photo(), null);
  await f.refs.containerPickerBoard.roots()[1].click();
  assert.deepEqual(f.calls.legacy, [["root", "target", "", { includeContents: true, sourceLayoutId: "source", targetIndex: 1 }]]);
  assert.equal(f.calls.tree.length, 0); assert.equal(f.calls.v8.length, 0);
  const disabled = createAdminTemplatePhotoCopyPickerController({ getSelection: () => assert.fail("Disabled form read") });
  assert.equal(disabled.selection(), null); assert.equal(await disabled.save(), false);
});

test("dirty initial form and a closed source dialog cannot present or dispatch the tree action", async () => {
  const f = fixture(); f.form.name = "Unsaved"; await f.open(); assert.equal(f.refs.containerPickerBoard.photo(), null);
  await f.refs.containerPickerBoard.roots()[0].click();
  f.form.name = "Saved"; f.refs.rootContainerDialog.open = false; f.api.renderContainerPicker();
  assert.equal(f.refs.containerPickerBoard.photo(), null); await f.refs.containerPickerBoard.roots()[0].click();
  assert.equal(f.calls.tree.length, 0); assert.equal(f.calls.v8.length, 0); assert.equal(f.calls.legacy.length, 0);
});
