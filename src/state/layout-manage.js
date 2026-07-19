import { createEmptyLayoutArrangement, uniqueLayoutIds } from "./layout-arrangement.js";
import { clonePlain } from "../utils/json.js";

function normalizeTemplateCopyIdentityValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function templateCopyNameLanguageKey(name, language = "ru") {
  const normalizedName = normalizeTemplateCopyIdentityValue(name);
  if (!normalizedName) return "";
  return `copy-name:${normalizeTemplateCopyIdentityValue(language || "ru")}:${normalizedName}`;
}

export function isTemplateCopySharedId(sharedId) {
  return String(sharedId || "").trim().startsWith("template-copy-");
}

export function adminSharedTemplateIdentityKeys({
  sharedId = "",
  name = "",
  language = "ru",
  adminTemplateCopy = false,
  runtimeSharedTemplate = false
} = {}) {
  const id = String(sharedId || "").trim();
  const keys = [];
  if (id) keys.push(`id:${id}`);
  if (adminTemplateCopy || runtimeSharedTemplate || isTemplateCopySharedId(id)) {
    const nameKey = templateCopyNameLanguageKey(name, language);
    if (nameKey) keys.push(nameKey);
  }
  return [...new Set(keys)];
}

function candidateKeys(candidate) {
  return new Set((candidate?.identityKeys || []).filter(Boolean));
}

function candidateUpdatedAtValue(candidate) {
  const value = Date.parse(candidate?.updatedAt || candidate?.layout?.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function compareTemplateCandidateWinner(a, b) {
  const priority = Number(b?.priority || 0) - Number(a?.priority || 0);
  if (priority) return priority;
  const score = Number(b?.contentScore || 0) - Number(a?.contentScore || 0);
  if (score) return score;
  const updated = candidateUpdatedAtValue(b) - candidateUpdatedAtValue(a);
  if (updated) return updated;
  return Number(a?.order || 0) - Number(b?.order || 0);
}

export function dedupeAdminSharedTemplateCandidates(candidates = []) {
  const groups = [];
  candidates.forEach((candidate) => {
    const keys = candidateKeys(candidate);
    if (!keys.size) return;
    const matching = groups.filter((group) => [...keys].some((key) => group.keys.has(key)));
    const nextGroup = matching[0] || { keys: new Set(), candidates: [] };
    matching.slice(1).forEach((group) => {
      group.keys.forEach((key) => nextGroup.keys.add(key));
      nextGroup.candidates.push(...group.candidates);
      const index = groups.indexOf(group);
      if (index >= 0) groups.splice(index, 1);
    });
    keys.forEach((key) => nextGroup.keys.add(key));
    nextGroup.candidates.push(candidate);
    if (!matching.length) groups.push(nextGroup);
  });
  return groups
    .map((group) => [...group.candidates].sort(compareTemplateCandidateWinner)[0])
    .filter(Boolean);
}

export function findAdoptableTemplateCopyDraft(layouts, sharedLayout, fallbackLanguage = "ru") {
  const sharedId = String(sharedLayout?.id || "").trim();
  if (!isTemplateCopySharedId(sharedId)) return null;
  const sharedName = normalizeTemplateCopyIdentityValue(sharedLayout?.name || "");
  if (!sharedName) return null;
  const sharedLanguage = normalizeTemplateCopyIdentityValue(sharedLayout?.language || fallbackLanguage || "ru");
  return Object.values(layouts || {}).find((layout) => {
    if (!layout?.adminTemplateCopy || !layout.adminSharedSourceId || layout.adminSharedSourceId === sharedId) return false;
    if (normalizeTemplateCopyIdentityValue(layout.name || "") !== sharedName) return false;
    return normalizeTemplateCopyIdentityValue(layout.language || fallbackLanguage || "ru") === sharedLanguage;
  }) || null;
}

export function adoptTemplateCopySharedSourceId(targetState, sharedLayout, fallbackLanguage = "ru") {
  const sharedId = String(sharedLayout?.id || "").trim();
  const draft = findAdoptableTemplateCopyDraft(targetState?.layouts, sharedLayout, fallbackLanguage);
  if (!draft) return null;
  const previousSharedSourceId = draft.adminSharedSourceId;
  draft.adminSharedSourceId = sharedId;
  if (sharedLayout?.language) draft.language = sharedLayout.language;
  return {
    layoutId: draft.id,
    previousSharedSourceId,
    sharedSourceId: sharedId
  };
}

export function shouldHydrateTemplateCopyDraftFromPublished({
  draftLayout,
  sharedLayout,
  draftMeaningful = false,
  publishedScore = 0
} = {}) {
  return Boolean(
    draftLayout?.adminTemplateCopy &&
    isTemplateCopySharedId(sharedLayout?.id) &&
    !draftMeaningful &&
    Number(publishedScore) > 1
  );
}

export function createHydratedTemplateCopyDraftRecord({
  previousLayout,
  sharedLayout,
  sourceLayout,
  rootContainerIds = [],
  arrangement = null,
  dictionaries = {},
  changedAt = "",
  currentMeta = {},
  fallbackLanguage = "ru"
} = {}) {
  if (!previousLayout?.id || !sharedLayout?.id || !sourceLayout || !rootContainerIds.length) return null;
  return {
    ...clonePlain(previousLayout),
    name: previousLayout.name || sourceLayout.name || sharedLayout.name || sharedLayout.id,
    rootContainerIds: [...rootContainerIds],
    arrangement: clonePlain(arrangement || sourceLayout.arrangement || createEmptyLayoutArrangement()),
    adminSharedSourceId: sharedLayout.id,
    adminTemplateCopy: true,
    language: sharedLayout.language || sourceLayout.language || previousLayout.language || fallbackLanguage || "ru",
    locations: [...(dictionaries.locations || previousLayout.locations || [])],
    categories: [...(dictionaries.categories || previousLayout.categories || [])],
    updatedAt: changedAt || currentMeta.updatedAt || previousLayout.updatedAt || "",
    updatedByDeviceId: currentMeta.updatedByDeviceId || previousLayout.updatedByDeviceId || "local-device",
    updatedByDeviceName: currentMeta.updatedByDeviceName || previousLayout.updatedByDeviceName || "local-device"
  };
}

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
  demoChoiceForLayout,
  fallbackLanguage = "ru"
} = {}) {
  if (!layout) return "";
  if (layout.adminTemplateCopy) return adminTemplateDraftChoice(layout.id);
  if (layout.adminDemo) {
    if (demoChoiceForLayout) return demoChoiceForLayout(layout);
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
  return Boolean(layout?.adminTemplateCopy && (layout?.adminDemo || layout?.adminSharedSourceId) && !existingPublishedLayout);
}

export function shouldCopyPublicTemplatePhotoReferencesOnServer(layout) {
  return Boolean(layout?.adminTemplateCopy && (layout?.adminDemo || layout?.adminSharedSourceId));
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

export function isManagedPublicTemplateDraft(layout) {
  return Boolean(layout?.adminDemo || layout?.adminTemplateCopy);
}

export function isManagedDemoTemplateLayout(layout, demoSharedLayoutId = "") {
  return Boolean(layout?.adminDemo || (demoSharedLayoutId && layout?.adminSharedSourceId === demoSharedLayoutId));
}

export function isDisposableManagedPublicDraft(layout) {
  return Boolean(isManagedPublicLayout(layout) && !isManagedPublicTemplateDraft(layout));
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

export function createDemoTemplateCopyRecord({
  id,
  name,
  sourceLayout,
  arrangement,
  dictionaries = {},
  meta = {},
  language = "",
  demoListId = ""
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
  const resolvedLanguage = language || layoutManageLanguage(sourceLayout);
  record.adminDemo = true;
  record.adminTemplateCopy = true;
  record.adminDemoLanguage = resolvedLanguage;
  record.language = resolvedLanguage;
  if (demoListId) record.adminDemoListId = demoListId;
  return record;
}

export function createEmptyPublicTemplateDraftRecord({
  id,
  name,
  kind = "shared",
  language = "ru",
  arrangement = createEmptyLayoutArrangement(),
  dictionaries = {},
  meta = {},
  demoListId = "",
  sharedSourceId = ""
} = {}) {
  const sourceLayout = {
    id: `${kind || "template"}-blank-source`,
    name,
    rootContainerIds: [],
    arrangement
  };
  return kind === "demo"
    ? createDemoTemplateCopyRecord({
      id,
      name,
      sourceLayout,
      arrangement,
      dictionaries,
      meta,
      language,
      demoListId
    })
    : createTemplateCopyRecord({
      id,
      name,
      sourceLayout,
      arrangement,
      dictionaries,
      meta,
      language,
      sharedSourceId
    });
}

export function createLayoutCopyRecordFromSource({
  canUsePrivateState = () => true,
  changedAt = "",
  createLayoutArrangementFromCurrentState = null,
  currentCreateMeta = () => ({}),
  ensureLayoutDictionaries = () => null,
  ensurePrivateDictionaries = () => null,
  guestDemoCopyFlag = "",
  id = "",
  language = "",
  publicTemplate = false,
  requestedName = "",
  sourceLayout = null,
  state = null,
  uniqueLayoutName = (value) => value
} = {}) {
  if (!sourceLayout || !requestedName || !id) return null;
  const sourceArrangement = sourceLayout.arrangement ||
    (typeof createLayoutArrangementFromCurrentState === "function"
      ? createLayoutArrangementFromCurrentState(state, sourceLayout.rootContainerIds || [])
      : createEmptyLayoutArrangement());
  const arrangement = clonePlain(sourceArrangement);
  const dictionaries = ensureLayoutDictionaries(sourceLayout) || ensurePrivateDictionaries(state);
  const record = createManagedLayoutCopyRecord({
    id,
    name: uniqueLayoutName(requestedName),
    sourceLayout,
    arrangement,
    dictionaries,
    meta: currentCreateMeta(changedAt),
    guestDemoCopyFlag,
    guestDemoCopy: !canUsePrivateState(),
    language,
    publicTemplate
  });
  record._historyCopySourceLayoutId = String(sourceLayout.id || "");
  record._historyCopySourceLayoutName = String(sourceLayout.name || "");
  return record;
}

export function applyLayoutEditFields(layout, {
  adminPublished = false,
  editedLayoutName = (targetLayout, name) => name,
  language = "",
  normalizeDemoLayoutName = (name) => name,
  normalizeUiLanguage = (value) => value,
  requestedName = "",
  uiLanguage = "",
  uniqueLayoutName = (value) => value
} = {}) {
  if (!layout || !requestedName) return false;
  let changed = false;
  const nextName = layout.adminDemo
    ? normalizeDemoLayoutName(requestedName, language || layoutManageLanguage(layout, uiLanguage))
    : requestedName;
  const savedName = editedLayoutName(layout, nextName, (name) => uniqueLayoutName(name, { exceptLayoutId: layout.id }));
  if (layout.name !== savedName) {
    layout.name = savedName;
    changed = true;
  }
  if (adminPublished) {
    const nextLanguage = normalizeUiLanguage(language || layoutManageLanguage(layout, uiLanguage));
    changed = applyLayoutManageLanguage(layout, nextLanguage) || changed;
  }
  return changed;
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
