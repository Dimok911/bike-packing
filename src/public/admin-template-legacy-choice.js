import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplateSavePlan } from "../sync/admin-template-save-plan.js";
import { adminTemplateEditorSource, stripAdminTemplateEditorMetadata } from "./admin-template-causal-save-flow.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Сверка черновика приостановлена. Местный вариант и сохранённый выбор остаются на устройстве."),
  { code: "admin-template-legacy-choice-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// One decision per target retains BOTH versions before the first business write.
// Reload uses this decision, never a fresh server revision to rebase the old edit.
export function createAdminTemplateLegacyChoice({ binding, layoutId, getContext, snapshot, client, plans,
  projectServer = null,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, uuid = () => crypto.randomUUID(),
  enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  binding = clone(binding);
  const key = "bike-packing-admin-legacy-choice-v1:" + encodeURIComponent(canonicalTemplateJson(binding));
  const context = () => {
    const value = getContext?.();
    if (enabled !== true || !layoutId || !value?.admin || value.scope !== "admin-template" || !value.generation
      || Object.keys(binding).some(field => value[field] !== binding[field])) throw paused();
    return clone(value);
  };
  const guard = before => { if (!same(context(), before)) throw paused(); };
  const candidate = () => {
    const value = clone(snapshot()); value.payload = stripAdminTemplateEditorMetadata(value.payload);
    if (!exact(value, ["payload", "metadata"])) throw paused();
    return value;
  };
  const source = prepared => {
    const value = adminTemplateEditorSource(binding, prepared);
    if (!value.exists || !prepared.payload || Object.keys(prepared.payload.layouts || {}).length !== 1) throw paused();
    return value;
  };
  const input = choice => {
    const observed = source(choice.server);
    return { operationId: choice.id, exists: true, visibility: observed.visibility, base: observed.base,
      payload: choice.local.payload, metadata: choice.local.metadata, published: null, indexes: [] };
  };
  const validate = choice => {
    const serverChoice = choice?.version === 2;
    if (!exact(choice, ["version", "id", "binding", "layoutId", "local", "server", ...(serverChoice ? ["variant", "projection"] : [])]) || ![1, 2].includes(choice.version)
      || !validTemplateOperationId(choice.id) || !same(choice.binding, binding) || choice.layoutId !== layoutId
      || !exact(choice.local, ["payload", "metadata"])) throw paused();
    if (serverChoice && (choice.variant !== "server" || !exact(choice.projection, ["layoutId", "layout", "items", "containers"])
      || choice.projection.layoutId !== layoutId || choice.projection.layout?.id !== layoutId)) throw paused();
    adminTemplateSavePlan({ ...input(choice), binding });
    return choice;
  };
  const read = async () => {
    const raw = storage.getItem(key); if (raw === null) return null;
    const row = JSON.parse(raw);
    if (!exact(row, ["version", "choice", "digest"]) || row.version !== 1
      || row.digest !== await hash(validate(row.choice))) throw paused();
    return row.choice;
  };
  const lock = task => { if (!locks?.request) throw paused(); return locks.request(key, task); };
  const unchanged = (initial, local) => { guard(initial); if (!same(candidate(), local)) throw paused(); };
  return Object.freeze({
    async open() {
      const initial = context(), local = candidate(), saved = await read(); unchanged(initial, local);
      if (saved) { if (!same(saved.local, local)) throw paused(); return { initial, local, saved }; }
      if ((await plans.list()).length) throw paused(); unchanged(initial, local);
      const server = clone(await client.prepare()); unchanged(initial, local); source(server);
      return { initial, local, server, saved: null };
    },
    async choose(session, { variant = "local" } = {}) {
      // Clone before hashing/locking so callers cannot change the approved choice.
      session = clone(session); unchanged(session.initial, session.local);
      if (session.saved) throw paused();
      if (!["local", "server"].includes(variant) || variant === "server" && !projectServer) throw paused();
      const id = uuid(), choice = validate({ version: variant === "server" ? 2 : 1, id, binding, layoutId, local: session.local, server: session.server,
        ...(variant === "server" ? { variant, projection: clone(projectServer(session.server, id)) } : {}) });
      const row = { version: 1, choice, digest: await hash(choice) }; unchanged(session.initial, session.local);
      return lock(async () => {
        const saved = await read(); unchanged(session.initial, session.local);
        if (saved) {
          if (!same(saved.local, choice.local) || !same(saved.server, choice.server) || saved.version !== choice.version) throw paused();
          return clone(saved);
        }
        if ((await plans.list()).length) throw paused(); unchanged(session.initial, session.local);
        const encoded = canonicalTemplateJson(row); storage.setItem(key, encoded);
        if (storage.getItem(key) !== encoded) throw paused(); unchanged(session.initial, session.local);
        return clone(choice);
      });
    },
    async resume() {
      const initial = context(), local = candidate();
      return lock(async () => {
        const choice = await read(); unchanged(initial, local);
        if (!choice || !same(choice.local, local)) throw paused();
        if (choice.version === 2) {
          // A legacy draft has no operation chain to exclude. Any journal
          // entry, even one created after the choice, requires separate review.
          if ((await plans.list()).length) throw paused(); unchanged(initial, local);
          return { serverAdoption: { projection: clone(choice.projection), source: source(choice.server) } };
        }
        await plans.capture(input(choice)); unchanged(initial, local);
        return source(choice.server);
      });
    },
  });
}
