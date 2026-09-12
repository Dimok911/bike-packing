import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminPhotoCopyClientFixture, copy, hash } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { canonicalTemplateJson, validTemplateOperationId } from "../../src/sync/admin-template-protocol.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function actual(names, deps) {
  const text = names.map(name => {
    const found = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(found, name); return found[0];
  }).join("\n");
  return new Function(...Object.keys(deps), `${text}\nreturn { ${names.join(",")} };`)(...Object.values(deps));
}
async function fixture() {
  const f = await adminPhotoCopyClientFixture(), controls = { excluded: [], afterExcluded: null }, factories = [];
  const layoutId = f.record.snapshot.target.layoutId, state = copy(f.record.snapshot.target.beforeState);
  const deps = { canonicalTemplateJson, validTemplateOperationId, assertAdminTemplateCaptureLease,
    createAdminTemplateSavePlans: options => createAdminTemplateSavePlans({ ...options, storage: f.storage, locks: f.locks }),
    ADMIN_TEMPLATE_PHOTO_COPY_ENABLED: false, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: false,
    adminTemplateOperationContext: () => f.current,
    adminTemplatePhotoExcludedPlans: async () => { controls.afterExcluded?.(); return copy(controls.excluded); },
    createAdminTemplatePhotoCopyActionStore: options => { factories.push(options); return createAdminTemplatePhotoCopyActionStore({ ...options, indexedDB: f.idb.indexedDB }); },
    adminTemplateUiEnabled: () => true, adminTemplatePhotoStore: () => null,
    adminTemplateClient: () => ({ capture() { assert.fail("Preflight must not dispatch"); } }),
    adminTemplatePhotoCopyClient: (binding, selectedId, preparing) => {
      assert.deepEqual(binding, f.binding); assert.equal(selectedId, layoutId); assert.equal(preparing, false);
      return { binding: copy(binding), ...Object.fromEntries(["capture", "read", "inspect", "run", "cancel"]
        .map(method => [method, () => assert.fail(`Ordinary preflight must not call copy client ${method}`)])) };
    },
    adminTemplateRecoveryFor: () => ({ requiresCancellation: () => false }) };
  const api = actual(["adminTemplatePhotoCopyStore", "assertAdminTemplateCopyCaptureAllowed", "adminTemplatePlansFor"], deps);
  const ordinary = { operationId: crypto.randomUUID(), body: { version: 1, base: copy(f.intent.body.base),
    payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) } };
  const check = (request = ordinary) => withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    api.assertAdminTemplateCopyCaptureAllowed(f.binding, layoutId, { ...request, captureLease, guard() {} }));
  return Object.assign(f, { controls, factories, api, check, ordinary, state, layoutId, deps });
}

test("actual app preflight sees raw copy records with copy OFF before any common-plan persistence", async () => {
  const f = await fixture();
  await assert.rejects(f.check(), /копирование этой версии/);
  const plans = f.api.adminTemplatePlansFor(f.binding, f.layoutId);
  await assert.rejects(plans.capture({ operationId: f.ordinary.operationId, base: f.ordinary.body.base, exists: true, visibility: "private",
    payload: f.ordinary.body.payload, metadata: f.ordinary.body.metadata }), /копирование этой версии/);
  assert.ok(f.factories.length > 0); assert.ok(f.factories.every(options => options.enabled === false));
  assert.ok(![...f.values.keys()].some(key => key.startsWith("bike-packing-admin-save-plans-v1:")));
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.server.calls.length, 0);
});

test("actual app preflight permits exact own copy proof and adopted exclusions but never a same-UUID replacement or pending successor", async () => {
  const f = await fixture(), own = { operationId: f.id, body: copy(f.record.action.body), recordIntentHash: f.record.intentHash };
  assert.equal(await f.check(own), true);
  await assert.rejects(f.check({ ...own, recordIntentHash: hash("foreign") }));
  const changed = copy(own); changed.body.photoCopy.fields.name = "Changed"; await assert.rejects(f.check(changed));
  await assert.rejects(f.check({ ...f.ordinary, operationId: f.id }));
  f.controls.excluded = [f.id]; assert.equal(await f.check(), true);
  await assert.rejects(f.check({ ...f.ordinary, body: { ...f.ordinary.body, base: { operationId: f.id } } }));
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.server.calls.length, 0);
});

test("actual app copy preflight retains ordinary different-base semantics and fails closed for corrupted excluded records or changed context", async () => {
  const first = await fixture();
  assert.equal(await first.check({ ...first.ordinary, body: { ...first.ordinary.body, base: { stateRevision: first.intent.body.base.stateRevision + 1 } } }), true);
  for (const fault of ["duplicate", "invalid", "corrupt", "context"]) {
    const f = await fixture(); f.controls.excluded = [f.id];
    if (fault === "duplicate") f.controls.excluded.push(f.id);
    if (fault === "invalid") f.controls.excluded = ["not-a-uuid"];
    if (fault === "corrupt") [...f.idb.rows().values()][0].intentHash = hash("corrupt");
    if (fault === "context") f.controls.afterExcluded = () => { f.current.generation = "other-state"; };
    await assert.rejects(f.check()); assert.equal(f.server.calls.length, 0);
  }
});

test("actual app preflight rejects an invented or released lease before opening a copy journal", async () => {
  const f = await fixture(), request = { ...f.ordinary, captureLease: Object.freeze({}), guard() {} };
  await assert.rejects(f.api.assertAdminTemplateCopyCaptureAllowed(f.binding, f.layoutId, request));
  let expired; await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, lease => { expired = lease; });
  await assert.rejects(f.api.assertAdminTemplateCopyCaptureAllowed(f.binding, f.layoutId, { ...request, captureLease: expired }));
  assert.equal(f.factories.length, 0);
});

test("actual legacy reconciliation cannot bypass an orphan copy record before its plan or editor marker exists", async () => {
  const f = await fixture(), layout = f.state.layouts[f.layoutId]; delete layout.adminCausalSource;
  let resumed = false;
  const api = actual(["adminTemplatePhotoCopyStore", "assertAdminTemplateCopyCaptureAllowed", "reconcileLegacyAdminTemplate"], {
    ...f.deps, state: f.state, canOpenAdminPublishedEdit: () => true, experimentTransport: {},
    createAdminTemplatePhotoActionStore: () => null, createAdminTemplateClient: () => ({}),
    createAdminTemplateLegacyChoice: ({ plans }) => ({ open: async () => ({ saved: true }), async resume() {
      resumed = true;
      await plans.capture({ operationId: f.ordinary.operationId, base: f.ordinary.body.base, exists: true, visibility: "private",
        payload: f.ordinary.body.payload, metadata: f.ordinary.body.metadata });
      assert.fail("Legacy action must not become an adopted source");
    } }) });
  await assert.rejects(api.reconcileLegacyAdminTemplate(layout, f.binding), /копирование этой версии/);
  assert.equal(resumed, true); assert.equal(layout.adminCausalSource, undefined);
  assert.ok(![...f.values.keys()].some(key => key.startsWith("bike-packing-admin-save-plans-v1:")));
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.server.calls.length, 0);
});

test("actual create form wrapper holds a genuine lease through durable capture and releases it before network completion", async () => {
  const f = await fixture(), layout = f.state.layouts[f.layoutId], options = Object.freeze({ isCurrent: () => true });
  let completeNetwork, lease, optionsSeen;
  const network = new Promise(resolve => { completeNetwork = resolve; }), captures = [];
  const api = actual(["submitAdminTemplatePhotoCreateForm"], { state: f.state, canonicalTemplateJson, adminTemplatePhotoNamespace,
    navigator: { locks: f.locks }, withAdminTemplateCapture,
    adminTemplatePhotoCreateFormContext: () => ({ ...f.current, source: layout.adminCausalSource }),
    captureAdminTemplatePhotoCreateForm(input, passed, durable, capturedLease) {
      assert.equal(assertAdminTemplateCaptureLease(capturedLease, [f.binding]), true);
      lease = capturedLease; optionsSeen = passed; captures.push(input); durable(); return network;
    } });
  const input = Object.freeze({ entityType: "item", layoutId: f.layoutId });
  let settled = false; const pending = api.submitAdminTemplatePhotoCreateForm(input, options).then(value => { settled = true; return value; });
  // A second lock acquisition is released while the original save still waits on the network.
  await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, () => {});
  assert.equal(settled, false); assert.deepEqual(captures, [input]); assert.equal(optionsSeen, options);
  assert.throws(() => assertAdminTemplateCaptureLease(lease, [f.binding]));
  completeNetwork("confirmed"); assert.equal(await pending, "confirmed");
});

test("actual cold recovery shares one lease with append/edit/create and refuses stale namespace during its lock wait", async () => {
  for (const changed of [false, true]) {
    const f = await fixture(), layout = f.state.layouts[f.layoutId], calls = []; let release, entered, requested;
    const waiting = new Promise(resolve => { entered = resolve; });
    const recoveryWaiting = new Promise(resolve => { requested = resolve; });
    let copyRecoveryCalls = 0;
    const holder = withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, () => { entered(); return new Promise(resolve => { release = resolve; }); });
    await waiting;
    const api = actual(["resumeAdminTemplatePhotoForm"], { state: f.state, canonicalTemplateJson, adminTemplatePhotoNamespace,
      ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: true, ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED: true, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true,
      adminTemplateOperationContext: () => f.current,
      navigator: { locks: { request(name, task) { requested(); return f.locks.request(name, task); } } }, withAdminTemplateCapture,
      // Copy recovery runs first and owns its separate source/target lease. This
      // case isolates the following append/edit/create lease with no copy work.
      resumeAdminTemplatePhotoCopyForm: async selected => { assert.equal(selected, layout); copyRecoveryCalls++; return null; },
      ...Object.fromEntries(["Append", "Edit", "Create"].map(kind => [`resumeAdminTemplatePhoto${kind}Form`, async (selected, lease) => {
        assert.equal(selected, layout); assert.equal(assertAdminTemplateCaptureLease(lease, [f.binding]), true); calls.push({ kind, lease });
      }])) });
    const pending = api.resumeAdminTemplatePhotoForm(layout);
    const rejected = changed ? assert.rejects(pending, /Редактор изменился/) : null;
    // Mutate only after the actual wrapper has captured its namespace and is
    // waiting for the held lease, including its preceding asynchronous check.
    await recoveryWaiting;
    if (changed) layout.name = "Changed while waiting";
    release(); await holder; if (changed) await rejected; else await pending;
    assert.equal(copyRecoveryCalls, 1);
    assert.deepEqual(calls.map(row => row.kind), changed ? [] : ["Append", "Edit", "Create"]);
    if (!changed) { assert.ok(calls.every(row => row.lease === calls[0].lease)); assert.throws(() => assertAdminTemplateCaptureLease(calls[0].lease, [f.binding])); }
  }
});
