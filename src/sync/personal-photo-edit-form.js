import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { assertPersonalPhotoFormCandidate, personalPhotoFormOwner, PERSONAL_PHOTO_EDIT_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { readPersonalPhotoOwnerState } from "./personal-photo-owner-state.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = message => { throw Object.assign(new Error(message || "Не удалось зафиксировать изменение фотографий. Форма сохранена."), { code: "photo-edit-form" }); };

// Existing private owner only, no file staging. Delete each missing reference
// against the preceding child result, then reorder the exact survivors. The
// complete form is one atomic action, never independently dispatched children.
export function preparePersonalPhotoEditForm({ binding, snapshot, basePayload, baseStateRevision, entityType, entityId,
  fields, photoIds, baseEntityRevision, photoRevisions, operationId }, { enabled = PERSONAL_PHOTO_EDIT_FORM_ENABLED, snapshotToPayload = value => value } = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || !uuid(operationId) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1
    || !Number.isSafeInteger(baseEntityRevision) || baseEntityRevision < 1 || baseEntityRevision > baseStateRevision) fail();
  const input = { binding, snapshot, basePayload, baseStateRevision, entityType, entityId, fields, photoIds, baseEntityRevision, photoRevisions, operationId };
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: input });
  ({ binding, snapshot, basePayload, fields, photoIds, photoRevisions } = clone(input));
  if (!same(snapshotToPayload(clone(snapshot)), basePayload)) fail();
  const collection = entityType === "item" ? "items" : "containers", before = basePayload?.[collection]?.[entityId];
  const photos = before?.photos;
  if (!before || before.id !== entityId || !Array.isArray(photos) || !photos.length || !Array.isArray(photoIds)
    || !Array.isArray(photoRevisions) || photoRevisions.length !== photos.length
    || new Set(photos.map(photo => photo.id)).size !== photos.length || new Set(photoIds).size !== photoIds.length
    || new Set(photoRevisions.map(photo => photo.photoId)).size !== photoRevisions.length) fail();
  const previousIds = photos.map(photo => photo.id), revisions = new Map(photoRevisions.map(photo => [photo.photoId, photo]));
  for (const photo of photos) {
    const proof = revisions.get(photo.id);
    if (photo.photoId !== photo.id || photo.listId !== binding.listId || photo.status !== "synced" || !uuid(photo.assetId)
      || proof?.assetId !== photo.assetId || !Number.isSafeInteger(proof.photoRevision) || proof.photoRevision < 1 || proof.photoRevision > baseEntityRevision) fail();
  }
  if (photoIds.some(id => !previousIds.includes(id)) || same(photoIds, previousIds)) fail();
  const removed = photos.filter(photo => !photoIds.includes(photo.id));
  const common = { version: 1, entityType, entityId, baseEntityRevision };
  let expected = previousIds;
  const changes = removed.map(photo => {
    const change = { ...common, action: "delete", expectedPhotoIds: [...expected], photoId: photo.id,
      assetId: photo.assetId, basePhotoRevision: revisions.get(photo.id).photoRevision };
    expected = expected.filter(id => id !== photo.id); return change;
  });
  if (!same(expected, photoIds)) changes.push({ ...common, action: "order", expectedPhotoIds: [...expected], photoIds });
  if (!changes.length || changes.length > 50) fail("Слишком много изменений фото для одной формы. Изменения остались в форме.");
  const body = { ...common, action: "form", baseStateRevision, fields, changes };
  const owner = personalPhotoFormOwner(basePayload, body);
  owner.photos = photoIds.map(id => clone(photos.find(photo => photo.id === id)));
  // Keep the UI's placement mirrors and project them through the existing
  // canonical writer, not through a newly invented representation.
  for (const [key, value] of Object.entries(fields)) {
    if (key === "dimensions" && value === null) delete snapshot[collection][entityId][key];
    else snapshot[collection][entityId][key] = clone(value);
  }
  snapshot[collection][entityId].photos = owner.photos;
  const payload = snapshotToPayload(clone(snapshot));
  assertPersonalPhotoFormCandidate({ body, basePayload, payload, listId: binding.listId });
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body });
  if ([snapshot, payload].some(value => new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024)) fail();
  return { binding, operationId, body, snapshot, payload };
}

export function createPersonalPhotoEditFormSession({ outbox, store, getContext, readOwner, onDurable,
  enabled = PERSONAL_PHOTO_EDIT_FORM_ENABLED, snapshotToPayload = value => value, createUuid = () => crypto.randomUUID() } = {}) {
  let attempt;
  const current = initial => { if (!same(initial, getContext?.())) fail("Форма или аккаунт изменились. Старое действие не применено."); };
  return {
    submit(input) {
      if (attempt) return attempt.promise;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      attempt = { promise, phase: "freezing", request: null, preview: null, operationId: null };
      const rejected = error => {
        attempt.phase = "blocked";
        if (attempt.request) { error.unconfirmedMemoryDraft = clone(attempt.preview || attempt.request.snapshot);
          error.unconfirmedPhotoFormFields = clone(attempt.request.fields); }
        reject(error);
      };
      try {
        if (!enabled || !outbox || !store || typeof onDurable !== "function") fail("Изменение существующих фото ещё не включено.");
        assertListOperationPayload({ ...outbox.binding, kind: "photos.mutate", body: input });
        const request = clone(input), initial = clone(getContext?.());
        if (request.created !== false || Object.hasOwn(request, "baseEntityRevision") || Object.hasOwn(request, "photoRevisions")
          || Object.hasOwn(request, "operationId") || Object.hasOwn(request, "files") || !initial?.generation || initial.scope !== "personal"
          || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key] || request.binding?.[key] !== outbox.binding[key])) fail();
        attempt.request = request; attempt.operationId = createUuid();
        if (!uuid(attempt.operationId)) fail();
        // Validation-only revisions construct a recovery preview before GET.
        // This preview has no action/receipt and is never stored or dispatched.
        const photos = request.basePayload?.[request.entityType === "item" ? "items" : "containers"]?.[request.entityId]?.photos || [];
        attempt.preview = preparePersonalPhotoEditForm({ ...request, operationId: attempt.operationId, baseEntityRevision: 1,
          photoRevisions: photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })) }, { enabled, snapshotToPayload }).snapshot;
        current(initial);
        if (outbox.hasPending()) fail("Сначала подтвердите предыдущие изменения. Удаление или порядок фото сохранены в форме.");
        (async () => {
          attempt.phase = "checking-storage";
          const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); current(initial);
          if (inventory.entries.some(entry => entry.state !== "settled-retained")) fail("Прежние фотодействия требуют проверки. Новое действие не отправлено.");
          attempt.phase = "reading-owner";
          const versions = await readPersonalPhotoOwnerState(request, { getContext, readOwner }); current(initial);
          const prepared = preparePersonalPhotoEditForm({ ...request, ...versions, operationId: attempt.operationId }, { enabled, snapshotToPayload });
          const plan = outbox.preparePhoto(prepared); current(initial);
          attempt.phase = "capturing";
          const record = await outbox.capturePhoto({ plan, getContext }); current(initial);
          attempt.phase = "applying-view";
          if (onDurable(record)?.then) fail("Применение сохранённого действия не должно ждать сеть.");
          attempt.phase = "durable"; resolve({ record, durable: true, fileRetained: true });
        })().catch(rejected);
      } catch (error) { rejected(error); }
      return promise;
    },
    state() { return { phase: attempt?.phase || "idle", operationId: attempt?.operationId || null }; },
    recoveryCopy() {
      const context = getContext?.();
      if (!attempt?.request || context?.scope !== "personal" || Object.keys(outbox.binding).some(key => context[key] !== outbox.binding[key])) return null;
      return { request: clone(attempt.request), ids: [attempt.operationId], preview: clone(attempt.preview), files: [], automaticImportAllowed: false };
    }
  };
}
