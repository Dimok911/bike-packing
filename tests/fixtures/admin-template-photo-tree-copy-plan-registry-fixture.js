import assert from "node:assert/strict";
import { treeCopyClientFixture, copy } from "./admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoTreeCopyEditorSnapshot } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { createAdminTemplatePhotoTreeCopyAdmission } from "../../src/sync/admin-template-photo-tree-copy-admission.js";
import { assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";

export const planPrefix = "bike-packing-admin-save-plans-v1:";
export async function treePlanRegistryFixture(options = {}) {
  const f = await treeCopyClientFixture(options), held = new Set(), tails = new Map(), lockEvents = [], ordinaryCalls = [], captureCalls = [];
  const locks = { async request(name, task) {
    const prior = tails.get(name) || Promise.resolve(); let release;
    const done = new Promise(resolve => { release = resolve; }); tails.set(name, done); await prior;
    assert.equal(held.has(name), false); held.add(name); lockEvents.push(["enter", name]);
    try { return await task(); } finally { held.delete(name); lockEvents.push(["leave", name]); release(); if (tails.get(name) === done) tails.delete(name); }
  } };
  const bindings = [f.binding, { ...f.binding, listId: f.intent.body.photoCopy.source.listId, itemKey: f.intent.body.photoCopy.source.itemKey }];
  const namespace = copy(f.record.snapshot), policy = { pending: false, afterCapture: null, stop: false }; let depth = 0;
  // Explicit fixture application policy. Production inventory/namespace
  // adapters are separate; the genuine lease helper and admission runner run here.
  const scope = kind => async (proof, task) => {
    proof.assertCurrent(); assertAdminTemplateCaptureLease(proof.captureLease, bindings);
    assert.deepEqual(proof.record, await f.store.read(f.id)); proof.assertCurrent();
    const snapshot = canonical(namespace); let active = true;
    const check = () => { assert.ok(active); proof.assertCurrent(); assert.equal(policy.pending, false); assert.equal(canonical(namespace), snapshot); };
    depth++; f.admission.active = true;
    try { return await task({ kind, bindings: proof.bindings, recordIntentHash: proof.record.intentHash, assertCurrent: check }); }
    finally { active = false; depth--; f.admission.active = depth > 0; }
  };
  const admission = createAdminTemplatePhotoTreeCopyAdmission({ binding: f.binding, store: f.store, getContext: () => f.current, locks,
    withInventory: scope("admin-template-photo-tree-copy-inventory-v1"), withNamespaces: scope("admin-template-photo-tree-copy-namespaces-v1") });
  const ordinary = Object.fromEntries(["capture", "read", "run", "cancel", "inspect"].map(name => [name, () => { ordinaryCalls.push(name); throw Error("Wrong client"); }]));
  const request = () => ({ operationId: f.id, body: copy(f.record.action.body), editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const make = (session = null, extra = {}) => {
    const treeClient = f.make({ locks, getContext: session?.getContext || (() => f.current), withDispatchAdmission: session?.withDispatchAdmission || null }).client;
    const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: session?.getContext || (() => f.current), client: ordinary,
      locks, storage: f.storage, enabled: true, photoTreeCopyEnabled: true, photoTreeCopyStore: f.store, photoTreeCopyClient: treeClient,
      shouldCancel: () => policy.stop,
      assertCaptureAllowed: async ({ plan, captureLease, guard }) => {
        guard(); assertAdminTemplateCaptureLease(captureLease, plan.version === 9 ? bindings : [f.binding]); captureCalls.push(plan.id);
        if (policy.pending) throw Error("Pending independent writer"); await policy.afterCapture?.(); guard();
      }, ...extra });
    return { plans, treeClient };
  };
  const session = (task, extra = {}) => admission.run(f.id, async value => task({ ...make(value, extra), ...value }));
  const capture = extra => session(async ({ plans, captureLease }) => plans.capturePhotoTreeCopy(request(), { captureLease }), extra);
  const run = extra => session(async ({ plans, captureLease }) => plans.run(f.id, { captureLease }), extra);
  const rows = () => [...f.values.keys()].filter(key => key.startsWith(planPrefix));
  return { ...f, locks, held, lockEvents, ordinaryCalls, captureCalls, bindings, namespace, policy, admission, request, makeRegistry: make, session, capture, run, planRows: rows };
}
