import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX } from "../../src/public/admin-template-photo-whole-copy-acceptance.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
const copy = structuredClone;
const cold = f => {
  const mirror = JSON.parse(f.values.get("mirror"));
  for (const key of Object.keys(f.state)) delete f.state[key]; Object.assign(f.state, mirror);
  return f.build({ deps: { administrativePhotoWholeCopyAttempts: new WeakMap() } });
};
const off = f => { for (const key of ["whole", "copy", "create", "append"]) f.flags[key] = false; };

test("existing copy entry routes confirmed catalogs with photos to the gated whole-copy form", async () => {
  const f = await wholeAppRunnerFixture(), source = f.state.layouts[f.source.layoutId];
  source.adminCausalSource.canonicalPayload = copy(f.record.action.body.photoCopy.sourcePayload);
  const calls = [], validateSelection = () => true;
  const app = f.build({ names: ["createCausalAdminTemplateCopy"], replace: {
    createCausalAdminTemplateWholeCopy: async (...args) => { calls.push(args); return "selected-new-layout"; }
  } });
  assert.equal(await app.createCausalAdminTemplateCopy(source, "Chosen title", { sourceKind: "shared", validateSelection }), "selected-new-layout");
  assert.deepEqual(calls, [[source, "Chosen title", { sourceKind: "shared", validateSelection }]]);
  assert.equal(f.server.calls.length, 0);
});

test("failed copy offers its retained source recovery without dispatching a second copy", async () => {
  const f = await wholeAppRunnerFixture(), source = f.state.layouts[f.source.layoutId], calls = [];
  source.adminCausalSource.canonicalPayload = copy(f.record.action.body.photoCopy.sourcePayload);
  const failure = Error("Lost response"), user = { id: f.current.actorId };
  const app = f.build({ names: ["createCausalAdminTemplateCopy"], deps: {
    currentUser: user, canOpenAdminPublishedEdit: () => true,
    refs: { layoutDialog: { close: () => calls.push("close") } },
    activateAdminPublishedLayout: id => { calls.push(id); return true; },
    showAdminTemplateRecovery: id => { calls.push(id); return "recovery"; }
  }, replace: { createCausalAdminTemplateWholeCopy: async () => { throw failure; } } });
  await assert.rejects(app.createCausalAdminTemplateCopy(source, "Another title", { sourceKind: "shared" }), error => error === failure);
  assert.equal(failure.savedCopyTitle, f.record.snapshot.target.metadata.title);
  assert.equal(await failure.recoverCopy(), "recovery");
  assert.deepEqual(calls, ["close", source.id, source.id]);
  user.id = "another-account";
  await assert.rejects(failure.recoverCopy(), /Контекст копирования изменился/);
  assert.equal(calls.length, 3);
  assert.equal(f.server.parentPosts.length, 0);
  assert.equal(f.server.stagePosts.length, 0);
});

test("actual whole cold recovery finishes acceptance after quota, preserves later edits and never reposts", async () => {
  const f = await wholeAppRunnerFixture(); f.values.set("mirror", JSON.stringify(f.state));
  const result = await f.run(), before = copy(f.state);
  f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX);
  await assert.rejects(f.build().applyAdminTemplatePhotoWholeCopyFormResult(result));
  assert.deepEqual(f.state, before);
  assert.ok(JSON.parse(f.values.get("mirror")).layouts[f.target.layoutId]);
  f.controls.rejectWrite = null; off(f); const app = cold(f), posts = f.server.parentPosts.length;
  // A later source edit is irrelevant to historical committed acceptance.
  f.state.layouts[f.source.layoutId].name += " newer source";
  f.values.set("mirror", JSON.stringify(f.state));
  const applied = await app.resumeAdminTemplatePhotoWholeCopyForm(f.layoutId, f.id);
  assert.equal(applied.state, "already-applied"); assert.equal(f.server.parentPosts.length, posts);
  const acceptedKey = [...f.values.keys()].find(key => key.startsWith(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX));
  assert.ok(acceptedKey); const originalAcceptance = f.values.get(acceptedKey);
  f.state.layouts[f.target.layoutId].name = "Later user title";
  f.values.set("mirror", JSON.stringify(f.state)); const later = copy(f.state);
  const again = await cold(f).resumeAdminTemplatePhotoWholeCopyForm(f.layoutId, f.id);
  assert.equal(again.state, "already-accepted"); assert.deepEqual(f.state, later);
  assert.equal(f.values.get(acceptedKey), originalAcceptance);
  assert.equal(await app.findAdminTemplatePhotoWholeCopyFormRecord(f.layoutId), null);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.held.size, 0);
});

test("actual whole lost ACK resumes with gates OFF by GET and applies/accepts the original target", async () => {
  const f = await wholeAppRunnerFixture(); f.values.set("mirror", JSON.stringify(f.state));
  f.controls.loseParent = true; f.controls.hideParent = true;
  await assert.rejects(f.run()); assert.equal(f.server.parentPosts.length, 1);
  f.controls.hideParent = false; off(f); const start = f.server.calls.length;
  const recovery = await cold(f).prepareAdminTemplatePhotoWholeCopyRecovery(f.layoutId);
  assert.equal((await recovery.inspect(false)).canResume, false);
  const facts = await recovery.inspect(true); assert.equal(facts.canResume, true); assert.equal(facts.canStop, false);
  const resumed = await recovery.resume();
  assert.equal(resumed.applied, true); assert.equal(resumed.canResume, false);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, f.record.stages.length);
  assert.ok(f.server.calls.length > start); assert.ok(f.server.calls.slice(start).every(row => row.method === "GET"));
  assert.ok([...f.values.keys()].some(key => key.startsWith(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX)));
  assert.equal(f.held.size, 0);
  await recovery.openResult();
  assert.equal(f.modeState.adminPublishedEditLayoutId, f.target.layoutId);
  assert.equal(f.server.parentPosts.length, 1);
});

test("existing whole-copy form continues its retained operation and activates only the accepted target", async () => {
  const f = await wholeAppRunnerFixture(); f.values.set("mirror", JSON.stringify(f.state));
  const app = f.build(), source = f.state.layouts[f.source.layoutId], title = f.record.snapshot.target.metadata.title;
  await assert.rejects(app.createCausalAdminTemplateWholeCopy(source, "Different selection", { sourceKind: "shared" }));
  assert.equal(f.server.parentPosts.length, 0);
  let formOpen = true;
  const progress = [];
  const id = await app.createCausalAdminTemplateWholeCopy(source, title, { sourceKind: "shared", validateSelection: () => formOpen,
    onProgress(value) { progress.push(value); formOpen = false; } });
  assert.equal(formOpen, false);
  assert.equal(progress.at(-1).phase, "confirming");
  assert.equal(id, f.target.layoutId); assert.equal(f.modeState.adminPublishedEditLayoutId, id);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.idb.rows().size, 1);
  assert.ok([...f.values.keys()].some(key => key.startsWith(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX)));
  const writers = f.build({ names: ["assertAdminTemplateCopyCaptureAllowed"] });
  const next = { operationId: crypto.randomUUID(), base: { stateRevision: 1 }, exists: true, visibility: "private",
    payload: { items: { edited: { id: "edited", name: "Following edit" } } },
    metadata: { title: "Following edit", description: "", language: "en" }, published: false };
  const captureNext = input => withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    writers.adminTemplatePlansFor(f.binding, f.target.layoutId).capture(input, { captureLease }));
  assert.equal((await captureNext(next)).plan.id, next.operationId);
  const acceptanceKey = [...f.values.keys()].find(key => key.startsWith(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ACCEPTANCE_PREFIX));
  const accepted = f.values.get(acceptanceKey); f.values.delete(acceptanceKey);
  await assert.rejects(captureNext({ ...next, operationId: crypto.randomUUID() }));
  f.values.set(acceptanceKey, accepted); assert.equal(f.server.parentPosts.length, 1);
});
