// Local upload entries intentionally have no URL in the server payload yet.
// Keep them independent of comparisons against that compact payload.
const maps = ["layouts", "items", "containers"];
const localOnly = photo => Boolean(photo?.localId && !photo.url && !photo.thumbUrl
  && ["pending", "uploading", "error", "missing-local-file"].includes(photo.status));
const privateRecord = (key, record) => key !== "layouts" || !(record.adminDemo || record.adminSharedSourceId || record.publicCatalogLayoutId);
export function hasPendingLocalPhotos(state) {
  return maps.some(key => Object.values(state?.[key] || {}).some(record => privateRecord(key, record)
    && (record.photos || []).some(photo => localOnly(photo) && photo.status !== "missing-local-file")));
}
export function retainLocalPhotoUploads(nextState, localState) {
  let retained = 0;
  for (const key of maps) for (const [id, record] of Object.entries(localState?.[key] || {})) {
    const next = nextState?.[key]?.[id];
    // Explicitly deleted entities stay deleted; this protects the upload queue only.
    if (!next || !privateRecord(key, record)) continue;
    for (const [index, photo] of (record.photos || []).entries()) {
      if (!localOnly(photo)) continue;
      const photos = next.photos ||= [];
      if (photos.some(other => other.id === photo.id || (other.localId && other.localId === photo.localId))) continue;
      photos.splice(Math.min(index, photos.length), 0, Object.defineProperties({}, Object.getOwnPropertyDescriptors(photo)));
      if (key === "layouts" && photo.tripId && !(next.trips || []).some(trip => trip.id === photo.tripId)) {
        const trip = (record.trips || []).find(trip => trip.id === photo.tripId);
        if (trip) (next.trips ||= []).push({...trip});
      }
      retained++;
    }
  }
  return retained;
}
