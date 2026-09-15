import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequestJournalBodies } from "../../src/storage/request-journal-bodies.js";
import { canonicalOperationJson } from "../../src/protocol/operation-identity.js";
import { createExperimentTransport, AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

const locationLike = { origin: "https://experiment.vniipo-help.ru" };
const locks = { request: async (_, callback) => callback() };
const path = "/bike-packing/lists/test-list";
function fixture() {
  const values = new Map([["existing-personal-data", "retained"]]), rows = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key),
    setItem(key, value) {
      // The captured local action already occupies most of the site's quota.
      if (value.length > 4096) throw new DOMException("Full", "QuotaExceededError");
      values.set(key, value);
    } };
  const repository = {
    async listBindings() { return [...rows.keys()].map(key => JSON.parse(key)); },
    async read(binding) { return structuredClone(rows.get(JSON.stringify(binding)) || { revision: 0, entries: [] }); },
    async commit(binding, { expectedRevision, puts = [], deletes = [] }) {
      const key = JSON.stringify(binding);
      assert.equal(rows.get(key)?.revision || 0, expectedRevision);
      const entries = rows.get(key)?.entries || [];
      rows.set(key, { revision: expectedRevision + 1, entries: structuredClone([
        ...entries.filter(row => !deletes.some(other => other.key === row.key)), ...puts]) });
    },
  };
  const body = { payload: { items: { bottle: { name: "Новое имя", note: "данные".repeat(40000) } } },
    causal: { reads: [], dependsOn: [] } };
  const recovery = { type: "list", protocol: "causal-v1", actorId: "actor", listId: "test-list",
    operationId: randomUUID(), kind: "list.update", body,
    payloadDigest: createHash("sha256").update(canonicalOperationJson({ environment: "bike-packing-experiment",
      actorId: "actor", listId: "test-list", kind: "list.update", body })).digest("hex") };
  const open = () => createExperimentTransport({ locationLike, storage, locks, selection: "direct",
    journalBodies: createRequestJournalBodies({ repository }) });
  return { values, rows, storage, repository, recovery, open };
}

test("large request survives localStorage quota and cold recovery without a second payload copy", async () => {
  const f = fixture();
  const old = createExperimentTransport({ locationLike, storage: f.storage, locks, selection: "direct", journalBodies: null });
  await assert.rejects(old.beginWrite(path, "PUT", JSON.stringify(f.recovery.body), f.recovery), { code: "request-journal-persistence" });
  assert.equal(f.values.size, 1);
  const transport = f.open(), id = await transport.beginWrite(path, "PUT", JSON.stringify(f.recovery.body), f.recovery);
  assert.deepEqual(transport.writes[0].recovery.body, f.recovery.body);
  const raw = f.values.get(`${AMBIGUOUS_WRITE_KEY}:${id}`);
  assert.ok(raw.length < 4096);
  assert.equal(JSON.parse(raw).recovery.body, undefined);
  assert.equal(f.values.get("existing-personal-data"), "retained");
  const cold = f.open();
  assert.equal(cold.uncertainWrite.id, id);
  await cold.prepareJournal();
  assert.deepEqual(cold.writes[0].recovery.body, f.recovery.body);
  cold.noteFailure(Object.assign(Error("lost ACK"), { isNetworkError: true }), path, "PUT", id);
  assert.equal(JSON.parse(f.values.get(`${AMBIGUOUS_WRITE_KEY}:${id}`)).recovery.body, undefined);
  assert.equal(cold.confirmWrite(id, { receipt: { confirmed: true } }), true);
  await cold.prepareJournal();
  const terminal = JSON.parse(f.values.get(`${AMBIGUOUS_WRITE_KEY}:${id}`));
  assert.equal(terminal.bodyReference, undefined);
  assert.equal(terminal.recovery.body, undefined);
  assert.equal([...f.rows.values()][0].entries.length, 0);
});

test("failed body transaction publishes no marker; same operation may be saved later", async () => {
  const f = fixture(), commit = f.repository.commit;
  f.repository.commit = async () => { throw Error("disk full"); };
  await assert.rejects(f.open().beginWrite(path, "PUT", null, f.recovery), { code: "request-journal-persistence" });
  assert.equal(f.values.size, 1);
  f.repository.commit = commit;
  assert.equal(await f.open().beginWrite(path, "PUT", null, f.recovery), f.recovery.operationId);
});

test("missing or corrupted body blocks journal recovery but not route preparation or server reads", async () => {
  for (const corrupt of [false, true]) {
    const f = fixture(); await f.open().beginWrite(path, "PUT", null, f.recovery);
    if (corrupt) [...f.rows.values()][0].entries[0].raw = '{"payload":{}}'; else f.rows.clear();
    const cold = f.open();
    await cold.prepare();
    assert.ok(cold.apiUrl("/auth/me"));
    await assert.rejects(cold.prepareJournal());
    assert.equal(cold.uncertainWrite.id, f.recovery.operationId);
    assert.equal(cold.writes[0].recovery.body, undefined);
  }
});

test("failed marker publication retains durable body and retries the identical ID", async () => {
  const f = fixture(), set = f.storage.setItem;
  f.storage.setItem = () => { throw Error("all localStorage unavailable"); };
  await assert.rejects(f.open().beginWrite(path, "PUT", null, f.recovery));
  assert.equal(f.rows.size, 1); assert.equal(f.values.size, 1);
  f.storage.setItem = set;
  assert.equal(await f.open().beginWrite(path, "PUT", null, f.recovery), f.recovery.operationId);
  await assert.rejects(f.open().beginWrite(path, "PUT", null, f.recovery), /already exists/);
});

test("body cannot cross operation owner/list/digest binding", async () => {
  const f = fixture(); await f.open().beginWrite(path, "PUT", null, f.recovery);
  const storageKey = `${AMBIGUOUS_WRITE_KEY}:${f.recovery.operationId}`;
  const original = f.values.get(storageKey);
  for (const field of ["actorId", "listId", "operationId", "payloadDigest"]) {
    const marker = JSON.parse(original); marker.recovery[field] = "other";
    f.values.set(storageKey, JSON.stringify(marker));
    await assert.rejects(f.open().prepareJournal());
  }
});

test("unpublished and cancelled-before-send bodies are reclaimed without removing pending ones", async () => {
  const f = fixture(), set = f.storage.setItem;
  f.storage.setItem = () => { throw Error("full"); };
  await assert.rejects(f.open().beginWrite(path, "PUT", null, f.recovery));
  f.storage.setItem = set;
  const next = f.open(); await next.prepareJournal();
  assert.equal([...f.rows.values()][0].entries.length, 0);
  const id = await next.beginWrite(path, "PUT", null, f.recovery);
  await next.prepareJournal();
  assert.equal([...f.rows.values()][0].entries.length, 1);
  next.confirmWrite(id, { committed: false });
  await next.prepareJournal();
  assert.equal([...f.rows.values()][0].entries.length, 0);
  assert.equal(f.values.get("existing-personal-data"), "retained");
});
