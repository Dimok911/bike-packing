import { containerTreeSnapshotScore } from "../state/container-tree-snapshot.js";

export const TEMPLATE_COPY_TITLE = "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0432 \u0441\u0432\u043e\u044e \u0443\u043a\u043b\u0430\u0434\u043a\u0443";
export const TEMPLATE_COPY_ICON_HTML = '<span aria-hidden="true">\u29c9</span>';

export const SHARED_ITEM_COPY_PICKER_MODE = "shared-item-copy";
export const SHARED_CONTAINER_COPY_PICKER_MODE = "shared-container-copy";

export function isContainerPickerCopyMode(mode) {
  return ["item-copy", "container-copy", SHARED_ITEM_COPY_PICKER_MODE, SHARED_CONTAINER_COPY_PICKER_MODE].includes(mode);
}

export function isContainerPickerItemCopyMode(mode) {
  return mode === "item-copy" || mode === SHARED_ITEM_COPY_PICKER_MODE;
}

export function isContainerPickerContainerCopyMode(mode) {
  return mode === "container-copy" || mode === SHARED_CONTAINER_COPY_PICKER_MODE;
}

export function containerCopyExcludedLayoutIds({
  mode = "",
  readonlyLayoutId = "",
  sourceLayoutId = ""
} = {}) {
  const ids = new Set();
  if (mode === SHARED_ITEM_COPY_PICKER_MODE || mode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    if (sourceLayoutId) ids.add(sourceLayoutId);
    if (readonlyLayoutId) ids.add(readonlyLayoutId);
  }
  if (isContainerPickerContainerCopyMode(mode) && sourceLayoutId) {
    ids.add(sourceLayoutId);
  }
  return ids;
}

export function collapsedDefaultsForTemplateContainers(containers, previous = {}, rootContainerIds = []) {
  const rootIds = new Set(rootContainerIds);
  const defaults = Object.fromEntries(Object.keys(containers || {}).map((id) => [id, !rootIds.has(id)]));
  rootIds.forEach((id) => {
    defaults[id] = false;
  });
  return {
    ...defaults,
    ...previous
  };
}

export function shouldShowTemplateAddButton(isReadonlyTemplate) {
  return !isReadonlyTemplate;
}

export function templateCopyRootSnapshots(sourceLayout, sourceState, {
  snapshotContainerTree,
  templateCopySourceRootIds
} = {}) {
  if (!sourceLayout || !sourceState || typeof snapshotContainerTree !== "function" || typeof templateCopySourceRootIds !== "function") return [];
  return templateCopySourceRootIds(sourceLayout)
    .map((rootId) => snapshotContainerTree(rootId, { sourceLayoutId: sourceLayout.id, targetState: sourceState }))
    .filter(Boolean);
}

export function templateCopySourceScore(sourceLayout, sourceState, {
  snapshotContainerTree,
  templateCopySourceRootIds,
  snapshotScore = containerTreeSnapshotScore
} = {}) {
  return templateCopyRootSnapshots(sourceLayout, sourceState, { snapshotContainerTree, templateCopySourceRootIds })
    .reduce((sum, snapshot) => sum + snapshotScore(snapshot), 0);
}

export async function loadPublishedTemplateCopySource(sourceLayout, {
  demoSharedLayoutId = "",
  fetchStateRecordByItemKey = async () => null,
  findSharedLayout = () => null,
  isManagedDemoTemplateLayout = () => false,
  loadPublishedDemoState = async () => null,
  loadSharedLayoutPayload = async () => false,
  normalizeUiLanguage = (value) => value,
  publishedPayloadWithTemplateMetadata = (payload) => payload,
  sharedLayoutItemKey = (id) => id,
  sharedLayoutLanguageFromPayload = () => "",
  sharedLayoutStatePayload = () => null,
  sharedLayoutsByLanguage = null,
  sharedPayloadActiveLayout = () => null,
  templateCopySourceScore = () => 0,
  uiLanguage = "",
  upsertRuntimeSharedLayout = () => {}
} = {}) {
  if (!sourceLayout) return null;
  if (isManagedDemoTemplateLayout(sourceLayout, demoSharedLayoutId)) {
    const demoLanguage = normalizeUiLanguage(sourceLayout.adminDemoLanguage || sourceLayout.language || uiLanguage);
    const payload = await loadPublishedDemoState(demoLanguage, sourceLayout.adminDemoListId || "").catch(() => null);
    const layout = sharedPayloadActiveLayout(payload);
    if (!payload || !layout) return null;
    return { state: payload, layout, score: templateCopySourceScore(layout, payload) };
  }
  if (!sourceLayout.adminSharedSourceId) return null;
  const sharedId = sourceLayout.adminSharedSourceId;
  let payload = null;
  const sharedLayout = findSharedLayout(sharedId);
  if (sharedLayout) {
    await loadSharedLayoutPayload(sharedId).catch(() => false);
    payload = sharedLayoutStatePayload(findSharedLayout(sharedId) || sharedLayout);
  }
  if (!payload) {
    payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId)).catch(() => null);
  }
  payload = publishedPayloadWithTemplateMetadata(payload, {
    name: sharedLayout?.name,
    language: sharedLayout?.language || sourceLayout.language || uiLanguage
  });
  const layout = sharedPayloadActiveLayout(payload);
  if (!payload || !layout) return null;
  upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
    id: sharedId,
    name: sharedLayout?.name || layout.name || sharedId,
    language: sharedLayoutLanguageFromPayload(payload, sourceLayout.language || uiLanguage),
    statePayload: payload,
    runtimeSharedTemplate: true
  });
  return { state: payload, layout, score: templateCopySourceScore(layout, payload) };
}

export function templateCopyLanguage({ language = "", copySourceLayout = null, sourceLayout = null, uiLanguage = "", normalizeUiLanguage = (value) => value } = {}) {
  return normalizeUiLanguage(language || copySourceLayout?.adminDemoLanguage || copySourceLayout?.language || sourceLayout?.language || uiLanguage);
}

export function isDemoTemplateCopySource(sourceLayout, copySourceLayout) {
  return Boolean(sourceLayout?.adminDemo || copySourceLayout?.adminDemo);
}

export function demoTemplateCopyTakenListIds(serverConfirmedDemoTemplates = [], layouts = {}) {
  return [
    ...serverConfirmedDemoTemplates.map((entry) => entry?.listId || entry?.id),
    ...Object.values(layouts || {}).map((entry) => entry?.adminDemoListId)
  ].filter(Boolean);
}

export function createTemplateCopyLayoutRecord({
  arrangement = null,
  changedAt = "",
  copySourceLayout = null,
  createDemoTemplateCopyRecord = null,
  createDemoTemplateListId = null,
  createEmptyLayoutArrangement = null,
  createEmptyPublicTemplateDraftRecord = null,
  createTemplateCopyRecord = null,
  currentCreateMeta = () => ({}),
  currentState = null,
  ensureLayoutDictionaries = () => null,
  ensurePrivateDictionaries = () => null,
  id = "",
  language = "",
  normalizeUiLanguage = (value) => value,
  requestedName = "",
  rootSnapshots = [],
  serverConfirmedDemoTemplates = [],
  sourceLayout = null,
  sourceState = null,
  uiLanguage = "",
  uniquePublishedTemplateName = (value) => value
} = {}) {
  if (!id || !requestedName || !sourceLayout || !copySourceLayout) return null;
  const dictionaries = sourceState === currentState
    ? ensureLayoutDictionaries(copySourceLayout)
    : ensureLayoutDictionaries(copySourceLayout, sourceState);
  const copyLanguage = templateCopyLanguage({ language, copySourceLayout, sourceLayout, uiLanguage, normalizeUiLanguage });
  const isDemoTemplateCopy = isDemoTemplateCopySource(sourceLayout, copySourceLayout);
  const demoListId = isDemoTemplateCopy && typeof createDemoTemplateListId === "function"
    ? createDemoTemplateListId({
      language: copyLanguage,
      takenListIds: demoTemplateCopyTakenListIds(serverConfirmedDemoTemplates, currentState?.layouts)
    })
    : "";
  const common = {
    id,
    name: uniquePublishedTemplateName(requestedName),
    dictionaries: dictionaries || ensurePrivateDictionaries(currentState),
    meta: currentCreateMeta(changedAt)
  };
  if (!rootSnapshots.length) {
    if (typeof createEmptyPublicTemplateDraftRecord !== "function" || typeof createEmptyLayoutArrangement !== "function") return null;
    return createEmptyPublicTemplateDraftRecord({
      ...common,
      kind: isDemoTemplateCopy ? "demo" : "shared",
      language: copyLanguage,
      arrangement: createEmptyLayoutArrangement(),
      demoListId
    });
  }
  if (isDemoTemplateCopy) {
    if (typeof createDemoTemplateCopyRecord !== "function") return null;
    return createDemoTemplateCopyRecord({
      ...common,
      sourceLayout: copySourceLayout,
      arrangement,
      language: copyLanguage,
      demoListId
    });
  }
  if (typeof createTemplateCopyRecord !== "function") return null;
  return createTemplateCopyRecord({
    ...common,
    sourceLayout: copySourceLayout,
    arrangement,
    language: copyLanguage
  });
}

export async function resolveLayoutCreateTemplateCopySource(choice, {
  canOpenAdminPublishedEdit = () => false,
  demoLanguageFromLayoutChoice = () => "",
  demoPublicListIdForLanguage = () => "",
  demoTemplateFallbackName = () => "",
  demoTemplateForLanguage = () => null,
  demoTemplateIdFromLayoutChoice = () => "",
  findSharedLayout = () => null,
  isDemoLayoutChoice = () => false,
  loadPublishedDemoState = async () => null,
  loadSharedLayoutPayload = async () => false,
  normalizeDemoPayloadForLanguage = (payload) => payload,
  normalizePublishedStatePayload = (payload) => payload,
  serverConfirmedDemoTemplates = [],
  sharedLayoutStatePayload = () => null,
  sharedPayloadActiveLayout = () => null,
  state = null,
  templateDraftLayoutId = () => ""
} = {}) {
  if (!canOpenAdminPublishedEdit()) return null;
  const value = String(choice || "").trim();
  const draftId = templateDraftLayoutId(value);
  if (draftId) {
    const layout = state?.layouts?.[draftId] || null;
    return layout ? {
      sourceState: state,
      sourceLayout: layout,
      templateName: layout.name || "",
      sourceId: layout.adminDemoListId || layout.adminSharedSourceId || layout.id
    } : null;
  }
  if (isDemoLayoutChoice(value)) {
    const language = demoLanguageFromLayoutChoice(value);
    const templateId = demoTemplateIdFromLayoutChoice(value);
    const payload = normalizeDemoPayloadForLanguage(
      normalizePublishedStatePayload(await loadPublishedDemoState(language, templateId)),
      language
    );
    const sourceLayout = sharedPayloadActiveLayout(payload);
    if (!payload || !sourceLayout) return null;
    const template = demoTemplateForLanguage(serverConfirmedDemoTemplates, language, { listId: templateId });
    return {
      sourceState: payload,
      sourceLayout,
      templateName: template?.name || sourceLayout.name || demoTemplateFallbackName(language),
      sourceId: template?.listId || templateId || demoPublicListIdForLanguage(language)
    };
  }
  if (value.startsWith("shared:")) {
    const sharedId = value.slice("shared:".length);
    const sharedLayout = findSharedLayout(sharedId);
    await loadSharedLayoutPayload(sharedId).catch(() => false);
    const loadedSharedLayout = findSharedLayout(sharedId) || sharedLayout;
    const payload = sharedLayoutStatePayload(loadedSharedLayout);
    const sourceLayout = sharedPayloadActiveLayout(payload);
    if (!payload || !sourceLayout) return null;
    return {
      sourceState: payload,
      sourceLayout,
      templateName: loadedSharedLayout?.name || sourceLayout.name || sharedId,
      sourceId: sharedId
    };
  }
  return null;
}

export async function resolveLayoutCreateTemplateCopyLayout(choice, {
  canOpenAdminPublishedEdit = () => false,
  demoLanguageFromLayoutChoice = () => "",
  demoTemplateIdFromLayoutChoice = () => "",
  isAdminEditablePublishedLayout = () => false,
  isDemoLayoutChoice = () => false,
  loadSharedLayoutPayload = async () => false,
  materializeDemoLayoutForAdminCopy = async () => null,
  materializeSharedLayoutForAdmin = async () => null,
  state = null,
  templateDraftLayoutId = () => ""
} = {}) {
  if (!canOpenAdminPublishedEdit()) return null;
  const value = String(choice || "").trim();
  const draftId = templateDraftLayoutId(value);
  if (draftId) {
    const layout = state?.layouts?.[draftId] || null;
    return layout && isAdminEditablePublishedLayout(layout.id) ? layout : null;
  }
  if (isDemoLayoutChoice(value)) {
    return await materializeDemoLayoutForAdminCopy(
      demoLanguageFromLayoutChoice(value),
      demoTemplateIdFromLayoutChoice(value)
    );
  }
  if (value.startsWith("shared:")) {
    const sharedId = value.slice("shared:".length);
    await loadSharedLayoutPayload(sharedId).catch(() => false);
    return materializeSharedLayoutForAdmin(sharedId);
  }
  const layout = state?.layouts?.[value] || null;
  return layout && isAdminEditablePublishedLayout(layout.id) ? layout : null;
}

export function createPrivateLayoutFromTemplateSourceRecord({
  arrangement = null,
  canUsePrivateState = () => true,
  changedAt = "",
  createManagedLayoutCopyRecord = null,
  currentCreateMeta = () => ({}),
  currentState = null,
  ensureLayoutDictionaries = () => null,
  ensurePrivateDictionaries = () => null,
  guestDemoCopyFlag = "",
  id = "",
  requestedName = "",
  rootContainerIds = [],
  source = null,
  uniqueLayoutName = (value) => value
} = {}) {
  if (!id || !source?.sourceLayout || !source?.sourceState || !requestedName || typeof createManagedLayoutCopyRecord !== "function") return null;
  const sourceLayout = source.sourceLayout;
  const sourceState = source.sourceState;
  const dictionaries = ensureLayoutDictionaries(sourceLayout, sourceState) || ensurePrivateDictionaries(currentState);
  const layout = createManagedLayoutCopyRecord({
    id,
    name: uniqueLayoutName(requestedName),
    sourceLayout,
    arrangement,
    dictionaries,
    meta: currentCreateMeta(changedAt),
    guestDemoCopyFlag,
    guestDemoCopy: !canUsePrivateState(),
    publicTemplate: false
  });
  layout.rootContainerIds = rootContainerIds;
  layout.arrangement = arrangement;
  return layout;
}

export function createNewPublicTemplateDraftRecord({
  createDemoTemplateListId = null,
  createEmptyLayoutArrangement = null,
  createEmptyPublicTemplateDraftRecord = null,
  currentCreateMeta = () => ({}),
  dictionaries = null,
  id = "",
  kind = "demo",
  language = "",
  normalizeDemoLayoutName = (name) => name,
  requestedName = "",
  serverConfirmedDemoTemplates = [],
  state = null,
  timestamp = "",
  uniquePublishedTemplateName = (value) => value
} = {}) {
  if (!id || !requestedName || typeof createEmptyPublicTemplateDraftRecord !== "function" || typeof createEmptyLayoutArrangement !== "function") return null;
  const isDemo = kind === "demo";
  const name = isDemo
    ? normalizeDemoLayoutName(uniquePublishedTemplateName(requestedName), language)
    : uniquePublishedTemplateName(requestedName);
  return createEmptyPublicTemplateDraftRecord({
    id,
    name,
    kind,
    language,
    arrangement: createEmptyLayoutArrangement(),
    dictionaries,
    meta: currentCreateMeta(timestamp),
    demoListId: isDemo && typeof createDemoTemplateListId === "function"
      ? createDemoTemplateListId({
        language,
        takenListIds: demoTemplateCopyTakenListIds(serverConfirmedDemoTemplates, state?.layouts)
      })
      : ""
  });
}

export function assertPublishedTemplateCopyConfirmed(layout, {
  serverConfirmedDemoTemplates = [],
  serverConfirmedSharedLayouts = []
} = {}) {
  if (layout?.adminDemo) {
    const confirmedDemoId = layout.adminDemoListId || "";
    if (!confirmedDemoId || !serverConfirmedDemoTemplates.some((entry) => (entry?.listId || entry?.id) === confirmedDemoId)) {
      throw new Error("Сервер не подтвердил копию demo-шаблона.");
    }
    return true;
  }
  const confirmedSharedId = layout?.adminSharedSourceId || "";
  if (!confirmedSharedId || !serverConfirmedSharedLayouts.some((entry) => entry?.id === confirmedSharedId)) {
    throw new Error("Сервер не подтвердил копию шаблона.");
  }
  return true;
}
