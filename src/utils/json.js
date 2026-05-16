export function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function jsonUtf8ByteLength(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
  return unescape(encodeURIComponent(json)).length;
}
