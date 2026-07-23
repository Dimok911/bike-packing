import { clonePlain } from "../utils/json.js";

function normalizedLanguage(value) {
  return String(value || "ru").trim().toLowerCase() || "ru";
}

function templatePayload(entry) {
  return entry?.payload || entry?.statePayload || null;
}

export function backupAdminTemplateRows(manifest, {
  demoPublicListIdForLanguage = (language) => `public-demo-state-${language}`
} = {}) {
  const admin = manifest?.data?.admin;
  if (!admin) return [];
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    if (!row?.payload || !row.key || seen.has(row.key)) return;
    seen.add(row.key);
    rows.push(row);
  };

  (Array.isArray(admin.demoTemplates) ? admin.demoTemplates : []).forEach((entry) => {
    const language = normalizedLanguage(entry?.language);
    const listId = String(entry?.listId || entry?.id || demoPublicListIdForLanguage(language)).trim();
    add({
      key: `demo:${listId}`,
      type: "demo",
      id: listId,
      listId,
      language,
      name: String(entry?.name || templatePayload(entry)?.layouts?.[templatePayload(entry)?.activeLayoutId]?.name || `Demo ${language}`).trim(),
      description: String(entry?.description || ""),
      payload: templatePayload(entry)
    });
  });

  if (!rows.some((row) => row.type === "demo")) {
    (Array.isArray(admin.demoStates) ? admin.demoStates : []).forEach((entry) => {
      const language = normalizedLanguage(entry?.language);
      const listId = String(entry?.listId || demoPublicListIdForLanguage(language)).trim();
      const payload = templatePayload(entry);
      add({
        key: `demo:${listId}`,
        type: "demo",
        id: listId,
        listId,
        language,
        name: String(entry?.name || payload?.layouts?.[payload?.activeLayoutId]?.name || `Demo ${language}`).trim(),
        description: String(entry?.description || ""),
        payload
      });
    });
  }

  (Array.isArray(admin.sharedLayouts) ? admin.sharedLayouts : []).forEach((group) => {
    const groupLanguage = normalizedLanguage(group?.language);
    (Array.isArray(group?.layouts) ? group.layouts : []).forEach((entry) => {
      const id = String(entry?.id || entry?.sharedId || "").trim();
      if (!id) return;
      add({
        key: `shared:${id}`,
        type: "shared",
        id,
        sharedId: id,
        language: normalizedLanguage(entry?.language || groupLanguage),
        name: String(entry?.name || id).trim(),
        description: String(entry?.description || entry?.note || ""),
        payload: templatePayload(entry)
      });
    });
  });

  return rows.sort((left, right) =>
    left.type.localeCompare(right.type) ||
    left.language.localeCompare(right.language) ||
    left.name.localeCompare(right.name)
  );
}

export function selectedBackupAdminTemplateKeys(analysisElement) {
  if (!analysisElement) return new Set();
  return new Set([...analysisElement.querySelectorAll("[data-backup-admin-template-key]:checked")]
    .map((input) => input.dataset.backupAdminTemplateKey)
    .filter(Boolean));
}

export function backupRestoreComposition(backupState, personalRows = [], adminRows = []) {
  const rawLayoutCount = Object.keys(backupState?.layouts || {}).length;
  const personalLayoutCount = personalRows.length;
  const publicTemplateCount = adminRows.length;
  return {
    rawLayoutCount,
    personalLayoutCount,
    publicTemplateCount,
    demoTemplateCount: adminRows.filter((row) => row.type === "demo").length,
    sharedTemplateCount: adminRows.filter((row) => row.type === "shared").length,
    technicalDraftCount: Math.max(0, rawLayoutCount - personalLayoutCount),
    logicalRestoreCount: personalLayoutCount + publicTemplateCount
  };
}

async function cacheArchivedPhoto(photoId, file, putCachedPhoto) {
  await putCachedPhoto({
    id: photoId,
    blob: file.blob,
    thumbBlob: file.thumbBlob || file.blob,
    fullBlobVerified: true,
    fileName: file.meta?.fileName || `${photoId}.jpg`,
    type: file.blob.type || file.meta?.type || "image/jpeg",
    size: file.blob.size,
    width: file.meta?.width || 0,
    height: file.meta?.height || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

async function uploadArchivedTemplatePhotos(payload, {
  getCachedPhoto,
  listId,
  localText = (en, ru) => ru,
  normalizePhotos,
  photoFiles,
  putCachedPhoto,
  onProgress = () => {},
  photoOffset = 0,
  totalPhotos = 0,
  uploadPath,
  uploadPhotoToPath,
  uploadDependencies
} = {}) {
  let uploaded = 0;
  let missing = 0;
  for (const [entityType, entities] of [["item", payload?.items], ["container", payload?.containers]]) {
    for (const entity of Object.values(entities || {})) {
      for (const photo of normalizePhotos(entity)) {
        const photoId = String(photo.id || photo.localId || "").trim();
        const file = photoId ? photoFiles?.get(photoId) : null;
        if (!photoId || !file?.blob) {
          missing += 1;
          continue;
        }
        await cacheArchivedPhoto(photoId, file, putCachedPhoto);
        Object.assign(photo, { id: photoId, localId: photoId, status: "pending", url: "", thumbUrl: "", error: "" });
        await uploadPhotoToPath({
          path: uploadPath,
          listId,
          entity,
          photo,
          entityType,
          onPhotoProgress: (_targetPhoto, percent) => onProgress({
            current: photoOffset + uploaded,
            total: totalPhotos,
            itemPercent: percent,
            photoId
          }),
          getCachedPhoto,
          markEntityChanged: () => {},
          persistStateSnapshot: () => {},
          scheduleProgressRender: () => {},
          ...uploadDependencies
        });
        if (photo.status !== "synced" || (!photo.url && !photo.thumbUrl)) {
          throw new Error(localText(
            `Could not restore photo ${photoId} for template “${entity.name || entity.id}”.`,
            `Не удалось восстановить фото ${photoId} шаблона «${entity.name || entity.id}».`
          ));
        }
        uploaded += 1;
        onProgress({ current: photoOffset + uploaded, total: totalPhotos, itemPercent: 100, photoId });
      }
    }
  }
  return { uploaded, missing };
}

export async function restoreBackupAdminTemplates({
  apiFetch,
  apiUploadFormData,
  demoAdminPathForPublicListId,
  demoAdminStatePathForPublicListId,
  getCachedPhoto,
  localText = (en, ru) => ru,
  normalizePhotos,
  onProgress = () => {},
  photoFiles,
  publicListIdForPublishedTarget,
  putCachedPhoto,
  rows = [],
  selectedKeys = new Set(),
  timeoutMs = 0,
  uploadPhotoToPath,
  withoutPhotoReferences = (payload) => payload
} = {}) {
  const selectedRows = rows.filter((row) => selectedKeys.has(row.key));
  const totalPhotos = selectedRows.reduce((sum, row) => sum + [row.payload?.items, row.payload?.containers]
    .flatMap((entities) => Object.values(entities || {}))
    .flatMap((entity) => normalizePhotos(clonePlain(entity)))
    .filter((photo) => photoFiles?.has(String(photo.id || photo.localId || "").trim())).length, 0);
  const restored = [];
  let photosCompleted = 0;
  onProgress({ stage: "templates", templatesCompleted: 0, totalTemplates: selectedRows.length, photosCompleted, totalPhotos });
  for (let index = 0; index < selectedRows.length; index += 1) {
    const sourceRow = selectedRows[index];
    const row = { ...sourceRow, payload: clonePlain(sourceRow.payload) };
    onProgress({
      stage: "template",
      templateName: row.name,
      templatesCompleted: index,
      totalTemplates: selectedRows.length,
      photosCompleted,
      totalPhotos
    });
    const target = row.type === "demo"
      ? { type: "demo", demoListId: row.listId, language: row.language }
      : { type: "shared", sharedId: row.sharedId };
    const listId = publicListIdForPublishedTarget(target);
    const statePath = row.type === "demo"
      ? demoAdminStatePathForPublicListId(row.listId, row.language)
      : `/bike-packing/admin/shared-layouts/${encodeURIComponent(row.sharedId)}/state`;
    const uploadPath = row.type === "demo"
      ? demoAdminPathForPublicListId("/photos", row.listId, row.language)
      : `/bike-packing/admin/shared-layouts/${encodeURIComponent(row.sharedId)}/photos`;
    const publish = (payload) => apiFetch(statePath, {
      method: "POST",
      timeoutMs,
      body: JSON.stringify({
        title: row.name,
        description: row.description,
        visibility: "public",
        listVisibility: "public",
        language: row.language,
        payload
      })
    });

    await publish(withoutPhotoReferences(row.payload));
    const photoResult = await uploadArchivedTemplatePhotos(row.payload, {
      getCachedPhoto,
      listId,
      localText,
      normalizePhotos,
      onProgress: ({ current, total, itemPercent, photoId }) => onProgress({
        stage: "photos",
        templateName: row.name,
        templatesCompleted: index,
        totalTemplates: selectedRows.length,
        photosCompleted: current,
        totalPhotos: total,
        itemPercent,
        photoId
      }),
      photoOffset: photosCompleted,
      photoFiles,
      putCachedPhoto,
      totalPhotos,
      uploadPath,
      uploadPhotoToPath,
      uploadDependencies: { apiFetch, apiUploadFormData }
    });
    photosCompleted += photoResult.uploaded;
    await publish(row.payload);
    restored.push({ ...row, ...photoResult });
    onProgress({
      stage: "templates",
      templateName: row.name,
      templatesCompleted: index + 1,
      totalTemplates: selectedRows.length,
      photosCompleted,
      totalPhotos
    });
  }
  return restored;
}
