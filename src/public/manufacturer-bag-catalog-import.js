import { manufacturerBagContainerDraft } from "../state/manufacturer-bag-catalog.js";

function catalogImageFileName(entry, type = "image/jpeg") {
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = String(entry?.sku || entry?.id || "catalog-bag")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "catalog-bag";
  return `${base}.${extension}`;
}

export async function fetchManufacturerBagCatalogImageFile(entry, {
  fetchImpl = globalThis.fetch,
  FileCtor = globalThis.File
} = {}) {
  const imageUrl = String(entry?.imageUrl || "").trim();
  if (!imageUrl || typeof fetchImpl !== "function") return null;
  const response = await fetchImpl(imageUrl, {
    cache: "force-cache",
    credentials: "same-origin"
  });
  if (!response?.ok) throw new Error(`catalog-image-http-${Number(response?.status) || 0}`);
  const blob = await response.blob();
  const type = String(blob?.type || "image/jpeg").toLocaleLowerCase();
  if (!blob?.size || !type.startsWith("image/")) throw new Error("catalog-image-invalid");
  const name = catalogImageFileName(entry, type);
  if (typeof FileCtor === "function") {
    return new FileCtor([blob], name, { type, lastModified: Date.now() });
  }
  try {
    Object.defineProperty(blob, "name", { value: name, configurable: true });
  } catch {
    // Blob metadata is optional; the bytes and MIME type are sufficient.
  }
  return blob;
}

export async function prepareManufacturerBagCatalogImport(entry, {
  createPhotoFromFile,
  fetchImageFile = fetchManufacturerBagCatalogImageFile
} = {}) {
  const draft = manufacturerBagContainerDraft(entry);
  if (!draft) return null;
  if (typeof createPhotoFromFile !== "function") return { draft, photo: null };
  const file = await fetchImageFile(entry);
  const photo = file ? await createPhotoFromFile(file) : null;
  return { draft, photo };
}
