const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const invalid = () => { throw Object.assign(new Error("Связь фотографии с сохранённым действием повреждена. Данные не отправлены."),
  { code: "causal-photo-reference", isPersonalSaveBlocked: true }); };

// Representation, not authority: these IDs never prove an upload or a receipt.
// Preserve the exact server reference; its publication guard compares ALL these
// fields. Legacy compaction must not drop IDs/filename/size or invent timestamps.
// A pending reference also survives projection, but is NOT an uploadable file.
export function causalPhotoReferenceForSync(photo) {
  if (!photo || !Object.hasOwn(photo, "assetId")) return null;
  if (!id(photo.id) || photo.photoId !== photo.id || !uuid(photo.assetId)
    || (photo.status === "pending" && !Object.hasOwn(photo, "listId") ? false : !id(photo.listId))
    || !["pending", "synced"].includes(photo.status)
    || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) invalid();
  // The first single-file journal version had no listId in its local pending
  // reference. Read it unchanged for recovery; never infer a binding or rewrite
  // the stored request. New form writers independently require exact listId.
  const reference = { id: photo.id, photoId: photo.photoId, assetId: photo.assetId,
    ...(Object.hasOwn(photo, "listId") ? { listId: photo.listId } : {}), status: photo.status };
  if (photo.status === "pending") {
    if (photo.url || photo.thumbUrl) invalid();
    return reference;
  }
  for (const key of ["url", "thumbUrl", "fileName", "type"]) {
    if (typeof photo[key] !== "string" || !photo[key]) invalid();
    reference[key] = photo[key];
  }
  for (const key of ["size", "width", "height"]) {
    if (typeof photo[key] !== "number" || !Number.isFinite(photo[key]) || photo[key] < 0) invalid();
    reference[key] = photo[key];
  }
  return reference;
}
