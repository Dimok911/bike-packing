import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

export function adminClientFixture() {
  const values = new Map(), receipts = new Map(), calls = [], tails = new Map();
  const state = { lose: false, hidden: false, quota: false, admin: true, actor: "admin-a", afterPost: null, capability: true };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (state.quota) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const locks = { request: (key, fn) => { const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(fn); tails.set(key, next); return next; } };
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-a", itemKey: "demo-state:a" };
  const context = { ...binding, generation: "one", scope: "admin-template", admin: true };
  const action = () => ({ operationId: randomUUID(), kind: "template.save", body: { version: 1, base: { stateRevision: 7 },
    payload: { items: { a: { id: "a", name: "Captured name" } } }, metadata: { title: "Captured draft", description: "Private draft text", language: "ru" } } });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); let data;
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    if (url.endsWith("/auth/me")) data = { ok: true, user: { id: state.actor } };
    else if (url.endsWith("/authorization")) data = { ok: true, authorization: { version: 1, role: state.admin ? "admin" : "user", capabilities: state.admin ? ["templates:write"] : [] } };
    else if (url.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api", capabilities: state.capability ? ["adminTemplateCausalOperationsV1", ...(state.copyCapability ? ["adminTemplateCopyV1"] : []),
      ...(state.sourceSaveCapability ? ["adminTemplateSourceSaveV1"] : []),
      ...(state.pendingSourceCapability ? ["adminTemplatePendingSourceV1"] : []),
      ...(state.pendingPersonalSourceCapability ? ["adminTemplatePendingPersonalSourceV1"] : []),
      ...(state.personalSourceCapability ? ["adminTemplatePersonalSourceSaveV1"] : [])] : [] };
    else if (options.method === "POST") {
      const input = JSON.parse(options.body), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input });
      const { id, ...bound } = intent, { body, ...identity } = bound;
      if (!receipts.has(id) || receipts.get(id).operation.state === "waiting") {
        const cancel = url.endsWith("/cancel");
        const payload = { ok: true, listId: intent.listId, itemKey: intent.itemKey, stateRevision: ["template.create", "template.copy"].includes(intent.kind) ? 1 : Number(body.base?.stateRevision ?? receipts.get(body.base?.operationId)?.result.payload.stateRevision) + 1,
          ...(intent.kind === "template.delete" ? { deleted: true } : { visibility: intent.kind === "template.publication" && body.published ? "public" : "private" }),
          indexes: (body.indexes || []).map(index => ({ listId: index.listId, stateRevision: index.base.stateRevision + 1 })) };
        receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(bound)).digest("hex"), state: cancel ? "rejected" : "committed" },
          result: { status: cancel ? 409 : 200, payload: cancel ? { ok: false, code: "operation_cancelled",
            cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } : payload } });
      }
      if (state.pendingSource && !url.endsWith("/cancel")) {
        const committed = receipts.get(id);
        receipts.set(id, { operation: { ...committed.operation, state: "waiting" }, result: null,
          waiting: { code: "template_dependency_not_committed", operationIds: [body.source.base.operationId], retrySameOperation: true } });
      }
      data = { ok: true, ...receipts.get(id) }; state.afterPost?.(); if (state.lose) throw Error("Lost ACK");
    } else data = { ok: true, ...(!state.hidden && receipts.get(url.split("/").at(-1)) || { operation: { id: url.split("/").at(-1), state: "unknown" } }) };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, selection: "direct", storage, locks, fetchImpl });
    return { transport, client: createAdminTemplateClient({ binding, getContext: () => context, transport, storage, locks, fetchImpl, enabled: true, ...options }) };
  };
  return { state, values, receipts, binding, context, action, make, calls, posts: () => calls.filter(call => call.options.method === "POST") };
}
