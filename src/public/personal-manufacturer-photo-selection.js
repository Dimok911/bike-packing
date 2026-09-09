import { manufacturerBagCatalogImageUrls, manufacturerBagContainerDraft } from "../state/manufacturer-bag-catalog.js";
import { fetchManufacturerBagCatalogImageFile } from "./manufacturer-bag-catalog-import.js";
import { assertListOperationJsonValue } from "../sync/list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const fail = message => { throw Object.assign(new Error(message), { code: "manufacturer-photo-selection" }); };

// This preparer owns the exact selected source before the first asynchronous
// read. It does not publish an owner or silently accept only successful files.
export async function preparePersonalManufacturerPhotoSelection(entry, {
  enabled = false, language = "en", maxPhotos = 50, isCurrent = () => true,
  fetchImageFile = fetchManufacturerBagCatalogImageFile
} = {}) {
  if (!enabled) return null;
  if (!Number.isSafeInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > 50 || typeof fetchImageFile !== "function") {
    fail("Не подтверждён доступный набор фотографий. Выбор сумки сохранён.");
  }
  assertListOperationJsonValue(entry);
  const source = freeze(clone(entry)), draft = manufacturerBagContainerDraft(source, { language });
  const imageUrls = manufacturerBagCatalogImageUrls(source).slice(0, maxPhotos);
  if (!draft || !String(source.id || "").trim() || !imageUrls.length) fail("У выбранной сумки нет полного источника фотографий.");
  const assertCurrent = () => { if (!isCurrent()) fail("Форма или аккаунт изменились. Подготовка фотографий остановлена."); };
  assertCurrent();
  const files = [];
  for (const [index, imageUrl] of imageUrls.entries()) {
    const file = await fetchImageFile(source, { imageUrl, index });
    assertCurrent();
    if (!(file instanceof Blob) || !file.size || !file.type.startsWith("image/")) {
      fail("Не удалось подготовить все выбранные фотографии. Сумка ещё не сохранена.");
    }
    files.push(file);
  }
  return { source: { version: 1, entry: clone(source), imageUrls: [...imageUrls] }, draft: clone(draft), files };
}
