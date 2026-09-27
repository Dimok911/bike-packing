import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  catalogReviewCount,
  createManufacturerCatalogReviewDialogController,
  manufacturerCatalogInlineDiffParts,
  renderManufacturerCatalogReview
} from "../../src/ui/manufacturer-catalog-review-dialog.js";
import {
  fetchManufacturerCatalogScans,
  saveManufacturerCatalogDecision,
} from "../../src/sync/manufacturer-catalog-review.js";

const projectRoot = resolve(import.meta.dirname, "../..");

test("CRITICAL catalog review: editorial description wording is excluded from saved scans and badge counts", async () => {
  const { compareManufacturerCatalogSnapshots } = await import("../../src/data/manufacturer-catalog-scan.js");
  const { catalogChangesForReview } = await import("../../src/data/manufacturer-catalog-comparison.js");
  const before = {
    en: "Arkel fork bag in 5 L. Technical data is normalized from the official product page.",
    ru: "Сумка на вилку Arkel объёмом 5 L. Характеристики нормализованы по официальной карточке товара.",
  };
  const after = {
    en: "Arkel fork bag in 5 L. Specifications are from the manufacturer's official product page.",
    ru: "Сумка на вилку Arkel объёмом 5 L. Характеристики взяты с официальной страницы производителя.",
  };
  const editorial = { id: "editorial", manufacturer: "Arkel", type: "changed", fields: [{ field: "description", before, after }] };
  const real = { ...editorial, id: "real", fields: [...editorial.fields, { field: "weight", before: 0, after: 454 }] };
  const data = { scans: [{ changes: [editorial, real] }] };
  const evidence = JSON.stringify(data);
  assert.equal(catalogReviewCount(data), 1);
  const html = renderManufacturerCatalogReview(data);
  assert.doesNotMatch(html, /data-change-id="editorial"|Technical data|Specifications are/);
  assert.match(html, /data-change-id="real"/);
  assert.match(html, /454/);
  assert.match(html, /Исключено из проверки: 1|Excluded from review: 1/);
  assert.equal(JSON.stringify(data), evidence, "Saved evidence is unchanged");
  const entry = { id: "bag", brand: "Arkel", description: before };
  assert.equal(compareManufacturerCatalogSnapshots([entry], [{ ...entry, description: after }]).changes.length, 0);
  const realDescription = { ...after, en: after.en.replace("5 L", "7 L") };
  assert.equal(compareManufacturerCatalogSnapshots([entry], [{ ...entry, description: realDescription }]).changes.length, 1);
  const reviewed = catalogChangesForReview([{ ...editorial, fields: [{ field: "description", before, after: realDescription }] }]);
  assert.equal(reviewed.length, 1);
  assert.equal(reviewed[0].fields[0].after.en, "Arkel fork bag in 7 L.");
  assert.equal(catalogChangesForReview([{ ...editorial, fields: [{ field: "manufacturerDetails", before: "Technical data", after: "New waterproof coating" }] }]).length, 1);
});

test("CRITICAL catalog review: manufacturer filters and counters include deferred but exclude resolved decisions", () => {
  const data = { scans: [{ manufacturers: [
    { id: "ortlieb", name: "ORTLIEB", productCount: 56, status: "complete" },
    { id: "apidura", name: "Apidura", productCount: 71, status: "partial" }
  ], changes: [
    { id: "one", manufacturerId: "ortlieb", type: "changed" },
    { id: "two", manufacturer: "ORTLIEB", type: "changed", decision: "deferred" },
    { id: "three", manufacturerId: "ortlieb", type: "changed", decision: "approved" },
    { id: "four", manufacturerId: "apidura", type: "added", decision: "pending" },
    { id: "five", manufacturerId: "apidura", type: "missing", decision: "rejected" }
  ] }, { changes: [{ decision: "pending" }] }] };
  assert.equal(catalogReviewCount(data), 3);
  const html = renderManufacturerCatalogReview(data, { manufacturer: "ortlieb" });
  assert.match(html, /data-catalog-manufacturer="ortlieb" aria-pressed="true" class="catalog-review-manufacturer has-changes"/);
  assert.match(html, /(?:К проверке:|To review:) 2 · (?:Всего изменений:|Total changes:) 3/);
  assert.match(html, /data-change-id="one"/);
  assert.match(html, /data-change-id="two"/);
  assert.doesNotMatch(html, /data-change-id="(?:three|four|five)"/);
  assert.match(renderManufacturerCatalogReview(data, { manufacturer: "ortlieb", reviewOnly: false }), /data-change-id="three"/);
  assert.match(renderManufacturerCatalogReview(data, { manufacturer: "unknown" }), /No entries match|По выбранным фильтрам записей нет/);
});

const fakeElement = () => {
  const attributes = new Map();
  const classes = new Set();
  const events = new Map();
  return {
    attributes, classes, events, hidden: false, innerHTML: "",
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    classList: { toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
    addEventListener: (key, listener) => events.set(key, listener),
    querySelectorAll: () => [],
  };
};

test("CRITICAL catalog review: menu badge loads before opening, deduplicates, refreshes and clears on logout", async () => {
  let allowed = false;
  let offline = false;
  let clock = 0;
  let calls = 0;
  let fail = false;
  let data = { scans: [{ changes: [{}, { decision: "deferred" }, { decision: "approved" }] }] };
  const refs = Object.fromEntries(["catalogUpdatesBtn", "catalogUpdatesContent", "catalogUpdatesStatus", "catalogUpdatesRefreshBtn", "menuBtn"].map((key) => [key, fakeElement()]));
  let scheduled;
  const controller = createManufacturerCatalogReviewDialogController({
    refs, canOpen: () => allowed, isForcedOffline: () => offline, now: () => clock,
    schedule: (fn) => { scheduled = fn; return 1; }, cancelSchedule: () => { scheduled = null; },
    fetchScans: async () => { calls += 1; if (fail) throw new Error("unavailable"); return data; },
  });
  assert.equal(calls, 0);
  assert.equal(refs.catalogUpdatesBtn.hidden, true);
  allowed = true;
  controller.syncVisibility();
  controller.syncVisibility();
  await controller.refresh();
  assert.equal(calls, 1);
  assert.equal(refs.catalogUpdatesBtn.attributes.get("data-review-count"), "2");
  assert.ok(refs.catalogUpdatesBtn.classes.has("has-catalog-updates"));
  clock = 60_000;
  fail = true;
  await refs.menuBtn.events.get("click")();
  assert.equal(refs.catalogUpdatesBtn.attributes.get("data-review-count"), "2");
  fail = false;
  data = { scans: [{ changes: [{ decision: "approved" }] }] };
  clock = 300_000;
  await scheduled();
  assert.equal(refs.catalogUpdatesBtn.attributes.has("data-review-count"), false);
  offline = true;
  controller.syncVisibility();
  const beforeOffline = calls;
  clock += 300_000;
  await controller.checkForUpdates();
  assert.equal(calls, beforeOffline);
  assert.equal(scheduled, null);
  allowed = false;
  controller.syncVisibility();
  assert.equal(refs.catalogUpdatesBtn.hidden, true);
  assert.equal(refs.catalogUpdatesContent.innerHTML, "");
});

test("CRITICAL catalog review: late responses cannot restore an admin badge after logout", async () => {
  let allowed = true;
  let resolveFetch;
  const refs = { catalogUpdatesBtn: fakeElement(), catalogUpdatesContent: fakeElement() };
  const controller = createManufacturerCatalogReviewDialogController({
    refs, canOpen: () => allowed, schedule: () => 1, cancelSchedule: () => {},
    fetchScans: () => new Promise((resolve) => { resolveFetch = resolve; }),
  });
  const refresh = controller.refresh();
  await Promise.resolve();
  allowed = false;
  controller.syncVisibility();
  resolveFetch({ scans: [{ changes: [{}] }] });
  await refresh;
  assert.equal(refs.catalogUpdatesBtn.attributes.has("data-review-count"), false);
  assert.equal(refs.catalogUpdatesContent.innerHTML, "");
});

test("CRITICAL catalog review: scan time and comparison dates are distinct, including missing dates", () => {
  const previousDocument = globalThis.document;
  try {
    globalThis.document = { documentElement: { lang: "ru" } };
    const html = renderManufacturerCatalogReview({
      generatedAt: "2026-09-27T12:00:00Z",
      scans: [{ id: "scan", scannedAt: "2026-09-05T12:27:00Z", changes: [
        { id: "dated", type: "changed", before: { sourceCheckedAt: "2026-08-29" }, after: { sourceCheckedAt: "2026-09-04" }, fields: [{ field: "volume", before: 4, after: 6 }] },
        { id: "undated", type: "changed", fields: [{ field: "volume", before: 4, after: 6 }] },
        { id: "new", type: "added", after: { sourceCheckedAt: "2026-09-04" } },
        { id: "missing", type: "missing", before: { sourceCheckedAt: "2026-08-29" } }
      ] }]
    });
    const card = (id) => html.match(new RegExp(`data-change-id="${id}"[^>]*>([\\s\\S]*?)</article>`))[1];
    assert.match(html, /5 сентября 2026 г\. · время/);
    assert.doesNotMatch(html, /27 сентября/);
    assert.match(html, /не период изменений/);
    assert.match(card("dated"), /Сейчас в каталоге[\s\S]*29 августа 2026 г\.[\s\S]*Предлагаемое обновление[\s\S]*4 сентября 2026 г\./);
    assert.match(card("dated"), /<del>Зачёркнуто<\/del> — значение в текущем каталоге/);
    assert.match(card("undated"), /Сейчас в каталоге[\s\S]*Дата не указана/);
    assert.match(card("undated"), /Предлагаемое обновление[\s\S]*5 сентября 2026 г\./);
    assert.match(card("new"), /Этой модели в каталоге ещё нет/);
    assert.match(card("missing"), /Не найдена при проверке: 5 сентября 2026 г\./);
    globalThis.document.documentElement.lang = "en";
    const english = renderManufacturerCatalogReview({ scans: [{ scannedAt: "2026-09-05T12:27:00Z", changes: [{ type: "changed" }] }] });
    assert.match(english, /Current catalog/);
    assert.match(english, /Proposed update/);
    assert.match(english, /September 5, 2026/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("CRITICAL catalog review: renders source evidence and explicit non-automatic publishing notice", () => {
  const html = renderManufacturerCatalogReview({
    scans: [{
      id: "catalog-scan-20260830",
      scannedAt: "2026-08-30T09:00:00.000Z",
      summary: { products: 123 },
      manufacturers: [{ id: "ortlieb", name: "ORTLIEB", productCount: 87, status: "complete" }],
      changes: [{
        id: "ortlieb:changed:back-roller",
        manufacturer: "ORTLIEB",
        productName: "Back-Roller",
        type: "changed",
        sourceUrl: "https://www.ortlieb.com/en_us/back-roller",
        fields: [{ field: "mountingOptions", before: ["Quick-Lock2.1"], after: ["Quick-Lock2.1", "Quick-Lock3.1"] }],
        decision: "pending",
      }],
    }],
  });
  assert.match(html, /Back-Roller/);
  assert.match(html, /Quick-Lock2\.1/);
  assert.match(html, /Quick-Lock3\.1/);
  assert.match(html, /https:\/\/www\.ortlieb\.com/);
  assert.match(html, /not changed automatically|автоматически не меняется/);
  assert.match(html, /data-catalog-decision="approved"/);
});

test("CRITICAL catalog review: API calls use admin review routes and encoded ids", async () => {
  const calls = [];
  const apiFetch = async (path, options) => {
    calls.push({ path, options });
    return { ok: true };
  };
  await fetchManufacturerCatalogScans(apiFetch, { timeoutMs: 1234 });
  await saveManufacturerCatalogDecision(apiFetch, {
    scanId: "scan/one",
    changeId: "brand:model one",
    decision: "approved",
    note: "checked",
    timeoutMs: 2345,
  });
  assert.equal(calls[0].path, "/bike-packing/admin/catalog-scans");
  assert.equal(calls[1].path, "/bike-packing/admin/catalog-scans/scan%2Fone/changes/brand%3Amodel%20one");
  assert.equal(calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].options.body), { decision: "approved", note: "checked" });
});

test("CRITICAL catalog review: unchanged text stays plain while only removed and added tokens are marked", () => {
  const parts = manufacturerCatalogInlineDiffParts(
    "sku: F5305; mounting: Quick-Lock2.1; available: Yes",
    "sku: F5305; mounting: Quick-Lock2.2; available: Yes"
  );
  assert.deepEqual(parts.filter(({ type }) => type !== "equal"), [
    { type: "removed", value: "Quick-Lock2.1" },
    { type: "added", value: "Quick-Lock2.2" }
  ]);
  const html = renderManufacturerCatalogReview({
    scans: [{
      id: "scan",
      scannedAt: "2026-08-30T09:00:00.000Z",
      summary: { products: 1 },
      manufacturers: [],
      changes: [{
        id: "change",
        type: "changed",
        productName: "Back-Roller",
        fields: [{ field: "mounting", before: "Quick-Lock2.1", after: "Quick-Lock2.2" }]
      }]
    }]
  });
  assert.match(html, /<del>Quick-Lock2\.1<\/del><ins>Quick-Lock2\.2<\/ins>/);
  assert.doesNotMatch(html, /<del>sku:/);
});

test("CRITICAL catalog review: dialog is admin-only and wired into synchronized visibility", () => {
  const indexSource = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
  const syncUiSource = readFileSync(resolve(projectRoot, "src/ui/sync-ui.js"), "utf8");
  const stylesSource = readFileSync(resolve(projectRoot, "styles.css"), "utf8");
  assert.match(indexSource, /id="catalogUpdatesBtn"[^>]*admin-menu-item[^>]*hidden/);
  assert.match(indexSource, /id="catalogUpdatesDialog"/);
  assert.match(indexSource, /class="catalog-review-menu-schedule">Автопроверка — 1-го числа каждого месяца/);
  assert.match(appSource, /FRONTEND_PERMISSION_ACTIONS\.CATALOG_REVIEW/);
  assert.match(syncUiSource, /manufacturerCatalogReviewDialogController\?\.syncVisibility\?\.\(\)/);
  assert.match(stylesSource, /#catalogUpdatesDialog\s*\{[^}]*width:\s*min\(1500px, calc\(100vw - 24px\)\)/s);
  assert.match(stylesSource, /\.catalog-updates-dialog-card\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/s);
});
