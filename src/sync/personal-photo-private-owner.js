import { hasPrivateSyncBlockedPublicOrigin } from "../public/copy-public-to-private.js";

// A retained _publicCopySource* value describes the origin of an independent
// private copy. It is not a live public/share binding. Callers must still prove
// this owner's actor/list/revision and preserve its exact photo references.
export function isPersonalPhotoPrivateOwner(owner) {
  return Boolean(owner && Object.getPrototypeOf(owner) === Object.prototype
    && typeof owner.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(owner.id)
    && !["__proto__", "constructor", "prototype"].includes(owner.id)
    && !["adminDemo", "adminSharedSourceId", "publicCatalogLayoutId", "sharedSourceId"].some(key => owner[key])
    && !hasPrivateSyncBlockedPublicOrigin(owner, owner.id));
}
