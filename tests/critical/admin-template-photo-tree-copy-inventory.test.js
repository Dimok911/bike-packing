import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { treeCopyClientFixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplatePhotoTreeCopyActionStore } from "../../src/sync/admin-template-photo-tree-copy-action-store.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { createAdminTemplatePhotoWholeCopyActionStore, readAdminTemplatePhotoWholeCopyActorInventory } from "../../src/sync/admin-template-photo-whole-copy-action-store.js";
import { readAdminTemplatePhotoWholeCopyAcceptance } from "../../src/public/admin-template-photo-whole-copy-acceptance.js";
import { readAdminTemplatePhotoWholeCopyCancelled } from "../../src/public/admin-template-photo-whole-copy-cancelled.js";
import { wholePhotoIndexedDBFixture } from "../fixtures/admin-template-photo-whole-copy-idb-fixture.js";
import { createAdminTemplatePhotoWholeCopyClient } from "../../src/sync/admin-template-photo-whole-copy-client.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { canonicalTemplateJson, validTemplateOperationId } from "../../src/sync/admin-template-protocol.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { readAdminTemplatePhotoTreeCopyAcceptance } from "../../src/public/admin-template-photo-tree-copy-acceptance.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function actual(names, deps) {
  const source = names.map(name => {
    const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(match, name); return match[0];
  }).join("\n");
  return new Function(...Object.keys(deps), `${source}\nreturn {${names.join(",")}};`)(...Object.values(deps));
}
async function fixture() {
  const f = await treeCopyClientFixture(), layoutId = f.record.snapshot.target.layoutId, controls = { excluded: [], afterTreeRead: null }, factories = [];
  const wholeIdb = wholePhotoIndexedDBFixture();
  const deps = { canonicalTemplateJson, validTemplateOperationId, assertAdminTemplateCaptureLease,
    readAdminTemplatePhotoTreeCopyAcceptance, readAdminTemplatePhotoWholeCopyAcceptance, readAdminTemplatePhotoWholeCopyCancelled,
    localStorage: f.storage, adminTemplatePhotoMirrorStorage: f.storage, STORAGE_KEY: "mirror",
    scopedLocalStorageKey: key => key, localStorageScopeKey: `id:${f.binding.actorId}`,
    ADMIN_TEMPLATE_PHOTO_COPY_ENABLED: false, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: false,
    adminTemplateOperationContext: () => f.current, adminTemplatePhotoExcludedPlans: async () => copy(controls.excluded),
    createAdminTemplatePhotoCopyActionStore: options => createAdminTemplatePhotoCopyActionStore({ ...options, indexedDB: f.idb.indexedDB }),
    createAdminTemplatePhotoTreeCopyActionStore: options => {
      factories.push(options); const real = createAdminTemplatePhotoTreeCopyActionStore({ ...options, indexedDB: f.idb.indexedDB });
      return { ...real, async read(id) { const record = await real.read(id); controls.afterTreeRead?.(); return record; } };
    },
    createAdminTemplatePhotoTreeCopyClient: options => createAdminTemplatePhotoTreeCopyClient({ ...options, storage: f.storage, locks: f.locks, fetchImpl: f.fetchImpl }),
    createAdminTemplatePhotoWholeCopyActionStore: options => createAdminTemplatePhotoWholeCopyActionStore({ ...options, indexedDB: wholeIdb.indexedDB }),
    readAdminTemplatePhotoWholeCopyActorInventory: options => readAdminTemplatePhotoWholeCopyActorInventory({ ...options, indexedDB: wholeIdb.indexedDB }),
    createAdminTemplatePhotoWholeCopyClient: options => createAdminTemplatePhotoWholeCopyClient({ ...options, storage: f.storage, locks: f.locks, fetchImpl: f.fetchImpl }),
    experimentTransport: f.make().transport,
    createAdminTemplateSavePlans: options => createAdminTemplateSavePlans({ ...options, storage: f.storage, locks: f.locks }),
    adminTemplateUiEnabled: () => true, adminTemplatePhotoStore: () => null,
    adminTemplateClient: () => ({ capture() { assert.fail("Inventory cannot dispatch"); } }),
    adminTemplatePhotoCopyClient: () => null, adminTemplateRecoveryFor: () => ({ requiresCancellation: () => false }) };
  const api = actual(["adminTemplatePhotoCopyStore", "adminTemplatePhotoTreeCopyInventory", "readAdminTemplatePhotoTreeCopyAccepted",
    "readAdminTemplatePhotoWholeCopyAccepted", "readAdminTemplatePhotoWholeCopyStopped",
    "assertAdminTemplateCopyCaptureAllowed", "adminTemplatePlansFor"], deps);
  const ordinary = { operationId: crypto.randomUUID(), body: { version: 1, base: copy(f.intent.body.base), payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) } };
  const check = (request = ordinary) => withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    api.assertAdminTemplateCopyCaptureAllowed(f.binding, layoutId, { ...request, captureLease, guard() {} }));
  return Object.assign(f, { layoutId, controls, factories, deps, api, ordinary, check });
}
const noDispatch = f => { assert.equal(f.server.calls.length, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0); };

test("actual common capture sees an orphan tree record with every write flag OFF before plan persistence", async () => {
  const f = await fixture(); await assert.rejects(f.check(), /копирование дерева/);
  const plans = f.api.adminTemplatePlansFor(f.binding, f.layoutId);
  await assert.rejects(plans.capture({ operationId: f.ordinary.operationId, base: f.ordinary.body.base, exists: true, visibility: "private",
    payload: f.ordinary.body.payload, metadata: f.ordinary.body.metadata }), /копирование дерева/);
  assert.ok(![...f.values.keys()].some(key => key.startsWith("bike-packing-admin-save-plans-v1:")));
  assert.ok(f.factories.length); assert.ok(f.factories.every(options => options.enabled === false)); noDispatch(f);
});

test("only the exact own v2 UUID, body and full record hash can pass the tree inventory", async () => {
  const f = await fixture(), own = { operationId: f.id, body: copy(f.record.action.body), recordIntentHash: f.record.intentHash };
  assert.equal(await f.check(own), true);
  for (const mutate of [value => { value.recordIntentHash = hash("wrong"); }, value => { value.body.photoCopy.fields.name = "changed"; },
    value => { value.body.photoCopy.version = 1; }, value => { value.operationId = crypto.randomUUID(); }]) {
    const value = copy(own); mutate(value); await assert.rejects(f.check(value));
  }
  await assert.rejects(f.check({ ...f.ordinary, operationId: f.id })); noDispatch(f);
});

test("old adopted exclusions, successor bases and unrelated revisions cannot retire a typed tree", async () => {
  const f = await fixture(); f.controls.excluded = [f.id];
  for (const base of [copy(f.intent.body.base), { operationId: f.id }, { stateRevision: f.intent.body.base.stateRevision + 1 }])
    await assert.rejects(f.check({ ...f.ordinary, body: { ...f.ordinary.body, base } }), /копирование дерева/);
  noDispatch(f);
});

test("a terminal tree journal remains visible and is not silently adopted by ordinary capture", async () => {
  const f = await fixture(); await f.make().client.capture(f.record.action);
  const key = [...f.values.keys()].find(value => value.startsWith(commandPrefix)), saved = JSON.parse(f.values.get(key));
  saved.stageReceipts = copy(f.stages); saved.receipt = copy(f.receipt); f.values.set(key, canonicalTemplateJson(saved));
  assert.deepEqual((await f.api.adminTemplatePhotoTreeCopyInventory(f.binding, f.layoutId)).journals[0].receipt, f.receipt);
  await assert.rejects(f.check(), /копирование дерева/); noDispatch(f);
});

test("journal without IDB, corrupt IDB and corrupt full journal cannot look like an empty inventory", async () => {
  for (const fault of ["missing-record", "record-hash", "journal-hash"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    if (fault === "missing-record") f.idb.rows().clear();
    if (fault === "record-hash") [...f.idb.rows().values()][0].intentHash = hash("corrupt");
    if (fault === "journal-hash") {
      const key = [...f.values.keys()].find(value => value.startsWith(commandPrefix)), saved = JSON.parse(f.values.get(key));
      saved.recordIntentHash = hash("foreign"); f.values.set(key, canonicalTemplateJson(saved));
    }
    await assert.rejects(f.check()); noDispatch(f);
  }
});

test("real lease prevents ordinary capture from slipping between tree record selection and persistence", async () => {
  const f = await fixture(); f.idb.rows().clear(); let entered, release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const holder = withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, async () => {
    entered(); await new Promise(resolve => { release = resolve; });
    await f.store.capture({ action: f.record.action, snapshot: f.record.snapshot });
  });
  await enteredPromise; const waiting = assert.rejects(f.check(), /копирование дерева/);
  release(); await holder; await waiting; noDispatch(f);
});

test("actual order opening detects an orphan tree before checking older plan kinds", async () => {
  const f = await fixture();
  const api = actual(["openCausalAdminTemplateOrder"], { ...f.deps, currentUser: { id: f.binding.actorId }, state: { layouts: {} },
    administrativeSaveCoordinator: null, adminTemplatePhotoTreeCopyInventory: f.api.adminTemplatePhotoTreeCopyInventory,
    readAdminTemplatePhotoTreeCopyAccepted: f.api.readAdminTemplatePhotoTreeCopyAccepted,
    createAdminTemplateOrderBatch: options => ({ async open() { await options.assertNoPending(f.binding); assert.fail("Orphan tree must pause order"); } }) });
  await assert.rejects(api.openCausalAdminTemplateOrder([]), /копирование дерева/); noDispatch(f);
});

test("account generation changes after a tree record read do not expose or allow its inventory", async () => {
  const f = await fixture(); f.controls.afterTreeRead = () => { f.current.generation = "changed"; };
  await assert.rejects(f.check(), /Контекст/); noDispatch(f);
});
