import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { personalBusinessPayloadMatchesConfirmed as matches } from "../../src/sync/personal-confirmed-business-equality.js";

const listId = "list-a", routes = ["https://api.vniipo-help.ru/letters-vniipo/api",
  "https://api.vniipo-help.ru/experiment/letters-vniipo/api", "https://experiment.vniipo-help.ru/letters-vniipo/api",
  "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api"];
const copy = value => structuredClone(value);
function payload(route = routes[0]) {
  const photo = id => ({ id, listId, status: "synced", width: 1000, height: 800, updatedAt: "2026-09-14T10:00:00.000Z",
    url: `${route}/bike-packing/lists/${listId}/photos/${id}/file?v=1`,
    thumbUrl: `${route}/bike-packing/lists/${listId}/photos/${id}/thumb?v=1` });
  return { opaque: { preserved: ["future", 7] }, items: { item: { id: "item", name: "Item", weight: 100, photos: [] } },
    containers: { bag: { id: "bag", name: "Bag", photos: [photo("a"), photo("b")] } },
    layouts: { layout: { id: "layout", name: "Layout", arrangement: { items: { item: { containerId: "bag", order: 0 } },
      containers: { bag: { parentId: null, order: 0 } }, rootContainerIds: ["bag"], packedItems: { item: true } } } } };
}
const compare = (before, after, options = {}) => matches({ confirmedPayload: before, candidatePayload: after, listId, allowLegacy: true, ...options });

test("all approved legacy aliases are only a comparison view; gate OFF and source bytes remain strict", () => {
  for (const beforeRoute of routes) for (const afterRoute of routes) {
    const before = payload(beforeRoute), after = payload(afterRoute), saved = copy({ before, after });
    assert.equal(compare(before, after), true);
    assert.equal(matches({ confirmedPayload: before, candidatePayload: after, listId }), beforeRoute === afterRoute);
    assert.deepEqual({ before, after }, saved);
  }
});

for (const [name, change] of [
  ["name", p => { p.containers.bag.name += " edited"; }],
  ["weight", p => { p.items.item.weight++; }],
  ["placement", p => { p.layouts.layout.arrangement.rootContainerIds = []; }],
  ["packed state", p => { p.layouts.layout.arrangement.packedItems.item = false; }],
  ["opaque business data", p => { p.opaque.preserved[1]++; }],
  ["empty photo field presence", p => { delete p.items.item.photos; }],
  ["owner addition", p => { p.containers.other = { id: "other", photos: [] }; }],
  ["owner deletion", p => { delete p.containers.bag; }],
  ["owner movement", p => { p.items.item.photos = p.containers.bag.photos; p.containers.bag.photos = []; }],
  ["photo order", p => { p.containers.bag.photos.reverse(); }],
  ["photo query", p => { p.containers.bag.photos[0].url += "&changed=1"; }],
  ["photo metadata", p => { p.containers.bag.photos[0].height++; }],
  ["photo list", p => { p.containers.bag.photos[0].listId = "foreign"; }],
  ["photo route identity", p => { p.containers.bag.photos[0].url = p.containers.bag.photos[0].url.replace("/a/", "/b/"); }],
  ["photo route variant", p => { p.containers.bag.photos[0].thumbUrl = p.containers.bag.photos[0].url; }],
  ["foreign host", p => { p.containers.bag.photos[0].url = p.containers.bag.photos[0].url.replace("api.vniipo-help.ru", "other.test"); }],
  ["credentials", p => { p.containers.bag.photos[0].url = p.containers.bag.photos[0].url.replace("https://", "https://user@"); }],
  ["fragment", p => { p.containers.bag.photos[0].url += "#hidden"; }],
  ["pending photo", p => { p.containers.bag.photos[0].status = "pending"; }]
]) test(`legacy alias equality never hides changed ${name}`, () => {
  const before = payload(), after = payload(routes[1]); change(after);
  assert.equal(compare(before, after), false);
});

test("mixed inventories retain strict causal URLs and all causal metadata", () => {
  const before = payload(), after = payload(routes[1]);
  const causal = { id: "causal", photoId: "causal", assetId: "05c59e77-bd27-42bf-879f-83bfa3b27ab5", listId,
    status: "synced", url: "https://example.test/file", thumbUrl: "https://example.test/thumb", fileName: "photo.jpg",
    type: "image/jpeg", size: 10, width: 1, height: 1 };
  before.items.item.photos = [copy(causal)]; after.items.item.photos = [copy(causal)];
  assert.equal(compare(before, after), true);
  for (const change of [p => { p.url += "?changed"; }, p => { delete p.assetId; }, p => { delete p.fileName; }]) {
    after.items.item.photos = [copy(causal)]; change(after.items.item.photos[0]);
    assert.equal(compare(before, after), false);
  }
});

test("already shared old photo identities retain exact owners and cannot create new sharing", () => {
  const before = payload(), after = payload(routes[1]);
  for (const p of [before, after]) p.containers.oldCopy = { ...copy(p.containers.bag), id: "oldCopy" };
  assert.equal(compare(before, after), true);
  after.containers.newCopy = { ...copy(after.containers.bag), id: "newCopy" };
  assert.equal(compare(before, after), false);
});

const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function appFunction(name, dependencies) {
  const source = appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}(?=\\r?\\n)`))?.[0];
  assert.ok(source, `actual app function ${name} exists`);
  return new Function(...Object.keys(dependencies), `return (${source});`)(...Object.values(dependencies));
}
function appFixture() {
  const values = new Map(), storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor-a", listId, scopeKey: "id:actor-a", environment: "bike-packing-experiment" };
  const outbox = createPersonalSaveOutbox({ storage, ...binding }), raw = payload(), editor = payload(routes[1]);
  const head = outbox.capture({ snapshot: editor, body: { baseStateRevision: 1582, payload: editor } });
  outbox.markApplied({ operationId: head.action.operationId, stateRevision: 1583 }); outbox.compact();
  const syncMeta = { stateRevision: 1583, dirty: true }, messages = [], notifications = [], views = [], persisted = [];
  const dependencies = { clone: copy, flushPersonalMirrors: async () => {}, personalSaveContext: () => binding, currentUser: { id: binding.actorId }, currentPackingListId: listId, localStorageScopeKey: binding.scopeKey,
    modeState: {}, state: editor, syncMeta, personalSavePilotEnabled: () => true, isReadOnlyBikePackingContext: () => false,
    isAdminPublicEditScope: () => false, personalSaveOutboxForScope: () => outbox, hasPendingPersonalSave: () => outbox.hasPending(),
    personalBusinessPayload, personalBusinessPayloadMatchesConfirmed: matches, PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED: true,
    GUEST_STORAGE_SCOPE: "guest", userStorageScopeKey: () => binding.scopeKey, currentHistoryActionContext: () => null,
    nowIso: () => "2026-09-14T12:00:00Z", syncDevice: {},
    buildListSaveBodyForSync: ({ serializeState }) => ({ baseStateRevision: 1583, payload: serializeState() }),
    cloneStateForSync: value => copy(value), sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    updateSyncUi: message => messages.push(message), localText: (en, ru) => ru,
    repairRemoteStateFromLocalReferences() {}, resolvePreferredLayoutId: () => "", blockRemoteIntegrityFailureIfNeeded: () => false,
    blockDestructiveRemoteState: () => false, renderInitialLocalFallbackIfNeeded() {}, layoutEntityRepairBaseState: () => null,
    replaceState: value => views.push(value), removePublicLayoutDrafts() {}, setActivePrivateScope() {}, rememberPrivateServerLayoutChoice() {},
    saveBaseState() {}, serializeState: () => copy(editor), hasLocalSyncChanges: () => false,
    rememberRemoteIntegrityMeta() {}, STARTUP_CACHE_INTEGRITY_VERSION: 1, rememberCurrentSyncAccount() {}, saveSyncMeta() {},
    repairPrivateMojibakeLayoutNames() {}, appUnlocked: false, initialRemoteLoadPending: true,
    renderPreservingPackingScroll() {}, setPersonalLayoutsLoadedStatus() {}, scheduleRemoteSave() {},
    personalSaveRecovery: { assertRunning() {}, report() {} }, personalPhotoFormPreparing: false, personalPhotoFormLiveSource: null,
    checkPersonalPhotoRecoveryBeforeLoad: async () => {}, isForcedOffline: () => false, SYNC_META_KEY: "sync-meta", scopedLocalStorageKey: key => key,
    safeSetLocalStorage: (key, value) => { persisted.push(JSON.parse(value)); return true; },
    showToast: (message, tone) => notifications.push({ message, tone }) };
  const capture = appFunction("capturePersonalSaveIntent", dependencies);
  dependencies.persistStateSnapshot = snapshot => capture(snapshot);
  const adopt = appFunction("adoptConfirmedPersonalRemoteBaseline", dependencies);
  return { outbox, values, head, raw, editor, syncMeta, messages, notifications, views, persisted, dependencies, capture,
    observe: () => adopt({ state: editor, payload: raw, integrityMeta: { stateRevision: 1583 }, listId }),
    apply: appFunction("applyRemoteState", dependencies), save: appFunction("savePersonalStateFromOutbox", dependencies) };
}

test("actual load observer then apply use one raw authoritative baseline; normalized editor is only its view", async () => {
  const f = appFixture(), immutableBody = copy(f.head.action.body);
  assert.notDeepEqual(f.raw, f.editor, "fixture exposes actual raw/normalized route difference");
  f.observe();
  assert.equal(await f.apply(f.editor, "server-time", { stateRevision: 1583 }, f.raw), true);
  assert.deepEqual(f.outbox.confirmedBase().payload, f.raw);
  assert.equal(f.outbox.confirmedBase().stateRevision, 1583);
  assert.deepEqual(f.outbox.recoverSnapshot(), f.editor, "local view survives separately in the snapshot patch");
  assert.deepEqual(f.views, [f.editor]); assert.equal(f.outbox.hasPending(), false);
  assert.deepEqual(f.outbox.recover().action.body, immutableBody);
  const changed = copy(f.raw); changed.containers.bag.name = "Contradictory same revision";
  assert.throws(() => f.outbox.adoptRemoteBaseline({ snapshot: changed, payload: changed, stateRevision: 1583 }), { code: "baseline" });
});

test("actual capture reuses a confirmed action for approved aliases and preserves the journal bytes", () => {
  const f = appFixture(); f.observe(); const stored = [...f.values];
  assert.equal(f.capture(f.editor).action.operationId, f.head.action.operationId);
  assert.equal(f.outbox.hasPending(), false); assert.deepEqual([...f.values], stored);
  const edited = copy(f.editor); edited.containers.bag.name = "Real edit";
  const next = f.capture(edited);
  assert.notEqual(next.action.operationId, f.head.action.operationId); assert.equal(f.outbox.hasPending(), true);
  assert.deepEqual(next.action.body.payload, edited);
  assert.deepEqual(next.mergeBase.payload, f.raw, "new write retains raw confirmed base");
  assert.deepEqual(f.outbox.list().find(record => record.action.operationId === f.head.action.operationId).action.body, f.head.action.body);
});

test("pending edits are never skipped even if the draft again matches the old confirmed view", async () => {
  const f = appFixture(); f.observe(); const edited = copy(f.editor); edited.items.item.weight++;
  const pending = f.capture(edited), undo = f.capture(f.editor);
  assert.notEqual(undo.action.operationId, pending.action.operationId);
  assert.equal(undo.action.body.causal.baseOperationId, pending.action.operationId);
  assert.equal(f.outbox.hasPending(), true);
  const before = [...f.values];
  assert.equal(await f.apply(f.editor, "server-time", { stateRevision: 1583 }, f.raw), false);
  assert.deepEqual([...f.values], before); assert.deepEqual(f.views, []);
});

test("manual sync after raw baseline adoption clears dirty without creating or dispatching an alias-only action", async () => {
  const f = appFixture(); f.observe(); const before = [...f.values];
  await f.save({ notify: true });
  assert.equal(f.syncMeta.dirty, false); assert.equal(f.outbox.hasPending(), false);
  assert.deepEqual([...f.values], before); assert.equal(f.notifications.at(-1)?.tone, "success");
  assert.equal(f.persisted.length, 1);
  assert.deepEqual(f.outbox.confirmedBase().payload, f.raw);
});

test("capture account guard precedes alias equality and cannot reuse another actor's confirmation", () => {
  const f = appFixture(); f.observe(); const before = [...f.values];
  const capture = appFunction("capturePersonalSaveIntent", { ...f.dependencies, currentUser: { id: "other-actor" } });
  assert.throws(() => capture(f.editor), /аккаунт/);
  assert.deepEqual([...f.values], before);
});
