// Preparation for archive imports. This module has no storage, API or editor
// effects. The archive action must still persist these files before adoption.
const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fileValid = value => value instanceof Blob && value.size > 0 && value.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type);
const fail = () => { throw Object.assign(Error("Не удалось подтвердить все выбранные фотографии архива. Импорт остановлен."), { code: "archive-photo-files" }); };
const sha = async blob => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

export function preparePersonalArchivePhotoFiles({ owners, photoFiles }, { createUuid = () => crypto.randomUUID() } = {}) {
  if (!Array.isArray(owners) || !(photoFiles instanceof Map)) fail();
  const selected = clone(owners), seenOwners = new Set(), assigned = new Set(), entries = [];
  let totalBytes = 0;
  for (const owner of selected) {
    if (!owner || !["item", "container"].includes(owner.entityType) || !id(owner.sourceId) || !id(owner.targetId)
      || !Array.isArray(owner.photos) || seenOwners.has(`${owner.entityType}:${owner.targetId}`)) fail();
    seenOwners.add(`${owner.entityType}:${owner.targetId}`);
    const seenPhotos = new Set();
    for (const photo of owner.photos) {
      const photoId = photo?.id || photo?.localId, entry = photoFiles.get(photoId);
      if (!id(photoId) || seenPhotos.has(photoId) || !entry || entry.meta?.id !== photoId || !hash(entry.meta.sha256)
        || !fileValid(entry.blob) || entry.thumbBlob != null && !fileValid(entry.thumbBlob)
        || entry.meta.size !== entry.blob.size || entry.meta.type !== entry.blob.type
        || typeof entry.meta.fileName !== "string" || !entry.meta.fileName || entry.meta.fileName.length > 255
        || ["width", "height"].some(key => !Number.isFinite(entry.meta[key]) || entry.meta[key] < 0)) fail();
      seenPhotos.add(photoId); assigned.add(photoId);
      totalBytes += entry.blob.size + (entry.thumbBlob?.size || 0);
      if (entries.length >= 50 || totalBytes > 50 * 1024 * 1024) fail();
      // Blob construction snapshots bytes synchronously. Replacing a Map entry,
      // metadata or a selected source while hashing cannot change this choice.
      entries.push({ entityType: owner.entityType, sourceEntityId: owner.sourceId, entityId: owner.targetId,
        sourcePhotoId: photoId, sourceReference: clone(photo), metadata: clone(entry.meta),
        file: new Blob([entry.blob], { type: entry.blob.type }),
        thumb: entry.thumbBlob ? new Blob([entry.thumbBlob], { type: entry.thumbBlob.type }) : null });
    }
  }
  const next = () => { const value = createUuid(); if (!uuid(value) || assigned.has(value)) fail(); assigned.add(value); return value; };
  // One source file reused by several archived owners becomes independent
  // destination assets. IDs are frozen for all parts before the first await.
  const parts = entries.map(entry => ({ ...entry, assetId: next(), photoId: next() }));
  let verification;
  return {
    inventory: parts.map(({ file, thumb, ...part }) => ({ ...clone(part), fileSize: file.size, thumbSize: thumb?.size || 0 })),
    verify() {
      verification ||= (async () => {
        const result = [];
        for (const part of parts) {
          if (await sha(part.file) !== part.metadata.sha256) fail();
          result.push({ ...clone(Object.fromEntries(Object.entries(part).filter(([key]) => !["file", "thumb"].includes(key)))),
            file: part.file, thumb: part.thumb, thumbHash: part.thumb ? await sha(part.thumb) : part.metadata.sha256 });
        }
        return result;
      })();
      return verification.then(parts => parts.map(({ file, thumb, ...part }) => ({ ...clone(part), file, thumb })));
    }
  };
}
