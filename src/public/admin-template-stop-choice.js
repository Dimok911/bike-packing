import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplateSavePlan } from "../sync/admin-template-save-plan.js";
import { adminTemplateEditorSource, stripAdminTemplateEditorMetadata } from "./admin-template-causal-save-flow.js";
import { adminTemplatePlanChain } from "./admin-template-recovery.js";

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
  projectServer = null,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, uuid = () => crypto.randomUUID(),
  enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  binding = clone(binding);
  if (!validTemplateOperationId(priorPlanId)) throw paused();
  const prefix = "bike-packing-admin-stop-choice-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
  const key = prefix + priorPlanId;
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
  const validate = (choice, previousId = priorPlanId) => {
    const serverChoice = choice?.version === 2;
    if (!exact(choice, ["version", "id", "binding", "layoutId", "priorPlanId", "priorSource", "local", "server", ...(serverChoice ? ["variant", "projection", "knownPlans"] : [])])
      || ![1, 2].includes(choice.version) || !validTemplateOperationId(previousId)
      || !validTemplateOperationId(choice.id) || choice.id === previousId || !same(choice.binding, binding) || choice.layoutId !== layoutId
      || choice.priorPlanId !== previousId || choice.priorSource?.planId !== previousId || !same(choice.priorSource.binding, binding)
      || !exact(choice.local, ["payload", "metadata"])) throw paused();
    if (serverChoice && (choice.variant !== "server" || !exact(choice.projection, ["layoutId", "layout", "items", "containers"])
      || choice.projection.layoutId !== layoutId || choice.projection.layout?.id !== layoutId || !Array.isArray(choice.knownPlans)
      || !choice.knownPlans.some(row => row?.id === previousId) || new Set(choice.knownPlans.map(row => row?.id)).size !== choice.knownPlans.length
      || choice.knownPlans.some(row => !exact(row, ["id", "digest"]) || !validTemplateOperationId(row.id) || !/^[a-f0-9]{64}$/.test(row.digest)))) throw paused();
    adminTemplateSavePlan({ ...input(choice), binding }); return choice;
  };
  const read = async (previousId = priorPlanId) => {
    if (!validTemplateOperationId(previousId)) throw paused();
    const raw = storage.getItem(prefix + previousId); if (raw === null) return null;
    const row = JSON.parse(raw);
    if (!exact(row, ["version", "choice", "digest"]) || row.version !== 1 || row.digest !== await hash(validate(row.choice, previousId))) throw paused();
    return row.choice;
  };
  const lock = task => { if (!locks?.request) throw paused(); return locks.request(key, task); };
  const session = () => ({ initial: context(), priorSource: priorSource(), local: candidate() });
  const matches = (choice, opened) => same(choice.local, opened.local) && same(choice.priorSource, opened.priorSource);
  const terminalPlans = async (known, server, guard) => {
    const records = await plans.list(); guard();
    for (const entry of known) {
      const row = records.find(row => row.plan.id === entry.id);
      if (!row || row.digest !== entry.digest) throw paused();
      for (const intent of row.plan.operations) {
        const saved = await client.read(intent.id); guard();
        if (!same(saved?.intent, intent) || !["committed", "rejected"].includes(saved?.receipt?.operation.state)
          || saved.receipt.operation.state === "committed" && saved.receipt.result.payload.stateRevision > server.stateRevision) throw paused();
      }
    }
    return records;
  };
  return Object.freeze({
    async excludedPlans(marker) {
      const initial = context(), excluded = new Set(), visited = new Set();
      while (marker) {
        if (!exact(marker, ["choiceId", "priorPlanId"]) || visited.has(marker.choiceId)) throw paused();
        visited.add(marker.choiceId);
        const choice = await read(marker.priorPlanId);
        if (!same(context(), initial) || choice?.version !== 2 || choice.id !== marker.choiceId) throw paused();
        const info = await recovery.inspect(marker.priorPlanId);
        if (!same(context(), initial) || !info.stopped || !info.stopCoversHead) throw paused();
        const records = await plans.list(); if (!same(context(), initial)) throw paused();
        await terminalPlans(choice.knownPlans, choice.server, () => { if (!same(context(), initial)) throw paused(); });
        adminTemplatePlanChain(marker.priorPlanId, records);
        choice.knownPlans.forEach(row => excluded.add(row.id));
        marker = choice.priorSource.adoptedStop;
      }
      return [...excluded];
    },
    async open() {
      const opened = session(), saved = await read(); unchanged(opened); await stopped(opened);
      if (saved) { if (!matches(saved, opened)) throw paused(); return { ...opened, saved }; }
      const server = clone(await client.prepare()); unchanged(opened); source(server); await stopped(opened);
      return { ...opened, server, saved: null };
    },
    async choose(opened, { variant = "local" } = {}) {
      opened = clone(opened); unchanged(opened); if (opened.saved) throw paused();
      if (!["local", "server"].includes(variant) || variant === "server" && !projectServer) throw paused();
      const knownPlans = variant === "server" ? (await plans.list()).map(row => ({ id: row.plan.id, digest: row.digest })) : null;
      unchanged(opened);
      const id = uuid(), choice = validate({ version: variant === "server" ? 2 : 1, id, binding, layoutId, priorPlanId,
        priorSource: opened.priorSource, local: opened.local, server: opened.server,
        ...(variant === "server" ? { variant, projection: clone(projectServer(opened.server, id)), knownPlans } : {}) });
      const row = { version: 1, choice, digest: await hash(choice) }; unchanged(opened);
      return lock(async () => {
        const saved = await read(); unchanged(opened); await stopped(opened);
        if (saved) { if (!matches(saved, opened) || !same(saved.server, choice.server) || saved.version !== choice.version) throw paused(); return clone(saved); }
        if (variant === "server") {
          const current = await terminalPlans(knownPlans, choice.server, () => unchanged(opened));
          if (!same(current.map(row => ({ id: row.plan.id, digest: row.digest })), knownPlans)) throw paused();
        }
        const encoded = canonicalTemplateJson(row); storage.setItem(key, encoded);
        if (storage.getItem(key) !== encoded) throw paused(); unchanged(opened); return clone(choice);
      });
    },
    async resume() {
      const opened = session();
      return lock(async () => {
        const choice = await read(); unchanged(opened); if (!choice) return null;
        if (!matches(choice, opened)) throw paused(); await stopped(opened);
        if (choice.version === 2) {
          await terminalPlans(choice.knownPlans, choice.server, () => unchanged(opened));
          return { serverAdoption: { projection: clone(choice.projection),
            source: { ...source(choice.server), adoptedStop: { choiceId: choice.id, priorPlanId } } } };
        }
        await plans.capture(input(choice)); unchanged(opened);
        // Point directly at the approved plan: cancelled plans may share its
        // server base, so generic orphan discovery must not pick a successor.
        return { ...source(choice.server), ...(choice.priorSource.adoptedStop ? { adoptedStop: clone(choice.priorSource.adoptedStop) } : {}),
          base: { operationId: choice.id }, planId: choice.id };
      });
    },
  });
}
