import { manufacturerBagCatalogImageUrls } from "../state/manufacturer-bag-catalog.js";
import { renderPhotoDots } from "./photo-gallery.js";

export function renderManufacturerCatalogPhotoGallery(entry, {
  className = "",
  deferImages = false,
  escapeHtml = (value) => String(value || ""),
  safeImageUrl = (value) => String(value || ""),
  t = (key, params = {}) => params.count ? `${key} ${params.count}` : key
} = {}) {
  const imageUrls = manufacturerBagCatalogImageUrls(entry)
    .map((value) => safeImageUrl(value))
    .filter(Boolean);
  if (!imageUrls.length) return "";
  const name = `${entry?.brand || ""} ${entry?.name || ""}`.trim();
  const hasDots = imageUrls.length > 1;
  return `
    <div class="item-photo vpg-gallery manufacturer-catalog-photo-gallery ${hasDots ? "item-photo-has-dots vpg-has-dots" : ""} ${escapeHtml(className)}" data-photo-gallery>
      <div class="photo-gallery-track vpg-track">
        ${imageUrls.map((imageUrl, index) => `
          <button class="photo-gallery-slide vpg-slide" type="button" data-photo-open title="${escapeHtml(t("bagCatalog.photoOpenFullScreen"))}" aria-label="${escapeHtml(t("bagCatalog.photoOpenNumber", { number: index + 1, count: imageUrls.length, name }))}">
            <img ${deferImages ? `data-manufacturer-catalog-src="${escapeHtml(imageUrl)}"` : `src="${escapeHtml(imageUrl)}"`} data-photo-full-src="${escapeHtml(imageUrl)}" alt="${escapeHtml(index === 0 ? name : `${name} · ${index + 1}`)}" loading="lazy" />
          </button>
        `).join("")}
      </div>
      ${renderPhotoDots(imageUrls.length)}
    </div>
  `;
}

export function activateManufacturerCatalogPhotoGallery(gallery) {
  const images = [...(gallery?.querySelectorAll?.("img[data-manufacturer-catalog-src]") || [])];
  images.forEach((image) => {
    const source = String(image.dataset?.manufacturerCatalogSrc || "").trim();
    if (source && !image.getAttribute?.("src")) image.setAttribute?.("src", source);
    image.removeAttribute?.("data-manufacturer-catalog-src");
  });
  return images.length;
}

export function bindManufacturerCatalogPhotoLoading(root, {
  IntersectionObserverImpl = globalThis.IntersectionObserver,
  rootMargin = "80px 0px"
} = {}) {
  const galleries = [...(root?.querySelectorAll?.(".manufacturer-catalog-photo-gallery") || [])];
  if (!galleries.length) return { destroy() {} };
  if (typeof IntersectionObserverImpl !== "function") {
    galleries.forEach(activateManufacturerCatalogPhotoGallery);
    return { destroy() {} };
  }
  const observer = new IntersectionObserverImpl((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      activateManufacturerCatalogPhotoGallery(entry.target);
      observer.unobserve?.(entry.target);
    });
  }, { root, rootMargin, threshold: 0.01 });
  galleries.forEach((gallery) => observer.observe(gallery));
  return { destroy: () => observer.disconnect() };
}
