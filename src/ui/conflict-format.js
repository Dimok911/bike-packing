import { formatShortDateTime } from "./date-format.js";
import {
  formatCompactJson,
  snapshotsEqual
} from "../utils/json.js";
import {
  formatWeight,
  parseWeightInput
} from "../utils/weight.js";

export function conflictVersionStamp(value, exists, fallbackDevice, missingText = "нет") {
  if (!exists) return missingText;
  const device = value?.updatedByDeviceName || fallbackDevice || "устройство";
  const time = formatShortDateTime(value?.updatedAt);
  return time ? `${device}, ${time}` : device;
}

export function describeChangedFields(localValue, remoteValue, fields, {
  maxLabels = 4,
  fallback = "служебные данные"
} = {}) {
  const changed = fields
    .filter(([key]) => !snapshotsEqual(localValue?.[key], remoteValue?.[key]))
    .map(([, label]) => label);
  if (changed.length) return changed.slice(0, maxLabels).join(", ") + (changed.length > maxLabels ? "…" : "");
  return fallback;
}

export function formatArrangementConflictValue(value) {
  if (!value || typeof value !== "object") return "пусто";
  const containers = value.containers && typeof value.containers === "object" ? Object.keys(value.containers).length : 0;
  const items = value.items && typeof value.items === "object" ? Object.keys(value.items).length : 0;
  const roots = Array.isArray(value.rootContainerIds) ? value.rootContainerIds.length : 0;
  return `${roots} корневых, ${containers} сумок, ${items} вещей`;
}

export function formatMergeConflicts(conflicts, { limit = 6 } = {}) {
  return conflicts.slice(0, limit).map((conflict) => `• ${conflict.label}`).join("\n") +
    (conflicts.length > limit ? `\n…и ещё ${conflicts.length - limit}` : "");
}

export function conflictDiffFieldDefinitions(conflict, {
  settingLabel = (key) => key
} = {}) {
  if (conflict.type === "item") {
    return [
      ["name", "Название"],
      ["weight", "Вес", "weight"],
      ["quantity", "Количество"],
      ["location", "Место хранения"],
      ["categories", "Категории", "list"],
      ["category", "Категория"],
      ["containerId", "Где лежит", "container"],
      ["note", "Заметка"],
      ["photos", "Фото", "photos"]
    ];
  }
  if (conflict.type === "container") {
    return [
      ["name", "Название"],
      ["weight", "Вес", "weight"],
      ["volume", "Объём"],
      ["location", "Место хранения"],
      ["parentId", "Вложено в", "container"],
      ["itemIds", "Вещи внутри", "count"],
      ["childIds", "Вложенные сумки", "count"],
      ["order", "Порядок внутри", "count"],
      ["note", "Заметка"],
      ["color", "Цвет"],
      ["photos", "Фото", "photos"]
    ];
  }
  if (conflict.type === "layout") {
    return [
      ["name", "Название"],
      ["rootContainerIds", "Сумки в укладке", "count"],
      ["arrangement", "Раскладка", "arrangement"]
    ];
  }
  if (conflict.type === "packed") return [["value", "Собранность", "boolean"]];
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
  valuesEqual = snapshotsEqual
} = {}) {
  const fieldDefinitions = (conflict) => conflictDiffFieldDefinitions(conflict, { settingLabel });

  function formatConflictContainerValue(value) {
    const id = String(value || "");
    if (!id) return "вне укладки";
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
    if (conflict.type === "packed" && key === "value") return value ? "собрано" : "не собрано";
    if (value == null || value === "") return "пусто";
    if (format === "weight") return formatWeight(parseWeightInput(value));
    if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || "пусто" : String(value);
    if (format === "container") return formatConflictContainerValue(value);
    if (format === "photos") return Array.isArray(value) ? `${value.length} фото` : (value ? "есть" : "нет");
    if (format === "count") return formatConflictCountValue(value, key, conflict);
    if (format === "arrangement") return formatArrangementConflictValue(value);
    if (format === "boolean") return value ? "да" : "нет";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "пусто";
    if (typeof value === "object") return formatCompactJson(value);
    return String(value);
  }

  function conflictDetailRows(conflict) {
    if (!conflict.localHas || !conflict.remoteHas) {
      return [{
        label: "Статус",
        local: conflict.localHas ? "есть локально" : "нет локально",
        remote: conflict.remoteHas ? "есть в серверной укладке" : "нет в серверной укладке"
      }];
    }
    const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
    const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
    if (valuesEqual(localValue, remoteValue)) return [];
    if (conflict.type === "packed" || conflict.type === "setting") {
      return [{
        label: conflict.type === "packed" ? "Собранность" : settingLabel(conflict.id),
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

  function conflictValueSummary(conflict, value, exists, missingText = "нет") {
    if (!exists) return missingText;
    if (conflict.type === "item") {
      return [value.name, value.location, itemCategories(value).join(", ")].filter(Boolean).join(" · ") || "изменено";
    }
    if (conflict.type === "container" || conflict.type === "layout") return value.name || "изменено";
    if (conflict.type === "packed") return value ? "собрано" : "не собрано";
    if (conflict.type === "collapsed") return value ? "свернуто" : "развернуто";
    if (conflict.type === "setting") return String(value);
    return "изменено";
  }

  function conflictDifferenceSummary(conflict) {
    if (!conflict.localHas || !conflict.remoteHas) return "";
    const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
    const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
    if (valuesEqual(localValue, remoteValue)) return "";
    if (conflict.type === "item") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", "название"],
        ["weight", "вес"],
        ["quantity", "количество"],
        ["location", "место"],
        ["category", "категория"],
        ["categories", "категории"],
        ["containerId", "сумка/пакет"],
        ["note", "заметка"],
        ["photos", "фото"]
      ]);
    }
    if (conflict.type === "container") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", "название"],
        ["weight", "вес"],
        ["volume", "объём"],
        ["location", "место"],
        ["note", "заметка"],
        ["color", "цвет"],
        ["itemIds", "состав"],
        ["childIds", "вложенные сумки"],
        ["order", "порядок внутри"],
        ["parentId", "расположение"],
        ["photos", "фото"]
      ]);
    }
    if (conflict.type === "layout") {
      return describeChangedFields(localValue, remoteValue, [
        ["name", "название"],
        ["rootContainerIds", "сумки в укладке"],
        ["arrangement", "раскладка колонок"]
      ]);
    }
    if (conflict.type === "packed") return "собранность";
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
