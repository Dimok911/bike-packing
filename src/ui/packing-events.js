import { bindPackingEmptyStateActions } from "./empty-state.js";
import { bindCardEditorClicks } from "./card-edit-click.js";

export function bindPackingEvents(root, {
  bindPointerPackingDrag,
  bindRootColumnDrag,
  capturePackingScroll,
  cleanupDropState,
  confirmRemoveItemFromActiveLayout,
  getDescendantContainerIds,
  getState,
  getDraggingContainerId,
  hasActiveContentFilter,
  isBlockedDropzone,
  isOriginalContainerPosition,
  isOriginalItemPosition,
  getEntryAfterPointer,
  getPlaceholderContainerIndex,
  getPlaceholderItemIndex,
  markDropzoneDragOver,
  moveContainer,
  moveItem,
  openAddToContainerDialog,
  openPackingItemReplacementDialog,
  openItemDialog,
  openLayoutRootDialog,
  openRootContainerDialog,
  placePlaceholder,
  removeDropzoneDragOver,
  render,
  saveLocalUiState,
  saveState,
  setDraggingContainerId,
  setDraggingItemId,
  setEditingContainerId,
  setEditingItemTitleId,
  toggleFilterViewCollapsed,
  togglePacked,
  touchContainer,
  touchItem
} = {}) {
  const state = getState();
  const placeholder = document.createElement("div");
  placeholder.className = "drop-placeholder";
  bindPackingEmptyStateActions(root, { onAddRoot: openLayoutRootDialog });
  bindPointerPackingDrag(root, placeholder);
  bindRootColumnDrag(root);

  root.querySelectorAll("[data-item-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      const card = handle.closest(".item-card");
      const draggingItemId = handle.dataset.itemDrag;
      setDraggingItemId(draggingItemId);
      setDraggingContainerId(null);
      card?.classList.add("dragging");
      event.dataTransfer.setData("text/item-id", draggingItemId);
      event.dataTransfer.setData("text/plain", draggingItemId);
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      handle.closest(".item-card")?.classList.remove("dragging");
      setDraggingItemId(null);
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll("[data-item-title-input]").forEach((input) => {
    input.focus({ preventScroll: true });
    input.select();
    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      const itemId = input.dataset.itemTitleInput;
      const value = input.value.trim();
      capturePackingScroll();
      if (value && state.items[itemId]) {
        state.items[itemId].name = value;
        touchItem(itemId);
        saveState();
      }
      setEditingItemTitleId(null);
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      capturePackingScroll();
      setEditingItemTitleId(null);
      render();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
  });

  root.querySelectorAll("[data-container-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      const draggingContainerId = handle.dataset.containerDrag;
      setDraggingContainerId(draggingContainerId);
      setDraggingItemId(null);
      handle.classList.add("dragging");
      handle.closest(".subcontainer")?.classList.add("dragging");
      event.dataTransfer.setData("text/container-id", draggingContainerId);
      event.dataTransfer.setData("text/plain", `container:${draggingContainerId}`);
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      handle.classList.remove("dragging");
      handle.closest(".subcontainer")?.classList.remove("dragging");
      setDraggingContainerId(null);
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll(".subcontainer-title").forEach((title) => {
    title.draggable = false;
    title.addEventListener("dragstart", (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
      const containerId = title.closest(".subcontainer")?.dataset.subcontainerId;
      if (!containerId) return;
      setDraggingContainerId(containerId);
      setDraggingItemId(null);
      title.closest(".subcontainer")?.classList.add("dragging");
      event.dataTransfer.setData("text/container-id", containerId);
      event.dataTransfer.setData("text/plain", `container:${containerId}`);
      event.dataTransfer.effectAllowed = "move";
    });
    title.addEventListener("dragend", () => {
      title.closest(".subcontainer")?.classList.remove("dragging");
      setDraggingContainerId(null);
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll("[data-container-title-input]").forEach((input) => {
    input.focus({ preventScroll: true });
    input.select();
    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      const containerId = input.dataset.containerTitleInput;
      const value = input.value.trim();
      capturePackingScroll();
      if (value && state.containers[containerId]) {
        state.containers[containerId].name = value;
        touchContainer(containerId);
        saveState();
      }
      setEditingContainerId(null);
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      capturePackingScroll();
      setEditingContainerId(null);
      render();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
  });

  root.querySelectorAll(".dropzone").forEach((zone) => {
    zone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) return;
      markDropzoneDragOver(root, zone);
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) {
        removeDropzoneDragOver(zone);
        if (placeholder.parentElement === zone) placeholder.remove();
        return;
      }
      markDropzoneDragOver(root, zone);
      if (getDraggingContainerId()) {
        const afterEntry = getEntryAfterPointer(zone, event.clientY, placeholder);
        placePlaceholder(zone, placeholder, afterEntry);
        if (isOriginalContainerPosition(zone, placeholder)) {
          removeDropzoneDragOver(zone);
          placeholder.remove();
        }
      } else {
        const afterEntry = getEntryAfterPointer(zone, event.clientY, placeholder);
        placePlaceholder(zone, placeholder, afterEntry);
        if (isOriginalItemPosition(zone, placeholder)) {
          removeDropzoneDragOver(zone);
          placeholder.remove();
        }
      }
    });
    zone.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget || zone.contains(event.relatedTarget)) return;
      removeDropzoneDragOver(zone);
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) {
        cleanupDropState(root, placeholder);
        return;
      }
      const plainData = event.dataTransfer.getData("text/plain");
      const containerId = event.dataTransfer.getData("text/container-id") ||
        (plainData.startsWith("container:") ? plainData.slice("container:".length) : "");
      if (containerId) {
        if (placeholder.parentElement !== zone) {
          cleanupDropState(root, placeholder);
          setDraggingContainerId(null);
          return;
        }
        const containerIndex = getPlaceholderContainerIndex(zone, placeholder);
        cleanupDropState(root, placeholder);
        setDraggingContainerId(null);
        moveContainer(containerId, zone.dataset.containerId, containerIndex);
        return;
      }
      const itemId = event.dataTransfer.getData("text/item-id") || plainData;
      if (itemId) {
        if (placeholder.parentElement !== zone) {
          cleanupDropState(root, placeholder);
          setDraggingItemId(null);
          return;
        }
        const itemIndex = getPlaceholderItemIndex(zone, placeholder);
        cleanupDropState(root, placeholder);
        setDraggingItemId(null);
        moveItem(itemId, zone.dataset.containerId, itemIndex);
      }
    });
  });

  root.querySelectorAll("[data-move-item]").forEach((select) => {
    select.addEventListener("change", () => moveItem(select.dataset.moveItem, select.value));
  });

  const packingCardSelector = [
    ".item-card[data-item-id]",
    ".subcontainer[data-subcontainer-id]",
    ".container-card[data-root-container-id]",
    "[data-sticky-root-container-id]"
  ].join(", ");
  const cardEditBlocked = () => document.body.classList.contains("dragging-ui");
  bindCardEditorClicks(root, {
    cardSelector: ".item-card[data-item-id]",
    closestCardSelector: packingCardSelector,
    getCardId: (card) => card.dataset.itemId,
    isBlocked: cardEditBlocked,
    openEditor: openItemDialog
  });
  bindCardEditorClicks(root, {
    cardSelector: ".subcontainer[data-subcontainer-id], .container-card[data-root-container-id], [data-sticky-root-container-id]",
    closestCardSelector: packingCardSelector,
    getCardId: (card) => card.dataset.subcontainerId || card.dataset.rootContainerId || card.dataset.stickyRootContainerId,
    isBlocked: cardEditBlocked,
    openEditor: openRootContainerDialog
  });

  root.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => openItemDialog(button.dataset.editItem));
  });

  root.querySelectorAll("[data-edit-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openRootContainerDialog(button.dataset.editContainer);
    });
  });

  root.querySelectorAll("[data-add-to-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAddToContainerDialog(button.dataset.addToContainer);
    });
  });

  root.querySelectorAll("[data-toggle-packed]").forEach((button) => {
    button.addEventListener("click", () => togglePacked(button.dataset.togglePacked));
  });

  root.querySelectorAll("[data-remove-from-layout]").forEach((button) => {
    button.addEventListener("click", () => confirmRemoveItemFromActiveLayout(button.dataset.removeFromLayout));
  });
  root.querySelectorAll("[data-replace-layout-item]").forEach((button) => {
    button.addEventListener("click", () => openPackingItemReplacementDialog(button.dataset.replaceLayoutItem));
  });

  root.querySelectorAll("[data-toggle-container]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerId = button.dataset.toggleContainer;
      capturePackingScroll();
      if (hasActiveContentFilter()) {
        toggleFilterViewCollapsed(containerId);
        render();
        return;
      }
      state.collapsedContainers[containerId] = !state.collapsedContainers[containerId];
      saveLocalUiState();
      render();
    });
  });

  root.querySelectorAll("[data-toggle-column]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerIds = getDescendantContainerIds(button.dataset.toggleColumn);
      const shouldCollapse = containerIds.some((id) => !state.collapsedContainers[id]);
      capturePackingScroll();
      containerIds.forEach((id) => {
        state.collapsedContainers[id] = shouldCollapse;
      });
      saveLocalUiState();
      render();
    });
  });
}
