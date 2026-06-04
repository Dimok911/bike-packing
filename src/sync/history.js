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
  includeTitle = true
} = {}) {
  if (!payload) return "версия не распознана";
  const itemCount = Object.keys(payload.items || {}).length;
  const containerCount = Object.keys(payload.containers || {}).length;
  const layout = payload.layouts?.[payload.activeLayoutId];
  const recordTitle = record ? historyRecordTitle(record, payload, fallbackTitle) : "";
  const visibleTitle = source === "private"
    ? recordTitle
    : layout?.name || recordTitle;
  const layoutName = includeTitle && visibleTitle ? ` · ${visibleTitle}` : "";
  return `${itemCount} вещей · ${containerCount} контейнеров${layoutName}`;
}

export function formatHistoryDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
