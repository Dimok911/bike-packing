import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";

export const PERSONAL_PHOTO_TREE_LINK_ENABLED = false;
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);

// Link/missing-only changes placement of existing private owners. It must not
// materialize an external photo, use an unsaved local file, or substitute the
// photo selection from a stale tree snapshot. Tree topology is checked by the
// common tree compiler; this adds the exact confirmed-photo boundary.
export function assertPersonalPhotoTreeSource({ snapshot, sourceSnapshot, listId }) {
  const fail = () => { throw Object.assign(Error("Фотографии исходной сумки не совпадают с сохранённым личным списком. Размещение остановлено."),
    { code: "photo-tree-source", isOperationPreflightError: true }); };
  if (!preservesConfirmedPersonalPhotos(snapshot, snapshot, listId) || !sourceSnapshot?.rootId) fail();
  let photoCount = 0;
  for (const collection of ["items", "containers"]) {
    const selected = sourceSnapshot[collection];
    if (!selected || Object.getPrototypeOf(selected) !== Object.prototype) fail();
    for (const [id, owner] of Object.entries(selected)) {
      const current = snapshot[collection]?.[id];
      if (!owner || owner.id !== id || !current || current.id !== id
        || Object.hasOwn(owner, "photos") && !Array.isArray(owner.photos)
        || !same(owner.photos || [], current.photos || [])) fail();
      photoCount += (owner.photos || []).length;
    }
  }
  return { photoCount, filesUnchanged: true };
}
