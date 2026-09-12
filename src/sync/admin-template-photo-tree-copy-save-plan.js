import { canonicalTemplateJson as canonical } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyPayload } from "./admin-template-photo-tree-copy-protocol.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "./admin-template-photo-tree-copy-record.js";
import { validateAdminTemplatePhotoTreeCopyReceipt } from "./admin-template-photo-tree-copy-receipt.js";
import { personalBusinessPayload } from "./personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "../public/admin-template-causal-save-flow.js";

const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const paused = () => { throw Object.assign(Error("Сохранённое дерево, оба шаблона и подтверждение требуют сверки."),
  { code: "admin-template-photo-tree-copy-plan-paused", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");

// Unwired pure V9 grammar. The existing tree gate remains OFF. This module does
// not capture, dispatch, cancel, adopt, acquire a common lease or change state.
// The small editor snapshot is a comparison view, never raw-source authority:
// every read/result must prove the complete typed record and both before states.
export function adminTemplatePhotoTreeCopyEditorSnapshot(input) {
  const record = clone(input), target = record.snapshot.target;
  return { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(target.beforeState)), metadata: clone(target.metadata) };
}

export function adminTemplatePhotoTreeCopySavePlan(input) {
  const value = clone(input);
  if (!exact(value, ["binding", "operationId", "body", "editorSnapshot", "recordIntentHash"])) paused();
  const { operationId, body, editorSnapshot, recordIntentHash } = value, binding = adminTemplatePhotoActionBinding(value.binding);
  if (!hash(recordIntentHash) || !exact(editorSnapshot, ["payload", "metadata"]) || !same(editorSnapshot.metadata, body?.metadata)) paused();
  const intent = adminTemplatePhotoTreeCopyIntent({ ...binding, operationId, kind: "template.save", body });
  return clone({ version: 9, id: operationId, binding, operations: [intent], editorSnapshot, recordIntentHash });
}

export async function readAdminTemplatePhotoTreeCopyRecord(store, input, recordIntentHash, guard = () => {}) {
  // Detach caller-owned input and binding before the first await. A plausible
  // decoded object, cached hash or a store belonging to another actor is no proof.
  const value = clone(input), intent = adminTemplatePhotoTreeCopyIntent({ ...value, operationId: value.id });
  if (!same(value, intent) || !hash(recordIntentHash) || !store || typeof store.read !== "function") paused();
  const binding = adminTemplatePhotoActionBinding(Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]])));
  const current = () => { guard(); if (!same(adminTemplatePhotoActionBinding(store.binding), binding)) paused(); };
  current();
  const read = await store.read(intent.id); current();
  if (!read) paused();
  const retained = clone(read);
  const record = await prepareAdminTemplatePhotoTreeCopyRecord({ binding: retained.binding, action: retained.action, snapshot: retained.snapshot }); current();
  if (!same(retained, record) || record.intentHash !== recordIntentHash || !same(record.binding, binding)
    || !same(record.action, { operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body })) paused();
  return record;
}

export async function assertAdminTemplatePhotoTreeCopyPlanRecord(input, store, guard = () => {}) {
  const plan = clone(input);
  if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot", "recordIntentHash"])
    || plan.version !== 9 || !Array.isArray(plan.operations) || plan.operations.length !== 1) paused();
  const expected = adminTemplatePhotoTreeCopySavePlan({ binding: plan.binding, operationId: plan.id, body: plan.operations[0]?.body,
    editorSnapshot: plan.editorSnapshot, recordIntentHash: plan.recordIntentHash });
  if (!same(plan, expected)) paused();
  const record = await readAdminTemplatePhotoTreeCopyRecord(store, expected.operations[0], expected.recordIntentHash, guard); guard();
  if (!same(expected.editorSnapshot, adminTemplatePhotoTreeCopyEditorSnapshot(record))) paused();
  return record;
}

// A detached RAW confirmation package, not a normalized editor adapter. The
// caller still needs current source/target namespace guards under genuine shared
// admission and a target-only merge with quota rollback. No boolean supplied by
// a client can stand in for full staged-byte/path and terminal-receipt proofs.
export async function projectAdminTemplatePhotoTreeCopyPlanResult(input, guard = () => {}) {
  if (!exact(input, ["plan", "store", "receipt", "stageReceipts"])) paused();
  const { store } = input, { plan, receipt, stageReceipts } = clone({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts });
  const record = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, store, guard); guard();
  const intent = plan.operations[0], { id: ignoredId, ...encoded } = intent;
  const payloadDigest = await digest(encoded); guard();
  const valid = await validateAdminTemplatePhotoTreeCopyReceipt(receipt, { intent, payloadDigest, stageReceipts }); guard();
  if (!valid) paused();
  // Rejection/cancellation is a fact for a future typed stop adapter; it cannot
  // create a projection or retire stage claims, even with a strong certificate.
  if (receipt.operation.state !== "committed") paused();
  const confirmedPayload = adminTemplatePhotoTreeCopyPayload(intent, receipt.result.payload.photoCopy.owners);
  // The typed receipt validator rederives every ordered manifest, all-owner
  // materialization independence and this full raw payload, including placement.
  // Re-read after those awaits so disappearance/replacement cannot become adoption.
  const current = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, store, guard); guard();
  if (!same(current, record) || !same(confirmedPayload, receipt.result.payload.photoCopy.confirmedPayload)) paused();
  return clone({ recordIntentHash: record.intentHash, source: record.snapshot.source, target: record.snapshot.target,
    copiedOwners: record.snapshot.copiedOwners, confirmedPayload, stateRevision: receipt.result.payload.stateRevision, metadata: record.snapshot.target.metadata });
}
