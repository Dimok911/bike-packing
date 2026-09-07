import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalPhotoFormController } from "../../src/ui/personal-photo-form-controller.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", generation: "base", scope: "personal" };
  const view = { token: {}, dialog: { open: true }, saveButton: { disabled: false }, signature: "draft",
    draft: { photos: [], deletedPhotos: [] }, source: { photos: [] } }, events = [], captured = [], pending = deferred();
  let id = 0;
  const form = { request: { fields: { name: "Chosen" } }, placementChanged: false, availabilityChanged: false, catalogSource: false };
  const options = { isEnabled: () => true, getContext: () => context, getView: () => view, readForm: () => form,
    createPhoto: async (blob, { cachePhoto }) => { const photoId = `local-${++id}`;
      await cachePhoto({ id: photoId, blob, thumbBlob: null, fileName: `${photoId}.png`, fullBlobVerified: true });
      return { id: photoId, localId: photoId, status: "pending" };
    }, cachePhoto: async (record, scope) => { events.push(`cache:${scope}`); },
    createSession(callbacks) { events.push("session"); return { submit(input) { captured.push(input); return pending.promise.then(() => callbacks.onDurable({ action: { operationId: "one" } })); },
      recoveryCopy: () => ({ kept: true }) }; },
    onDurable() { events.push("view"); view.dialog.open = false; }, onQueued: () => events.push("queue"),
    onError: error => events.push(`error:${error.code || error.message}`), onBusy: (type, busy) => events.push(`busy:${busy}`) };
  return { context, view, events, captured, pending, form, options };
}
const selected = () => new Blob(["selected file"], { type: "image/png" });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("real form adapter defers closing/queueing, scopes prepared bytes and handles repeated Save with one session", async () => {
  const f = fixture(), controller = createPersonalPhotoFormController(f.options);
  f.view.draft.photos = await controller.preparePhotos("item", [selected(), selected()]);
  assert.equal(controller.save("item"), true); assert.equal(controller.save("item"), true);
  assert.equal(f.captured.length, 1); assert.equal(f.view.dialog.open, true);
  assert.equal(f.captured[0].files.length, 2); assert.equal(f.events.includes("view"), false);
  f.pending.resolve(); await tick();
  assert.deepEqual(f.events.slice(-2), ["view", "queue"]); assert.equal(f.view.dialog.open, false);
  assert.equal(f.events.filter(e => e === "cache:id:actor").length, 2);
});

test("a rejected captured form stays open with its original session and recovery data", async () => {
  const f = fixture(), controller = createPersonalPhotoFormController(f.options);
  f.view.draft.photos = await controller.preparePhotos("container", [selected()]);
  controller.save("container"); f.pending.reject(Object.assign(Error("quota"), { code: "quota" })); await tick();
  assert.equal(f.view.dialog.open, true); assert.equal(f.events.includes("queue"), false);
  assert.deepEqual(controller.recoveryCopy("container"), { kept: true });
  controller.save("container"); assert.equal(f.captured.length, 1);
});

test("disabled or photo-free forms use the existing writer, unsupported mixed actions never fall through to it", async () => {
  const f = fixture(), controller = createPersonalPhotoFormController(f.options);
  assert.equal(controller.save("item"), false);
  f.view.draft.photos = await controller.preparePhotos("item", [selected()]); f.form.placementChanged = true;
  assert.equal(controller.save("item"), true); assert.equal(f.captured.length, 0); assert.equal(f.view.dialog.open, true);
  assert.equal(controller.busy("item"), false);
  const disabled = createPersonalPhotoFormController({ ...f.options, isEnabled: () => false });
  assert.equal(await disabled.preparePhotos("item", [selected()]), null); assert.equal(disabled.save("item"), false);
});

test("photo preparation freezes account cache scope and refuses late callbacks into a reopened form", async () => {
  for (const change of [f => { f.context.actorId = "other"; f.context.scopeKey = "id:other"; }, f => { f.view.token = {}; }]) {
    const f = fixture(), wait = deferred();
    f.options.cachePhoto = async (record, scope) => { f.events.push(`cache:${scope}`); await wait.promise; };
    const controller = createPersonalPhotoFormController(f.options), photos = controller.preparePhotos("item", [selected()]);
    change(f); wait.resolve();
    await assert.rejects(photos, error => error.isStalePhotoForm === true);
    assert.equal(f.events.includes("cache:id:other"), false); assert.equal(f.captured.length, 0);
  }
});
