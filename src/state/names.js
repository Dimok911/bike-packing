import { looksLikeMojibakeText } from "../utils/text.js";

export function makeCopyName(name, existingNames, suffix = "копия") {
  const baseName = `${name} ${suffix}`;
  const names = new Set([...existingNames].map((value) => String(value || "")));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

export function uniqueName(baseName, existingNames, { fallback = "Новая укладка" } = {}) {
  const base = String(baseName || fallback).trim() || fallback;
  const existing = new Set([...existingNames].map((value) => String(value || "").trim().toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

export function repairMojibakeLayoutNames(targetState, {
  fallbackNameForLayout = () => ""
} = {}) {
  if (!targetState?.layouts || typeof targetState.layouts !== "object") return false;
  let changed = false;
  Object.values(targetState.layouts).forEach((layout) => {
    if (!layout || layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId) return;
    if (!looksLikeMojibakeText(layout.name)) return;
    const fallback = String(fallbackNameForLayout(layout) || "").trim();
    if (!fallback || looksLikeMojibakeText(fallback) || layout.name === fallback) return;
    layout.name = fallback;
    changed = true;
  });
  return changed;
}
