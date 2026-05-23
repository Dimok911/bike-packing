export function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
