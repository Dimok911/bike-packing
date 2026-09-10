import { canonicalAccessJson as canonicalOperationJson, validAccessOperationId as validListOperationId } from "./personal-access-protocol.js";
export const ADMIN_TEMPLATE_OPERATIONS_ENABLED = false;
export const TEMPLATE_OPERATION_CAPABILITY = "adminTemplateCausalOperationsV1";
export const TEMPLATE_OPERATION_KINDS = Object.freeze(["template.create", "template.save", "template.metadata", "template.publication", "template.archive", "template.delete"]);
export { canonicalOperationJson as canonicalTemplateJson, validListOperationId as validTemplateOperationId };

const environment = "bike-packing-experiment";
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max, empty = false) => typeof value === "string" && value.length <= max && (empty || value.length > 0)
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const fail = () => { throw Object.assign(Error("Invalid immutable administrative template intent"), { code: "invalid_template_operation" }); };
const validBase = (base, operationId) => exact(base, ["stateRevision"]) && Number.isSafeInteger(base.stateRevision) && base.stateRevision > 0
  || exact(base, ["operationId"]) && validListOperationId(base.operationId) && base.operationId !== operationId;

export function adminTemplateIntent({ actorId, operationId, kind, itemKey, listId, body }) {
  if (!text(actorId, 36) || !text(listId, 64) || !text(itemKey, 191) || !validListOperationId(operationId)
    || !TEMPLATE_OPERATION_KINDS.includes(kind)
    || !/^(demo-state(?:[:-].+)?|shared-layout:.+)$/.test(itemKey)
    || !/^(public-demo-state(?:-.+)?|public-shared-layout-.+)$/.test(listId)) fail();
  canonicalOperationJson(body); // No coercion, undefined, NaN, class objects or mutable input alias.
  if (!plain(body) || body.version !== 1) fail();
  const extra = ["template.create", "template.save"].includes(kind) ? ["payload", "metadata"]
    : kind === "template.metadata" ? ["metadata"] : kind === "template.publication" ? ["published", "indexes"] : ["indexes"];
  if (!exact(body, ["version", "base", ...extra])) fail();
  if (kind === "template.create") {
    if (body.base !== null) fail();
  } else if (!validBase(body.base, operationId)) fail();
  if (extra.includes("indexes")) {
    if (!Array.isArray(body.indexes) || body.indexes.length > 100 || new Set(body.indexes.map(index => index?.listId)).size !== body.indexes.length
      || body.indexes.some(index => !exact(index, ["listId", "base"]) || !text(index.listId, 64)
        || !/^public-demo-state(?:-[a-z0-9-]+)?$/.test(index.listId) || index.listId === listId || !validBase(index.base, operationId))
      || (!itemKey.startsWith("shared-layout:") || body.published === true) && body.indexes.length) fail();
  }
  if (extra.includes("payload") && !plain(body.payload)) fail();
  if (extra.includes("metadata")) {
    const metadata = body.metadata, keys = kind === "template.metadata"
      ? ["title", "language", ...(Object.hasOwn(metadata || {}, "layoutOrder") ? ["layoutOrder"] : [])]
      : ["title", "description", "language"];
    if (!exact(metadata, keys) || !text(metadata.title, 255) || !["ru", "en"].includes(metadata.language)
      || Object.hasOwn(metadata, "description") && !text(metadata.description, 10000, true)
      || Object.hasOwn(metadata, "layoutOrder") && (!Number.isSafeInteger(metadata.layoutOrder) || metadata.layoutOrder < 1)) fail();
  }
  if (kind === "template.publication" && typeof body.published !== "boolean") fail();
  const frozen = JSON.parse(canonicalOperationJson({ environment, actorId, kind, itemKey, listId, body }));
  const encoded = canonicalOperationJson(frozen);
  if (new TextEncoder().encode(encoded).byteLength > 3 * 1024 * 1024) fail();
  return { id: operationId, ...frozen };
}
