import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { assertPersonalPhotoFormCandidate, personalPhotoFormOwner } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_COPY_FORM_ENABLED } from "./personal-photo-copy-source.js";
import { readPersonalPhotoOwnerState } from "./personal-photo-owner-state.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = message => { throw Object.assign(new Error(message || "Копия с фотографиями не подтверждена. Выбранный источник сохранён."), { code: "photo-copy-form" }); };

export function preparePersonalPhotoCopyForm(input, { enabled = PERSONAL_PHOTO_COPY_FORM_ENABLED, snapshotToPayload = value => value } = {}) {
  if (!enabled) fail("Копирование карточки с фото ещё не включено.");
  assertListOperationPayload({ ...input.binding, kind: "photos.mutate", body: input });
  const { binding, snapshot, basePayload, baseStateRevision, entityType, sourceId, fields, ids, baseEntityRevision, photoRevisions } = clone(input);
  const collection = entityType === "item" ? "items" : "containers", source = basePayload?.[collection]?.[sourceId];
  if (binding?.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || !["item", "container"].includes(entityType) || !same(snapshotToPayload(clone(snapshot)), basePayload)
    || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1 || !Number.isSafeInteger(baseEntityRevision)
    || baseEntityRevision < 1 || baseEntityRevision > baseStateRevision || !Array.isArray(source?.photos) || !source.photos.length
    || !Array.isArray(photoRevisions) || photoRevisions.length !== source.photos.length
    || !Array.isArray(ids) || ids.length !== 2 + source.photos.length * 2 || ids.some(id => !uuid(id)) || new Set(ids).size !== ids.length) fail();
  const operationId = ids[0], entityId = `${entityType}-${ids[1]}`;
  if (["items", "containers", "layouts"].some(key => Object.hasOwn(basePayload[key] || {}, entityId))) fail("ID копии уже занят.");
  const changes = source.photos.map((photo, index) => {
    const proof = photoRevisions[index];
    if (proof?.photoId !== photo.id || proof.assetId !== photo.assetId) fail();
    return { version: 1, action: "copy", entityType, entityId, baseEntityRevision: 0,
      photoId: ids[2 + index * 2], assetId: ids[3 + index * 2], index,
      expectedPhotoIds: source.photos.slice(0, index).map((_, n) => ids[2 + n * 2]),
      source: { listId: binding.listId, photoId: photo.id, assetId: photo.assetId, photoRevision: proof.photoRevision } };
  });
  const body = { version: 1, action: "form", entityType, entityId, baseEntityRevision: 0, baseStateRevision, fields,
    copySource: { listId: binding.listId, entityType, entityId: sourceId, entityRevision: baseEntityRevision, payload: source }, changes };
  const owner = personalPhotoFormOwner(basePayload, body);
  owner.photos = changes.map(change => ({ id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId: binding.listId, status: "pending" }));
  snapshot[collection][entityId] = owner;
  if (snapshot.packedItems) delete snapshot.packedItems[entityId];
  const payload = snapshotToPayload(clone(snapshot));
  assertPersonalPhotoFormCandidate({ body, basePayload, payload, listId: binding.listId });
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body });
  if ([snapshot, payload].some(value => new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024)) fail();
  return { binding, operationId, body, snapshot, payload };
}

// prepare() freezes selection and every target ID synchronously, before a
// confirmation dialog. submit() only verifies that selection and links one
// fileless action. Repeated submits use the same promise, including failures.
export function createPersonalPhotoCopyFormSession({ outbox, store, getContext, readOwner, onDurable,
  enabled = PERSONAL_PHOTO_COPY_FORM_ENABLED, snapshotToPayload = value => value, createUuid = () => crypto.randomUUID() } = {}) {
  let attempt;
  const current = () => { if (!same(attempt.initial, getContext?.())) fail("Список или аккаунт изменились. Старый выбор не применён."); };
  const session = {
    prepare(input) {
      if (attempt) return session.state();
      if (!enabled || !outbox || !store || typeof onDurable !== "function") fail("Копирование карточки с фото ещё не включено.");
      assertListOperationPayload({ ...outbox.binding, kind: "photos.mutate", body: input });
      const request = clone(input), initial = clone(getContext?.());
      if (["baseEntityRevision", "photoRevisions", "ids", "operationId", "files", "entityId", "created"].some(key => Object.hasOwn(request, key))
        || !initial?.generation || initial.scope !== "personal" || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key]
          || request.binding?.[key] !== outbox.binding[key])) fail();
      const photos = request.basePayload?.[request.entityType === "item" ? "items" : "containers"]?.[request.sourceId]?.photos;
      if (!Array.isArray(photos) || !photos.length || photos.length > 50) fail();
      attempt = { request, initial, phase: "freezing", ids: Array.from({ length: 2 + photos.length * 2 }, () => createUuid()), preview: null, promise: null };
      // These sentinel versions are only a local recovery preview, never an
      // action or an authority to publish. The exact read builds the real plan.
      attempt.preview = preparePersonalPhotoCopyForm({ ...request, ids: attempt.ids, baseEntityRevision: 1,
        photoRevisions: photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })) }, { enabled, snapshotToPayload }).snapshot;
      current(); attempt.phase = "prepared"; return session.state();
    },
    submit(input) {
      if (attempt?.promise) return attempt.promise;
      try { if (!attempt) session.prepare(input); }
      catch (error) { return Promise.reject(error); }
      let resolve, reject;
      attempt.promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      (async () => {
        current();
        if (attempt.phase !== "prepared" || outbox.hasPending()) fail("Сначала подтвердите предыдущие изменения. Выбранная копия сохранена.");
        attempt.phase = "checking-storage";
        const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); current();
        if (inventory.entries.some(entry => entry.state !== "settled-retained")) fail("Прежние фотодействия требуют проверки. Копия сохранена без отправки.");
        attempt.phase = "reading-source";
        const request = attempt.request;
        const versions = await readPersonalPhotoOwnerState({ ...request, entityId: request.sourceId }, { getContext, readOwner }); current();
        const prepared = preparePersonalPhotoCopyForm({ ...request, ...versions, ids: attempt.ids }, { enabled, snapshotToPayload });
        const plan = outbox.preparePhoto(prepared); current();
        attempt.phase = "capturing";
        const record = await outbox.capturePhoto({ plan, getContext }); current();
        attempt.phase = "applying-view";
        if (onDurable(record)?.then) fail("Применение сохранённой копии не должно ждать сеть.");
        attempt.phase = "durable"; resolve({ record, durable: true, fileRetained: true });
      })().catch(error => {
        attempt.phase = "blocked"; error.unconfirmedMemoryDraft = clone(attempt.preview || attempt.request.snapshot); reject(error);
      });
      return attempt.promise;
    },
    state() { return { phase: attempt?.phase || "idle", operationId: attempt?.ids[0] || null }; },
    recoveryCopy() {
      const context = getContext?.();
      if (!attempt || context?.scope !== "personal" || Object.keys(outbox.binding).some(key => context[key] !== outbox.binding[key])) return null;
      return { request: clone(attempt.request), ids: [...attempt.ids], preview: clone(attempt.preview), files: [], automaticImportAllowed: false };
    }
  };
  return session;
}
