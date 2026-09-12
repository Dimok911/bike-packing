import { canonicalTemplateJson as canonical } from "./admin-template-protocol.js";
import { adminTemplatePhotoCopyIntent } from "./admin-template-photo-copy-protocol.js";
import { prepareAdminTemplatePhotoCopyRecord } from "./admin-template-photo-copy-record.js";
import { personalBusinessPayload } from "./personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "../public/admin-template-causal-save-flow.js";

const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const paused = () => { throw Object.assign(Error("Исходный шаблон и сохранённое копирование требуют сверки."),
  { code: "admin-template-plan-paused", isAdminTemplateBlocked: true }); };

// The pending editor is the exact target BEFORE the copy. Only a verified full
// server receipt may introduce the new owner and its independent photo refs.
export function adminTemplatePhotoCopyEditorSnapshot(record) {
  const target = record.snapshot.target;
  return { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(target.beforeState)), metadata: clone(target.metadata) };
}

export function adminTemplatePhotoCopySavePlan({ binding, operationId, body, editorSnapshot, recordIntentHash }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || !hash(recordIntentHash) || !exact(editorSnapshot, ["payload", "metadata"]) || !same(editorSnapshot.metadata, body?.metadata)) paused();
  const intent = adminTemplatePhotoCopyIntent({ ...binding, operationId, kind: "template.save", body });
  return clone({ version: 8, id: operationId, binding, operations: [intent], editorSnapshot, recordIntentHash });
}

export async function readAdminTemplatePhotoCopyRecord(store, input, recordIntentHash, guard = () => {}) {
  const intent = adminTemplatePhotoCopyIntent({ ...input, operationId: input.id });
  const binding = Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]]));
  if (!store || !exact(store.binding, ["actorId", "environment", "listId", "itemKey"]) || !same(store.binding, binding) || !hash(recordIntentHash)) paused();
  const read = await store.read(intent.id); guard();
  if (!read) paused();
  const retained = clone(read);
  const record = await prepareAdminTemplatePhotoCopyRecord({ binding: retained.binding, action: retained.action, snapshot: retained.snapshot }); guard();
  if (!same(retained, record) || record.intentHash !== recordIntentHash || !same(record.binding, binding)
    || !same(record.action, { operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body })) paused();
  return record;
}

export async function assertAdminTemplatePhotoCopyPlanRecord(plan, store, guard = () => {}) {
  const expected = adminTemplatePhotoCopySavePlan({ binding: plan.binding, operationId: plan.id, body: plan.operations?.[0]?.body,
    editorSnapshot: plan.editorSnapshot, recordIntentHash: plan.recordIntentHash });
  if (!same(plan, expected)) paused();
  const record = await readAdminTemplatePhotoCopyRecord(store, expected.operations[0], expected.recordIntentHash, guard); guard();
  if (!same(expected.editorSnapshot, adminTemplatePhotoCopyEditorSnapshot(record))) paused();
  return record;
}
