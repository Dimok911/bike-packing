import {
  adoptTemplateCopySharedSourceId,
  createHydratedTemplateCopyDraftRecord,
  isTemplateCopySharedId,
  shouldHydrateTemplateCopyDraftFromPublished
} from "../state/layout-manage.js";
import { clonePlain } from "../utils/json.js";

export function repairEmptyTemplateCopyDraftFromPublishedLayout({
  state,
  sharedLayout,
  editableLayout,
  fallbackLanguage = "ru",
  canRepair = false,
  isLayoutMeaningful = () => false,
  sharedLayoutStatePayload = () => null,
  sharedPayloadActiveLayout = () => null,
  templateCopySourceScore = () => 0,
  removeLayoutTree = () => false,
  copyPublishedContainerToState = () => "",
  createLayoutArrangementFromCurrentState = () => null,
  normalizeLayoutArrangement = () => {},
  ensureLayoutDictionaries = () => null,
  currentMeta = {},
  nowIso = () => ""
} = {}) {
  if (!canRepair || !state || !sharedLayout || !editableLayout?.adminTemplateCopy) return null;
  const sourceState = sharedLayoutStatePayload(sharedLayout);
  const sourceLayout = sharedPayloadActiveLayout(sourceState);
  const publishedScore = sourceLayout ? templateCopySourceScore(sourceLayout, sourceState) : 0;
  if (!shouldHydrateTemplateCopyDraftFromPublished({
    draftLayout: editableLayout,
    sharedLayout,
    draftMeaningful: isLayoutMeaningful(editableLayout.id),
    publishedScore
  })) {
    return null;
  }

  const previous = clonePlain(editableLayout);
  const layoutId = previous.id;
  const wasActive = state.activeLayoutId === layoutId;
  removeLayoutTree(layoutId, state, { save: false });

  const changedAt = nowIso();
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = (sourceLayout.rootContainerIds || [])
    .map((id) =>
      copyPublishedContainerToState(sourceState, id, {
        targetLayoutId: "",
        changedAt,
        idMap,
        preserveSource: true,
        sourceLayoutId: sourceLayout.id
      })
    )
    .filter(Boolean);

  if (!rootContainerIds.length) {
    state.layouts[layoutId] = previous;
    if (wasActive) state.activeLayoutId = layoutId;
    return null;
  }

  const arrangement = createLayoutArrangementFromCurrentState(state, rootContainerIds);
  const dictionaries = ensureLayoutDictionaries(sourceLayout, sourceState);
  const repaired = createHydratedTemplateCopyDraftRecord({
    previousLayout: previous,
    sharedLayout,
    sourceLayout,
    rootContainerIds,
    arrangement,
    dictionaries,
    changedAt,
    currentMeta,
    fallbackLanguage
  });
  if (!repaired) return null;
  state.layouts[layoutId] = repaired;
  normalizeLayoutArrangement(repaired, state);
  if (wasActive) state.activeLayoutId = layoutId;
  return repaired;
}

export function reconcilePublishedTemplateCopyDraft({
  state,
  sharedLayout,
  fallbackLanguage = "ru",
  canRepair = false,
  repairDraft = repairEmptyTemplateCopyDraftFromPublishedLayout,
  ...repairDeps
} = {}) {
  if (!canRepair || !state || !sharedLayout || !isTemplateCopySharedId(sharedLayout.id)) return false;
  const adopted = adoptTemplateCopySharedSourceId(state, sharedLayout, fallbackLanguage);
  const draft = Object.values(state.layouts || {}).find((layout) =>
    layout?.adminTemplateCopy && layout.adminSharedSourceId === sharedLayout.id
  );
  const repaired = draft ? repairDraft({
    state,
    sharedLayout,
    editableLayout: draft,
    fallbackLanguage,
    canRepair,
    ...repairDeps
  }) : null;
  return Boolean(adopted || repaired);
}
