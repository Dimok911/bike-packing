import { snapshotsEqual } from "../utils/json.js";

function historyTimeValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortHistoryRecords(records) {
  return records
    .filter((record) => record && typeof record === "object")
    .sort((a, b) => {
      const byDate = historyTimeValue(b.createdAt || b.created_at) - historyTimeValue(a.createdAt || a.created_at);
      if (byDate) return byDate;
      return Number(b.id || 0) - Number(a.id || 0);
    });
}

export function restorableHistoryRecords(records, currentState, {
  recordState = (record) => record?.payload || null,
  statesDiffer = (left, right) => !snapshotsEqual(left, right)
} = {}) {
  const sortedRecords = sortHistoryRecords(Array.isArray(records) ? records : []);
  const restorable = sortedRecords.filter((record) => {
    const snapshot = recordState(record);
    return snapshot && (!currentState || statesDiffer(snapshot, currentState));
  });
  const detailedDaysByList = new Map();
  restorable.forEach((record) => {
    if (String(record?.snapshotKind || record?.snapshot_kind || "undo") === "daily") return;
    const listKey = String(record?.listId || record?.list_id || "default");
    const day = historyRecordDay(record);
    if (!day) return;
    if (!detailedDaysByList.has(listKey)) detailedDaysByList.set(listKey, new Set());
    detailedDaysByList.get(listKey).add(day);
  });

  const uniqueSnapshotsByList = new Map();
  return restorable.filter((record) => {
    const listKey = String(record?.listId || record?.list_id || "default");
    const kind = String(record?.snapshotKind || record?.snapshot_kind || "undo");
    if (kind === "daily" && detailedDaysByList.get(listKey)?.has(historyRecordDay(record))) return false;
    const snapshot = recordState(record);
    const previousSnapshots = uniqueSnapshotsByList.get(listKey) || [];
    if (previousSnapshots.some((previous) => !statesDiffer(previous, snapshot))) return false;
    previousSnapshots.push(snapshot);
    uniqueSnapshotsByList.set(listKey, previousSnapshots);
    return true;
  });
}

export function historyRecordDay(record) {
  const explicit = String(record?.snapshotDay || record?.snapshot_day || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const value = record?.createdAt || record?.created_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function historyRecordRestoreLayoutIds(record) {
  const kind = String(record?.snapshotKind || record?.snapshot_kind || "undo");
  const scope = String(record?.changeScope || record?.change_scope || "");
  const ids = Array.isArray(record?.affectedLayoutIds)
    ? record.affectedLayoutIds
    : Array.isArray(record?.affected_layout_ids)
      ? record.affected_layout_ids
      : [];
  const normalizedIds = [...new Set(ids.map((value) => String(value || "").trim()).filter(Boolean))];
  return kind === "undo" && scope === "layout" && normalizedIds.length === 1 ? normalizedIds : [];
}

export function historyRecordScopeText(record, payload, {
  daily = "Daily checkpoint",
  global = "Shared data",
  layout = (name) => `Layout: ${name}`,
  multiple = "Multiple layouts"
} = {}) {
  const kind = String(record?.snapshotKind || record?.snapshot_kind || "undo");
  if (kind === "daily") return daily;
  const scope = String(record?.changeScope || record?.change_scope || "");
  if (scope === "global") return global;
  if (scope === "multiple") return multiple;
  const layoutId = historyRecordRestoreLayoutIds(record)[0] || "";
  if (!layoutId) return "";
  const name = String(payload?.layouts?.[layoutId]?.name || layoutId).trim() || layoutId;
  return layout(name);
}

export function historyRecordPayload(record) {
  return (
    record?.payload ||
    record?.state ||
    record?.assembledState ||
    record?.assembled_state ||
    record?.serverPayload ||
    record?.record?.payload ||
    record?.record?.state ||
    record?.record?.assembledState ||
    record?.record?.assembled_state
  );
}

export function historyRecordState(record, source = "private", {
  normalizePublishedStatePayload,
  normalizeRemoteState
} = {}) {
  const payload = historyRecordPayload(record);
  return source === "demo" || source === "shared"
    ? normalizePublishedStatePayload?.(payload)
    : normalizeRemoteState?.(payload);
}

export function historyRecordKey(record, index = 0) {
  const source = String(record?.source || "").trim();
  const listId = String(record?.listId || record?.list_id || record?.list?.id || "").trim();
  const id = String(record?.id ?? record?.createdAt ?? record?.created_at ?? index).trim();
  return [source, listId, id || String(index)].filter(Boolean).join("::");
}

export function historyRecordStreamKey(record) {
  return String(
    record?.listId ||
    record?.list_id ||
    record?.itemKey ||
    record?.item_key ||
    record?.source ||
    "default"
  ).trim() || "default";
}

export function historyNewerRecord(record, index, records = []) {
  const streamKey = historyRecordStreamKey(record);
  for (let candidateIndex = Number(index) - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = records[candidateIndex];
    if (historyRecordStreamKey(candidate) === streamKey) return candidate;
  }
  return null;
}

export function historyRollbackImpact(record, index, records = []) {
  const streamKey = historyRecordStreamKey(record);
  const newerRecords = records.slice(0, Math.max(0, Number(index) || 0))
    .filter((candidate) => historyRecordStreamKey(candidate) === streamKey);
  return {
    isDeepRollback: newerRecords.length > 0,
    newerActionCount: newerRecords.filter((candidate) =>
      String(candidate?.snapshotKind || candidate?.snapshot_kind || "undo") === "undo"
    ).length,
    crossesCheckpoint: newerRecords.some((candidate) =>
      String(candidate?.snapshotKind || candidate?.snapshot_kind || "undo") === "daily"
    )
  };
}

export function historyPayloadTitle(payload, fallback = "") {
  const layout = payload?.layouts?.[payload.activeLayoutId] || Object.values(payload?.layouts || {})[0];
  return String(layout?.name || fallback || "").trim();
}

export function historyRecordTitle(record, payload = null, fallback = "") {
  const explicit = String(
    record?.listTitle ||
    record?.list_title ||
    record?.layoutTitle ||
    record?.layout_title ||
    record?.title ||
    record?.list?.title ||
    ""
  ).trim();
  return explicit || historyPayloadTitle(payload, fallback);
}

export function historySharedTemplateOptions(layouts = [], {
  languageLabel = (language) => String(language || "").toUpperCase()
} = {}) {
  const seen = new Set();
  return (Array.isArray(layouts) ? layouts : [])
    .map((layout) => {
      const id = String(layout?.id || "").trim();
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const language = String(layout?.language || "").trim().toLowerCase();
      const name = String(layout?.name || id).trim() || id;
      return {
        id,
        name,
        language,
        label: language ? `${name} · ${languageLabel(language)}` : name
      };
    })
    .filter(Boolean);
}

export function groupHistoryRecords(records, {
  source = "private",
  normalizePublishedStatePayload,
  normalizeRemoteState,
  fallbackTitle = "Без названия"
} = {}) {
  const groups = new Map();
  records.forEach((record) => {
    const payload = historyRecordState(record, source, {
      normalizePublishedStatePayload,
      normalizeRemoteState
    });
    const title = historyRecordTitle(record, payload, fallbackTitle);
    const key = title || fallbackTitle;
    if (!groups.has(key)) groups.set(key, { key, title: key, records: [] });
    groups.get(key).records.push(record);
  });
  return Array.from(groups.values());
}

export function pluralRu(count, one, few, many) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function summarizeHistoryPayload(payload, {
  record = null,
  source = "private",
  fallbackTitle = "",
  includeTitle = true,
  localText = (_english, russian) => russian
} = {}) {
  if (!payload) return localText("version not recognized", "версия не распознана");
  const itemCount = Object.keys(payload.items || {}).length;
  const containerCount = Object.keys(payload.containers || {}).length;
  const layout = payload.layouts?.[payload.activeLayoutId];
  const recordTitle = record ? historyRecordTitle(record, payload, fallbackTitle) : "";
  const visibleTitle = source === "private"
    ? recordTitle
    : layout?.name || recordTitle;
  const layoutName = includeTitle && visibleTitle ? ` · ${visibleTitle}` : "";
  return localText(
    `${itemCount} items · ${containerCount} containers${layoutName}`,
    `${itemCount} вещей · ${containerCount} контейнеров${layoutName}`
  );
}

export function formatHistoryDateTime(value, { language = "ru" } = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(String(language).toLowerCase().startsWith("en") ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
