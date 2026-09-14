import { canonicalListOperationJson as canonical } from "./list-operation-queue.js";
import { isPreservedLegacyPersonalPhoto, preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";

// Comparison only. Keep the authoritative server baseline and retained action
// bytes intact. No serializer/defaulting is allowed to erase a business change;
// only already validated legacy URL aliases can compare equal here.
export function personalBusinessPayloadMatchesConfirmed({ confirmedPayload, candidatePayload, listId, allowLegacy = false }) {
  try {
    const before = canonical(confirmedPayload), after = canonical(candidatePayload);
    if (before === after) return true;
    if (!allowLegacy || !preservesConfirmedPersonalPhotos(confirmedPayload, candidatePayload, listId, { allowLegacy: true })) return false;
    const comparison = JSON.parse(after);
    for (const collection of ["items", "containers"]) for (const [id, owner] of Object.entries(comparison[collection])) {
      for (const [index, photo] of (owner.photos || []).entries()) {
        const original = confirmedPayload[collection]?.[id]?.photos?.[index];
        if (isPreservedLegacyPersonalPhoto(original, listId) && isPreservedLegacyPersonalPhoto(photo, listId)) {
          photo.url = original.url;
          photo.thumbUrl = original.thumbUrl;
        }
      }
    }
    return before === canonical(comparison);
  } catch { return false; }
}
