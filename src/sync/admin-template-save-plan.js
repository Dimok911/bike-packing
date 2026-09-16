import { adminTemplateIntent, canonicalTemplateJson, validTemplateOperationId, ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "./admin-template-protocol.js";
import { projectAdminTemplateCopy, adminTemplateCopyPayloadDigest } from "./admin-template-copy-projection.js";
import { adminTemplatePhotoSavePlan } from "./admin-template-photo-save-plan.js";
import { adminTemplatePhotoEditSavePlan } from "./admin-template-photo-edit-save-plan.js";
export { adminTemplatePhotoEditSavePlan } from "./admin-template-photo-edit-save-plan.js";
import { adminTemplatePhotoCreateSavePlan, assertAdminTemplatePhotoCreatePlanRecord } from "./admin-template-photo-create-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED } from "./admin-template-photo-create-protocol.js";
export { adminTemplatePhotoCreateSavePlan } from "./admin-template-photo-create-save-plan.js";
import { adminTemplatePhotoCopySavePlan, assertAdminTemplatePhotoCopyPlanRecord } from "./admin-template-photo-copy-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_COPY_ENABLED } from "./admin-template-photo-copy-protocol.js";
export { adminTemplatePhotoCopySavePlan } from "./admin-template-photo-copy-save-plan.js";
import { adminTemplatePhotoTreeCopySavePlan, assertAdminTemplatePhotoTreeCopyPlanRecord } from "./admin-template-photo-tree-copy-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "./admin-template-photo-tree-copy-protocol.js";
import { validateAdminTemplatePhotoTreeCopyStageReceipt, validateAdminTemplatePhotoTreeCopyStages,
  validateAdminTemplatePhotoTreeCopyReceipt } from "./admin-template-photo-tree-copy-receipt.js";
export { adminTemplatePhotoTreeCopySavePlan } from "./admin-template-photo-tree-copy-save-plan.js";
import { adminTemplatePhotoWholeCopySavePlan, assertAdminTemplatePhotoWholeCopyPlanRecord } from "./admin-template-photo-whole-copy-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } from "./admin-template-photo-whole-copy-protocol.js";
import { validateAdminTemplatePhotoWholeCopyJournal, readAdminTemplatePhotoWholeCopyParentFence } from "./admin-template-photo-whole-copy-parent-fence.js";
export { adminTemplatePhotoWholeCopySavePlan } from "./admin-template-photo-whole-copy-save-plan.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "./admin-template-capture-lease.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Сохранение шаблона ожидает продолжения исходного действия."), { code: "admin-template-plan-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// A full save and a visibility choice are distinct SQL effects, with fixed IDs
// and dependencies captured together. An existing public template is hidden
// BEFORE saving changes when the user explicitly chose to keep it private.
export function adminTemplateSavePlan({ binding, operationId, publicationId = null, base, exists, visibility, payload, metadata, published = null, indexes = [] }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || typeof exists !== "boolean" || ![null, "private", "public"].includes(visibility)
    || exists !== (visibility !== null) || ![null, true, false].includes(published)
    || !exists && base !== null || !Array.isArray(indexes)) throw paused();
  const needsPublication = published === true || published === false && visibility === "public";
  if (needsPublication ? !validTemplateOperationId(publicationId) || publicationId === operationId : publicationId !== null) throw paused();
  if (!needsPublication && indexes.length || published !== false && indexes.length) throw paused();
  const capture = (id, kind, body) => adminTemplateIntent({ ...binding, operationId: id, kind, body });
  const hidingFirst = needsPublication && published === false;
  const write = capture(operationId, exists ? "template.save" : "template.create", {
    version: 1, base: hidingFirst ? { operationId: publicationId } : base, payload, metadata,
  });
  const publication = needsPublication ? capture(publicationId, "template.publication", {
    version: 1, base: hidingFirst ? base : { operationId }, published, indexes,
  }) : null;
  return { version: 1, id: operationId, binding: clone(binding), requestedPublication: published,
    operations: publication ? hidingFirst ? [publication, write] : [write, publication] : [write] };
}

export function adminTemplateCommandPlan({ binding, operationId, kind, body, editorSnapshot }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || !["template.metadata", "template.publication", "template.archive", "template.delete"].includes(kind)
    || !exact(editorSnapshot, ["payload", "metadata"])) throw paused();
  canonicalTemplateJson(editorSnapshot);
  const intent = adminTemplateIntent({ ...binding, operationId, kind, body });
  return { version: 2, id: operationId, binding: clone(binding), operations: [intent], editorSnapshot: clone(editorSnapshot) };
}

export function adminTemplateCopyPlan({ binding, operationId, body, sourceSnapshot, editorSnapshot = null }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment") throw paused();
  const intent = adminTemplateIntent({ ...binding, operationId, kind: "template.copy", body });
  // The editor export has normalized layout IDs and UI defaults. Retain that
  // separate comparison snapshot; SQL derives its result from sourceSnapshot.
  if (editorSnapshot && (!exact(editorSnapshot, ["payload", "metadata"]) || !same(editorSnapshot.metadata, intent.body.metadata))) throw paused();
  return { version: 3, id: operationId, binding: clone(binding), operations: [intent], sourceSnapshot: clone(sourceSnapshot),
    editorSnapshot: editorSnapshot ? clone(editorSnapshot) : { payload: projectAdminTemplateCopy(sourceSnapshot, operationId, intent.body.metadata), metadata: clone(intent.body.metadata) } };
}

// An existing target keeps its own revision while a different confirmed
// template supplies the source. Both snapshots survive reload unchanged.
export function adminTemplateSourceSavePlan({ binding, operationId, body, sourceSnapshot }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || !body?.source) throw paused();
  const intent = adminTemplateIntent({ ...binding, operationId, kind: "template.save", body });
  canonicalTemplateJson(sourceSnapshot);
  return { version: 4, id: operationId, binding: clone(binding), operations: [intent], sourceSnapshot: clone(sourceSnapshot) };
}

function validatePlan(plan) {
  if (plan?.version === 10) {
    if (!exact(plan, ["version", "id", "binding", "operations", "sourceEditorSnapshot", "recordIntentHash"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoWholeCopySavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0]?.body, sourceEditorSnapshot: plan.sourceEditorSnapshot, recordIntentHash: plan.recordIntentHash }))) throw paused();
    return plan;
  }
  if (plan?.version === 9) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot", "recordIntentHash"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoTreeCopySavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, editorSnapshot: plan.editorSnapshot, recordIntentHash: plan.recordIntentHash }))) throw paused();
    return plan;
  }
  if (plan?.version === 8) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot", "recordIntentHash"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoCopySavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, editorSnapshot: plan.editorSnapshot, recordIntentHash: plan.recordIntentHash }))) throw paused();
    return plan;
  }
  if (plan?.version === 7) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot", "recordIntentHash"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoCreateSavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, editorSnapshot: plan.editorSnapshot, recordIntentHash: plan.recordIntentHash }))) throw paused();
    return plan;
  }
  if (plan?.version === 6) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot", "photoSnapshot"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoEditSavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, editorSnapshot: plan.editorSnapshot, photoSnapshot: plan.photoSnapshot }))) throw paused();
    return plan;
  }
  if (plan?.version === 5) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplatePhotoSavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, editorSnapshot: plan.editorSnapshot }))) throw paused();
    return plan;
  }
  if (plan?.version === 4) {
    if (!exact(plan, ["version", "id", "binding", "operations", "sourceSnapshot"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplateSourceSavePlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, sourceSnapshot: plan.sourceSnapshot }))) throw paused();
    return plan;
  }
  if (plan?.version === 3) {
    if (!exact(plan, ["version", "id", "binding", "operations", "sourceSnapshot", "editorSnapshot"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1 || !same(plan, adminTemplateCopyPlan({ binding: plan.binding, operationId: plan.id,
        body: plan.operations[0].body, sourceSnapshot: plan.sourceSnapshot, editorSnapshot: plan.editorSnapshot }))) throw paused();
    return plan;
  }
  if (plan?.version === 2) {
    if (!exact(plan, ["version", "id", "binding", "operations", "editorSnapshot"]) || !Array.isArray(plan.operations)
      || plan.operations.length !== 1) throw paused();
    const operation = plan.operations[0];
    if (!same(plan, adminTemplateCommandPlan({ binding: plan.binding, operationId: plan.id, kind: operation.kind,
      body: operation.body, editorSnapshot: plan.editorSnapshot }))) throw paused();
    return plan;
  }
  if (!exact(plan, ["version", "id", "binding", "requestedPublication", "operations"]) || plan.version !== 1
    || !validTemplateOperationId(plan.id) || ![null, true, false].includes(plan.requestedPublication)
    || !Array.isArray(plan.operations) || ![1, 2].includes(plan.operations.length)) throw paused();
  const write = plan.operations.find(operation => ["template.create", "template.save"].includes(operation.kind));
  const publication = plan.operations.find(operation => operation.kind === "template.publication");
  if (!write || write.id !== plan.id) throw paused();
  const hidingFirst = publication?.body.published === false;
  const expected = adminTemplateSavePlan({ binding: plan.binding, operationId: plan.id, publicationId: publication?.id || null,
    exists: write.kind !== "template.create", visibility: write.kind === "template.create" ? null : hidingFirst ? "public" : "private",
    base: hidingFirst ? publication.body.base : write.body.base, payload: write.body.payload, metadata: write.body.metadata,
    published: plan.requestedPublication, indexes: publication?.body.indexes || [] });
  if (!same(plan, expected)) throw paused();
  return plan;
}

// A copied source reads the data snapshot but depends on the final operation of
// the saved choice, including publication after save or hiding before save.
export function adminTemplateDataSourceSnapshot(plan, records = [], { baseline = null, receipts = [] } = {}, visiting = new Set()) {
  validatePlan(plan);
  if (visiting.has(plan.id)) throw paused();
  visiting.add(plan.id);
  if (plan.version === 2) {
    const operation = plan.operations[0];
    if (!["template.metadata", "template.publication", "template.archive"].includes(operation.kind)) throw paused();
    let previous;
    if (operation.body.base.stateRevision && baseline?.stateRevision === operation.body.base.stateRevision && same(baseline.binding, plan.binding)) {
      previous = clone({ payload: baseline.payload, metadata: baseline.metadata, editorSnapshot: baseline.editorSnapshot });
    } else {
      const parents = records.filter(row => {
        const last = row.plan?.operations?.at(-1);
        if (operation.body.base.operationId) return last?.id === operation.body.base.operationId;
        return receipts.some(entry => same(entry.intent, last) && entry.receipt?.operation.state === "committed"
          && entry.receipt.operation.id === last?.id && entry.receipt.operation.listId === plan.binding.listId
          && entry.receipt.result?.payload.stateRevision === operation.body.base.stateRevision);
      });
      if (parents.length !== 1 || parents[0].cancelRequested !== false || !same(parents[0].plan.binding, plan.binding)) throw paused();
      previous = adminTemplateDataSourceSnapshot(parents[0].plan, records, { baseline, receipts }, visiting);
    }
    const choice = operation.body.metadata;
    const metadata = choice ? { title: choice.title, description: previous.metadata.description, language: choice.language } : clone(previous.metadata);
    const editorSnapshot = clone(plan.editorSnapshot), expected = clone(previous.editorSnapshot || { payload: previous.payload, metadata: previous.metadata });
    const layout = Object.values(expected.payload.layouts || {}), selected = Object.values(editorSnapshot.payload.layouts || {});
    if (layout.length !== 1 || selected.length !== 1) throw paused();
    if (choice) {
      expected.metadata = { ...expected.metadata, title: choice.title, language: choice.language };
      layout[0].name = choice.title; layout[0].language = choice.language;
      if (Object.hasOwn(choice, "layoutOrder")) layout[0].layoutOrder = choice.layoutOrder;
    }
    // Touching the label changes only the editor's audit fields. SQL metadata
    // preserves the underlying data snapshot, including its old layout title.
    for (const field of ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]) {
      if (Object.hasOwn(selected[0], field)) layout[0][field] = selected[0][field]; else delete layout[0][field];
    }
    if (!same(expected, editorSnapshot)) throw paused();
    const payload = clone(previous.payload);
    if (choice && Object.hasOwn(choice, "layoutOrder")) {
      const layouts = Object.values(payload.layouts || {}); if (layouts.length !== 1) throw paused();
      layouts[0].layoutOrder = choice.layoutOrder;
    }
    return { operationId: plan.id, payload, metadata, editorSnapshot };
  }
  if (plan.version === 3) return { operationId: plan.id,
    payload: projectAdminTemplateCopy(plan.sourceSnapshot, plan.id, plan.operations[0].body.metadata),
    metadata: clone(plan.operations[0].body.metadata), editorSnapshot: clone(plan.editorSnapshot) };
  if (![1, 4].includes(plan.version)) throw paused();
  const write = plan.operations.find(operation => ["template.create", "template.save"].includes(operation.kind));
  return { operationId: plan.operations.at(-1).id, payload: clone(write.body.payload), metadata: clone(write.body.metadata) };
}

export function createAdminTemplateSavePlans({ binding, client, getContext, shouldCancel = null, getExcludedPlans = null, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED,
  photoCreateEnabled = ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED, photoStore = null,
  photoCopyEnabled = ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, photoCopyStore = null, photoCopyClient = null,
  photoTreeCopyEnabled = ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, photoTreeCopyStore = null, photoTreeCopyClient = null,
  photoWholeCopyEnabled = ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, photoWholeCopyStore = null, photoWholeCopyClient = null,
  assertWholeCopyAdmission = null, readWholeCopyAcceptance = null, readWholeCopyCancellation = null, assertCaptureAllowed = () => {} }) {
  binding = clone(binding);
  const prefix = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
  const key = id => { if (!validTemplateOperationId(id)) throw paused(); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (!value || value.actorId !== binding.actorId || value.environment !== binding.environment || value.listId !== binding.listId
      || value.itemKey !== binding.itemKey || value.scope !== "admin-template" || value.admin !== true || !value.generation) throw paused();
    return clone(value);
  };
  const guard = before => { if (!same(context(), before)) throw paused(); };
  // A retained V10 reserves source and target until typed acceptance. A proved
  // parent cancellation releases its source only; generic UUID exclusions and
  // cancelled target reuse never grant permission.
  const assertNoWholeCopyPlan = async (successor, check) => {
    const scan = () => {
      const found = [];
      for (let index = 0; index < storage.length; index++) {
        const name = storage.key(index);
        if (!name?.startsWith("bike-packing-admin-save-plans-v1:")) continue;
        const raw = storage.getItem(name), saved = JSON.parse(raw), plan = saved?.plan;
        if (plan?.version !== 10) continue;
        validatePlan(plan);
        const source = plan.operations[0].body.source;
        if (plan.binding.actorId === binding.actorId && plan.binding.environment === binding.environment
          && (same(plan.binding, binding) || source.listId === binding.listId && source.itemKey === binding.itemKey)) found.push([name, raw]);
      }
      return found.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    };
    check(); const retained = scan(), guards = [];
    const retainedGuard = () => {
      check(); if (!same(scan(), retained)) throw paused();
    };
    const current = () => {
      retainedGuard();
      for (const proofGuard of guards) {
        const result = proofGuard();
        if (result?.then) { Promise.resolve(result).catch(() => {}); throw paused(); }
        if (result === false) throw paused();
      }
      retainedGuard();
    };
    for (const [name, raw] of retained) {
      const saved = JSON.parse(raw), plan = saved.plan, base = successor.operations[0].body.base;
      if (successor.version === 10
        || !exact(base, ["stateRevision"]) || !Number.isSafeInteger(base.stateRevision) || base.stateRevision < 1
        || !exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1 || saved.cancelRequested !== false
        || name !== "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonicalTemplateJson(plan.binding)) + ":" + plan.id
        || canonicalTemplateJson(saved) !== raw) throw paused();
      const digest = await hash(plan); current(); if (digest !== saved.digest) throw paused();
      if (!same(plan.binding, binding) && typeof readWholeCopyCancellation === "function") {
        const stopped = await readWholeCopyCancellation({ binding: clone(plan.binding), operationId: plan.id, guard: retainedGuard }); current();
        if (stopped) {
          if (!exact(stopped, ["plan", "record", "journal", "certificate", "assertCurrent"]) || typeof stopped.assertCurrent !== "function") throw paused();
          guards.push(stopped.assertCurrent.bind(stopped)); current();
          const value = clone({ plan: stopped.plan, record: stopped.record, journal: stopped.journal, certificate: stopped.certificate });
          if (!same(value.plan, plan) || base.stateRevision < plan.operations[0].body.source.base.stateRevision) throw paused();
          const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, { binding: plan.binding, read: async () => clone(value.record) }, current); current();
          if (!same(value.journal.intent, plan.operations[0]) || value.journal.recordIntentHash !== record.intentHash) throw paused();
          await readAdminTemplatePhotoWholeCopyParentFence({ certificate: value.certificate, parentJournal: value.journal }); current();
          continue;
        }
      }
      if (typeof readWholeCopyAcceptance !== "function") throw paused();
      const proof = await readWholeCopyAcceptance({ binding: clone(plan.binding), operationId: plan.id, guard: retainedGuard }); current();
      if (!exact(proof, ["plan", "record", "journal", "receipt", "stageReceipts", "targetSnapshot", "acceptance", "assertCurrent"])
        || typeof proof.assertCurrent !== "function") throw paused();
      // Detach external data before re-derivation; the live guard still proves
      // retained bytes/mirror acceptance after every asynchronous boundary.
      const { assertCurrent: proofGuard, ...data } = proof, value = clone(data);
      guards.push(proofGuard.bind(proof)); current();
      if (!same(value.plan, plan) || value.record?.intentHash !== plan.recordIntentHash
        || !same(value.receipt, value.journal?.receipt) || !same(value.stageReceipts, value.journal?.stageReceipts)
        || value.receipt?.operation?.state !== "committed"
        || !exact(value.targetSnapshot, ["layoutId", "ownerMap", "beforeState", "metadata"])
        || !exact(value.acceptance, ["version", "kind", "binding", "operationId", "layoutId", "scopeKey", "mirrorKey",
          "recordIntentHash", "planDigest", "terminalJournalDigest", "targetSnapshotDigest"])) throw paused();
      const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan,
        { binding: plan.binding, read: async () => clone(value.record) }, current); current();
      const validated = await validateAdminTemplatePhotoWholeCopyJournal(value.journal); current();
      if (!same(validated.journal.intent, plan.operations[0]) || !same(validated.manifests, record.stages)
        || value.journal.recordIntentHash !== record.intentHash) throw paused();
      const accepted = value.acceptance;
      if (accepted.version !== 1 || accepted.kind !== "admin-template-photo-whole-copy-accepted"
        || !same(accepted.binding, plan.binding) || accepted.operationId !== plan.id
        || accepted.layoutId !== record.snapshot.target.layoutId || value.targetSnapshot.layoutId !== accepted.layoutId
        || accepted.scopeKey !== `id:${plan.binding.actorId}` || typeof accepted.mirrorKey !== "string" || !accepted.mirrorKey
        || accepted.recordIntentHash !== record.intentHash || accepted.planDigest !== digest
        || !same(value.targetSnapshot.metadata, record.snapshot.target.metadata)) throw paused();
      // Historical acceptance excludes mutable dispatch/availability observations.
      const terminal = Object.fromEntries(["version", "kind", "intent", "payloadDigest", "recordIntentHash", "stageReceipts", "receipt"]
        .map(field => [field, value.journal[field]]));
      terminal.stageReceipts = value.stageReceipts.map(stage => stage.receipt);
      const journalDigest = await hash(terminal); current();
      const targetDigest = await hash(value.targetSnapshot); current();
      if (accepted.terminalJournalDigest !== journalDigest || accepted.targetSnapshotDigest !== targetDigest) throw paused();
      const revision = same(plan.binding, binding) ? value.receipt.result.payload.stateRevision : plan.operations[0].body.source.base.stateRevision;
      if (!Number.isSafeInteger(revision) || base.stateRevision < revision) throw paused();
    }
    current(); return { assertCurrent: current, keys: new Set(retained.map(([name]) => name)) };
  };
  // Trusted application code must check the complete retained inventory,
  // unchanged raw source and absent target (or this exact own pending target).
  // A default no-op, boolean-shaped proof or asynchronous guard is no authority.
  const wholeAdmission = (plan, record, captureLease, check) => {
    check();
    const source = plan.operations[0].body.source;
    assertAdminTemplateCaptureLease(captureLease, [binding, { ...binding, listId: source.listId, itemKey: source.itemKey }]);
    if (typeof assertWholeCopyAdmission !== "function") throw paused();
    const allowed = assertWholeCopyAdmission({ plan: clone(plan), record: clone(record), captureLease, guard: check });
    if (allowed?.then) { Promise.resolve(allowed).catch(() => {}); throw paused(); }
    if (allowed !== true) throw paused();
    check();
  };
  const lock = (id, task) => { if (!locks?.request) throw paused(); return locks.request(key(id), task); };
  const persist = (saved, initial) => {
    guard(initial); const encoded = canonicalTemplateJson(saved); storage.setItem(key(saved.plan.id), encoded);
    if (storage.getItem(key(saved.plan.id)) !== encoded) throw paused(); guard(initial); return saved;
  };
  const read = async id => {
    const initial = context();
    const raw = storage.getItem(key(id)); if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (!exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1 || typeof saved.cancelRequested !== "boolean"
      || saved.plan.id !== id || !same(saved.plan.binding, binding) || saved.digest !== await hash(validatePlan(saved.plan))) throw paused();
    if ([3, 4].includes(saved.plan.version) && await adminTemplateCopyPayloadDigest(saved.plan.sourceSnapshot) !== saved.plan.operations[0].body.source.payloadDigest) throw paused();
    if (saved.plan.version === 7) {
      guard(initial);
      await assertAdminTemplatePhotoCreatePlanRecord(saved.plan, photoStore, () => guard(initial)); guard(initial);
    }
    if (saved.plan.version === 8) {
      guard(initial);
      await assertAdminTemplatePhotoCopyPlanRecord(saved.plan, photoCopyStore, () => guard(initial)); guard(initial);
    }
    if (saved.plan.version === 9) {
      guard(initial);
      // No V9 cancel/adoption adapter exists. A generic cancel marker cannot
      // turn this typed record into V8 authority or exclude it from admission.
      if (saved.cancelRequested) throw paused();
      await assertAdminTemplatePhotoTreeCopyPlanRecord(saved.plan, photoTreeCopyStore, () => guard(initial)); guard(initial);
      if (storage.getItem(key(id)) !== raw) throw paused();
    }
    if (saved.plan.version === 10) {
      if (saved.cancelRequested) throw paused();
      await assertAdminTemplatePhotoWholeCopyPlanRecord(saved.plan, photoWholeCopyStore, () => guard(initial)); guard(initial);
      if (storage.getItem(key(id)) !== raw) throw paused();
    }
    return saved;
  };
  const executeWhole = async (saved, cancel, initial, captureLease) => {
    const plan = saved.plan, intent = plan.operations[0], retained = storage.getItem(key(plan.id));
    if (retained === null || !same(JSON.parse(retained), saved)) throw paused();
    const check = () => { guard(initial); if (storage.getItem(key(plan.id)) !== retained) throw paused(); };
    const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, photoWholeCopyStore, check); check();
    const current = () => {
      check();
      if (photoWholeCopyEnabled === true) wholeAdmission(plan, record, captureLease, check);
    };
    current();
    if (cancel || saved.cancelRequested || await shouldCancel?.(plan.id)) throw paused(); current();
    if (!photoWholeCopyClient || !same(photoWholeCopyClient.binding, binding)) throw paused();
    const proof = async () => {
      const readback = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, photoWholeCopyStore, current); current();
      if (!same(record, readback)) throw paused();
    };
    const known = async () => {
      if (typeof photoWholeCopyClient.read !== "function") throw paused();
      const value = await photoWholeCopyClient.read(intent.id); current();
      const row = value ? clone(value) : null; await proof(); current();
      if (!row) return null;
      const validated = await validateAdminTemplatePhotoWholeCopyJournal(row); current();
      if (!same(validated.journal.intent, intent) || row.recordIntentHash !== plan.recordIntentHash
        || !same(validated.manifests, record.stages)) throw paused();
      const readback = await photoWholeCopyClient.read(intent.id); current();
      if (!readback || !same(readback, row)) throw paused();
      await proof(); current();
      return row;
    };
    let readback, receipt;
    if (photoWholeCopyEnabled !== true) {
      readback = await known(); current(); if (!readback) throw paused();
      if (!readback.receipt) {
        if (typeof photoWholeCopyClient.inspect !== "function") throw paused();
        await photoWholeCopyClient.inspect(intent.id); current(); readback = await known(); current();
      }
      receipt = readback?.receipt;
    } else {
      if (typeof photoWholeCopyClient.capture !== "function" || typeof photoWholeCopyClient.run !== "function") throw paused();
      await photoWholeCopyClient.capture({ operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body });
      current(); await proof(); current();
      if (await shouldCancel?.(plan.id)) throw paused(); current();
      const before = await known(); current(); if (!before || before.cancelRequested === true) throw paused();
      receipt = clone(await photoWholeCopyClient.run(intent.id)); current();
      readback = await known(); current();
      if (!readback || !same(readback.receipt, receipt)) throw paused();
    }
    if (!receipt || !["committed", "rejected"].includes(receipt.operation.state)) throw paused();
    await proof(); current();
    // Receipt fact only; no target application, source mutation, cancellation,
    // stage retirement or reuse of allocations follows from registry execution.
    return { state: receipt.operation.state, receipts: [clone(receipt)] };
  };
  const executeTree = async (saved, cancel, initial, captureLease, assertAccepted = () => {}) => {
    const plan = saved.plan, intent = plan.operations[0], source = intent.body.photoCopy.source;
    const bindings = [binding, { ...binding, listId: source.listId, itemKey: source.itemKey }];
    const retainedPlan = storage.getItem(key(plan.id));
    if (retainedPlan === null || !same(JSON.parse(retainedPlan), saved)) throw paused();
    // Dispatch enters with the caller's genuine source+target lease already
    // held OUTSIDE the plan/command locks. Never acquire common locks here.
    // Own-OFF recovery is GET-only and needs no dispatch lease.
    const current = () => {
      guard(initial); assertAccepted(); if (storage.getItem(key(plan.id)) !== retainedPlan) throw paused();
      if (photoTreeCopyEnabled === true) assertAdminTemplateCaptureLease(captureLease, bindings);
    };
    current();
    if (cancel || saved.cancelRequested || await shouldCancel?.(plan.id)) throw paused();
    current();
    if (!photoTreeCopyClient || !exact(photoTreeCopyClient.binding, ["actorId", "environment", "listId", "itemKey"])
      || !same(photoTreeCopyClient.binding, binding)) throw paused();
    const proof = async () => {
      const record = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, photoTreeCopyStore, current); current();
      return record;
    };
    const { id: ignoredId, ...encoded } = intent, payloadDigest = await hash(encoded); current();
    const known = async () => {
      if (typeof photoTreeCopyClient.read !== "function") throw paused();
      const value = await photoTreeCopyClient.read(intent.id); current(); const row = value ? clone(value) : null;
      const record = await proof(); current(); if (!row) return null;
      const keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
      if (!(exact(row, keys) || exact(row, [...keys, "cancelRequested"]))
        || Object.hasOwn(row, "cancelRequested") && typeof row.cancelRequested !== "boolean"
        || row.version !== 1 || row.kind !== "admin-template-photo-tree-copy" || !same(row.intent, intent) || row.payloadDigest !== payloadDigest
        || row.recordIntentHash !== plan.recordIntentHash || typeof row.dispatched !== "boolean"
        || !Array.isArray(row.stageReceipts) || row.stageReceipts.length !== record.stages.length) throw paused();
      const assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
      for (const [index, receipt] of row.stageReceipts.entries()) if (receipt !== null) {
        const valid = await validateAdminTemplatePhotoTreeCopyStageReceipt(receipt, { manifest: record.stages[index], assetDigest: assets[index].assetDigest }); current();
        if (!valid) throw paused();
      }
      if (row.stageReceipts.every(Boolean)) {
        const valid = await validateAdminTemplatePhotoTreeCopyStages(intent, row.stageReceipts); current();
        if (!valid) throw paused();
      }
      if (row.receipt !== null) {
        const valid = await validateAdminTemplatePhotoTreeCopyReceipt(row.receipt, { intent, payloadDigest, stageReceipts: row.stageReceipts }); current();
        if (!valid) throw paused();
      }
      return row;
    };
    await proof(); current();
    let receipt, readback;
    if (photoTreeCopyEnabled !== true) {
      readback = await known(); current(); if (!readback) throw paused();
      if (!readback.receipt) {
        if (typeof photoTreeCopyClient.inspect !== "function") throw paused();
        await photoTreeCopyClient.inspect(intent.id); current(); await proof(); current();
        readback = await known(); current();
      }
      receipt = readback?.receipt;
    } else {
      if (typeof photoTreeCopyClient.capture !== "function" || typeof photoTreeCopyClient.run !== "function") throw paused();
      await photoTreeCopyClient.capture({ operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body });
      current(); await proof(); current();
      // A stop observed while capturing pauses before business dispatch. It is
      // not persisted as a cancellation request by this registry version.
      if (await shouldCancel?.(plan.id)) throw paused(); current();
      const beforeDispatch = await known(); current();
      if (!beforeDispatch || beforeDispatch.cancelRequested === true) throw paused();
      receipt = clone(await photoTreeCopyClient.run(intent.id)); current(); await proof(); current();
      readback = await known(); current();
      if (!readback || !same(readback.receipt, receipt)) throw paused();
    }
    if (!receipt || !["committed", "rejected"].includes(receipt.operation.state)) throw paused();
    await proof(); current();
    // Even an authenticated strong cancellation is only a rejected terminal
    // fact here. V8's cancelled/adopted-stop/retirement paths are never used.
    return { state: receipt.operation.state, receipts: [clone(receipt)] };
  };
  const execute = async (id, cancel, { captureLease } = {}) => {
    if (enabled !== true) throw paused(); const initial = context();
    return lock(id, async () => {
      let saved = await read(id); guard(initial); if (!saved) throw paused();
      if (saved.plan.version === 10) return executeWhole(saved, cancel, initial, captureLease);
      let retained = storage.getItem(key(id));
      if (retained === null || !same(JSON.parse(retained), saved)) throw paused();
      const successorGuard = () => { guard(initial); if (storage.getItem(key(id)) !== retained) throw paused(); };
      const release = await assertNoWholeCopyPlan(saved.plan, successorGuard);
      const current = release.assertCurrent; current();
      if (saved.plan.version === 9) return executeTree(saved, cancel, initial, captureLease, current);
      if ((cancel || await shouldCancel?.(id)) && !saved.cancelRequested) {
        current(); saved = persist({ ...saved, cancelRequested: true }, initial); retained = storage.getItem(key(id));
      }
      let ordered = saved.cancelRequested ? [...saved.plan.operations].reverse() : saved.plan.operations;
      const receipts = [];
      for (let index = 0; index < ordered.length; index++) {
        // A chain-wide stop can arrive while an earlier request is in flight.
        // Revisit the original IDs in reverse order before starting another effect.
        if (!saved.cancelRequested && await shouldCancel?.(id)) {
          current(); saved = persist({ ...saved, cancelRequested: true }, initial); retained = storage.getItem(key(id));
          ordered = [...saved.plan.operations].reverse(); receipts.length = 0; index = 0;
        }
        const intent = ordered[index];
        if (saved.plan.version === 8) {
          // Separate derived-copy authority: never pass this intent to the
          // ordinary/upload client, including cancellation and OFF recovery.
          current();
          if (!photoCopyClient || !exact(photoCopyClient.binding, ["actorId", "environment", "listId", "itemKey"])
            || !same(photoCopyClient.binding, binding)) throw paused();
          const proof = async () => { await assertAdminTemplatePhotoCopyPlanRecord(saved.plan, photoCopyStore, () => guard(initial)); current(); };
          await proof();
          let receipt;
          if (photoCopyEnabled !== true && !saved.cancelRequested) {
            let known = await photoCopyClient.read(intent.id); current(); await proof();
            if (!known || !same(known.intent, intent) || known.recordIntentHash !== saved.plan.recordIntentHash) throw paused();
            if (!["committed", "rejected"].includes(known.receipt?.operation.state)) {
              if (typeof photoCopyClient.inspect !== "function") throw paused();
              await photoCopyClient.inspect(intent.id); current(); await proof();
              known = await photoCopyClient.read(intent.id); current(); await proof();
            }
            if (!known || !same(known.intent, intent) || known.recordIntentHash !== saved.plan.recordIntentHash
              || !["committed", "rejected"].includes(known.receipt?.operation.state)) throw paused();
            receipt = known.receipt;
          } else {
            const method = saved.cancelRequested ? "cancel" : "run";
            if (typeof photoCopyClient[method] !== "function") throw paused();
            await photoCopyClient.capture({ operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body });
            current(); await proof();
            receipt = await photoCopyClient[method](intent.id); current(); await proof();
          }
          receipts.push(receipt);
          if (!saved.cancelRequested && receipt.operation.state !== "committed") return { state: receipt.operation.state, receipts };
          if (receipt.operation.state === "waiting") return { state: "waiting", receipts };
          continue;
        }
        if (saved.plan.version === 7 && photoCreateEnabled !== true && !saved.cancelRequested) {
          const known = await client.read(intent.id); current();
          if (!known || !same(known.intent, intent) || !["committed", "rejected"].includes(known.receipt?.operation.state)) throw paused();
        }
        current(); await client.capture({ operationId: intent.id, kind: intent.kind, body: intent.body }); current();
        if (saved.plan.version === 7) { await assertAdminTemplatePhotoCreatePlanRecord(saved.plan, photoStore, () => guard(initial)); current(); }
        const receipt = await client[saved.cancelRequested ? "cancel" : "run"](intent.id); current(); receipts.push(receipt);
        if (saved.plan.version === 7) { await assertAdminTemplatePhotoCreatePlanRecord(saved.plan, photoStore, () => guard(initial)); current(); }
        if (!saved.cancelRequested && receipt.operation.state !== "committed") return { state: receipt.operation.state, receipts };
        if (receipt.operation.state === "waiting") return { state: "waiting", receipts };
      }
      const cancelled = receipts.some(receipt => receipt.result?.payload?.code === "operation_cancelled");
      const rejected = receipts.some(receipt => receipt.operation.state === "rejected");
      return { state: cancelled ? "cancelled" : rejected ? "rejected" : "committed", receipts };
    });
  };
  const capturePlan = async (input, makePlan, { captureLease } = {}) => {
    if (enabled !== true || typeof assertCaptureAllowed !== "function") throw paused(); const initial = context();
    const plan = makePlan({ ...input, binding }); // Freeze before hashing or acquiring a cross-tab lock.
    const bindings = [plan.binding];
    if ([8, 9, 10].includes(plan.version)) {
      const source = plan.version === 10 ? plan.operations[0].body.source : plan.operations[0].body.photoCopy.source;
      bindings.push({ actorId: plan.binding.actorId, environment: plan.binding.environment, listId: source.listId, itemKey: source.itemKey });
    }
    if ([9, 10].includes(plan.version) && captureLease === undefined) throw paused();
    const underLease = async lease => {
      const baseCaptureGuard = () => { guard(initial); assertAdminTemplateCaptureLease(lease, bindings); };
      let release = null;
      const captureGuard = () => { baseCaptureGuard(); release?.assertCurrent(); };
      captureGuard();
      if (plan.version === 7) {
        await assertAdminTemplatePhotoCreatePlanRecord(plan, photoStore, captureGuard); captureGuard();
      }
      if (plan.version === 8) {
        await assertAdminTemplatePhotoCopyPlanRecord(plan, photoCopyStore, captureGuard); captureGuard();
      }
      if (plan.version === 9) {
        await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, photoTreeCopyStore, captureGuard); captureGuard();
      }
      let wholeRecord;
      if (plan.version === 10) {
        wholeRecord = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, photoWholeCopyStore, captureGuard); captureGuard();
        wholeAdmission(plan, wholeRecord, lease, captureGuard);
      }
      if ([3, 4].includes(plan.version) && await adminTemplateCopyPayloadDigest(plan.sourceSnapshot) !== plan.operations[0].body.source.payloadDigest) throw paused();
      captureGuard();
      const saved = { version: 1, plan, digest: await hash(plan), cancelRequested: false }; captureGuard();
      const capture = () => lock(plan.id, async () => {
        captureGuard();
        const existing = await read(plan.id); captureGuard();
        if (existing && !same(existing.plan, plan)) throw paused();
        if (plan.version !== 10) { release = await assertNoWholeCopyPlan(plan, baseCaptureGuard); captureGuard(); }
        // The caller checks the other durable journals even for an exact
        // retained plan with its own feature OFF. This hook cannot mutate the
        // frozen action, and a lease alone never grants capture authority.
        const allowed = await assertCaptureAllowed({ plan: clone(plan), captureLease: lease, guard: captureGuard }); captureGuard();
        if (allowed === false) throw paused();
        if (plan.version === 10) wholeAdmission(plan, wholeRecord, lease, captureGuard);
        if (existing) {
          if ([9, 10].includes(plan.version)) {
            const retained = await read(plan.id); captureGuard(); if (!same(retained, existing)) throw paused();
            if (plan.version === 10) wholeAdmission(plan, wholeRecord, lease, captureGuard);
          }
          return clone(existing);
        }
        if (plan.version === 7 && photoCreateEnabled !== true) throw paused();
        if (plan.version === 8 && photoCopyEnabled !== true) throw paused();
        if (plan.version === 9 && photoTreeCopyEnabled !== true) throw paused();
        if (plan.version === 10 && photoWholeCopyEnabled !== true) throw paused();
        // Only the caller's validated adopted-stop resolution may exclude a
        // retained action. A cancellation marker alone proves no adoption.
        const excluded = getExcludedPlans ? await getExcludedPlans() : []; captureGuard();
        if (!Array.isArray(excluded) || excluded.some(id => !validTemplateOperationId(id)) || new Set(excluded).size !== excluded.length) throw paused();
        // A new photo selection cannot overtake an already retained action.
        // Legacy forms mutate/persist before capture: keep their later intent
        // durable even when a photo plan has won this base. SQL will reject a
        // stale writer; the application preserves each editor for recovery.
        const base = plan.operations[0].body.base;
        const ids = [];
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length));
        }
        for (const id of ids) {
          // The acceptance adapter supplied the full V10 store proof; a generic
          // successor need not pretend its own typed store is the V10 store.
          if (plan.version !== 10 && release?.keys.has(key(id))) { captureGuard(); continue; }
          const other = await read(id); captureGuard();
          if (!other) continue;
          if (other.plan.version === 10 || plan.version === 10) throw paused();
          // V9 has no adopted-stop exclusion protocol. Existing V8 exclusion
          // IDs cannot release a retained tree, in either capture direction.
          if (other.plan.version === 9 && same(other.plan.operations[0].body.base, base)) throw paused();
          if (plan.version === 9 && !excluded.includes(id) && same(other.plan.operations[0].body.base, base)) throw paused();
          if (!excluded.includes(id) && plan.version === 6 && same(other.plan.operations[0].body.base, base)) throw paused();
          if (!excluded.includes(id) && ([7, 8].includes(plan.version) || [7, 8].includes(other.plan.version)) && same(other.plan.operations[0].body.base, base)) throw paused();
          // A generic successor cannot bypass an unsettled photo selection by
          // pointing at its UUID. A reconciled editor uses its numeric receipt.
          if ([6, 7, 8, 9, 10].includes(other.plan.version) && base?.operationId === other.plan.operations.at(-1).id) throw paused();
        }
        if (plan.version === 8) { await assertAdminTemplatePhotoCopyPlanRecord(plan, photoCopyStore, captureGuard); captureGuard(); }
        if (plan.version === 9) { await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, photoTreeCopyStore, captureGuard); captureGuard(); }
        if (plan.version === 10) {
          const currentRecord = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, photoWholeCopyStore, captureGuard); captureGuard();
          if (!same(currentRecord, wholeRecord)) throw paused();
          wholeAdmission(plan, wholeRecord, lease, captureGuard);
        }
        if (plan.version !== 10) { release = await assertNoWholeCopyPlan(plan, baseCaptureGuard); captureGuard(); }
        captureGuard();
        return clone(persist(saved, initial));
      });
      const base = plan.operations[0].body.base;
      let result;
      if (base?.stateRevision) {
        if (!locks?.request) throw paused();
        result = await locks.request(prefix + "confirmed-base:" + base.stateRevision, capture);
      } else result = await capture();
      captureGuard(); return result;
    };
    return captureLease === undefined ? withAdminTemplateCapture({ bindings, locks }, underLease) : underLease(captureLease);
  };
  return Object.freeze({
    capture: (input, options) => capturePlan(input, adminTemplateSavePlan, options),
    captureCommand: (input, options) => capturePlan(input, adminTemplateCommandPlan, options),
    captureCopy: (input, options) => capturePlan(input, adminTemplateCopyPlan, options),
    captureSourceSave: (input, options) => capturePlan(input, adminTemplateSourceSavePlan, options),
    capturePhoto: (input, options) => capturePlan(input, adminTemplatePhotoSavePlan, options),
    capturePhotoEdit: (input, options) => capturePlan(input, adminTemplatePhotoEditSavePlan, options),
    capturePhotoCreate: (input, options) => capturePlan(input, adminTemplatePhotoCreateSavePlan, options),
    capturePhotoCopy: (input, options) => capturePlan(input, adminTemplatePhotoCopySavePlan, options),
    capturePhotoTreeCopy: (input, options) => capturePlan(input, adminTemplatePhotoTreeCopySavePlan, options),
    capturePhotoWholeCopy: (input, options) => capturePlan(input, adminTemplatePhotoWholeCopySavePlan, options),
    async read(id) { const initial = context(), saved = await read(id); guard(initial); return clone(saved); },
    async list() {
      const initial = context(), ids = [];
      for (let i = 0; i < storage.length; i++) { const name = storage.key(i); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length)); }
      const entries = []; for (const id of ids) { const entry = await read(id); if (entry) entries.push(entry); }
      guard(initial); return clone(entries);
    },
    run: (id, options) => execute(id, false, options), cancel: (id, options) => execute(id, true, options),
  });
}
