import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson } from "../sync/admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const blocked = () => Object.assign(Error("Сохранение шаблона приостановлено. Откройте его сохранённые изменения для продолжения."),
  { code: "admin-template-ui-paused", isAdminTemplateBlocked: true });

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

export function createAdminTemplateSaveFlow({ getLayout, getContext, snapshot, plansFor, persist, notify = () => {},
  uuid = () => crypto.randomUUID(), enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  const captures = new Map();
  const source = layout => {
    const value = layout?.adminCausalSource;
    if (!value || value.version !== 1 || !value.binding || value.binding.actorId !== getContext(value.binding).actorId) throw blocked();
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
    if (sameEditor && previous.published === published && equal(previous.candidate, candidate)) return previous.promise;
    const base = sameEditor ? previous.nextSource : observed;
    const operationId = uuid(), needsPublication = published === true || published === false && base.visibility === "public";
    const publicationId = needsPublication ? uuid() : null;
    const input = { operationId, publicationId, exists: base.exists, visibility: base.visibility, base: base.base,
      payload: candidate.payload, metadata: candidate.metadata, published,
      indexes: published === false && needsPublication ? base.indexes : [] };
    const finalId = published === true ? publicationId : operationId;
    const nextSource = { ...base, exists: true, base: { operationId: finalId }, planId: operationId,
      visibility: published === null ? base.visibility || "private" : published ? "public" : "private",
      indexes: published === false ? [] : base.indexes };
    const job = { layout, binding: base.binding, id: operationId, candidate, published, nextSource, promise: null };
    captures.set(layoutId, job);
    job.promise = (sameEditor ? previous.promise : Promise.resolve()).then(async () => {
      guard(layoutId, layout, initial, base.binding);
      await plansFor(base.binding, layoutId).capture(input);
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
  const flush = async layoutId => {
    if (enabled !== true) throw blocked();
    const layout = getLayout(layoutId), pending = captures.get(layoutId);
    if (pending?.layout === layout) await pending.promise;
    const observed = source(layout), initial = clone(getContext(observed.binding));
    if (!observed.planId) return { state: "idle" };
    const plans = plansFor(observed.binding, layoutId), saved = await plans.list(); guard(layoutId, layout, initial, observed.binding);
    const byId = new Map(saved.map(value => [value.plan.id, value.plan])), owner = new Map();
    for (const { plan } of saved) for (const operation of plan.operations) owner.set(operation.id, plan.id);
    const ordered = [], visiting = new Set(), visited = new Set();
    const visit = id => {
      if (visited.has(id)) return;
      if (visiting.has(id) || !byId.has(id)) throw blocked(); visiting.add(id);
      for (const operation of byId.get(id).operations) {
        const predecessors = [operation.body.base?.operationId, ...(operation.body.indexes || []).map(index => index.base.operationId)];
        for (const predecessor of predecessors) { const parent = owner.get(predecessor); if (parent && parent !== id) visit(parent); }
      }
      visiting.delete(id); visited.add(id); ordered.push(id);
    };
    visit(observed.planId);
    let result;
    for (const id of ordered) {
      guard(layoutId, layout, initial, observed.binding); result = await plans.run(id); guard(layoutId, layout, initial, observed.binding);
      if (result.state !== "committed") { notify(result.state, layoutId); return result; }
    }
    // Confirm only the currently displayed candidate. A response for an older
    // queued save cannot clear a newer draft or replace its source dependency.
    const plan = byId.get(observed.planId), write = plan.operations.find(operation => ["template.save", "template.create"].includes(operation.kind));
    const current = clone(snapshot(layoutId)); current.payload = stripAdminTemplateEditorMetadata(current.payload);
    if (layout.adminCausalSource?.planId !== observed.planId || captures.get(layoutId)?.id && captures.get(layoutId).id !== observed.planId
      || !equal(current, { payload: write.body.payload, metadata: write.body.metadata })) return { ...result, applied: false };
    const finalId = plan.operations.at(-1).id, receipt = result.receipts.find(value => value.operation.id === finalId);
    if (!receipt?.result?.payload?.stateRevision) throw blocked();
    layout.adminCausalSource = { ...observed, base: { stateRevision: receipt.result.payload.stateRevision },
      visibility: receipt.result.payload.visibility, planId: null };
    layout.templatePublished = receipt.result.payload.visibility === "public";
    layout.templateDraftServerHydrated = true; delete layout.templateDraftSyncPending;
    captures.delete(layoutId); persist(); notify("committed", layoutId);
    return { ...result, applied: true };
  };
  return Object.freeze({ capture, flush, hasPendingCapture: layoutId => captures.has(layoutId) });
}
