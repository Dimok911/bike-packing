// Protocol only. It does not stage bytes, register an independent UI queue or
// install a server snapshot. Photo actions must join the personal causal stream.
export const PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED = false;
export const PERSONAL_PHOTO_PUBLICATION_CAPABILITY = "personalCausalPhotoPublicationV1";
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["constructor", "prototype", "__proto__"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const equal = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const invalid = () => { throw Object.assign(new Error("Состав фотодействия изменён или неполон. Отправка остановлена."),
  { code: "photo-manifest", isOperationPreflightError: true }); };

export function personalPhotoPublicationManifest(body, { allowDeleteThenOrder = false } = {}) {
  // Only the form validator opts in through a call argument. Wire flags never
  // broaden the photo-only batch grammar; an order remains terminal per owner.
  if (body?.version !== 1 || body.payload !== undefined || body.force || body.forceOverwrite) invalid();
  const batch = body.action === "batch", changes = batch ? body.changes : [body];
  if (!Array.isArray(changes) || !changes.length || changes.length > 50) invalid();
  const photos = new Set(), assets = new Set(), owners = new Map();
  return changes.map((change, index) => {
    if (change?.version !== 1 || !["attach", "copy", "delete", "order"].includes(change.action)
      || !["item", "container"].includes(change.entityType) || !id(change.entityId)
      || !revision(change.baseEntityRevision) || !ids(change.expectedPhotoIds)
      || change.payload !== undefined || change.force || change.forceOverwrite
      || batch && (change.causal !== undefined || change.baseStateRevision !== undefined)) invalid();
    const ownerKey = `${change.entityType}:${change.entityId}`, previous = owners.get(ownerKey);
    if (previous && (change.action === "order" && !(allowDeleteThenOrder && previous.onlyDeletes) || previous.action === "order"
      || change.baseEntityRevision !== previous.baseEntityRevision || !equal(change.expectedPhotoIds, previous.photoIds))) invalid();
    let photoIds;
    if (change.action === "order") {
      if (!ids(change.photoIds) || change.photoIds.length !== change.expectedPhotoIds.length
        || change.photoIds.some(value => !change.expectedPhotoIds.includes(value))) invalid();
      photoIds = [...change.photoIds];
    } else {
      if (!id(change.photoId) || !uuid(change.assetId) || photos.has(change.photoId)) invalid();
      photos.add(change.photoId);
      if (change.action === "delete") {
        if (!revision(change.basePhotoRevision) || !change.expectedPhotoIds.includes(change.photoId)) invalid();
        photoIds = change.expectedPhotoIds.filter(value => value !== change.photoId);
      } else {
        if (assets.has(change.assetId) || change.expectedPhotoIds.includes(change.photoId)
          || !Number.isSafeInteger(change.index) || change.index < 0 || change.index > change.expectedPhotoIds.length) invalid();
        assets.add(change.assetId);
        if (change.action === "copy" && (!id(change.source?.listId) || !id(change.source?.photoId)
          || !uuid(change.source?.assetId) || change.source.assetId === change.assetId || !revision(change.source?.photoRevision))) invalid();
        photoIds = [...change.expectedPhotoIds]; photoIds.splice(change.index, 0, change.photoId);
      }
    }
    const outcome = { index, action: change.action, entityType: change.entityType, entityId: change.entityId,
      ...(change.action === "order" ? {} : { photoId: change.photoId, assetId: change.assetId }), photoIds };
    owners.set(ownerKey, { ...outcome, baseEntityRevision: change.baseEntityRevision,
      onlyDeletes: change.action === "delete" && (!previous || previous.onlyDeletes) });
    return outcome;
  });
}

export function validatePersonalPhotoPublicationResult(payload, expected, options) {
  try {
    const manifest = personalPhotoPublicationManifest(expected.body, options), list = payload?.list;
    if (list?.id !== expected.listId || !revision(payload.stateRevision) || list.stateRevision !== payload.stateRevision) return false;
    const batch = expected.body.action === "batch", outcomes = batch ? payload.photoChanges : [payload];
    if (!Array.isArray(outcomes) || outcomes.length !== manifest.length || !list.payload) return false;
    const owners = new Map();
    for (const entry of manifest) {
      const outcome = outcomes[entry.index];
      if (!outcome || !equal(outcome.photoIds, entry.photoIds)) return false;
      if (batch && ["index", "action", "entityType", "entityId", "photoId", "assetId"].some(key => outcome[key] !== entry[key])) return false;
      if (["attach", "copy"].includes(entry.action)) {
        const photo = outcome.photo;
        if (!photo || photo.id !== entry.photoId || photo.photoId !== entry.photoId || photo.assetId !== entry.assetId
          || photo.listId !== expected.listId || photo.status !== "synced"
          || typeof photo.url !== "string" || !photo.url || typeof photo.thumbUrl !== "string" || !photo.thumbUrl) return false;
      } else if (outcome.photo !== undefined) return false;
      owners.set(`${entry.entityType}:${entry.entityId}`, entry);
    }
    // Intermediate outcomes differ from the final owner for a sequential batch.
    // Check the final manifest once per owner, and every new photo's asset binding.
    for (const entry of owners.values()) {
      const owner = list.payload[entry.entityType === "item" ? "items" : "containers"]?.[entry.entityId];
      if (!owner || owner.id !== entry.entityId || !equal(owner.photos?.map(photo => photo.id), entry.photoIds)) return false;
    }
    for (const entry of manifest.filter(value => ["attach", "copy"].includes(value.action))) {
      const owner = list.payload[entry.entityType === "item" ? "items" : "containers"][entry.entityId];
      const photo = owner.photos.find(value => value.id === entry.photoId), outcome = outcomes[entry.index].photo;
      if (!photo || Object.keys(photo).length !== Object.keys(outcome).length
        || Object.keys(photo).some(key => photo[key] !== outcome[key])) return false;
    }
    return true;
  } catch { return false; }
}
