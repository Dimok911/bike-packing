import { canonicalOperationJson, matchesOperationIdentity } from "./operation-identity.js";

/**
 * Durable intent/receipt contract. Adapters may be synchronous or asynchronous.
 * The caller holds the application's queue lock across find/capture/delivery.
 * writeIntent must reject an existing ID atomically across writers; a missing
 * lookup alone is never a cross-tab lock. No storage migration is implied.
 */
export function createOperationJournal({ read, writeIntent, writeConfirmation,
  identityOf, contentOf, captureContentOf, confirmationOf,
  error = (code, id) => Object.assign(Error(code), { code, operationId: id }) }) {
  const find = async expected => {
    if (!matchesOperationIdentity(expected, expected)) throw error("invalid-identity", expected?.id);
    const entry = await read(expected.id);
    if (entry && !matchesOperationIdentity(identityOf(entry), expected)) throw error("identity-reuse", expected.id);
    return entry || null;
  };
  return {
    find,
    async capture(expected, intent) {
      const content = canonicalOperationJson(captureContentOf(intent));
      if (await find(expected)) throw error("already-recorded", expected.id);
      await writeIntent(intent);
      const saved = await find(expected);
      if (!saved) throw error("intent-not-persisted", expected.id);
      if (canonicalOperationJson(contentOf(saved)) !== content) throw error("intent-content-changed", expected.id);
      return saved;
    },
    async confirm(entry, proof, receiptIdentity) {
      const expected = identityOf(entry);
      if (proof == null) throw error("proof-missing", expected?.id);
      if (!matchesOperationIdentity(receiptIdentity, expected)) throw error("foreign-receipt", expected?.id);
      if (!await find(expected)) throw error("intent-missing", expected.id);
      if (await writeConfirmation(entry, proof) !== true) throw error("proof-not-persisted", expected.id);
      const saved = await find(expected);
      if (!saved || canonicalOperationJson(confirmationOf(saved)) !== canonicalOperationJson(proof)) {
        throw error("proof-not-persisted", expected.id);
      }
      return proof;
    },
  };
}
