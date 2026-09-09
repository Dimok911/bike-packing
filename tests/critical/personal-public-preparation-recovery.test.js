import test from "node:test";
import assert from "node:assert/strict";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { personalPublicPendingPreparations, recoverPersonalPublicImportPreparation } from "../../src/sync/personal-public-import-preparation-recovery.js";

async function fixture(version, photos = true) {
  const input = version === 2 ? await publicEntityFixture({ photos }) : await publicImportFixture(!photos);
  const { binding, selection } = input, values = new Map(), native = new Map(), events = [];
  const context = { ...binding, scope: "personal", generation: "preparation-recovery" }, getContext = () => context;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true,
    publicImportEnabled: true, publicEntityEnabled: true });
  const journal = () => createPersonalPublicImportSelectionStore({ binding, storage, getContext,
    locks: { request: async (key, run) => run() }, enabled: true, publicEntityEnabled: true });
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
