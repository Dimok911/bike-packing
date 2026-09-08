import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { preparePersonalCopyBatch } from "./personal-copy-intent.js";
import { PERSONAL_PHOTO_COPY_BATCH_ENABLED, assertPersonalPhotoCopyBatchCandidate } from "./personal-photo-copy-batch-protocol.js";
import { readPersonalPhotoOwnerState } from "./personal-photo-owner-state.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Массовая копия с фото не подтверждена. Выбранные записи сохранены."), { code: "photo-copy-batch" }); };

export function preparePersonalPhotoCopyBatch(input, { enabled = PERSONAL_PHOTO_COPY_BATCH_ENABLED, snapshotToPayload = value => value } = {}) {
  if (!enabled) fail();
  assertListOperationPayload({ ...input.binding, kind: "photos.mutate", body: input });
  const { binding, snapshot, basePayload, baseStateRevision, entityType, sourceIds, changedAt, editMeta, ids, versions } = clone(input);
  const collection = entityType === "item" ? "items" : "containers";
  if (!same(snapshotToPayload(clone(snapshot)), basePayload) || !["item", "container"].includes(entityType)
    || !Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 50 || new Set(sourceIds).size !== sourceIds.length
    || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1 || !Array.isArray(versions) || versions.length !== sourceIds.length
    || !Array.isArray(ids) || ids.some(id => !uuid(id)) || new Set(ids).size !== ids.length) fail();
  const count = sourceIds.reduce((total, id) => total + (basePayload[collection]?.[id]?.photos?.length || 0), 0);
  if (!count || count > 50 || ids.length !== 1 + sourceIds.length + 2 * count) fail();
  const entries = sourceIds.map((sourceId, index) => ({ type: entityType, sourceId, targetId: `${entityType}-${ids[index + 1]}` }));
  const prepared = preparePersonalCopyBatch(snapshot, { type: "copy", version: 1, entries, keepPlacement: false, layoutId: "" },
    { changedAt, currentEditMeta: () => clone(editMeta), hasPhotos: () => false });
  let offset = 1 + sourceIds.length;
  const owners = [], changes = [];
  for (const [ownerIndex, entry] of entries.entries()) {
    const source = basePayload[collection][entry.sourceId], target = prepared.snapshot[collection][entry.targetId], version = versions[ownerIndex];
    // The catalog helper materializes an absent bag color as undefined. Keep
    // the exact source representation before validating the durable snapshot.
    if (entityType === "container" && !Object.hasOwn(source, "color")) delete target.color;
    const photos = source.photos || [], ownerChanges = [];
    if (!Number.isSafeInteger(version?.baseEntityRevision) || version.baseEntityRevision < 1 || version.baseEntityRevision > baseStateRevision
      || !Array.isArray(version.photoRevisions) || version.photoRevisions.length !== photos.length) fail();
    for (const [index, photo] of photos.entries()) {
      const proof = version.photoRevisions[index];
      if (proof?.photoId !== photo.id || proof.assetId !== photo.assetId) fail();
      const photoId = ids[offset++], assetId = ids[offset++];
      ownerChanges.push({ version: 1, action: "copy", entityType, entityId: entry.targetId, baseEntityRevision: 0,
        expectedPhotoIds: ownerChanges.map(change => change.photoId), photoId, assetId, index,
        source: { listId: binding.listId, photoId: photo.id, assetId: photo.assetId, photoRevision: proof.photoRevision } });
    }
    owners.push({ entityType, entityId: entry.targetId, fields: { name: target.name, createdAt: changedAt, ...clone(editMeta) },
      copySource: { entityType, entityId: entry.sourceId, listId: binding.listId, entityRevision: version.baseEntityRevision, payload: source } });
    changes.push(...ownerChanges);
    target.photos = ownerChanges.map(change => ({ id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId: binding.listId, status: "pending" }));
  }
  const body = { version: 1, action: "copy-batch", baseStateRevision, owners, changes }, payload = snapshotToPayload(clone(prepared.snapshot));
  assertPersonalPhotoCopyBatchCandidate({ body, basePayload, payload, listId: binding.listId });
  for (const value of [body, prepared.snapshot, payload]) assertListOperationPayload({ ...binding, kind: "photos.mutate", body: value });
  return { binding, operationId: ids[0], body, snapshot: prepared.snapshot, payload };
}

export function createPersonalPhotoCopyBatchSession(options = {}) {
  return createPersonalPhotoCopySetSession({ ...options, prepareCopy: preparePersonalPhotoCopyBatch,
    sourcesForRequest: request => (request.sourceIds || []).map(entityId => ({ entityType: request.entityType, entityId })) });
}

// A single durable lifecycle for a selected catalog batch and a mixed tree.
// Concrete compilers own source selection and candidate validation; this owns
// freezing all IDs, exact source reads, one journal capture and recovery.
export function createPersonalPhotoCopySetSession({ outbox, store, getContext, readOwner, onDurable, prepareCopy, sourcesForRequest,
  enabled = PERSONAL_PHOTO_COPY_BATCH_ENABLED, snapshotToPayload = value => value, createUuid = () => crypto.randomUUID() } = {}) {
  let attempt;
  const current = () => { if (!same(attempt.initial, getContext?.())) fail(); };
  const session = {
    prepare(input) {
      if (attempt) return session.state();
      if (!enabled || !outbox || !store || typeof onDurable !== "function") fail();
      assertListOperationPayload({ ...outbox.binding, kind: "photos.mutate", body: input });
      const request = clone(input), initial = clone(getContext?.()), sources = clone(sourcesForRequest(request));
      if (["ids", "versions", "operationId", "files"].some(key => Object.hasOwn(request, key))
        || !initial?.generation || initial.scope !== "personal" || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key]
          || request.binding?.[key] !== outbox.binding[key]) || !Array.isArray(sources) || !sources.length || sources.length > 50) fail();
      const photos = sources.map(({ entityType, entityId }) => request.basePayload?.[entityType === "item" ? "items" : "containers"]?.[entityId]?.photos || []), count = photos.reduce((sum, rows) => sum + rows.length, 0);
      if (!count || count > 50) fail();
      attempt = { request, sources, initial, ids: Array.from({ length: 1 + sources.length + count * 2 }, () => createUuid()), phase: "freezing", preview: null, promise: null };
      attempt.preview = prepareCopy({ ...request, ids: attempt.ids, versions: photos.map(rows => ({ baseEntityRevision: 1,
        photoRevisions: rows.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })) })) }, { enabled, snapshotToPayload }).snapshot;
      current(); attempt.phase = "prepared"; return session.state();
    },
    submit(input) {
      if (attempt?.promise) return attempt.promise;
      try { if (!attempt) session.prepare(input); } catch (error) { return Promise.reject(error); }
      let resolve, reject; attempt.promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      (async () => {
        current(); if (attempt.phase !== "prepared" || outbox.hasPending()) fail();
        attempt.phase = "checking-storage";
        const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); current();
        if (inventory.entries.some(entry => entry.state !== "settled-retained")) fail();
        attempt.phase = "reading-sources"; const versions = [];
        for (const source of attempt.sources) {
          versions.push(await readPersonalPhotoOwnerState({ ...attempt.request, ...source }, { getContext, readOwner, allowEmpty: true })); current();
        }
        const prepared = prepareCopy({ ...attempt.request, ids: attempt.ids, versions }, { enabled, snapshotToPayload });
        const plan = outbox.preparePhoto(prepared); current(); attempt.phase = "capturing";
        const record = await outbox.capturePhoto({ plan, getContext }); current(); attempt.phase = "applying-view";
        if (onDurable(record)?.then) fail(); attempt.phase = "durable"; resolve({ record, durable: true, fileRetained: true });
      })().catch(error => { attempt.phase = "blocked"; error.unconfirmedMemoryDraft = clone(attempt.preview || attempt.request.snapshot); reject(error); });
      return attempt.promise;
    },
    state: () => ({ phase: attempt?.phase || "idle", operationId: attempt?.ids[0] || null }),
    recoveryCopy() {
      const context = getContext?.();
      if (!attempt || context?.scope !== "personal" || Object.keys(outbox.binding).some(key => context[key] !== outbox.binding[key])) return null;
      return { request: clone(attempt.request), ids: [...attempt.ids], preview: clone(attempt.preview), files: [], automaticImportAllowed: false };
    }
  };
  return session;
}
