import { clonePlain } from "../utils/json.js";
import { nowIso } from "../utils/time.js";

export function createSharedLayoutsByLanguage(layouts) {
  const ruLayouts = layouts;
  const enLayouts = clonePlain(layouts).map((layout) => ({
    ...layout,
    id: `${layout.id}-en`,
    name: layout.name === "Bikepacking reference" ? "Bikepacking reference" : layout.name,
    subtitle: "Shared layout",
    language: "en"
  }));
  ruLayouts.forEach((layout) => {
    layout.language = "ru";
  });
  return { ru: ruLayouts, en: enLayouts };
}

export function normalizeSharedGearName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function sharedGearPhotos(gear, changedAt = nowIso()) {
  if (!gear.imageUrl) return [];
  return [{
    id: `shared-photo-${gear.id}`,
    localId: "",
    status: "synced",
    url: gear.imageUrl,
    thumbUrl: gear.imageUrl,
    fileName: "",
    type: "",
    size: 0,
    width: 0,
    height: 0,
    createdAt: changedAt,
    updatedAt: changedAt,
    error: ""
  }];
}
