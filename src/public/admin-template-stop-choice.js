import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplateSavePlan } from "../sync/admin-template-save-plan.js";
import { adminTemplateEditorSource, stripAdminTemplateEditorMetadata } from "./admin-template-causal-save-flow.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Сверка остановленного черновика приостановлена. Обе версии и сохранённый выбор остаются на устройстве."),
  { code: "admin-template-stop-choice-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// A decision belongs to one terminal chain. Its new save is a separate action
// against the version explicitly compared, never a retry rebased by a reload.
export function createAdminTemplateStopChoice({ binding, layoutId, priorPlanId, getContext, getSource, snapshot, client, plans, recovery,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, uuid = () => crypto.randomUUID(),
  enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  binding = clone(binding);
  if (!validTemplateOperationId(priorPlanId)) throw paused();
  const key = "bike-packing-admin-stop-choice-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":" + priorPlanId;
  const context = () => {
    const value = getContext?.();
    if (enabled !== true || !layoutId || value?.admin !== true || value.scope !== "admin-template" || !value.generation
      || Object.keys(binding).some(field => value[field] !== binding[field])) throw paused();
    return clone(value);
  };
  const candidate = () => {
    const value = clone(snapshot()); value.payload = stripAdminTemplateEditorMetadata(value.payload);
    if (!exact(value, ["payload", "metadata"])) throw paused();
    return value;
  };
  const priorSource = () => {
    const value = getSource();
    if (value?.version !== 1 || !same(value.binding, binding) || value.planId !== priorPlanId) throw paused();
    return clone(value);
  };
  const unchanged = session => {
    if (!same(context(), session.initial) || !same(priorSource(), session.priorSource) || !same(candidate(), session.local)) throw paused();
  };
  const stopped = async session => {
    const info = await recovery.inspect(priorPlanId); unchanged(session);
    if (!info.stopped || !info.stopCoversHead || info.id !== priorPlanId) throw paused();
  };
  const source = server => {
    const value = adminTemplateEditorSource(binding, server);
    if (!value.exists || !server.payload || Object.keys(server.payload.layouts || {}).length !== 1) throw paused();
    return value;
  };
  const input = choice => {
    const observed = source(choice.server);
    return { operationId: choice.id, exists: true, visibility: observed.visibility, base: observed.base,
      payload: choice.local.payload, metadata: choice.local.metadata, published: null, indexes: [] };
  };
  const validate = choice => {
    if (!exact(choice, ["version", "id", "binding", "layoutId", "priorPlanId", "priorSource", "local", "server"]) || choice.version !== 1
      || !validTemplateOperationId(choice.id) || choice.id === priorPlanId || !same(choice.binding, binding) || choice.layoutId !== layoutId
      || choice.priorPlanId !== priorPlanId || choice.priorSource?.planId !== priorPlanId || !same(choice.priorSource.binding, binding)
      || !exact(choice.local, ["payload", "metadata"])) throw paused();
    adminTemplateSavePlan({ ...input(choice), binding }); return choice;
  };
  const read = async () => {
    const raw = storage.getItem(key); if (raw === null) return null;
    const row = JSON.parse(raw);
    if (!exact(row, ["version", "choice", "digest"]) || row.version !== 1 || row.digest !== await hash(validate(row.choice))) throw paused();
    return row.choice;
  };
  const lock = task => { if (!locks?.request) throw paused(); return locks.request(key, task); };
  const session = () => ({ initial: context(), priorSource: priorSource(), local: candidate() });
  const matches = (choice, opened) => same(choice.local, opened.local) && same(choice.priorSource, opened.priorSource);
  return Object.freeze({
    async open() {
      const opened = session(), saved = await read(); unchanged(opened); await stopped(opened);
      if (saved) { if (!matches(saved, opened)) throw paused(); return { ...opened, saved }; }
      const server = clone(await client.prepare()); unchanged(opened); source(server); await stopped(opened);
      return { ...opened, server, saved: null };
    },
    async choose(opened) {
      opened = clone(opened); unchanged(opened); if (opened.saved) throw paused();
      const choice = validate({ version: 1, id: uuid(), binding, layoutId, priorPlanId,
        priorSource: opened.priorSource, local: opened.local, server: opened.server });
      const row = { version: 1, choice, digest: await hash(choice) }; unchanged(opened);
      return lock(async () => {
        const saved = await read(); unchanged(opened); await stopped(opened);
        if (saved) { if (!matches(saved, opened) || !same(saved.server, choice.server)) throw paused(); return clone(saved); }
        const encoded = canonicalTemplateJson(row); storage.setItem(key, encoded);
        if (storage.getItem(key) !== encoded) throw paused(); unchanged(opened); return clone(choice);
      });
    },
    async resume() {
      const opened = session();
      return lock(async () => {
        const choice = await read(); unchanged(opened); if (!choice) return null;
        if (!matches(choice, opened)) throw paused(); await stopped(opened);
        await plans.capture(input(choice)); unchanged(opened);
        // Point directly at the approved plan: cancelled plans may share its
        // server base, so generic orphan discovery must not pick a successor.
        return { ...source(choice.server), base: { operationId: choice.id }, planId: choice.id };
      });
    },
  });
}
