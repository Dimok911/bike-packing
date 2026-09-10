import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalLegacyServerImportSource, preparePersonalLegacyServerImportSource } from "../../src/sync/personal-legacy-server-import-source.js";

const descriptor = () => ({ mode: "live", scope: "layout", entityType: "container", entityId: "bag", layoutId: "selected", sourceListId: "private-source" });
for (const prefix of ["entity-link", "entity-snapshot", "snapshot"]) test(`legacy ${prefix} freezes its selection before awaiting the hash`, async () => {
  const input = { listId: `shared-${prefix}-${randomUUID()}`, stateRevision: 7, descriptor: prefix === "entity-link" ? descriptor() : null };
  const original = structuredClone(input), pending = preparePersonalLegacyServerImportSource(input);
  input.stateRevision = 8; if (input.descriptor) input.descriptor.layoutId = "different";
  const source = await pending;
  assert.deepEqual(source, await preparePersonalLegacyServerImportSource(original));
  assert.equal(source.kind, "legacy-link"); assert.equal(source.stateRevision, 7);
  assert.equal(source.mode, prefix === "entity-link" ? "live" : "snapshot");
  assert.equal(source.sourceListId, undefined);
  assert.deepEqual(Object.keys(source).sort(), ["kind", "listId", "mode", "selectionHash", "stateRevision"]);
  const parsed = personalLegacyServerImportSource(source); source.selectionHash = "0".repeat(64);
  assert.notEqual(parsed.selectionHash, source.selectionHash);
  assert.notEqual(parsed.selectionHash, (await preparePersonalLegacyServerImportSource({ ...original, listId: `shared-${prefix}-${randomUUID()}` })).selectionHash);
});

test("legacy live read binds hidden source and exact disclosure scope", async () => {
  const input = { listId: `shared-entity-link-${randomUUID()}`, stateRevision: 4, descriptor: descriptor() };
  const source = await preparePersonalLegacyServerImportSource(input);
  for (const patch of [{ sourceListId: "other" }, { scope: "entity" }, { layoutId: "other" }, { entityId: "other" }]) {
    const changed = await preparePersonalLegacyServerImportSource({ ...input, descriptor: { ...input.descriptor, ...patch } });
    assert.notEqual(changed.selectionHash, source.selectionHash);
  }
  for (const patch of [{ sourceListId: input.listId }, { scope: "other" }, { entityType: "list" }, { layoutId: "" },
    { sourceListId: "../other" }, { mode: "snapshot" }, { authority: true }]) {
    await assert.rejects(preparePersonalLegacyServerImportSource({ ...input, descriptor: { ...input.descriptor, ...patch } }));
  }
});

test("legacy sources cannot masquerade as new links, public templates or arbitrary private lists", async () => {
  const source = await preparePersonalLegacyServerImportSource({ listId: `shared-snapshot-${randomUUID()}`, stateRevision: 1, descriptor: null });
  for (const patch of [{ kind: "shared-link" }, { kind: "public-template" }, { listId: "private-other-owner" }, { listId: "public-demo" },
    { listId: "shared-snapshot-not-a-uuid" }, { mode: "live" }, { stateRevision: 0 }, { stateRevision: "1" },
    { stateRevision: 1.5 }, { selectionHash: "not-verified" }, { allowRead: true }, { sourceListId: "private-source" }]) {
    assert.throws(() => personalLegacyServerImportSource({ ...source, ...patch }));
  }
  await assert.rejects(preparePersonalLegacyServerImportSource({ listId: source.listId, stateRevision: 1, descriptor: descriptor() }));
  await assert.rejects(preparePersonalLegacyServerImportSource({ listId: `shared-entity-link-${randomUUID()}`, stateRevision: 1, descriptor: null }));
});
