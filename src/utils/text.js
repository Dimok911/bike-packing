export function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatThingCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export function looksLikeMojibakeText(value = "") {
  const text = String(value || "");
  if (!text) return false;
  return /(?:Р.|С.|Ð|Ñ|�)/.test(text);
}
