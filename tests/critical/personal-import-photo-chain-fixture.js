import { createHash } from "node:crypto";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { preparePersonalGuestImport } from "../../src/sync/personal-guest-import.js";
import { preparePersonalArchivePhotoImport } from "../../src/sync/personal-archive-photo-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalGuestImportRecord, decodePersonalGuestImportRecord } from "../../src/sync/personal-guest-import-record.js";
import { encodePersonalArchivePhotoRecord, decodePersonalArchivePhotoRecord } from "../../src/sync/personal-archive-photo-record.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

export async function importPhotoChainFixture(importKind, fileless = false, options = {}) {
  const f = { ...guestSelectionFixture(), ...options }, binding = f.binding, values = new Map(), native = new Map();
  f.user = { ...f.user, id: binding.actorId };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (enabled = true, overrides = {}) => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: enabled,
    photoBatchEnabled: enabled, photoFormEnabled: enabled, photoEditEnabled: enabled, formOwnerResultEnabled: enabled,
    importPhotoFormEnabled: enabled, guestImportEnabled: enabled, archiveImportEnabled: enabled, archivePhotoImportEnabled: enabled,
    pendingGuestUpdateEnabled: enabled, pendingArchiveUpdateEnabled: enabled, pendingFormUpdateEnabled: enabled, ...overrides });
  const outbox = make(), context = { ...binding, scope: "personal", generation: "import-form" }, getContext = () => context;
  const base = f.basePayload;
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: f.baseStateRevision });
  const decoders = { guest: decodePersonalGuestImportRecord, archive: decodePersonalArchivePhotoRecord, form: decodePersonalPhotoFormRecord };
  const store = { binding, ids: async () => [...native.keys()], read: async id => {
    const row = native.get(id); return row ? decoders[row.kind](row.bytes, binding, id) : null;
  } };
  for (const [kind, capture, encode] of [["guest", "captureGuest", encodePersonalGuestImportRecord],
    ["archive", "captureArchive", encodePersonalArchivePhotoRecord], ["form", "captureForm", encodePersonalPhotoFormRecord]]) {
    store[capture] = async input => native.set(input.action.operationId, { kind, bytes: await encode({ binding, ...input }) });
  }
  const file = options.file || new Blob(["import original"], { type: "image/png" }), sha256 = createHash("sha256").update(await file.bytes()).digest("hex");
  const source = f.candidate.sourceState;
  source.items.item.photos = fileless ? [] : [{ id: "old-item" }];
  source.containers.bag.photos = fileless ? [] : [{ id: "old-bag" }];
  const preparation = { enabled: true, outbox, store, getContext, getState: () => base, getRevision: () => f.baseStateRevision,
    makeSnapshot: value => value, onCaptured: () => {} };
  let commit;
  if (importKind === "guest") {
    f.handoff = createGuestLoginHandoff({ candidate: f.candidate, eligibleLayoutIds: ["a", "b"], email: f.user.email,
      guestSessionId: "guest-photo-form", nowMs: f.nowMs });
    const selection = preparePersonalGuestImportSelection(f, { enabled: true });
    commit = await preparePersonalGuestImport({ ...preparation, selection, getHandoff: () => f.handoff,
      selectionStore: { binding, capture: async value => ({ selection: structuredClone(value), reused: false }), rememberAction: async () => {} },
      loadFile: async () => ({ file, fileName: "import.png", thumb: null }) });
  } else {
    // Match the serializer's dictionary defaults in actual exported archives.
    for (const [key, value] of Object.entries(base)) if (!Object.hasOwn(source, key)) source[key] = structuredClone(value);
    for (const field of ["items", "containers"]) for (const owner of Object.values(source[field])) {
      for (const key of Object.keys(owner)) if (key.startsWith("_public")) delete owner[key];
    }
    const photoFiles = new Map((fileless ? [] : ["old-item", "old-bag"]).map(id => [id,
      { blob: file, thumbBlob: null, meta: { id, sha256, size: file.size, type: file.type, fileName: "import.png", width: 1, height: 1 } }]));
    const mode = options.archiveMode || "full", targetId = mode === "replace" ? Object.keys(base.layouts)[0] || "restored-a" : "copied-a";
    if (mode === "replace" && base.layouts[targetId]) source.layouts.a.name = base.layouts[targetId].name;
    commit = await preparePersonalArchivePhotoImport({ ...preparation, source, photoFiles, mode,
      layoutTargets: mode === "full" ? [] : [{ sourceId: "a", targetId, name: mode === "replace" ? source.layouts.a.name : "Imported archive copy" }] });
  }
  const root = await commit(), target = type => root.action.body.guestImport?.ownerTargets.find(row => row.entityType === type)?.targetId;
  const item = importKind === "guest" ? target("item") : "item", bag = importKind === "guest" ? target("container") : "bag";
  return { importKind, binding, base, root, item, bag, outbox, make, store, native, values, storage, context, getContext };
}
