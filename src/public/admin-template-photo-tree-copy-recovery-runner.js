import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoTreeCopyPlanRecord } from "../sync/admin-template-photo-tree-copy-save-plan.js";
import { validateAdminTemplatePhotoTreeCopyStageReceipt, validateAdminTemplatePhotoTreeCopyStages,
  validateAdminTemplatePhotoTreeCopyReceipt } from "../sync/admin-template-photo-tree-copy-receipt.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../sync/admin-template-capture-lease.js";

const clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = code => { throw Object.assign(Error("Сохранённая копия дерева требует повторной сверки."),
  { code: `admin-template-photo-tree-copy-recovery-${code}`, isAdminTemplateBlocked: true }); };
const sync = value => {
  if (value?.then) { Promise.resolve(value).catch(() => {}); fail("async-authority"); }
  return value;
};
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const parse = text => {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 12 * 1024 * 1024) fail("journal");
  const value = JSON.parse(text); if (canonical(value) !== text) fail("journal"); return value;
};

// BikePacking recovery of an EXISTING V9 only. The app fixes transport and flags
// in createClient's closure; this runner grants neither business dispatch nor
// namespace/adoption authority. It acquires both genuine common locks BEFORE
// any client command lock. Do not call it while holding any of those locks.
// read is local-only; inspect uses GET; cancel is explicit and may send only the
// original cancellation. No capture, optimistic projection, stage retirement or
// V8 stop exclusion is supplied. A terminal receipt is a fact, not adoption.
export function createAdminTemplatePhotoTreeCopyRecoveryRunner({ binding, layoutId, getContext, store, plans, createClient,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks } = {}) {
  binding = Object.freeze(adminTemplatePhotoActionBinding(binding));
  if (typeof layoutId !== "string" || !layoutId || typeof getContext !== "function" || typeof createClient !== "function"
    || typeof store?.read !== "function" || !same(store.binding, binding) || typeof plans?.read !== "function"
    || typeof storage?.getItem !== "function" || typeof locks?.request !== "function") fail("dependencies");
  const suffix = encodeURIComponent(canonical(binding)) + ":";
  const planPrefix = "bike-packing-admin-save-plans-v1:" + suffix;
  const journalPrefix = "bike-packing-admin-photo-tree-copy-commands-v1:" + suffix;
  const context = () => {
    const value = sync(getContext());
    if (!value || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(key => value[key] !== binding[key])) fail("context");
    return clone(value);
  };
  const execute = async (operationId, mode) => {
    if (!validTemplateOperationId(operationId)) fail("operation");
    // Capture the context and exact pointer synchronously before the first await.
    const initial = context(), planKey = planPrefix + operationId, planText = storage.getItem(planKey), saved = parse(planText);
    if (!exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1
      || saved.cancelRequested !== false || saved.plan?.version !== 9 || saved.plan.id !== operationId
      || !same(saved.plan.binding, binding)) fail("plan");
    let active = true;
    const baseGuard = () => {
      if (!active || !same(context(), initial) || !same(store.binding, binding) || storage.getItem(planKey) !== planText
        || !same(context(), initial)) fail("context-or-plan");
    };
    const prove = async guard => {
      guard(); const row = await plans.read(operationId); guard();
      if (!same(row, saved) || saved.digest !== await digest(saved.plan)) fail("plan");
      guard(); const record = await assertAdminTemplatePhotoTreeCopyPlanRecord(saved.plan, store, guard); guard();
      if (record.snapshot.target.layoutId !== layoutId || !same(record.binding, binding)) fail("target");
      return record;
    };
    try {
      baseGuard(); const first = await prove(baseGuard); baseGuard();
      const source = first.action.body.photoCopy.source;
      const bindings = [binding, adminTemplatePhotoActionBinding({ ...binding, listId: source.listId, itemKey: source.itemKey })];
      return await withAdminTemplateCapture({ bindings, locks }, async captureLease => {
        const guard = () => { baseGuard(); assertAdminTemplateCaptureLease(captureLease, bindings); };
        const record = await prove(guard); guard(); if (!same(record, first)) fail("record-changed");
        const intent = saved.plan.operations[0], { id: _id, ...encoded } = intent;
        const payloadDigest = await digest(encoded); guard();
        const assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
        let cancellationActive = false;
        const withCancellationAdmission = async (requested, work) => {
          guard();
          if (cancellationActive || typeof work !== "function" || !exact(requested, ["intent", "recordIntentHash", "assertCurrent"])
            || !same(requested.intent, intent) || requested.recordIntentHash !== record.intentHash
            || typeof requested.assertCurrent !== "function") fail("cancellation-admission");
          const requestedGuard = requested.assertCurrent.bind(requested);
          let scopeActive = true; cancellationActive = true;
          const assertCurrent = () => {
            if (!scopeActive) fail("scope-ended");
            guard(); if (sync(requestedGuard()) === false) fail("cancellation-admission"); guard();
          };
          try {
            assertCurrent(); const current = await prove(assertCurrent); assertCurrent();
            if (!same(current, record)) fail("record-changed");
            const result = await work(Object.freeze({ assertCurrent })); assertCurrent(); return result;
          } finally { scopeActive = false; cancellationActive = false; }
        };
        const client = sync(createClient({ binding, store, storage, locks,
          getContext: () => { guard(); return context(); }, withCancellationAdmission }));
        guard();
        if (!client || !same(client.binding, binding) || typeof client.read !== "function"
          || mode !== "read" && typeof client[mode] !== "function") fail("client");
        const readJournal = async () => {
          guard(); const text = storage.getItem(journalPrefix + operationId), expected = parse(text); guard();
          // The journal may legitimately advance DURING execute. Freeze its raw
          // bytes only for each local proof, never across cancellation/settlement.
          const check = () => { guard(); if (storage.getItem(journalPrefix + operationId) !== text) fail("journal-changed"); guard(); };
          const raw = await client.read(operationId); check();
          if (!same(raw, expected)) fail("journal");
          const journal = clone(raw), keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
          if (!(exact(journal, keys) || exact(journal, [...keys, "cancelRequested"]))
            || Object.hasOwn(journal, "cancelRequested") && typeof journal.cancelRequested !== "boolean"
            || journal.version !== 1 || journal.kind !== "admin-template-photo-tree-copy" || !same(journal.intent, intent)
            || journal.recordIntentHash !== record.intentHash || journal.payloadDigest !== payloadDigest || typeof journal.dispatched !== "boolean"
            || !Array.isArray(journal.stageReceipts) || journal.stageReceipts.length !== record.stages.length) fail("journal");
          for (const [index, receipt] of journal.stageReceipts.entries()) if (receipt !== null) {
            const valid = await validateAdminTemplatePhotoTreeCopyStageReceipt(receipt, { manifest: record.stages[index], assetDigest: assets[index].assetDigest }); check();
            if (!valid) fail("stage-receipt");
          }
          if (journal.dispatched && journal.stageReceipts.some(stage => stage === null)) fail("journal");
          if (journal.stageReceipts.every(stage => stage !== null)) {
            const valid = await validateAdminTemplatePhotoTreeCopyStages(intent, journal.stageReceipts); check(); if (!valid) fail("stages");
          }
          if (journal.receipt !== null) {
            const valid = await validateAdminTemplatePhotoTreeCopyReceipt(journal.receipt, { intent, payloadDigest, stageReceipts: journal.stageReceipts }); check();
            if (!valid) fail("receipt");
          }
          const current = await prove(check); check(); if (!same(current, record)) fail("record-changed");
          return journal;
        };
        let journal = await readJournal(); guard();
        if (mode !== "read") {
          const receipt = await client[mode](operationId); guard();
          journal = await readJournal(); guard();
          if (!same(receipt, journal.receipt) || mode === "cancel" && receipt === null) fail("receipt-readback");
        }
        guard(); return clone({ plan: saved.plan, record, receipt: journal.receipt, stageReceipts: journal.stageReceipts, journal });
      });
    } finally { active = false; }
  };
  return Object.freeze({ binding, read: id => execute(id, "read"), inspect: id => execute(id, "inspect"), cancel: id => execute(id, "cancel") });
}
