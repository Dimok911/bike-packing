export function saveRootContainerDialogAction({
  applyRootContainerDialogParent = () => false,
  applyRootContainerDialogPhotoDraft = () => {},
  applyRootContainerDialogPlacement = () => false,
  applyRootContainerDimensions = () => {},
  changedAt = "",
  closeDialogWithoutRestoringFocus = () => {},
  currentCreateMeta = () => ({}),
  defaultRootContainerLocation = () => "",
  editingRootContainerId = "",
  getRootContainerSelectedCategories = () => [],
  getPublishedEditLayoutId = () => "",
  hasContainerDimensions = () => false,
  markRecordActivePublicCatalog = () => {},
  normalizeContainerColor = (value) => value,
  parseVolumeInput = () => 0,
  parseWeightInput = () => 0,
  readRootContainerDialogDimensions = () => ({}),
  refs,
  render = () => {},
  requireUsageCapacity = () => true,
  restoreAdminPublishedLayoutContext = () => {},
  rootContainerDialogPhotoDraft = null,
  saveLayoutMutation = () => {},
  state,
  touchContainer = () => {}
} = {}) {
  if (refs.saveRootContainerBtn.disabled) return;
  const name = refs.rootContainerName.value.trim();
  if (!name) return;
  const container = editingRootContainerId ? state.containers[editingRootContainerId] : null;
  if (editingRootContainerId && !container) return;
  if (!container && !requireUsageCapacity("containers")) return;
  const dimensions = readRootContainerDialogDimensions();
  const selectedCategories = getRootContainerSelectedCategories();
  if (!container) {
    const id = `container-${Date.now()}`;
    state.containers[id] = {
      id,
      name,
      parentId: null,
      childIds: [],
      itemIds: [],
      order: [],
      weight: parseWeightInput(refs.rootContainerWeight.value),
      volume: parseVolumeInput(refs.rootContainerVolume.value),
      color: normalizeContainerColor(refs.rootContainerColor?.value),
      category: selectedCategories[0] || "",
      categories: selectedCategories,
      ...(hasContainerDimensions(dimensions) ? { dimensions } : {}),
      location: refs.rootContainerLocation.value || defaultRootContainerLocation(state),
      note: refs.rootContainerNote.value.trim(),
      photos: rootContainerDialogPhotoDraft?.photos ? [...rootContainerDialogPhotoDraft.photos] : [],
      ...currentCreateMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.containers[id]);
    closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
    const layoutId = getPublishedEditLayoutId();
    restoreAdminPublishedLayoutContext(layoutId);
    saveLayoutMutation(layoutId, { publishDelay: 500 });
    render();
    return;
  }
  container.name = name;
  container.weight = parseWeightInput(refs.rootContainerWeight.value);
  container.volume = parseVolumeInput(refs.rootContainerVolume.value);
  container.color = normalizeContainerColor(refs.rootContainerColor?.value);
  container.category = selectedCategories[0] || "";
  container.categories = selectedCategories;
  applyRootContainerDimensions(container, dimensions);
  container.location = refs.rootContainerLocation.value || defaultRootContainerLocation(state);
  container.note = refs.rootContainerNote.value.trim();
  applyRootContainerDialogPhotoDraft(container, changedAt);
  markRecordActivePublicCatalog(container);
  touchContainer(container.id, changedAt);
  applyRootContainerDialogParent(changedAt);
  applyRootContainerDialogPlacement();
  closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
  const layoutId = getPublishedEditLayoutId();
  restoreAdminPublishedLayoutContext(layoutId);
  saveLayoutMutation(layoutId, { publishDelay: 500 });
  render();
}

export function saveItemDialogAction({
  applyItemDialogPhotoDraft = () => {},
  applyLayoutArrangement = () => {},
  changedAt = "",
  cleanupEmptyContainersInLayoutArrangement = () => {},
  closeDialogWithoutRestoringFocus = () => {},
  currentEditMeta = () => ({}),
  editingItemId = "",
  getDialogSelectedCategories = () => [],
  getItemContainerIdInLayout = () => "",
  getPublishedEditLayoutId = () => "",
  itemDialogPhotoDraft = null,
  itemDialogTargetLayoutId = "",
  markRecordActivePublicCatalog = () => {},
  parseWeightInput = () => 0,
  placeExistingItemInLayout = () => false,
  readItemDialogQuantity = () => 1,
  refs,
  removeItemFromLayoutArrangement = () => {},
  render = () => {},
  requireUsageCapacity = () => true,
  restoreAdminPublishedLayoutContext = () => {},
  saveLayoutMutation = () => {},
  showToast = () => {},
  state,
  touchItem = () => {},
  touchLayout = () => {}
} = {}) {
  if (refs.saveItemBtn.disabled) return;
  const name = refs.itemName.value.trim();
  if (!name) return;
  const containerId = refs.itemContainer.value;
  const layoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  const selectedCategories = getDialogSelectedCategories();

  if (editingItemId) {
    const item = state.items[editingItemId];
    const previousContainerId = getItemContainerIdInLayout(layout, editingItemId);
    item.name = name;
    item.weight = parseWeightInput(refs.itemWeight.value);
    item.quantity = readItemDialogQuantity();
    item.location = refs.itemLocation.value;
    item.categories = selectedCategories;
    item.category = selectedCategories[0] || "";
    item.note = refs.itemNote.value.trim();
    applyItemDialogPhotoDraft(item, changedAt);
    markRecordActivePublicCatalog(item);
    touchItem(editingItemId, changedAt);
    if (previousContainerId !== containerId) {
      closeDialogWithoutRestoringFocus(refs.dialog);
      if (containerId) {
        if (!placeExistingItemInLayout(editingItemId, containerId, layoutId, { changedAt })) {
          showToast("РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РІРµС‰СЊ РІ СЌС‚Сѓ СѓРєР»Р°РґРєСѓ.", "error");
          return;
        }
        restoreAdminPublishedLayoutContext(layoutId);
        saveLayoutMutation(layoutId);
        render();
        return;
      }
      removeItemFromLayoutArrangement(layout, editingItemId);
      cleanupEmptyContainersInLayoutArrangement(layout, previousContainerId);
      touchLayout(layoutId, changedAt);
      if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
      restoreAdminPublishedLayoutContext(layoutId);
      saveLayoutMutation(layoutId);
      render();
      return;
    }
  } else {
    if (!requireUsageCapacity("items")) return;
    const id = `item-${Date.now()}`;
    state.items[id] = {
      id,
      name,
      weight: parseWeightInput(refs.itemWeight.value),
      quantity: readItemDialogQuantity(),
      location: refs.itemLocation.value,
      category: selectedCategories[0] || "",
      categories: selectedCategories,
      containerId: "",
      note: refs.itemNote.value.trim(),
      photos: itemDialogPhotoDraft?.photos ? [...itemDialogPhotoDraft.photos] : [],
      ...currentEditMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.items[id]);
    if (containerId && state.containers[containerId] && layout) {
      if (!placeExistingItemInLayout(id, containerId, layoutId, { changedAt })) {
        delete state.items[id];
        showToast("РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РІРµС‰СЊ РІ СЌС‚Сѓ СѓРєР»Р°РґРєСѓ.", "error");
        return;
      }
    }
  }

  restoreAdminPublishedLayoutContext(layoutId);
  saveLayoutMutation(layoutId);
  closeDialogWithoutRestoringFocus(refs.dialog);
  render();
}
