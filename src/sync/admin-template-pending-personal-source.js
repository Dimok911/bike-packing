import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplateCopyPayloadDigest } from "./admin-template-copy-projection.js";
import { personalBusinessPayload } from "./personal-server-payload.js";

// These actions need their own result projection even when their outer kind is
// list.update. This first adapter only accepts an unchanged DB payload.
const resultSourceFields = ["photoResults", "ownerResult", "shareLink", "historyRestore",
  "archiveImport", "guestImport", "publicImport", "serverImport", "migration"];

// Read the record through the validated personal outbox. A mutable UI mirror
// alone is never evidence that a source change has been durably captured.
export async function pendingPersonalTemplateSource({ binding, record, snapshot }) {
  const action = record?.action;
  const fail = () => { throw Error("Ожидающая личная версия не совпадает с сохранённой правкой. Сначала сверьте исходный список."); };
  if (!binding || binding.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || !action || action.kind !== "list.update" || !validTemplateOperationId(action.operationId)
    || ["environment", "actorId", "listId", "scopeKey"].some(key => action[key] !== binding[key])
    || Object.hasOwn(record, "photoState") || resultSourceFields.some(key => Object.hasOwn(action.body || {}, key))
    || canonicalTemplateJson(personalBusinessPayload(action.body?.payload)) !== canonicalTemplateJson(snapshot)) fail();
  // Pending sources use the authoritative business projection, while the
  // original action remains intact for exact outbox identity/replay checks.
  const payload = JSON.parse(canonicalTemplateJson(personalBusinessPayload(action.body.payload)));
  return { payload, action: JSON.parse(canonicalTemplateJson(action)),
    source: { kind: "personal-list", listId: binding.listId, base: { operationId: action.operationId },
      payloadDigest: await adminTemplateCopyPayloadDigest(payload) } };
}
