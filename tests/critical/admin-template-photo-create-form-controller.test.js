import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplatePhotoCreateFormController } from "../../src/ui/admin-template-photo-create-form-controller.js";
import { createItemPhotoFromFile } from "../../src/sync/photos.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(type = "item") {
  const context = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-shared-layout-selected",
    itemKey: "shared-layout:selected", scope: "admin-template", admin: true, generation: "opened-template" };
  const view = { entityId: null, layoutId: "admin-layout", token: {}, dialog: { open: true }, saveButton: { disabled: false },
    signature: "new-form", draft: { photos: [], deletedPhotos: [] } };
  const form = { created: true, catalogSource: false, unsupportedPlacement: false,
    fields: { name: "New owner", dimensions: null, ...(type === "item" ? { quantity: 1 } : { volume: 10, nestable: true }) },
    localFormContext: { version: 1, ...(type === "item" ? { availabilityStatus: "available" } : {}), placement: null } };
  const controls = { enabled: true }, calls = [], cached = [], errors = [], pending = deferred();
  const options = { isEnabled: () => controls.enabled, getContext: () => context, getView: () => view, readForm: () => form,
    createPhoto: (file, options) => createItemPhotoFromFile(file, { ...options, materializeFile: async value => value,
      resizeFile: async value => ({ blob: value, width: 640, height: 480 }), now: () => "2026-09-12T00:00:00Z" }),
    cachePhoto: async (record, scope) => cached.push({ record, scope }),
    submit(input, callbacks) { calls.push({ input, callbacks }); return pending.promise.then(() => callbacks.onDurable({ retained: true })); },
    onDurable: () => { view.dialog.open = false; }, onError: error => errors.push(error),
    onBusy: (_, busy) => { view.saveButton.disabled = busy; } };
  return { context, view, form, controls, calls, cached, errors, pending, options };
}
async function select(f, c, type = "item", count = 1) {
  const selected = await c.preparePhotos(type, Array.from({ length: count }, (_, i) => new File([`Actual original ${i}`], `chosen-${i}.png`, { type: "image/png" })));
  f.view.draft.photos.push(...selected); f.view.signature = "selected-files"; return selected;
}

test("new item and bag retain real Blob handles, ordered selection, placement and one immutable submit", async () => {
  for (const type of ["item", "container"]) {
    const f = fixture(type), c = createAdminTemplatePhotoCreateFormController(f.options);
    await select(f, c, type, 2); f.view.draft.photos.reverse();
    f.form.localFormContext.placement = { layoutId: f.view.layoutId, ...(type === "item" ? { containerId: "existing-bag", quantity: 3 } : {}) };
    c.save(type); c.save(type); assert.equal(f.calls.length, 1);
    const { input, callbacks } = f.calls[0];
    assert.deepEqual(input.localFormContext, f.form.localFormContext); assert.equal(input.entityType, type); assert.equal(input.entityId, undefined);
    assert.deepEqual(input.files.map(file => file.id), input.photos.map(photo => photo.id));
    assert.equal(await input.files[0].blob.text(), "Actual original 1");
    assert.equal(input.files[0].blob, f.cached[1].record.blob); assert.equal(f.cached[1].scope, "id:admin-a");
    for (const value of [input, input.fields, input.localFormContext, input.photos, ...input.photos, input.files, ...input.files]) assert.equal(Object.isFrozen(value), true);
    assert.equal(callbacks.isCurrent(), true); assert.equal(f.view.dialog.open, true);
    f.pending.resolve(); await tick(); assert.equal(f.view.dialog.open, false); assert.equal(f.errors.length, 0);
  }
});

test("capture quota retry reuses exact input, callbacks and selected original bytes without rereading fields", async () => {
  const f = fixture(), first = deferred(); let reads = 0;
  f.options.readForm = () => { reads++; return f.form; };
  f.options.submit = (input, callbacks) => { f.calls.push({ input, callbacks });
    if (f.calls.length === 1) return first.promise; callbacks.onDurable({ retained: true }); return Promise.resolve(); };
  const c = createAdminTemplatePhotoCreateFormController(f.options); await select(f, c); c.save("item");
  const original = f.calls[0]; first.reject(new DOMException("Full", "QuotaExceededError")); await tick();
  assert.equal(f.view.dialog.open, true); assert.equal(c.busy("item"), false); assert.equal(c.recoveryCopy("item"), original.input);
  c.save("item"); await tick(); assert.equal(reads, 1); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].input, original.input); assert.equal(f.calls[1].callbacks, original.callbacks);
  assert.equal(await f.calls[1].input.files[0].blob.text(), "Actual original 0"); assert.equal(f.view.dialog.open, false);
});

test("context change inside asynchronous preview caching never exposes prepared photos to the next account", async () => {
  const f = fixture(), cache = deferred();
  f.options.cachePhoto = async record => { f.cached.push(record); await cache.promise; };
  const c = createAdminTemplatePhotoCreateFormController(f.options), preparation = select(f, c);
  await tick(); assert.equal(await f.cached[0].blob.text(), "Actual original 0");
  f.context.actorId = "other-admin"; cache.resolve();
  await assert.rejects(preparation, error => error.isStalePhotoForm === true);
  assert.equal(f.view.draft.photos.length, 0); assert.equal(f.calls.length, 0);
});

test("closing or reopening a dialog invalidates mutation confirmation and does not transfer its files", async () => {
  const f = fixture(), c = createAdminTemplatePhotoCreateFormController(f.options), [photo] = await select(f, c);
  const confirm = c.mutationGuard("item"); assert.equal(confirm(), true); f.view.dialog.open = false; assert.equal(confirm(), false);
  f.view.dialog = { open: true }; f.view.token = {}; f.view.signature = "new-session";
  f.view.draft = { photos: [photo], deletedPhotos: [] }; c.save("item");
  assert.equal(f.calls.length, 0); assert.equal(f.view.dialog.open, true); assert.equal(f.errors.length, 1);
});

test("disabled create keeps existing-owner and fileless paths available but blocks an already selected create", async () => {
  const f = fixture(); f.controls.enabled = false; const c = createAdminTemplatePhotoCreateFormController(f.options);
  assert.equal(c.save("item"), false); assert.equal(await c.preparePhotos("item", []), null);
  f.controls.enabled = true; f.view.entityId = "existing";
  assert.equal(c.save("item"), false); assert.equal(c.inputGuard("item"), null);
  f.view.entityId = null; await select(f, c); f.controls.enabled = false;
  assert.equal(c.save("item"), true); assert.equal(f.calls.length, 0); assert.equal(f.view.dialog.open, true);
});

test("catalog imports, nested/copy placement and forged old photo cannot enter new-owner submit", async () => {
  for (const fault of ["catalogSource", "unsupportedPlacement", "created", "forged"]) {
    const f = fixture(), c = createAdminTemplatePhotoCreateFormController(f.options); await select(f, c);
    if (fault === "forged") f.view.draft.photos[0].sharedSourceId = "foreign-photo";
    else f.form[fault] = fault !== "created";
    assert.equal(c.save("item"), true); assert.equal(f.calls.length, 0); assert.equal(f.view.dialog.open, true);
  }
});

test("changing captured fields or placement signature after a failed attempt never allocates another submit", async () => {
  const f = fixture(), c = createAdminTemplatePhotoCreateFormController(f.options); await select(f, c); c.save("item");
  f.pending.reject(Error("Quota")); await tick(); f.view.signature = "changed-placement"; c.save("item");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].callbacks.isCurrent(), false); assert.equal(f.view.dialog.open, true);
});

test("flag OFF after submit prevents a late onDurable from closing the retained form", async () => {
  const f = fixture(), c = createAdminTemplatePhotoCreateFormController(f.options); await select(f, c); c.save("item");
  f.controls.enabled = false; f.pending.resolve(); await tick(); assert.equal(f.view.dialog.open, true); assert.equal(f.calls.length, 1);
});
