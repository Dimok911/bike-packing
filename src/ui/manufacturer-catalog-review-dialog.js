import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";
import { catalogChangesForReview, catalogVariantChanges } from "../data/manufacturer-catalog-comparison.js";

import { catalogPhotoSelection } from "../data/manufacturer-catalog-photo-selection.js";

const isEnglish = () => currentDocumentLanguage() === "en";
const localText = (en, ru) => isEnglish() ? en : ru;
const currentLocale = () => isEnglish() ? "en-US" : "ru-RU";

const TYPE_TEXT = Object.freeze({
  added: ["New model", "Новая модель"],
  changed: ["Data changed", "Изменились данные"],
  missing: ["Missing from source", "Не найдена у производителя"],
  photos: ["Check photographs", "Проверить фотографии"],
});

const TYPE_EXPLANATION = Object.freeze({
  added: ["Not in the public catalog yet.", "Новой карточки в публичном каталоге ещё нет."],
  changed: ["The approved card remains public; only the fields below await review.", "Утверждённая карточка уже опубликована; проверки ожидают только поля ниже."],
  missing: ["The approved card remains public until this absence is reviewed.", "Утверждённая карточка остаётся в каталоге до проверки её отсутствия у производителя."]
});

const DECISION_TEXT = Object.freeze({
  pending: ["Awaiting review", "Ожидает проверки"],
  approved: ["Approved", "Подтверждено"],
  rejected: ["Rejected", "Отклонено"],
  deferred: ["Review later", "Проверить позже"],
});

const FIELD_TEXT = Object.freeze({
  sku: ["SKU", "Артикул"],
  color: ["Color", "Цвет"],
  material: ["Material", "Материал"],
  title: ["Variant", "Вариант"],
  weightOptions: ["Weight options", "Варианты веса"],
  volumeOptions: ["Volume options", "Варианты объёма"],
  name: ["Name", "Название"],
  family: ["Model family", "Семейство"],
  category: ["Category", "Категория"],
  volume: ["Volume", "Объём"],
  volumeMin: ["Minimum volume", "Минимальный объём"],
  volumeMax: ["Maximum volume", "Максимальный объём"],
  volumePerBag: ["Volume per bag", "Объём одной сумки"],
  volumeTotal: ["Total volume", "Общий объём"],
  weight: ["Weight", "Вес"],
  weightMin: ["Minimum weight", "Минимальный вес"],
  weightMax: ["Maximum weight", "Максимальный вес"],
  weightPerBag: ["Weight per bag", "Вес одной сумки"],
  weightTotal: ["Total weight", "Общий вес"],
  dimensions: ["Dimensions", "Размеры"],
  waterproofRating: ["Water protection", "Влагозащита"],
  mounting: ["Mount", "Крепление"],
  mountingOptions: ["Mount options", "Варианты крепления"],
  soldAsSet: ["Sold as a set", "Продаётся комплектом"],
  available: ["Availability", "Доступность"],
  variants: ["Variants", "Варианты"],
  imageReviewRequired: ["Photographs need checking", "Фотографии требуют проверки"],
  sourceImageUrl: ["Main image", "Основное изображение"],
  sourceImageUrls: ["Image gallery", "Галерея изображений"],
  description: ["Description", "Описание"],
  manufacturerDetails: ["Manufacturer details", "Информация производителя"],
});

const formatDate = (value) => {
  const source = String(value || "");
  const time = Date.parse(source);
  return Number.isFinite(time) ? new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(/^\d{4}-\d{2}-\d{2}$/.test(source) ? { timeZone: "UTC" } : {}),
  }).format(new Date(time)) : localText("Date not recorded", "Дата не указана");
};

const formatDateTime = (value) => {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return localText("Date not recorded", "Дата не указана");
  const clock = new Intl.DateTimeFormat(currentLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(time));
  return `${formatDate(value)} · ${localText("time", "время")} ${clock}`;
};

const formatValue = (value) => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? localText("Yes", "Да") : localText("No", "Нет");
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(" / ") : "—";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatValue(item)}`).join("; ");
  return String(value);
};

const diffTokens = (value) => {
  if (Array.isArray(value) && value.every((item) => /^https?:\/\//i.test(String(item || "")))) {
    return value.flatMap((item, index) => index < value.length - 1 ? [String(item), "\n"] : [String(item)]);
  }
  return String(formatValue(value) || "").match(/\s+|[\p{L}\p{N}_.-]+|[^\s\p{L}\p{N}_.-]+/gu) || [];
};

export const manufacturerCatalogInlineDiffParts = (before, after) => {
  const left = diffTokens(before);
  const right = diffTokens(after);
  const common = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      common[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? common[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(common[leftIndex + 1][rightIndex], common[leftIndex][rightIndex + 1]);
    }
  }
  const parts = [];
  const append = (type, value) => {
    if (!value) return;
    const previous = parts.at(-1);
    if (previous?.type === type) previous.value += value;
    else parts.push({ type, value });
  };
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      append("equal", left[leftIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (common[leftIndex + 1][rightIndex] >= common[leftIndex][rightIndex + 1]) {
      append("removed", left[leftIndex]);
      leftIndex += 1;
    } else {
      append("added", right[rightIndex]);
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) append("removed", left[leftIndex++]);
  while (rightIndex < right.length) append("added", right[rightIndex++]);
  return parts;
};

const renderInlineDiff = (before, after) => manufacturerCatalogInlineDiffParts(before, after)
  .map(({ type, value }) => type === "removed"
    ? `<del>${escapeHtml(value)}</del>`
    : type === "added"
      ? `<ins>${escapeHtml(value)}</ins>`
      : escapeHtml(value))
  .join("");

const fieldLabel = (field) => {
  const pair = FIELD_TEXT[field];
  return pair ? localText(pair[0], pair[1]) : field;
};

const safeExternalUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
};

const renderFieldChanges = (fields = []) => {
  if (!fields.length) return "";
  return `<dl class="catalog-review-fields">${fields.map((item) => `
    <div>
      <dt>${escapeHtml(fieldLabel(item.field))}</dt>
      <dd>${item.field === "variants" && Array.isArray(item.before) && Array.isArray(item.after)
        ? catalogVariantChanges(item.before, item.after).map((variant) => `<div class="catalog-review-variant"><strong>${escapeHtml(variant.key)}</strong> — ${escapeHtml(variant.type === "added" ? localText("New variant", "Новый вариант") : variant.type === "missing" ? localText("Variant not found in this scan", "Вариант не найден в этой проверке") : localText("Variant changed", "Изменения варианта"))}${variant.type === "changed" ? renderFieldChanges(variant.fields) : `<p>${escapeHtml(formatValue(variant.after || variant.before))}</p>`}</div>`).join("")
        : renderInlineDiff(item.before, item.after)}</dd>
    </div>
  `).join("")}</dl>`;
};

export const catalogChangeNeedsReview = (change) => !change.decision || ["pending", "deferred"].includes(change.decision);

export const catalogChangeHasPhotoReview = change => Boolean(change.after?.imageReviewRequired)
  || (change.fields || []).some(item => ["sourceImageUrl", "sourceImageUrls", "imageReviewRequired"].includes(item.field));
const matchesReviewType = (change, type) => !type || (type === "photos" ? catalogChangeHasPhotoReview(change) : change.type === type);

const manufacturerKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const changeManufacturerKey = (change) => manufacturerKey(change.manufacturerId || change.manufacturer);
export function latestManufacturerCatalogReviewScan(data = {}) {
  const allScans = Array.isArray(data.scans) ? data.scans : [];
  const photoScans = allScans.filter(scan => scan.changes?.length && scan.changes.every(change => ['photos','correction'].includes(change.after?.catalogReviewScope)));
  if (photoScans.length && photoScans.length !== allScans.length) {
    const base = latestManufacturerCatalogReviewScan({ ...data, scans: allScans.filter(scan => !photoScans.includes(scan)) });
    const photos = new Map();
    for (const scan of photoScans) for (const change of scan.changes) {
      const manufacturer = base.manufacturers?.find(item => manufacturerKey(item.id || item.name) === changeManufacturerKey(change));
      if (manufacturer?.scannedAt > scan.scannedAt || photos.has(change.productId)) continue;
      photos.set(change.productId, { ...change, reviewScanId: scan.id, reviewScannedAt: scan.scannedAt });
    }
    const changes = base.changes.flatMap(change => {
      if (change.type !== 'changed' || !photos.has(change.productId)) return [change];
      const replacement = photos.get(change.productId);
      if (replacement.after?.catalogReviewScope === 'correction' || replacement.after?.catalogReviewCorrection === true) {
        if (!replacement.decisionNote && change.decisionNote) replacement.decisionNote = change.decisionNote;
        return [];
      }
      const fields = (change.fields || []).filter(field => !['sourceImageUrl','sourceImageUrls','imageReviewRequired'].includes(field.field));
      return fields.length ? [{ ...change, fields, after: { ...change.after, imageReviewRequired: false } }] : [];
    });
    return { ...base, changes: [...changes, ...[...photos.values()].filter(change => change.fields?.length || change.after?.imageReviewRequired)], mixedScans: true };
  }
  const scans = allScans;
  const latest = scans[0];
  if (!latest?.manufacturers?.length) return latest;
  const seen = new Set();
  const manufacturers = [];
  const changes = [];
  const usedScans = new Set();
  for (const scan of scans) {
    const selected = new Set();
    for (const item of scan.manufacturers || []) {
      const key = manufacturerKey(item.id || item.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.add(key);
      manufacturers.push({ ...item, scannedAt: scan.scannedAt });
    }
    if (!selected.size) continue;
    usedScans.add(scan.id);
    for (const change of scan.changes || []) {
      if (selected.has(changeManufacturerKey(change))) changes.push({ ...change, reviewScanId: scan.id, reviewScannedAt: scan.scannedAt });
    }
  }
  return { ...latest, manufacturers, changes, mixedScans: usedScans.size > 1,
    summary: { ...latest.summary, products: manufacturers.reduce((sum, item) => sum + Number(item.productCount || 0), 0) } };
}
const latestChanges = (data) => catalogChangesForReview(latestManufacturerCatalogReviewScan(data)?.changes || []);
export const catalogReviewCount = (data) => latestChanges(data).filter(catalogChangeNeedsReview).length;

const renderManufacturerStatus = (manufacturer = {}, changes = [], selected = "", showDate = false) => {
  const partial = manufacturer.status !== "complete";
  const key = manufacturerKey(manufacturer.id || manufacturer.name);
  const ownChanges = changes.filter((change) => changeManufacturerKey(change) === key);
  const reviewCount = ownChanges.filter(catalogChangeNeedsReview).length;
  return `<li><button type="button" data-catalog-manufacturer="${escapeHtml(key)}" aria-pressed="${selected === key}" class="catalog-review-manufacturer${reviewCount ? " has-changes" : ""}${partial ? " has-warning" : ""}">
    <strong>${escapeHtml(manufacturer.name || manufacturer.id)}</strong>
    <span>${escapeHtml(String(manufacturer.productCount || 0))} ${escapeHtml(localText("products", "товаров"))}</span>
    <b class="catalog-review-manufacturer-count">${escapeHtml(localText(`To review: ${reviewCount} · Total changes: ${ownChanges.length}`, `К проверке: ${reviewCount} · Всего изменений: ${ownChanges.length}`))}</b>
    ${ownChanges.some(change => catalogChangeNeedsReview(change) && catalogChangeHasPhotoReview(change)) ? `<small>${escapeHtml(localText("Photographs to check", "Фотографии к проверке"))}: ${ownChanges.filter(change => catalogChangeNeedsReview(change) && catalogChangeHasPhotoReview(change)).length}</small>` : ""}
    <small>${escapeHtml(partial
      ? localText("Scan incomplete — errors need checking", "Сканирование неполное — есть ошибки")
      : localText("Scan completed", "Сканирование завершено"))}</small>
    ${showDate ? `<small>${escapeHtml(localText("Checked", "Проверено"))}: ${escapeHtml(formatDate(manufacturer.scannedAt))}</small>` : ""}
  </button></li>`;
};

const renderDecisionButton = (change, decision, label) => `
  <button type="button" class="${change.decision === decision ? "active" : "ghost"}" data-catalog-decision="${decision}">${escapeHtml(label)}</button>
`;

const renderComparisonContext = (change, scannedAt) => {
  const beforeDate = formatDate(change.before?.sourceCheckedAt);
  const afterDate = formatDate(change.after?.sourceCheckedAt || scannedAt);
  const before = change.type === "added"
    ? localText("This model is not in the catalog yet", "Этой модели в каталоге ещё нет")
    : `${localText("Source checked", "Проверено у производителя")}: ${beforeDate}`;
  const after = change.type === "missing"
    ? `${localText("Not found during the scan", "Не найдена при проверке")}: ${formatDate(scannedAt)}`
    : `${localText("Source checked", "Проверено у производителя")}: ${afterDate}`;
  return `<div class="catalog-review-comparison-context">
    <div><strong>${escapeHtml(localText("Current catalog", "Сейчас в каталоге"))}</strong><span>${escapeHtml(before)}</span></div>
    <div><strong>${escapeHtml(localText("Proposed update", "Предлагаемое обновление"))}</strong><span>${escapeHtml(after)}</span></div>
  </div>${change.fields?.some(item => !["imageReviewRequired", "sourceImageUrl", "sourceImageUrls"].includes(item.field)) ? `<p class="catalog-review-diff-legend">
    <span><del>${escapeHtml(localText("Struck through", "Зачёркнуто"))}</del> — ${escapeHtml(localText("current catalog value", "значение в текущем каталоге"))}.</span>
    <span><ins>${escapeHtml(localText("Highlighted", "Выделено цветом"))}</ins> — ${escapeHtml(localText("proposed replacement", "предлагаемая замена"))}.</span>
  </p>` : ""}`;
};

const photoUrls = (change, side) => {
  const snapshot = change[side] || {};
  const value = snapshot.sourceImageUrls ?? change.fields?.find(item => item.field === "sourceImageUrls")?.[side];
  const single = snapshot.sourceImageUrl ?? change.fields?.find(item => item.field === "sourceImageUrl")?.[side];
  return [...new Set((Array.isArray(value) ? value : [single]).map(safeExternalUrl).filter(Boolean))];
};

export function catalogPhotoChanges(change = {}) {
  const before = photoUrls(change, "before");
  const after = photoUrls(change, "after");
  if (change.after?.imageReviewRequired) {
    const saved = change.after.imageGalleryPreserved && after.length ? after : before;
    return saved.map(url => ({ url, state: "saved", newCover: false }));
  }
  const oldCover = safeExternalUrl(change.before?.sourceImageUrl) || before[0];
  const newCover = safeExternalUrl(change.after?.sourceImageUrl) || after[0];
  return [...after.map(url => ({ url, state: before.includes(url) ? "unchanged" : "added", newCover: url === newCover && newCover !== oldCover })),
    ...before.filter(url => !after.includes(url)).map(url => ({url, state: "removed", newCover: false}))];
}

const renderPhotoPreview = change => {
  if (!catalogChangeHasPhotoReview(change) && !["added", "missing"].includes(change.type)) return "";
  const photos = catalogPhotoChanges(change);
  const selection = catalogPhotoSelection(change);
  const labels = { added: localText("Proposed addition", "Предлагается добавить"), removed: localText("Absent from the new gallery", "Нет в новой галерее"),
    unchanged: localText("Already in catalog", "Уже в каталоге"), saved: localText("Saved photographs", "Сохранённые фотографии") };
  return `<div class="catalog-review-photo-selection"><p>${escapeHtml(localText("These checkboxes show the gallery after publication: checked photos will be in the product card; unchecked photos will not. Checking an existing photo keeps it without adding a duplicate.", "Галочки задают состав галереи после публикации: отмеченный снимок будет в карточке, неотмеченный — не будет. Галочка у существующего снимка сохраняет его, не добавляет повторно."))}</p><button type="button" class="ghost" data-catalog-photo-default>${escapeHtml(localText("Select proposed photographs", "Выбрать все предложенные"))}</button></div>` + ["added", "removed", "saved", "unchanged"].map(state => {
    const group = photos.filter(photo => photo.state === state);
    if (!group.length) return "";
    const cards = group.map((photo,index) => '<div class="catalog-review-photo-choice"><a class="catalog-review-photo state-' + state + '" href="' + escapeHtml(photo.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(localText("Open photograph", "Открыть фотографию") + ' ' + (index+1)) + '"><img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(labels[state] + ' · ' + localText("Photograph", "Фотография") + ' ' + (index+1)) + '" loading="lazy" referrerpolicy="no-referrer"><span class="catalog-review-photo-label">' + escapeHtml(labels[state] + (photo.newCover ? " · " + localText("New cover", "Новая обложка") : "")) + '</span></a><label><input type="checkbox" data-catalog-photo-url="' + escapeHtml(photo.url) + '" ' + (selection.selectedUrls.includes(photo.url) ? 'checked' : '') + '> ' + escapeHtml(localText('In the final gallery', 'В итоговой галерее')) + '</label></div>').join("");
    const grid = '<div class="catalog-review-photo-grid">' + cards + '</div>';
    const title = escapeHtml(labels[state]) + ' · ' + group.length;
    return state === "unchanged" && !group.some(photo => photo.newCover)
      ? '<details class="catalog-review-photo-preview"><summary>' + title + '</summary>' + grid + '</details>'
      : '<section class="catalog-review-photo-preview" aria-label="' + escapeHtml(labels[state]) + '"><h5>' + title + '</h5>' + grid + '</section>';
  }).join("");
};

const renderPhotoException = (item) => '<article class="catalog-review-change"><h4><button class="catalog-review-product-link" type="button" data-catalog-current-product="' + escapeHtml(item.productId) + '">' + escapeHtml(item.manufacturer + ' ' + item.productName) + '</button></h4><p><strong>' + escapeHtml(localText('Manual exception — differs from manufacturer', 'Ручное исключение — отличается от производителя')) + '</strong></p><p>' + escapeHtml(localText('Decision saved, awaiting publication', 'Решение сохранено, ожидает публикации')) + ' · ' + escapeHtml(formatDateTime(item.reviewedAt)) + '</p>' + (item.note ? '<p>' + escapeHtml(item.note) + '</p>' : '') + [['retainedUrls',localText('Kept manually', 'Оставлено вручную')],['excludedUrls',localText('Not added', 'Не добавлено')]].map(([key,label]) => item[key]?.length ? '<h5>' + escapeHtml(label) + '</h5><div class="catalog-review-photo-grid">' + item[key].map(url => safeExternalUrl(url) ? '<a class="catalog-review-photo" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="' + escapeHtml(url) + '" alt="' + escapeHtml(label) + '"></a>' : '').join('') + '</div>' : '').join('') + '</article>';

const renderChange = (change = {}, scanId = "", scannedAt = "") => {
  const photoOnly = change.after?.imageReviewRequired && !(change.fields || []).some(item => !["imageReviewRequired", "sourceImageUrl", "sourceImageUrls"].includes(item.field));
  const typePair = TYPE_TEXT[photoOnly ? "photos" : change.type] || [change.type, change.type];
  const explanationPair = TYPE_EXPLANATION[change.type] || ["", ""];
  const decisionPair = DECISION_TEXT[change.decision] || DECISION_TEXT.pending;
  const sourceUrl = safeExternalUrl(change.sourceUrl);
  const productId = String(change.productId || change.before?.id || "");
  const productTitle = escapeHtml(`${change.manufacturer || ""} ${change.productName || change.productId || ""}`.trim());
  const canOpenCurrent = change.type !== "added" && productId;
  return `<article class="catalog-review-change type-${escapeHtml(change.type || "changed")}" data-scan-id="${escapeHtml(scanId)}" data-change-id="${escapeHtml(change.id || "")}">
    <header>
      <div>
        <span class="catalog-review-change-type">${escapeHtml(localText(typePair[0], typePair[1]))}</span>
        <h4>${canOpenCurrent ? `<button type="button" class="catalog-review-product-link" data-catalog-current-product="${escapeHtml(productId)}" title="${escapeHtml(localText("Open current catalog card", "Открыть текущую карточку каталога"))}">${productTitle}</button>` : productTitle}</h4>
      </div>
      <span class="catalog-review-decision decision-${escapeHtml(change.decision || "pending")}">${escapeHtml(localText(decisionPair[0], decisionPair[1]))}</span>
    </header>
    ${explanationPair[0] ? `<p class="catalog-review-publication-state">${escapeHtml(localText(explanationPair[0], explanationPair[1]))}</p>` : ""}
    ${change.after ? `<button type="button" class="ghost" data-catalog-proposed-product>${escapeHtml(localText("After this change", "После изменения"))}</button>` : ""}
    ${change.after?.catalogWeightMappingCorrection ? `<p class="catalog-review-safety-note">${escapeHtml(localText("Weight-to-size mapping correction in our importer. The manufacturer description has not changed.", "Исправление привязки веса к размеру в нашем обработчике. Описание производителя не менялось."))}</p>` : ""}
    ${change.after?.catalogReviewScope === "photos" ? `<p class="catalog-review-safety-note">${escapeHtml(localText("Photograph processing correction. Manufacturer specifications are unchanged.", "Исправление обработки фотографий. Характеристики производителя здесь не меняются."))}</p>` : ""}
    ${renderComparisonContext(change, scannedAt)}
    ${change.after?.imageReviewRequired ? `<p class="catalog-review-photo-warning catalog-review-safety-note" role="note"><strong>${escapeHtml(localText("Photographs need checking", "Фотографии требуют проверки"))}</strong><br>${escapeHtml(localText("The source did not provide a complete gallery for this size. The proposed photo replacement is held for verification.", "Не удалось полностью сопоставить галерею производителя с этим объёмом. Замена фотографий остановлена до проверки."))}${change.after.imageGalleryPreserved ? `<br>${escapeHtml(localText("Previously saved photographs are retained.", "Ранее сохранённые фотографии оставлены без изменений."))}` : ""}</p>` : ""}
    ${renderFieldChanges((change.fields || []).filter(item => !["imageReviewRequired", "sourceImageUrl", "sourceImageUrls"].includes(item.field)))}
    ${change.decision === "approved" && (change.photoSelection?.retainedUrls?.length || change.photoSelection?.excludedUrls?.length) ? `<p class="catalog-review-safety-note">${escapeHtml(localText("Manual exception recorded. Awaiting publication; see Our exceptions.", "Зафиксировано ручное исключение. Ожидает публикации; посмотреть можно в разделе «Наши исключения»."))}</p>` : ""}
    ${change.manualPhotoException ? `<p class="catalog-review-safety-note">${escapeHtml(localText("A manual exception was saved for this model. Its photograph choices are retained where available; see Our exceptions.", "Для этой модели сохранено ручное исключение. Выбор доступных фотографий учтён; подробности — в разделе «Наши исключения»."))}</p>` : ""}
    ${renderPhotoPreview(change)}
    ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localText("Open manufacturer source", "Открыть источник производителя"))}</a>` : ""}
    <details class="catalog-review-note"${change.decisionNote ? " open" : ""}>
      <summary>${escapeHtml(localText("Review comment", "Комментарий к проверке"))}</summary>
      <label>
        <span class="visually-hidden">${escapeHtml(localText("Review note", "Комментарий к проверке"))}</span>
        <textarea rows="2" maxlength="1000" data-catalog-note placeholder="${escapeHtml(localText("Optional", "Необязательно"))}">${escapeHtml(change.decisionNote || "")}</textarea>
      </label>
    </details>
    <div class="catalog-review-actions">
      ${renderDecisionButton(change, "approved", localText("Approve", "Подтвердить"))}
      ${renderDecisionButton(change, "rejected", localText("Reject", "Отклонить"))}
      ${renderDecisionButton(change, "deferred", localText("Later", "Позже"))}
    </div>
  </article>`;
};

export function renderManufacturerCatalogReview(data = {}, { manufacturer = "", reviewOnly = true, type = "", summaryOnly = false } = {}) {
  const scans = Array.isArray(data.scans) ? data.scans : [];
  if (!scans.length) {
    return `<div class="catalog-review-empty">
      <strong>${escapeHtml(localText("No scans yet", "Сканирований пока нет"))}</strong>
      <p>${escapeHtml(localText(
        "The monthly GitHub scan will appear here after its first successful run.",
        "Первое ежемесячное сканирование из GitHub появится здесь после успешного запуска."
      ))}</p>
    </div>`;
  }
  const scan = latestManufacturerCatalogReviewScan(data);
  const rawChanges = Array.isArray(scan.changes) ? scan.changes : [];
  const changes = catalogChangesForReview(rawChanges);
  const pending = changes.filter(catalogChangeNeedsReview).length;
  const selectedType = (type === "exceptions" || Object.hasOwn(TYPE_TEXT, type)) ? type : "";
  const scopedChanges = changes.filter((change) => (!manufacturer || changeManufacturerKey(change) === manufacturer) && (!reviewOnly || catalogChangeNeedsReview(change)));
  const exceptions = (data.photoExceptions || []).filter(item => !manufacturer || manufacturerKey(item.manufacturer) === manufacturer);
  const filtered = selectedType === 'exceptions' ? exceptions : scopedChanges.filter((change) => matchesReviewType(change, selectedType));
  const typeFilters = [
    ["", localText("All changes", "Все изменения")],
    ["added", localText("New models", "Новые модели")],
    ["missing", localText("Not found at manufacturer", "Не найдены у производителя")],
    ["changed", localText("Data changed", "Изменились данные")],
    ["photos", localText("Check photographs", "Проверить фотографии")],
    ["exceptions", localText("Our exceptions", "Наши исключения")],
  ];
  const manufacturers = [...(scan.manufacturers || [])];
  changes.forEach((change) => {
    const key = changeManufacturerKey(change);
    if (key && !manufacturers.some((item) => manufacturerKey(item.id || item.name) === key)) {
      manufacturers.push({ id: key, name: change.manufacturer || key, status: "unknown" });
    }
  });
  return `
    <section class="catalog-review-summary">
      <div><span>${escapeHtml(localText("Manufacturer websites checked", "Проверка сайтов производителей"))}</span><strong>${escapeHtml(formatDateTime(scan.scannedAt))}</strong></div>
      <div><strong>${escapeHtml(String(scan.summary?.products || 0))}</strong><span>${escapeHtml(localText("products checked", "товаров проверено"))}</span></div>
      <div><strong>${escapeHtml(String(changes.length))}</strong><span>${escapeHtml(localText("changes found", "изменений найдено"))}</span></div>
      <div><strong>${escapeHtml(String(pending))}</strong><span>${escapeHtml(localText("to review, including deferred", "к проверке, включая отложенные"))}</span></div>
    </section>
    <p class="catalog-review-publication-state">${escapeHtml(localText(
      "Automatic scan: on the 1st of each month. This is the scan date and time, not a date range. Each card shows the dates of the compared data. Refresh reloads saved scans; it does not run a new manufacturer scan.",
      "Автопроверка — 1-го числа каждого месяца. Вверху указаны дата и время проверки, а не период изменений. Даты сравниваемых данных указаны в карточках. Кнопка «Обновить» загружает сохранённые проверки, а не запускает новое сканирование производителей."
    ))}</p>
    ${scan.mixedScans ? `<p class="catalog-review-publication-state">${escapeHtml(localText("Each manufacturer shows its latest saved check. The individual check dates are shown below.", "Для каждого производителя показана его последняя сохранённая проверка. Даты отдельных проверок указаны ниже."))}</p>` : ""}
    <div class="catalog-review-filters">
      <button type="button" class="ghost" data-catalog-manufacturer="" aria-pressed="${!manufacturer}">${escapeHtml(localText(`All manufacturers · To review: ${pending}`, `Все производители · К проверке: ${pending}`))}</button>
      <label><input type="checkbox" data-catalog-review-only ${reviewOnly ? "checked" : ""}>${escapeHtml(localText("Only awaiting review (including Later)", "Только к проверке (включая «Позже»)"))}</label>
    </div>
    <ul class="catalog-review-manufacturers">${manufacturers.map((item) => renderManufacturerStatus(item, changes, manufacturer, scan.mixedScans)).join("")}</ul>
    <div class="catalog-review-filters catalog-review-type-filters" role="group" aria-label="${escapeHtml(localText("Change type", "Тип изменения"))}">
      ${typeFilters.map(([key, label]) => `<button type="button" class="ghost" data-catalog-type="${key}" aria-pressed="${selectedType === key}">${escapeHtml(label)} · ${key === "exceptions" ? exceptions.length : scopedChanges.filter((change) => matchesReviewType(change, key)).length}</button>`).join("")}
    </div>
    <p class="catalog-review-safety-note">${escapeHtml(localText(
      "A decision records your review. The public catalog is not changed automatically.",
      "Решение фиксирует вашу проверку. Публичный каталог автоматически не меняется."
    ))}</p>
    <p class="catalog-review-results" aria-live="polite">${escapeHtml(localText(`Shown: ${filtered.length} · ${manufacturers.find((item) => manufacturerKey(item.id || item.name) === manufacturer)?.name || "All manufacturers"}`, `Показано записей: ${filtered.length} · ${manufacturers.find((item) => manufacturerKey(item.id || item.name) === manufacturer)?.name || "Все производители"}`))}</p>
    ${rawChanges.length > changes.length ? `<p class="catalog-review-publication-state">${escapeHtml(localText(`Excluded from review: ${rawChanges.length - changes.length} entries with only editorial wording or formatting changes.`, `Исключено из проверки: ${rawChanges.length - changes.length} записей только с изменениями служебных формулировок или оформления.`))}</p>` : ""}
    <section class="catalog-review-changes" aria-label="${escapeHtml(localText("Detected catalog changes", "Найденные изменения каталога"))}">
      ${summaryOnly ? "" : filtered.length ? filtered.map((change) => selectedType === "exceptions" ? renderPhotoException(change) : renderChange(change, change.reviewScanId || scan.id, change.reviewScannedAt || scan.scannedAt)).join("") : `<p class="catalog-review-empty">${escapeHtml(changes.length ? localText("No entries match these filters.", "По выбранным фильтрам записей нет.") : localText("No changes found.", "Изменений не найдено."))}</p>`}
    </section>
  `;
}

// Apply only the acknowledged decision; scan evidence and other cards stay intact.
export function applyManufacturerCatalogDecision(data, input, result = {}) {
  const scan = data.scans?.find(scan => scan.id === input.scanId);
  const change = scan?.changes?.find(change => change.id === input.changeId);
  if (!change) return false;
  Object.assign(change, { decision: result.decision || input.decision,
    decisionNote: result.note ?? result.decisionNote ?? input.note,
    reviewedAt: result.reviewedAt || new Date().toISOString(),
    ...((result.photoSelection || input.photoSelection) ? { photoSelection: result.photoSelection || input.photoSelection } : {}) });
  const candidates = (data.photoExceptions || []).filter(row => row.scanId !== input.scanId || row.changeId !== input.changeId);
  for (const scan of data.scans || []) for (const row of scan.changes || []) {
    if (row.decision !== 'approved' || !row.photoSelection) continue;
    candidates.push({ ...row.photoSelection, productId: row.photoSelection.productId || row.productId,
      productName: row.photoSelection.productName || row.productName, manufacturer: row.photoSelection.manufacturer || row.manufacturer,
      scanId: scan.id, changeId: row.id, note: row.decisionNote || '', reviewedAt: row.reviewedAt,
      publicationState: 'awaiting-publication' });
  }
  candidates.sort((a,b) => String(b.reviewedAt || '').localeCompare(String(a.reviewedAt || ''))
    || String(b.scanId).localeCompare(String(a.scanId)) || String(b.changeId).localeCompare(String(a.changeId)));
  const seen = new Set();
  data.photoExceptions = candidates.filter(row => {
    if (!row.productId || seen.has(row.productId)) return false;
    seen.add(row.productId); return row.retainedUrls?.length || row.excludedUrls?.length;
  });
  for (const scan of data.scans || []) for (const row of scan.changes || [])
    row.manualPhotoException = data.photoExceptions.find(item => item.productId === row.productId) || null;
  return true;
}

export function createManufacturerCatalogReviewDialogController({
  refs,
  fetchScans,
  saveDecision,
  openCurrentProduct,
  openProposedProduct,
  canOpen,
  isForcedOffline,
  openModalDialog,
  showToast,
  now = () => Date.now(),
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancelSchedule = (timer) => globalThis.clearTimeout(timer),
  apiErrorMessage = (error) => String(error?.message || error || localText("Error", "Ошибка")),
} = {}) {
  let lastData = null;
  let renderedLanguage = "";
  let filters = { manufacturer: "", reviewOnly: true, type: "" };
  let inFlight = null;
  let lastAttempt = -Infinity;
  let timer = null;
  let accessEpoch = 0;
  let allowed = false;
  const dialogDocument = refs?.catalogUpdatesDialog?.ownerDocument;
  const dialogWindow = dialogDocument?.defaultView;
  const pageHeading = dialogDocument?.querySelector('.topbar h1');
  const syncDialogHeight = () => {
    const dialog = refs?.catalogUpdatesDialog;
    if (!dialog?.open || !pageHeading) return;
    const bottom = pageHeading.getBoundingClientRect().bottom;
    // Keep a useful margin when the underlying page was scrolled past its heading.
    const gap = bottom >= 12 ? bottom : 70;
    dialog.style.setProperty('--catalog-review-edge-gap', gap + 'px');
  };
  dialogWindow?.addEventListener('resize', syncDialogHeight);
  if (pageHeading && dialogWindow?.ResizeObserver) {
    const headingResize = new dialogWindow.ResizeObserver(syncDialogHeight);
    headingResize.observe(pageHeading);
  }
  const noteDrafts = new Map();
  const photoDrafts = new Map();
  const noteExpanded = new Map();
  const pendingDecisions = new Set();
  const savedDecisions = new Map();
  let decisionRevision = 0;
  const online = () => Boolean(canOpen?.()) && !isForcedOffline?.();
  const rememberNotes = () => refs?.catalogUpdatesContent?.querySelectorAll?.("[data-change-id]").forEach((card) => {
    const key = `${card.dataset.scanId}/${card.dataset.changeId}`;
    const photos = [...card.querySelectorAll("[data-catalog-photo-url]")];
    if (photos.length) photoDrafts.set(key, photos.filter(photo => photo.checked).map(photo => photo.dataset.catalogPhotoUrl));
    const disclosure = card.querySelector(".catalog-review-note");
    if (disclosure) noteExpanded.set(key, disclosure.open);
    const note = card.querySelector("[data-catalog-note]");
    if (note) noteDrafts.set(`${card.dataset.scanId}/${card.dataset.changeId}`, note.value);
  });
  const render = (updatedKey = null) => {
    if (!lastData || !refs?.catalogUpdatesContent) return;
    const host = refs.catalogUpdatesContent;
    const section = host.querySelector?.('.catalog-review-changes');
    if (updatedKey && section && filters.type !== 'exceptions' && host.ownerDocument) {
      const scrollTop = host.scrollTop;
      const cards = [...section.querySelectorAll('[data-change-id]')];
      const updatedCard = cards.find(card => card.dataset.scanId + '/' + card.dataset.changeId === updatedKey);
      const viewport = host.getBoundingClientRect();
      const updatedBounds = updatedCard?.getBoundingClientRect();
      // A background save must not pull the reader away from another card.
      const advance = updatedBounds && updatedBounds.bottom > viewport.top && updatedBounds.top < viewport.bottom;
      const nextCard = updatedCard && cards[cards.indexOf(updatedCard) + 1];
      const readingCard = cards.find(card => card.getBoundingClientRect().bottom > viewport.top);
      const readingTop = readingCard?.getBoundingClientRect().top;
      let removedCard = false;
      const summary = host.ownerDocument.createElement('div');
      summary.innerHTML = renderManufacturerCatalogReview(lastData, { ...filters, summaryOnly: true });
      for (const selector of ['.catalog-review-summary', '.catalog-review-filters', '.catalog-review-manufacturers', '.catalog-review-results']) {
        const replacements = summary.querySelectorAll(selector);
        host.querySelectorAll(selector).forEach((node, index) => node.replaceWith(replacements[index]));
      }
      const changes = latestChanges(lastData);
      const visible = change => (!filters.manufacturer || changeManufacturerKey(change) === filters.manufacturer)
        && (!filters.reviewOnly || catalogChangeNeedsReview(change)) && matchesReviewType(change, filters.type);
      section.querySelectorAll('[data-change-id]').forEach(card => {
        const key = card.dataset.scanId + '/' + card.dataset.changeId;
        if (key !== updatedKey) return;
        const change = changes.find(row => row.id === card.dataset.changeId
          && (row.reviewScanId || latestManufacturerCatalogReviewScan(lastData)?.id) === card.dataset.scanId);
        if (!change || !visible(change)) {
          card.remove();
          removedCard = true;
        }
        else card.outerHTML = renderChange(change, card.dataset.scanId, change.reviewScannedAt);
      });
      if (!section.querySelector('[data-change-id]')) {
        section.style.paddingBottom = '';
        section.innerHTML = '<p class="catalog-review-empty">'
          + escapeHtml(localText('No entries match these filters.', 'По выбранным фильтрам записей нет.')) + '</p>';
      }
      host.scrollTop = scrollTop;
      if (advance && removedCard && nextCard?.isConnected) {
        const gap = 16;
        section.style.paddingBottom = '';
        // Leave enough room to align even the final, short card.
        const remainingHeight = section.getBoundingClientRect().bottom - nextCard.getBoundingClientRect().top;
        section.style.paddingBottom = Math.max(0, host.clientHeight - gap - remainingHeight) + 'px';
        host.scrollTop += nextCard.getBoundingClientRect().top - host.getBoundingClientRect().top - host.clientTop - gap;
      } else if (!advance && readingCard?.isConnected) {
        host.scrollTop += readingCard.getBoundingClientRect().top - readingTop;
      }
    } else host.innerHTML = renderManufacturerCatalogReview(lastData, filters);
    refs.catalogUpdatesContent.querySelectorAll?.("[data-change-id]").forEach((card) => {
      const key = `${card.dataset.scanId}/${card.dataset.changeId}`;
      if (pendingDecisions.has(key)) card.querySelectorAll("button, input, textarea").forEach(item => item.setAttribute("disabled", "disabled"));
      const note = card.querySelector("[data-catalog-note]");
      if (note && noteDrafts.has(key)) note.value = noteDrafts.get(key);
      const disclosure = card.querySelector(".catalog-review-note");
      if (disclosure && noteExpanded.has(key)) disclosure.open = noteExpanded.get(key);
      if (photoDrafts.has(key)) card.querySelectorAll("[data-catalog-photo-url]").forEach(input => { input.checked = photoDrafts.get(key).includes(input.dataset.catalogPhotoUrl); });
    });
    renderedLanguage = currentDocumentLanguage();
  };
  const updateBadge = () => {
    const button = refs?.catalogUpdatesBtn;
    if (!button) return;
    const count = allowed && lastData ? catalogReviewCount(lastData) : 0;
    button.classList.toggle("has-catalog-updates", count > 0);
    if (count) button.setAttribute("data-review-count", String(count));
    else button.removeAttribute("data-review-count");
    const label = localText("Catalog updates", "Обновления каталога");
    const description = count ? `${label} · ${localText("To review", "К проверке")}: ${count}` : label;
    button.setAttribute("aria-label", description);
    button.setAttribute("title", `${description}. ${localText("Automatic scan — on the 1st of each month", "Автопроверка — 1-го числа каждого месяца")}`);
  };
  const load = () => {
    if (!online() || typeof fetchScans !== "function") return Promise.resolve(null);
    if (inFlight) return inFlight;
    lastAttempt = now();
    const epoch = accessEpoch;
    const startedRevision = decisionRevision;
    const request = Promise.resolve().then(fetchScans).then((data) => {
      if (epoch !== accessEpoch || !online()) return null;
      for (const [key, saved] of savedDecisions) {
        if (saved.revision > startedRevision) applyManufacturerCatalogDecision(data, saved.input, saved.result);
        else savedDecisions.delete(key);
      }
      lastData = data;
      updateBadge();
      return data;
    }).finally(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return request;
  };
  const checkForUpdates = async () => {
    if (!online() || now() - lastAttempt < 60_000) return;
    try { await load(); } catch { /* Keep the last known count; opening the dialog shows errors. */ }
  };
  const scheduleCheck = () => {
    if (timer != null || !online()) return;
    timer = schedule(async () => {
      timer = null;
      await checkForUpdates();
      scheduleCheck();
    }, 5 * 60_000);
    timer?.unref?.();
  };

  const setStatus = (message, type = "") => {
    if (!refs?.catalogUpdatesStatus) return;
    refs.catalogUpdatesStatus.className = `dialog-status ${type}`.trim();
    refs.catalogUpdatesStatus.textContent = message || "";
  };

  const syncVisibility = () => {
    const nextAllowed = Boolean(canOpen?.());
    if (allowed && !nextAllowed) {
      accessEpoch += 1;
      lastData = null;
      inFlight = null;
      lastAttempt = -Infinity;
      noteDrafts.clear();
      noteExpanded.clear();
      photoDrafts.clear();
      pendingDecisions.clear();
      savedDecisions.clear();
      filters = { manufacturer: "", reviewOnly: true, type: "" };
      if (refs?.catalogUpdatesContent) refs.catalogUpdatesContent.innerHTML = "";
      refs?.catalogUpdatesDialog?.close?.();
    }
    allowed = nextAllowed;
    if (refs?.catalogUpdatesBtn) refs.catalogUpdatesBtn.hidden = !allowed;
    updateBadge();
    if (online()) {
      void checkForUpdates();
      scheduleCheck();
    } else if (timer != null) {
      cancelSchedule(timer);
      timer = null;
    }
    const language = currentDocumentLanguage();
    if (lastData && refs?.catalogUpdatesDialog?.open && renderedLanguage !== language) {
      rememberNotes();
      render();
      setStatus(`${localText("Saved scans loaded", "Сохранённые проверки загружены")}: ${formatDateTime(lastData.generatedAt || new Date().toISOString())}`, "success");
    }
  };

  const refresh = async () => {
    if (!online() || !refs?.catalogUpdatesContent || typeof fetchScans !== "function") return;
    rememberNotes();
    refs.catalogUpdatesRefreshBtn?.setAttribute("disabled", "disabled");
    setStatus(localText("Loading catalog scans...", "Загружаю проверки каталога..."));
    try {
      const data = await load();
      if (!data) return;
      render();
      setStatus(`${localText("Saved scans loaded", "Сохранённые проверки загружены")}: ${formatDateTime(data.generatedAt || new Date().toISOString())}`, "success");
    } catch (error) {
      setStatus(`${localText("Could not load catalog scans", "Не удалось загрузить проверки каталога")}: ${apiErrorMessage(error)}`, "error");
    } finally {
      refs.catalogUpdatesRefreshBtn?.removeAttribute("disabled");
    }
  };

  const open = async () => {
    if (!canOpen?.()) {
      showToast?.(localText("Catalog updates are available only to administrators.", "Обновления каталога доступны только администратору."), "error");
      return;
    }
    if (isForcedOffline?.()) {
      showToast?.(localText("Catalog updates are unavailable offline.", "Обновления каталога недоступны офлайн."), "error");
      return;
    }
    openModalDialog?.(refs?.catalogUpdatesDialog);
    syncDialogHeight();
    await refresh();
  };

  const findChange = card => latestChanges(lastData).find(change => change.id === card.dataset.changeId && (change.reviewScanId || latestManufacturerCatalogReviewScan(lastData)?.id) === card.dataset.scanId);
  const handleDecision = async (event) => {
    const selectAll = event.target.closest("[data-catalog-photo-default]");
    if (selectAll) {
      const card = selectAll.closest("[data-change-id]");
      const defaults = catalogPhotoSelection({ ...findChange(card), photoSelection: null, manualPhotoException: null }).selectedUrls;
      card.querySelectorAll("[data-catalog-photo-url]").forEach(input => { input.checked = defaults.includes(input.dataset.catalogPhotoUrl); });
      rememberNotes();
      return;
    }
    const proposedButton = event.target.closest('[data-catalog-proposed-product]');
    if (proposedButton && typeof openProposedProduct === 'function') {
      rememberNotes();
      const card = proposedButton.closest('[data-change-id]'), change = findChange(card);
      const selected = [...card.querySelectorAll('[data-catalog-photo-url]')].filter(input => input.checked).map(input => input.dataset.catalogPhotoUrl);
      const entry = { ...change.after, ...(card.querySelector('[data-catalog-photo-url]') ? { sourceImageUrls: selected, sourceImageUrl: selected[0] || '' } : {}) };
      try { await openProposedProduct(entry, { canOpen: () => Boolean(refs.catalogUpdatesDialog?.open) }); }
      catch { showToast?.(localText('Could not open the preview.', 'Не удалось открыть предпросмотр.'), 'error'); }
      return;
    }
    const productButton = event.target.closest("[data-catalog-current-product]");
    if (productButton) {
      if (typeof openCurrentProduct !== "function" || productButton.getAttribute("aria-busy") === "true") return;
      rememberNotes();
      productButton.setAttribute("aria-busy", "true");
      const parentStillOpen = () => Boolean(refs.catalogUpdatesDialog?.open);
      try {
        const opened = await openCurrentProduct(productButton.dataset.catalogCurrentProduct, { canOpen: parentStillOpen });
        if (opened === false && parentStillOpen()) showToast?.(localText("This model is not in the current catalog.", "Этой модели нет в текущем каталоге."), "warning");
      } catch {
        if (parentStillOpen()) showToast?.(localText("Could not open the catalog card. Please retry.", "Не удалось открыть карточку каталога. Попробуйте ещё раз."), "error");
      } finally {
        productButton.removeAttribute("aria-busy");
      }
      return;
    }
    const manufacturer = event.target.closest("[data-catalog-manufacturer]");
    if (manufacturer) {
      rememberNotes();
      filters.manufacturer = manufacturer.dataset.catalogManufacturer;
      render();
      refs.catalogUpdatesContent.querySelector(`[data-catalog-manufacturer="${filters.manufacturer}"]`)?.focus();
      return;
    }
    const typeButton = event.target.closest("[data-catalog-type]");
    if (typeButton) {
      rememberNotes();
      filters.type = typeButton.dataset.catalogType;
      render();
      refs.catalogUpdatesContent.querySelector(`[data-catalog-type="${filters.type}"]`)?.focus();
      return;
    }
    const button = event.target.closest("[data-catalog-decision]");
    if (!button || typeof saveDecision !== "function" || !online()) return;
    const card = button.closest("[data-scan-id][data-change-id]");
    if (!card) return;
    const key = card.dataset.scanId + "/" + card.dataset.changeId;
    if (pendingDecisions.has(key)) return;
    rememberNotes();
    const photoInputs = [...card.querySelectorAll("[data-catalog-photo-url]")];
    const photoSelection = photoInputs.length ? catalogPhotoSelection(findChange(card), photoInputs.filter(input => input.checked).map(input => input.dataset.catalogPhotoUrl)) : undefined;
    if (photoSelection && lastData?.photoSelectionSupported !== true) { setStatus(localText("Photo selection is not available on this server yet.", "Сохранение выбора фотографий ещё не подключено на этом сервере."), "error"); return; }
    if (photoSelection && !photoSelection.selectedUrls.length && button.dataset.catalogDecision === "approved" && findChange(card)?.type !== "missing") { setStatus(localText("Select at least one photograph, or reject this update.", "Выберите хотя бы одну фотографию или отклоните это обновление."), "error"); return; }
    pendingDecisions.add(key);
    const epoch = accessEpoch;
    const previous = findChange(card);
    const reconsideringPhotoApproval = previous?.decision === 'approved' && Boolean(previous.photoSelection);
    card.querySelectorAll("button, input, textarea").forEach((item) => item.setAttribute("disabled", "disabled"));
    setStatus(localText("Saving review...", "Сохраняю решение..."));
    try {
      const input = {
        scanId: card.dataset.scanId,
        changeId: card.dataset.changeId,
        decision: button.dataset.catalogDecision,
        note: card.querySelector("[data-catalog-note]")?.value || "",
        ...(photoSelection ? { photoSelection } : {}),
      };
      const response = await saveDecision(input);
      if (epoch !== accessEpoch || !canOpen?.()) return;
      const result = { ...response, reviewedAt: response?.reviewedAt || new Date().toISOString() };
      savedDecisions.set(key, { input, result, revision: ++decisionRevision });
      applyManufacturerCatalogDecision(lastData, input, result);
      pendingDecisions.delete(key);
      // Preserve edits made in other cards while this request was pending.
      rememberNotes();
      updateBadge();
      render(key);
      setStatus(localText('Review saved.', 'Решение сохранено.'), 'success');
      // Reconsidering an old approval can uncover an exception outside the loaded scan history.
      if (reconsideringPhotoApproval && input.decision !== 'approved')
        void refresh();
    } catch (error) {
      if (epoch !== accessEpoch || !canOpen?.()) return;
      pendingDecisions.delete(key);
      refs.catalogUpdatesContent.querySelectorAll("[data-change-id]").forEach(row => {
        if (row.dataset.scanId + "/" + row.dataset.changeId === key) row.querySelectorAll("button, input, textarea").forEach(item => item.removeAttribute("disabled"));
      });
      setStatus(`${localText("Could not save review", "Не удалось сохранить решение")}: ${apiErrorMessage(error)}`, "error");
    }
  };

  refs?.catalogUpdatesRefreshBtn?.addEventListener("click", refresh);
  refs?.catalogUpdatesContent?.addEventListener("click", handleDecision);
  refs?.catalogUpdatesContent?.addEventListener("change", (event) => {
    if (!event.target.matches("[data-catalog-review-only]")) return;
    rememberNotes();
    filters.reviewOnly = event.target.checked;
    render();
    refs.catalogUpdatesContent.querySelector("[data-catalog-review-only]")?.focus();
  });
  refs?.menuBtn?.addEventListener("click", checkForUpdates);
  syncVisibility();
  syncDialogHeight();

  return { open, refresh, syncVisibility, checkForUpdates };
}
