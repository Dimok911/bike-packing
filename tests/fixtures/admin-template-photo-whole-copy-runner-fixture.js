import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wholeCopyClientFixture, copy, hash } from "./admin-template-photo-whole-copy-client-fixture.js";
import { canonicalTemplateJson, validTemplateOperationId } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplatePhotoWholeCopyActionStore, readAdminTemplatePhotoWholeCopyActorInventory } from "../../src/sync/admin-template-photo-whole-copy-action-store.js";
import { createAdminTemplatePhotoWholeCopyClient } from "../../src/sync/admin-template-photo-whole-copy-client.js";
import { adminTemplatePhotoWholeCopyJournal } from "../../src/sync/admin-template-photo-whole-copy-parent-fence.js";
import { createAdminTemplatePhotoWholeCopyAdmission } from "../../src/sync/admin-template-photo-whole-copy-admission.js";
import { adminTemplatePhotoWholeCopySavePlan, adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { prepareAdminTemplatePhotoWholeCopyNamespaces } from "../../src/public/admin-template-photo-whole-copy-namespaces.js";
import { createAdminTemplatePhotoTreeCopyActionStore } from "../../src/sync/admin-template-photo-tree-copy-action-store.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplatePhotoCopyClient } from "../../src/sync/admin-template-photo-copy-client.js";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { readAdminTemplateOrderInventory } from "../../src/public/admin-template-order-batch.js";
import * as treeAcceptance from "../../src/public/admin-template-photo-tree-copy-acceptance.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const actual = (names, deps) => new Function(...Object.keys(deps), names.map(name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(match, name); return match[0];
}).join("\n") + `\nreturn {${names.join(",")}};`)(...Object.values(deps));
export const planPrefix = "bike-packing-admin-save-plans-v1:";

// Extract real application boundaries, retaining typed IDB stores, clients,
// registry and receipts. IDB uses the existing transaction/event model; this
// is application wiring coverage, not a claim of native browser/form coverage.
export async function wholeAppRunnerFixture() {
  const f = await wholeCopyClientFixture(), source = f.record.snapshot.source, target = f.record.snapshot.target;
  const state = copy(source.beforeState), layoutId = source.layoutId;
  state.layouts.private = { id: "private", name: "Unrelated personal draft", arrangement: {} };
  state.items.privateItem = { id: "privateItem", name: "Unrelated personal item" };
  state.privateMarker = { preserve: "private" };
  const modeState = { adminPublishedEditLayoutId: layoutId }, bindings = [source.ownerMap.binding, f.binding];
  const held = new Set(), lockEvents = [], tails = new Map(), scopes = [], sessions = [], clients = [];
  const locks = { async request(name, task) {
    const previous = tails.get(name) || Promise.resolve(); let release;
    const tail = new Promise(resolve => { release = resolve; }); tails.set(name, tail); await previous;
    assert.equal(held.has(name), false); held.add(name); lockEvents.push(["enter", name]);
    try { return await task(); }
    finally { held.delete(name); lockEvents.push(["leave", name]); release(); if (tails.get(name) === tail) tails.delete(name); }
  } };
  const contextParts = actual(["administrativeObjectId", "adminTemplateOperationContext"], { state, modeState,
    currentUser: { get id() { return f.current.actorId; } }, administrativeObjectIds: new WeakMap(), administrativeObjectCounter: 0,
    canOpenAdminPublishedEdit: () => f.current.admin, isAdminPublicEditScope: () => f.current.scope === "admin-template",
    getPublishedEditLayoutId: () => modeState.adminPublishedEditLayoutId, currentViewScope: () => f.current.generation,
    location: { pathname: "/experiment/", search: "", hash: "" } });
  const context = contextParts.adminTemplateOperationContext, transport = f.make({ locks }).transport;
  const flags = { whole: true, copy: true, create: true, append: true, admin: true };
  const build = (extra = {}) => {
    const storeOptions = options => ({ ...options, indexedDB: f.idb.indexedDB });
    const get = (binding, id, preparing) => () => context(binding, id, preparing);
    const upload = (binding, id, preparing) => createAdminTemplatePhotoActionStore({ binding, getContext: get(binding, id, preparing), indexedDB: f.idb.indexedDB, enabled: false });
    const copyStore = (binding, id, preparing) => createAdminTemplatePhotoCopyActionStore({ binding, getContext: get(binding, id, preparing), indexedDB: f.idb.indexedDB, enabled: false });
    const deps = { state, globalThis: { localStorage: f.storage }, localStorage: f.storage,
      scopedLocalStorageKey: () => "mirror", STORAGE_KEY: "mirror", localStorageScopeKey: `id:${f.binding.actorId}`,
      ...treeAcceptance, canonicalTemplateJson, validTemplateOperationId, clone: copy, adminTemplatePhotoWholeCopyJournal,
      adminTemplatePhotoWholeCopySavePlan, adminTemplatePhotoWholeCopySourceEditorSnapshot, assertAdminTemplateCaptureLease,
      adminTemplateOperationContext: context, adminTemplateUiEnabled: () => flags.admin,
      ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED: flags.whole, ADMIN_TEMPLATE_PHOTO_COPY_ENABLED: flags.copy,
      ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: flags.create, ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: flags.append,
      createAdminTemplatePhotoWholeCopyActionStore: options => createAdminTemplatePhotoWholeCopyActionStore(storeOptions(options)),
      readAdminTemplatePhotoWholeCopyActorInventory: options => readAdminTemplatePhotoWholeCopyActorInventory(storeOptions(options)),
      createAdminTemplatePhotoWholeCopyClient: options => {
        const client = createAdminTemplatePhotoWholeCopyClient({ ...options, storage: f.storage, locks, fetchImpl: f.fetchImpl }); clients.push(client); return client;
      },
      createAdminTemplatePhotoTreeCopyActionStore: options => createAdminTemplatePhotoTreeCopyActionStore(storeOptions(options)),
      createAdminTemplatePhotoTreeCopyClient: options => createAdminTemplatePhotoTreeCopyClient({ ...options, storage: f.storage, locks, fetchImpl: f.fetchImpl }),
      createAdminTemplateSavePlans: options => createAdminTemplateSavePlans({ ...options, storage: f.storage, locks }),
      prepareAdminTemplatePhotoWholeCopyNamespaces, experimentTransport: transport,
      createAdminTemplatePhotoWholeCopyAdmission: options => {
        const enter = name => (proof, task) => options[name](proof, scope => { scopes.push(scope); return task(scope); });
        const real = createAdminTemplatePhotoWholeCopyAdmission({ ...options, locks, withInventory: enter("withInventory"), withNamespaces: enter("withNamespaces") });
        return { ...real, run: (id, task) => real.run(id, async session => {
          sessions.push(session); f.admission.active = true;
          try { return await task(session); } finally { f.admission.active = false; }
        }) };
      },
      adminTemplatePhotoStore: upload, adminTemplatePhotoCopyStore: copyStore,
      adminTemplateClient: (binding, id, preparing = false) => createAdminTemplateClient({ binding, getContext: get(binding, id, preparing),
        storage: f.storage, locks, transport, photoStore: upload(binding, id, preparing), enabled: false }),
      adminTemplatePhotoCopyClient: (binding, id, preparing = false) => createAdminTemplatePhotoCopyClient({ binding, getContext: get(binding, id, preparing),
        store: copyStore(binding, id, preparing), storage: f.storage, locks, transport, enabled: false }),
      adminTemplateStopChoiceFor: () => assert.fail("Fixture has no adopted stop"),
      adminTemplateRecoveryFor: () => ({ requiresCancellation: () => assert.fail("Runner must not use generic cancellation") }),
      assertAdminTemplateCopyCaptureAllowed: () => assert.fail("Runner cannot capture a new plan"),
      readAdminTemplateOrderInventory: options => readAdminTemplateOrderInventory({ ...options, storage: f.storage }) };
    const names = ["adminTemplatePhotoWholeCopyInventory", "adminTemplatePhotoTreeCopyInventory", "readAdminTemplatePhotoTreeCopyAccepted",
      "adminTemplatePhotoExcludedPlans", "adminTemplatePlansFor", "withAdminTemplatePhotoWholeCopyDispatchInventory",
      "withAdminTemplatePhotoWholeCopyNamespaceScope", "runAdminTemplatePhotoWholeCopyPlan", ...(extra.names || [])];
    for (const name of Object.keys(extra.replace || {})) assert.ok(names.includes(name), `Unknown boundary: ${name}`);
    return actual(names.filter(name => !Object.hasOwn(extra.replace || {}, name)), { ...deps, ...extra.deps, ...extra.replace });
  };
  const plan = adminTemplatePhotoWholeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const row = { version: 1, plan, digest: hash(plan), cancelRequested: false }, planKey = planPrefix + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id;
  f.values.set(planKey, canonicalTemplateJson(row));
  const run = input => build().runAdminTemplatePhotoWholeCopyPlan(input || { binding: f.binding, layoutId, operationId: f.id });
  return Object.assign(f, { state, source, target, layoutId, bindings, context, modeState, flags, held, locks, lockEvents, scopes, sessions, clients,
    plan, planKey, row, run, build });
}
