import assert from "node:assert/strict";
import { wholeCopyReceiptFixture, cancelWholeReceipt, copy, hash } from "./admin-template-photo-whole-copy-receipt-fixture.js";
import { wholeStoreFixture, wholeRecordInput } from "./admin-template-photo-whole-copy-record-fixture.js";
import { createAdminTemplatePhotoWholeCopyClient } from "../../src/sync/admin-template-photo-whole-copy-client.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

export { copy, hash };
export const commandPrefix = "bike-packing-admin-photo-whole-copy-commands-v1:";
export const stagePath = "/bike-packing/admin/template-photo-assets/whole-copy";
export const parentPath = "/bike-packing/admin/template-operations";
export const transportPrefix = "fixture-whole-copy-transport:";
export async function wholeCopyClientFixture() {
  const f = await wholeCopyReceiptFixture(), storeFixture = await wholeStoreFixture({ recordInput: await wholeRecordInput({ protocolInput: f.input }) });
  const { input, idb, store, context: current, create: makeStore } = storeFixture, binding = input.binding;
  const id = input.action.operationId, record = await store.capture(storeFixture.value), intent = f.intent;
  const values = new Map(), controls = { rejectWrite: null, afterRequest: null, afterBegin: null, afterClaim: null, afterRead: null, afterPrepare: null,
    loseStage: false, unknownStage: false, loseParent: false, unknownParent: false, hideParent: false, loseCancel: false,
    wrongActor: false, noRights: false, revokeAdmission: false, mutateParent: null, mutateStage: null,
    capabilities: ["adminTemplateCausalOperationsV1", "adminTemplateCopyV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1",
      "adminTemplatePhotoCopyV1", "adminTemplatePhotoWholeCopyV1"] };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (controls.rejectWrite?.(key, value)) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const tails = new Map(), locks = { async request(name, task) {
    const previous = tails.get(name) || Promise.resolve(); let release;
    const held = new Promise(resolve => { release = resolve; }); tails.set(name, held); await previous;
    try { return await task(); } finally { release(); if (tails.get(name) === held) tails.delete(name); }
  } };
  const server = { calls: [], stagePosts: [], parentPosts: [], cancelPosts: [], stages: new Map(), saved: null };
  const admission = { active: false, calls: 0, checks: 0 }, assertAdmission = () => {
    admission.checks++; assert.equal(admission.active, true); if (controls.revokeAdmission) throw Error("Admission revoked");
  };
  const withDispatchAdmission = async (proof, task) => locks.request("fixture-whole-common-admission", async () => {
    assert.deepEqual(proof.intent, intent); assert.equal(proof.recordIntentHash, record.intentHash); proof.assertCurrent();
    admission.active = true; admission.calls++;
    try { return await task({ assertCurrent() { proof.assertCurrent(); assertAdmission(); } }); }
    finally { admission.active = false; }
  });
  const expectedEnvelope = { expectedActorId: binding.actorId, environment: binding.environment, operationId: id, kind: "template.copy",
    listId: binding.listId, itemKey: binding.itemKey, body: record.action.body };
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname, method = request.method || "GET"; server.calls.push({ path, method });
    assert.equal(request.credentials, "include"); assert.equal(request.redirect, "error"); let value;
    if (path.endsWith("/auth/me")) value = { ok: true, user: { id: controls.wrongActor ? "foreign" : binding.actorId } };
    else if (path.endsWith("/authorization")) value = { ok: true, authorization: { version: 1, role: controls.noRights ? "user" : "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) value = { ok: true, service: "bikepacking-api", capabilities: controls.capabilities };
    else if (path === stagePath && method === "POST") {
      assertAdmission(); const body = JSON.parse(request.body), index = record.stages.findIndex(stage => stage.operationId === body.manifest?.operationId);
      assert.deepEqual(Object.keys(body), ["manifest"]); assert.notEqual(index, -1); assert.deepEqual(body.manifest, record.stages[index]);
      server.stagePosts.push(copy(body));
      if (!controls.unknownStage) { const receipt = copy(f.stages[index]); controls.mutateStage?.(receipt, index); server.stages.set(body.manifest.operationId, receipt); }
      controls.afterRequest?.(path, method);
      if (controls.loseStage || controls.unknownStage) throw TypeError("Stage ACK lost"); value = server.stages.get(body.manifest.operationId);
    } else if (path.startsWith(stagePath + "/") && method === "GET") {
      const stageId = path.split("/").at(-1);
      value = server.stages.get(stageId) || { ok: true, operation: { id: stageId, actorId: binding.actorId, environment: binding.environment, state: "unknown" } };
    } else if (path === parentPath && method === "POST") {
      assertAdmission(); const body = JSON.parse(request.body); assert.deepEqual(body, expectedEnvelope); server.parentPosts.push(copy(body));
      if (!controls.unknownParent) { server.saved = copy(f.receipt); controls.mutateParent?.(server.saved); }
      controls.afterRequest?.(path, method);
      if (controls.loseParent || controls.unknownParent) throw TypeError("Parent ACK lost"); value = { ok: true, ...server.saved };
    } else if (path === `${parentPath}/${id}/cancel` && method === "POST") {
      assertAdmission(); const body = JSON.parse(request.body); assert.deepEqual(body, expectedEnvelope); server.cancelPosts.push(copy(body));
      server.saved ||= cancelWholeReceipt(f); controls.afterRequest?.(path, method);
      if (controls.loseCancel) throw TypeError("Cancel ACK lost"); value = { ok: true, ...server.saved };
    } else if (path === `${parentPath}/${id}` && method === "GET") {
      value = server.saved && !controls.hideParent ? { ok: true, ...server.saved } : { ok: true, operation: { id, state: "unknown" } };
    } else throw Error(`Unexpected ${method} ${path}`);
    controls.afterRequest?.(path, method);
    return { status: 200, json: async () => copy(value) };
  };
  // Explicit typed fake: the current application transport has no whole-copy
  // admission/fence yet. These durable barriers test the client protocol only.
  const readWrites = () => [...values].filter(([key]) => key.startsWith(transportPrefix)).map(([, value]) => JSON.parse(value));
  const fences = [];
  const make = (extra = {}) => {
    const transport = { experiment: true, mode: "direct", get writes() { return readWrites(); }, apiUrl: path => "https://fixture.invalid" + path,
      async prepare() { controls.afterPrepare?.(); },
      assertWritable(path, method, metadata, permission) {
        assertAdmission(); assert.equal(method, "POST");
        if (path === stagePath) assert.equal(metadata.protocol, "admin-template-photo-whole-copy-stage-v3");
        else { assert.equal(metadata.protocol, "admin-template-photo-whole-copy-parent-v3"); assert.equal(metadata.kind, "template.copy"); }
        if (path.endsWith("/cancel")) assert.equal(permission.stageProtocol, "admin-template-photo-whole-copy-stage-v3");
      },
      async beginWrite(path, method, body, metadata, permission) {
        assertAdmission(); const key = transportPrefix + metadata.operationId;
        assert.equal(storage.getItem(key), null);
        storage.setItem(key, canonical({ id: metadata.operationId, mode: "direct", path, method, recovery: metadata, confirmed: false, uncertain: false }));
        controls.afterBegin?.(path, method, metadata, permission);
      },
      noteFailure(cause, path, method, operationId) {
        const key = transportPrefix + operationId, entry = storage.getItem(key); if (entry) storage.setItem(key, canonical({ ...JSON.parse(entry), uncertain: true }));
      },
      confirmWrite(operationId, { receipt }) {
        const key = transportPrefix + operationId, entry = storage.getItem(key); if (!entry) return false;
        storage.setItem(key, canonical({ ...JSON.parse(entry), receipt, confirmed: true, uncertain: false })); return true;
      },
      async fenceWholeCopyParent(proof) {
        proof.assertCurrent(); assert.equal(proof.intent.kind, "template.copy"); assert.equal(proof.intent.body.photoCopy.version, 3);
        assert.equal(proof.recordIntentHash, record.intentHash); assert.equal(proof.receipt.result.payload.code, "operation_cancelled");
        fences.push(copy({ intent: proof.intent, receipt: proof.receipt, recordIntentHash: proof.recordIntentHash }));
      }
    };
    const clientStore = { binding: store.binding, async read(operationId) { const result = await store.read(operationId); controls.afterRead?.(); return result; },
      async claimStage(...args) { assertAdmission(); const claim = await store.claimStage(...args); controls.afterClaim?.(); return claim; } };
    const client = createAdminTemplatePhotoWholeCopyClient({ binding, getContext: () => current, store: clientStore, transport, storage, locks, fetchImpl,
      enabled: true, adminEnabled: true, appendEnabled: true, createEnabled: true, copyEnabled: true,
      withDispatchAdmission, withCancellationAdmission: withDispatchAdmission, ...extra });
    return { client, transport };
  };
  return { ...f, id, binding, current, record, store, makeStore, idb, controls, values, storage, locks, server, fetchImpl, make,
    admission, withDispatchAdmission, fences, expectedEnvelope };
}
