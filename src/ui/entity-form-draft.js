export const NEW_ITEM_FORM_DRAFT_STORAGE_KEY = "bike-packing-new-item-form-draft-v1";
export const NEW_CONTAINER_FORM_DRAFT_STORAGE_KEY = "bike-packing-new-container-form-draft-v1";

const ENTITY_FORM_DRAFT_VERSION = 1;
const ENTITY_FORM_DRAFT_KINDS = new Set(["item", "container"]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function jsonSafeClone(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function createNewEntityFormDraft({
  context = {},
  fields = {},
  kind = "",
  photoUploadEntityId = "",
  photos = [],
  updatedAt = ""
} = {}) {
  if (!ENTITY_FORM_DRAFT_KINDS.has(kind)) return null;
  return {
    version: ENTITY_FORM_DRAFT_VERSION,
    kind,
    updatedAt: String(updatedAt || ""),
    fields: jsonSafeClone(plainObject(fields), {}),
    context: jsonSafeClone(plainObject(context), {}),
    photos: jsonSafeClone(Array.isArray(photos) ? photos : [], []),
    photoUploadEntityId: String(photoUploadEntityId || "")
  };
}

export function parseNewEntityFormDraft(value, { kind = "" } = {}) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.version !== ENTITY_FORM_DRAFT_VERSION) return null;
  if (!ENTITY_FORM_DRAFT_KINDS.has(parsed.kind)) return null;
  if (kind && parsed.kind !== kind) return null;
  return createNewEntityFormDraft(parsed);
}

export function entityFormDraftStorageKey(kind = "") {
  return kind === "container"
    ? NEW_CONTAINER_FORM_DRAFT_STORAGE_KEY
    : NEW_ITEM_FORM_DRAFT_STORAGE_KEY;
}
