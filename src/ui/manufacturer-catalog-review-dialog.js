import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";

const isEnglish = () => currentDocumentLanguage() === "en";
const localText = (en, ru) => isEnglish() ? en : ru;
const currentLocale = () => isEnglish() ? "en-US" : "ru-RU";

const TYPE_TEXT = Object.freeze({
  added: ["New model", "Новая модель"],
  changed: ["Data changed", "Изменились данные"],
  missing: ["Missing from source", "Не найдена у производителя"],
});

const DECISION_TEXT = Object.freeze({
  pending: ["Awaiting review", "Ожидает проверки"],
  approved: ["Approved", "Подтверждено"],
  rejected: ["Rejected", "Отклонено"],
  deferred: ["Review later", "Проверить позже"],
});

const FIELD_TEXT = Object.freeze({
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
  sourceImageUrl: ["Image", "Изображение"],
});

const formatDateTime = (value) => {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Intl.DateTimeFormat(currentLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time)) : "—";
};

const formatValue = (value) => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? localText("Yes", "Да") : localText("No", "Нет");
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(" / ") : "—";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatValue(item)}`).join("; ");
  return String(value);
};

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
      <dd><del>${escapeHtml(formatValue(item.before))}</del><span aria-hidden="true">→</span><ins>${escapeHtml(formatValue(item.after))}</ins></dd>
    </div>
  `).join("")}</dl>`;
};

const renderManufacturerStatus = (manufacturer = {}) => {
  const partial = manufacturer.status !== "complete";
  return `<li class="catalog-review-manufacturer${partial ? " has-warning" : ""}">
    <strong>${escapeHtml(manufacturer.name || manufacturer.id)}</strong>
    <span>${escapeHtml(String(manufacturer.productCount || 0))} ${escapeHtml(localText("products", "товаров"))}</span>
    <small>${escapeHtml(partial
      ? localText("Scan needs attention", "Сканирование требует внимания")
      : localText("Scan completed", "Сканирование завершено"))}</small>
  </li>`;
};

const renderDecisionButton = (change, decision, label) => `
  <button type="button" class="${change.decision === decision ? "active" : "ghost"}" data-catalog-decision="${decision}">${escapeHtml(label)}</button>
`;

const renderChange = (change = {}, scanId = "") => {
  const typePair = TYPE_TEXT[change.type] || [change.type, change.type];
  const decisionPair = DECISION_TEXT[change.decision] || DECISION_TEXT.pending;
  const sourceUrl = safeExternalUrl(change.sourceUrl);
  return `<article class="catalog-review-change type-${escapeHtml(change.type || "changed")}" data-scan-id="${escapeHtml(scanId)}" data-change-id="${escapeHtml(change.id || "")}">
    <header>
      <div>
        <span class="catalog-review-change-type">${escapeHtml(localText(typePair[0], typePair[1]))}</span>
        <h4>${escapeHtml(`${change.manufacturer || ""} ${change.productName || change.productId || ""}`.trim())}</h4>
      </div>
      <span class="catalog-review-decision decision-${escapeHtml(change.decision || "pending")}">${escapeHtml(localText(decisionPair[0], decisionPair[1]))}</span>
    </header>
    ${renderFieldChanges(change.fields)}
    ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localText("Open manufacturer source", "Открыть источник производителя"))}</a>` : ""}
    <label class="catalog-review-note">
      <span>${escapeHtml(localText("Review note", "Комментарий к проверке"))}</span>
      <textarea rows="2" maxlength="1000" data-catalog-note placeholder="${escapeHtml(localText("Optional", "Необязательно"))}">${escapeHtml(change.decisionNote || "")}</textarea>
    </label>
    <div class="catalog-review-actions">
      ${renderDecisionButton(change, "approved", localText("Approve", "Подтвердить"))}
      ${renderDecisionButton(change, "rejected", localText("Reject", "Отклонить"))}
      ${renderDecisionButton(change, "deferred", localText("Later", "Позже"))}
    </div>
  </article>`;
};

export function renderManufacturerCatalogReview(data = {}) {
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
  const scan = scans[0];
  const changes = Array.isArray(scan.changes) ? scan.changes : [];
  const pending = changes.filter((item) => !item.decision || item.decision === "pending").length;
  return `
    <section class="catalog-review-summary">
      <div><strong>${escapeHtml(formatDateTime(scan.scannedAt))}</strong><span>${escapeHtml(localText("Data checked at", "Данные проверены на"))}</span></div>
      <div><strong>${escapeHtml(String(scan.summary?.products || 0))}</strong><span>${escapeHtml(localText("products checked", "товаров проверено"))}</span></div>
      <div><strong>${escapeHtml(String(changes.length))}</strong><span>${escapeHtml(localText("changes found", "изменений найдено"))}</span></div>
      <div><strong>${escapeHtml(String(pending))}</strong><span>${escapeHtml(localText("awaiting review", "ожидают проверки"))}</span></div>
    </section>
    <ul class="catalog-review-manufacturers">${(scan.manufacturers || []).map(renderManufacturerStatus).join("")}</ul>
    <p class="catalog-review-safety-note">${escapeHtml(localText(
      "A decision records your review. The public catalog is not changed automatically.",
      "Решение фиксирует вашу проверку. Публичный каталог автоматически не меняется."
    ))}</p>
    <section class="catalog-review-changes" aria-label="${escapeHtml(localText("Detected catalog changes", "Найденные изменения каталога"))}">
      ${changes.length ? changes.map((change) => renderChange(change, scan.id)).join("") : `<p class="catalog-review-empty">${escapeHtml(localText("No changes found.", "Изменений не найдено."))}</p>`}
    </section>
  `;
}

export function createManufacturerCatalogReviewDialogController({
  refs,
  fetchScans,
  saveDecision,
  canOpen,
  isForcedOffline,
  openModalDialog,
  showToast,
  apiErrorMessage = (error) => String(error?.message || error || localText("Error", "Ошибка")),
} = {}) {
  let lastData = null;
  let renderedLanguage = "";

  const setStatus = (message, type = "") => {
    if (!refs?.catalogUpdatesStatus) return;
    refs.catalogUpdatesStatus.className = `dialog-status ${type}`.trim();
    refs.catalogUpdatesStatus.textContent = message || "";
  };

  const syncVisibility = () => {
    if (refs?.catalogUpdatesBtn) refs.catalogUpdatesBtn.hidden = !canOpen?.();
    const language = currentDocumentLanguage();
    if (lastData && refs?.catalogUpdatesDialog?.open && renderedLanguage !== language) {
      refs.catalogUpdatesContent.innerHTML = renderManufacturerCatalogReview(lastData);
      renderedLanguage = language;
      setStatus(`${localText("Updated", "Обновлено")}: ${formatDateTime(lastData.generatedAt || new Date().toISOString())}`, "success");
    }
  };

  const refresh = async () => {
    if (!refs?.catalogUpdatesContent || typeof fetchScans !== "function") return;
    refs.catalogUpdatesRefreshBtn?.setAttribute("disabled", "disabled");
    setStatus(localText("Loading catalog scans...", "Загружаю проверки каталога..."));
    try {
      const data = await fetchScans();
      lastData = data;
      renderedLanguage = currentDocumentLanguage();
      refs.catalogUpdatesContent.innerHTML = renderManufacturerCatalogReview(data);
      setStatus(`${localText("Updated", "Обновлено")}: ${formatDateTime(data.generatedAt || new Date().toISOString())}`, "success");
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
    await refresh();
  };

  const handleDecision = async (event) => {
    const button = event.target.closest("[data-catalog-decision]");
    if (!button || typeof saveDecision !== "function") return;
    const card = button.closest("[data-scan-id][data-change-id]");
    if (!card) return;
    card.querySelectorAll("button").forEach((item) => item.setAttribute("disabled", "disabled"));
    setStatus(localText("Saving review...", "Сохраняю решение..."));
    try {
      await saveDecision({
        scanId: card.dataset.scanId,
        changeId: card.dataset.changeId,
        decision: button.dataset.catalogDecision,
        note: card.querySelector("[data-catalog-note]")?.value || "",
      });
      await refresh();
    } catch (error) {
      card.querySelectorAll("button").forEach((item) => item.removeAttribute("disabled"));
      setStatus(`${localText("Could not save review", "Не удалось сохранить решение")}: ${apiErrorMessage(error)}`, "error");
    }
  };

  refs?.catalogUpdatesRefreshBtn?.addEventListener("click", refresh);
  refs?.catalogUpdatesContent?.addEventListener("click", handleDecision);
  syncVisibility();

  return { open, refresh, syncVisibility };
}
