import test from "node:test";
import assert from "node:assert/strict";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { personalPublicPendingPreparations, recoverPersonalPublicImportPreparation, choosePersonalPublicPreparation } from "../../src/sync/personal-public-import-preparation-recovery.js";

async function fixture(version, photos = true) {
  const input = version === 2 ? await publicEntityFixture({ photos }) : await publicImportFixture(!photos);
  const { binding, selection } = input, values = new Map(), native = new Map(), events = [];
  const context = { ...binding, scope: "personal", generation: "preparation-recovery" }, getContext = () => context;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true,
    publicImportEnabled: true, publicEntityEnabled: true });
  const journal = (overrides = {}) => createPersonalPublicImportSelectionStore({ binding, storage, getContext,
    locks: { request: async (key, run) => run() }, enabled: true, publicEntityEnabled: true, choiceEnabled: true, ...overrides });
  const store = { binding, ids: async () => [...native.keys()],
    read: async id => native.has(id) ? decodePersonalPublicImportRecord(native.get(id), binding, id) : null,
    async capturePublic(value) { native.set(value.action.operationId, await encodePersonalPublicImportRecord({ binding, ...value })); events.push("native"); } };
  const loadFile = async () => { events.push("download"); return { file: input.file, thumb: null,
    fileName: input.action.body.publicImport.files[0]?.file.fileName || "Selected.png" }; };
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: selection.basePayload, payload: selection.basePayload, stateRevision: selection.baseStateRevision });
  const prepare = () => preparePersonalPublicImport({ selection, selectionStore: journal(), outbox, store, getContext,
    getState: () => selection.basePayload, getRevision: () => selection.baseStateRevision, makeSnapshot: value => value,
    loadFile, onCaptured: () => events.push("view"), enabled: true, publicEntityEnabled: true });
  const recover = async (overrides = {}) => recoverPersonalPublicImportPreparation({ entry: (await journal().entries())[0],
    selectionStore: journal(), outbox: make(), store, getContext, makeSnapshot: value => value, loadFile,
    enabled: true, publicEntityEnabled: true, ...overrides });
  return { input, selection, binding, values, native, events, context, store, outbox, make, journal, prepare, recover };
}

for (const version of [1, 2]) for (const phase of ["selection", "fileless-selection", "prepared", "native"])
test(`public v${version} cold preparation recovery from ${phase} keeps the original source, action and IDs`, async () => {
  const f = await fixture(version, phase !== "fileless-selection"), selected = structuredClone(f.selection);
  await f.journal().capture(f.selection);
  if (["prepared", "native"].includes(phase)) {
    const commit = await f.prepare();
    if (phase === "native") {
      f.outbox.capturePhoto = async () => { throw Error("Crash before linking the queue"); };
      await assert.rejects(commit());
    }
  }
  const before = (await f.journal().entries())[0], originalAction = before.action && structuredClone(before.action);
  const reads = f.events.filter(value => value === "download").length;
  const saved = await f.recover();
  assert.deepEqual(saved.action, originalAction || { ...f.input.action, generation: 1 });
  assert.deepEqual(saved, f.make().recover());
  assert.deepEqual((await f.journal().entries())[0].selection, selected);
  assert.equal(f.events.includes("view"), false);
  assert.equal(f.events.filter(value => value === "download").length - reads, ["native", "fileless-selection"].includes(phase) ? 0 : 1);
  assert.equal(f.native.size, phase === "fileless-selection" ? 0 : 1);
});

for (const version of [1, 2]) test(`public v${version} recovery refuses changed or unavailable prepared bytes without replacing its action`, async () => {
  const f = await fixture(version); await f.prepare();
  const before = [...f.values], entry = (await f.journal().entries())[0];
  for (const loadFile of [async () => { throw Error("Source file unavailable"); }, async () => ({
    file: new Blob(["different public bytes"], { type: "image/png" }), thumb: null, fileName: entry.action.body.publicImport.files[0].file.fileName })]) {
    await assert.rejects(f.recover({ loadFile }));
    assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0); assert.equal(f.make().hasPending(), false);
  }
  assert.deepEqual((await f.journal().entries())[0], entry);
  assert.deepEqual((await f.recover()).action, entry.action);
});

test("public preparation recovery gates and changed context stop before any bytes or queue write", async () => {
  const f = await fixture(2); await f.journal().capture(f.selection); const before = [...f.values];
  await assert.rejects(f.recover({ enabled: false }));
  await assert.rejects(f.recover({ publicEntityEnabled: false }));
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  await assert.rejects(f.recover({ loadFile: async () => {
    f.context.generation = "different-editor";
    return { file: f.input.file, thumb: null, fileName: "Original.png" };
  } }));
  assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0); assert.equal(f.make().hasPending(), false);
});

test("public preparation recovery refuses a stale caller or a different confirmed target without downloads", async () => {
  const f = await fixture(1); await f.journal().capture(f.selection);
  const stale = (await f.journal().entries())[0]; await f.prepare(); const before = [...f.values];
  await assert.rejects(f.recover({ entry: stale }));
  const changed = structuredClone(f.selection.basePayload); changed.categories.push("New confirmed target value");
  const outbox = f.make(); outbox.adoptRemoteBaseline({ snapshot: changed, payload: changed, stateRevision: f.selection.baseStateRevision + 1 });
  const reads = f.events.filter(value => value === "download").length;
  await assert.rejects(f.recover({ outbox }));
  assert.equal(f.events.filter(value => value === "download").length, reads);
  assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0);
});

test("a selection-only public preparation fences its list until the exact action is linked", async () => {
  const f = await fixture(2); await f.journal().capture(f.selection);
  assert.deepEqual(personalPublicPendingPreparations(await f.journal().entries(), f.make()).map(entry => entry.selection.operationId), [f.selection.operationId]);
  await f.recover();
  assert.deepEqual(personalPublicPendingPreparations(await f.journal().entries(), f.make()), []);
});

test("multiple unfinished public selections remain available and cannot silently overtake each other", async () => {
  const f = await fixture(1), other = await publicImportFixture(false);
  await f.journal().capture(f.selection); await f.journal().capture(other.selection);
  const before = [...f.values]; await assert.rejects(f.recover());
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  assert.equal(personalPublicPendingPreparations(await f.journal().entries(), f.make()).length, 2);
});

for (const version of [1, 2]) test(`public v${version} repeated file recovery on the same reader never substitutes the prepared action`, async () => {
  const f = await fixture(version); await f.prepare(); const entry = (await f.journal().entries())[0], outbox = f.make();
  await assert.rejects(f.recover({ outbox, loadFile: async () => ({ file: new Blob(["changed"], { type: "image/png" }),
    thumb: null, fileName: entry.action.body.publicImport.files[0].file.fileName }) }));
  assert.deepEqual((await f.recover({ outbox })).action, entry.action);
});

test("public recovery accepts the same validated action with a different JSON key order and retains the original journal bytes", async () => {
  const f = await fixture(1); await f.journal().capture(f.selection);
  const original = { ...f.input.action, generation: 1 };
  await f.journal().rememberAction({ selection: f.selection, action: original });
  const journalBefore = [...f.values];
  assert.deepEqual((await f.recover()).action, original);
  for (const [key, text] of journalBefore) assert.equal(f.values.get(key), text);
});

async function multiple(version = 1, photos = true) {
  const f = await fixture(version, photos), other = version === 2 ? await publicEntityFixture({ photos }) : await publicImportFixture(!photos);
  await f.journal().capture(f.selection); await f.journal().capture(other.selection);
  const entries = await f.journal().entries();
  const choose = (overrides = {}) => choosePersonalPublicPreparation({ entries, operationId: f.selection.operationId,
    selectionStore: f.journal(), outbox: f.make(), store: f.store, getContext: () => f.context, enabled: true, ...overrides });
  return { ...f, other, entries, choose };
}

for (const version of [1, 2]) for (const photos of [false, true])
test(`explicit public v${version} ${photos ? "photo" : "fileless"} choice retains the other original selection across restart`, async () => {
  const f = await multiple(version, photos), before = [...f.values];
  const chosen = await f.choose();
  assert.deepEqual(chosen, f.entries[0]); assert.equal(f.values.size, before.length + 1);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  assert.deepEqual(f.events, []); assert.equal(f.make().hasPending(), false);
  const entries = await f.journal().entries(), alternative = entries.find(entry => entry.selection.operationId === f.other.selection.operationId);
  assert.deepEqual(alternative.retainedAlternative, { version: 1, selectedOperationId: f.selection.operationId });
  assert.deepEqual(personalPublicPendingPreparations(entries, f.make()), [chosen]);
  const action = (await f.recover({ entry: chosen })).action;
  assert.equal(action.operationId, f.selection.operationId);
  assert.deepEqual(action.body.publicImport.sourcePayload, chosen.selection.sourcePayload);
  assert.equal(f.native.size, photos ? 1 : 0);
  const rollback = f.journal({ enabled: false, publicEntityEnabled: false, choiceEnabled: false });
  assert.deepEqual(await rollback.entries(), await f.journal().entries());
  const exported = await rollback.recoveryRecords();
  assert.equal(exported.filter(row => row.key.endsWith(":selection")).length, 2);
  assert.equal(exported.filter(row => row.key.startsWith("choice:")).length, 1);
});

test("choosing the second preparation uses the explicit ID, not journal or UUID order", async () => {
  const f = await multiple(), chosen = await f.choose({ operationId: f.other.selection.operationId });
  assert.deepEqual(chosen, f.entries[1]);
  assert.deepEqual(personalPublicPendingPreparations(await f.journal().entries(), f.make()), [chosen]);
  const saved = await f.recover({ entry: chosen }); assert.equal(saved.action.operationId, f.other.selection.operationId);
});

test("retained alternatives reject capture and action preparation while their original rows remain exportable", async () => {
  const f = await multiple(); await f.choose(); const before = [...f.values];
  await assert.rejects(f.journal().capture(f.other.selection));
  await assert.rejects(f.journal().rememberAction({ selection: f.other.selection, action: f.other.action }));
  await assert.rejects(f.recover({ entry: f.entries[1] }));
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  assert.deepEqual(await f.journal().read(f.other.selection.operationId), f.other.selection);
});

for (const gate of ["enabled", "choiceEnabled", "publicEntityEnabled"])
test(`public preparation choice respects ${gate} before writing while rollback reading works`, async () => {
  const f = await multiple(2), before = [...f.values];
  await assert.rejects(f.choose({ selectionStore: f.journal({ [gate]: false }) }));
  assert.deepEqual([...f.values], before); assert.deepEqual(await f.journal({ [gate]: false }).entries(), f.entries);
});

test("public preparation choice refuses a stale inventory or an action prepared in another tab", async () => {
  for (const changed of ["selection", "action"]) {
    const f = await multiple(), newer = await publicImportFixture(false);
    if (changed === "selection") await f.journal().capture(newer.selection);
    else await f.journal().rememberAction({ selection: f.other.selection, action: f.other.action });
    const before = [...f.values]; await assert.rejects(f.choose());
    assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  }
});

for (const changed of ["generation", "actorId", "base", "native"])
test(`public preparation choice rechecks ${changed} after asynchronous file inventory inspection`, async () => {
  const f = await multiple(), outbox = f.make(), before = [...f.values];
  const store = { ...f.store, async ids() {
    if (changed === "base") outbox.adoptRemoteBaseline({ snapshot: f.selection.basePayload, payload: f.selection.basePayload,
      stateRevision: f.selection.baseStateRevision + 1 });
    else if (changed === "native") {
      await f.store.capturePublic({ action: f.other.action, snapshot: f.other.plan.payload, files: f.other.selection.photoTargets.map(target => ({
        stage: { operationId: target.assetId, photoId: target.photoId, entityType: target.entityType, entityId: target.entityId, fileName: "Selected.png" }, file: f.other.file, thumb: null })) });
      return [...f.native.keys()];
    } else f.context[changed] = "changed-editor";
    return [];
  } };
  await assert.rejects(f.choose({ store, outbox })); assert.deepEqual([...f.values], before);
});

test("a failed atomic choice write retains all candidates and does not select one on retry implicitly", async () => {
  const f = await multiple(), before = [...f.values];
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
    setItem() { throw new DOMException("No space", "QuotaExceededError"); } };
  await assert.rejects(f.choose({ selectionStore: f.journal({ storage }) }));
  assert.deepEqual([...f.values], before); assert.deepEqual(personalPublicPendingPreparations(await f.journal().entries(), f.make()), f.entries);
  await assert.rejects(f.recover()); assert.deepEqual(f.events, []);
});

test("corrupt choices block reads and new writers but raw recovery includes every original byte", async () => {
  const f = await multiple(); await f.choose();
  const key = [...f.values.keys()].find(key => key.includes(":choice:")); f.values.set(key, "broken choice");
  const before = [...f.values]; await assert.rejects(f.journal().entries()); await assert.rejects(f.prepare());
  assert.deepEqual([...f.values], before);
  assert.equal((await f.journal({ choiceEnabled: false }).recoveryRecords()).find(row => row.key.startsWith("choice:")).text, "broken choice");
});

test("a later explicit choice may retain a prior unprepared choice without inventing causal order", async () => {
  const f = await multiple(); await f.choose(); const newer = await publicImportFixture(false);
  await f.journal().capture(newer.selection);
  const pending = personalPublicPendingPreparations(await f.journal().entries(), f.make());
  await f.choose({ entries: pending, operationId: newer.selection.operationId });
  const entries = await f.journal().entries();
  assert.deepEqual(personalPublicPendingPreparations(entries, f.make()).map(entry => entry.selection.operationId), [newer.selection.operationId]);
  assert.equal(entries.filter(entry => entry.retainedAlternative).length, 2);
  assert.equal((await f.journal().recoveryRecords()).filter(row => row.key.startsWith("choice:")).length, 2);
});

for (const winner of ["choice", "action"]) test(`public preparation ${winner} wins a real serialized race without retiring an action`, async () => {
  const f = await multiple(); let tail = Promise.resolve();
  const locks = { request(key, run) { const result = tail.then(run); tail = result.catch(() => {}); return result; } };
  const journal = f.journal({ locks });
  const choose = () => journal.choosePreparation({ entries: f.entries, operationId: f.selection.operationId, assertCurrent() {} });
  const remember = () => journal.rememberAction({ selection: f.other.selection, action: f.other.action });
  // rememberAction hashes before acquiring the lock; awaiting its successful
  // run ensures this direction is also tested, independently of hash timing.
  if (winner === "action") { await remember(); await assert.rejects(choose()); }
  else { const first = choose(), second = remember(); await first; await assert.rejects(second); }
  const entries = await journal.entries(), other = entries.find(entry => entry.selection.operationId === f.other.selection.operationId);
  assert.equal(Boolean(other.action), winner === "action"); assert.equal(Boolean(other.retainedAlternative), winner === "choice");
});
