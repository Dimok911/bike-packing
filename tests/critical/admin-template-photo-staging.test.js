import test from "node:test";
import assert from "node:assert/strict";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminPhotoStagingFixture as fixture, copy } from "../fixtures/admin-template-photo-staging-fixture.js";

test("admin stage uploads exact immutable multipart once and retains its confirmation in the real transport journal", async () => {
  const f = await fixture(), { client, transport } = f.make();
  assert.deepEqual(await client.stage(f.stage.templateOperationId, f.stage.operationId), f.data);
  const form = f.posts()[0].options.body;
  assert.equal(form.get("manifest"), canonicalTemplateJson(f.stage));
  assert.equal(await form.get("file").text(), await f.record.file.text()); assert.equal(form.has("thumb"), false);
  assert.equal(transport.writes.find(row => row.id === f.stage.operationId).confirmed, true);
  assert.deepEqual(await f.make().client.stage(f.stage.templateOperationId, f.stage.operationId), f.data);
  assert.equal(f.posts().length, 1); assert.equal(f.claims.size, 1);
});

test("a lost stage ACK reconciles the same receipt without another upload", async () => {
  const f = await fixture(); f.controls.lost = true;
  assert.deepEqual(await f.make().client.stage(f.stage.templateOperationId, f.stage.operationId), f.data);
  assert.equal(f.posts().length, 1);
});

test("unknown stage remains read-only after reload or cleared transport history because the IDB claim survives", async () => {
  const f = await fixture(); f.controls.unknown = true;
  await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId));
  assert.equal(f.posts().length, 1);
  await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId));
  f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${f.stage.operationId}`);
  await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId));
  const inspected = await f.make({ enabled: false }).client.inspect(f.stage.templateOperationId, f.stage.operationId);
  assert.equal(inspected.operation.state, "unknown"); assert.equal(f.posts().length, 1);
});

test("append gate/capability and real administrative context precede every first dispatch", async () => {
  const off = await fixture(); await assert.rejects(off.make({ enabled: false }).client.stage(off.stage.templateOperationId, off.stage.operationId));
  assert.equal(off.calls.length, 0);
  const oldServer = await fixture(); oldServer.controls.capabilities = ["adminTemplateCausalOperationsV1"];
  await assert.rejects(oldServer.make().client.stage(oldServer.stage.templateOperationId, oldServer.stage.operationId), { code: "admin-template-photo-stage-capability" });
  assert.equal(oldServer.claims.size, 0); assert.equal(oldServer.posts().length, 0);
  for (const change of [{ actorId: "other" }, { scope: "personal" }, { admin: false }, { listId: "other" }]) {
    const f = await fixture(); Object.assign(f.current, change);
    await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId), { code: "admin-template-photo-stage-context" });
    assert.equal(f.calls.length, 0);
  }
});

test("unavailable confirmed bytes and altered confirmations cannot become another upload", async () => {
  const f = await fixture(); f.controls.known = { ...copy(f.data), assetState: "unavailable" };
  await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId), { code: "admin-template-photo-stage-unavailable" });
  assert.equal((await f.make({ enabled: false }).client.inspect(f.stage.templateOperationId, f.stage.operationId)).assetState, "unavailable");
  f.controls.known.receipt.manifest.photoId = "other";
  await assert.rejects(f.make().client.stage(f.stage.templateOperationId, f.stage.operationId));
  assert.equal(f.posts().length, 0); assert.equal(f.claims.size, 0);
});

test("context changes during stored-file read or after POST never acknowledge into another editor", async () => {
  for (const phase of ["afterRead", "afterPost"]) {
    const f = await fixture(); f.controls[phase] = () => { f.current.generation = "other-editor"; };
    const { client, transport } = f.make();
    await assert.rejects(client.stage(f.stage.templateOperationId, f.stage.operationId), { code: "admin-template-photo-stage-context" });
    assert.equal(f.posts().length, phase === "afterRead" ? 0 : 1);
    assert.equal(transport.writes.some(row => row.confirmed), false);
  }
});
