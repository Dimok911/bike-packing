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

test("CRITICAL catalog review: type filters intersect manufacturer and decisions with scoped counts", () => {
  const changes = [
    { id: "new", manufacturer: "Arkel", type: "added" },
    { id: "gone", manufacturer: "Arkel", type: "missing", decision: "deferred" },
    { id: "edited", manufacturer: "Arkel", type: "changed", fields: [{ field: "weight", before: 1, after: 2 }] },
    { id: "resolved", manufacturer: "Arkel", type: "added", decision: "approved" },
    { id: "other", manufacturer: "ORTLIEB", type: "added" },
    { id: "editorial", manufacturer: "Arkel", type: "changed", fields: [{ field: "description", before: "Bag. Technical data is normalized from the official product page.", after: "Bag. Specifications are from the manufacturer's official product page." }] },
  ];
  const data = { scans: [{ changes }] };
  const html = renderManufacturerCatalogReview(data, { manufacturer: "arkel", type: "added" });
  assert.match(html, /data-change-id="new"/);
  assert.doesNotMatch(html, /data-change-id="(?:gone|edited|resolved|other|editorial)"/);
  assert.match(html, /data-catalog-type="" aria-pressed="false">[^<]+ · 3/);
  assert.match(html, /data-catalog-type="added" aria-pressed="true">[^<]+ · 1/);
  assert.match(html, /data-catalog-type="missing" aria-pressed="false">[^<]+ · 1/);
  assert.match(renderManufacturerCatalogReview(data, { manufacturer: "arkel", type: "missing" }), /data-change-id="gone"/);
  const resolved = renderManufacturerCatalogReview(data, { manufacturer: "arkel", type: "added", reviewOnly: false });
  assert.match(resolved, /data-change-id="resolved"/);
  assert.match(resolved, /data-catalog-type="added" aria-pressed="true">[^<]+ · 2/);
  assert.match(renderManufacturerCatalogReview(data, { manufacturer: "unknown", type: "added" }), /No entries match|По выбранным фильтрам записей нет/);
  assert.equal(catalogReviewCount(data), 4, "Menu badge is not narrowed by the dialog filters");
});

test("CRITICAL catalog review: a targeted scan replaces only its manufacturer and retains original review destinations", async () => {
  const { latestManufacturerCatalogReviewScan } = await import("../../src/ui/manufacturer-catalog-review-dialog.js");
  const data = { scans: [
    { id: "arkel-new", scannedAt: "2026-09-27", manufacturers: [{ id: "arkel", name: "Arkel", productCount: 62 }], changes: [{ id: "orca-found", manufacturerId: "arkel", type: "changed" }] },
    { id: "all-old", scannedAt: "2026-09-05", manufacturers: [{ id: "arkel", name: "Arkel", productCount: 56 }, { id: "ortlieb", name: "ORTLIEB", productCount: 63 }], changes: [
      { id: "orca-missing", manufacturerId: "arkel", type: "missing" },
      { id: "ortlieb-pending", manufacturerId: "ortlieb", type: "added" },
      { id: "ortlieb-approved", manufacturerId: "ortlieb", type: "changed", decision: "approved", decisionNote: "Verified" },
    ] },
  ] };
  const original = JSON.stringify(data);
  const scan = latestManufacturerCatalogReviewScan(data);
  assert.equal(scan.summary.products, 125);
  assert.equal(scan.mixedScans, true);
  assert.equal(catalogReviewCount(data), 2);
  assert.deepEqual(scan.changes.map(({ id }) => id), ["orca-found", "ortlieb-pending", "ortlieb-approved"]);
  const html = renderManufacturerCatalogReview(data, { reviewOnly: false });
  assert.match(html, /data-scan-id="arkel-new" data-change-id="orca-found"/);
  assert.match(html, /data-scan-id="all-old" data-change-id="ortlieb-approved"/);
  assert.match(html, /Verified/);
  assert.doesNotMatch(html, /data-change-id="orca-missing"/);
  assert.equal(JSON.stringify(data), original);
  const empty = { scans: [{ ...data.scans[0], changes: [] }, data.scans[1]] };
  assert.equal(catalogReviewCount(empty), 1, "A successful unchanged recheck also supersedes older warnings");
});

test("photo checks have their own filter, manufacturer count and saved-photo preview", async () => {
  const { compareManufacturerCatalogSnapshots } = await import("../../src/data/manufacturer-catalog-scan.js");
  const previous = { id: "photo-bag", brand: "Tailfin", sourceUrl: "https://www.tailfin.cc/", sourceImageUrls: ["https://media.tailfin.cc/old.jpg"] };
  const fresh = { ...previous, imageReviewRequired: true, imageGalleryPreserved: true, imageReviewReason: "Incomplete size gallery" };
  const changes = compareManufacturerCatalogSnapshots([previous], [fresh]).changes;
  changes.push({ id: "text-only", manufacturerId: "arkel", type: "changed", fields: [{field:"weight",before:100,after:200}] });
  const data = { scans: [{ changes, manufacturers: [{id:"tailfin",name:"Tailfin",status:"complete"},{id:"arkel",name:"Arkel",status:"complete"}] }] };
  assert.equal(catalogReviewCount(data), 2);
  const html = renderManufacturerCatalogReview(data, { type: "photos", manufacturer: "tailfin" });
  assert.match(html,/data-catalog-type="photos" aria-pressed="true"[^>]*>[^<]* · 1/);
  assert.match(html,/Фотографии к проверке|Photographs to check/);
  assert.match(html,/Ранее сохранённые фотографии|Previously saved photographs/);
  assert.match(html,/https:\/\/media.tailfin.cc\/old.jpg/);
  assert.doesNotMatch(html,/data-change-id="text-only"/);
  assert.doesNotMatch(html,/<del>https:\/\/media.tailfin.cc\/old.jpg/);
});

test("photo gallery shows actual additions, removals and cover changes without URL text diffs", async () => {
  const { catalogPhotoChanges } = await import("../../src/ui/manufacturer-catalog-review-dialog.js");
  const old="https://photos.test/old.jpg", kept="https://photos.test/kept.jpg", fresh="https://photos.test/new.jpg";
  const change={id:"gallery",manufacturerId:"arkel",type:"changed",before:{sourceImageUrls:[old,kept]},after:{sourceImageUrls:[fresh,kept]},fields:[{field:"sourceImageUrls",before:[old,kept],after:[fresh,kept]}]};
  assert.deepEqual(catalogPhotoChanges(change),[{url:fresh,state:"added",newCover:true},{url:kept,state:"unchanged",newCover:false},{url:old,state:"removed",newCover:false}]);
  const html=renderManufacturerCatalogReview({scans:[{changes:[change]}]},{type:"photos"});
  assert.match(html,/state-added/);assert.match(html,/state-removed/);assert.match(html,/Новая обложка|New cover/);
  assert.doesNotMatch(html,/<(?:del|ins)>|>https:\/\//);
  const unresolved={...change,after:{...change.before,imageReviewRequired:true,imageGalleryPreserved:true}};
  assert.ok(catalogPhotoChanges(unresolved).every(p=>p.state==='saved'));
  const reorder={...change,after:{sourceImageUrls:[kept,old]}};
  assert.ok(catalogPhotoChanges(reorder).every(p=>p.state==='unchanged'));
  assert.equal(catalogPhotoChanges(reorder)[0].newCover,true);
});

test('photo repair review supplements original scans without hiding newcomers or resetting decisions',async()=>{
 const {latestManufacturerCatalogReviewScan}=await import('../../src/ui/manufacturer-catalog-review-dialog.js');
 const base={id:'base',scannedAt:'2026-09-26',manufacturers:[{id:'arkel',name:'Arkel',productCount:3}],changes:[{id:'new',productId:'new',manufacturerId:'arkel',type:'added',decision:'pending'},{id:'mixed',productId:'bag',manufacturerId:'arkel',type:'changed',decision:'approved',decisionNote:'Keep weight',fields:[{field:'weight',before:1,after:2},{field:'sourceImageUrls',before:['a'],after:[]}]}]};
 const repair={id:'photos',scannedAt:'2026-09-27',manufacturers:[{id:'arkel',name:'Arkel'}],changes:[{id:'photo-bag',productId:'bag',manufacturerId:'arkel',type:'changed',after:{catalogReviewScope:'photos'},fields:[{field:'sourceImageUrls',before:[],after:['a']}]}]};
 const result=latestManufacturerCatalogReviewScan({scans:[repair,base]});
 assert.equal(result.changes.length,3);assert.equal(result.changes[0].type,'added');
 assert.equal(result.changes[1].decision,'approved');assert.equal(result.changes[1].reviewScanId,'base');assert.deepEqual(result.changes[1].fields.map(f=>f.field),['weight']);
 assert.equal(result.changes[2].reviewScanId,'photos');assert.equal(result.summary.products,3);
});
test('our exceptions remain separately visible with note and publication status',()=>{
 const html=renderManufacturerCatalogReview({scans:[{changes:[],manufacturers:[{id:'arkel',name:'Arkel'}]}],photoExceptions:[{productId:'bag',productName:'Bag',manufacturer:'Arkel',retainedUrls:['https://photos.test/old.jpg'],excludedUrls:[],note:'Fits the small size',reviewedAt:'2026-09-27'}]},{type:'exceptions'});
 assert.match(html,/Fits the small size/);assert.match(html,/ожидает публикации|awaiting publication/);assert.ok(html.includes('https://photos.test/old.jpg'));assert.doesNotMatch(html,/data-catalog-decision=/);
});

test('matching corrections replace only affected records and preserve unrelated decisions and newcomers',async()=>{
 const {latestManufacturerCatalogReviewScan}=await import('../../src/ui/manufacturer-catalog-review-dialog.js');
 const base={id:'base',scannedAt:'2026-09-26',manufacturers:[{id:'ortlieb'}],changes:[
 {id:'new',productId:'new',manufacturerId:'ortlieb',type:'added',decision:'approved'},
 {id:'old',productId:'bag',manufacturerId:'ortlieb',type:'changed',decisionNote:'Check the black SKU',fields:[{field:'sourceImageUrls',before:['a'],after:[]}]},
 {id:'resolved',productId:'resolved',manufacturerId:'ortlieb',type:'changed',fields:[{field:'sourceImageUrls',before:['b'],after:[]}]}
 ]};
 const correction={id:'correction',scannedAt:'2026-09-27',manufacturers:[{id:'ortlieb'}],changes:[
 {id:'fixed',productId:'bag',manufacturerId:'ortlieb',type:'changed',after:{catalogReviewScope:'photos',catalogReviewCorrection:true},fields:[{field:'volume',before:23,after:20}]},
 {id:'no-change',productId:'resolved',manufacturerId:'ortlieb',type:'changed',after:{catalogReviewScope:'photos',catalogReviewCorrection:true},fields:[]}
 ]};
 const original=JSON.stringify([correction,base]);
 const result=latestManufacturerCatalogReviewScan({scans:[correction,base]});
 assert.deepEqual(result.changes.map(c=>c.id),['new','fixed']);
 assert.equal(result.changes[0].decision,'approved');assert.equal(result.changes[0].reviewScanId,'base');
 assert.equal(result.changes[1].decisionNote,'Check the black SKU');
 assert.equal(JSON.stringify([correction,base]),original);
});


test('gallery reordering keeps the cover significant but does not create empty photo reviews', async () => {
  const { catalogValuesEqual, catalogChangesForReview } = await import('../../src/data/manufacturer-catalog-comparison.js');
  const urls = ['front', 'back', 'detail'].map(name => 'https://photos.test/' + name + '.jpg');
  const reordered = [urls[0], urls[2], urls[1]];
  assert.equal(catalogValuesEqual('sourceImageUrls', urls, reordered), true);
  assert.equal(catalogValuesEqual('sourceImageUrls', urls, [urls[1], urls[0], urls[2]]), false);
  assert.equal(catalogValuesEqual('sourceImageUrls', urls, urls.slice(0, 2)), false);
  assert.equal(catalogValuesEqual('sourceImageUrls', urls, [...urls, 'https://photos.test/new.jpg']), false);
  const change = { id: 'vario', manufacturerId: 'ortlieb', type: 'changed', before: { sourceImageUrls: urls }, after: { sourceImageUrls: reordered }, fields: [{ field: 'sourceImageUrls', before: urls, after: reordered }] };
  const original = JSON.stringify(change);
  assert.deepEqual(catalogChangesForReview([change]), []);
  const mixed = { ...change, fields: [...change.fields, { field: 'volume', before: 26, after: 22 }] };
  const data = { scans: [{ changes: [mixed] }] };
  assert.equal(catalogReviewCount(data), 1);
  const photoHtml = renderManufacturerCatalogReview(data, { type: 'photos' });
  assert.doesNotMatch(photoHtml, /data-change-id="vario"/);
  const html = renderManufacturerCatalogReview(data);
  assert.match(html, /data-change-id="vario"/);
  assert.doesNotMatch(html, /catalog-review-photo-selection/);
  const cover = { ...change, after: { sourceImageUrls: [urls[1], urls[0], urls[2]] }, fields: [{ field: 'sourceImageUrls', before: urls, after: [urls[1], urls[0], urls[2]] }] };
  const coverHtml = renderManufacturerCatalogReview({ scans: [{ changes: [cover] }] }, { type: 'photos' });
  assert.match(coverHtml, /data-change-id="vario"/);
  assert.match(coverHtml, /Новая обложка|New cover/);
  assert.equal(JSON.stringify(change), original);
});


test('actual app request boundary permits authorized catalog decisions while retaining personal write protection', async () => {
  const { runInNewContext } = await import('node:vm');
  const { isManufacturerCatalogDecisionRequest, saveManufacturerCatalogDecision } = await import('../../src/sync/manufacturer-catalog-review.js');
  const app = readFileSync(resolve('app.js'), 'utf8');
  const start = app.indexOf('async function apiFetch(path, options = {})');
  const end = app.indexOf('async function apiUploadFormData(', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  let authorized = true;
  const context = {
    personalSavePilotEnabled: () => true, currentUser: { id: 'admin' }, modeState: {},
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false,
    canReviewManufacturerCatalog: () => authorized, isManufacturerCatalogDecisionRequest,
    isForcedOffline: () => false, isNetworkError: () => false,
    connectionStatusController: { reportSuccess() {} },
    apiFetchRequest: async (path, options) => { calls.push({ path, options }); return { ok: true }; },
  };
  const apiFetch = runInNewContext(app.slice(start, end) + '\napiFetch', context);
  const photoSelection = { selectedUrls: ['https://photos.test/saved.jpg'] };
  for (const decision of ['approved', 'rejected', 'deferred']) {
    await saveManufacturerCatalogDecision(apiFetch, { scanId: 'scan/one', changeId: 'topeak:photos:bag', decision, note: 'Keep selected', photoSelection });
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { decision, note: 'Keep selected', photoSelection });
  }
  for (const [path, method] of [
    ['/bike-packing/lists/list/state', 'PATCH'], ['/bike-packing/admin/templates/one', 'PATCH'],
    ['/bike-packing/admin/catalog-scans/import', 'POST'],
    ['/bike-packing/admin/catalog-scans/scan/changes/change/extra', 'PATCH'],
    ['/bike-packing/admin/catalog-scans/scan/changes/change?extra=1', 'PATCH'],
    ['/bike-packing/admin/catalog-scans/scan/changes/change', 'DELETE'],
  ]) await assert.rejects(apiFetch(path, { method }), /Прямой обход остановлен/);
  authorized = false;
  await assert.rejects(saveManufacturerCatalogDecision(apiFetch, { scanId: 'scan', changeId: 'change', decision: 'approved' }), /Прямой обход остановлен/);
  assert.equal(calls.length, 3);
  await apiFetch('/bike-packing/admin/catalog-scans');
  assert.equal(calls.length, 4);
});
