import {
  createStoredZip,
  readZipEntries,
  zipText
} from "../utils/simple-zip.js";

export const BACKUP_FORMAT = "bike-packing-backup";
export const BACKUP_VERSION = 1;

export function backupDownloadName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `bike-packing-${stamp}.bikepacking-backup.zip`;
}

export function collectStatePhotoRefs(targetState, normalizePhotos) {
  const refs = [];
  const collect = (entityType, entity) => {
    normalizePhotos(entity).forEach((photo) => {
      const id = String(photo.id || photo.localId || "").trim();
      if (id) refs.push({ entityType, entityId: entity.id || "", photo });
    });
  };
  Object.values(targetState?.items || {}).forEach((item) => collect("item", item));
  Object.values(targetState?.containers || {}).forEach((container) => collect("container", container));
  return refs;
}

export async function sha256Blob(blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function backupPhotoFolderName(hash, photoId) {
  return `${hash}-${String(photoId || "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80)}`;
}

export async function buildBackupPhotoEntries(snapshot, {
  extraSnapshots = [],
  normalizePhotos,
  fetchPhotoBlob
} = {}) {
  const photoRefs = [snapshot, ...extraSnapshots]
    .filter((candidate) => candidate?.items && candidate?.containers)
    .flatMap((candidate) => collectStatePhotoRefs(candidate, normalizePhotos));
  const seen = new Set();
  const entries = [];
  const photos = [];
  const missing = [];
  for (const ref of photoRefs) {
    const photoId = String(ref.photo.id || ref.photo.localId || "").trim();
    if (!photoId || seen.has(photoId)) continue;
    seen.add(photoId);
    try {
      const fileBlob = await fetchPhotoBlob(ref.photo, "file");
      if (!fileBlob) {
        missing.push(photoId);
        continue;
      }
      const thumbBlob = await fetchPhotoBlob(ref.photo, "thumb").catch(() => null);
      const hash = await sha256Blob(fileBlob);
      const folderName = backupPhotoFolderName(hash, photoId);
      const filePath = `photos/${folderName}/file`;
      const thumbPath = thumbBlob ? `photos/${folderName}/thumb` : "";
      entries.push({ name: filePath, content: fileBlob });
      if (thumbBlob) entries.push({ name: thumbPath, content: thumbBlob });
      photos.push({
        id: photoId,
        sha256: hash,
        file: filePath,
        thumb: thumbPath,
        fileName: ref.photo.fileName || `${photoId}.jpg`,
        type: fileBlob.type || ref.photo.type || "image/jpeg",
        thumbType: thumbBlob?.type || fileBlob.type || ref.photo.type || "image/jpeg",
        size: fileBlob.size || ref.photo.size || 0,
        width: ref.photo.width || 0,
        height: ref.photo.height || 0,
        entityType: ref.entityType,
        entityId: ref.entityId
      });
    } catch {
      missing.push(photoId);
    }
  }
  return { entries, photos, missing };
}

export function buildBackupManifest({
  state,
  photos = [],
  appVersion,
  language,
  admin = null,
  now = new Date().toISOString()
}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    appVersion,
    language,
    includesAdminPublicData: Boolean(admin),
    data: {
      state,
      admin
    },
    photos
  };
}

export function buildCurrentBackupManifest({
  appVersion = "",
  canIncludeAdmin = false,
  currentSharedLayouts = () => [],
  demoStatePayloadForLanguage = () => null,
  language = "",
  languages = [],
  now = new Date().toISOString(),
  photos = [],
  snapshot = null,
  cloneValue = (value) => JSON.parse(JSON.stringify(value))
} = {}) {
  const admin = canIncludeAdmin
    ? {
        demoStates: languages.map((entryLanguage) => ({
          language: entryLanguage,
          payload: demoStatePayloadForLanguage(entryLanguage)
        })).filter((entry) => entry.payload),
        sharedLayouts: languages.map((entryLanguage) => ({
          language: entryLanguage,
          layouts: cloneValue(currentSharedLayouts(entryLanguage))
        }))
      }
    : null;
  return buildBackupManifest({
    state: snapshot,
    photos,
    appVersion,
    language,
    admin,
    now
  });
}

export function isBikePackingBackupManifest(manifest) {
  return manifest?.format === BACKUP_FORMAT;
}

export async function createBackupZip(manifest, photoEntries = []) {
  return createStoredZip([
    { name: "backup.json", content: JSON.stringify(manifest, null, 2) },
    ...photoEntries
  ]);
}

export async function readBackupArchiveFile(file) {
  const entries = await readZipEntries(file);
  const manifestBytes = entries.get("backup.json");
  if (!manifestBytes) throw new Error("В архиве нет backup.json.");
  const manifest = JSON.parse(zipText(manifestBytes));
  if (!isBikePackingBackupManifest(manifest)) throw new Error("Это не архив Bike Packing.");
  const photoFiles = new Map();
  for (const photo of Array.isArray(manifest.photos) ? manifest.photos : []) {
    const fileBytes = photo.file ? entries.get(photo.file) : null;
    if (!photo.id || !fileBytes) continue;
    const thumbBytes = photo.thumb ? entries.get(photo.thumb) : null;
    photoFiles.set(String(photo.id), {
      meta: photo,
      blob: new Blob([fileBytes], { type: photo.type || "image/jpeg" }),
      thumbBlob: thumbBytes ? new Blob([thumbBytes], { type: photo.thumbType || photo.type || "image/jpeg" }) : null
    });
  }
  return { manifest, photoFiles };
}
