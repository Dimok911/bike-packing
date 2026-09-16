import { causalPhotoReferenceForSync } from "../state/causal-photo-reference.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { assertPersonalPhotoHistoryRestore } from "./personal-history-restore.js";
import { validPersonalItemRename } from "./personal-item-rename.js";
const ordinaryRecordPayload = record => record?.compactState?.payload ?? record?.action?.body?.payload;

export const PERSONAL_PHOTO_OWNER_DELETION_ENABLED = false;

const legacyKeys = new Set(["id", "photoId", "listId", "status", "url", "thumbUrl", "width", "height", "updatedAt"]);
const referenceId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);

// These references are readable old server identities, not new upload input.
// Their complete values and owner/order must still match a confirmed snapshot.
export function isPreservedLegacyPersonalPhoto(photo, listId) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo) || Object.keys(photo).some(key => !legacyKeys.has(key))
    || !referenceId(photo.id) || !referenceId(listId) || (photo.listId !== listId && photo.listId !== "") || photo.status !== "synced"
    || Object.hasOwn(photo, "photoId") && photo.photoId !== photo.id
    || !["width", "height"].every(key => typeof photo[key] === "number" && Number.isFinite(photo[key]) && photo[key] >= 0)
    || typeof photo.updatedAt !== "string" || !Number.isFinite(Date.parse(photo.updatedAt))) return false;
  return ["url", "thumbUrl"].every(key => {
    try {
      if (typeof photo[key] !== "string") return false;
      const url = new URL(photo[key]);
      const prefixes = url.origin === "https://api.vniipo-help.ru" ? ["/experiment/letters-vniipo/api", "/letters-vniipo/api"]
        : url.origin === "https://experiment.vniipo-help.ru" ? ["/letters-vniipo/api"]
        : url.origin === "https://api-eu.vniipo-help.ru" ? ["/experiment/letters-vniipo/api"] : [];
      return !url.username && !url.password && !url.hash && prefixes.some(prefix => url.pathname ===
        `${prefix}/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photo.id)}/${key === "url" ? "file" : "thumb"}`);
    } catch { return false; }
  });
}

export function hasLegacyPersonalPhotos(payload) {
  return ["items", "containers"].some(collection => Object.values(payload?.[collection] || {}).some(owner =>
    Array.isArray(owner?.photos) && owner.photos.some(photo => photo && typeof photo === "object" && !Object.hasOwn(photo, "assetId"))));
}

const ordinaryLegacyBodyKeys = new Set(["baseServerUpdatedAt", "baseStateRevision", "stateRevision", "clientUpdatedAt", "clientDeviceId",
  "clientDeviceName", "sourceUpdatedAt", "sourceDeviceId", "sourceDeviceName", "changeGroupId", "affectedLayoutIds", "changeScope",
  "force", "forceOverwrite", "fullReplace", "payload", "userPlacement", "causal"]);
export function isOrdinaryLegacyPersonalUpdate(body) {
  return !!body && typeof body === "object" && !Array.isArray(body)
    && Object.keys(body).every(key => ordinaryLegacyBodyKeys.has(key))
    && ["force", "forceOverwrite"].every(key => !Object.hasOwn(body, key) || body[key] === false);
}

// A database-only edit may retain already confirmed assets, never perform a
// hidden attach, copy, delete, reorder or legacy URL-to-asset conversion.
export function preservesConfirmedPersonalPhotos(base, candidate, listId, { userDeletion = null, allowLegacy = false } = {}) {
  if (!base || !candidate || typeof listId !== "string" || !listId) return false;
  const inventory = payload => {
    const result = [], ids = new Set(), assets = new Set(), legacyReferences = new Map();
    for (const collection of ["items", "containers"]) {
      if (!payload[collection] || typeof payload[collection] !== "object" || Array.isArray(payload[collection])) throw Error("owners");
      for (const [id, owner] of Object.entries(payload[collection]).sort(([a], [b]) => a.localeCompare(b))) {
        if (!owner || owner.id !== id || Object.hasOwn(owner, "photos") && !Array.isArray(owner.photos)) throw Error("owner");
        for (const [index, photo] of (owner.photos || []).entries()) {
          if (allowLegacy && isPreservedLegacyPersonalPhoto(photo, listId)) {
            // The legacy reader and the editor expose the same Experiment
            // file through different approved prefixes. Compare its checked
            // list/photo/variant identity; keep query and all metadata exact.
            // This projection never rewrites the persisted operation body.
            const reference = { ...photo };
            for (const key of ["url", "thumbUrl"]) {
              reference[key] = `/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photo.id)}/${key === "url" ? "file" : "thumb"}${new URL(photo[key]).search}`;
            }
            const identity = canonicalListOperationJson(reference), previous = legacyReferences.get(photo.id);
            const ownerKey = `${collection}:${id}`;
            // Old bag copies could share a legacy file. Only an unchanged
            // confirmed owner inventory may retain that sharing; no new copy
            // or repeated slot in one owner can be hidden by this exception.
            if (ids.has(photo.id) && (!previous || previous.identity !== identity || previous.owners.has(ownerKey))) throw Error("duplicate");
            if (previous) previous.owners.add(ownerKey);
            else legacyReferences.set(photo.id, { identity, owners: new Set([ownerKey]) });
            ids.add(photo.id);
            result.push({ collection, ownerId: id, index, legacy: true, reference });
            continue;
          }
          const reference = causalPhotoReferenceForSync(photo);
          if (!reference || reference.status !== "synced" || reference.listId !== listId || ids.has(reference.id) || assets.has(reference.assetId)
            || canonicalListOperationJson(photo) !== canonicalListOperationJson(reference)) throw Error("unconfirmed");
          ids.add(reference.id); assets.add(reference.assetId);
          result.push({ collection, ownerId: id, index, reference });
        }
      }
    }
    return result;
  };
  try {
    // Validate the complete original inventory BEFORE reducing explicit owners.
    // A deleted owner must not hide pending, legacy or cross-list references.
    const original = canonicalListOperationJson(inventory(base));
    const actual = canonicalListOperationJson(inventory(candidate));
    if (original === actual) return true;
    if (!userDeletion) return false;
    const expected = preparePersonalDeletionBatch(base, userDeletion).snapshot;
    if (allowLegacy && canonicalListOperationJson(inventory(base).filter(entry => entry.legacy))
      !== canonicalListOperationJson(inventory(expected).filter(entry => entry.legacy))) return false;
    if (["items", "containers"].some(collection => Object.keys(base[collection]).some(id =>
      !Object.hasOwn(expected[collection], id) && Object.hasOwn(candidate[collection], id)))) return false;
    // The ordinary reducer preserves items and independently reusable nested
    // bags. Their photos must survive unchanged, including order and metadata.
    return canonicalListOperationJson(inventory(expected)) === actual;
  }
  catch { return false; }
}

// Only the active causal dispatch chain matters here. A previousLocalOperationId
// is a historical checkpoint link, not permission to dispatch that old form.
// Records must come from the validated scoped outbox; this adds the file guard,
// it does not replace its receipt, fork, revision or server-side checks.
export function preservesConfirmedPersonalPhotoChain({ records, operationId, listId, allowOwnerDeletion = false, allowHistoryRestore = false,
  confirmedBoundary = null, allowLegacy = false, initialBase = null, historicalBoundary = null }) {
  try {
    if (!Array.isArray(records) || !records.length || !operationId) return false;
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return false;
    if (historicalBoundary) {
      const action = byId.get(historicalBoundary.operationId)?.action;
      if (!allowLegacy || confirmedBoundary || action?.kind !== "list.update" || action.listId !== listId
        || canonicalListOperationJson(historicalBoundary.payload) !== canonicalListOperationJson(action.body.payload)
        || historicalBoundary.stateRevision <= action.body.baseStateRevision) return false;
      confirmedBoundary = historicalBoundary;
    }
    if (confirmedBoundary && (confirmedBoundary.listId !== listId || !byId.has(confirmedBoundary.operationId)
      || !Number.isSafeInteger(confirmedBoundary.stateRevision) || confirmedBoundary.stateRevision < 1
      || !preservesConfirmedPersonalPhotos(confirmedBoundary.payload, confirmedBoundary.payload, listId, { allowLegacy }))) return false;
    if (initialBase && (!allowLegacy || initialBase.listId !== listId || !byId.has(initialBase.operationId)
      || !Number.isSafeInteger(initialBase.stateRevision) || initialBase.stateRevision < 1
      || !preservesConfirmedPersonalPhotos(initialBase.payload, initialBase.payload, listId, { allowLegacy }))) return false;
    const visited = new Set();
    let record = byId.get(operationId);
    if (!record) return false;
    while (record) {
      const { action } = record, parentId = action.body.causal?.baseOperationId;
      if (action.operationId === confirmedBoundary?.operationId) return action.listId === listId;
      if (visited.has(action.operationId) || !["list.update", "item.rename", ...(allowHistoryRestore ? ["list.restore"] : [])].includes(action.kind) || action.listId !== listId) return false;
      if (action.kind === "item.rename" && (!record.compactState || !validPersonalItemRename(action.body))) return false;
      visited.add(action.operationId);
      const parent = parentId ? byId.get(parentId) : null;
      if (parentId && !parent) return false;
      const boundaryParent = confirmedBoundary && parentId === confirmedBoundary.operationId;
      const parentPayload = boundaryParent ? confirmedBoundary.payload : ordinaryRecordPayload(parent);
      const initial = initialBase?.operationId === action.operationId ? initialBase : null;
      if (initial && (record.mergeBase || parentId || action.body.baseStateRevision !== initial.stateRevision)) return false;
      const base = record.mergeBase?.payload || parentPayload || initial?.payload;
      if (record.mergeBase && parent && canonicalListOperationJson(base) !== canonicalListOperationJson(parentPayload)) return false;
      if (boundaryParent && (!historicalBoundary || record.mergeBase) && record.mergeBase?.stateRevision !== confirmedBoundary.stateRevision) return false;
      const payload = ordinaryRecordPayload(record);
      if (allowLegacy && (hasLegacyPersonalPhotos(base) || hasLegacyPersonalPhotos(payload))
        && !(action.kind === "item.rename" ? validPersonalItemRename(action.body) : action.kind === "list.update" && isOrdinaryLegacyPersonalUpdate(action.body))) return false;
      if (action.kind === "list.restore") assertPersonalPhotoHistoryRestore({ body: action.body, base, listId });
      else if (!preservesConfirmedPersonalPhotos(base, payload, listId,
        { userDeletion: allowOwnerDeletion ? action.body.userDeletion : null, allowLegacy })) return false;
      record = parent;
    }
    return true;
  } catch { return false; }
}
