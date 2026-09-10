import { assertListOperationJsonValue } from "./list-operation-payload.js";

export const PERSONAL_LIST_ACCESS_ENABLED = false;
export const PERSONAL_LIST_ACCESS_CAPABILITY = "personalCausalListAccessV1";
export const LIST_ACCESS_KINDS = Object.freeze(["access.grant", "access.revoke", "access.accept"]);
export const validAccessOperationId = value => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const validListOperationId = validAccessOperationId;
export function canonicalAccessJson(value) {
  assertListOperationJsonValue(value);
  const encode = value => Array.isArray(value) ? "[" + value.map(encode).join(",") + "]"
    : value && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + encode(value[key])).join(",") + "}"
    : JSON.stringify(value);
  return encode(value);
}
const canonicalOperationJson = canonicalAccessJson;
const environment = "bike-packing-experiment";
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim()
  && !["constructor", "prototype", "__proto__"].includes(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const shareId = value => typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const token = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const legacyToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const fail = code => { throw Object.assign(Error("Invalid immutable Bike access intent"), { code }); };

export function normalizeAccessRecipient(value) {
  if (typeof value !== "string") fail("invalid_access_recipient");
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid_access_recipient");
  return email;
}

function assertGrantReference(value, operationId) {
  if (!exact(value, ["shareId", "grantOperationId"]) || !(shareId(value.shareId) || value.shareId === null && validListOperationId(value.grantOperationId))
    || value.grantOperationId !== null && (!validListOperationId(value.grantOperationId) || value.grantOperationId === operationId)) {
    fail("invalid_access_grant_reference");
  }
}

// Access owns a separate operation namespace. In particular, acceptance by a
// recipient must never impersonate the owner's personal-save operation.
// Grant dataSource names the confirmed list version or its pending owner action;
// revocation can withdraw a specific grant without waiting for unrelated photos.
export function personalAccessIntent({ actorId, operationId, kind, listId, body }) {
  if (!id(actorId, 36) || !id(listId, 64) || !validListOperationId(operationId) || !LIST_ACCESS_KINDS.includes(kind)) fail("invalid_access_binding");
  canonicalOperationJson(body); // Reject non-JSON values before any cloning.
  if (kind === "access.grant") {
    if (!exact(body, ["version", "recipientEmail", "role", "token", "expectedGrant", "dataSource"]) || body.version !== 1
      || body.recipientEmail !== normalizeAccessRecipient(body.recipientEmail) || !["viewer", "editor"].includes(body.role) || !token(body.token)) {
      fail("invalid_access_grant");
    }
    if (body.expectedGrant !== null) assertGrantReference(body.expectedGrant, operationId);
    if (!(exact(body.dataSource, ["stateRevision"]) && revision(body.dataSource.stateRevision)
      || exact(body.dataSource, ["operationId"]) && validListOperationId(body.dataSource.operationId) && body.dataSource.operationId !== operationId)) {
      fail("invalid_access_data_source");
    }
  } else if (kind === "access.revoke") {
    if (!exact(body, ["version", "grant"]) || body.version !== 1) fail("invalid_access_revocation");
    assertGrantReference(body.grant, operationId);
  } else if (!(exact(body, ["version", "grantOperationId", "token"]) && body.version === 1
    && validListOperationId(body.grantOperationId) && body.grantOperationId !== operationId && token(body.token)
    || exact(body, ["version", "shareId", "token"]) && body.version === 2 && shareId(body.shareId) && legacyToken(body.token))) {
    fail("invalid_access_acceptance");
  }
  const frozen = JSON.parse(canonicalOperationJson({ environment, actorId, kind, listId, body }));
  return { id: operationId, environment, actorId, kind, listId, body: frozen.body };
}

