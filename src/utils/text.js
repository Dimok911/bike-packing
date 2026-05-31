import { currentDocumentLanguage } from "./language.js";

export function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatThingCount(count) {
  if (currentDocumentLanguage() === "en") return `${count} ${count === 1 ? "item" : "items"}`;
  const abs = Math.abs(Number(count) || 0);
  const last = abs % 10;
  const lastTwo = abs % 100;
  const word = last === 1 && lastTwo !== 11
    ? "вещь"
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? "вещи"
      : "вещей";
  return `${count} ${word}`;
}

export function looksLikeMojibakeText(value = "") {
  const text = String(value || "");
  if (!text) return false;
  return /(?:Р.|С.|Ð|Ñ|�)/.test(text);
}
