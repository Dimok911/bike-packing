// Wire-compatible canonicalization extracted from the existing client. Callers
// validate their JSON schema before hashing; this is not a schema validator.
export function canonicalOperationJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalOperationJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export const OPERATION_IDENTITY_VERSION = 1;
const fields = ["id", "namespace", "owner", "resource", "kind", "digest"];

// Applications project their existing envelope onto this internal identity.
// No wire field, URL, command name or storage key is prescribed by the core.
export function matchesOperationIdentity(actual, expected) {
  return !!actual && !!expected && fields.every(key => typeof expected[key] === "string"
    && expected[key].length > 0 && actual[key] === expected[key]);
}
