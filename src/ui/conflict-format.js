import { formatShortDateTime } from "./date-format.js";
import {
  formatCompactJson,
  snapshotsEqual
} from "../utils/json.js";
import {
  formatWeight,
  parseWeightInput
} from "../utils/weight.js";
import { currentDocumentLanguage } from "../utils/language.js";

const documentLocalText = (en, ru) => currentDocumentLanguage() === "en" ? en : ru;

export function conflictVersionStamp(value, exists, fallbackDevice, missingText = documentLocalText("not available", "нет")) {
  if (!exists) return missingText;
  const device = value?.updatedByDeviceName || fallbackDevice || documentLocalText("device", "устройство");
  const time = formatShortDateTime(value?.updatedAt);
  return time ? `${device}, ${time}` : device;
}

export function describeChangedFields(localValue, remoteValue, fields, {
  maxLabels = 4,
  fallback = documentLocalText("technical data", "служебные данные")
} = {}) {
  const changed = fields
    .filter(([key]) => !snapshotsEqual(localValue?.[key], remoteValue?.[key]))
    .map(([, label]) => label);
  if (changed.length) return changed.slice(0, maxLabels).join(", ") + (changed.length > maxLabels ? "…" : "");
  return fallback;
}

export function formatArrangementConflictValue(value, { localText = documentLocalText } = {}) {
  if (!value || typeof value !== "object") return localText("empty", "пусто");
  const containers = value.containers && typeof value.containers === "object" ? Object.keys(value.containers).length : 0;
  const items = value.items && typeof value.items === "object" ? Object.keys(value.items).length : 0;
  const roots = Array.isArray(value.rootContainerIds) ? value.rootContainerIds.length : 0;
  return localText(
    `${roots} root, ${containers} bags, ${items} items`,
    `${roots} корневых, ${containers} сумок, ${items} вещей`
  );
}

export function formatMergeConflicts(conflicts, { limit = 6 } = {}) {
  return conflicts.slice(0, limit).map((conflict) => `• ${conflict.label}`).join("\n") +
    (conflicts.length > limit
      ? documentLocalText(`\n…and ${conflicts.length - limit} more`, `\n…и ещё ${conflicts.length - limit}`)
      : "");
}

export function conflictDiffFieldDefinitions(conflict, {
  settingLabel = (key) => key,
  localText = documentLocalText
} = {}) {
  if (conflict.type === "item") {
    return [
      ["name", localText("Name", "Название")],
      ["weight", localText("Weight", "Вес"), "weight"],
      ["quantity", localText("Quantity", "Количество")],
      ["location", localText("Storage location", "Место хранения")],
      ["categories", localText("Categories", "Категории"), "list"],
      ["category", localText("Category", "Категория")],
      ["containerId", localText("Stored in", "Где лежит"), "container"],
      ["note", localText("Note", "Заметка")],
      ["photos", localText("Photos", "Фото"), "photos"]
    ];
  }
  if (conflict.type === "container") {
    return [
      ["name", localText("Name", "Название")],
      ["weight", localText("Weight", "Вес"), "weight"],
      ["volume", localText("Volume", "Объём")],
      ["location", localText("Storage location", "Место хранения")],
      ["parentId", localText("Nested in", "Вложено в"), "container"],
      ["itemIds", localText("Items inside", "Вещи внутри"), "count"],
      ["childIds", localText("Nested bags", "Вложенные сумки"), "count"],
      ["order", localText("Order inside", "Порядок внутри"), "count"],
      ["note", localText("Note", "Заметка")],
      ["color", localText("Color", "Цвет")],
      ["photos", localText("Photos", "Фото"), "photos"]
    ];
  }
  if (conflict.type === "layout") {
    return [
      ["name", localText("Name", "Название")],
      ["rootContainerIds", localText("Bags in layout", "Сумки в укладке"), "count"],
      ["arrangement", localText("Arrangement", "Раскладка"), "arrangement"]
    ];
  }
  if (conflict.type === "packed") return [["value", localText("Packing status", "Собранность"), "boolean"]];
  if (conflict.type === "setting") return [["value", settingLabel(conflict.id)]];
  return [];
}

export function createConflictValueFormatter({
  getItemName = (id) => id,
  getContainerName = (id) => id,
  itemCategories = (item) => Array.isArray(item?.categories) ? item.categories : [],
  comparableValueForMerge = (_type, value) => value,
  isMetaField = () => false,
  settingLabel = (key) => key,
  localText = documentLocalText,
  valuesEqual = snapshotsEqual
} = {}) {
  const fieldDefinitions = (conflict) => conflictDiffFieldDefinitions(conflict, { settingLabel, localText });

  function formatConflictContainerValue(value) {
    const id = String(value || "");
    if (!id) return localText("outside the layout", "вне укладки");
    return getContainerName(id) || id;
  }

  function conflictContainerEntryLabel(entry, key) {
    if (key === "order" && entry && typeof entry === "object") {
      const id = String(entry.id || "");
      if (!id) return "";
      return entry.type === "container"
        ? (getContainerName(id) || id)
        : (getItemName(id) || id);
    }
    const id = String(entry || "");
    if (!id) return "";
    return key === "childIds"
      ? (getContainerName(id) || id)
      : (getItemName(id) || id);
  }

  function formatConflictCountValue(value, key, conflict) {
    if (!Array.isArray(value)) return formatCompactJson(value);
    if (conflict?.type === "container" && (key === "itemIds" || key === "childIds" || key === "order")) {
      const names = value.map((entry) => conflictContainerEntryLabel(entry, key)).filter(Boolean);
      if (!names.length) return "0";
      return `${value.length}: ${names.slice(0, 4).join(" → ")}${names.length > 4 ? "…" : ""}`;
    }
    return `${value.length}`;
  }

  function formatConflictFieldValue(value, key, conflict, format = "") {
    if (conflict.type === "packed" && key === "value") return value ? localText("packed", "собрано") : localText("not packed", "не собрано");
    if (value == null || value === "") return localText("empty", "пусто");
    if (format === "weight") return formatWeight(parseWeightInput(value));
    if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || localText("empty", "пусто") : String(value);
    if (format === "container") return formatConflictContainerValue(value);
    if (format === "photos") return Array.isArray(value)
      ? localText(`${value.length} photos`, `${value.length} фото`)
      : (value ? localText("present", "есть") : localText("none", "нет"));
    if (format === "count") return formatConflictCountValue(value, key, conflict);
    if (format === "arrangement") return formatArrangementConflictValue(value, { localText });
    if (format === "boolean") return value ? localText("yes", "да") : localText("no", "нет");
    if (Array.isArray(value)) return value.length ? value.join(", ") : localText("empty", "пусто");
    if (typeof value === "object") return formatCompactJson(value);
    return String(value);
  }

  function conflictDetailRows(conflict) {
    if (!conflict.localHas || !conflict.remoteHas) {
      return [{
        label: localText("Status", "Статус"),
        local: conflict.localHas ? localText("available locally", "есть локально") : localText("not available locally", "нет локально"),
        remote: conflict.remoteHas ? localText("available in the server layout", "есть в серверной укладке") : localText("not in the server layout", "нет в серверной укладке")
      }];
    }
    const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
    const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
    if (valuesEqual(localValue, remoteValue)) return [];
    if (conflict.type === "packed" || conflict.type === "setting") {
      return [{
        label: conflict.type === "packed" ? localText("Packing status", "Собранность") : settingLabel(conflict.id),
        local: formatConflictFieldValue(localValue, "value", conflict, conflict.type === "packed" ? "boolean" : ""),
        remote: formatConflictFieldValue(remoteValue, "value", conflict, conflict.type === "packed" ? "boolean" : "")
      }];
    }
    const rows = fieldDefinitions(conflict)
      .filter(([key]) => !valuesEqual(localValue?.[key], remoteValue?.[key]))
      .map(([key, label, format]) => ({
        label,
        local: formatConflictFieldValue(localValue?.[key], key, conflict, format),
        remote: formatConflictFieldValue(remoteValue?.[key], key, conflict, format)
      }));
    const knownKeys = new Set(fieldDefinitions(conflict).map(([key]) => key));
    Object.keys({ ...(localValue || {}), ...(remoteValue || {}) })
      .filter((key) => !knownKeys.has(key) && !isMetaField(key))
      .filter((key) => !valuesEqual(localValue?.[key], remoteValue?.[key]))
      .slice(0, Math.max(0, 8 - rows.length))
      .forEach((key) => {
        rows.push({
          label: key,
          local: formatConflictFieldValue(localValue?.[key], key, conflict),
          remote: formatConflictFieldValue(remoteValue?.[key], key, conflict)
        });
      });
    return rows.slice(0, 8);
  }

  function conflictValueSummary(conflict, value, exists, missingText = localText("not available", "нет")) {
    if (!exists) return missingText;
    if (conflict.type === "item") {
      return [value.name, value.location, itemCategories(value).join(", ")].filter(Boolean).join(" · ") || localText("changed", "изменено");
    }
    if (conflict.type === "container" || conflict.type === "layout") return value.name || localText("changed", "изменено");
    if (conflict.type === "packed") return value ? localText("packed", "собрано") : localText("not packed", "не собрано");
    if (conflict.type === "collapsed") return value ? localText("collapsed", "свернуто") : localText("expanded", "развернуто");
    if (conflict.type === "setting") return String(value);
    return localText("changed", "изменено");
  }

  function conflictDifferenceSummary(conflict) {
    if (!conflict.localHas || !conflict.remoteHas) return "";
    const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
    const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
    if (valuesEqual(localValue, remoteValue)) return "";
    if (conflict.type === "item") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", localText("name", "название")],
        ["weight", localText("weight", "вес")],
        ["quantity", localText("quantity", "количество")],
        ["location", localText("location", "место")],
        ["category", localText("category", "категория")],
        ["categories", localText("categories", "категории")],
        ["containerId", localText("bag/place", "сумка/пакет")],
        ["note", localText("note", "заметка")],
        ["photos", localText("photos", "фото")]
      ]);
    }
    if (conflict.type === "container") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", localText("name", "название")],
        ["weight", localText("weight", "вес")],
        ["volume", localText("volume", "объём")],
        ["location", localText("location", "место")],
        ["note", localText("note", "заметка")],
        ["color", localText("color", "цвет")],
        ["itemIds", localText("contents", "состав")],
        ["childIds", localText("nested bags", "вложенные сумки")],
        ["order", localText("order inside", "порядок внутри")],
        ["parentId", localText("placement", "расположение")],
        ["photos", localText("photos", "фото")]
      ]);
    }
    if (conflict.type === "layout") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", localText("name", "название")],
        ["rootContainerIds", localText("bags in layout", "сумки в укладке")],
        ["arrangement", localText("column arrangement", "раскладка колонок")]
      ]);
    }
    if (conflict.type === "packed") return localText("packing status", "собранность");
    if (conflict.type === "setting") return settingLabel(conflict.id);
    return "";
  }

  return {
    conflictDetailRows,
    conflictDiffFieldDefinitions: fieldDefinitions,
    conflictDifferenceSummary,
    conflictValueSummary,
    formatConflictFieldValue
  };
}
