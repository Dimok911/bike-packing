import { canonicalTemplateJson as canonical } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyPayload } from "./admin-template-photo-whole-copy-protocol.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "./admin-template-photo-whole-copy-record.js";
import { validateAdminTemplatePhotoWholeCopyReceipt } from "./admin-template-photo-whole-copy-receipt.js";
import { personalBusinessPayload } from "./personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "../public/admin-template-causal-save-flow.js";

const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const paused = () => { throw Object.assign(Error("Копирование укладки, исходный шаблон и подтверждение требуют сверки."),
  { code: "admin-template-photo-whole-copy-plan-paused", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const synchronous = guard => {
  if (typeof guard !== "function") paused();
  const result = guard();
  if (result?.then) { Promise.resolve(result).catch(() => {}); paused(); }
  if (result === false) paused();
};

// Unwired pure V10 grammar. No capture, dispatch, admission, adoption or gate
// changes. Only the source exists: the target record is an allocation declaration,
// never a fabricated before-state or proof of current local/server absence.
// This comparison view does not replace the complete raw source record proof.
export function adminTemplatePhotoWholeCopySourceEditorSnapshot(input) {
  const record = clone(input), source = record.snapshot.source;
  return { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(source.beforeState)), metadata: clone(source.metadata) };
}

export function adminTemplatePhotoWholeCopySavePlan(input) {
  const value = clone(input);
  if (!exact(value, ["binding", "operationId", "body", "sourceEditorSnapshot", "recordIntentHash"])) paused();
  const { operationId, body, sourceEditorSnapshot, recordIntentHash } = value, binding = adminTemplatePhotoActionBinding(value.binding);
  if (!hash(recordIntentHash) || !exact(sourceEditorSnapshot, ["payload", "metadata"])) paused();
  // Source metadata may differ from the requested title/metadata of the copy.
  // The typed protocol requires template.copy, base:null and all allocations.
  const intent = adminTemplatePhotoWholeCopyIntent({ ...binding, operationId, kind: "template.copy", body });
  return clone({ version: 10, id: operationId, binding, operations: [intent], sourceEditorSnapshot, recordIntentHash });
}

export async function readAdminTemplatePhotoWholeCopyRecord(store, input, recordIntentHash, guard = () => {}) {
  // Detach caller-owned values before the first await; neither a hash pointer
  // nor a plausible decoded object establishes this record's authority.
  const value = clone(input), intent = adminTemplatePhotoWholeCopyIntent({ ...value, operationId: value.id });
  if (!same(value, intent) || !hash(recordIntentHash)) paused();
  const binding = adminTemplatePhotoActionBinding(Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]])));
  const current = () => {
    synchronous(guard);
    if (!store || typeof store.read !== "function" || !same(adminTemplatePhotoActionBinding(store.binding), binding)) paused();
  };
  current();
  const valueRead = await store.read(intent.id); current();
  if (!valueRead) paused();
  const retained = clone(valueRead);
  const record = await prepareAdminTemplatePhotoWholeCopyRecord({ binding: retained.binding, action: retained.action, snapshot: retained.snapshot }); current();
  if (!same(retained, record) || record.intentHash !== recordIntentHash || !same(record.binding, binding)
    || !same(record.action, { operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body })) paused();
  // A record may disappear or change while its manifests and digests are being
  // rederived. Re-read its exact decoded bytes before returning the proof.
  const readback = await store.read(intent.id); current();
  if (!readback || !same(readback, record)) paused();
  return record;
}

export async function assertAdminTemplatePhotoWholeCopyPlanRecord(input, store, guard = () => {}) {
  const plan = clone(input);
  if (!exact(plan, ["version", "id", "binding", "operations", "sourceEditorSnapshot", "recordIntentHash"])
    || plan.version !== 10 || !Array.isArray(plan.operations) || plan.operations.length !== 1) paused();
  const expected = adminTemplatePhotoWholeCopySavePlan({ binding: plan.binding, operationId: plan.id, body: plan.operations[0]?.body,
    sourceEditorSnapshot: plan.sourceEditorSnapshot, recordIntentHash: plan.recordIntentHash });
  if (!same(plan, expected)) paused();
  const record = await readAdminTemplatePhotoWholeCopyRecord(store, expected.operations[0], expected.recordIntentHash, guard); synchronous(guard);
  if (!same(expected.sourceEditorSnapshot, adminTemplatePhotoWholeCopySourceEditorSnapshot(record))) paused();
  return record;
}

// Detached RAW confirmation package only. The caller still owes current source,
// absent-target/own-pending namespace admission and durable target-only apply.
// Rejected/cancelled receipts cannot adopt a target or retire any stage claim.
export async function projectAdminTemplatePhotoWholeCopyPlanResult(input, guard = () => {}) {
  if (!exact(input, ["plan", "store", "receipt", "stageReceipts"])) paused();
  const { store } = input, { plan, receipt, stageReceipts } = clone({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts });
  const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, store, guard); synchronous(guard);
  const intent = plan.operations[0], { id: ignoredId, ...encoded } = intent;
  const payloadDigest = await digest(encoded); synchronous(guard);
  const valid = await validateAdminTemplatePhotoWholeCopyReceipt(receipt, { intent, payloadDigest, stageReceipts }); synchronous(guard);
  if (!valid || receipt.operation.state !== "committed") paused();
  const confirmedPayload = adminTemplatePhotoWholeCopyPayload(intent, receipt.result.payload.photoCopy.owners);
  // Full receipt validation binds revision 1, the new owner to actorId, every
  // ordered manifest/path and deterministic owner allocation to this raw result.
  const current = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, store, guard); synchronous(guard);
  if (!same(current, record) || !same(confirmedPayload, receipt.result.payload.photoCopy.confirmedPayload)) paused();
  return clone({ recordIntentHash: record.intentHash, source: record.snapshot.source, target: record.snapshot.target,
    copiedOwners: record.snapshot.copiedOwners, confirmedPayload, stateRevision: receipt.result.payload.stateRevision, metadata: record.snapshot.target.metadata });
}
