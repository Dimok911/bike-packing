import assert from "node:assert/strict";
import { treeCopyClientFixture, copy, hash, commandPrefix } from "./admin-template-photo-tree-copy-client-fixture.js";
import { cancellationFact } from "./admin-template-photo-tree-copy-cancellation-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoTreeCopySavePlan, adminTemplatePhotoTreeCopyEditorSnapshot } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { createAdminTemplatePhotoTreeCopyRecoveryRunner } from "../../src/public/admin-template-photo-tree-copy-recovery-runner.js";

export { copy, hash, commandPrefix };
export async function treeRecoveryRunnerFixture() {
  const f = await treeCopyClientFixture(), held = new Set(), lockEvents = [];
  const locks = { request: (name, task) => f.locks.request(name, async () => {
    assert.equal(held.has(name), false); held.add(name); lockEvents.push(["enter", name]);
    try { return await task(); } finally { held.delete(name); lockEvents.push(["leave", name]); }
  }) };
  const plan = adminTemplatePhotoTreeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const planKey = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  const planText = canonical({ version: 1, plan, digest: hash(plan), cancelRequested: false }); f.values.set(planKey, planText);
  const commandKey = commandPrefix + encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  const journal = () => JSON.parse(f.values.get(commandKey));
  const ordinary = Object.fromEntries(["capture", "read", "run", "inspect", "cancel"].map(name => [name, () => { throw Error(`Wrong ordinary ${name}`); }]));
  const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, client: ordinary, storage: f.storage, locks,
    photoTreeCopyStore: f.store, enabled: false, photoTreeCopyEnabled: false });
  const controls = { unknownCancel: false, loseCancel: false, lateCommit: false, offline: false, beforeAdmission: null,
    factory: null, afterClientRead: null, afterCancel: null, mutateResult: null, scopedContext: null, scopedGuard: null };
  const cancelPosts = [], assertLocks = command => {
    const common = [...held].filter(name => name.startsWith("bike-packing-admin-template-photo-capture:"));
    assert.equal(common.length, 2, "both actual common source/target locks enclose recovery");
    if (command) assert.equal(held.has(commandKey), true, "client command lock is inside common locks");
  };
  const fetchImpl = async (url, request = {}) => {
    assertLocks(true);
    if (controls.offline) { f.server.calls.push({ path: new URL(url).pathname, method: request.method || "GET" }); throw TypeError("Offline GET"); }
    const path = new URL(url).pathname;
    if (!path.endsWith(`/template-operations/${f.id}/cancel`)) return f.fetchImpl(url, request);
    assert.equal(f.admission.active, true); assert.equal(request.method, "POST");
    assert.equal(request.credentials, "include"); assert.equal(request.cache, "no-store"); assert.equal(request.redirect, "error");
    assert.equal(request.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(request.body), { expectedActorId: f.binding.actorId, environment: f.binding.environment,
      operationId: f.id, kind: "template.save", listId: f.binding.listId, itemKey: f.binding.itemKey, body: f.record.action.body });
    assert.equal(journal().cancelRequested, true); assert.equal(f.values.get(planKey), planText);
    cancelPosts.push(JSON.parse(request.body)); f.server.calls.push({ path, method: "POST" });
    if (!controls.unknownCancel) f.server.saved = controls.lateCommit ? copy(f.receipt) : cancellationFact(f);
    controls.afterCancel?.();
    if (controls.loseCancel || controls.unknownCancel) throw TypeError("Cancellation ACK lost");
    return { status: 200, json: async () => ({ ok: true, ...copy(f.server.saved) }) };
  };
  const createClient = options => {
    assertLocks(false); controls.scopedContext = options.getContext; controls.factory?.(options);
    // Only instrumentation is added to the REAL runner's admission. It retains
    // its exact scope, opaque common lease and record/pointer/account checks.
    const enter = options.withCancellationAdmission;
    const withCancellationAdmission = async (proof, work) => {
      controls.beforeAdmission?.();
      return enter(proof, async scope => {
        assert.deepEqual(Object.keys(scope), ["assertCurrent"]); controls.scopedGuard = scope.assertCurrent;
        assertLocks(true); f.admission.active = true;
        try { return await work(scope); } finally { f.admission.active = false; }
      });
    };
    const client = f.make({ ...options, locks, fetchImpl, lifecycleTarget: new EventTarget(), withCancellationAdmission,
      enabled: false, adminEnabled: true, appendEnabled: false, createEnabled: false, copyEnabled: false }).client;
    return Object.freeze({ ...client, async read(id) {
      assertLocks(false); const result = await client.read(id); controls.afterClientRead?.(); return result;
    }, async cancel(id) { const result = await client.cancel(id); return controls.mutateResult ? controls.mutateResult(copy(result)) : result; } });
  };
  await f.make().client.capture(f.record.action);
  const make = extra => createAdminTemplatePhotoTreeCopyRecoveryRunner({ binding: f.binding, layoutId: f.record.snapshot.target.layoutId,
    getContext: () => f.current, store: f.store, plans, storage: f.storage, locks, createClient, ...extra });
  return { ...f, businessMake: f.make, locks, held, lockEvents, plan, planKey, planText, commandKey, journal, plans, recovery: controls, cancelPosts, createClient, make };
}
