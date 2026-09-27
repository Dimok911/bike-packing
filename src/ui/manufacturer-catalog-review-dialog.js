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
  sourceImageUrl: ["Main image", "Основное изображение"],
  sourceImageUrls: ["Image gallery", "Галерея изображений"],
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
      <dd>${renderInlineDiff(item.before, item.after)}</dd>
    </div>
  `).join("")}</dl>`;
};

export const catalogChangeNeedsReview = (change) => !change.decision || ["pending", "deferred"].includes(change.decision);

const manufacturerKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const changeManufacturerKey = (change) => manufacturerKey(change.manufacturerId || change.manufacturer);
const latestChanges = (data) => Array.isArray(data?.scans?.[0]?.changes) ? data.scans[0].changes : [];
export const catalogReviewCount = (data) => latestChanges(data).filter(catalogChangeNeedsReview).length;

const renderManufacturerStatus = (manufacturer = {}, changes = [], selected = "") => {
  const partial = manufacturer.status !== "complete";
  const key = manufacturerKey(manufacturer.id || manufacturer.name);
  const ownChanges = changes.filter((change) => changeManufacturerKey(change) === key);
  const reviewCount = ownChanges.filter(catalogChangeNeedsReview).length;
  return `<li><button type="button" data-catalog-manufacturer="${escapeHtml(key)}" aria-pressed="${selected === key}" class="catalog-review-manufacturer${reviewCount ? " has-changes" : ""}${partial ? " has-warning" : ""}">
    <strong>${escapeHtml(manufacturer.name || manufacturer.id)}</strong>
    <span>${escapeHtml(String(manufacturer.productCount || 0))} ${escapeHtml(localText("products", "товаров"))}</span>
    <b class="catalog-review-manufacturer-count">${escapeHtml(localText(`To review: ${reviewCount} · Total changes: ${ownChanges.length}`, `К проверке: ${reviewCount} · Всего изменений: ${ownChanges.length}`))}</b>
    <small>${escapeHtml(partial
      ? localText("Scan incomplete — errors need checking", "Сканирование неполное — есть ошибки")
      : localText("Scan completed", "Сканирование завершено"))}</small>
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
  </div>${change.fields?.length ? `<p class="catalog-review-diff-legend">
    <span><del>${escapeHtml(localText("Struck through", "Зачёркнуто"))}</del> — ${escapeHtml(localText("current catalog value", "значение в текущем каталоге"))}.</span>
    <span><ins>${escapeHtml(localText("Highlighted", "Выделено цветом"))}</ins> — ${escapeHtml(localText("proposed replacement", "предлагаемая замена"))}.</span>
  </p>` : ""}`;
};

const renderChange = (change = {}, scanId = "", scannedAt = "") => {
  const typePair = TYPE_TEXT[change.type] || [change.type, change.type];
  const explanationPair = TYPE_EXPLANATION[change.type] || ["", ""];
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
    ${explanationPair[0] ? `<p class="catalog-review-publication-state">${escapeHtml(localText(explanationPair[0], explanationPair[1]))}</p>` : ""}
    ${renderComparisonContext(change, scannedAt)}
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

export function renderManufacturerCatalogReview(data = {}, { manufacturer = "", reviewOnly = true } = {}) {
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
  const pending = changes.filter(catalogChangeNeedsReview).length;
  const filtered = changes.filter((change) => (!manufacturer || changeManufacturerKey(change) === manufacturer) && (!reviewOnly || catalogChangeNeedsReview(change)));
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
      "This is the scan date and time, not a date range. Each card shows the dates of the compared data. Refresh reloads saved scans; it does not run a new manufacturer scan.",
      "Это дата и время проверки, а не период изменений. Даты сравниваемых данных указаны в карточках. Кнопка «Обновить» загружает сохранённые проверки, а не запускает новое сканирование производителей."
    ))}</p>
    <div class="catalog-review-filters">
      <button type="button" class="ghost" data-catalog-manufacturer="" aria-pressed="${!manufacturer}">${escapeHtml(localText(`All manufacturers · To review: ${pending}`, `Все производители · К проверке: ${pending}`))}</button>
      <label><input type="checkbox" data-catalog-review-only ${reviewOnly ? "checked" : ""}>${escapeHtml(localText("Only awaiting review (including Later)", "Только к проверке (включая «Позже»)"))}</label>
    </div>
    <ul class="catalog-review-manufacturers">${manufacturers.map((item) => renderManufacturerStatus(item, changes, manufacturer)).join("")}</ul>
    <p class="catalog-review-safety-note">${escapeHtml(localText(
      "A decision records your review. The public catalog is not changed automatically.",
      "Решение фиксирует вашу проверку. Публичный каталог автоматически не меняется."
    ))}</p>
    <p class="catalog-review-results" aria-live="polite">${escapeHtml(localText(`Shown: ${filtered.length} · ${manufacturers.find((item) => manufacturerKey(item.id || item.name) === manufacturer)?.name || "All manufacturers"}`, `Показано записей: ${filtered.length} · ${manufacturers.find((item) => manufacturerKey(item.id || item.name) === manufacturer)?.name || "Все производители"}`))}</p>
    <section class="catalog-review-changes" aria-label="${escapeHtml(localText("Detected catalog changes", "Найденные изменения каталога"))}">
      ${filtered.length ? filtered.map((change) => renderChange(change, scan.id, scan.scannedAt)).join("") : `<p class="catalog-review-empty">${escapeHtml(changes.length ? localText("No entries match these filters.", "По выбранным фильтрам записей нет.") : localText("No changes found.", "Изменений не найдено."))}</p>`}
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
  now = () => Date.now(),
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancelSchedule = (timer) => globalThis.clearTimeout(timer),
  apiErrorMessage = (error) => String(error?.message || error || localText("Error", "Ошибка")),
} = {}) {
  let lastData = null;
  let renderedLanguage = "";
  let filters = { manufacturer: "", reviewOnly: true };
  let inFlight = null;
  let lastAttempt = -Infinity;
  let timer = null;
  let accessEpoch = 0;
  let allowed = false;
  const noteDrafts = new Map();
  const online = () => Boolean(canOpen?.()) && !isForcedOffline?.();
  const rememberNotes = () => refs?.catalogUpdatesContent?.querySelectorAll?.("[data-change-id]").forEach((card) => {
    const note = card.querySelector("[data-catalog-note]");
    if (note) noteDrafts.set(`${card.dataset.scanId}/${card.dataset.changeId}`, note.value);
  });
  const render = () => {
    if (!lastData || !refs?.catalogUpdatesContent) return;
    refs.catalogUpdatesContent.innerHTML = renderManufacturerCatalogReview(lastData, filters);
    refs.catalogUpdatesContent.querySelectorAll?.("[data-change-id]").forEach((card) => {
      const key = `${card.dataset.scanId}/${card.dataset.changeId}`;
      const note = card.querySelector("[data-catalog-note]");
      if (note && noteDrafts.has(key)) note.value = noteDrafts.get(key);
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
    button.setAttribute("title", description);
  };
  const load = () => {
    if (!online() || typeof fetchScans !== "function") return Promise.resolve(null);
    if (inFlight) return inFlight;
    lastAttempt = now();
    const epoch = accessEpoch;
    const request = Promise.resolve().then(fetchScans).then((data) => {
      if (epoch !== accessEpoch || !online()) return null;
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
      filters = { manufacturer: "", reviewOnly: true };
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
    await refresh();
  };

  const handleDecision = async (event) => {
    const manufacturer = event.target.closest("[data-catalog-manufacturer]");
    if (manufacturer) {
      rememberNotes();
      filters.manufacturer = manufacturer.dataset.catalogManufacturer;
      render();
      refs.catalogUpdatesContent.querySelector(`[data-catalog-manufacturer="${filters.manufacturer}"]`)?.focus();
      return;
    }
    const button = event.target.closest("[data-catalog-decision]");
    if (!button || typeof saveDecision !== "function" || !online()) return;
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
      // An earlier background response must not replace the saved decision.
      if (inFlight) await inFlight.catch(() => {});
      await refresh();
    } catch (error) {
      card.querySelectorAll("button").forEach((item) => item.removeAttribute("disabled"));
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

  return { open, refresh, syncVisibility, checkForUpdates };
}
