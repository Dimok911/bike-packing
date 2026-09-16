import { createHash } from "node:crypto";
import { wholeCopyClientFixture } from "./admin-template-photo-whole-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoWholeCopySavePlan, adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { prepareAdminTemplatePhotoWholeCopyProjection } from "../../src/public/admin-template-photo-whole-copy-projection.js";
import { adminTemplatePhotoWholeCopyAcceptanceKey, prepareAdminTemplatePhotoWholeCopyAcceptance,
  readAdminTemplatePhotoWholeCopyAcceptance, inspectAdminTemplatePhotoWholeCopyAcceptanceCandidate } from "../../src/public/admin-template-photo-whole-copy-acceptance.js";

export const copy = structuredClone;
export const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export async function seedWholeCopyAcceptanceFacts(f) {
  await f.make().client.capture(f.record.action);
  const suffix = encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  const planKey = "bike-packing-admin-save-plans-v1:" + suffix, journalKey = "bike-packing-admin-photo-whole-copy-commands-v1:" + suffix;
  f.values.set(planKey, canonical({ version: 1, plan: f.plan, digest: hash(f.plan), cancelRequested: false }));
  const journal = JSON.parse(f.values.get(journalKey));
  // Synthetic server fixture receipts, retained behind actual typed capture.
  // No new POST, live application, stage release or acceptance is implied.
  f.values.set(journalKey, canonical({ ...journal, stageReceipts: copy(f.stages), receipt: copy(f.receipt), dispatched: true }));
  return { planKey, journalKey };
}
export async function wholeCopyAcceptanceFixture() {
  const f = await wholeCopyClientFixture();
  f.plan = adminTemplatePhotoWholeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const pointers = await seedWholeCopyAcceptanceFacts(f);
  const { targetSnapshot } = await prepareAdminTemplatePhotoWholeCopyProjection({ plan: f.plan, store: f.store, receipt: f.receipt, stageReceipts: f.stages }, () => {});
  const state = copy(f.record.snapshot.source.beforeState), targetId = targetSnapshot.layoutId;
  state.items.private = { id: "private", name: "Unrelated" };
  const key = "whole-acceptance-private-mirror", acceptanceKey = adminTemplatePhotoWholeCopyAcceptanceKey(f.binding, f.id);
  const hooks = { get: null, set: null }, writes = [], values = f.values;
  values.set(key, JSON.stringify(state));
  const storage = { getItem(name) { hooks.get?.(name); return values.get(name) ?? null; },
    setItem(name, value) { writes.push([name, value]); if (hooks.set) hooks.set(name, value); else values.set(name, value); } };
  const mirrorContext = { storage, key, scopeKey: `id:${f.binding.actorId}` };
  const input = { plan: f.plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages), targetSnapshot,
    getContext: () => f.current, getMirrorContext: () => mirrorContext };
  const readInput = { binding: f.binding, operationId: f.id, store: f.store, getContext: input.getContext, getMirrorContext: input.getMirrorContext };
  const installMirror = () => {
    const mirror = JSON.parse(values.get(key));
    for (const type of ["layouts", "items", "containers"]) Object.assign(mirror[type], copy(targetSnapshot.beforeState[type]));
    values.set(key, JSON.stringify(mirror));
  };
  return Object.assign(f, pointers, { state, targetId, targetSnapshot, key, acceptanceKey, hooks, writes, storage, mirrorContext, input, readInput,
    mirror: () => JSON.parse(values.get(key)), installMirror,
    prepare: (guard = () => {}) => prepareAdminTemplatePhotoWholeCopyAcceptance(input, guard),
    read: (guard = () => {}) => readAdminTemplatePhotoWholeCopyAcceptance(readInput, guard),
    candidate: (guard = () => {}) => inspectAdminTemplatePhotoWholeCopyAcceptanceCandidate(readInput, guard) });
}
