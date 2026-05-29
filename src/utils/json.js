export function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map((entry) => entry === undefined ? null : sortJsonValue(entry));
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      const entry = value[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") return result;
      result[key] = sortJsonValue(entry);
      return result;
    }, {});
}

export function stableStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

export function snapshotsEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

export function jsonUtf8ByteLength(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
  return unescape(encodeURIComponent(json)).length;
}

export function formatCompactJson(value, { maxLength = 80, emptyText = "пусто" } = {}) {
  const text = JSON.stringify(value ?? null);
  if (!text) return emptyText;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
