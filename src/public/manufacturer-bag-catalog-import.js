import {
  manufacturerBagCatalogImageUrls,
  manufacturerBagContainerDraft
} from "../state/manufacturer-bag-catalog.js";

function catalogImageFileName(entry, type = "image/jpeg", index = 0) {
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = String(entry?.sku || entry?.id || "catalog-bag")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "catalog-bag";
  return `${base}${index > 0 ? `-${index + 1}` : ""}.${extension}`;
}

export async function fetchManufacturerBagCatalogImageFile(entry, {
  fetchImpl = globalThis.fetch,
  FileCtor = globalThis.File,
  imageUrl = manufacturerBagCatalogImageUrls(entry)[0] || "",
  index = 0
} = {}) {
  const normalizedUrl = String(imageUrl || "").trim();
  if (!normalizedUrl || typeof fetchImpl !== "function") return null;
  const response = await fetchImpl(normalizedUrl, {
    cache: "force-cache",
    credentials: "same-origin"
  });
  if (!response?.ok) throw new Error(`catalog-image-http-${Number(response?.status) || 0}`);
  const blob = await response.blob();
  const type = String(blob?.type || "image/jpeg").toLocaleLowerCase();
  if (!blob?.size || !type.startsWith("image/")) throw new Error("catalog-image-invalid");
  const name = catalogImageFileName(entry, type, index);
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

export async function fetchManufacturerBagCatalogImageFiles(entry, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.trunc(options.limit)) : Infinity;
  const urls = manufacturerBagCatalogImageUrls(entry).slice(0, limit);
  const results = await Promise.allSettled(urls.map((imageUrl, index) => fetchManufacturerBagCatalogImageFile(entry, {
    ...options,
    imageUrl,
    index
  })));
  return results
    .filter(({ status, value }) => status === "fulfilled" && value)
    .map(({ value }) => value);
}

export async function prepareManufacturerBagCatalogImport(entry, {
  createPhotoFromFile,
  fetchImageFile,
  fetchImageFiles,
  language = "en",
  maxPhotos = Infinity
} = {}) {
  const draft = manufacturerBagContainerDraft(entry, { language });
  if (!draft) return null;
  if (typeof createPhotoFromFile !== "function") return { draft, photo: null, photos: [] };
  const files = typeof fetchImageFiles === "function"
    ? await fetchImageFiles(entry)
    : typeof fetchImageFile === "function"
      ? [await fetchImageFile(entry)].filter(Boolean)
      : await fetchManufacturerBagCatalogImageFiles(entry, { limit: maxPhotos });
  const limitedFiles = Number.isFinite(maxPhotos)
    ? files.slice(0, Math.max(0, Math.trunc(maxPhotos)))
    : files;
  const results = await Promise.allSettled(limitedFiles.map((file) => createPhotoFromFile(file)));
  const photos = results
    .filter(({ status, value }) => status === "fulfilled" && value)
    .map(({ value }) => value);
  return { draft, photo: photos[0] || null, photos };
}
