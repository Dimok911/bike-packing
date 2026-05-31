export function publishedPhotoUploadRequest(layout, {
  demoAdminPathForPublicListId = () => "",
  publicListIdForPublishedTarget = () => "",
  publishedLayoutTarget = () => null,
  uiLanguage = ""
} = {}) {
  const target = publishedLayoutTarget(layout);
  if (!target) return null;
  const listId = publicListIdForPublishedTarget(target);
  const path = target.type === "demo"
    ? demoAdminPathForPublicListId("/photos", target.demoListId || "", target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId || "")}/photos`;
  if (!path || !listId) return null;
  return { listId, path, target };
}
