import { currentDocumentLanguage } from "./language.js";

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  const english = currentDocumentLanguage() === "en";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} ${english ? "MB" : "МБ"}`;
  if (value >= 1024) return `${Math.round(value / 1024)} ${english ? "KB" : "КБ"}`;
  return `${value} ${english ? "B" : "Б"}`;
}
