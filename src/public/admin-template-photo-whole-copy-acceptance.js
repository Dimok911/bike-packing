import { sameProtocolJson as same } from "../sync/protocol-json-equality.js";
import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { prepareAdminTemplatePhotoWholeCopyProjectionProof } from "./admin-template-photo-whole-copy-projection.js";

export const ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX = "bike-packing-admin-photo-whole-copy-accepted-v1:";
const kind = "admin-template-photo-whole-copy-accepted", collections = ["layouts", "items", "containers"];
const copy = value => JSON.parse(canonical(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const pause = code => { throw Object.assign(Error("Подтверждённая копия укладки ещё требует проверки принятия."),
  { code: `admin-template-photo-whole-copy-acceptance-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const result = fn();
  if (result?.then) { Promise.resolve(result).catch(() => {}); pause("async-authority"); }
  return result;
};
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const parse = raw => {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > 12 * 1024 * 1024) pause("journal");
  const value = JSON.parse(raw); if (canonical(value) !== raw) pause("journal"); return value;
};
export function adminTemplatePhotoWholeCopyAcceptanceKey(binding, operationId) {
  if (!validTemplateOperationId(operationId)) pause("operation");
  return ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX + encodeURIComponent(canonical(adminTemplatePhotoActionBinding(binding))) + ":" + operationId;
}
function namespace(state, layoutId) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) pause("mirror");
  const layout = state.layouts[layoutId];
  if (!plain(layout) || layout.id !== layoutId || !plain(layout.arrangement) || !Object.hasOwn(layout, "locations")
    || !Object.hasOwn(layout, "categories") || !Object.hasOwn(layout.arrangement, "packedItems")) pause("mirror");
  return { activeLayoutId: layoutId, layouts: { [layoutId]: layout },
    ...Object.fromEntries(["items", "containers"].map(type => [type, Object.fromEntries(Object.entries(state[type])
      .filter(([, row]) => row?.publicCatalogLayoutId === layoutId))])),
    locations: layout.locations, categories: layout.categories, packedItems: layout.arrangement.packedItems };
}
function scope(input, externalGuard) {
  const { store, getContext, getMirrorContext } = input, binding = freeze(adminTemplatePhotoActionBinding(input.binding));
  const operationId = input.operationId, key = adminTemplatePhotoWholeCopyAcceptanceKey(binding, operationId);
  if (typeof externalGuard !== "function" || typeof getContext !== "function" || typeof getMirrorContext !== "function"
    || typeof store?.read !== "function" || !same(store.binding, binding)) pause("dependencies");
  const context = () => {
    const value = sync(getContext);
    if (!plain(value) || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(field => value[field] !== binding[field])) pause("context");
    return value;
  };
  // Detach the initial context once. Each comparison still validates the full
  // current JSON value; no context observation is reused.
  const initial = freeze(copy(context())), mirror = sync(getMirrorContext);
  if (!exact(mirror, ["storage", "key", "scopeKey"]) || typeof mirror.key !== "string" || !mirror.key
    || mirror.scopeKey !== `id:${binding.actorId}` || typeof mirror.storage?.getItem !== "function") pause("mirror-context");
  const { storage, key: mirrorKey, scopeKey } = mirror;
  let batchReads = null;
  const localGuard = () => {
    const current = sync(getMirrorContext);
    if (!same(context(), initial) || !same(store.binding, binding) || !exact(current, ["storage", "key", "scopeKey"])
      || current.storage !== storage || current.key !== mirrorKey || current.scopeKey !== scopeKey) pause("context");
  };
  const guard = () => {
    if (!batchReads && sync(externalGuard) === false) pause("scope");
    localGuard();
  };
  const read = name => {
    guard(); const value = sync(() => storage.getItem(name)); guard();
    if (batchReads) {
      if (batchReads.has(name) && batchReads.get(name) !== value) pause("proof-changed");
      batchReads.set(name, value);
    }
    return value;
  };
  // A synchronous check has no await boundary inside it. Run the complete
  // external inventory guard around that block, rather than recursively for
  // every named read. Context checks and every actual storage read remain.
  // Re-read ALL observed rows after external callbacks, then check inventory
  // again. No observation or permission survives this invocation.
  const checkBatch = task => {
    if (batchReads) pause("guard-reentry");
    guard();
    const observed = new Map(); batchReads = observed;
    try { sync(task); } finally { batchReads = null; }
    guard();
    const readback = () => {
      for (const [name, raw] of observed) {
        localGuard(); const current = sync(() => storage.getItem(name)); localGuard();
        if (current !== raw) pause("proof-changed");
      }
    };
    readback(); guard(); readback();
  };
  guard(); return { binding, operationId, key, store, storage, mirrorKey, scopeKey, guard, read, checkBatch };
}
async function fullProof(s, extraGuard = () => {}) {
  const suffix = encodeURIComponent(canonical(s.binding)) + ":" + s.operationId;
  const planKey = "bike-packing-admin-save-plans-v1:" + suffix, journalKey = "bike-packing-admin-photo-whole-copy-commands-v1:" + suffix;
  const planText = s.read(planKey), journalText = s.read(journalKey), saved = parse(planText), journal = parse(journalText);
  const guard = () => s.checkBatch(() => {
    s.guard(); extraGuard();
    if (s.read(planKey) !== planText || s.read(journalKey) !== journalText) pause("proof-changed");
    extraGuard(); s.guard();
  });
  if (!exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1 || saved.cancelRequested !== false
    || saved.plan?.version !== 10 || saved.plan.id !== s.operationId || !same(saved.plan.binding, s.binding)) pause("plan");
  const planDigest = await digest(saved.plan); guard(); if (saved.digest !== planDigest) pause("plan");
  const keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
  if (!(exact(journal, keys) || exact(journal, [...keys, "cancelRequested"])) || journal.version !== 1
    || journal.kind !== "admin-template-photo-whole-copy" || typeof journal.dispatched !== "boolean"
    || Object.hasOwn(journal, "cancelRequested") && typeof journal.cancelRequested !== "boolean"
    || journal.recordIntentHash !== saved.plan.recordIntentHash || !same(journal.intent, saved.plan.operations[0])
    || journal.receipt?.operation?.state !== "committed") pause("journal");
  // Reconstruct from immutable historical source only. Current source and target
  // can legitimately have changed since acceptance; never substitute their
  // present state for the complete typed record and confirmed server result.
  const { record, payloadDigest, projection } = await prepareAdminTemplatePhotoWholeCopyProjectionProof({ plan: saved.plan, store: s.store,
    receipt: journal.receipt, stageReceipts: journal.stageReceipts }, guard); guard();
  if (journal.recordIntentHash !== record.intentHash || journal.payloadDigest !== payloadDigest) pause("journal");
  const { target } = record.snapshot;
  const terminal = Object.fromEntries(keys.filter(key => key !== "dispatched").map(key => [key, journal[key]]));
  // Availability is a current GET observation, not part of an immutable stage
  // receipt. Revalidate every exact wrapper above, but bind the ordered receipt
  // proofs so ready -> unavailable cannot erase accepted historical truth.
  terminal.stageReceipts = journal.stageReceipts.map(stage => stage.receipt);
  const terminalJournalDigest = await digest(terminal); guard();
  const targetSnapshotDigest = await digest(projection.targetSnapshot); guard();
  const acceptance = { version: 1, kind, binding: s.binding, operationId: s.operationId, layoutId: target.layoutId,
    scopeKey: s.scopeKey, mirrorKey: s.mirrorKey, recordIntentHash: record.intentHash, planDigest, terminalJournalDigest, targetSnapshotDigest };
  // Parsed rows and derived projection are private detached values. Freeze
  // those owned facts directly rather than serializing the complete copy again.
  return { ...freeze({ plan: saved.plan, record, journal, receipt: journal.receipt, stageReceipts: journal.stageReceipts,
    targetSnapshot: projection.targetSnapshot, acceptance }), assertCurrent: guard };
}
const readKeys = ["binding", "operationId", "store", "getContext", "getMirrorContext"];

// A dedicated local row survives ordinary state serialization. Its digests are
// commitments, not authority: every read re-proves the original typed record,
// exact V10 plan, full command journal, all stages/paths and committed projection.
// Caller must hold real admission/lease and keep its raw inventory guarded.
// No rejected/cancelled fact, parent fence or V8 UUID exclusion is accepted.
export async function readAdminTemplatePhotoWholeCopyAcceptance(input, externalGuard) {
  if (!exact(input, readKeys)) pause("dependencies");
  const s = scope(input, externalGuard), raw = s.read(s.key);
  if (raw === null) return null;
  const row = parse(raw), guard = () => { if (s.read(s.key) !== raw) pause("acceptance-changed"); };
  const proved = await fullProof(s, guard); proved.assertCurrent();
  if (!same(row, proved.acceptance)) pause("acceptance");
  // fullProof owns and deeply freezes these detached facts already.
  return Object.freeze(proved);
}

// Cold mirror-only interruption discovery. A candidate is NOT acceptance and
// can only be offered for finishing the original apply. Its scope expires with
// externalGuard; no lease, new writer permission or pending normalization arises.
export async function inspectAdminTemplatePhotoWholeCopyAcceptanceCandidate(input, externalGuard) {
  if (!exact(input, readKeys)) pause("dependencies");
  const s = scope(input, externalGuard), acceptanceText = s.read(s.key);
  const proved = await fullProof(s, () => { if (s.read(s.key) !== acceptanceText) pause("acceptance-changed"); });
  if (acceptanceText !== null && !same(parse(acceptanceText), proved.acceptance)) pause("acceptance");
  const raw = s.read(s.mirrorKey); if (typeof raw !== "string") pause("mirror");
  if (!same(namespace(JSON.parse(raw), proved.targetSnapshot.layoutId), proved.targetSnapshot.beforeState)) return null;
  const assertCurrent = () => { proved.assertCurrent(); if (s.read(s.mirrorKey) !== raw) pause("mirror-changed"); proved.assertCurrent(); };
  assertCurrent(); return Object.freeze({ ...proved, assertCurrent });
}

// Prepare before mirror mutation; persist is synchronous and can only be called
// on this fully proved closure. Confirmed mirror -> acceptance -> live merge.
// Failed readback does not acknowledge success or permit live apply. A physical
// successful write with a lost ACK is retained and re-proved on a cold retry.
export async function prepareAdminTemplatePhotoWholeCopyAcceptance(input, externalGuard) {
  const keys = ["plan", "store", "receipt", "stageReceipts", "targetSnapshot", "getContext", "getMirrorContext"];
  if (!exact(input, keys)) pause("dependencies");
  const frozen = copy({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts, targetSnapshot: input.targetSnapshot });
  const s = scope({ ...input, binding: frozen.plan.binding, operationId: frozen.plan.id }, externalGuard);
  if (typeof s.storage.setItem !== "function") pause("dependencies");
  let expected = s.read(s.key), active = true, used = false;
  const ownGuard = () => { if (!active || s.read(s.key) !== expected) pause("acceptance-changed"); };
  const proved = await fullProof(s, ownGuard); proved.assertCurrent();
  if (!same(frozen, { plan: proved.plan, receipt: proved.receipt, stageReceipts: proved.stageReceipts, targetSnapshot: proved.targetSnapshot })) pause("input");
  const text = canonical(proved.acceptance);
  if (expected !== null && expected !== text) pause("acceptance");
  const persist = () => {
    if (used) pause("used"); used = true;
    try {
      proved.assertCurrent(); const mirror = s.read(s.mirrorKey);
      if (typeof mirror !== "string" || !same(namespace(JSON.parse(mirror), proved.targetSnapshot.layoutId), proved.targetSnapshot.beforeState)) pause("mirror");
      proved.assertCurrent();
      if (s.read(s.mirrorKey) !== mirror) pause("mirror-changed"); proved.assertCurrent();
      if (expected === null) {
        // Change the expected own row only for this exact write; external app
        // inventory must also allow exactly this precomputed transition.
        expected = text; sync(() => s.storage.setItem(s.key, text));
      }
      if (s.read(s.key) !== text) pause("acceptance-readback");
      proved.assertCurrent(); if (s.read(s.mirrorKey) !== mirror) pause("mirror-changed"); proved.assertCurrent();
      return proved.acceptance;
    } catch (error) { active = false; throw error; }
  };
  return Object.freeze({ key: s.key, text, acceptance: proved.acceptance, targetSnapshot: proved.targetSnapshot,
    persist, assertCurrent: proved.assertCurrent });
}
