import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAdminTemplatePhotoFormController } from "../../src/ui/admin-template-photo-form-controller.js";
import { createItemPhotoFromFile } from "../../src/sync/photos.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const selectedFile = () => new File(["Exact original selected image"], "selected.png", { type: "image/png" });
function fixture() {
  const context = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-shared-layout-selected",
    itemKey: "shared-layout:selected", scope: "admin-template", admin: true, generation: "initial-admin-editor" };
  const source = { id: "local-owner", photos: [{ id: "old-a", status: "synced", fileName: "Original.png", metadata: { credit: "Original" } },
    { id: "old-b", status: "synced", fileName: "Other.png", metadata: { credit: "Other" } }] };
  const view = { entityId: source.id, source, token: {}, dialog: { open: true }, saveButton: { disabled: false }, signature: "initial-form",
    draft: { photos: structuredClone(source.photos), deletedPhotos: [] } };
  const form = { fields: { name: "Edited record", dimensions: null, quantity: 1, updatedAt: "2026-09-11T00:00:00Z" },
    placementChanged: false, availabilityChanged: false, catalogSource: false, created: false };
  const pending = deferred(), events = [], captured = [], cache = [], controls = { enabled: true };
  const prepare = (file, options) => createItemPhotoFromFile(file, { ...options, materializeFile: async value => value,
    resizeFile: async value => ({ blob: value, width: 640, height: 480 }), now: () => "2026-09-11T00:00:00Z" });
  const options = { isEnabled: () => controls.enabled, getContext: () => context, getView: () => view, readForm: () => form,
    createPhoto: prepare, cachePhoto: async (record, scope) => { cache.push({ record, scope }); },
    submit(input, callbacks) { captured.push({ input, callbacks }); events.push("submit"); return pending.promise.then(() => {
      callbacks.onDurable({ operationId: "retained-action" }); events.push("drain");
    }); },
    onDurable(record) { events.push("durable"); view.dialog.open = false; },
    onError: error => events.push(error),
    onBusy(type, active) { view.saveButton.disabled = active; events.push(`${type}:${active}`); } };
  return { context, source, view, form, pending, events, captured, cache, controls, options, prepare };
}
async function prepareSelected(f, controller, type = "item", count = 1) {
  const photos = await controller.preparePhotos(type, Array.from({ length: count }, selectedFile));
  f.view.draft.photos.push(...photos); f.view.signature = "form-with-prepared-photos";
  return photos;
}
function editFixture(type = "item") {
  const f = fixture();
  f.controls.enabled = false; f.controls.editEnabled = true;
  f.source.photos.push({ id: "old-c", status: "synced", fileName: "Third.png", metadata: { credit: "Third" } });
  for (const photo of f.source.photos) Object.assign(photo, { photoId: photo.id, listId: f.context.listId,
    url: `https://example.test/lists/${f.context.listId}/photos/${photo.id}/file`, assetId: `preserved-${photo.id}` });
  f.view.draft.photos = structuredClone(f.source.photos);
  if (type === "container") { delete f.form.fields.quantity; Object.assign(f.form.fields, { volume: 25, nestable: true }); }
  f.options.isEditEnabled = () => f.controls.editEnabled;
  f.options.submitEdit = f.options.submit;
  f.options.submit = () => assert.fail("existing-photo edits must not enter file submission");
  f.options.createPhoto = () => assert.fail("fileless edits must not prepare images");
  f.options.cachePhoto = () => assert.fail("fileless edits must not cache images");
  return f;
}
function deleteFirst(f) {
  f.view.draft.deletedPhotos.push(f.view.draft.photos.shift()); f.view.signature = "existing-photo-deleted";
}

test("real item/container image preparation retains cache callback bytes and Save owns one immutable submit before closing", async () => {
  for (const type of ["item", "container"]) {
    const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options);
    const photos = await prepareSelected(f, controller, type, 2);
    assert.equal(controller.owns(type), true); assert.equal(controller.busy(type), false);
    assert.equal(f.cache.length, 2); assert.equal(f.cache.every(part => part.scope === "id:admin-a"), true);
    assert.equal(controller.save(type), true); assert.equal(controller.save(type), true);
    assert.equal(f.captured.length, 1); assert.equal(f.view.dialog.open, true); assert.equal(controller.busy(type), true);
    const { input, callbacks } = f.captured[0];
    assert.equal(input.entityType, type); assert.equal(input.entityId, "local-owner");
    assert.deepEqual(input.fields, f.form.fields); assert.deepEqual(input.photos, f.view.draft.photos);
    assert.equal(input.files.length, 2); assert.equal(Object.isFrozen(input), true);
    for (const [index, record] of input.files.entries()) {
      assert.equal(record.id, photos[index].id); assert.equal(record.fullBlobVerified, true);
      assert.equal(record.blob, f.cache[index].record.blob); assert.equal(record.thumbBlob, f.cache[index].record.thumbBlob);
      assert.equal(await record.blob.text(), "Exact original selected image");
    }
    assert.equal(callbacks.isCurrent(), true); f.pending.resolve(); await tick();
    assert.equal(f.view.dialog.open, false); assert.deepEqual(f.events.slice(-2), ["durable", "drain"]);
  }
});

test("opened-form files are retained before the async cache callback can replace its mutable record", async () => {
  const f = fixture(), wait = deferred(); let seen;
  f.options.cachePhoto = async record => { seen = record; await wait.promise; record.blob = new Blob(["Mutable cache replacement"], { type: "image/png" }); record.fileName = "Changed cache.png"; };
  const controller = createAdminTemplatePhotoFormController(f.options), preparing = prepareSelected(f, controller);
  while (!seen) await tick();
  const original = seen.blob; wait.resolve(); await preparing;
  controller.save("item");
  assert.equal(f.captured[0].input.files[0].blob, original);
  assert.equal(f.captured[0].input.files[0].fileName, "selected.png");
  assert.equal(await f.captured[0].input.files[0].blob.text(), "Exact original selected image");
});

test("late image/cache callbacks cannot write to a new account or apply to a reopened dialog", async () => {
  for (const phase of ["before-cache", "during-cache"]) for (const change of ["account", "form"]) {
    const f = fixture(), wait = deferred();
    if (phase === "before-cache") f.options.createPhoto = async (file, options) => { await wait.promise; return f.prepare(file, options); };
    else f.options.cachePhoto = async (record, scope) => { f.cache.push({ record, scope }); await wait.promise; };
    const controller = createAdminTemplatePhotoFormController(f.options), pending = controller.preparePhotos("item", [selectedFile()]);
    if (phase === "during-cache") while (!f.cache.length) await tick();
    if (change === "account") f.context.actorId = "other-admin"; else f.view.token = {};
    wait.resolve(); await assert.rejects(pending, error => error.isStalePhotoForm === true);
    assert.equal(f.cache.some(entry => entry.scope === "id:other-admin"), false);
    assert.equal(f.cache.length, phase === "before-cache" ? 0 : 1);
    assert.equal(f.captured.length, 0); assert.equal(f.view.draft.photos.length, 2);
  }
});

test("clipboard selection binds the original dialog/context before permission awaits but ordinary field edits remain possible", () => {
  for (const change of [f => { f.context.actorId = "other-admin"; }, f => { f.context.generation = "another-state"; },
    f => { f.view.token = {}; }, f => { f.view.dialog.open = false; }, f => { f.context.scope = "personal"; }]) {
    const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options), guard = controller.inputGuard("item");
    f.view.signature = "ordinary fields edited"; assert.equal(guard(), true);
    change(f); assert.equal(guard(), false); assert.equal(f.captured.length, 0);
  }
});

test("the first slice blocks old-photo edits, placement, availability, catalog sources and new owners without legacy fallthrough", async () => {
  for (const mode of ["old-order", "old-delete", "old-field", "placement", "availability", "catalog", "created", "new-owner"]) {
    const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options);
    await prepareSelected(f, controller);
    if (mode === "old-order") [f.view.draft.photos[0], f.view.draft.photos[1]] = [f.view.draft.photos[1], f.view.draft.photos[0]];
    if (mode === "old-delete") f.view.draft.deletedPhotos.push(f.view.draft.photos.shift());
    if (mode === "old-field") f.view.draft.photos[0].metadata.credit = "Modified old metadata";
    if (mode === "placement") f.form.placementChanged = true;
    if (mode === "availability") f.form.availabilityChanged = true;
    if (mode === "catalog") f.form.catalogSource = true;
    if (mode === "created") f.form.created = true;
    if (mode === "new-owner") { f.view.entityId = ""; f.view.source = null; }
    assert.equal(controller.save("item"), true, mode); assert.equal(f.captured.length, 0, mode);
    assert.equal(f.view.dialog.open, true); assert.equal(controller.busy("item"), false);
  }
});

test("uncaptured, relabelled, duplicated or remotely owned new photos cannot enter the durable submission", async () => {
  for (const mode of ["uncaptured", "filename", "size", "local-id", "duplicate", "remote", "asset", "source"]) {
    const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options);
    await prepareSelected(f, controller); const photo = f.view.draft.photos.at(-1);
    if (mode === "uncaptured") { photo.id = "photo-other-form"; photo.localId = photo.id; }
    if (mode === "filename") photo.fileName = "Other.png";
    if (mode === "size") photo.size++;
    if (mode === "local-id") photo.localId = "different-cache-entry";
    if (mode === "duplicate") f.view.draft.photos.push(structuredClone(photo));
    if (mode === "remote") photo.url = "https://example.test/unconfirmed.png";
    if (mode === "asset") photo.assetId = crypto.randomUUID();
    if (mode === "source") photo.sharedSourceId = "foreign-template";
    assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0); assert.equal(controller.busy("item"), false);
  }
});

test("Save freezes fields and full photos, guards later changes, and never allocates another submission after rejection", async () => {
  const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
  assert.equal(controller.save("item"), true); const { input, callbacks } = f.captured[0];
  f.form.fields.name = "Later field value"; f.view.signature = "later-form";
  assert.equal(input.fields.name, "Edited record"); assert.equal(callbacks.isCurrent(), false);
  assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 1);
  f.pending.reject(Error("Quota failure")); await tick();
  assert.equal(controller.busy("item"), false); assert.equal(f.view.saveButton.disabled, false);
  assert.equal(f.view.dialog.open, true); assert.equal(controller.recoveryCopy("item"), input);
  assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 1);
  assert.equal(f.events.some(event => event instanceof Error && event.message === "Quota failure"), true);
});

test("pre-durable async rejection and synchronous throw allow only the same input and callbacks to be retried", async () => {
  for (const mode of ["async", "sync"]) {
    const f = fixture(), failed = deferred(), failure = Error("Capture quota"); let reads = 0;
    f.options.readForm = () => { assert.equal(++reads, 1, "retry must not reread the form"); return f.form; };
    f.options.submit = (input, callbacks) => {
      f.captured.push({ input, callbacks });
      if (f.captured.length === 1) { if (mode === "sync") throw failure; return failed.promise; }
      callbacks.onDurable({ operationId: "original-action" }); return Promise.resolve();
    };
    const controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
    assert.equal(controller.save("item"), true);
    if (mode === "async") { controller.save("item"); assert.equal(f.captured.length, 1); failed.reject(failure); }
    await tick();
    assert.equal(controller.busy("item"), false); assert.equal(f.view.saveButton.disabled, false); assert.equal(f.view.dialog.open, true);
    const original = f.captured[0]; assert.equal(controller.recoveryCopy("item"), original.input);
    assert.equal(controller.save("item"), true); await tick();
    assert.equal(f.captured.length, 2); assert.equal(reads, 1);
    assert.equal(f.captured[1].input, original.input); assert.equal(f.captured[1].callbacks, original.callbacks);
    assert.equal(f.captured[1].input.files[0].blob, original.input.files[0].blob);
    assert.equal(f.captured[1].input.files[0].id, original.input.files[0].id);
    assert.equal(await original.input.files[0].blob.text(), "Exact original selected image");
    assert.equal(f.view.dialog.open, false); assert.equal(f.events.filter(event => event === "durable").length, 1);
  }
});

test("changed or reverted form after a failed capture retains the original attempt and never falls through to ordinary Save", async () => {
  for (const change of ["signature", "extra-photo-metadata", "reverted-photos", "context", "account", "dialog-token"]) {
    const f = fixture(); let reads = 0;
    f.options.readForm = () => { reads++; return f.form; };
    const controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
    controller.save("item"); const original = f.captured[0].input;
    f.pending.reject(Error("Capture interrupted")); await tick();
    if (change === "signature") { f.form.fields.name = "Later field"; f.view.signature = "later-form"; }
    if (change === "extra-photo-metadata") f.view.draft.photos.at(-1).extra = true;
    if (change === "reverted-photos") f.view.draft.photos = structuredClone(f.source.photos);
    if (change === "context") f.context.generation = "another-editor";
    if (change === "account") f.context.actorId = "another-admin";
    if (change === "dialog-token") f.view.token = {};
    assert.equal(controller.save("item"), true, change);
    assert.equal(f.captured.length, 1, change);
    // A reopened dialog has a different entry and may read its own form, but
    // cannot reuse the old entry's selected Blob handles or submit them.
    assert.equal(reads, change === "dialog-token" ? 2 : 1, change);
    assert.equal(f.captured[0].input, original); assert.equal(f.view.dialog.open, true);
  }
});

test("a failure after onDurable never retries the already-captured action", async () => {
  for (const mode of ["async-submit", "sync-onDurable"]) {
    const f = fixture(), failure = Error("Continue in recovery");
    f.options.onDurable = () => { f.events.push("durable"); if (mode === "sync-onDurable") throw failure; };
    f.options.submit = (input, callbacks) => {
      f.captured.push({ input, callbacks }); callbacks.onDurable({ operationId: "durable-action" }); return Promise.reject(failure);
    };
    const controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
    controller.save("item"); await tick();
    assert.equal(controller.busy("item"), true); assert.equal(f.view.saveButton.disabled, true);
    controller.save("item"); assert.equal(f.captured.length, 1); assert.equal(f.events.filter(event => event === "durable").length, 1);
    assert.equal(controller.recoveryCopy("item"), f.captured[0].input);
  }
});

test("a late capture rejection cannot unlock or report into another account or reopened form", async () => {
  for (const change of ["account", "dialog-token"]) {
    const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
    controller.save("item");
    if (change === "account") f.context.actorId = "another-admin"; else f.view.token = {};
    const before = f.events.length; f.pending.reject(Error("Old capture failure")); await tick();
    assert.equal(f.events.length, before); assert.equal(f.view.saveButton.disabled, true); assert.equal(f.captured.length, 1);
  }
});

test("full photo changes are detected even if a legacy form signature ignores the changed extra metadata", async () => {
  const f = fixture(), controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
  controller.save("item"); const callbacks = f.captured[0].callbacks;
  f.view.draft.photos[0].unknown = { preserved: "changed" };
  assert.equal(callbacks.isCurrent(), false);
  assert.throws(() => callbacks.onDurable({}), { code: "admin-template-photo-form" });
  assert.equal(f.view.dialog.open, true); assert.equal(f.events.includes("durable"), false);
});

test("reentrant Save and pending preparation cannot create a second submission", async () => {
  const f = fixture(), wait = deferred();
  f.options.cachePhoto = async () => wait.promise;
  const controller = createAdminTemplatePhotoFormController(f.options), preparing = prepareSelected(f, controller);
  assert.equal(controller.busy("item"), true); assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0);
  wait.resolve(); await preparing;
  f.options.readForm = () => { controller.save("item"); return f.form; };
  // The originally supplied reader also reenters before the submit latch exists.
  Object.defineProperty(f.form, "placementChanged", { enumerable: true, get() { controller.save("item"); return false; } });
  controller.save("item"); assert.equal(f.captured.length, 1);
});

test("disabled or unchanged photo forms preserve the existing path, while retained admin selection never falls through after a gate change", async () => {
  const f = fixture(); f.controls.enabled = false;
  const controller = createAdminTemplatePhotoFormController(f.options);
  assert.equal(await controller.preparePhotos("item", [selectedFile()]), null); assert.equal(controller.inputGuard("item"), null);
  assert.equal(controller.save("item"), false); assert.equal(f.cache.length, 0);
  f.controls.enabled = true; assert.equal(controller.save("item"), false);
  await prepareSelected(f, controller); f.controls.enabled = false;
  assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0);
  await assert.rejects(controller.preparePhotos("item", [selectedFile()]), { code: "admin-template-photo-form" });
});

test("fileless item/container saves delete, reorder, combine them or remove all old photos without prior preparation", async () => {
  for (const type of ["item", "container"]) for (const change of ["order", "delete", "both", "all"]) {
    const f = editFixture(type), controller = createAdminTemplatePhotoFormController(f.options), original = structuredClone(f.source);
    assert.equal(controller.owns(type), false);
    if (change === "delete" || change === "both") deleteFirst(f);
    if (change === "order" || change === "both") f.view.draft.photos.reverse();
    if (change === "all") { f.view.draft.deletedPhotos = f.view.draft.photos.splice(0); }
    f.view.signature = `fileless-${change}`;
    assert.equal(controller.save(type), true); assert.equal(controller.save(type), true);
    assert.equal(f.captured.length, 1); assert.equal(controller.owns(type), true); assert.equal(controller.busy(type), true);
    assert.equal(f.view.dialog.open, true); assert.deepEqual(f.source, original); assert.equal(f.cache.length, 0);
    const { input, callbacks } = f.captured[0];
    assert.deepEqual(Object.keys(input).sort(), ["deletedPhotos", "entityId", "entityType", "fields", "photos"]);
    assert.equal(input.entityType, type); assert.equal(input.entityId, f.source.id);
    assert.deepEqual(input.fields, f.form.fields); assert.deepEqual(input.photos, f.view.draft.photos);
    assert.deepEqual(input.deletedPhotos, f.view.draft.deletedPhotos);
    assert.equal(callbacks.isCurrent(), true);
    f.pending.resolve(); await tick();
    assert.equal(f.view.dialog.open, false); assert.equal(f.events.filter(event => event === "durable").length, 1);
    assert.deepEqual(f.source, original, "controller leaves the live owner for the durable submitter to apply");
  }
});

test("fileless fields, kept references and deleted references are detached and frozen before submitEdit can await", async () => {
  const f = editFixture(); deleteFirst(f); f.form.fields.dimensions = { width: 4, height: 5, depth: 6 };
  let checkedBeforeAwait = false;
  const submit = f.options.submitEdit;
  f.options.submitEdit = (input, callbacks) => {
    for (const value of [input, input.fields, input.fields.dimensions, input.photos, input.photos[0], input.photos[0].metadata,
      input.deletedPhotos, input.deletedPhotos[0], input.deletedPhotos[0].metadata]) assert.equal(Object.isFrozen(value), true);
    checkedBeforeAwait = true; return submit(input, callbacks);
  };
  const controller = createAdminTemplatePhotoFormController(f.options); controller.save("item");
  assert.equal(checkedBeforeAwait, true); const { input, callbacks } = f.captured[0];
  f.form.fields.dimensions.width = 500; f.view.draft.photos[0].metadata.credit = "Later kept photo";
  f.view.draft.deletedPhotos[0].metadata.credit = "Later removed photo"; f.view.signature = "later-fields";
  assert.equal(input.fields.dimensions.width, 4); assert.equal(input.photos[0].metadata.credit, "Other");
  assert.equal(input.deletedPhotos[0].metadata.credit, "Original"); assert.equal(callbacks.isCurrent(), false);
  f.pending.resolve(); await tick();
  assert.equal(f.view.dialog.open, true); assert.equal(f.events.includes("durable"), false);
  assert.equal(controller.recoveryCopy("item"), input); assert.equal(controller.save("item"), true);
  assert.equal(f.captured.length, 1);
});

test("fileless retries after synchronous or asynchronous capture failure reuse one input and options object", async () => {
  for (const mode of ["sync", "async"]) {
    const f = editFixture(), failed = deferred(); deleteFirst(f); let reads = 0;
    f.options.readForm = () => { reads++; return f.form; };
    f.options.submitEdit = (input, callbacks) => {
      f.captured.push({ input, callbacks });
      if (f.captured.length === 1) { if (mode === "sync") throw Error("Capture interrupted"); return failed.promise; }
      callbacks.onDurable({ operationId: "same-edit-action" }); return Promise.resolve();
    };
    const controller = createAdminTemplatePhotoFormController(f.options); assert.equal(controller.save("item"), true);
    const original = f.captured[0];
    if (mode === "async") { controller.save("item"); assert.equal(f.captured.length, 1); failed.reject(Error("Capture interrupted")); }
    await tick();
    assert.equal(f.view.dialog.open, true); assert.equal(controller.busy("item"), false);
    assert.equal(controller.recoveryCopy("item"), original.input); assert.equal(controller.save("item"), true); await tick();
    assert.equal(reads, 1); assert.equal(f.captured.length, 2);
    assert.equal(f.captured[1].input, original.input); assert.equal(f.captured[1].callbacks, original.callbacks);
    assert.equal(f.view.dialog.open, false); assert.equal(f.events.filter(event => event === "durable").length, 1);
  }
});

test("fileless delayed durability cannot close a changed dialog, entity, source, account, namespace or editor generation", async () => {
  for (const change of [f => { f.view.token = {}; }, f => { f.view.dialog = { open: true }; },
    f => { f.view.entityId = "another-owner"; }, f => { f.view.source = structuredClone(f.source); },
    f => { f.source.name = "Concurrent source change"; }, f => { f.context.actorId = "other-admin"; },
    f => { f.context.listId = "public-shared-layout-other"; f.context.itemKey = "shared-layout:other"; },
    f => { f.context.generation = "next-editor-generation"; }]) {
    const f = editFixture(), controller = createAdminTemplatePhotoFormController(f.options); deleteFirst(f); controller.save("item");
    const { callbacks } = f.captured[0]; change(f);
    assert.equal(callbacks.isCurrent(), false); f.pending.resolve(); await tick();
    assert.equal(f.view.dialog.open, true); assert.equal(f.events.includes("durable"), false); assert.equal(f.captured.length, 1);
  }
});

test("fileless raw references must exactly partition the original owner without duplicates, silent loss or metadata changes", () => {
  for (const change of [f => { f.view.draft.photos.push(structuredClone(f.view.draft.photos[0])); },
    f => { f.view.draft.deletedPhotos.push(structuredClone(f.view.draft.deletedPhotos[0])); },
    f => { f.view.draft.photos.push(structuredClone(f.view.draft.deletedPhotos[0])); },
    f => { f.view.draft.photos.pop(); }, f => { f.view.draft.photos[0].metadata.credit = "Changed"; },
    f => { f.view.draft.deletedPhotos[0].url = "https://example.test/foreign/file"; },
    f => { f.view.draft.photos[0].id = "foreign-owner-photo"; },
    f => { f.view.draft.deletedPhotos[0].id = "foreign-owner-photo"; }]) {
    const f = editFixture(), controller = createAdminTemplatePhotoFormController(f.options); deleteFirst(f); change(f);
    assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0);
    assert.equal(f.view.dialog.open, true); assert.equal(controller.busy("item"), false);
    assert.equal(f.events.some(event => event?.isAdminTemplateBlocked === true), true);
  }
});

test("fileless edits reject malformed, unsynced or differently bound base references even when the draft matches them", () => {
  for (const change of [photo => { photo.listId = "public-shared-layout-other"; }, photo => { photo.status = "pending"; },
    photo => { photo.photoId = "another-photo"; }, photo => { photo.id = "constructor"; photo.photoId = "constructor"; }]) {
    const f = editFixture(); change(f.source.photos[0]); f.view.draft.photos = structuredClone(f.source.photos); deleteFirst(f);
    const controller = createAdminTemplatePhotoFormController(f.options); assert.equal(controller.save("item"), true);
    assert.equal(f.captured.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("fileless saves refuse placement, availability, catalog, new owners and fields outside the existing item/container form", () => {
  for (const type of ["item", "container"]) for (const change of [f => { f.form.placementChanged = true; },
    f => { f.form.availabilityChanged = true; }, f => { f.form.catalogSource = true; }, f => { f.form.created = true; },
    f => { f.view.entityId = ""; f.view.source = null; }, f => { f.form.fields.layoutId = "other-layout"; },
    f => { f.form.fields[type === "item" ? "volume" : "quantity"] = 10; }]) {
    const f = editFixture(type), controller = createAdminTemplatePhotoFormController(f.options); deleteFirst(f); change(f);
    assert.equal(controller.save(type), true); assert.equal(f.captured.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("enabling fileless editing keeps mixed retained new files and old-photo removal or reorder blocked", async () => {
  for (const change of ["delete", "reorder"]) {
    const f = fixture(); f.options.isEditEnabled = () => true;
    f.options.submitEdit = () => assert.fail("mixed edits cannot enter fileless submission");
    const controller = createAdminTemplatePhotoFormController(f.options); await prepareSelected(f, controller);
    if (change === "delete") deleteFirst(f);
    else [f.view.draft.photos[0], f.view.draft.photos[1]] = [f.view.draft.photos[1], f.view.draft.photos[0]];
    assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("edit-only input guards retain the admin path and reject new files before image preparation or cache writes", async () => {
  for (const guarded of [false, true]) {
    const f = editFixture(), controller = createAdminTemplatePhotoFormController(f.options);
    if (guarded) { const guard = controller.inputGuard("item"); assert.equal(typeof guard, "function"); assert.equal(guard(), true); }
    await assert.rejects(controller.preparePhotos("item", [selectedFile()]), error => error.isAdminTemplateBlocked === true
      && /Добавление новых файлов/.test(error.message));
    assert.equal(controller.owns("item"), true); assert.equal(f.cache.length, 0); assert.equal(f.captured.length, 0);
    deleteFirst(f); assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 1);
  }
});

test("edit gate defaults off and unchanged forms fall through, but owned edits remain blocked when the gate changes", () => {
  const unchanged = editFixture(), ordinary = createAdminTemplatePhotoFormController(unchanged.options);
  assert.equal(ordinary.save("item"), false); assert.equal(ordinary.owns("item"), false);
  const off = fixture(); off.options.submitEdit = () => assert.fail("edit gate defaults off"); deleteFirst(off);
  const disabled = createAdminTemplatePhotoFormController(off.options);
  assert.equal(disabled.save("item"), true); assert.equal(off.captured.length, 0); assert.equal(off.view.dialog.open, true);
  const f = editFixture(), controller = createAdminTemplatePhotoFormController(f.options), guard = controller.mutationGuard("item");
  assert.equal(guard(), true); deleteFirst(f); f.controls.editEnabled = false;
  assert.equal(guard(), false); assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0);
  assert.equal(typeof controller.inputGuard("item"), "function"); assert.equal(controller.inputGuard("item")(), false);
  assert.equal(controller.owns("item"), true);
});

test("photo mutation guards permit one current local deletion/order and reject a later confirmation after the draft changes", () => {
  for (const type of ["item", "container"]) {
    const f = editFixture(type), controller = createAdminTemplatePhotoFormController(f.options), original = structuredClone(f.source);
    const remove = controller.mutationGuard(type); assert.equal(remove(), true);
    deleteFirst(f); assert.equal(remove(), false);
    const order = controller.mutationGuard(type); assert.equal(order(), true);
    f.view.draft.photos.reverse(); assert.equal(order(), false);
    assert.deepEqual(f.source, original); assert.equal(f.captured.length, 0);
    assert.equal(controller.save(type), true); assert.equal(f.captured.length, 1);
    assert.equal(controller.mutationGuard(type)(), false, "a fixed save cannot be altered by a delayed confirmation");
  }
});

test("the first delete/order works with a lazily created draft while the original source remains protected", () => {
  for (const type of ["item", "container"]) for (const change of ["delete", "order"]) {
    const f = editFixture(type), original = structuredClone(f.source); f.view.draft = null;
    const controller = createAdminTemplatePhotoFormController(f.options), guard = controller.mutationGuard(type);
    assert.equal(guard(), true, `${type}/${change}: unopened photo draft still represents the original photos`);
    const draft = { photos: structuredClone(f.source.photos), deletedPhotos: [] };
    if (change === "delete") draft.deletedPhotos.push(draft.photos.shift()); else draft.photos.reverse();
    assert.equal(guard(), true, "preparing the detached local draft does not modify the opened form");
    f.view.draft = draft; f.view.signature = `first-${change}`;
    assert.equal(guard(), false); assert.equal(controller.save(type), true); assert.equal(f.captured.length, 1);
    assert.deepEqual(f.captured[0].input.photos, draft.photos); assert.deepEqual(f.captured[0].input.deletedPhotos, draft.deletedPhotos);
    assert.deepEqual(f.source, original); assert.equal(f.view.dialog.open, true);
  }
});

test("a delayed first-photo confirmation rejects a newly changed draft or source, but accepts an unchanged initialized draft", () => {
  for (const change of ["same-draft", "changed-draft", "changed-source"]) {
    const f = editFixture(); f.view.draft = null;
    const controller = createAdminTemplatePhotoFormController(f.options), guard = controller.mutationGuard("item");
    assert.equal(guard(), true);
    if (change === "changed-source") f.source.photos[0].metadata.credit = "Concurrent source change";
    else {
      f.view.draft = { photos: structuredClone(f.source.photos), deletedPhotos: [] };
      if (change === "changed-draft") f.view.draft.photos.reverse();
    }
    assert.equal(guard(), change === "same-draft"); assert.equal(f.captured.length, 0);
  }
});

test("photo mutation guards bind dialog/source identity, scope, fields and both photo arrays before confirmation awaits", () => {
  for (const change of [f => { f.view.token = {}; }, f => { f.view.dialog = { open: true }; }, f => { f.view.dialog.open = false; },
    f => { f.view.entityId = "another-owner"; }, f => { f.view.source = structuredClone(f.source); },
    f => { f.context.scope = "personal"; }, f => { f.context.actorId = "other-admin"; },
    f => { f.context.generation = "next-editor-generation"; }, f => { f.source.name = "Changed source"; },
    f => { f.view.signature = "changed ordinary fields"; }, f => { f.view.draft.photos[0].metadata.credit = "Changed"; },
    f => { f.view.draft.deletedPhotos.push(structuredClone(f.view.draft.photos[0])); }]) {
    const f = editFixture(), controller = createAdminTemplatePhotoFormController(f.options), guard = controller.mutationGuard("item");
    assert.equal(guard(), true); change(f); assert.equal(guard(), false); assert.equal(f.captured.length, 0);
  }
  const f = editFixture(); f.controls.editEnabled = false;
  const controller = createAdminTemplatePhotoFormController(f.options);
  assert.equal(controller.mutationGuard("item"), null); assert.equal(controller.owns("item"), false);
});

test("a pending image preparation blocks confirmed local mutations until its draft has been incorporated", async () => {
  const f = fixture(), pending = deferred(); f.options.isEditEnabled = () => true;
  f.options.cachePhoto = async () => pending.promise;
  const controller = createAdminTemplatePhotoFormController(f.options), guard = controller.mutationGuard("item");
  assert.equal(guard(), true);
  const preparing = prepareSelected(f, controller); assert.equal(controller.busy("item"), true); assert.equal(guard(), false);
  pending.resolve(); await preparing;
  assert.equal(controller.busy("item"), false); assert.equal(guard(), false, "the selected photos changed while confirmation was open");
  assert.equal(controller.mutationGuard("item")(), true); assert.equal(f.captured.length, 0);
});

test("real form wiring intercepts both save and photo inputs before personal/legacy paths and guards camera/clipboard cleanup", () => {
  const tail = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  for (const [name, type] of [["saveDialogItem", "item"], ["saveRootContainerDialog", "container"]]) {
    const code = tail.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0];
    assert.ok(code.indexOf(`adminTemplatePhotoForms.save("${type}")`) < code.indexOf(`personalPhotoForms.save("${type}")`));
  }
  for (const [name, type] of [["handleItemPhotoInputChange", "item"], ["handleRootContainerPhotoInputChange", "container"]]) {
    const code = tail.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0];
    assert.match(code, new RegExp(`prepareOpenedFormPhotos\\("${type}"`));
    assert.match(code, type === "item" ? /itemPhotoCameraInput/ : /rootContainerPhotoCameraInput/);
  }
  assert.match(tail, /const administrative = await adminTemplatePhotoForms\.preparePhotos\(type, files\)/);
  assert.match(tail, /adminTemplatePhotoForms\.inputGuard\(type\) \|\| personalPhotoForms\.inputGuard\(type\)/);
  assert.match(tail, /function adminTemplateAnyPhotoFormEnabled\(\)\s*\{\s*return adminTemplatePhotoFormEnabled\(\) \|\| adminTemplatePhotoEditFormEnabled\(\)/);
  for (const name of ["uploadItemDialogDraftPhotos", "uploadRootContainerDialogDraftPhotos", "cleanupUnsavedItemDialogPhotoDraft", "cleanupUnsavedRootContainerDialogPhotoDraft"]) {
    const code = tail.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))[0];
    assert.match(code, /adminTemplateAnyPhotoFormEnabled\(\)/); assert.match(code, /adminTemplatePhotoForms\.owns/);
  }
});
