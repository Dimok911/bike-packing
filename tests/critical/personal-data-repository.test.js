import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalDataRepository } from "../../src/storage/personal-data-repository.js";

const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
const unopened = () => createPersonalDataRepository({ indexedDB: { open: () => assert.fail("invalid input opened storage") } });
test("foreign, guest, malformed and ambiguous bindings never open storage", async () => {
  for (const change of [{ environment: "production" }, { actorId: "" }, { listId: "constructor" }, { scopeKey: "guest" },
    { scopeKey: "id:other" }, { extra: true }]) await assert.rejects(unopened().read({ ...binding, ...change }), { code: "binding" });
});
test("invalid revisions, non-string raw entries, duplicate identities and journal deletion fail before opening", async () => {
  const entry = { namespace: "journal", key: "original", raw: "exact bytes" };
  for (const args of [{ expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 0, puts: [{ ...entry, raw: {} }] },
    { expectedRevision: 0, puts: [entry, entry] }, { expectedRevision: 0, puts: [{ ...entry, namespace: "unknown" }] },
    { expectedRevision: 0, deletes: [{ namespace: "journal", key: "original" }] }]) {
    await assert.rejects(unopened().commit(binding, args), error => error.isPersonalDataRepositoryError === true);
  }
});
test("missing IndexedDB and closed repositories give explicit errors", async () => {
  const repository = createPersonalDataRepository({ indexedDB: null });
  await assert.rejects(repository.open(), { code: "unavailable" });
  const closed = unopened(); closed.close(); await assert.rejects(closed.read(binding), { code: "closed" });
});
test("synchronous open failures are sanitized without exposing storage error detail", async () => {
  const repository = createPersonalDataRepository({ indexedDB: { open: () => { throw Error("private account material"); } } });
  await assert.rejects(repository.open(), error => error.code === "open" && !JSON.stringify(error).includes("private"));
});
