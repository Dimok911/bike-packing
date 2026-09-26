import { createEntityId } from "../utils/entity-id.js";
import { normalizeStockQuantity, setItemStockLocations } from "../state/item-stock.js";
import { applyNoteFields } from "./rich-note-content.js";

export const NEW_ITEM_PLACEMENT_PICKER_MODE = "item-new-placement";

// The dialog remains the visible draft until its action has durable storage.
// Plain legacy writers keep their synchronous return contract.
const afterDialogSave = (saved, finish) => saved && typeof saved.then === "function" ? saved.then(finish) : finish();

export function itemDialogContainerPickerMode(editingItemId = "") {
  return editingItemId ? "item" : NEW_ITEM_PLACEMENT_PICKER_MODE;
}

export function isNewItemPlacementPickerMode(mode = "") {
  return mode === NEW_ITEM_PLACEMENT_PICKER_MODE;
}

export function itemDialogTargetLayoutFromPicker({
  currentLayoutId = "",
  mode = "",
  pickerLayoutId = ""
} = {}) {
  return isNewItemPlacementPickerMode(mode) && pickerLayoutId
    ? pickerLayoutId
    : currentLayoutId;
}

export function saveRootContainerDialogAction({
  applyRootContainerDialogParent = () => false,
  applyRootContainerDialogPhotoDraft = () => {},
  applyRootContainerDialogPlacement = () => false,
  applyRootContainerDimensions = () => {},
  changedAt = "",
  closeDialogWithoutRestoringFocus = () => {},
  currentCreateMeta = () => ({}),
  rootContainerSourceMeta = () => ({}),
  createRootContainerId = () => createEntityId("container"),
  defaultRootContainerLocation = () => "",
  editingRootContainerId = "",
  getRootContainerSelectedCategories = () => [],
  getPublishedEditLayoutId = () => "",
  hasContainerDimensions = () => false,
  markRecordActivePublicCatalog = () => {},
  normalizeContainerColor = (value) => value,
  parseVolumeInput = () => 0,
  parseWeightInput = () => 0,
  placeCreatedRootContainer = () => false,
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
    const id = createRootContainerId();
    if (!id || Object.hasOwn(state.containers, id)) throw new Error("ID новой сумки уже занят. Существующие данные не изменены.");
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
      nestable: Boolean(refs.rootContainerNestable?.checked),
      photos: rootContainerDialogPhotoDraft?.photos ? [...rootContainerDialogPhotoDraft.photos] : [],
      ...rootContainerSourceMeta(),
      ...currentCreateMeta(changedAt)
    };
    applyNoteFields(state.containers[id], refs.rootContainerNote);
    markRecordActivePublicCatalog(state.containers[id]);
    placeCreatedRootContainer(id, changedAt);
    const layoutId = getPublishedEditLayoutId();
    restoreAdminPublishedLayoutContext(layoutId);
    return afterDialogSave(saveLayoutMutation(layoutId, { publishDelay: 500 }), () => {
      const dialogCloseSettled = closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
      render();
      return { created: true, dialogCloseSettled, id, type: "container" };
    });
  }
  container.name = name;
  container.weight = parseWeightInput(refs.rootContainerWeight.value);
  container.volume = parseVolumeInput(refs.rootContainerVolume.value);
  container.color = normalizeContainerColor(refs.rootContainerColor?.value);
  container.category = selectedCategories[0] || "";
  container.categories = selectedCategories;
  applyRootContainerDimensions(container, dimensions);
  container.location = refs.rootContainerLocation.value || defaultRootContainerLocation(state);
  applyNoteFields(container, refs.rootContainerNote);
  container.nestable = Boolean(refs.rootContainerNestable?.checked);
  applyRootContainerDialogPhotoDraft(container, changedAt);
  markRecordActivePublicCatalog(container);
  touchContainer(container.id, changedAt);
  applyRootContainerDialogParent(changedAt);
  applyRootContainerDialogPlacement();
  const layoutId = getPublishedEditLayoutId();
  restoreAdminPublishedLayoutContext(layoutId);
  return afterDialogSave(saveLayoutMutation(layoutId, { publishDelay: 500 }), () => {
    const dialogCloseSettled = closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
    render();
    return { created: false, dialogCloseSettled, id: container.id, type: "container" };
  });
}

export function saveItemDialogAction({
  applyItemAvailabilityStatus = () => false,
  applyItemDimensions = () => {},
  applyItemDialogPhotoDraft = () => {},
  applyLayoutArrangement = () => {},
  changedAt = "",
  cleanupEmptyContainersInLayoutArrangement = () => {},
  closeDialogWithoutRestoringFocus = () => {},
  currentEditMeta = () => ({}),
  createItemId = () => createEntityId("item"),
  editingItemId = "",
  getDialogSelectedCategories = () => [],
  getItemContainerIdInLayout = () => "",
  getPublishedEditLayoutId = () => "",
  hasItemDimensions = () => false,
  itemDialogPhotoDraft = null,
  itemDialogTargetLayoutId = "",
  markRecordActivePublicCatalog = () => {},
  normalizeItemColor = (value) => String(value || "").trim(),
  normalizeItemAvailabilityStatus = () => "available",
  parseWeightInput = () => 0,
  placeExistingItemInLayout = () => false,
  placementFailedText = "Could not add the item to this layout.",
  readItemDialogDimensions = () => ({}),
  readItemDialogQuantity = () => 1,
  readItemStockLocations = null,
  refs,
  removeItemFromLayoutArrangement = () => {},
  render = () => {},
  requireUsageCapacity = () => true,
  restoreAdminPublishedLayoutContext = () => {},
  saveLayoutMutation = () => {},
  setLayoutItemQuantity = () => false,
  showToast = () => {},
  state,
  touchItem = () => {},
  touchLayout = () => {},
  unavailablePlacementText = "This item is unavailable and cannot be added to a layout."
} = {}) {
  if (refs.saveItemBtn.disabled) return;
  const name = refs.itemName.value.trim();
  if (!name) return;
  const containerId = refs.itemContainer.value;
  const layoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  const selectedCategories = getDialogSelectedCategories();
  const dimensions = readItemDialogDimensions();
  const availabilityStatus = normalizeItemAvailabilityStatus(refs.itemAvailabilityStatus?.value);
  const itemIsUnavailable = availabilityStatus !== "available";
  const placementQuantity = readItemDialogQuantity();
  let savedItemId = editingItemId || "";
  let created = false;

  if (editingItemId) {
    const item = state.items[editingItemId];
    const previousContainerId = getItemContainerIdInLayout(layout, editingItemId);
    item.name = name;
    item.weight = parseWeightInput(refs.itemWeight.value);
    item.quantity = 1;
    if (refs.itemStockQuantity && !refs.itemStockQuantity.disabled) item.stockQuantity = normalizeStockQuantity(refs.itemStockQuantity.value);
    item.color = normalizeItemColor(refs.itemColor?.value);
    applyItemDimensions(item, dimensions);
    item.location = refs.itemLocation.value;
    if (readItemStockLocations && !refs.itemStockQuantity?.disabled) setItemStockLocations(item, readItemStockLocations());
    item.categories = selectedCategories;
    item.category = selectedCategories[0] || "";
    applyNoteFields(item, refs.itemNote);
    applyItemAvailabilityStatus(item, availabilityStatus);
    applyItemDialogPhotoDraft(item, changedAt);
    markRecordActivePublicCatalog(item, layoutId);
    touchItem(editingItemId, changedAt);
    if (previousContainerId !== containerId) {
      if (containerId) {
        if (itemIsUnavailable) {
          showToast(unavailablePlacementText, "warning");
          return;
        }
        if (!placeExistingItemInLayout(editingItemId, containerId, layoutId, { changedAt })) {
          showToast(placementFailedText, "error");
          return;
        }
        setLayoutItemQuantity(layout, editingItemId, placementQuantity);
        touchLayout(layoutId, changedAt);
        restoreAdminPublishedLayoutContext(layoutId);
        return afterDialogSave(saveLayoutMutation(layoutId), () => {
          closeDialogWithoutRestoringFocus(refs.dialog);
          render();
        });
      }
      removeItemFromLayoutArrangement(layout, editingItemId);
      cleanupEmptyContainersInLayoutArrangement(layout, previousContainerId);
      touchLayout(layoutId, changedAt);
      if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
      restoreAdminPublishedLayoutContext(layoutId);
      return afterDialogSave(saveLayoutMutation(layoutId), () => {
        closeDialogWithoutRestoringFocus(refs.dialog);
        render();
      });
    }
    if (containerId && setLayoutItemQuantity(layout, editingItemId, placementQuantity)) {
      touchLayout(layoutId, changedAt);
    }
  } else {
    if (!requireUsageCapacity("items")) return;
    const id = createItemId();
    if (!id || Object.hasOwn(state.items, id)) throw new Error("ID новой вещи уже занят. Существующие данные не изменены.");
    savedItemId = id;
    created = true;
    state.items[id] = {
      id,
      name,
      weight: parseWeightInput(refs.itemWeight.value),
      quantity: 1,
      stockQuantity: normalizeStockQuantity(refs.itemStockQuantity?.value),
      color: normalizeItemColor(refs.itemColor?.value),
      ...(hasItemDimensions(dimensions) ? { dimensions } : {}),
      location: refs.itemLocation.value,
      category: selectedCategories[0] || "",
      categories: selectedCategories,
      containerId: "",
      note: refs.itemNote.value.trim(),
      photos: itemDialogPhotoDraft?.photos ? [...itemDialogPhotoDraft.photos] : [],
      ...currentEditMeta(changedAt)
    };
    applyNoteFields(state.items[id], refs.itemNote);
    applyItemAvailabilityStatus(state.items[id], availabilityStatus);
    if (readItemStockLocations && !refs.itemStockQuantity?.disabled) setItemStockLocations(state.items[id], readItemStockLocations());
    markRecordActivePublicCatalog(state.items[id], layoutId);
    if (containerId && state.containers[containerId] && layout) {
      if (itemIsUnavailable) {
        showToast(unavailablePlacementText, "warning");
        delete state.items[id];
        return;
      }
      if (!placeExistingItemInLayout(id, containerId, layoutId, { changedAt })) {
        delete state.items[id];
        showToast(placementFailedText, "error");
        return;
      }
      setLayoutItemQuantity(layout, id, placementQuantity);
      touchLayout(layoutId, changedAt);
    }
  }

  restoreAdminPublishedLayoutContext(layoutId);
  return afterDialogSave(saveLayoutMutation(layoutId), () => {
    const dialogCloseSettled = closeDialogWithoutRestoringFocus(refs.dialog);
    render();
    return { created, dialogCloseSettled, id: savedItemId, type: "item" };
  });
}
