import { currentDocumentLanguage } from "./language.js";

export function parseWeightInput(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

export function parseVolumeInput(value) {
  const number = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 10) / 10;
}

function localizedNumber(value, language) {
  const text = String(value);
  return language === "ru" ? text.replace(".", ",") : text;
}

export function formatVolume(liters) {
  const number = Number(liters || 0);
  const language = currentDocumentLanguage();
  const unit = language === "ru" ? "л" : "l";
  if (!number) return `0 ${unit}`;
  return `${localizedNumber(number, language)} ${unit}`;
}

export function formatWeight(grams) {
  const language = currentDocumentLanguage();
  const gramUnit = language === "ru" ? "г" : "g";
  const kilogramUnit = language === "ru" ? "кг" : "kg";
  if (!grams) return `0 ${gramUnit}`;
  if (grams < 1000) return `${grams} ${gramUnit}`;
  return `${localizedNumber((grams / 1000).toFixed(1), language)} ${kilogramUnit}`;
}
