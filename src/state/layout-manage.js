import { createEmptyLayoutArrangement, uniqueLayoutIds } from "./layout-arrangement.js";
import { clonePlain } from "../utils/json.js";

export function layoutManageLanguage(layout, fallbackLanguage = "ru") {
  return String(layout?.adminDemoLanguage || layout?.language || fallbackLanguage || "ru");
}

export function applyLayoutManageLanguage(layout, language) {
  if (!layout || !language) return false;
  let changed = false;
  if (layout.adminDemo && layout.adminDemoLanguage !== language) {
    layout.adminDemoLanguage = language;
    changed = true;
  }
  if (layout.language !== language) {
    layout.language = language;
    changed = true;
  }
  return changed;
}

export function shouldPreserveManagedTemplateName(layout) {
  return Boolean(layout?.adminDemo || layout?.adminSharedSourceId);
}

export function editedLayoutName(layout, requestedName, uniqueNameForLayout) {
  const name = String(requestedName || "").trim();
  if (!name) return "";
  if (shouldPreserveManagedTemplateName(layout)) return name;
  return uniqueNameForLayout ? uniqueNameForLayout(name) : name;
}

export function adminTemplateDraftChoice(layoutId) {
  return layoutId ? `template-draft:${layoutId}` : "";
}

export function templateDraftLayoutId(choice) {
  const value = String(choice || "");
  return value.startsWith("template-draft:") ? value.slice("template-draft:".length) : "";
}

export function publicLayoutChoiceValue(layout, {
  demoChoiceForLanguage,
  fallbackLanguage = "ru"
} = {}) {
  if (!layout) return "";
  if (layout.adminTemplateCopy) return adminTemplateDraftChoice(layout.id);
  if (layout.adminDemo) {
    return demoChoiceForLanguage ? demoChoiceForLanguage(layout.adminDemoLanguage || fallbackLanguage) : "";
  }
  if (layout.adminSharedSourceId) return `shared:${layout.adminSharedSourceId}`;
  return "";
}

export function managedSharedDraftLanguage(layout, sourceLayout, fallbackLanguage = "ru") {
  if (!layout?.adminSharedSourceId) return fallbackLanguage;
  if (layout.adminTemplateCopy) return layout.language || fallbackLanguage;
  return sourceLayout?.language || layout.language || fallbackLanguage;
}

export function shouldCreatePublishedTemplateBeforePhotos(layout, existingPublishedLayout = null) {
  return Boolean(layout?.adminTemplateCopy && layout?.adminSharedSourceId && !existingPublishedLayout);
}

export function withoutPhotoReferences(payload) {
  const copy = clonePlain(payload || {});
  Object.values(copy.items || {}).forEach((item) => {
    if (item && typeof item === "object") item.photos = [];
  });
  Object.values(copy.containers || {}).forEach((container) => {
    if (container && typeof container === "object") container.photos = [];
  });
  return copy;
}

export function isManagedPublicLayout(layout) {
  return Boolean(layout?.adminDemo || layout?.adminSharedSourceId || layout?.publicCatalogLayoutId);
}

export function isDisposableManagedPublicDraft(layout) {
  return Boolean(isManagedPublicLayout(layout) && !layout?.adminTemplateCopy);
}

export function collectManagedPublicDraftRecords(sourceState) {
  const draftLayouts = Object.values(sourceState?.layouts || {})
    .filter(isManagedPublicLayout)
    .filter((layout) => layout?.id);
  if (!draftLayouts.length) return null;
  const containerIds = new Set();
  const itemIds = new Set();
  const collectContainer = (containerId) => {
    if (!containerId || containerIds.has(containerId)) return;
    const container = sourceState.containers?.[containerId];
    if (!container) return;
    containerIds.add(containerId);
    (container.itemIds || []).forEach((itemId) => {
      if (sourceState.items?.[itemId]) itemIds.add(itemId);
    });
    (container.childIds || []).forEach(collectContainer);
  };

  draftLayouts.forEach((layout) => {
    uniqueLayoutIds([
      ...(layout.rootContainerIds || []),
      ...(layout.arrangement?.rootContainerIds || []),
      ...Object.keys(layout.arrangement?.containers || {})
    ]).forEach(collectContainer);
    Object.keys(layout.arrangement?.items || {}).forEach((itemId) => {
      if (sourceState.items?.[itemId]) itemIds.add(itemId);
    });
  });

  return {
    layouts: Object.fromEntries(draftLayouts.map((layout) => [layout.id, clonePlain(layout)])),
    containers: Object.fromEntries([...containerIds]
      .map((containerId) => [containerId, sourceState.containers?.[containerId]])
      .filter(([, container]) => container)
      .map(([containerId, container]) => [containerId, clonePlain(container)])),
    items: Object.fromEntries([...itemIds]
      .map((itemId) => [itemId, sourceState.items?.[itemId]])
      .filter(([, item]) => item)
      .map(([itemId, item]) => [itemId, clonePlain(item)]))
  };
}

export function mergeManagedPublicDraftRecords(targetState, draftRecords) {
  if (!targetState || !draftRecords) return false;
  const hasDrafts = Object.keys(draftRecords.layouts || {}).length > 0;
  if (!hasDrafts) return false;
  targetState.layouts = { ...(targetState.layouts || {}), ...(draftRecords.layouts || {}) };
  targetState.containers = { ...(targetState.containers || {}), ...(draftRecords.containers || {}) };
  targetState.items = { ...(targetState.items || {}), ...(draftRecords.items || {}) };
  return true;
}

export function createManagedLayoutCopyRecord({
  id,
  name,
  sourceLayout,
  arrangement,
  dictionaries = {},
  meta = {},
  guestDemoCopyFlag = "",
  guestDemoCopy = false,
  language = "",
  publicTemplate = false
} = {}) {
  const copiedArrangement = clonePlain(arrangement || sourceLayout?.arrangement || createEmptyLayoutArrangement());
  const record = {
    id,
    name,
    rootContainerIds: [...(copiedArrangement.rootContainerIds || [])],
    arrangement: copiedArrangement,
    locations: [...(dictionaries.locations || [])],
    categories: [...(dictionaries.categories || [])],
    ...meta
  };
  if (guestDemoCopyFlag && guestDemoCopy) record[guestDemoCopyFlag] = true;
  if (publicTemplate && sourceLayout?.adminDemo) {
    record.adminDemo = true;
    record.adminDemoLanguage = language || layoutManageLanguage(sourceLayout);
    record.language = record.adminDemoLanguage;
  }
  if (publicTemplate && sourceLayout?.adminSharedSourceId) {
    record.adminSharedSourceId = sourceLayout.adminSharedSourceId;
    if (language || sourceLayout.language) record.language = language || sourceLayout.language;
  }
  return record;
}

export function templateCopySourceRootIds(sourceLayout) {
  return uniqueLayoutIds([
    ...(sourceLayout?.arrangement?.rootContainerIds || []),
    ...(sourceLayout?.rootContainerIds || [])
  ]);
}

export function createTemplateCopyRecord({
  id,
  name,
  sourceLayout,
  arrangement,
  dictionaries = {},
  meta = {},
  language = "",
  sharedSourceId = ""
} = {}) {
  const record = createManagedLayoutCopyRecord({
    id,
    name,
    sourceLayout,
    arrangement,
    dictionaries,
    meta,
    language,
    publicTemplate: false
  });
  record.adminSharedSourceId = sharedSourceId || templateCopySharedSourceId({ language });
  record.adminTemplateCopy = true;
  if (language || sourceLayout?.language) record.language = language || sourceLayout.language;
  return record;
}

export function templateCopySharedSourceId({ language = "", takenIds = [] } = {}) {
  const normalizedLanguage = String(language || "template").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "template";
  const taken = new Set(takenIds.map((id) => String(id || "")));
  let id = "";
  do {
    id = `template-copy-${normalizedLanguage}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } while (taken.has(id));
  return id;
}
