export async function resolveExistingBackupPhotos(photoFiles, {
  apiFetch,
  currentUser = null,
  ensureCurrentPackingListId = async () => "",
  isForcedOffline = () => false,
  listApiTimeoutMs = 0
} = {}) {
  if (!photoFiles?.size || !currentUser || isForcedOffline() || typeof apiFetch !== "function") return new Map();
  try {
    const listId = await ensureCurrentPackingListId();
    const hashes = [...new Set([...photoFiles.values()].map((entry) => entry.meta?.sha256).filter(Boolean))];
    if (!hashes.length) return new Map();
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/resolve`, {
      method: "POST",
      timeoutMs: listApiTimeoutMs,
      body: JSON.stringify({ hashes })
    });
    const result = new Map();
    Object.entries(data.photosByHash || {}).forEach(([hash, photo]) => {
      if (hash && photo?.id) result.set(hash, photo);
    });
    return result;
  } catch {
    return new Map();
  }
}

export async function prepareBackupPhotosForState(targetState, {
  currentPackingListId = "",
  nowIso = () => new Date().toISOString(),
  normalizePhotos = () => [],
  photoFiles = null,
  photoIds = null,
  putCachedPhoto = async () => {},
  resolveExistingPhotos = async () => new Map()
} = {}) {
  if (!photoFiles?.size) return { reused: 0, queued: 0, missing: 0 };
  const wanted = photoIds ? new Set([...photoIds].filter(Boolean)) : null;
  const relevantFiles = new Map([...photoFiles.entries()].filter(([id]) => !wanted || wanted.has(id)));
  const resolved = await resolveExistingPhotos(relevantFiles);
  let reused = 0;
  let queued = 0;
  let missing = 0;
  const rewrite = async (photo) => {
    const originalId = String(photo.id || photo.localId || "").trim();
    if (!originalId || (wanted && !wanted.has(originalId))) return;
    const file = photoFiles.get(originalId);
    if (!file) {
      missing += 1;
      return;
    }
    const existing = file.meta?.sha256 ? resolved.get(file.meta.sha256) : null;
    if (existing?.id) {
      Object.assign(photo, {
        id: existing.id,
        localId: "",
        status: "synced",
        url: existing.url || "",
        thumbUrl: existing.thumbUrl || "",
        listId: currentPackingListId || existing.listId || "",
        updatedAt: existing.updatedAt || nowIso(),
        error: ""
      });
      reused += 1;
      return;
    }
    await putCachedPhoto({
      id: originalId,
      blob: file.blob,
      thumbBlob: file.thumbBlob || file.blob,
      fullBlobVerified: true,
      fileName: file.meta?.fileName || `${originalId}.jpg`,
      type: file.blob.type || file.meta?.type || "image/jpeg",
      size: file.blob.size,
      width: file.meta?.width || photo.width || 0,
      height: file.meta?.height || photo.height || 0,
      createdAt: photo.createdAt || nowIso(),
      updatedAt: nowIso()
    });
    Object.assign(photo, {
      id: originalId,
      localId: originalId,
      status: "pending",
      url: "",
      thumbUrl: "",
      error: ""
    });
    queued += 1;
  };
  for (const entity of [...Object.values(targetState.items || {}), ...Object.values(targetState.containers || {})]) {
    for (const photo of normalizePhotos(entity)) {
      await rewrite(photo);
    }
  }
  return { reused, queued, missing };
}
