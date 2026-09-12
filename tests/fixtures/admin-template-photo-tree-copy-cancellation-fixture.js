import assert from "node:assert/strict";
import { treeCopyClientFixture, copy, hash, commandPrefix } from "./admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoTreeCopySavePlan, adminTemplatePhotoTreeCopyEditorSnapshot } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";

export { copy, hash, commandPrefix };
export const commandKey = f => [...f.values.keys()].find(key => key.startsWith(commandPrefix));
export const saved = f => JSON.parse(f.values.get(commandKey(f)));
export const cancellationFact = f => ({ operation: { ...copy(f.receipt.operation), state: "rejected" },
  result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
    version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true
  } } } });

export async function treeCancellationFixture() {
  const f = await treeCopyClientFixture(), bindings = [f.binding, { ...f.binding,
    listId: f.intent.body.photoCopy.source.listId, itemKey: f.intent.body.photoCopy.source.itemKey }];
  const plan = adminTemplatePhotoTreeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const planKey = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  const planText = canonical({ version: 1, plan, digest: hash(plan), cancelRequested: false }); f.values.set(planKey, planText);
  const controls = { loseCancel: false, unknownCancel: false, lateCommit: false, afterCancel: null, mutateCancel: null,
    beforeAdmission: null, revoke: false, admissionCalls: 0, admissionChecks: 0 };
  const cancelPosts = [], lifecycle = new EventTarget(); let lease = null, active = false;
  const underLease = task => withAdminTemplateCapture({ bindings, locks: f.locks }, async value => {
    assert.equal(lease, null); lease = value;
    try { return await task(); } finally { lease = null; }
  });
  // A real common lease and byte guard stand in for the future application
  // adapter. The current business namespace deliberately is not authority for
  // cancelling the already frozen action. No lock is acquired inside the client.
  const withCancellationAdmission = async (proof, task) => {
    controls.admissionCalls++; proof.assertCurrent();
    assertAdminTemplateCaptureLease(lease, bindings);
    assert.deepEqual(proof.intent, f.intent); assert.equal(proof.recordIntentHash, f.record.intentHash);
    assert.deepEqual(await f.store.read(f.id), f.record); proof.assertCurrent();
    assert.equal(f.values.get(planKey), planText);
    await controls.beforeAdmission?.(); proof.assertCurrent();
    const retainedLease = lease;
    const assertCurrent = () => {
      controls.admissionChecks++; assert.equal(active, true); proof.assertCurrent();
      assertAdminTemplateCaptureLease(retainedLease, bindings); assert.equal(controls.revoke, false);
      assert.equal(f.values.get(planKey), planText, "the own V9 plan bytes remain present before every cancellation effect");
    };
    active = true; f.admission.active = true;
    try { assertCurrent(); return await task({ assertCurrent }); }
    finally { active = false; f.admission.active = false; }
  };
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname;
    if (!path.endsWith(`/template-operations/${f.id}/cancel`)) return f.fetchImpl(url, request);
    assert.equal(active, true); assert.equal(request.method, "POST"); assert.equal(request.credentials, "include");
    assert.equal(request.redirect, "error"); assert.equal(request.cache, "no-store"); assert.equal(request.headers["content-type"], "application/json");
    const body = JSON.parse(request.body);
    assert.deepEqual(body, { expectedActorId: f.binding.actorId, environment: f.binding.environment, operationId: f.id,
      kind: "template.save", listId: f.binding.listId, itemKey: f.binding.itemKey, body: f.record.action.body });
    assert.equal(saved(f).cancelRequested, true); assert.equal(f.values.get(planKey), planText);
    f.server.calls.push({ path, method: "POST" }); cancelPosts.push(copy(body));
    if (!controls.unknownCancel) {
      f.server.saved = controls.lateCommit ? copy(f.receipt) : cancellationFact(f);
      controls.mutateCancel?.(f.server.saved);
    }
    controls.afterCancel?.();
    if (controls.loseCancel || controls.unknownCancel) throw TypeError("Cancellation ACK lost");
    return { status: 200, json: async () => ({ ok: true, ...copy(f.server.saved) }) };
  };
  const make = extra => f.make({ fetchImpl, lifecycleTarget: lifecycle, withCancellationAdmission, ...extra });
  const off = extra => make({ enabled: false, appendEnabled: false, createEnabled: false, copyEnabled: false,
    store: f.makeStore({ enabled: false }), ...extra });
  const cancel = extra => underLease(() => off(extra).client.cancel(f.id));
  return { ...f, cancellation: controls, cancelPosts, make, off, cancel, underLease, withCancellationAdmission, planKey, planText, lifecycle, bindings };
}
