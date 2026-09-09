const clone = value => JSON.parse(JSON.stringify(value));
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const validFile = file => file instanceof Blob && file.size > 0 && file.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(file.type);
const sha = async file => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
  .map(value => value.toString(16).padStart(2, "0")).join("");
const fail = () => { throw Object.assign(Error("Не удалось подготовить все исходные фотографии гостевой работы. Перенос остановлен."), { code: "guest-import-files" }); };

// The caller must persist the selection before starting this loader. Each
// owner/reference is frozen before the first read, and file IDs are never
// allocated here. Partial reads stay available for explicit recovery export.
export function preparePersonalGuestImportFiles(selection, { loadFile } = {}) {
  const frozen = clone(selection), source = frozen.candidate?.sourceState;
  if (!uuid(frozen.operationId) || !source || !Array.isArray(frozen.photoTargets) || frozen.photoTargets.length > 50
    || typeof loadFile !== "function") fail();
  const assigned = new Set([frozen.operationId]), entries = frozen.photoTargets.map(target => {
    const field = target.entityType === "item" ? "items" : "containers", owner = source[field]?.[target.sourceEntityId];
    const sourceReference = owner?.photos?.find(photo => (photo.id || photo.localId) === target.sourcePhotoId);
    if (!["item", "container"].includes(target.entityType) || !sourceReference || !uuid(target.photoId) || !uuid(target.assetId)
      || target.photoId === target.assetId || assigned.has(target.photoId) || assigned.has(target.assetId)
      || !frozen.ownerTargets.some(value => value.entityType === target.entityType && value.sourceId === target.sourceEntityId
        && value.targetId === target.entityId && value.reuse === false)) fail();
    assigned.add(target.photoId); assigned.add(target.assetId);
    return { ...clone(target), sourceReference: clone(sourceReference) };
  });
  const loaded = []; let completion;
  const recoveryFiles = () => loaded.map(({ file, thumb, ...part }) => ({ ...clone(part), file, thumb }));
  return {
    recoveryFiles,
    verify() {
      completion ||= (async () => {
        let total = 0;
        for (const entry of entries) {
          const read = await loadFile({ binding: clone(frozen.binding), entityType: entry.entityType,
            entityId: entry.sourceEntityId, photo: clone(entry.sourceReference) });
          if (!read || !validFile(read.file) || read.thumb != null && !validFile(read.thumb)
            || typeof read.fileName !== "string" || !read.fileName || read.fileName.length > 255) fail();
          total += read.file.size + (read.thumb?.size || 0); if (total > 50 * 1024 * 1024) fail();
          const part = { ...clone(entry), fileName: read.fileName, file: new Blob([read.file], { type: read.file.type }),
            thumb: read.thumb ? new Blob([read.thumb], { type: read.thumb.type }) : null };
          loaded.push(part);
          const [fileHash, thumbHash] = await Promise.all([sha(part.file), part.thumb ? sha(part.thumb) : Promise.resolve(null)]);
          if (entry.sourceReference.sha256 !== undefined && entry.sourceReference.sha256 !== fileHash) fail();
          part.manifest = { entityType: entry.entityType, entityId: entry.entityId, sourcePhotoId: entry.sourcePhotoId,
            photoId: entry.photoId, assetId: entry.assetId, file: { hash: fileHash, size: part.file.size, type: part.file.type, fileName: part.fileName },
            thumb: part.thumb ? { hash: thumbHash, size: part.thumb.size, type: part.thumb.type } : null };
        }
        return true;
      })();
      return completion.then(() => recoveryFiles());
    }
  };
}
