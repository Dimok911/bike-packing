import { itemCategories } from "../state/normalize.js";
import { comparableValueForMerge } from "../sync/conflict-merge.js";
import { isConflictMetaField } from "../sync/conflict-meta.js";
import { historyNewerRecord } from "../sync/history.js";
import { escapeHtml } from "../utils/html.js";
import {
  formatCompactJson,
  snapshotsEqual
} from "../utils/json.js";
import {
  formatWeight,
  parseWeightInput
} from "../utils/weight.js";
import {
  conflictDiffFieldDefinitions
} from "./conflict-format.js";

const HISTORY_TECHNICAL_FIELDS = new Set([
  "originListId",
  "origin_list_id",
  "publicListId",
  "listId",
  "list_id",
  "sourceId",
  "sourceItemId",
  "source_item_id",
  "sourceContainerId",
  "source_container_id",
  "sourceLayoutId",
  "source_layout_id",
  "sharedSourceId",
  "sharedSourceItemId",
  "sharedSourceContainerId",
  "sharedSourceLayoutId",
  "publicSourceId",
  "publicSourceItemId",
  "publicSourceContainerId",
  "publicSourceLayoutId",
  "publicCopySourceId",
  "publicCatalogLayoutId",
  "publicCatalogItemId",
  "publicCatalogContainerId",
  "templateId",
  "templateSourceId",
  "adminDemo",
  "adminDemoListId",
  "adminDemoLanguage",
  "isAdminDemo",
  "demo",
  "isDemo",
  "adminShared",
  "isAdminShared",
  "adminSharedSourceId",
  "adminTemplateCopy",
  "runtimeSharedTemplate",
  "serverConfirmed",
  "templatePublished",
  "templateUnpublishPending",
  "isPublicCatalog",
  "publicCatalog",
  "guestDemoCopy",
  "guestDemoCopyCreatedAt"
]);

export function isHistoryTechnicalField(key) {
  const normalizedKey = String(key || "");
  return normalizedKey.startsWith("_") || HISTORY_TECHNICAL_FIELDS.has(normalizedKey);
}

const historyRuText = (_english, russian) => russian;

function historyFieldDefinitions(type, localText = historyRuText) {
  const labels = {
    item: {
      name: localText("Name", "Название"),
      weight: localText("Weight", "Вес"),
      quantity: localText("Quantity", "Количество"),
      color: localText("Color", "Цвет"),
      dimensions: localText("Dimensions", "Размеры"),
      location: localText("Storage location", "Место хранения"),
      categories: localText("Categories", "Категории"),
      category: localText("Category", "Категория"),
      containerId: localText("Stored in", "Где лежит"),
      note: localText("Note", "Заметка"),
      photos: localText("Photos", "Фото"),
      availabilityStatus: localText("Availability", "Доступность")
    },
    container: {
      name: localText("Name", "Название"),
      weight: localText("Weight", "Вес"),
      volume: localText("Volume", "Объём"),
      location: localText("Storage location", "Место хранения"),
      parentId: localText("Nested in", "Вложено в"),
      itemIds: localText("Items inside", "Вещи внутри"),
      childIds: localText("Nested bags", "Вложенные сумки"),
      order: localText("Order inside", "Порядок внутри"),
      note: localText("Note", "Заметка"),
      color: localText("Color", "Цвет"),
      photos: localText("Photos", "Фото"),
      categories: localText("Categories", "Категории"),
      category: localText("Category", "Категория"),
      dimensions: localText("Dimensions", "Размеры")
    },
    layout: {
      name: localText("Name", "Название"),
      language: localText("Language", "Язык"),
      layoutOrder: localText("Position in the list", "Позиция в списке"),
      rootContainerIds: localText("Bags in layout", "Сумки в укладке"),
      arrangement: localText("Column arrangement", "Раскладка колонок"),
      notes: localText("Layout notes", "Заметки к укладке"),
      locked: localText("Layout lock", "Блокировка укладки")
    }
  };
  const definitions = conflictDiffFieldDefinitions({ type });
  if (type === "item") definitions.push(
    ["color", labels.item.color, ""],
    ["dimensions", labels.item.dimensions, ""],
    ["availabilityStatus", labels.item.availabilityStatus, "availability"]
  );
  if (type === "container") {
    definitions.push(
      ["categories", labels.container.categories, "list"],
      ["category", labels.container.category, ""],
      ["dimensions", labels.container.dimensions, ""]
    );
  }
  if (type === "layout") {
    definitions.push(
      ["language", labels.layout.language, ""],
      ["layoutOrder", labels.layout.layoutOrder, ""],
      ["notes", labels.layout.notes, ""],
      ["locked", labels.layout.locked, "boolean"]
    );
  }
  return definitions.map(([key, fallback, format]) => [
    key,
    labels[type]?.[key] || fallback,
    format
  ]);
}

export function buildHistoryStateDiff(fromState = {}, toState = {}, {
  localText = historyRuText
} = {}) {
  return {
    items: diffHistoryMap("item", fromState.items || {}, toState.items || {}, fromState, toState, localText),
    containers: diffHistoryMap("container", fromState.containers || {}, toState.containers || {}, fromState, toState, localText),
    layouts: diffHistoryMap("layout", fromState.layouts || {}, toState.layouts || {}, fromState, toState, localText),
    packed: diffHistoryPacked(fromState.packedItems || {}, toState.packedItems || {}, fromState, toState, localText),
    settings: diffHistorySettings(fromState, toState, localText)
  };
}

function historyDiffRows(diff = {}) {
  return ["items", "containers", "layouts", "packed", "settings"].flatMap((entityType) =>
    ["added", "removed", "changed"].flatMap((operation) =>
      (diff?.[entityType]?.[operation] || []).map((row) => ({ entityType, operation, row }))
    )
  );
}

export function hasHistoryStateChanges(fromState, toState) {
  if (!fromState || !toState) return false;
  return historyDiffRows(buildHistoryStateDiff(fromState, toState)).length > 0;
}

export function historyRecordAction(record, index, records, {
  currentComparisonState = () => null,
  recordState = () => null
} = {}) {
  const kind = String(record?.snapshotKind || record?.snapshot_kind || "undo");
  if (kind === "daily") return null;
  const recordedAction = record?.action && typeof record.action === "object" ? record.action : null;
  if (recordedAction && recordedAction.entityType !== "layouts") return recordedAction;
  const beforeState = recordState(record);
  const newerRecord = historyNewerRecord(record, index, records);
  const afterState = newerRecord ? recordState(newerRecord) : currentComparisonState();
  if (!beforeState || !afterState) return recordedAction;
  const placementAction = historyLayoutPlacementAction(beforeState, afterState);
  if (placementAction) return placementAction;
  if (recordedAction) return recordedAction;
  const rows = historyDiffRows(buildHistoryStateDiff(beforeState, afterState));
  if (!rows.length) return null;
  const catalogRows = rows.filter((entry) => entry.entityType === "items" || entry.entityType === "containers");
  const catalogStructuralRows = catalogRows.filter((entry) => entry.operation === "added" || entry.operation === "removed");
  const primaryRows = catalogStructuralRows.length === 1
    ? catalogStructuralRows
    : catalogRows.length
      ? catalogRows
      : rows.filter((entry) => entry.entityType === "layouts");
  const selectedRows = primaryRows.length ? primaryRows : rows;
  if (selectedRows.length !== 1) return { operation: "mixed", count: rows.length, title: "" };
  const selected = selectedRows[0];
  return {
    entityType: selected.entityType,
    operation: selected.operation,
    count: rows.length,
    title: String(selected.row?.title || "").trim()
  };
}

export function historyActionDescription(action, {
  localText = historyRuText
} = {}) {
  if (!action || action.operation === "mixed" || action.entityType === "mixed") {
    return localText("Several changes", "Несколько изменений");
  }
  if (action.entityType === "settings") {
    return localText("Settings changed", "Изменены настройки");
  }
  if (action.entityType === "packed") {
    return localText("Packing status changed", "Изменён статус сборов");
  }
  if (action.entityType === "templates") {
    const title = String(action.title || "").trim();
    return title
      ? localText(`Removed template “${title}”`, `Удалён шаблон «${title}»`)
      : localText("Removed template", "Удалён шаблон");
  }
  if (action.entityType === "layoutContainers" || action.entityType === "layoutItems") {
    const title = String(action.title || "").trim();
    const layoutTitle = String(action.layoutTitle || "").trim();
    const isContainer = action.entityType === "layoutContainers";
    if (action.operation === "added") {
      return localText(
        `${isContainer ? "Added bag" : "Added item"}${title ? ` “${title}”` : ""}${layoutTitle ? ` to layout “${layoutTitle}”` : ""}`,
        `${isContainer ? "Добавлена сумка" : "Добавлена вещь"}${title ? ` «${title}»` : ""}${layoutTitle ? ` в укладку «${layoutTitle}»` : ""}`
      );
    }
    if (action.operation === "removed") {
      return localText(
        `${isContainer ? "Removed bag" : "Removed item"}${title ? ` “${title}”` : ""}${layoutTitle ? ` from layout “${layoutTitle}”` : ""}`,
        `${isContainer ? "Удалена сумка" : "Удалена вещь"}${title ? ` «${title}»` : ""}${layoutTitle ? ` из укладки «${layoutTitle}»` : ""}`
      );
    }
  }
  const entityNames = {
    items: localText("item", "вещь"),
    containers: localText("bag", "сумка"),
    layouts: localText("layout", "укладка")
  };
  const entityName = entityNames[action.entityType];
  if (!entityName) return localText("Several changes", "Несколько изменений");
  const operation = action.operation === "added"
    ? localText("Added", "Добавлена")
    : action.operation === "removed"
      ? localText("Removed", "Удалена")
      : localText("Changed", "Изменена");
  const title = String(action.title || "").trim();
  return title
    ? localText(`${operation} ${entityName} “${title}”`, `${operation} ${entityName} «${title}»`)
    : `${operation} ${entityName}`;
}

export function historyUndoConfirmation({
  actionText = "",
  crossesCheckpoint = false,
  isDeepRollback = false,
  layoutName = "",
  localText = (en, ru) => ru,
  newerActionCount = 0
} = {}) {
  const deepWarning = isDeepRollback
    ? crossesCheckpoint
      ? localText(
        "All changes after this checkpoint, including the later actions shown above, will also be undone.",
        "Также будут отменены все изменения после этой точки, включая более поздние действия, расположенные выше."
      )
      : localText(
        `Later actions shown above will also be undone: ${newerActionCount}.`,
        `Также будут отменены более поздние действия, расположенные выше: ${newerActionCount}.`
      )
    : "";
  const text = layoutName && !isDeepRollback
    ? localText(
      `This action will be undone only in the layout “${layoutName}”. Other layouts and shared item data will remain unchanged. The current state will first be saved in history.`,
      `Действие будет отменено только в укладке «${layoutName}». Другие укладки и общие данные вещей не изменятся. Текущее состояние сначала сохранится в истории.`
    )
    : localText(
      "The selected action will be undone. The current state will first be saved in history.",
      "Выбранное действие будет отменено. Текущее состояние сначала сохранится в истории."
    );
  return {
    title: actionText || localText("Undo action?", "Отменить действие?"),
    text,
    highlightText: deepWarning,
    highlightCount: isDeepRollback && newerActionCount ? `+${newerActionCount}` : "",
    tone: isDeepRollback ? "danger" : "",
    okText: localText("Undo action", "Отменить действие"),
    cancelText: localText("Cancel", "Отмена")
  };
}

function diffHistoryMap(type, fromMap, toMap, fromState, toState, localText) {
  const added = [];
  const removed = [];
  const changed = [];
  const ids = new Set([...Object.keys(fromMap || {}), ...Object.keys(toMap || {})]);
  ids.forEach((id) => {
    const before = fromMap?.[id];
    const after = toMap?.[id];
    if (!before && after) {
      added.push(historyEntityLine(type, id, after, toState, "added", localText));
      return;
    }
    if (before && !after) {
      removed.push(historyEntityLine(type, id, before, fromState, "removed", localText));
      return;
    }
    const beforeValue = historyComparableEntity(type, before);
    const afterValue = historyComparableEntity(type, after);
    if (!snapshotsEqual(beforeValue, afterValue)) {
      const details = historyChangedFields(type, beforeValue, afterValue, fromState, toState, localText);
      if (!details.length) return;
      changed.push({
        title: historyEntityTitle(type, after || before) || id,
        details
      });
    }
  });
  return { added, removed, changed };
}

function historyComparableEntity(type, value) {
  const comparable = comparableValueForMerge(type, value) || {};
  const cloned = JSON.parse(JSON.stringify(comparable));
  Object.keys(cloned).forEach((key) => {
    if (isConflictMetaField(key) || isHistoryTechnicalField(key)) delete cloned[key];
  });
  return cloned;
}

function historyEntityLine(type, id, value, targetState, mode, localText = historyRuText) {
  const title = historyEntityTitle(type, value) || id;
  const meta = [];
  if (type === "item") {
    if (value?.containerId) meta.push(historyContainerName(targetState, value.containerId, localText));
    if (itemCategories(value).length) meta.push(itemCategories(value).join(", "));
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "container") {
    const count = Array.isArray(value?.itemIds) ? value.itemIds.length : 0;
    if (count) meta.push(localText(`${count} items`, `${count} вещей`));
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "layout") {
    const roots = Array.isArray(value?.rootContainerIds) ? value.rootContainerIds.length : 0;
    meta.push(localText(`${roots} root bags`, `${roots} корневых сумок`));
  }
  return {
    title,
    details: meta.filter(Boolean).join(" · "),
    mode
  };
}

function historyEntityTitle(type, value) {
  if (!value) return "";
  if (type === "item" || type === "container" || type === "layout") return value.name || value.id || "";
  return String(value.id || "");
}

function historyContainerName(targetState, containerId, localText = historyRuText) {
  const id = String(containerId || "");
  if (!id) return localText("outside the layout", "вне укладки");
  return targetState?.containers?.[id]?.name || id;
}

function historyMapKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function historyLayoutPlacementIds(layout = {}) {
  const arrangement = layout?.arrangement && typeof layout.arrangement === "object"
    ? layout.arrangement
    : {};
  return {
    containers: new Set([
      ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : []),
      ...(Array.isArray(arrangement?.rootContainerIds) ? arrangement.rootContainerIds : []),
      ...historyMapKeys(arrangement?.containers)
    ].map(String)),
    items: new Set(historyMapKeys(arrangement?.items).map(String))
  };
}

function historySetDelta(beforeSet, afterSet) {
  return {
    added: [...afterSet].filter((id) => !beforeSet.has(id)),
    removed: [...beforeSet].filter((id) => !afterSet.has(id))
  };
}

function historyLayoutPlacementDelta(fromState = {}, toState = {}) {
  const layoutIds = new Set([
    ...historyMapKeys(fromState?.layouts),
    ...historyMapKeys(toState?.layouts)
  ]);
  const changedLayouts = [...layoutIds].filter((id) => {
    const before = fromState?.layouts?.[id];
    const after = toState?.layouts?.[id];
    if (!before || !after) return false;
    const beforeIds = historyLayoutPlacementIds(before);
    const afterIds = historyLayoutPlacementIds(after);
    return !snapshotsEqual({
      containers: [...beforeIds.containers].sort(),
      items: [...beforeIds.items].sort()
    }, {
      containers: [...afterIds.containers].sort(),
      items: [...afterIds.items].sort()
    });
  });
  if (changedLayouts.length !== 1) return null;
  const layoutId = changedLayouts[0];
  const beforeLayout = fromState.layouts[layoutId];
  const afterLayout = toState.layouts[layoutId];
  const beforeIds = historyLayoutPlacementIds(beforeLayout);
  const afterIds = historyLayoutPlacementIds(afterLayout);
  return {
    layoutId,
    layoutTitle: String(afterLayout?.name || beforeLayout?.name || layoutId),
    containers: historySetDelta(beforeIds.containers, afterIds.containers),
    items: historySetDelta(beforeIds.items, afterIds.items)
  };
}

function historyLayoutPlacementAction(fromState = {}, toState = {}) {
  const delta = historyLayoutPlacementDelta(fromState, toState);
  if (!delta) return null;
  const changes = [
    ...delta.containers.added.map((id) => ({ entityType: "layoutContainers", operation: "added", id, state: toState })),
    ...delta.containers.removed.map((id) => ({ entityType: "layoutContainers", operation: "removed", id, state: fromState })),
    ...delta.items.added.map((id) => ({ entityType: "layoutItems", operation: "added", id, state: toState })),
    ...delta.items.removed.map((id) => ({ entityType: "layoutItems", operation: "removed", id, state: fromState }))
  ];
  if (changes.length !== 1) return null;
  const change = changes[0];
  const map = change.entityType === "layoutContainers" ? change.state?.containers : change.state?.items;
  return {
    entityType: change.entityType,
    operation: change.operation,
    count: 1,
    title: String(map?.[change.id]?.name || change.id),
    layoutTitle: delta.layoutTitle
  };
}

function historyLayoutPlacementDetails(beforeValue, afterValue, fromState, toState, localText) {
  const syntheticFrom = { ...fromState, layouts: { [beforeValue?.id || "layout"]: beforeValue } };
  const syntheticTo = { ...toState, layouts: { [afterValue?.id || beforeValue?.id || "layout"]: afterValue } };
  const delta = historyLayoutPlacementDelta(syntheticFrom, syntheticTo);
  if (!delta) return [];
  const rows = [];
  delta.containers.added.forEach((id) => rows.push(localText(
    `Added bag: “${toState?.containers?.[id]?.name || id}”`,
    `Добавлена сумка: «${toState?.containers?.[id]?.name || id}»`
  )));
  delta.containers.removed.forEach((id) => rows.push(localText(
    `Removed bag: “${fromState?.containers?.[id]?.name || id}”`,
    `Удалена сумка: «${fromState?.containers?.[id]?.name || id}»`
  )));
  delta.items.added.forEach((id) => rows.push(localText(
    `Added item: “${toState?.items?.[id]?.name || id}”`,
    `Добавлена вещь: «${toState?.items?.[id]?.name || id}»`
  )));
  delta.items.removed.forEach((id) => rows.push(localText(
    `Removed item: “${fromState?.items?.[id]?.name || id}”`,
    `Удалена вещь: «${fromState?.items?.[id]?.name || id}»`
  )));
  return rows;
}

function historyChangedFields(type, beforeValue, afterValue, fromState, toState, localText = historyRuText) {
  const definitions = historyFieldDefinitions(type, localText);
  const placementChanged = type === "layout" && (
    !snapshotsEqual(beforeValue?.rootContainerIds, afterValue?.rootContainerIds)
    || !snapshotsEqual(beforeValue?.arrangement, afterValue?.arrangement)
  );
  const placementDetails = placementChanged
    ? historyLayoutPlacementDetails(beforeValue, afterValue, fromState, toState, localText)
    : [];
  const rows = definitions
    .filter(([key]) => !(placementChanged && (key === "rootContainerIds" || key === "arrangement")))
    .filter(([key]) => !snapshotsEqual(beforeValue?.[key], afterValue?.[key]))
    .map(([key, label, format]) => {
      const before = formatHistoryDiffValue(beforeValue?.[key], format, fromState, localText);
      const after = formatHistoryDiffValue(afterValue?.[key], format, toState, localText);
      return `${label}: ${before} → ${after}`;
    });
  if (placementChanged && !placementDetails.length) {
    const beforeRoots = Array.isArray(beforeValue?.rootContainerIds) ? beforeValue.rootContainerIds : [];
    const afterRoots = Array.isArray(afterValue?.rootContainerIds) ? afterValue.rootContainerIds : [];
    if (!snapshotsEqual(beforeRoots, afterRoots)) {
      rows.push(localText(
        `Changed bag order: ${formatLayoutRootOrder(afterRoots, toState, localText)}`,
        `Изменён порядок сумок: ${formatLayoutRootOrder(afterRoots, toState, localText)}`
      ));
    } else {
      rows.push(localText("Changed bag or item placement", "Изменено размещение сумок или вещей"));
    }
  }
  return [...placementDetails, ...rows];
}

function formatLayoutRootOrder(value, targetState, localText = historyRuText) {
  if (!Array.isArray(value) || !value.length) return localText("empty", "пусто");
  return value.map((id) => targetState?.containers?.[id]?.name || id).join(" → ");
}

function formatHistoryDiffValue(value, format = "", targetState = {}, localText = historyRuText) {
  if (value == null || value === "") return localText("empty", "пусто");
  if (format === "weight") return formatWeight(parseWeightInput(value));
  if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || localText("empty", "пусто") : String(value);
  if (format === "container") return historyContainerName(targetState, value, localText);
  if (format === "photos") return Array.isArray(value)
    ? localText(`${value.length} photos`, `${value.length} фото`)
    : (value ? localText("yes", "есть") : localText("no", "нет"));
  if (format === "count") return Array.isArray(value) ? `${value.length}` : formatCompactJson(value);
  if (format === "arrangement") {
    if (!value || typeof value !== "object") return localText("empty", "пусто");
    const containers = value.containers && typeof value.containers === "object" ? Object.keys(value.containers).length : 0;
    const items = value.items && typeof value.items === "object" ? Object.keys(value.items).length : 0;
    const roots = Array.isArray(value.rootContainerIds) ? value.rootContainerIds.length : 0;
    return localText(
      `${roots} root bags, ${containers} bags, ${items} items`,
      `${roots} корневых, ${containers} сумок, ${items} вещей`
    );
  }
  if (format === "availability") {
    const status = String(value || "available");
    if (status === "lost") return localText("lost", "потеряно");
    if (status === "broken") return localText("broken", "сломано");
    if (status === "retired") return localText("retired", "больше не используется");
    return localText("available", "доступно");
  }
  if (format === "boolean") return value ? localText("yes", "да") : localText("no", "нет");
  if (Array.isArray(value)) return value.length ? value.join(", ") : localText("empty", "пусто");
  if (typeof value === "object") return formatCompactJson(value);
  return String(value);
}

function diffHistoryPacked(fromPacked, toPacked, fromState, toState, localText = historyRuText) {
  const changed = [];
  const ids = new Set([...Object.keys(fromPacked || {}), ...Object.keys(toPacked || {})]);
  ids.forEach((itemId) => {
    const before = Boolean(fromPacked?.[itemId]);
    const after = Boolean(toPacked?.[itemId]);
    if (before === after) return;
    const item = toState.items?.[itemId] || fromState.items?.[itemId] || { name: itemId };
    changed.push({
      title: item.name || itemId,
      details: [`${before ? localText("packed", "собрано") : localText("not packed", "не собрано")} → ${after ? localText("packed", "собрано") : localText("not packed", "не собрано")}`]
    });
  });
  return { added: [], removed: [], changed };
}

function diffHistorySettings(fromState, toState, localText = historyRuText) {
  const changed = [];
  const fields = [
    ["locations", localText("Storage locations", "Места хранения"), "list"],
    ["categories", localText("Categories", "Категории"), "list"],
    ["showItemMeta", localText("Item metadata", "Метаданные вещей"), "boolean"],
    ["collectionMode", localText("Packing mode", "Режим сбора"), "boolean"],
    ["showOnlyUnpacked", localText("Unpacked only", "Только несобранное"), "boolean"],
    ["activeLayoutId", localText("Active layout", "Активная укладка"), ""]
  ];
  fields.forEach(([key, label, format]) => {
    if (snapshotsEqual(fromState?.[key], toState?.[key])) return;
    changed.push({
      title: label,
      details: [`${formatHistoryDiffValue(fromState?.[key], format, fromState, localText)} → ${formatHistoryDiffValue(toState?.[key], format, toState, localText)}`]
    });
  });
  return { added: [], removed: [], changed };
}

export function renderHistoryDiffSection(title, diff, {
  localText = historyRuText
} = {}) {
  if (!diff) return "";
  const added = diff.added || [];
  const removed = diff.removed || [];
  const changed = diff.changed || [];
  if (!added.length && !removed.length && !changed.length) return "";
  return `
    <section class="history-diff-section">
      <h4>${escapeHtml(title)}</h4>
      ${renderHistoryDiffGroup(localText("Added", "Добавлено"), added, "added", localText)}
      ${renderHistoryDiffGroup(localText("Removed", "Удалено"), removed, "removed", localText)}
      ${renderHistoryDiffGroup(localText("Changed", "Изменено"), changed, "changed", localText)}
    </section>
  `;
}

export function renderHistoryRecordArticle(record, index, records, {
  activeSource = "private",
  formatDateTime = (value) => String(value || ""),
  localText = historyRuText,
  latestRestoreText = "Отменить последний шаг",
  publishText = "Опубликовать",
  recordKey = (_record, recordIndex) => String(recordIndex),
  recordMetaText = () => "",
  recordState = () => null,
  recordTitle = (_record, _payload, fallback) => fallback || "",
  restoreTextForRecord = null,
  restoreText = "Восстановить",
  showTitle = true
} = {}) {
  const key = recordKey(record, index);
  const payload = recordState(record);
  const title = recordTitle(record, payload, localText("Untitled", "Без названия"));
  const createdAt = formatDateTime(record.createdAt || record.created_at);
  const device = String(record.sourceDeviceName || record.source_device_name || "").trim();
  const context = String(recordMetaText(record, payload, index, records) || "").trim();
  const actionRestoreText = typeof restoreTextForRecord === "function"
    ? restoreTextForRecord(record, index, records)
    : (activeSource === "private" ? (index === 0 ? latestRestoreText : restoreText) : publishText);
  const meta = [
    context,
    device
  ].filter(Boolean).join(" · ");
  return `
    <article class="history-record" data-history-record="${escapeHtml(key)}" tabindex="0" role="button">
      <div class="history-record-main">
        <strong>${escapeHtml(createdAt || localText("no date", "без даты"))}</strong>
        ${showTitle ? `<p class="history-record-title">${escapeHtml(title)}</p>` : ""}
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </div>
      <div class="history-record-actions">
        <button type="button" class="ghost" data-history-detail="${escapeHtml(key)}">${escapeHtml(localText("Details", "Детали"))}</button>
        <button type="button" class="ghost history-action-button" data-history-action-button data-restore-history="${escapeHtml(key)}" aria-label="${escapeHtml(actionRestoreText)}">${escapeHtml(actionRestoreText)}</button>
      </div>
    </article>
  `;
}

export function syncHistoryActionButtonTooltips(root) {
  root?.querySelectorAll?.("[data-history-action-button]").forEach((button) => {
    const fullText = String(button.textContent || "").trim();
    if (fullText) button.setAttribute("aria-label", fullText);
    const truncated = button.scrollWidth > button.clientWidth + 1;
    if (truncated && fullText) {
      button.setAttribute("title", fullText);
      button.dataset.touchTooltip = fullText;
      return;
    }
    button.removeAttribute("title");
    delete button.dataset.touchTooltip;
  });
}

export function renderHistoryRecordDetails(record, index, records, {
  activeSource = "private",
  currentComparisonState = () => null,
  formatDateTime = (value) => String(value || ""),
  localText = historyRuText,
  recordState = () => null,
  recordTitle = (_record, _payload, fallback) => fallback || "",
  restoreComparisonTitle = "Изменения этого шага относительно следующей версии",
  summarizePayload = () => ""
} = {}) {
  const payload = recordState(record);
  const summary = summarizePayload(payload, { record, source: activeSource, includeTitle: false, localText });
  const createdAt = formatDateTime(record.createdAt || record.created_at);
  const sourceAt = formatDateTime(record.sourceUpdatedAt || record.source_updated_at);
  const device = String(record.sourceDeviceName || record.source_device_name || "").trim();
  const meta = [
    device,
    sourceAt ? localText(`changed: ${sourceAt}`, `изменение: ${sourceAt}`) : ""
  ].filter(Boolean).join(" · ");
  return `
    <div class="history-detail-meta">
      <strong>${escapeHtml(createdAt || localText("no date", "без даты"))}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      <p>${escapeHtml(summary)}</p>
    </div>
    ${renderHistoryRecordComparison(record, index, records, {
      currentComparisonState,
      localText,
      recordState,
      restoreComparisonTitle
    })}
  `;
}

function renderHistoryRecordComparison(record, index, records, {
  currentComparisonState,
  localText = historyRuText,
  recordState,
  restoreComparisonTitle
} = {}) {
  const targetLabel = restoreComparisonTitle;
  if (record?.action?.entityType === "templates" && record.action.operation === "removed") {
    const title = String(record.action.title || "").trim();
    const text = title
      ? localText(
        `The template “${title}” was removed from the public list. Its data, history, and available photos were retained.`,
        `Шаблон «${title}» удалён из публичного списка. Его данные, история и доступные фотографии сохранены.`
      )
      : localText(
        "The template was removed from the public list. Its data, history, and available photos were retained.",
        "Шаблон удалён из публичного списка. Его данные, история и доступные фотографии сохранены."
      );
    return `<div class="history-record-details"><h3>${escapeHtml(targetLabel)}</h3><p>${escapeHtml(text)}</p></div>`;
  }
  const selectedState = recordState(record);
  const currentState = currentComparisonState();
  const newerRecord = historyNewerRecord(record, index, records);
  const newerState = newerRecord ? recordState(newerRecord) : currentState;
  const fromState = selectedState;
  const toState = newerState;
  if (!fromState || !toState) {
    return `<div class="history-record-details"><p class="history-diff-empty">${escapeHtml(localText("This history entry could not be compared.", "Не удалось сравнить эту запись истории."))}</p></div>`;
  }
  const diff = buildHistoryStateDiff(fromState, toState, { localText });
  const sections = [
    renderHistoryDiffSection(localText("Items", "Вещи"), diff.items, { localText }),
    renderHistoryDiffSection(localText("Bags and places", "Сумки и места"), diff.containers, { localText }),
    renderHistoryDiffSection(localText("Layouts", "Укладки"), diff.layouts, { localText }),
    renderHistoryDiffSection(localText("Packing status", "Собранность"), diff.packed, { localText }),
    renderHistoryDiffSection(localText("Lists and settings", "Справочники и настройки"), diff.settings, { localText })
  ].filter(Boolean).join("");
  return `
    <div class="history-record-details">
      <h3>${escapeHtml(targetLabel)}</h3>
      ${sections || `<p class="history-diff-empty">${escapeHtml(localText("No user-visible changes found.", "Пользовательских изменений не найдено."))}</p>`}
    </div>
  `;
}

function renderHistoryDiffGroup(title, rows, mode, localText = historyRuText) {
  if (!rows?.length) return "";
  return `
    <div class="history-diff-group ${escapeHtml(mode)}">
      <strong>${escapeHtml(title)}: ${rows.length}</strong>
      <ul>
        ${rows.map((row) => `
          <li>
            <span>${escapeHtml(row.title || localText("untitled", "без названия"))}</span>
            ${Array.isArray(row.details)
              ? `<small>${row.details.map((detail) => escapeHtml(detail)).join("<br>")}</small>`
              : row.details
                ? `<small>${escapeHtml(row.details)}</small>`
                : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}
