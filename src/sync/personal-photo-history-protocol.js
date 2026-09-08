import { personalPhotoHistoryPlan } from "./personal-photo-history-plan.js";
export const PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED = false;
export const PERSONAL_PHOTO_HISTORY_RESTORE_CAPABILITY = "personalCausalPhotoHistoryRestoreV1";
const canonical = value => JSON.stringify(value && typeof value === "object" ? Array.isArray(value)
  ? value.map(entry => JSON.parse(canonical(entry)))
  : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);

export function validatePersonalPhotoHistoryResult(result, expected) {
  try {
    const manifest = expected.body.historyRestore, revision = manifest.targetStateRevision + 1;
    if (manifest.version !== 2 || result.list?.id !== expected.listId || result.list.stateRevision !== revision
      || result.stateRevision !== revision || result.restoreHistoryId !== manifest.historyId
      || canonical(result.restoredLayoutIds) !== canonical(manifest.layoutIds)
      || canonical(result.photoHistoryRestore) !== canonical(manifest.photoRestore)) return false;
    const selected = new Set(manifest.photoRestore.owners.flatMap(owner => owner.photoIds));
    const plan = personalPhotoHistoryPlan({ listId: expected.listId, baseStateRevision: revision,
      currentPayload: expected.body.payload, payload: result.list.payload,
      heads: manifest.photoRestore.heads.map(head => ({ ...head, deleted: !selected.has(head.photoId), revision })) });
    return canonical(plan.manifest.owners) === canonical(manifest.photoRestore.owners);
  } catch { return false; }
}
