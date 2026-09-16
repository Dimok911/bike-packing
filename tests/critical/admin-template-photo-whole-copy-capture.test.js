import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { copy, commandPrefix } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const fresh = async () => {
  const f = await wholeAppRunnerFixture(); f.values.delete(f.planKey); f.idb.rows().clear();
  f.commandKey = commandPrefix + encodeURIComponent(canonical(f.binding)) + ":" + f.id;
  f.capture = (current = () => true) => f.build().captureAdminTemplatePhotoWholeCopyForm(f.record, current);
  return f;
};
const untouched = (f, before) => {
  assert.deepEqual(f.state, before); assert.equal(f.state.layouts[f.target.layoutId], undefined);
  assert.equal(f.server.calls.length, 0); assert.equal(f.held.size, 0);
};

test("whole form capture durably records exact selection without HTTP or target placeholder; repeated capture reuses IDs", async () => {
  const f = await fresh(), before = copy(f.state);
  assert.deepEqual(await f.capture(), f.plan);
  assert.deepEqual(await f.store.read(f.id), f.record);
  assert.deepEqual(JSON.parse(f.values.get(f.planKey)), f.row);
  const journal = f.values.get(f.commandKey);
  assert.equal(JSON.parse(journal).dispatched, false);
  assert.deepEqual(await f.capture(), f.plan);
  assert.equal(f.values.get(f.commandKey), journal); assert.equal(f.idb.rows().size, 1);
  untouched(f, before);
});

test("whole form capture quota preserves its record and resumes exactly after plan or journal write failure", async () => {
  for (const failAt of ["planKey", "commandKey"]) {
    const f = await fresh(), before = copy(f.state);
    f.controls.rejectWrite = key => key === f[failAt];
    await assert.rejects(f.capture());
    assert.deepEqual(await f.store.read(f.id), f.record);
    assert.equal(f.values.has(f.commandKey), false);
    assert.equal(f.values.has(f.planKey), failAt === "commandKey");
    untouched(f, before);
    f.controls.rejectWrite = null; assert.deepEqual(await f.capture(), f.plan);
    assert.equal(f.idb.rows().size, 1); untouched(f, before);
  }
});

test("whole form capture refuses failed IDB and all disabled prerequisite gates before retaining a plan", async () => {
  const f = await fresh(), before = copy(f.state);
  f.idb.controls.quota = true; await assert.rejects(f.capture());
  assert.equal(f.idb.rows().size, 0); assert.equal(f.values.has(f.planKey), false);
  f.idb.controls.quota = false;
  for (const flag of Object.keys(f.flags)) {
    f.flags[flag] = false; await assert.rejects(f.capture()); f.flags[flag] = true;
    assert.equal(f.idb.rows().size, 0); assert.equal(f.values.has(f.planKey), false);
  }
  untouched(f, before);
});

test("whole form capture stops changed source, allocated target and cancelled form before IDB capture", async () => {
  const f = await fresh(), before = copy(f.state);
  await assert.rejects(f.capture(() => false));
  f.state.layouts[f.target.layoutId] = { id: f.target.layoutId };
  await assert.rejects(f.capture()); delete f.state.layouts[f.target.layoutId];
  f.state.layouts[f.source.layoutId].name += " changed"; await assert.rejects(f.capture());
  f.state.layouts[f.source.layoutId].name = before.layouts[f.source.layoutId].name;
  assert.equal(f.idb.rows().size, 0); assert.equal(f.values.has(f.planKey), false); untouched(f, before);
});

test("whole form capture catches a source change after IDB commits and leaves its recoverable record", async () => {
  const f = await fresh(); let fired = false;
  f.idb.controls.onCommit = ({ mode, names }) => {
    if (mode === "readwrite" && names.includes("actions") && !fired) {
      fired = true; f.state.layouts[f.source.layoutId].name += " concurrent change";
    }
  };
  await assert.rejects(f.capture()); assert.equal(fired, true);
  assert.equal(f.values.has(f.planKey), false); assert.equal(f.values.has(f.commandKey), false);
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.server.calls.length, 0); assert.equal(f.held.size, 0);
});

test("whole form capture cannot admit a foreign target key appearing during plan persistence", async () => {
  const f = await fresh(), before = copy(f.state); let fired = false;
  const foreign = f.planKey.slice(0, -f.id.length) + crypto.randomUUID();
  f.controls.rejectWrite = key => {
    if (key === f.planKey && !fired) { fired = true; f.values.set(foreign, "independent target history"); }
    return false;
  };
  await assert.rejects(f.capture()); assert.equal(fired, true);
  assert.equal(f.values.get(foreign), "independent target history");
  assert.equal(f.values.has(f.commandKey), false); untouched(f, before);
});

test("actual whole form adapter coalesces rapid clicks and preserves chosen IDs after quota", async () => {
  const f = await fresh();
  f.state.layouts[f.source.layoutId].adminCausalSource.canonicalPayload = copy(f.record.action.body.photoCopy.sourcePayload);
  const before = copy(f.state), input = { sourceLayoutId: f.source.layoutId, targetKind: "shared", metadata: copy(f.record.action.body.metadata) };
  const app = f.build(), submit = () => app.prepareAndCaptureAdminTemplatePhotoWholeCopyForm(input, { isCurrent: () => true });
  f.controls.rejectWrite = () => true;
  await assert.rejects(submit()); assert.equal(f.idb.rows().size, 1);
  const retained = [...f.idb.rows().keys()];
  f.controls.rejectWrite = null;
  const [first, second] = await Promise.all([submit(), submit()]);
  assert.deepEqual(first, second); assert.notEqual(first, second);
  assert.deepEqual([...f.idb.rows().keys()], retained);
  assert.equal(first.record.action.operationId, first.plan.id);
  assert.equal(first.record.snapshot.source.layoutId, input.sourceLayoutId);
  assert.deepEqual(await submit(), first); untouched(f, before);
  input.metadata.title += " changed";
  await assert.rejects(submit()); assert.deepEqual([...f.idb.rows().keys()], retained);
});

test("actual whole form adapter does not allocate durable work when selection changes during preparation", async () => {
  const f = await fresh();
  f.state.layouts[f.source.layoutId].adminCausalSource.canonicalPayload = copy(f.record.action.body.photoCopy.sourcePayload);
  const before = copy(f.state), input = { sourceLayoutId: f.source.layoutId, targetKind: "demo", metadata: copy(f.record.action.body.metadata) };
  let current = true;
  const pending = f.build().prepareAndCaptureAdminTemplatePhotoWholeCopyForm(input, { isCurrent: () => current });
  current = false;
  await assert.rejects(pending); assert.equal(f.idb.rows().size, 0); assert.equal(f.values.size, 0); untouched(f, before);
});

test("actual whole capture to receipt to target-only apply survives quota and refuses a changed receipt", async () => {
  const f = await fresh(), before = copy(f.state);
  f.values.set("mirror", JSON.stringify(before));
  await f.capture(); const result = await f.run(), app = f.build();
  const wrong = copy(result); wrong.receipt.result.payload.stateRevision++;
  await assert.rejects(app.applyAdminTemplatePhotoWholeCopyFormResult(wrong));
  assert.deepEqual(f.state, before);
  f.controls.rejectWrite = key => key === "mirror";
  await assert.rejects(app.applyAdminTemplatePhotoWholeCopyFormResult(result));
  assert.deepEqual(f.state, before);
  f.controls.rejectWrite = null;
  const sourceRef = f.state.layouts[f.source.layoutId];
  const applied = await app.applyAdminTemplatePhotoWholeCopyFormResult(result);
  assert.equal(applied.layoutId, f.target.layoutId); assert.equal(applied.state, "applied");
  assert.equal(f.state.layouts[f.source.layoutId], sourceRef);
  assert.deepEqual(f.state.layouts[f.source.layoutId], before.layouts[f.source.layoutId]);
  assert.deepEqual(f.state.items.privateItem, before.items.privateItem);
  assert.deepEqual(JSON.parse(f.values.get("mirror")).layouts[f.target.layoutId], f.state.layouts[f.target.layoutId]);
  assert.equal(f.state.activeLayoutId, before.activeLayoutId);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.held.size, 0);
  const appliedState = copy(f.state);
  assert.equal((await app.applyAdminTemplatePhotoWholeCopyFormResult(result)).state, "already-accepted");
  assert.deepEqual(f.state, appliedState); assert.equal(f.server.parentPosts.length, 1);
});

test("cold whole recovery discovers record-only capture without form memory and completes original IDs", async () => {
  const f = await fresh(), before = copy(f.state);
  f.controls.rejectWrite = key => key === f.planKey;
  await assert.rejects(f.capture()); assert.equal(f.values.size, 0); assert.equal(f.idb.rows().size, 1);
  const cold = f.build({ deps: { administrativePhotoWholeCopyAttempts: new WeakMap() } });
  assert.deepEqual(await cold.findAdminTemplatePhotoWholeCopyFormRecord(f.source.layoutId), f.record);
  await assert.rejects(cold.resumeAdminTemplatePhotoWholeCopyCapture(f.source.layoutId, crypto.randomUUID(), () => true));
  assert.equal(f.values.size, 0); assert.equal(f.idb.rows().size, 1);
  f.controls.rejectWrite = null;
  const resumed = await cold.resumeAdminTemplatePhotoWholeCopyCapture(f.source.layoutId, f.id, () => true);
  assert.deepEqual(resumed, { plan: f.plan, record: f.record });
  assert.deepEqual(JSON.parse(f.values.get(f.planKey)), f.row); assert.equal(f.idb.rows().size, 1);
  untouched(f, before);
});
