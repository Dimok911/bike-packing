import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplatePhotoCreateIntent } from "./admin-template-photo-create-protocol.js";
import { personalBusinessPayload } from "./personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "../public/admin-template-causal-save-flow.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const paused = () => { throw Object.assign(Error("Новая запись и исходные файлы требуют сверки сохранённого действия."),
  { code: "admin-template-plan-paused", isAdminTemplateBlocked: true }); };

export function adminTemplatePhotoCreateEditorSnapshot(record) {
  return { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(record.snapshot.state)), metadata: clone(record.snapshot.metadata) };
}

// The store's read is a full binary decode, including the source/before proof.
// A JSON journal or receipt alone cannot replace this retained creation record.
export async function readAdminTemplatePhotoCreateRecord(store, intent, recordIntentHash, guard = () => {}) {
  if (!store || !same(store.binding, Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]])))) paused();
  const record = await store.read(intent.id); guard();
  if (!record || !hash(record.intentHash) || recordIntentHash !== undefined && record.intentHash !== recordIntentHash
    || !same(record.binding, store.binding) || !same(record.action, { operationId: intent.id, kind: intent.kind,
      listId: intent.listId, itemKey: intent.itemKey, body: intent.body })) paused();
  return record;
}

// V7 refers to the immutable IDB inventory; V5/V6 retain their existing shape.
export function adminTemplatePhotoCreateSavePlan({ binding, operationId, body, editorSnapshot, recordIntentHash }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || !hash(recordIntentHash) || !exact(editorSnapshot, ["payload", "metadata"]) || !same(editorSnapshot.metadata, body?.metadata)) paused();
  const intent = adminTemplatePhotoCreateIntent({ ...binding, operationId, kind: "template.save", body });
  return clone({ version: 7, id: operationId, binding, operations: [intent], editorSnapshot, recordIntentHash });
}

export async function assertAdminTemplatePhotoCreatePlanRecord(plan, store, guard) {
  const record = await readAdminTemplatePhotoCreateRecord(store, plan.operations[0], plan.recordIntentHash, guard); guard?.();
  if (!same(plan.editorSnapshot, adminTemplatePhotoCreateEditorSnapshot(record))) paused();
  return record;
}
