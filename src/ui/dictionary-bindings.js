import { currentDocumentLanguage } from "../utils/language.js";
import {
  collectDictionaryValueUsage,
  dictionaryDeleteImpactHtml
} from "./dictionary-delete-impact.js";

function localText(en, ru) {
  return currentDocumentLanguage() === "en" ? en : ru;
}

export function bindDictionaryControls(type, {
  activeDictionaryOwner,
  addCustomDictionaryValue,
  capitalize,
  dictionaryEditScope,
  dictionaryOptionsForOwner,
  editingDictionaryEntry,
  formatThingCount,
  containerCategories = () => [],
  itemCategories,
  markEdited,
  nowIso,
  onRenamed = () => {},
  openConfirmDialog,
  removeCustomDictionaryValue,
  renameCustomDictionaryValue,
  render,
  requireUsageCapacity,
  saveDictionaryOwner,
  setEditingDictionaryEntry,
  showToast,
  touchContainer,
  owner = activeDictionaryOwner()
} = {}) {
  const scope = dictionaryEditScope(owner);
  const input = document.querySelector(`#${type}Input`);
  document.querySelector(`#${type}Add`).addEventListener("click", () => {
    const value = input.value.trim();
    if (!value || dictionaryOptionsForOwner(type, owner).includes(value)) return;
    if (!requireUsageCapacity(type === "location" ? "locations" : "categories")) return;
    addCustomDictionaryValue(owner, type, value);
    setEditingDictionaryEntry(null);
    input.value = "";
    saveDictionaryOwner(owner);
  });
  document.querySelectorAll(`[data-edit-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      setEditingDictionaryEntry({ type, value: button.dataset[`edit${capitalize(type)}`] });
      render();
    });
  });
  document.querySelectorAll(`[data-cancel-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      setEditingDictionaryEntry(null);
      render();
    });
  });
  document.querySelectorAll(`[data-save-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      const oldValue = button.dataset[`save${capitalize(type)}`];
      const editInput = button.closest(".dictionary-chip")?.querySelector(`[data-dictionary-edit-input="${type}"]`);
      renameDictionaryEntry(type, oldValue, editInput?.value || "", {
        addCustomDictionaryValue,
        containerCategories,
        dictionaryEditScope,
        dictionaryOptionsForOwner,
        itemCategories,
        markEdited,
        nowIso,
        onRenamed,
        owner,
        render,
        renameCustomDictionaryValue,
        saveDictionaryOwner,
        setEditingDictionaryEntry,
        showToast,
        touchContainer
      });
    });
  });
  document.querySelectorAll(`[data-dictionary-edit-input="${type}"]`).forEach((editInput) => {
    editInput.focus({ preventScroll: true });
    editInput.select();
    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameDictionaryEntry(type, editingDictionaryEntry?.value || "", editInput.value, {
          containerCategories,
          dictionaryEditScope,
          dictionaryOptionsForOwner,
          itemCategories,
          markEdited,
          nowIso,
          onRenamed,
          owner,
          render,
          renameCustomDictionaryValue,
          saveDictionaryOwner,
          setEditingDictionaryEntry,
          showToast,
          touchContainer
        });
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEditingDictionaryEntry(null);
        render();
      }
    });
  });
  document.querySelectorAll(`[data-remove-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset[`remove${capitalize(type)}`];
      const dictionaryValues = dictionaryOptionsForOwner(type, owner);
      const usage = collectDictionaryValueUsage(type, value, {
        items: scope.items,
        containers: scope.containers,
        itemCategories,
        containerCategories
      });
      const affectedCount = usage.items.length + usage.containers.length;
      const fallback = dictionaryValues.find((item) => item !== value) || "";
      const title = type === "location"
        ? localText("Delete storage place?", "Удалить место хранения?")
        : localText("Delete category?", "Удалить категорию?");
      const subject = type === "location"
        ? localText("storage place", "место хранения")
        : localText("category", "категорию");
      const fallbackText = fallback
        ? localText(`“${fallback}”`, `«${fallback}»`)
        : localText("an empty value", "пустое значение");
      openConfirmDialog({
        title,
        text: localText(
          `If you delete the ${subject} “${value}”, linked items, bags, and places will be moved to ${fallbackText}.`,
          `Если удалить ${subject} «${value}», связанные вещи, сумки и места будут перенесены в ${fallbackText}.`
        ),
        highlightText: affectedCount
          ? ""
          : localText("Currently not used by any items, bags, or places.", "Сейчас не применяется ни к одной вещи, сумке или месту."),
        highlightHtml: affectedCount ? dictionaryDeleteImpactHtml(usage) : "",
        okText: localText("Delete", "Удалить"),
        tone: affectedCount ? "danger" : "safe",
        onConfirm: () => {
          const changedAt = nowIso();
          removeCustomDictionaryValue(owner, type, value);
          scope.items.forEach((item) => {
            if (type === "location" && item.location === value) {
              item.location = fallback;
              markEdited(item, changedAt);
            }
            if (type === "category" && itemCategories(item).includes(value)) {
              item.categories = itemCategories(item).map((category) => category === value ? fallback : category)
                .filter(Boolean)
                .filter((category, index, list) => list.indexOf(category) === index);
              item.category = item.categories[0] || "";
              markEdited(item, changedAt);
            }
          });
          if (type === "location") {
            scope.containers.forEach((container) => {
              if (container.location !== value) return;
              container.location = fallback;
              touchContainer(container.id, changedAt);
            });
          } else {
            scope.containers.forEach((container) => {
              if (!containerCategories(container).includes(value)) return;
              container.categories = containerCategories(container).map((category) => category === value ? fallback : category)
                .filter(Boolean)
                .filter((category, index, list) => list.indexOf(category) === index);
              container.category = container.categories[0] || "";
              touchContainer(container.id, changedAt);
            });
          }
          saveDictionaryOwner(owner);
        }
      });
    });
  });
}

export function renameDictionaryEntry(type, oldValue, rawNewValue, {
  containerCategories = () => [],
  dictionaryEditScope,
  dictionaryOptionsForOwner,
  itemCategories,
  markEdited,
  nowIso,
  onRenamed = () => {},
  owner,
  render,
  renameCustomDictionaryValue,
  saveDictionaryOwner,
  setEditingDictionaryEntry,
  showToast,
  touchContainer
} = {}) {
  const scope = dictionaryEditScope(owner);
  const newValue = String(rawNewValue || "").trim();
  if (!oldValue || !newValue) return;
  if (newValue === oldValue) {
    setEditingDictionaryEntry(null);
    render();
    return;
  }
  if (dictionaryOptionsForOwner(type, owner).includes(newValue)) {
    showToast(localText("This value already exists.", "Такое значение уже есть."), "warning");
    return;
  }
  const changedAt = nowIso();
  renameCustomDictionaryValue(owner, type, oldValue, newValue);
  if (type === "location") {
    scope.items.forEach((item) => {
      if (item.location !== oldValue) return;
      item.location = newValue;
      markEdited(item, changedAt);
    });
    scope.containers.forEach((container) => {
      if (container.location !== oldValue) return;
      container.location = newValue;
      touchContainer(container.id, changedAt);
    });
  } else {
    scope.items.forEach((item) => {
      if (!itemCategories(item).includes(oldValue)) return;
      item.categories = itemCategories(item).map((category) => category === oldValue ? newValue : category)
        .filter((category, index, list) => list.indexOf(category) === index);
      item.category = item.categories[0];
      markEdited(item, changedAt);
    });
    scope.containers.forEach((container) => {
      if (!containerCategories(container).includes(oldValue)) return;
      container.categories = containerCategories(container).map((category) => category === oldValue ? newValue : category)
        .filter((category, index, list) => list.indexOf(category) === index);
      container.category = container.categories[0];
      touchContainer(container.id, changedAt);
    });
  }
  onRenamed(type, oldValue, newValue);
  saveDictionaryOwner(owner);
}
