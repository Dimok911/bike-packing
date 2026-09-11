import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplateEditorSource } from "../public/admin-template-causal-save-flow.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Error("Исходный снимок шаблона требует сверки. Местные изменения сохранены.");
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// One immutable read snapshot per local editor. This is not a server operation
// and cannot advance a revision. Failed cache writes never prevent read-only opening.
export function createAdminTemplateSourceBaseline({ binding, layoutId, getContext,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks }) {
  binding = clone(binding);
  if (!exact(binding, ["actorId", "environment", "itemKey", "listId"]) || !layoutId || typeof layoutId !== "string") throw paused();
  const key = "bike-packing-admin-source-baseline-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":" + encodeURIComponent(layoutId);
  const context = () => {
    const value = getContext?.();
    if (!value || value.admin !== true || value.scope !== "admin-template" || !value.generation
      || Object.keys(binding).some(field => binding[field] !== value[field])) throw paused();
    return clone(value);
  };
  const guard = initial => { if (!same(context(), initial)) throw paused(); };
  const validate = baseline => {
    if (!exact(baseline, ["version", "binding", "layoutId", "stateRevision", "payload", "metadata", "editorSnapshot"])
      || baseline.version !== 1 || baseline.layoutId !== layoutId || !same(baseline.binding, binding)
      || !Number.isSafeInteger(baseline.stateRevision) || baseline.stateRevision < 1
      || !exact(baseline.editorSnapshot, ["payload", "metadata"])
      || ![baseline.metadata, baseline.editorSnapshot.metadata].every(value => exact(value, ["title", "description", "language"])
        && typeof value.title === "string" && typeof value.description === "string" && ["ru", "en"].includes(value.language))
      || Object.keys(baseline.payload?.layouts || {}).length !== 1 || Object.keys(baseline.editorSnapshot.payload?.layouts || {}).length !== 1) throw paused();
    return baseline;
  };
  const read = async initial => {
    const raw = storage.getItem(key); if (raw === null) { guard(initial); return null; }
    const saved = JSON.parse(raw);
    if (!exact(saved, ["version", "baseline", "digest"]) || saved.version !== 1
      || await digest(validate(saved.baseline)) !== saved.digest) throw paused();
    guard(initial); return clone(saved.baseline);
  };
  return Object.freeze({
    async read() { return read(context()); },
    async capture(prepared, editorSnapshot) {
      const initial = context(), source = adminTemplateEditorSource(binding, prepared);
      if (!source.exists) throw paused();
      const baseline = validate(clone({ version: 1, binding, layoutId, stateRevision: source.base.stateRevision,
        payload: prepared.payload, metadata: prepared.metadata, editorSnapshot }));
      const saved = { version: 1, baseline, digest: await digest(baseline) }; guard(initial);
      if (!locks?.request) return false;
      return locks.request(key, async () => {
        guard(initial); const existing = await read(initial); guard(initial);
        if (existing) { if (!same(existing, baseline)) throw paused(); return true; }
        try { const encoded = canonicalTemplateJson(saved); storage.setItem(key, encoded); if (storage.getItem(key) !== encoded) return false; }
        catch { guard(initial); return false; }
        guard(initial); return true;
      });
    },
  });
}
