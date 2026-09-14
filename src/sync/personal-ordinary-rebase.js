import { personalBusinessPayload } from "./personal-business-payload.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { planPersonalPayloadReconciliation } from "./personal-save-reconciliation.js";

const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const clone = value => JSON.parse(JSON.stringify(value));
const collections = ["items", "containers"];
const photoOptions = { allowLegacy: true };
const jsonValue = (value, depth = 0) => {
  if (depth > 100) return false;
  if (value === null || ["boolean", "string"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!plain(value) && !Array.isArray(value) || Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value)) return Object.keys(value).length === value.length
    && value.every((entry, index) => Object.hasOwn(value, index) && jsonValue(entry, depth + 1));
  return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(entry => jsonValue(entry, depth + 1));
};

// Pure candidate construction, never proof of a base or an operation outcome.
// The caller must supply an authenticated exact base, settle the original UUIDs
// and publish a NEW revision-checked operation before applying any candidate.
// Layouts retain the existing whole-record conflict policy; this does not merge
// independent simultaneous placements inside one layout.
export function planPersonalOrdinaryRebase({ base, local, remote, listId, choices } = {}) {
  if (!base || !revision(base.stateRevision) || !plain(base.payload)) return { blocked: "missing-base" };
  if (!remote || !revision(remote.stateRevision) || !plain(remote.payload)) return { blocked: "remote-unavailable" };
  if (remote.stateRevision < base.stateRevision) return { blocked: "revision" };
  let before, candidate, after;
  try {
    // Reject non-JSON input before projection could silently drop its values.
    if (![base.payload, local, remote.payload].every(payload => jsonValue(payload))) return { blocked: "invalid-payload" };
    [before, candidate, after] = [base.payload, local, remote.payload].map(personalBusinessPayload);
  } catch { return { blocked: "invalid-payload" }; }
  if (!preservesConfirmedPersonalPhotos(before, candidate, listId, photoOptions)
    || !preservesConfirmedPersonalPhotos(before, after, listId, photoOptions)) return { blocked: "photo-inventory" };

  const withoutConfirmedPhotos = payload => {
    const result = clone(payload);
    for (const collection of collections) for (const owner of Object.values(result[collection])) {
      // Empty arrays and absent fields participate in the ordinary comparison;
      // only an already proven nonempty inventory is held outside the DB merge.
      if (owner.photos?.length) delete owner.photos;
    }
    return result;
  };
  const plan = planPersonalPayloadReconciliation({ base: { ...base, payload: withoutConfirmedPhotos(before) },
    local: withoutConfirmedPhotos(candidate), remote: { ...remote, payload: withoutConfirmedPhotos(after) }, choices });
  if (!plan.payload) {
    if (!plan.conflicts) return plan;
    // Review UI sees complete original records, never temporary photo removal.
    return { ...plan, conflicts: plan.conflicts.map(conflict => {
      const collection = { item: "items", container: "containers" }[conflict.type];
      if (!collection) return conflict;
      return { ...conflict, baseValue: clone(before[collection][conflict.id] ?? null),
        localValue: clone(candidate[collection][conflict.id] ?? null), remoteValue: clone(after[collection][conflict.id] ?? null) };
    }) };
  }
  for (const collection of collections) for (const [id, owner] of Object.entries(after[collection])) {
    if (!owner.photos?.length) continue;
    if (!Object.hasOwn(plan.payload[collection], id)) return { blocked: "photo-inventory" };
    plan.payload[collection][id].photos = clone(owner.photos);
  }
  if (!preservesConfirmedPersonalPhotos(after, plan.payload, listId, photoOptions)) return { blocked: "photo-inventory" };
  return plan;
}
