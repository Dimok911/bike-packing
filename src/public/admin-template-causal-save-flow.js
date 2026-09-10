import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplatePlanChain } from "./admin-template-recovery.js";

const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const blocked = () => Object.assign(Error("Сохранение шаблона приостановлено. Откройте его сохранённые изменения для продолжения."),
  { code: "admin-template-ui-paused", isAdminTemplateBlocked: true });
const recoveryRequired = () => Object.assign(blocked(), { code: "admin-template-editor-recovery-required" });
const finalOperationId = plan => plan.operations.at(-1).id;
const writeOperation = plan => plan.operations.find(operation => ["template.save", "template.create"].includes(operation.kind));
const planSnapshot = plan => plan.version === 2 ? plan.editorSnapshot
  : { payload: writeOperation(plan).body.payload, metadata: writeOperation(plan).body.metadata };
const plannedVisibility = (plan, fallback) => {
  const publication = plan.operations.find(operation => operation.kind === "template.publication");
  if (publication) return publication.body.published ? "public" : "private";
  if (plan.operations.some(operation => operation.kind === "template.delete")) return null;
  if (plan.operations.some(operation => operation.kind === "template.archive")) return "private";
  return fallback || "private";
};

// A plan and an editor snapshot occupy different storage records. Discover a
// durable successor left between these writes, including one from another tab.
// A fork is never ordered by timestamps, storage enumeration or UUID values.
function savedSuccessor(observed, saved) {
  let base = observed.base, latest = null;
  const visited = new Set(), chain = [];
  for (;;) {
    const children = saved.filter(({ plan }) => equal(plan.operations[0].body.base, base));
    if (!children.length) return latest ? { ...latest, chain } : null;
    if (children.length !== 1 || visited.has(children[0].plan.id)) throw recoveryRequired();
    latest = children[0]; visited.add(latest.plan.id); chain.push(latest.plan);
    base = { operationId: finalOperationId(latest.plan) };
  }
}

// This metadata describes the editor's observed source, never the current server
// version fetched after an edit. It must not become public template content.
export function stripAdminTemplateEditorMetadata(payload) {
  const result = clone(payload);
  for (const layout of Object.values(result.layouts || {})) {
    for (const key of ["adminCausalSource", "templateDraftSyncPending", "templateDraftServerHydrated",
      "templatePublished", "templateUnpublishPending", "adminDemo", "adminDemoLanguage", "adminDemoListId",
      "adminSharedSourceId", "adminTemplateCopy", "publicCatalogLayoutId"]) delete layout[key];
  }
  return result;
}

export function adminTemplateEditorSource(binding, prepared) {
  if (!prepared?.ok || prepared.deleted || prepared.actorId !== binding.actorId || prepared.environment !== binding.environment
    || prepared.listId !== binding.listId || prepared.itemKey !== binding.itemKey || typeof prepared.exists !== "boolean"
    || prepared.exists && (!Number.isSafeInteger(prepared.stateRevision) || prepared.stateRevision < 1 || !["private", "public"].includes(prepared.visibility))
    || !Array.isArray(prepared.indexes)) throw blocked();
  return { version: 1, binding: clone(binding), exists: prepared.exists, visibility: prepared.exists ? prepared.visibility : null,
    base: prepared.exists ? { stateRevision: prepared.stateRevision } : null, indexes: clone(prepared.indexes), planId: null };
}

export function createAdminTemplateSaveFlow({ getLayout, getContext, snapshot, plansFor, recoveryFor = null, persist, notify = () => {},
  uuid = () => crypto.randomUUID(), enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  const captures = new Map();
  const source = layout => {
    const value = layout?.adminCausalSource;
    if (!value || value.version !== 1 || value.deleted && !value.planId || !value.binding || value.binding.actorId !== getContext(value.binding).actorId) throw blocked();
    return clone(value);
  };
  const guard = (layoutId, layout, initial, binding) => {
    if (getLayout(layoutId) !== layout || !equal(getContext(binding), initial)) throw blocked();
  };
  const capture = async (layoutId, { published = null } = {}) => {
    if (enabled !== true) throw blocked();
    const layout = getLayout(layoutId), observed = source(layout), initial = clone(getContext(observed.binding));
    const candidate = clone(snapshot(layoutId)); candidate.payload = stripAdminTemplateEditorMetadata(candidate.payload);
    const previous = captures.get(layoutId), sameEditor = previous?.layout === layout && equal(previous.binding, observed.binding);
    if (sameEditor && previous.mode === "save" && previous.published === published && equal(previous.candidate, candidate)) return previous.promise;
    const base = sameEditor ? previous.nextSource : observed;
    if (base.deleted) throw blocked();
    const operationId = uuid(), needsPublication = published === true || published === false && base.visibility === "public";
    const publicationId = needsPublication ? uuid() : null;
    const input = { operationId, publicationId, exists: base.exists, visibility: base.visibility, base: base.base,
      payload: candidate.payload, metadata: candidate.metadata, published,
      indexes: published === false && needsPublication ? base.indexes : [] };
    const finalId = published === true ? publicationId : operationId;
    const nextSource = { ...base, exists: true, base: { operationId: finalId }, planId: operationId,
      visibility: published === null ? base.visibility || "private" : published ? "public" : "private",
      indexes: published === false ? [] : base.indexes };
    const job = { mode: "save", layout, binding: base.binding, id: operationId, candidate, published, nextSource, promise: null };
    captures.set(layoutId, job);
    job.promise = (sameEditor ? previous.promise : Promise.resolve()).then(async () => {
      guard(layoutId, layout, initial, base.binding);
      const plans = plansFor(base.binding, layoutId);
      await recoveryFor?.(base.binding, layoutId).assertCanAppend(base.planId);
      guard(layoutId, layout, initial, base.binding);
      if (savedSuccessor(base, await plans.list())) throw recoveryRequired();
      guard(layoutId, layout, initial, base.binding);
      await plans.capture(input);
      guard(layoutId, layout, initial, base.binding);
      // A newer capture already carries this operation as its predecessor.
      if (captures.get(layoutId) === job) {
        layout.adminCausalSource = clone(nextSource); layout.templateDraftSyncPending = true;
        persist(); notify("pending", layoutId);
      }
      return clone({ operationId, finalOperationId: finalId });
    });
    return job.promise;
  };
  const captureCommand = async (layoutId, { kind, metadata, published } = {}) => {
    if (enabled !== true) throw blocked();
    const layout = getLayout(layoutId), observed = source(layout), initial = clone(getContext(observed.binding));
    const candidate = clone(snapshot(layoutId)); candidate.payload = stripAdminTemplateEditorMetadata(candidate.payload);
    const previous = captures.get(layoutId), sameEditor = previous?.layout === layout && equal(previous.binding, observed.binding);
    const base = sameEditor ? previous.nextSource : observed;
    if (!sameEditor && observed.planId) {
      // A repeated button press after reload must continue its durable command,
      // including the original index revisions, rather than append a new UUID.
      const saved = await plansFor(base.binding, layoutId).list();
      guard(layoutId, layout, initial, base.binding);
      const current = clone(snapshot(layoutId)); current.payload = stripAdminTemplateEditorMetadata(current.payload);
      if (captures.get(layoutId) !== previous || !equal(source(layout), observed) || !equal(current, candidate)) throw blocked();
      const plan = saved.find(row => row.plan.id === observed.planId)?.plan;
      if (!plan) throw recoveryRequired();
      const operation = plan.operations.at(-1);
      const sameChoice = operation.kind === kind && (kind === "template.metadata" ? equal(operation.body.metadata, metadata)
        : kind === "template.publication" ? operation.body.published === published : ["template.archive", "template.delete"].includes(kind));
      if (plan.version === 2 && sameChoice && equal(planSnapshot(plan), candidate)) {
        return { operationId: plan.id, finalOperationId: operation.id };
      }
    }
    if (!base.exists || base.deleted) throw blocked();
    const fields = kind === "template.metadata" ? { metadata: clone(metadata) }
      : kind === "template.publication" ? { published, indexes: published ? [] : base.indexes } : { indexes: base.indexes };
    if (sameEditor && previous.mode === "command" && previous.kind === kind && equal(previous.fields, fields)
      && equal(previous.candidate, candidate)) return previous.promise;
    const operationId = uuid(), body = clone({ version: 1, base: base.base, ...fields });
    const visibility = kind === "template.publication" ? published ? "public" : "private"
      : kind === "template.archive" ? "private" : kind === "template.delete" ? null : base.visibility;
    const nextSource = { ...base, base: { operationId }, planId: operationId, visibility,
      deleted: kind === "template.delete", indexes: kind === "template.metadata" || published === true ? base.indexes : [] };
    const job = { mode: "command", kind, fields: clone(fields), layout, binding: base.binding, id: operationId, candidate, nextSource, promise: null };
    captures.set(layoutId, job);
    job.promise = (sameEditor ? previous.promise : Promise.resolve()).then(async () => {
      guard(layoutId, layout, initial, base.binding);
      const plans = plansFor(base.binding, layoutId);
      await recoveryFor?.(base.binding, layoutId).assertCanAppend(base.planId);
      guard(layoutId, layout, initial, base.binding);
      if (savedSuccessor(base, await plans.list())) throw recoveryRequired();
      guard(layoutId, layout, initial, base.binding);
      await plans.captureCommand({ operationId, kind, body, editorSnapshot: candidate });
      guard(layoutId, layout, initial, base.binding);
      if (captures.get(layoutId) === job) {
        layout.adminCausalSource = clone(nextSource); layout.templateDraftSyncPending = true;
        persist(); notify("pending", layoutId);
      }
      return { operationId, finalOperationId: operationId };
    });
    return job.promise;
  };
  const recover = async layoutId => {
    const layout = getLayout(layoutId), observed = source(layout), initial = clone(getContext(observed.binding));
    const saved = await plansFor(observed.binding, layoutId).list(); guard(layoutId, layout, initial, observed.binding);
    const successor = savedSuccessor(observed, saved);
    if (!successor) return { state: observed.planId ? "pending" : "idle" };
    const current = clone(snapshot(layoutId)); current.payload = stripAdminTemplateEditorMetadata(current.payload);
    if (!equal(current, planSnapshot(successor.plan))) throw recoveryRequired();
    const visibility = successor.chain.reduce((value, plan) => plannedVisibility(plan, value), observed.visibility);
    const removedReferences = successor.chain.some(plan => plan.operations.some(operation =>
      ["template.archive", "template.delete"].includes(operation.kind) || operation.kind === "template.publication" && !operation.body.published));
    layout.adminCausalSource = { ...observed, exists: true, planId: successor.plan.id,
      base: { operationId: finalOperationId(successor.plan) },
      visibility, deleted: successor.plan.operations.at(-1).kind === "template.delete",
      indexes: removedReferences ? [] : observed.indexes };
    layout.templateDraftSyncPending = true; captures.delete(layoutId); persist(); notify("pending", layoutId);
    return { state: "pending" };
  };
  const flush = async layoutId => {
    if (enabled !== true) throw blocked();
    const layout = getLayout(layoutId), pending = captures.get(layoutId);
    let captureError = null;
    if (pending?.layout === layout) await pending.promise.catch(error => { captureError = error; });
    const observed = source(layout), initial = clone(getContext(observed.binding));
    if (!observed.planId) { if (captureError) throw captureError; return { state: "idle" }; }
    const stopped = await recoveryFor?.(observed.binding, layoutId).resumeStop(observed.planId);
    guard(layoutId, layout, initial, observed.binding);
    if (stopped) { notify(stopped.state, layoutId); return stopped; }
    if (captureError) throw captureError;
    const plans = plansFor(observed.binding, layoutId), saved = await plans.list(); guard(layoutId, layout, initial, observed.binding);
    const ordered = adminTemplatePlanChain(observed.planId, saved);
    let result;
    for (const { plan } of ordered) {
      const stopping = await recoveryFor?.(observed.binding, layoutId).resumeStop(observed.planId);
      guard(layoutId, layout, initial, observed.binding);
      if (stopping) { notify(stopping.state, layoutId); return stopping; }
      guard(layoutId, layout, initial, observed.binding); result = await plans.run(plan.id); guard(layoutId, layout, initial, observed.binding);
      if (result.state !== "committed") { notify(result.state, layoutId); return result; }
    }
    // Confirm only the currently displayed candidate. A response for an older
    // queued save cannot clear a newer draft or replace its source dependency.
    const plan = ordered.at(-1).plan;
    const current = clone(snapshot(layoutId)); current.payload = stripAdminTemplateEditorMetadata(current.payload);
    if (layout.adminCausalSource?.planId !== observed.planId || captures.get(layoutId)?.id && captures.get(layoutId).id !== observed.planId
      || !equal(current, planSnapshot(plan))) return { ...result, applied: false };
    const finalId = plan.operations.at(-1).id, receipt = result.receipts.find(value => value.operation.id === finalId);
    if (!receipt?.result?.payload?.stateRevision) throw blocked();
    layout.adminCausalSource = { ...observed, base: { stateRevision: receipt.result.payload.stateRevision },
      visibility: receipt.result.payload.visibility || null, deleted: receipt.result.payload.deleted === true, planId: null,
      lastConfirmedOperation: { id: receipt.operation.id, kind: receipt.operation.kind } };
    layout.templatePublished = receipt.result.payload.visibility === "public";
    layout.templateDraftServerHydrated = true; delete layout.templateDraftSyncPending;
    captures.delete(layoutId); persist(); notify("committed", layoutId);
    return { ...result, applied: true };
  };
  const prepareRecovery = async layoutId => {
    const layout = getLayout(layoutId), pending = captures.get(layoutId);
    let captureError = null;
    if (pending?.layout === layout) await pending.promise.catch(error => { captureError = error; });
    if (getLayout(layoutId) !== layout) throw blocked();
    await recover(layoutId);
    if (captureError && !layout.adminCausalSource.planId) throw captureError;
  };
  return Object.freeze({ capture, captureCommand, recover, flush, prepareRecovery, hasPendingCapture: layoutId => captures.has(layoutId) });
}
