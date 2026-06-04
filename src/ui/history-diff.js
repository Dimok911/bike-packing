import { itemCategories } from "../state/normalize.js";
import { comparableValueForMerge } from "../sync/conflict-merge.js";
import { isConflictMetaField } from "../sync/conflict-meta.js";
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
  conflictDiffFieldDefinitions,
  formatArrangementConflictValue
} from "./conflict-format.js";

export function buildHistoryStateDiff(fromState = {}, toState = {}) {
  return {
    items: diffHistoryMap("item", fromState.items || {}, toState.items || {}, fromState, toState),
    containers: diffHistoryMap("container", fromState.containers || {}, toState.containers || {}, fromState, toState),
    layouts: diffHistoryMap("layout", fromState.layouts || {}, toState.layouts || {}, fromState, toState),
    packed: diffHistoryPacked(fromState.packedItems || {}, toState.packedItems || {}, fromState, toState),
    settings: diffHistorySettings(fromState, toState)
  };
}

function diffHistoryMap(type, fromMap, toMap, fromState, toState) {
  const added = [];
  const removed = [];
  const changed = [];
  const ids = new Set([...Object.keys(fromMap || {}), ...Object.keys(toMap || {})]);
  ids.forEach((id) => {
    const before = fromMap?.[id];
    const after = toMap?.[id];
    if (!before && after) {
      added.push(historyEntityLine(type, id, after, toState, "added"));
      return;
    }
    if (before && !after) {
      removed.push(historyEntityLine(type, id, before, fromState, "removed"));
      return;
    }
    const beforeValue = historyComparableEntity(type, before);
    const afterValue = historyComparableEntity(type, after);
    if (!snapshotsEqual(beforeValue, afterValue)) {
      changed.push({
        title: historyEntityTitle(type, after || before) || id,
        details: historyChangedFields(type, beforeValue, afterValue, fromState, toState)
      });
    }
  });
  return { added, removed, changed };
}

function historyComparableEntity(type, value) {
  const comparable = comparableValueForMerge(type, value) || {};
  const cloned = JSON.parse(JSON.stringify(comparable));
  Object.keys(cloned).forEach((key) => {
    if (isConflictMetaField(key)) delete cloned[key];
  });
  return cloned;
}

function historyEntityLine(type, id, value, targetState, mode) {
  const title = historyEntityTitle(type, value) || id;
  const meta = [];
  if (type === "item") {
    if (value?.containerId) meta.push(historyContainerName(targetState, value.containerId));
    if (itemCategories(value).length) meta.push(itemCategories(value).join(", "));
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "container") {
    const count = Array.isArray(value?.itemIds) ? value.itemIds.length : 0;
    if (count) meta.push(`${count} вещей`);
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "layout") {
    const roots = Array.isArray(value?.rootContainerIds) ? value.rootContainerIds.length : 0;
    meta.push(`${roots} корневых сумок`);
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

function historyContainerName(targetState, containerId) {
  const id = String(containerId || "");
  if (!id) return "вне укладки";
  return targetState?.containers?.[id]?.name || id;
}

function historyChangedFields(type, beforeValue, afterValue, fromState, toState) {
  const definitions = conflictDiffFieldDefinitions({ type });
  const rows = definitions
    .filter(([key]) => !snapshotsEqual(beforeValue?.[key], afterValue?.[key]))
    .map(([key, label, format]) => {
      const before = formatHistoryDiffValue(beforeValue?.[key], format, fromState);
      const after = formatHistoryDiffValue(afterValue?.[key], format, toState);
      return `${label}: ${before} -> ${after}`;
    });
  const knownKeys = new Set(definitions.map(([key]) => key));
  Object.keys({ ...(beforeValue || {}), ...(afterValue || {}) })
    .filter((key) => !knownKeys.has(key) && !isConflictMetaField(key))
    .filter((key) => !snapshotsEqual(beforeValue?.[key], afterValue?.[key]))
    .forEach((key) => rows.push(`${key}: ${formatCompactJson(beforeValue?.[key])} -> ${formatCompactJson(afterValue?.[key])}`));
  return rows;
}

function formatHistoryDiffValue(value, format = "", targetState = {}) {
  if (value == null || value === "") return "пусто";
  if (format === "weight") return formatWeight(parseWeightInput(value));
  if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || "пусто" : String(value);
  if (format === "container") return historyContainerName(targetState, value);
  if (format === "photos") return Array.isArray(value) ? `${value.length} фото` : (value ? "есть" : "нет");
  if (format === "count") return Array.isArray(value) ? `${value.length}` : formatCompactJson(value);
  if (format === "arrangement") return formatArrangementConflictValue(value);
  if (format === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "пусто";
  if (typeof value === "object") return formatCompactJson(value);
  return String(value);
}

function diffHistoryPacked(fromPacked, toPacked, fromState, toState) {
  const changed = [];
  const ids = new Set([...Object.keys(fromPacked || {}), ...Object.keys(toPacked || {})]);
  ids.forEach((itemId) => {
    const before = Boolean(fromPacked?.[itemId]);
    const after = Boolean(toPacked?.[itemId]);
    if (before === after) return;
    const item = toState.items?.[itemId] || fromState.items?.[itemId] || { name: itemId };
    changed.push({
      title: item.name || itemId,
      details: [`${before ? "собрано" : "не собрано"} -> ${after ? "собрано" : "не собрано"}`]
    });
  });
  return { added: [], removed: [], changed };
}

function diffHistorySettings(fromState, toState) {
  const changed = [];
  const fields = [
    ["locations", "Места хранения", "list"],
    ["categories", "Категории", "list"],
    ["showItemMeta", "Метаданные вещей", "boolean"],
    ["collectionMode", "Режим сбора", "boolean"],
    ["showOnlyUnpacked", "Только несобранное", "boolean"],
    ["activeLayoutId", "Активная укладка", ""]
  ];
  fields.forEach(([key, label, format]) => {
    if (snapshotsEqual(fromState?.[key], toState?.[key])) return;
    changed.push({
      title: label,
      details: [`${formatHistoryDiffValue(fromState?.[key], format, fromState)} -> ${formatHistoryDiffValue(toState?.[key], format, toState)}`]
    });
  });
  return { added: [], removed: [], changed };
}

export function renderHistoryDiffSection(title, diff) {
  if (!diff) return "";
  const added = diff.added || [];
  const removed = diff.removed || [];
  const changed = diff.changed || [];
  if (!added.length && !removed.length && !changed.length) return "";
  return `
    <section class="history-diff-section">
      <h4>${escapeHtml(title)}</h4>
      ${renderHistoryDiffGroup("Добавлено", added, "added")}
      ${renderHistoryDiffGroup("Удалено", removed, "removed")}
      ${renderHistoryDiffGroup("Изменено", changed, "changed")}
    </section>
  `;
}

export function renderHistoryRecordArticle(record, index, records, {
  activeSource = "private",
  formatDateTime = (value) => String(value || ""),
  recordKey = (_record, recordIndex) => String(recordIndex),
  recordState = () => null,
  recordTitle = (_record, _payload, fallback) => fallback || "",
  showTitle = true
} = {}) {
  const key = recordKey(record, index);
  const payload = recordState(record);
  const title = recordTitle(record, payload, "Без названия");
  const createdAt = formatDateTime(record.createdAt || record.created_at);
  const sourceAt = formatDateTime(record.sourceUpdatedAt || record.source_updated_at);
  const device = String(record.sourceDeviceName || record.source_device_name || "").trim();
  const meta = [
    device,
    sourceAt ? `изменение: ${sourceAt}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <article class="history-record" data-history-record="${escapeHtml(key)}" tabindex="0" role="button">
      <div class="history-record-main">
        <strong>${escapeHtml(createdAt || "без даты")}</strong>
        ${showTitle ? `<p class="history-record-title">${escapeHtml(title)}</p>` : ""}
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </div>
      <div class="history-record-actions">
        <button type="button" class="ghost" data-history-detail="${escapeHtml(key)}">Детали</button>
        <button type="button" class="ghost" data-restore-history="${escapeHtml(key)}">${activeSource === "private" ? "Восстановить" : "Опубликовать"}</button>
      </div>
    </article>
  `;
}

export function renderHistoryRecordDetails(record, index, records, {
  activeSource = "private",
  currentComparisonState = () => null,
  formatDateTime = (value) => String(value || ""),
  recordState = () => null,
  recordTitle = (_record, _payload, fallback) => fallback || "",
  summarizePayload = () => ""
} = {}) {
  const payload = recordState(record);
  const summary = summarizePayload(payload, { record, source: activeSource, includeTitle: false });
  const createdAt = formatDateTime(record.createdAt || record.created_at);
  const sourceAt = formatDateTime(record.sourceUpdatedAt || record.source_updated_at);
  const device = String(record.sourceDeviceName || record.source_device_name || "").trim();
  const meta = [
    device,
    sourceAt ? `изменение: ${sourceAt}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <div class="history-detail-meta">
      <strong>${escapeHtml(createdAt || "без даты")}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      <p>${escapeHtml(summary)}</p>
    </div>
    ${renderHistoryRecordComparison(record, index, records, {
      currentComparisonState,
      recordState
    })}
  `;
}

function renderHistoryRecordComparison(record, index, records, {
  currentComparisonState,
  recordState
} = {}) {
  const selectedState = recordState(record);
  const previousState = records[index + 1] ? recordState(records[index + 1]) : null;
  const newerState = index === 0
    ? currentComparisonState()
    : recordState(records[index - 1]);
  const fromState = previousState || selectedState;
  const toState = previousState ? selectedState : newerState;
  const targetLabel = previousState
    ? "Изменения относительно предыдущей версии"
    : "Отличия от более новой версии";
  if (!fromState || !toState) {
    return `<div class="history-record-details"><p class="history-diff-empty">Не удалось сравнить payload этой записи.</p></div>`;
  }
  const diff = buildHistoryStateDiff(fromState, toState);
  const sections = [
    renderHistoryDiffSection("Вещи", diff.items),
    renderHistoryDiffSection("Сумки и места", diff.containers),
    renderHistoryDiffSection("Укладки", diff.layouts),
    renderHistoryDiffSection("Собранность", diff.packed),
    renderHistoryDiffSection("Справочники и настройки", diff.settings)
  ].filter(Boolean).join("");
  return `
    <div class="history-record-details">
      <h3>${escapeHtml(targetLabel)}</h3>
      ${sections || `<p class="history-diff-empty">Отличий не найдено.</p>`}
    </div>
  `;
}

function renderHistoryDiffGroup(title, rows, mode) {
  if (!rows?.length) return "";
  return `
    <div class="history-diff-group ${escapeHtml(mode)}">
      <strong>${escapeHtml(title)}: ${rows.length}</strong>
      <ul>
        ${rows.map((row) => `
          <li>
            <span>${escapeHtml(row.title || "без названия")}</span>
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
