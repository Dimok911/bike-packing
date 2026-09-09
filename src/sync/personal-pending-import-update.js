import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";

// Shared ancestry/file invariants. Each caller supplies its own strict record
// decoder, manifest and reference version; no runtime action chooses a codec.
export function createPersonalPendingImportUpdate({ assertRecord, readManifest, manifestKey, referenceVersion, projectPayload }) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
  const fields = ["items", "containers"];

  function resultReference(source) {
    assertRecord(source);
    return bodyResultReference(source.action.body, source.action.operationId);
  }

  function bodyResultReference(body, operationId) {
    const manifest = readManifest(body[manifestKey]);
    if (Object.hasOwn(manifest, "operationId") && manifest.operationId !== operationId) throw Error("Import identity changed");
    const files = manifest.files, seen = new Set(), owners = [];
    for (const file of files) {
      const key = `${file.entityType}:${file.entityId}`;
      if (!seen.has(key)) { seen.add(key); owners.push({ entityType: file.entityType, entityId: file.entityId }); }
    }
    return { version: referenceVersion, operationId, owners };
  }

  // DB edits may change fields and placements, while every pending file stays
  // attached to its frozen owner in the exact order. Only the ordinary explicit
  // deletion reducer may remove a pending owner. No new file action is inferred.
  function isUpdate({ source, basePayload, payload, userDeletion = null, listId }) {
    try {
      const reference = resultReference(source);
      if (source.action.listId !== listId) return false;
      const initial = source.photoState.payload, base = projectPayload(basePayload), actual = projectPayload(payload);
      const layoutDeletion = userDeletion?.type === "layout";
      if (layoutDeletion && (!base.layouts[userDeletion.id] || actual.layouts[userDeletion.id])) return false;
      const ownerDeletion = layoutDeletion ? null : userDeletion;
      const expected = ownerDeletion ? preparePersonalDeletionBatch(base, ownerDeletion).snapshot : base;
      for (const collection of fields) {
        if (Object.keys(base[collection]).some(id => Object.hasOwn(expected[collection], id) !== Object.hasOwn(actual[collection], id))
          || Object.keys(initial[collection]).some(id => !Object.hasOwn(base[collection], id) && Object.hasOwn(actual[collection], id))) return false;
      }
      const assigned = new Map(source.action.body[manifestKey].files.map(file => [file.photoId, file]));
      const withoutPending = value => {
        const result = clone(value);
        for (const collection of fields) for (const owner of Object.values(result[collection])) if (owner.photos) {
          owner.photos = owner.photos.filter(photo => {
            if (photo.status !== "pending") return true;
            const file = assigned.get(photo.id);
            if (!file || collection !== (file.entityType === "item" ? "items" : "containers") || owner.id !== file.entityId
              || !same(photo, { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId, status: "pending" })) throw Error("Unbound pending photo");
            return false;
          });
        }
        return result;
      };
      for (const owner of reference.owners) {
        const collection = owner.entityType === "item" ? "items" : "containers", id = owner.entityId;
        // A previously deleted owner cannot reappear in a later descendant.
        if (!Object.hasOwn(expected[collection], id)) { if (Object.hasOwn(actual[collection], id)) return false; continue; }
        if (!base[collection][id] || !actual[collection][id]
          || !same(base[collection][id].photos, initial[collection][id].photos)
          || !same(actual[collection][id].photos, expected[collection][id].photos)) return false;
      }
      return preservesConfirmedPersonalPhotos(withoutPending(base), withoutPending(actual), listId, { userDeletion: ownerDeletion });
    } catch { return false; }
  }

  // Follow only actual causal parents. A historical checkpoint link does not
  // authorize replay of a previous import or resurrection of one of its owners.
  function sourceFor({ records, operationId, listId, includeSource = false }) {
    try {
      const byId = new Map(records.map(record => [record.action.operationId, record]));
      if (byId.size !== records.length) return null;
      const visited = new Set(), steps = []; let record = byId.get(operationId);
      while (record && record.action.kind !== "list.import") {
        const action = record.action, parent = action.body.causal?.baseOperationId;
        if (visited.has(action.operationId) || action.kind !== "list.update" || action.listId !== listId || record.photoState
          || !parent || !byId.has(parent) || action.body.photoResults?.version !== referenceVersion) return null;
        visited.add(action.operationId); steps.push(record); record = byId.get(parent);
      }
      if (!record || !steps.length && !includeSource) return null;
      const source = record, reference = resultReference(source);
      if (source.action.listId !== listId) return null;
      let previous = source;
      for (const step of steps.reverse()) {
        const action = step.action, deps = action.body.causal.dependsOn;
        if (!same(action.body.photoResults, reference) || ["actorId", "environment", "scopeKey", "listId"].some(key => action[key] !== source.action[key])
          || action.generation !== previous.action.generation + 1 || !Array.isArray(deps)
          || ![source.action.operationId, previous.action.operationId].every(id => deps.some(dep => dep.operationId === id && dep.listId === listId))
          || !isUpdate({ source, basePayload: previous.action.body.payload, payload: action.body.payload, userDeletion: action.body.userDeletion, listId })) return null;
        previous = step;
      }
      return source;
    } catch { return null; }
  }
  return { resultReference, bodyResultReference, isUpdate, sourceFor };
}
