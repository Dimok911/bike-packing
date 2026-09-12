import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(process.env.GUEST_CACHE_TEST_APP || new URL("../../app.js", import.meta.url), "utf8");
const extract = (name, next) => {
  const start = source.indexOf(`async function ${name}(`), end = source.indexOf(`\n${next}`, start);
  assert.ok(start >= 0 && end > start); return source.slice(start, end);
};
const copyFunction = extract("createLocalDemoCopy", "function sharedLayoutPublicSourceId(");
const startupFunction = extract("loadGuestPublishedDemoOnStartup", "async function enterSignedOutPublicMode(");
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture({ cache = async () => 1, persist = () => {}, sync = async () => {} } = {}) {
  const original = { id: "published", name: "Published template", photos: [{ id: "server-photo", url: "https://example.test/photo.png", status: "synced" }] };
  const layouts = {}, calls = { copied: 0, cache: 0, synced: 0, rendered: 0, warnings: [], opened: [] };
  const context = {
    uiLanguage: "ru", activeDemoTemplateListId: "public-demo", currentUser: null,
    initialRemoteLoadPending: true, hadAuthoritativeLocalStateAtStartup: false, state: {}, syncMeta: { dirty: false },
    pruneUneditedGuestDemoCopies() {}, reusableGuestDemoCopyLayout: () => Object.values(layouts)[0] || null,
    openPrivateLayout: id => calls.opened.push(id), selectDemoTemplateForLanguage() {},
    defaultDemoState: async () => clone(original), renameReusableGuestDemoCopy() {},
    copyPublishedDemoStateToLocalLayout: value => {
      persist(); calls.copied++; layouts.local = { ...clone(value), id: "local" }; return "local";
    },
    cacheGuestTemplatePhotoFallbacks: async id => { calls.cache++; return cache(layouts[id]); },
    syncCreatedPrivateLayoutEntities: async id => { calls.synced++; return sync(id); },
    showToast: (text, tone) => calls.warnings.push({ text, tone }), localText: (en, ru) => ru,
    updateSyncUi() {}, t: value => value,
    setDemoStatePayloadForLanguage() {}, guestDemoStartupAction: () => "copy", canUsePrivateState: () => false,
    isSuspiciousEmptyPackingState: () => false, renderPreservingPackingScroll: () => { calls.rendered++; }
  };
  const api = runInNewContext(`let localDemoCopyInFlight = null;\n${copyFunction}\n${startupFunction}\n({ copy: createLocalDemoCopy, startup: loadGuestPublishedDemoOnStartup })`, context);
  return { api, calls, layouts, original, context };
}

test("automatic guest startup opens its saved layout and reports unavailable offline photos after cache quota failure", async () => {
  const f = fixture({ cache: async () => { throw new DOMException("Full disk", "QuotaExceededError"); } });
  assert.equal(await f.api.startup({ allowAutomaticLocalCopy: true }), true);
  assert.equal(f.context.initialRemoteLoadPending, false); assert.equal(f.calls.rendered, 1);
  assert.deepEqual(f.layouts.local.photos, f.original.photos);
  assert.equal(f.calls.copied, 1); assert.equal(f.calls.synced, 1);
  assert.equal(f.calls.warnings.length, 1); assert.match(f.calls.warnings[0].text, /Не удалось сохранить фото/);
  assert.match(f.calls.warnings[0].text, /доступны через интернет/); assert.equal(f.calls.warnings[0].tone, "error");
  assert.equal(await f.api.copy(), "local"); assert.equal(f.calls.copied, 1);
});

test("a native Blob preparation failure is contained by the optional cache boundary with remote identities intact", async () => {
  const f = fixture({ cache: async () => { throw new DOMException("Error preparing Blob/File data to be stored in object store", "UnknownError"); } });
  assert.equal(await f.api.copy(), "local");
  assert.deepEqual(f.layouts.local.photos, f.original.photos);
  assert.equal(f.layouts.local.photos[0].localId, undefined); assert.equal(f.calls.warnings.length, 1);
});

test("concurrent startup copies share the original in-flight layout and a cache failure cannot create a second copy", async () => {
  const entered = deferred(), release = deferred();
  const f = fixture({ cache: async () => { entered.resolve(); await release.promise; throw Error("Storage unavailable"); } });
  const first = f.api.copy(); await entered.promise; const second = f.api.copy(); release.resolve();
  assert.deepEqual(await Promise.all([first, second]), ["local", "local"]);
  assert.equal(f.calls.copied, 1); assert.equal(f.calls.cache, 1); assert.equal(f.calls.synced, 1);
  assert.equal(f.calls.warnings.length, 1);
  assert.equal(await f.api.copy(), "local"); assert.equal(f.calls.copied, 1);
});

test("successful offline caching preserves the usual copy result without a warning", async () => {
  const f = fixture();
  assert.equal(await f.api.copy(), "local"); assert.equal(f.calls.cache, 1); assert.equal(f.calls.synced, 1);
  assert.deepEqual(f.calls.warnings, []); assert.deepEqual(f.layouts.local.photos, f.original.photos);
});

test("a failed layout save is still an error and must not be described as an opened offline-only copy", async () => {
  const f = fixture({ persist: () => { throw new DOMException("Layout storage full", "QuotaExceededError"); } });
  await assert.rejects(f.api.copy(), /Layout storage full/);
  assert.deepEqual(f.layouts, {}); assert.equal(f.calls.cache, 0); assert.equal(f.calls.synced, 0);
  assert.deepEqual(f.calls.warnings, []);
});

test("a sync error after successful caching remains visible to the caller", async () => {
  const f = fixture({ sync: async () => { throw Error("Sync stopped"); } });
  await assert.rejects(f.api.copy(), /Sync stopped/);
  assert.equal(f.calls.copied, 1); assert.equal(f.calls.cache, 1); assert.equal(f.calls.synced, 1);
  assert.deepEqual(f.calls.warnings, []);
});
