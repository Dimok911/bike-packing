import {
  DEMO_SHARED_LAYOUT_ID,
  GUEST_DEMO_COPY_FLAG
} from "../config/constants.js";

function setScopedControlState(element, active, keepSpace) {
  if (!element) return;
  if (keepSpace) {
    element.hidden = false;
    element.classList.toggle("scoped-control-muted", !active);
    element.setAttribute("aria-disabled", String(!active));
    return;
  }
  element.classList.remove("scoped-control-muted");
  element.removeAttribute("aria-disabled");
  element.hidden = !active;
}

export function updateViewScopedControlsUi({
  document,
  isFilterContextActive = () => false,
  isSharedLayoutView = () => false,
  requestAnimationFrame = (callback) => callback(),
  refs,
  state,
  updateCompactStickyControls = () => {},
  updateLayoutCollapseAllToggle = () => {},
  updatePackingViewModeControl = () => {},
  view = ""
} = {}) {
  const sharedView = isSharedLayoutView();
  const filtersVisible = view === "packing" || view === "items" || view === "bags";
  const categoryVisible = view === "packing" || view === "items";
  document.querySelectorAll("[data-main-filter-control]").forEach((element) => {
    const isCollectionActions = element === refs.collectionActions;
    const isCategoryFilter = element === refs.categoryFilterLabel;
    const visible = isCollectionActions
      ? !sharedView && view === "packing" && state.collectionMode
      : isCategoryFilter
        ? categoryVisible
        : filtersVisible;
    const keepSpace = isCollectionActions
      ? !sharedView && state.collectionMode
      : true;
    setScopedControlState(element, visible, keepSpace);
  });
  setScopedControlState(refs.metaToggleBtn, view === "packing" || view === "items" || view === "bags", true);
  updatePackingViewModeControl(view);
  updateLayoutCollapseAllToggle();
  refs.summary.classList.toggle("scoped-control-muted", view === "settings");
  refs.summary.setAttribute("aria-disabled", String(view === "settings"));
  refs.filterNav.hidden = !filtersVisible || !isFilterContextActive();
  requestAnimationFrame(updateCompactStickyControls);
}

export function renderFilterControls({
  activeAdminDraftOptionLabel = () => "",
  activeDemoTemplateListId = "",
  activeReadOnlyLayoutId = () => "",
  adminPublicLayoutOptions = () => [],
  arePublishedTemplatesBlocked = () => false,
  canEditPublishedTemplatesNow = () => false,
  canManageActiveLayout = () => false,
  canOpenAdminPublishedEdit = () => false,
  canUsePrivateState = () => false,
  canViewAdminPublishedCatalog = () => false,
  currentSharedLayouts = () => [],
  demoCopyActionText = () => "",
  demoTemplateChoiceForEntry = () => "",
  demoTemplateChoiceForLanguage = () => "",
  demoTemplateFallbackName = () => "",
  demoTemplatesForUiLanguage = () => [],
  dictionaryOptionsForUi = () => [],
  fillSelect = () => {},
  getActiveEditableLayoutId = () => "",
  isDemoLayoutChoice = () => false,
  isReadOnlyStateScope = () => false,
  isSharedLayoutView = () => false,
  linkedSharedListLayout = null,
  publicLayoutChoiceForLayout = () => "",
  readonlyPublicTemplateOptionLabel = (label) => label,
  refs,
  renderItemCategoryPicker = () => {},
  selectedCategoryFilters = [],
  state,
  t = (key) => key,
  templateDraftLayoutId = () => "",
  uiLanguage = "",
  updateCategoryFilterButton = () => {},
  updateFilterContextToggle = () => {},
  updateFilterHighlights = () => {},
  updateLayoutCollapseAllToggle = () => {},
  updateLayoutLoadStatusUi = () => {},
  updateMetaToggle = () => {}
} = {}) {
  const personalLayouts = canUsePrivateState()
    ? Object.values(state.layouts || {}).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId)
    : Object.values(state.layouts || {}).filter((layout) => layout?.[GUEST_DEMO_COPY_FLAG]);
  const readonlyLayoutId = activeReadOnlyLayoutId();
  const activeEditableLayoutId = getActiveEditableLayoutId();
  const activeLayout = state.layouts?.[activeEditableLayoutId];
  const selectedLayoutValue = isReadOnlyStateScope()
    ? (readonlyLayoutId === DEMO_SHARED_LAYOUT_ID ? demoTemplateChoiceForLanguage(uiLanguage, activeDemoTemplateListId) : `shared:${readonlyLayoutId}`)
    : publicLayoutChoiceForLayout(activeLayout) || activeEditableLayoutId;
  const publicTemplatesBlocked = arePublishedTemplatesBlocked();
  const showAdminCatalog = canViewAdminPublishedCatalog();
  const adminCatalogReadOnly = showAdminCatalog && !canEditPublishedTemplatesNow();
  const demoTemplates = demoTemplatesForUiLanguage(uiLanguage);
  let publicOptions = showAdminCatalog
    ? adminPublicLayoutOptions({
      disabled: false,
      readonly: adminCatalogReadOnly,
      canView: true
    })
    : [
      ...demoTemplates.map((demoTemplate) => [
        demoTemplateChoiceForEntry(demoTemplate),
        `${t("template.prefix")}: ${demoTemplate?.name || demoTemplateFallbackName(uiLanguage)}`,
        "demo",
        publicTemplatesBlocked
      ]),
      ...(linkedSharedListLayout ? [[`shared:${linkedSharedListLayout.id}`, `${t("template.prefix")}: ${linkedSharedListLayout.name}`, "shared", publicTemplatesBlocked]] : []),
      ...currentSharedLayouts(uiLanguage).map((layout) => [`shared:${layout.id}`, `${t("template.prefix")}: ${layout.name}`, "shared", publicTemplatesBlocked])
    ];
  const activeAdminLabel = activeAdminDraftOptionLabel(activeLayout);
  if (activeAdminLabel) {
    const label = readonlyPublicTemplateOptionLabel(activeAdminLabel, { readonly: adminCatalogReadOnly });
    if (publicOptions.some((option) => option[0] === selectedLayoutValue)) {
      publicOptions = publicOptions.map((option) =>
        option[0] === selectedLayoutValue ? [option[0], label, option[2], option[3]] : option
      );
    } else {
      publicOptions = [[selectedLayoutValue, label, activeLayout?.adminDemo ? "demo" : "shared", false], ...publicOptions];
    }
  }
  const layoutOptions = [
    ...publicOptions,
    ...personalLayouts.map((layout) => [layout.id, layout.name, "personal"])
  ];
  fillSelect(refs.layoutSelect, layoutOptions, selectedLayoutValue);
  updateLayoutLoadStatusUi();
  const selectedTemplateDraftId = templateDraftLayoutId(selectedLayoutValue);
  const selectedTemplateDraft = selectedTemplateDraftId ? state.layouts?.[selectedTemplateDraftId] : null;
  refs.layoutSelect.classList.toggle("layout-select-demo", isDemoLayoutChoice(selectedLayoutValue) || Boolean(selectedTemplateDraft?.adminDemo));
  refs.layoutSelect.classList.toggle("layout-select-shared", String(selectedLayoutValue).startsWith("shared:") || Boolean(selectedTemplateDraftId && !selectedTemplateDraft?.adminDemo));
  refs.layoutSelect.classList.toggle("layout-select-readonly-public", adminCatalogReadOnly);
  refs.layoutSelect.title = adminCatalogReadOnly
    ? (uiLanguage === "en" ? "Offline: templates are read-only" : "РћС„Р»Р°Р№РЅ: С€Р°Р±Р»РѕРЅС‹ РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°")
    : "";
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  if (refs.editLayoutBtn) {
    const canManageLayout = canManageActiveLayout();
    const hideManageLayout = isReadOnlyStateScope() || isSharedLayoutView() || !state.layouts?.[activeEditableLayoutId];
    refs.editLayoutBtn.hidden = hideManageLayout;
    refs.editLayoutBtn.disabled = !canManageLayout;
    refs.editLayoutBtn.closest(".layout-actions")?.classList.toggle("layout-actions-single", hideManageLayout);
  }
  fillSelect(refs.layoutCopyFrom, personalLayouts.map((layout) => [layout.id, layout.name]), activeEditableLayoutId);
  const nextSelectedCategoryFilters = selectedCategoryFilters.filter((category) => dictionaryOptionsForUi("category").includes(category));
  const locationOptions = dictionaryOptionsForUi("location");
  fillSelect(refs.locationFilter, [["", t("filters.allPlaces")], ...locationOptions.map((loc) => [loc, loc])], refs.locationFilter.value);
  updateCategoryFilterButton();
  fillSelect(refs.itemLocation, dictionaryOptionsForUi("location").map((loc) => [loc, loc]));
  renderItemCategoryPicker();
  refs.clearSearchBtn.hidden = !refs.searchInput.value.trim();
  const locationFilterActive = Boolean(refs.locationFilter.value);
  const categoryFilterActive = nextSelectedCategoryFilters.length > 0;
  refs.clearLocationFilterBtn.hidden = !locationFilterActive;
  refs.clearCategoryFilterBtn.hidden = !categoryFilterActive;
  refs.clearLocationFilterBtn.parentElement.classList.toggle("filter-field-active", locationFilterActive);
  refs.clearCategoryFilterBtn.parentElement.classList.toggle("filter-field-active", categoryFilterActive);
  updateFilterHighlights();
  updateMetaToggle();
  updateLayoutCollapseAllToggle();
  updateFilterContextToggle();
  refs.collectionModeBtn.closest(".collection-panel")?.classList.toggle("collection-panel-active", state.collectionMode);
  refs.collectionModeBtn.textContent = state.collectionMode ? "вњ“ РЎР±РѕСЂ РІРєР»СЋС‡РµРЅ" : "Р РµР¶РёРј СЃР±РѕСЂР°";
  refs.collectionModeBtn.classList.toggle("active", state.collectionMode);
  refs.unpackedOnlyBtn.hidden = !state.collectionMode;
  refs.unpackedOnlyBtn.textContent = state.showOnlyUnpacked ? "Р¤РёР»СЊС‚СЂ: РЅРµ СЃРѕР±СЂР°РЅРѕ" : "РџРѕРєР°Р·Р°С‚СЊ РЅРµ СЃРѕР±СЂР°РЅРѕ";
  refs.unpackedOnlyBtn.classList.toggle("active", state.showOnlyUnpacked);
  refs.unpackAllBtn.hidden = !state.collectionMode || !Object.values(state.packedItems || {}).some(Boolean);
  return {
    selectedCategoryFilters: nextSelectedCategoryFilters
  };
}
