import { createHash } from "node:crypto";
import { treeCopyProjectionFixture } from "./admin-template-photo-tree-copy-projection-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { applyAdminTemplatePhotoTreeCopyResult } from "../../src/public/admin-template-photo-tree-copy-apply.js";
import { adminTemplatePhotoTreeCopyAcceptanceKey, readAdminTemplatePhotoTreeCopyAcceptance,
  inspectAdminTemplatePhotoTreeCopyAcceptanceCandidate } from "../../src/public/admin-template-photo-tree-copy-acceptance.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export async function seedTreeCopyAcceptanceFacts(f) {
  // Actual typed capture allocates no further IDs. The same explicitly synthetic
  // server stages/receipt as the real-projector fixture are then retained in its
  // journal; production provenance remains the client's HTTP proof boundary.
  await f.make().client.capture(f.record.action);
  const suffix = encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  const planKey = "bike-packing-admin-save-plans-v1:" + suffix, journalKey = "bike-packing-admin-photo-tree-copy-commands-v1:" + suffix;
  f.values.set(planKey, canonical({ version: 1, plan: f.plan, digest: hash(f.plan), cancelRequested: false }));
  const journal = JSON.parse(f.values.get(journalKey));
  f.values.set(journalKey, canonical({ ...journal, stageReceipts: copy(f.stages), receipt: copy(f.receipt), dispatched: true }));
  return { planKey, journalKey };
}
export async function treeCopyAcceptanceFixture() {
  const f = await treeCopyProjectionFixture(), pointers = await seedTreeCopyAcceptanceFacts(f);
  const key = "acceptance-test-private-mirror", acceptanceKey = adminTemplatePhotoTreeCopyAcceptanceKey(f.binding, f.id);
  const hooks = { get: null, set: null }, writes = [], values = f.values;
  values.set(key, JSON.stringify(f.state));
  const storage = { getItem(name) { hooks.get?.(name); return values.get(name) ?? null; },
    setItem(name, value) { writes.push([name, value]); if (hooks.set) hooks.set(name, value); else values.set(name, value); } };
  const mirrorContext = { storage, key, scopeKey: `id:${f.binding.actorId}` };
  const input = { plan: f.plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages),
    getState: () => f.state, getContext: () => f.current, getMirrorContext: () => mirrorContext };
  const readInput = { binding: f.binding, operationId: f.id, store: f.store, getContext: input.getContext, getMirrorContext: input.getMirrorContext };
  const pending = () => {
    const layout = f.state.layouts[f.record.snapshot.target.layoutId];
    layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoTreeCopyPending: f.id };
    layout.templateDraftSyncPending = true;
  };
  return Object.assign(f, pointers, { key, acceptanceKey, hooks, writes, storage, mirrorContext, input, readInput, pending,
    mirror: () => JSON.parse(values.get(key)), run: (guard = () => {}) => applyAdminTemplatePhotoTreeCopyResult(input, guard),
    read: (guard = () => {}) => readAdminTemplatePhotoTreeCopyAcceptance(readInput, guard),
    candidate: (guard = () => {}) => inspectAdminTemplatePhotoTreeCopyAcceptanceCandidate(readInput, guard) });
}
