import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PERSONAL_SERVER_IMPORT_ENABLED, personalServerImportSource, preparePersonalServerImportSource } from "../../src/sync/personal-server-import-source.js";

const descriptor = (mode = "live") => ({ version: 1, id: `shared-entity-${mode === "live" ? "link" : "snapshot"}-${randomUUID()}`,
  mode, scope: "layout", entityType: "", entityId: "", layoutId: "selected-layout", title: "Chosen", description: "",
  includeAuthor: false, authorName: "" });

for (const mode of ["live", "snapshot"]) test(`${mode} copy read binds the exact selection and effective content revision`, async () => {
  const choice = descriptor(mode), input = { descriptor: choice, stateRevision: 7 };
  const pending = preparePersonalServerImportSource(input);
  const original = structuredClone(choice); choice.layoutId = "different-layout"; input.stateRevision = 19;
  const source = await pending;
  assert.equal(source.stateRevision, 7); assert.equal(source.listId, original.id); assert.equal(source.mode, mode);
  assert.deepEqual(source, await preparePersonalServerImportSource({ descriptor: original, stateRevision: 7 }));
  assert.notEqual(source.selectionHash, (await preparePersonalServerImportSource({ descriptor: choice, stateRevision: 7 })).selectionHash);
  assert.deepEqual(await preparePersonalServerImportSource({ descriptor: original, stateRevision: 8 }), { ...source, stateRevision: 8 });
  const copy = personalServerImportSource(source); source.selectionHash = "0".repeat(64);
  assert.notEqual(copy.selectionHash, source.selectionHash);
});

test("server copy read never accepts arbitrary private/public IDs or inconsistent link modes", async () => {
  const source = await preparePersonalServerImportSource({ descriptor: descriptor(), stateRevision: 3 });
  for (const patch of [{ kind: "public-template" }, { listId: "private-other-owner" }, { listId: "public-demo-state" },
    { mode: "snapshot" }, { stateRevision: 0 }, { stateRevision: 1.2 }, { stateRevision: "3" },
    { selectionHash: "unchecked" }, { actorId: "foreign" }, { writeAllowed: true }]) {
    assert.throws(() => personalServerImportSource({ ...source, ...patch }));
  }
  for (const patch of [{ scope: "list", entityId: "unrelated" }, { includeAuthor: false, authorName: "Not selected" },
    { id: `shared-entity-link-${randomUUID()}`, mode: "snapshot" }]) {
    await assert.rejects(preparePersonalServerImportSource({ descriptor: { ...descriptor(), ...patch }, stateRevision: 3 }));
  }
});

test("preparing read metadata does not enable server import or confer a write capability", async () => {
  assert.equal(PERSONAL_SERVER_IMPORT_ENABLED, false);
  const source = await preparePersonalServerImportSource({ descriptor: descriptor("snapshot"), stateRevision: 1 });
  assert.deepEqual(Object.keys(source).sort(), ["kind", "listId", "mode", "selectionHash", "stateRevision"]);
  assert.equal(source.capabilities, undefined); assert.equal(source.sourceListId, undefined);
});
