import { syncPhotoRecordFromUpload } from "../state/item-photos.js";

const matches = (a, b) => Boolean(a && b && (a.id === b.id || (a.localId && a.localId === b.localId)));

export function syncLayoutPhotoUpload(record, photo) {
  const target = (record?.photos || []).find(candidate => matches(candidate, photo));
  if (!target) return null;
  const { caption, tripId } = target;
  syncPhotoRecordFromUpload(record, photo);
  Object.assign(target, { caption, tripId });
  return target;
}

// Application adapter: transport stays in the common uploader; draft ownership
// survives trip switches and transfers to the saved layout when the dialog closes.
export function createLayoutDraftPhotoUploads({ layoutId, getTrips, getSavedLayout, uploadPhotos, onProgress = () => {}, isCurrentScope = () => true }) {
  const entity = { id: layoutId, photos: [] };
  let closed = false;
  const owned = photo => isCurrentScope() && (closed
    ? (getSavedLayout()?.photos || []).some(candidate => matches(candidate, photo))
    : getTrips().some(trip => trip.photos.some(candidate => matches(candidate, photo))));
  const mirror = photo => {
    if (!isCurrentScope()) return;
    const records = closed ? [] : getTrips();
    const saved = getSavedLayout();
    if (saved) records.push(saved);
    for (const record of records) syncLayoutPhotoUpload(record, photo);
    if (!closed) onProgress();
  };
  return {
    add(photo) {
      entity.photos.push(photo);
      return uploadPhotos({ entity, entityType: "layout", photos: [photo], shouldUploadPhoto: owned,
        onPhotoProgress: mirror, onAfterUpload: () => mirror(photo) });
    },
    close() { closed = true; },
    entity
  };
}
