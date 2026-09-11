import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { createAdminTemplatePhotoFormController } from "../../src/ui/admin-template-photo-form-controller.js";
import { adminPhotoRecordFixture } from "../fixtures/admin-template-photo-record-fixture.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const names = ["administrativeObjectId", "adminTemplateOperationContext", "adminTemplatePhotoFormContext",
  "withAdminTemplatePhotoFormCapture", "submitAdminTemplatePhotoForm", "submitAdminTemplatePhotoEditForm"];
const source = names.map(name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual application function ${name} is available`); return match[0];
}).join("\n");
const clone = value => JSON.parse(canonicalTemplateJson(value));

async function fixture(entityType = "item") {
  const record = await adminPhotoRecordFixture({ entityType, count: 0 });
  const { state, layoutId } = record.snapshot, type = entityType === "item" ? "items" : "containers";
  const entityId = entityType === "item" ? "local-item" : "local-bag", owner = state[type][entityId];
  state.items.private = { id: "private", name: "Private item" };
  const controls = { append: false, edit: true, admin: true, scope: "admin", layoutId };
  const locks = [], captures = [], submissions = [], failures = [], durable = [];
  const user = { id: record.binding.actorId }, mode = { adminPublishedEditLayoutId: layoutId };
  const location = { pathname: "/bike-packing-experiment/", search: "", hash: "" };
  const form = { fields: { name: "Selected form value", dimensions: { length: 4 },
    ...(entityType === "item" ? { quantity: 1 } : { volume: 25, nestable: true }) },
    created: false, catalogSource: false, placementChanged: false, availabilityChanged: false };
  const view = { entityId, token: {}, source: owner, dialog: { open: true }, saveButton: { disabled: false }, draft: null };
  const capture = (input, options, kind, captureComplete) => {
    captures.push({ input, options, kind });
    return controls.capture ? controls.capture(input, options, kind, captureComplete) : Promise.resolve();
  };
  const deps = { state, canonicalTemplateJson, clone, adminTemplatePhotoNamespace, currentUser: user, modeState: mode, location,
    canOpenAdminPublishedEdit: () => controls.admin, isAdminPublicEditScope: () => controls.scope === "admin",
    getPublishedEditLayoutId: () => controls.layoutId, currentViewScope: () => controls.scope,
    adminTemplatePhotoFormEnabled: () => controls.append, adminTemplatePhotoEditFormEnabled: () => controls.edit,
    navigator: { locks: { request: (name, run) => new Promise((resolve, reject) => {
      locks.push({ name, release: () => Promise.resolve().then(run).then(resolve, reject) });
    }) } },
    captureAdminTemplatePhotoAppendForm: (input, options, complete) => capture(input, options, "append", complete),
    captureAdminTemplatePhotoEditForm: (input, options, complete) => capture(input, options, "edit", complete) };
  const actual = new Function(...Object.keys(deps), `const administrativeObjectIds = new WeakMap(); let administrativeObjectCounter = 0;
    ${source}\nreturn { ${names.join(", ")} };`)(...Object.values(deps));
  const dispatch = (method, input, options) => {
    const promise = actual[method](input, options); submissions.push({ input, options, promise }); return promise;
  };
  const controller = createAdminTemplatePhotoFormController({ isEnabled: () => controls.append, isEditEnabled: () => controls.edit,
    getContext: actual.adminTemplatePhotoFormContext,
    getView: () => ({ ...view, signature: JSON.stringify({ fields: form.fields, photos: view.draft || owner.photos }) }),
    readForm: () => form,
    submit: (input, options) => dispatch("submitAdminTemplatePhotoForm", input, options),
    submitEdit: (input, options) => dispatch("submitAdminTemplatePhotoEditForm", input, options),
    createPhoto: () => assert.fail("fileless capture cannot prepare files"),
    cachePhoto: () => assert.fail("fileless capture cannot cache files"),
    onBusy: (_type, busy) => { view.saveButton.disabled = busy; }, onError: error => failures.push(error),
    onDurable: value => { durable.push(value); view.dialog.open = false; } });
  return { actual, controller, record, state, layoutId, entityId, entityType, owner, controls, user, location, form, view,
    locks, captures, submissions, failures, durable,
    release: async () => { const lock = locks.shift(); assert.ok(lock, "capture is waiting for its lock"); await lock.release(); } };
}

function deleteOldPhoto(f) {
  const isCurrent = f.controller.mutationGuard(f.entityType);
  assert.equal(isCurrent(), true);
  f.view.draft = { photos: [], deletedPhotos: clone(f.owner.photos) };
}

test("durable capture releases the cross-tab fence before its network acknowledgement without resolving the save", { timeout: 2000 }, async () => {
  const f = await fixture(); deleteOldPhoto(f);
  let finishNetwork, settled = false;
  const network = new Promise(resolve => { finishNetwork = resolve; });
  f.controls.capture = (_input, _options, _kind, complete) => { complete(); return network; };
  f.controller.save("item");
  const save = f.submissions[0].promise.then(value => { settled = true; return value; });
  await f.release(); assert.equal(settled, false);
  finishNetwork("confirmed"); assert.equal(await save, "confirmed"); assert.equal(settled, true);
});

test("actual edit capture waits with frozen item/container fields and photo references and forwards the same attempt", async () => {
  for (const type of ["item", "container"]) {
    const f = await fixture(type); deleteOldPhoto(f);
    f.controls.capture = (_input, options) => options.onDurable({ operationId: "durable-edit" });
    assert.equal(f.controller.save(type), true); assert.equal(f.captures.length, 0); assert.equal(f.view.dialog.open, true);
    const first = f.submissions[0];
    for (const value of [first.input, first.input.fields, first.input.fields.dimensions, first.input.photos,
      first.input.deletedPhotos, first.input.deletedPhotos[0], first.options]) {
      assert.equal(Object.isFrozen(value), true);
    }
    assert.throws(() => { first.input.fields.name = "Changed after lock request"; }, TypeError);
    assert.equal(f.controller.save(type), true); assert.equal(f.submissions.length, 1);
    await f.release(); await first.promise;
    assert.equal(f.captures.length, 1); assert.equal(f.captures[0].input, first.input); assert.equal(f.captures[0].options, first.options);
    assert.equal(f.captures[0].kind, "edit"); assert.equal(f.view.dialog.open, false); assert.equal(f.durable.length, 1);
  }
});

test("the actual wrapper rejects a replaced layout/source, advanced source revision and unrelated owner changes during the lock wait", async () => {
  for (const change of ["layout-identity", "source-identity", "source-revision", "unselected-owner", "arrangement"]) {
    const f = await fixture(), layout = f.state.layouts[f.layoutId];
    const input = Object.freeze({ entityType: f.entityType, entityId: f.entityId });
    // A permissive caller proves the wrapper itself binds the namespace, not
    // just the form controller's additional current-view check.
    const promise = f.actual.submitAdminTemplatePhotoEditForm(input, { isCurrent: () => true });
    const rejected = assert.rejects(promise, /Исходная форма изменилась/);
    if (change === "layout-identity") f.state.layouts[f.layoutId] = clone(layout);
    if (change === "source-identity") layout.adminCausalSource = clone(layout.adminCausalSource);
    if (change === "source-revision") layout.adminCausalSource.base.stateRevision = 8;
    if (change === "unselected-owner") f.state.containers["local-bag"].name = "Concurrent bag change";
    if (change === "arrangement") layout.arrangement.packedItems["local-item"] = true;
    await f.release(); await rejected; assert.equal(f.captures.length, 0, change);
  }
});

test("a real form started at revision 7 cannot silently capture on revision 8 after waiting for the shared lock", async () => {
  const f = await fixture(); deleteOldPhoto(f); f.controller.save("item");
  const first = f.submissions[0], rejected = assert.rejects(first.promise, /Исходная форма изменилась/);
  const observed = f.state.layouts[f.layoutId].adminCausalSource;
  f.state.layouts[f.layoutId].adminCausalSource = { ...clone(observed), base: { stateRevision: 8 } };
  await f.release(); await rejected;
  assert.equal(f.captures.length, 0); assert.equal(f.view.dialog.open, true); assert.equal(f.durable.length, 0);
  assert.equal(f.controller.recoveryCopy("item"), null, "the prior source no longer owns this displayed form context");
  assert.equal(first.input.deletedPhotos[0].id, "photo-existing");
});

test("actual form context detaches source data and binds its identity from the first local photo mutation", async () => {
  for (const change of ["identity", "revision"]) {
    const f = await fixture(), original = f.actual.adminTemplatePhotoFormContext("item", f.entityId);
    const guard = f.controller.mutationGuard("item"); assert.equal(guard(), true);
    const layout = f.state.layouts[f.layoutId];
    if (change === "identity") layout.adminCausalSource = clone(layout.adminCausalSource);
    else layout.adminCausalSource.base.stateRevision = 8;
    const next = f.actual.adminTemplatePhotoFormContext("item", f.entityId);
    assert.equal(original.source.base.stateRevision, 7);
    if (change === "identity") { assert.deepEqual(original.source, next.source); assert.notEqual(original.sourceGeneration, next.sourceGeneration); }
    assert.equal(guard(), false); f.view.draft = { photos: [], deletedPhotos: clone(f.owner.photos) };
    assert.equal(f.controller.save("item"), true); assert.equal(f.submissions.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("queued capture refuses later form/account/navigation changes without replacing the frozen input", async () => {
  for (const change of ["fields", "deleted-reference", "account", "route"]) {
    const f = await fixture(); deleteOldPhoto(f); f.controller.save("item");
    const first = f.submissions[0], before = clone(first.input), rejected = assert.rejects(first.promise, /Исходная форма изменилась/);
    if (change === "fields") f.form.fields.dimensions.length = 99;
    if (change === "deleted-reference") f.view.draft.deletedPhotos[0].fileName = "Changed raw reference.png";
    if (change === "account") f.user.id = "other-admin";
    if (change === "route") f.location.hash = "#another-view";
    await f.release(); await rejected;
    assert.deepEqual(first.input, before); assert.equal(f.captures.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("an unchanged failed capture retries through the actual lock with the same input and callback identities", async () => {
  const f = await fixture(); deleteOldPhoto(f); let attempts = 0;
  f.controls.capture = (_input, options) => {
    if (++attempts === 1) throw Error("Durable read-back interrupted");
    options.onDurable({ operationId: "same-retained-attempt" });
  };
  f.controller.save("item"); const first = f.submissions[0], rejected = assert.rejects(first.promise, /Durable read-back interrupted/);
  await f.release(); await rejected;
  assert.equal(f.controller.busy("item"), false); assert.equal(f.view.dialog.open, true);
  f.controller.save("item"); const second = f.submissions[1];
  assert.equal(second.input, first.input); assert.equal(second.options, first.options);
  await f.release(); await second.promise;
  assert.equal(f.captures.length, 2); assert.equal(f.captures[1].input, f.captures[0].input);
  assert.equal(f.captures[1].options, f.captures[0].options); assert.equal(f.view.dialog.open, false);
});

test("capture namespace isolation allows a personal item update during an unchanged administrative attempt", async () => {
  const f = await fixture(); deleteOldPhoto(f); f.controller.save("item");
  f.state.items.private.name = "New private value";
  await f.release(); await f.submissions[0].promise;
  assert.equal(f.captures.length, 1); assert.equal(f.state.items.private.name, "New private value");
});

test("actual append and edit submitters enter the same binding lock before either capture callback", async () => {
  const f = await fixture(), input = Object.freeze({ entityType: f.entityType, entityId: f.entityId });
  f.controls.append = true;
  const options = Object.freeze({ isCurrent: () => true });
  const append = f.actual.submitAdminTemplatePhotoForm(input, options), edit = f.actual.submitAdminTemplatePhotoEditForm(input, options);
  assert.equal(f.locks.length, 2); assert.equal(f.locks[0].name, f.locks[1].name);
  assert.equal(f.locks[0].name, "bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(f.record.binding));
  assert.equal(f.captures.length, 0);
  await f.release(); await append; assert.deepEqual(f.captures.map(row => row.kind), ["append"]);
  await f.release(); await edit; assert.deepEqual(f.captures.map(row => row.kind), ["append", "edit"]);
});
