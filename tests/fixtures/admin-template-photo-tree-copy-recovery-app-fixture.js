import assert from "node:assert/strict";
import { treeFormFixture } from "./admin-template-photo-tree-copy-form-fixture.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

export const copy = value => structuredClone(value);
export const commandKey = f => "bike-packing-admin-photo-tree-copy-commands-v1:" + encodeURIComponent(canonical(f.binding)) + ":" + f.id;
export const command = f => JSON.parse(f.values.get(commandKey(f)));
export const cancelled = f => ({ operation: { ...copy(f.receipt.operation), state: "rejected" }, result: { status: 409, payload: {
  ok: false, code: "operation_cancelled", cancellation: { version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true }
} } });

export async function treeRecoveryAppFixture() {
  const f = await treeFormFixture(), cancellation = { unknown: false, lost: false, offline: false, lateCommit: false, afterPost: null },
    cancelPosts = [], genericCalls = [], observedScopes = [];
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/auth/me") && cancellation.offline) {
      f.server.calls.push({ path, method: request.method || "GET" }); throw TypeError("Offline auth GET");
    }
    if (!path.endsWith(`/template-operations/${f.id}/cancel`)) return f.fetchImpl(url, request);
    assert.equal(f.admission.active, true); assert.equal(request.method, "POST");
    assert.equal(request.credentials, "include"); assert.equal(request.redirect, "error"); assert.equal(request.cache, "no-store");
    assert.equal(request.headers["content-type"], "application/json"); assert.equal(command(f).cancelRequested, true);
    const envelope = JSON.parse(request.body);
    assert.deepEqual(envelope, { expectedActorId: f.binding.actorId, environment: f.binding.environment, operationId: f.id,
      kind: "template.save", listId: f.binding.listId, itemKey: f.binding.itemKey, body: f.record.action.body });
    f.server.calls.push({ path, method: "POST" }); cancelPosts.push(copy(envelope));
    if (!cancellation.unknown) {
      f.server.saved = cancellation.lateCommit ? copy(f.receipt) : cancelled(f);
      if (cancellation.lateCommit) f.stages.forEach((stage, index) => f.server.stages.set(f.record.stages[index].operationId, copy(stage)));
    }
    cancellation.afterPost?.();
    if (cancellation.unknown || cancellation.lost) throw TypeError("Cancellation ACK lost");
    return { status: 200, json: async () => ({ ok: true, ...copy(f.server.saved) }) };
  };
  const generic = name => () => { genericCalls.push(name); assert.fail(`V9 recovery called generic ${name}`); };
  const clientFactory = options => {
    const withCancellationAdmission = typeof options.withCancellationAdmission === "function"
      ? (proof, task) => options.withCancellationAdmission(proof, async scope => {
        // The real recovery runner creates and verifies this scope. This only
        // exposes its lifetime to the inherited transport fixture's assertion.
        observedScopes.push(scope); f.admission.active = true;
        try { return await task(scope); } finally { f.admission.active = false; }
      }) : options.withCancellationAdmission;
    const client = createAdminTemplatePhotoTreeCopyClient({ ...options, storage: f.storage, locks: f.locks, fetchImpl, withCancellationAdmission });
    f.clients.push(client); return client;
  };
  const api = () => f.form({}, {
    createAdminTemplatePhotoTreeCopyClient: clientFactory,
    resumeCausalAdminTemplateCopy: generic("copy"), resumeAdminTemplatePhotoForm: generic("photo-form"),
    adminTemplateRecoveryFor: generic("recovery"),
    adminTemplateSaveCoordinator: () => ({ hasPendingCapture: () => false, prepareRecovery: generic("prepare"), flush: generic("flush") })
  });
  const capture = () => api().captureAdminTemplatePhotoTreeCopyForm(f.record, () => true);
  const off = () => { for (const name of ["tree", "copy", "create", "append"]) f.flags[name] = false; };
  return { ...f, cancellation, cancelPosts, genericCalls, observedScopes, api, capture, off };
}
