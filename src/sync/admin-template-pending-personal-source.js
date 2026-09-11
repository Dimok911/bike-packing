import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplateCopyPayloadDigest } from "./admin-template-copy-projection.js";
import { personalBusinessPayload } from "./personal-server-payload.js";

// Read the record through the validated personal outbox. A mutable UI mirror
// alone is never evidence that a source change has been durably captured.
export async function pendingPersonalTemplateSource({ binding, record, snapshot }) {
  const action = record?.action;
  const fail = () => { throw Error("Ожидающая личная версия не совпадает с сохранённой правкой. Сначала сверьте исходный список."); };
  if (!binding || binding.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || !action || action.kind !== "list.update" || !validTemplateOperationId(action.operationId)
    || ["environment", "actorId", "listId", "scopeKey"].some(key => action[key] !== binding[key])
    || record.photoState || action.body?.ownerResult || action.body?.publicImport || action.body?.serverImport
    || canonicalTemplateJson(personalBusinessPayload(action.body?.payload)) !== canonicalTemplateJson(snapshot)) fail();
  const payload = JSON.parse(canonicalTemplateJson(action.body.payload));
  return { payload, action: JSON.parse(canonicalTemplateJson(action)),
    source: { kind: "personal-list", listId: binding.listId, base: { operationId: action.operationId },
      payloadDigest: await adminTemplateCopyPayloadDigest(payload) } };
}
