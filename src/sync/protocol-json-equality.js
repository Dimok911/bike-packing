import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { canonicalAccessJson } from "./personal-access-protocol.js";

// Compare the complete current JSON values, without allocating canonical strings.
// There is no memo, identity shortcut or storage observation in this helper.
// Accessors retain the original serializer's evaluation order and semantics.
function dataOnly(value, depth = 0) {
  if (!value || typeof value !== "object") return true;
  if (depth > 100) return false;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const property = Object.getOwnPropertyDescriptor(value, String(i));
      if (!property || !("value" in property) || !dataOnly(property.value, depth + 1)) return false;
    }
    return true;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  for (const key of Object.keys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property) || !dataOnly(property.value, depth + 1)) return false;
  }
  return true;
}
function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const array = Array.isArray(left);
  if (array !== Array.isArray(right)) return false;
  if (array) return left.length === right.length && left.every((entry, index) => equal(entry, right[index]));
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
export function sameProtocolJson(left, right) {
  if (!dataOnly(left) || !dataOnly(right)) return canonicalAccessJson(left) === canonicalAccessJson(right);
  // Validate both complete trees even on unequal values or identical references.
  assertListOperationJsonValue(left);
  assertListOperationJsonValue(right);
  return equal(left, right);
}
