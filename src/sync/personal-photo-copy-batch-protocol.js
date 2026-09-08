import { canonicalListOperationJson } from "./list-operation-queue.js";
import { personalPhotoFormManifest } from "./personal-photo-form-protocol.js";
import { personalPhotoCopyOwner } from "./personal-photo-copy-source.js";
import { personalPhotoPublicationManifest, validatePersonalPhotoPublicationResult } from "./personal-photo-publication-protocol.js";
import { personalPhotoTreeCopyLayout } from "./personal-photo-tree-copy-layout.js";

import { personalPhotoCopyPlacementLayout } from "./personal-photo-copy-placement-layout.js";

export const PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED = false;
export const PERSONAL_PHOTO_COPY_PLACEMENT_CAPABILITY = "personalCausalPhotoCopyPlacementV1";
export const PERSONAL_PHOTO_COPY_BATCH_ENABLED = false;
export const PERSONAL_PHOTO_COPY_BATCH_CAPABILITY = "personalCausalPhotoCopyBatchV1";
export const PERSONAL_PHOTO_TREE_COPY_ENABLED = false;
export const PERSONAL_PHOTO_TREE_COPY_CAPABILITY = "personalCausalPhotoTreeCopyV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const fail = () => { throw Object.assign(Error("Выбранный пакет копирования изменён или неполон. Источники сохранены."),
  { code: "photo-copy-batch", isOperationPreflightError: true }); };
const validationView = body => ({ version: 1, action: "batch", changes: body.changes.map(change => ({ ...change, baseEntityRevision: 1 })) });
const placementKeys = type => type === "item" ? ["containerId", "parentContainerId"] : ["parentId", "childIds", "itemIds", "order"];

// One selected set, including photo-less owners. The ordinary public form
// still rejects an empty change list; only this compiler opts into that case.
export function personalPhotoCopyBatchManifest(body) {
  if (!plain(body) || body.version !== 1 || body.action !== "copy-batch"
    || !Number.isSafeInteger(body.baseStateRevision) || body.baseStateRevision < 1
    || Object.keys(body).some(key => !["version", "action", "baseStateRevision", "causal", "owners", "changes", "copyTree", "copyPlacement"].includes(key))
    || !Array.isArray(body.owners) || !body.owners.length || body.owners.length > 50
    || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 50) fail();
  const targets = new Set(), sources = new Set(), flattened = [];
  const forms = body.owners.map(owner => {
    if (!plain(owner) || Object.keys(owner).some(key => !["entityType", "entityId", "fields", "copySource"].includes(key))
      || !owner.copySource || targets.has(owner.entityId)) fail();
    const sourceKey = `${owner.entityType}:${owner.copySource.entityId}`;
    if (sources.has(sourceKey)) fail();
    sources.add(sourceKey); targets.add(owner.entityId);
    const changes = body.changes.filter(change => change?.entityType === owner.entityType && change.entityId === owner.entityId);
    const form = { version: 1, action: "form", baseStateRevision: body.baseStateRevision, baseEntityRevision: 0, ...clone(owner), changes: clone(changes) };
    personalPhotoFormManifest(form, { allowEmptyCopy: true });
    if (form.copySource.entityRevision > body.baseStateRevision) fail();
    flattened.push(...changes); return form;
  });
  if (!same(flattened, body.changes) || forms.some(form => targets.has(form.copySource.entityId))) fail();
  const photos = personalPhotoPublicationManifest(validationView(body));
  const tree = Object.hasOwn(body, "copyTree") ? personalPhotoTreeCopyLayout(body) : null;
  const placement = Object.hasOwn(body, "copyPlacement") ? personalPhotoCopyPlacementLayout(body) : null;
  return { forms, photos, tree, placement, owners: forms.map(form => ({ entityType: form.entityType, entityId: form.entityId })) };
}

export function assertPersonalPhotoCopyBatchCandidate({ body, basePayload, payload, listId }) {
  const manifest = personalPhotoCopyBatchManifest(body), candidate = clone(basePayload);
  const photoIds = new Set(), assets = new Set();
  for (const field of ["items", "containers"]) for (const owner of Object.values(candidate[field] || {})) {
    for (const photo of owner.photos || []) { photoIds.add(photo.id); assets.add(photo.assetId); }
  }
  for (const form of manifest.forms) {
    const collection = form.entityType === "item" ? "items" : "containers", desired = payload?.[collection]?.[form.entityId];
    if (form.copySource.listId !== listId || !same(candidate[collection]?.[form.copySource.entityId], form.copySource.payload)
      || ["items", "containers", "layouts"].some(key => Object.hasOwn(candidate[key] || {}, form.entityId)) || !plain(desired)) fail();
    const owner = personalPhotoCopyOwner(form); Object.assign(owner, form.fields);
    owner.photos = form.changes.map(change => {
      if (photoIds.has(change.photoId) || assets.has(change.assetId)) fail();
      photoIds.add(change.photoId); assets.add(change.assetId);
      return { id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId, status: "pending" };
    });
    for (const key of placementKeys(form.entityType)) if (!Object.hasOwn(desired, key)) delete owner[key];
    candidate[collection][form.entityId] = owner;
  }
  if (manifest.tree) {
    const tree = personalPhotoTreeCopyLayout(body, basePayload);
    candidate.layouts[tree.targetLayoutId] = tree.layout;
  }
  if (manifest.placement) {
    const placement = personalPhotoCopyPlacementLayout(body, basePayload);
    candidate.layouts[placement.targetLayoutId] = placement.layout;
  }
  if (!same(candidate, payload)) fail();
  return manifest;
}

export function assertPersonalPhotoCopyBatchRecord(record) {
  if (record?.action?.kind !== "photos.mutate" || record.photoState?.version !== 1 || record.photoState.fileIntentHash !== null
    || record.photoState.fileInventoryVersion !== undefined || !record.mergeBase || record.reconciliation || record.localReconciliation
    || record.mergeBase.stateRevision !== record.action.body.baseStateRevision) fail();
  return assertPersonalPhotoCopyBatchCandidate({ body: record.action.body, basePayload: record.mergeBase.payload,
    payload: record.photoState.payload, listId: record.action.listId });
}

export function validatePersonalPhotoCopyBatchResult(result, expected) {
  try {
    const manifest = personalPhotoCopyBatchManifest(expected.body);
    if (!same(result?.photoCopyBatch, { version: 1, owners: manifest.owners })
      || !validatePersonalPhotoPublicationResult(result, { ...expected, body: validationView(expected.body) })) return false;
    if (manifest.tree && (!same(result.photoCopyTree, { version: 1, rootId: manifest.tree.rootId, targetLayoutId: manifest.tree.targetLayoutId })
      || !same(result.list.payload.layouts?.[manifest.tree.targetLayoutId], manifest.tree.layout))) return false;
    if (manifest.placement && (!same(result.photoCopyPlacement, { version: 1, itemId: manifest.placement.itemId,
      targetLayoutId: manifest.placement.targetLayoutId, targetContainerId: manifest.placement.targetContainerId })
      || !same(result.list.payload.layouts?.[manifest.placement.targetLayoutId], manifest.placement.layout))) return false;
    const placedCopy = manifest.tree || manifest.placement;
    for (const form of manifest.forms) {
      if (form.copySource.listId !== expected.listId) return false;
      const owner = result.list.payload[form.entityType === "item" ? "items" : "containers"]?.[form.entityId];
      if (!owner || !Array.isArray(owner.photos) || owner.photos.length !== form.changes.length) return false;
      const copied = personalPhotoCopyOwner(form); Object.assign(copied, form.fields);
      const actual = { ...owner, photos: [] };
      for (const key of placementKeys(form.entityType)) {
        if (placedCopy) {
          if (Object.hasOwn(actual, key)) {
            const value = actual[key], empty = value === null || value === "" || Array.isArray(value) && !value.length;
            const placed = form.entityType === "item" ? placedCopy.layout.arrangement.items[form.entityId]
              : placedCopy.layout.arrangement.containers[form.entityId]?.[key];
            if (!empty && !same(value, placed)) return false;
          }
          delete actual[key]; delete copied[key];
        } else if (!Object.hasOwn(actual, key)) delete copied[key];
      }
      if (!same(copied, actual) || owner.photos.some((photo, index) => ["fileName", "type", "size", "width", "height"].some(key =>
        photo[key] !== form.copySource.payload.photos[index][key]))) return false;
    }
    return true;
  } catch { return false; }
}
