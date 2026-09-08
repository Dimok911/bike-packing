import { causalPhotoReferenceForSync } from "../state/causal-photo-reference.js";
import { canonicalListOperationJson } from "../sync/list-operation-queue.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Object.assign(new Error("Не удалось связать все выбранные фото с этой формой. Данные не отправлены; форму можно сохранить после проверки фото."),
  { code: "photo-form-selection" }); };
const file = value => value instanceof Blob && value.size > 0 && value.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type);

export function personalPhotoEditSelection({ draft, basePhotos, binding }) {
  if (!Array.isArray(draft?.photos) || !Array.isArray(draft.deletedPhotos) || !Array.isArray(basePhotos) || !basePhotos.length) fail();
  const originals = new Map(basePhotos.map(photo => [photo.id, causalPhotoReferenceForSync(photo)]));
  if (originals.size !== basePhotos.length) fail();
  const photoIds = [], removed = [];
  for (const [entries, target] of [[draft.photos, photoIds], [draft.deletedPhotos, removed]]) for (const photo of entries) {
    const original = originals.get(photo?.id), selected = causalPhotoReferenceForSync(photo);
    if (!original || original.status !== "synced" || original.listId !== binding.listId || !same(original, selected) || target.includes(photo.id)) fail();
    target.push(photo.id);
  }
  if (removed.some(id => photoIds.includes(id)) || basePhotos.some(photo => !photoIds.includes(photo.id) && !removed.includes(photo.id))) fail();
  return photoIds;
}

// Per-opened-form immutable Blob handles, acquired from the image preparation
// callback. Never re-read a mutable thumbnail cache at Save. This is NOT the
// durable action store: submit still needs its atomic full-file IDB commit.
export function createPersonalPhotoFormFiles({ binding, getContext }) {
  binding = clone(binding);
  const form = getContext?.()?.form, records = new Map();
  const assertCurrent = () => {
    const context = getContext?.();
    if (!form || context?.form !== form || context.scope !== "personal" || binding.environment !== "bike-packing-experiment"
      || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).some(key => context[key] !== binding[key])) fail();
  };
  assertCurrent();
  return {
    capture(record) {
      assertCurrent();
      if (typeof record?.id !== "string" || !record.id || record.id.length > 191 || record.fullBlobVerified !== true
        || !file(record.blob) || record.thumbBlob != null && !file(record.thumbBlob)
        || typeof record.fileName !== "string" || !record.fileName || record.fileName.length > 255) fail();
      const next = { file: record.blob, thumb: record.thumbBlob ?? null, fileName: record.fileName };
      const previous = records.get(record.id);
      if (previous && (previous.file !== next.file || previous.thumb !== next.thumb || previous.fileName !== next.fileName)) fail();
      if (!previous) records.set(record.id, Object.freeze(next));
    },
    selection({ draft, basePhotos }) {
      assertCurrent();
      if (!Array.isArray(draft?.photos) || !Array.isArray(draft.deletedPhotos) || draft.deletedPhotos.length
        || !Array.isArray(basePhotos) || draft.photos.length <= basePhotos.length || draft.photos.length - basePhotos.length > 50) fail();
      const selected = draft.photos.slice(), ids = new Set();
      for (const [index, photo] of selected.entries()) {
        if (!photo || typeof photo.id !== "string" || !photo.id || ids.has(photo.id)) fail(); ids.add(photo.id);
        if (index < basePhotos.length) {
          const old = causalPhotoReferenceForSync(basePhotos[index]), next = causalPhotoReferenceForSync(photo);
          if (!old || old.status !== "synced" || old.listId !== binding.listId || !same(old, next)) fail();
        }
      }
      let bytes = 0;
      return selected.slice(basePhotos.length).map(photo => {
        if (photo.localId !== photo.id || photo.status !== "pending" || photo.url || photo.thumbUrl || Object.hasOwn(photo, "assetId")
          || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) fail();
        const prepared = records.get(photo.localId); if (!prepared) fail();
        bytes += prepared.file.size + (prepared.thumb?.size || 0); if (bytes > 50 * 1024 * 1024) fail();
        return { ...prepared }; // Blob bytes are immutable; metadata is copied.
      });
    },
    mixedSelection({ draft, basePhotos }) {
      assertCurrent();
      if (!Array.isArray(draft?.photos) || !Array.isArray(draft.deletedPhotos) || !Array.isArray(basePhotos) || !basePhotos.length) fail();
      const originals = new Set(basePhotos.map(photo => photo.id));
      const retainedPhotoIds = personalPhotoEditSelection({ binding, basePhotos,
        draft: { photos: draft.photos.filter(photo => originals.has(photo?.id)), deletedPhotos: draft.deletedPhotos } });
      const order = [], files = [], ids = new Set(); let bytes = 0;
      for (const photo of draft.photos) {
        if (!photo || typeof photo.id !== "string" || !photo.id || ids.has(photo.id)) fail(); ids.add(photo.id);
        if (originals.has(photo.id)) { order.push({ photoId: photo.id }); continue; }
        if (photo.localId !== photo.id || photo.status !== "pending" || photo.url || photo.thumbUrl || Object.hasOwn(photo, "assetId")
          || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) fail();
        const prepared = records.get(photo.localId); if (!prepared) fail();
        bytes += prepared.file.size + (prepared.thumb?.size || 0); if (bytes > 50 * 1024 * 1024) fail();
        order.push({ fileIndex: files.length }); files.push({ ...prepared });
      }
      if (!files.length || files.length > 50) fail();
      return { files, photoSelection: { retainedPhotoIds, order } };
    },
    assertCurrent
  };
}
