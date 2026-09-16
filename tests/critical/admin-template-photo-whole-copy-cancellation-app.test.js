import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { commandPrefix } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoWholeCopyParentKeys } from "../../src/sync/admin-template-photo-whole-copy-parent-fence.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
const copy = structuredClone;
const off = f => { for (const key of ["whole", "copy", "create", "append"]) f.flags[key] = false; };
const journal = f => JSON.parse(f.values.get(commandPrefix + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id));
async function queued() {
  const f = await wholeAppRunnerFixture();
  await f.make().client.capture(f.record.action); f.values.set("mirror", JSON.stringify(f.state)); return f;
}

test("actual whole recovery cancels the original copy with write gates OFF and both common leases", async () => {
  const f = await queued(); off(f);
  f.state.layouts[f.source.layoutId].name += " later source change";
  const before = copy(f.state), app = f.build(), recovery = await app.prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  assert.equal((await recovery.inspect(false)).canStop, true);
  f.controls.afterBegin = path => {
    assert.ok(path.endsWith("/cancel")); assert.equal(f.held.size, 3);
    assert.ok(f.held.has("bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(f.source.ownerMap.binding)));
    assert.ok(f.held.has("bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(f.binding)));
  };
  const stopped = await recovery.stop();
  assert.equal(stopped.stopped, true); assert.equal(stopped.canResume, false); assert.equal(stopped.canStop, false);
  assert.equal(stopped.operations[0].id, f.id); assert.equal(f.server.cancelPosts.length, 1);
  assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.stagePosts.length, 0);
  assert.equal(f.fences.length, 1); assert.deepEqual(f.state, before); assert.equal(f.idb.rows().size, 1);
  assert.equal(f.held.size, 0); assert.ok(f.scopes.length > 0);
  for (const scope of f.scopes) assert.throws(() => scope.assertCurrent());
  assert.equal(await app.findAdminTemplatePhotoWholeCopyFormRecord(f.layoutId), null);
  const writers = f.build({ names: ["assertAdminTemplateCopyCaptureAllowed"] }), binding = f.source.ownerMap.binding;
  const next = () => ({ operationId: crypto.randomUUID(), base: copy(f.record.action.body.source.base), exists: true, visibility: "private",
    payload: { items: { changed: { id: "changed", name: "Source edit after cancelled copy" } } },
    metadata: { title: "Source edit", description: "", language: "en" }, published: false });
  const capture = input => withAdminTemplateCapture({ bindings: [binding], locks: f.locks }, captureLease =>
    writers.adminTemplatePlansFor(binding, f.layoutId).capture(input, { captureLease }));
  const nextSave = next(); assert.equal((await capture(nextSave)).plan.id, nextSave.operationId);
  const fenceKey = adminTemplatePhotoWholeCopyParentKeys(f.binding, f.id).certificate, fence = f.values.get(fenceKey);
  f.values.delete(fenceKey); await assert.rejects(capture(next()));
  assert.equal((await app.findAdminTemplatePhotoWholeCopyFormRecord(f.layoutId)).action.operationId, f.id);
  f.values.set(fenceKey, fence); assert.equal(f.server.parentPosts.length, 0);
});

test("lost stop ACK survives cold continuation without business POST or automatic repeated cancel", async () => {
  const f = await queued(), recovery = await f.build().prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  await recovery.inspect(false); f.controls.loseCancel = true; f.controls.hideParent = true;
  await assert.rejects(recovery.stop()); assert.equal(journal(f).cancelRequested, true);
  assert.equal((await recovery.inspect(false)).stopRequested, true);
  const start = f.server.calls.length;
  const cold = f.build({ deps: { administrativePhotoWholeCopyAttempts: new WeakMap() } });
  assert.equal((await cold.resumeAdminTemplatePhotoWholeCopyForm(f.layoutId, f.id)).state, "stopping");
  assert.ok(f.server.calls.slice(start).every(row => row.method === "GET"));
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.stagePosts.length, 0);
  f.controls.loseCancel = false; off(f);
  const again = await f.build().prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  assert.equal((await again.inspect(false)).canResume, true);
  const done = await again.resume();
  assert.equal(done.stopped, true); assert.equal(done.canResume, false); assert.equal(f.server.cancelPosts.length, 2);
  assert.deepEqual(f.server.cancelPosts[0], f.server.cancelPosts[1]);
  assert.equal(f.state.layouts[f.target.layoutId], undefined); assert.equal(f.held.size, 0);
});

test("server commit winning a whole-copy stop is applied and accepted without another copy", async () => {
  const f = await wholeAppRunnerFixture(); f.values.set("mirror", JSON.stringify(f.state));
  f.controls.loseParent = true; f.controls.hideParent = true; await assert.rejects(f.run());
  const app = f.build(), recovery = await app.prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  assert.equal((await recovery.inspect(false)).canStop, true); f.controls.hideParent = false; off(f);
  const committed = await recovery.stop();
  assert.equal(committed.committedCount, 1); assert.equal(committed.stopped, false); assert.equal(committed.canResume, true);
  assert.equal(journal(f).cancelRequested, true); assert.equal(f.server.cancelPosts.length, 0);
  const applied = await recovery.resume(); assert.equal(applied.applied, true); assert.equal(applied.canResume, false);
  assert.ok(f.state.layouts[f.target.layoutId]); assert.equal(await app.findAdminTemplatePhotoWholeCopyFormRecord(f.layoutId), null);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.held.size, 0);
  f.modeState.adminPublishedEditLayoutId = f.target.layoutId;
  const writers = f.build({ names: ["assertAdminTemplateCopyCaptureAllowed"] });
  const next = { operationId: crypto.randomUUID(), base: { stateRevision: 1 }, exists: true, visibility: "private",
    payload: { items: { changed: { id: "changed", name: "Target edit after commit wins stop" } } },
    metadata: { title: "Following edit", description: "", language: "en" }, published: false };
  const saved = await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    writers.adminTemplatePlansFor(f.binding, f.target.layoutId).capture(next, { captureLease }));
  assert.equal(saved.plan.id, next.operationId);
});

test("confirmed cancellation releases fresh source copy while preserving every old allocation and receipt", async () => {
  const f = await wholeAppRunnerFixture(); f.controls.unknownStage = true;
  await assert.rejects(f.run());
  const claims = copy([...f.idb.rows("stage-dispatches")]); assert.equal(claims.length, 1);
  const app = f.build(), recovery = await app.prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  await recovery.inspect(false); await recovery.stop();
  const previous = copy(await f.store.read(f.id)), oldPlan = f.values.get(f.planKey), oldJournal = copy(journal(f));
  f.state.layouts[f.source.layoutId].adminCausalSource.canonicalPayload = copy(f.record.action.body.photoCopy.sourcePayload);
  const input = { sourceLayoutId: f.source.layoutId, targetKind: "shared", metadata: copy(f.record.action.body.metadata) };
  const next = await app.prepareAndCaptureAdminTemplatePhotoWholeCopyForm(input, { isCurrent: () => true });
  assert.notEqual(next.plan.id, f.id); assert.notEqual(next.record.snapshot.target.layoutId, f.target.layoutId);
  assert.equal(f.idb.rows().size, 2); assert.deepEqual(await f.store.read(f.id), previous);
  assert.equal(f.values.get(f.planKey), oldPlan); assert.deepEqual(journal(f), oldJournal);
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.stagePosts.length, 1);
  assert.deepEqual([...f.idb.rows("stage-dispatches")], claims);
  assert.equal(f.state.layouts[f.target.layoutId], undefined); assert.equal(f.state.layouts[next.record.snapshot.target.layoutId], undefined);
  assert.equal(f.held.size, 0);
});

test("a retained V10 pointer changed after durable cancellation claim prevents its POST", async () => {
  const f = await queued(), recovery = await f.build().prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  await recovery.inspect(false); f.controls.afterBegin = () => f.values.set(f.planKey, f.values.get(f.planKey) + " ");
  await assert.rejects(recovery.stop());
  assert.equal(journal(f).cancelRequested, true); assert.equal(f.server.cancelPosts.length, 0);
  assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.held.size, 0);
});
