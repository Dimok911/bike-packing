import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { hydrateCausalAdminTemplateDrafts } from "../../src/public/admin-template-causal-hydration.js";

function boundaries(f) {
  const sharedId = f.binding.itemKey.slice("shared-layout:".length), messages = [];
  const record = { publicTemplateKind: "shared-layout", sharedId, published: false, visibility: "private", adminPayloadEndpoint: "/old" };
  const forbidden = () => assert.fail("A reserved target must not be prepared or materialized");
  const app = f.build({ names: ["findAdminTemplatePhotoWholeCopyTargetReservation", "assertAdminTemplatePhotoWholeCopyTargetAvailable",
    "refreshAdminTemplateDrafts", "openCausalAdminTemplate"], deps: {
    currentUser: { id: f.current.actorId }, canOpenAdminPublishedEdit: () => true, isForcedOffline: () => false,
    hydrateCausalAdminTemplateDrafts, adminTemplateBinding: () => f.binding, LIST_API_TIMEOUT_MS: 1000,
    apiFetch: async () => ({ lists: [record] }), normalizeAdminTemplateHistoryRecords: value => value,
    adminTemplateHistoryRecords: [], materializeCausalAdminTemplate: forbidden, rememberAdminTemplateSourceBaseline: forbidden,
    persistStateSnapshot: forbidden, reportAdminTemplateSaveError: error => messages.push(error.message), showToast: () => {},
  } });
  return { app, messages, target: { type: "shared", sharedId } };
}
const off = f => { for (const key of ["whole", "copy", "create", "append"]) f.flags[key] = false; };

test("actual background hydration and catalog open preserve an IDB-only reserved target with writers OFF", async () => {
  const f = await wholeAppRunnerFixture(); f.values.delete(f.planKey); off(f);
  const { app, messages, target } = boundaries(f), before = structuredClone(f.state), rows = structuredClone([...f.idb.rows()]);
  assert.equal((await app.findAdminTemplatePhotoWholeCopyTargetReservation(f.binding)).action.operationId, f.id);
  assert.equal(await app.refreshAdminTemplateDrafts(), 0);
  assert.equal(await app.openCausalAdminTemplate(target), null);
  assert.match(messages[0], /незавершённому копированию/);
  assert.deepEqual(f.state, before); assert.deepEqual([...f.idb.rows()], rows);
  assert.equal(f.values.has(f.planKey), false); assert.equal(f.server.calls.length, 0);
});

test("committed but unapplied target stays reserved; fully proved accepted target keeps its existing local ID", async () => {
  const f = await wholeAppRunnerFixture(); f.values.set("mirror", JSON.stringify(f.state));
  const result = await f.run(); off(f); let app = boundaries(f).app;
  assert.ok(await app.findAdminTemplatePhotoWholeCopyTargetReservation(f.binding));
  assert.equal(await app.refreshAdminTemplateDrafts(), 0);
  await app.applyAdminTemplatePhotoWholeCopyFormResult(result);
  app = boundaries(f).app; const before = structuredClone(f.state), calls = f.server.calls.length;
  assert.equal(await app.findAdminTemplatePhotoWholeCopyTargetReservation(f.binding), null);
  assert.equal(await app.refreshAdminTemplateDrafts(), 0);
  assert.deepEqual(f.state, before); assert.ok(f.state.layouts[f.target.layoutId]); assert.equal(f.server.calls.length, calls);
});

test("real reservation discovery fails closed on context switch without changing retained records", async () => {
  const f = await wholeAppRunnerFixture(), { app } = boundaries(f), before = structuredClone(f.state);
  f.idb.controls.onGet = () => { f.current.generation = "other-route"; };
  await assert.rejects(app.findAdminTemplatePhotoWholeCopyTargetReservation(f.binding));
  assert.deepEqual(f.state, before); assert.equal(f.server.calls.length, 0);
});
