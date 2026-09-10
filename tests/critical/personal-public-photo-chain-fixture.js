import { publicImportFixture } from "./personal-public-import-fixture.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

export async function publicPhotoChainFixture(fileless = false) {
  const f = await publicImportFixture(fileless, { containerPhotos: true }), binding = f.binding;
  const values = new Map(), native = new Map(), base = f.selection.basePayload;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (enabled = true, overrides = {}) => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: enabled,
    photoBatchEnabled: enabled, photoFormEnabled: enabled, photoEditEnabled: enabled, formOwnerResultEnabled: enabled,
    publicPhotoFormEnabled: enabled, publicImportEnabled: enabled, pendingPublicUpdateEnabled: enabled,
    pendingFormUpdateEnabled: enabled, ...overrides });
  const outbox = make(), context = { ...binding, scope: "personal", generation: "public-new-owner" }, getContext = () => context;
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 7 });
  const store = { binding, ids: async () => [...native.keys()], read: async id => {
    const row = native.get(id);
    return row ? (row.kind === "public" ? decodePersonalPublicImportRecord : decodePersonalPhotoFormRecord)(row.bytes, binding, id) : null;
  } };
  for (const [kind, capture, encode] of [["public", "capturePublic", encodePersonalPublicImportRecord],
    ["form", "captureForm", encodePersonalPhotoFormRecord]]) {
    store[capture] = async input => native.set(input.action.operationId, { kind, bytes: await encode({ binding, ...input }) });
  }
  const commit = await preparePersonalPublicImport({ selection: f.selection, enabled: true, outbox, store, getContext,
    selectionStore: createPersonalPublicImportSelectionStore({ binding, storage, getContext, enabled: true,
      locks: { request: async (_name, run) => run() } }),
    getState: () => base, getRevision: () => 7, makeSnapshot: value => value,
    loadFile: async () => ({ file: f.file, fileName: "Selected.png", thumb: null }), onCaptured: () => {} });
  const root = await commit();
  return { binding, base, root, item: f.plan.createdOwners.items[0], bag: f.plan.createdOwners.containers[0],
    outbox, make, store, native, values, storage, context, getContext };
}
