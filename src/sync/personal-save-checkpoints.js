import { canonicalListOperationJson } from "./list-operation-queue.js";

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;

export function mergePersonalPhotoReceipts(...groups) {
  const receipts = new Map();
  for (const group of groups) for (const proof of group || []) {
    const op = proof?.operation;
    if (proof?.historicalOnly !== true || !uuid(op?.id || "") || op.kind !== "photos.mutate"
      || !["committed", "rejected"].includes(op.state) || !/^[a-f0-9]{64}$/.test(op.payloadDigest || "")
      || !Number.isInteger(proof.resultStatus)
      || (op.state === "committed" ? !revision(proof.stateRevision) || !(proof.resultStatus >= 200 && proof.resultStatus < 300)
        : ![400, 403, 404, 409, 413, 422].includes(proof.resultStatus))) throw Error("Invalid retained photo receipt");
    if (receipts.has(op.id) && canonicalListOperationJson(receipts.get(op.id)) !== canonicalListOperationJson(proof)) throw Error("Conflicting retained photo receipts");
    receipts.set(op.id, proof);
  }
  // Stable certificate serialization, not the operation's execution order.
  return [...receipts.values()].sort((a, b) => a.operation.id.localeCompare(b.operation.id));
}

// localStorage enumeration is not a transaction. Retry a changing scan rather
// than interpreting a mixture of pre/post-compaction keys as corruption.
// This is a stable observation, NOT a CAS or a lock against subsequent writes.
export function readStablePersonalEntries(storage, prefix) {
  const scan = () => {
    const entries = new Map();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) entries.set(key, storage.getItem(key));
    }
    return entries;
  };
  let before = scan();
  for (let attempt = 0; attempt < 4; attempt++) {
    const after = scan();
    if (before.size === after.size && [...before].every(([key, value]) => value !== null && after.get(key) === value)) return after;
    before = after;
  }
  throw Error("Journal changed during observation");
}

// Checkpoints are immutable certificates of an already confirmed action.
// Combine same-head certificates by server revision, never by date, key order
// or a browser clock. Retired IDs are deliberately retained: a suspended tab
// can publish an old certificate long after its payloads were cleaned up.
export function readPersonalCheckpoints(entries, prefix) {
  const checkpoints = new Map();
  for (const [key, value] of entries) {
    const suffix = key.slice(prefix.length);
    if (suffix !== "anchor" && !suffix.startsWith("checkpoint:")) continue;
    if (suffix !== "anchor" && !uuid(suffix.slice(11))) throw Error("Invalid checkpoint key");
    const entry = JSON.parse(value);
    if (!entry || entry.version !== 1 || !uuid(entry.operationId) || !revision(entry.generation)
      || !revision(entry.stateRevision) || !Array.isArray(entry.retired)
      || !entry.retired.every(id => uuid(id) && id !== entry.operationId)
      || new Set(entry.retired).size !== entry.retired.length) throw Error("Invalid checkpoint");
    if (entry.baseline && (!revision(entry.baseline.stateRevision)
      || entry.baseline.stateRevision < entry.stateRevision || !entry.baseline.payload
      || !Array.isArray(entry.baseline.snapshotPatch))) throw Error("Invalid baseline");
    if (entry.confirmation && (!entry.baseline || entry.confirmation.historicalOnly !== true
      || entry.confirmation.operation?.state !== "committed" || entry.confirmation.operation.id !== entry.operationId
      || entry.confirmation.stateRevision !== entry.stateRevision
      || !(entry.confirmation.resultStatus >= 200 && entry.confirmation.resultStatus < 300))) throw Error("Invalid inline confirmation");
    if (entry.photoReceipts !== undefined) {
      if (!Array.isArray(entry.photoReceipts) || mergePersonalPhotoReceipts(entry.photoReceipts).length !== entry.photoReceipts.length
        || entry.photoReceipts.some(proof => proof.operation.id !== entry.operationId && !entry.retired.includes(proof.operation.id)
          || proof.stateRevision !== null && proof.stateRevision !== undefined && (!revision(proof.stateRevision) || proof.stateRevision > entry.stateRevision))) throw Error("Unrelated retained photo receipt");
    }
    checkpoints.set(key, entry);
  }
  if (!checkpoints.size) return { anchor: null, checkpoints };
  const groups = new Map();
  const baselines = new Map();
  let latestBaseline = null;
  for (const checkpoint of checkpoints.values()) {
    if (checkpoint.baseline) {
      const revision = checkpoint.baseline.stateRevision;
      const payload = canonicalListOperationJson(checkpoint.baseline.payload);
      if (baselines.has(revision) && baselines.get(revision) !== payload) throw Error("Inconsistent baseline revision");
      baselines.set(revision, payload);
      if (!latestBaseline || revision > latestBaseline.stateRevision) latestBaseline = checkpoint.baseline;
    }
    const previous = groups.get(checkpoint.operationId);
    if (!previous) { groups.set(checkpoint.operationId, { ...checkpoint, retired: [...checkpoint.retired] }); continue; }
    if (previous.generation !== checkpoint.generation || previous.stateRevision !== checkpoint.stateRevision) throw Error("Inconsistent confirmation");
    if (checkpoint.confirmation) {
      if (previous.confirmation && canonicalListOperationJson(previous.confirmation) !== canonicalListOperationJson(checkpoint.confirmation)) throw Error("Inconsistent inline confirmation");
      previous.confirmation = checkpoint.confirmation;
    }
    const baseline = checkpoint.baseline;
    if (baseline && (!previous.baseline || baseline.stateRevision > previous.baseline.stateRevision)) previous.baseline = baseline;
    previous.retired = [...new Set([...previous.retired, ...checkpoint.retired])];
    const photoReceipts = mergePersonalPhotoReceipts(previous.photoReceipts, checkpoint.photoReceipts);
    if (photoReceipts.length) previous.photoReceipts = photoReceipts;
  }
  const ordered = [...groups.values()].sort((a, b) => b.generation - a.generation);
  const anchor = ordered[0];
  const retired = new Set(anchor.retired);
  for (const earlier of ordered.slice(1)) {
    // Generation alone is not evidence that one branch superseded another.
    if (earlier.generation >= anchor.generation || earlier.stateRevision >= anchor.stateRevision
      || !retired.has(earlier.operationId) || earlier.retired.includes(anchor.operationId)) throw Error("Unrelated checkpoint branches");
    for (const id of earlier.retired) retired.add(id);
  }
  const photoReceipts = mergePersonalPhotoReceipts(...ordered.map(entry => entry.photoReceipts));
  // A refresh prepared against an older local head can still describe a later
  // SERVER state than the newest local receipt. Local generation cannot erase
  // that knowledge. Carry it forward only after proving the heads are related.
  return { anchor: { ...anchor, retired: [...retired],
    ...(photoReceipts.length ? { photoReceipts } : {}),
    ...(latestBaseline?.stateRevision >= anchor.stateRevision ? { baseline: latestBaseline } : {}) }, checkpoints };
}

export function publishPersonalCheckpoint(storage, prefix, checkpoint) {
  const key = `${prefix}checkpoint:${crypto.randomUUID()}`;
  if (storage.getItem(key) !== null) throw Error("Checkpoint ID collision");
  storage.setItem(key, JSON.stringify(checkpoint));
  return key;
}

export function retireObservedPersonalCheckpoints(storage, checkpoints, prefix) {
  for (const key of checkpoints.keys()) {
    // Legacy singleton is read-only: removing it after getItem would itself
    // race an old writer. Never scan again and delete unknown new certificates.
    if (key === `${prefix}anchor`) continue;
    try { storage.removeItem(key); } catch { /* A later compaction can retry. */ }
  }
}
