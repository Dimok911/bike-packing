import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "./admin-template-capture-lease.js";

const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
// This module orders and bounds admission; it does not implement application
// inventory or namespace policy. Both injected implementations are trusted code,
// not proofs supplied by a record. They must decode ALL relevant retained stores
// (also while OFF), validate both current namespaces without normalization, and
// provide synchronous guards for their scope. A kind/hash-shaped object alone
// cannot establish completeness. Production app wiring remains a separate step.
//
// Dependencies must neither reacquire the common lease nor acquire the actor
// order lock. Use the existing byte-checked read-only order inventory instead.
// run owns common source/target locks BEFORE task can take plan/command locks.
// task may capture/run the exact command; namespace application happens AFTER
// run returns. Never call run while already holding a plan/command/common lock.
export function createAdminTemplatePhotoCopyAdmissionScope(descriptor, { binding, store, getContext,
  locks = globalThis.navigator?.locks, withInventory, withNamespaces } = {}) {
  const blocked = code => Object.assign(Error(descriptor.message),
    { code: `${descriptor.prefix}-admission-${code}`, isAdminTemplateBlocked: true });
  const synchronous = check => {
    const result = check();
    if (result?.then) {
      // Invalid asynchronous authority still pauses immediately. Consume its
      // rejection so the rejected guard cannot escape as an unhandled promise.
      Promise.resolve(result).catch(() => {});
      throw blocked("async-guard");
    }
  };

  binding = freeze(adminTemplatePhotoActionBinding(binding));
  if (!store || typeof store.read !== "function" || !same(store.binding, binding)
    || typeof getContext !== "function" || typeof locks?.request !== "function"
    || typeof withInventory !== "function" || typeof withNamespaces !== "function") throw blocked("dependencies");
  const context = () => {
    const value = getContext();
    if (!value || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(key => value[key] !== binding[key])) throw blocked("context");
    return clone(value);
  };
  const load = async (id, check) => {
    check(); const value = await store.read(id); check();
    // Detach the complete external value before re-preparation's first await.
    const record = clone(value);
    if (!exact(record, ["binding", "action", "snapshot", "stages", "intentHash"])
      || !same(record.binding, binding) || record.action?.operationId !== id) throw blocked("record");
    const expected = await descriptor.prepareRecord({ binding, action: record.action, snapshot: record.snapshot }); check();
    if (!same(record, expected)) throw blocked("record");
    return freeze(record);
  };
  // Enforce one awaited callback and expire retained guards even if an injected
  // implementation returns early or forgets to await the callback promise.
  const scoped = async (kind, enter, proof, check, task) => {
    let active = true, entered = false, completed = false, result;
    try {
      await enter(proof, async scope => {
        if (!active || entered || !exact(scope, ["kind", "bindings", "recordIntentHash", "assertCurrent"])
          || scope.kind !== kind || !same(scope.bindings, proof.bindings) || scope.recordIntentHash !== proof.record.intentHash
          || typeof scope.assertCurrent !== "function") throw blocked("scope");
        entered = true;
        const scopeGuard = scope.assertCurrent.bind(scope);
        const assertCurrent = () => {
          if (!active) throw blocked("scope-ended");
          // Scope guards only observe state. Check context/lease before calling
          // one, then the complete upstream authority after it, once per call.
          // Never retain a successful check across an await or another call.
          proof.assertCurrent(); synchronous(scopeGuard); check();
        };
        assertCurrent(); result = await task(assertCurrent); assertCurrent(); completed = true; return result;
      });
      check(); if (!entered || !completed) throw blocked("scope-unfinished");
      return result;
    } finally { active = false; }
  };
  return Object.freeze({ binding,
    async run(operationId, task) {
      if (!validTemplateOperationId(operationId) || typeof task !== "function") throw blocked("operation");
      const initial = context(); let active = true;
      const baseGuard = () => { if (!active || !same(context(), initial)) throw blocked("context"); };
      try {
        const first = await load(operationId, baseGuard), source = descriptor.source(first);
        const bindings = freeze([binding, adminTemplatePhotoActionBinding({ ...binding, listId: source.listId, itemKey: source.itemKey })]
          .sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0));
        return await withAdminTemplateCapture({ bindings, locks }, async captureLease => {
          const guard = () => { baseGuard(); assertAdminTemplateCaptureLease(captureLease, bindings); };
          const record = await load(operationId, guard); guard();
          if (!same(first, record)) throw blocked("record-changed");
          const proof = Object.freeze({ record, bindings, captureLease, assertCurrent: guard });
          const validate = (check, work) => scoped(`${descriptor.prefix}-inventory-v1`, withInventory, proof, check,
            inventoryGuard => scoped(`${descriptor.prefix}-namespaces-v1`, withNamespaces, proof, inventoryGuard, work));
          return await validate(guard, async assertCurrent => {
            let dispatchActive = false;
            const withDispatchAdmission = async (requested, work) => {
              assertCurrent();
              const intent = { id: record.action.operationId, ...binding, kind: record.action.kind, body: record.action.body };
              if (dispatchActive || typeof work !== "function" || !exact(requested, ["intent", "recordIntentHash", "assertCurrent"])
                || !same(requested.intent, intent) || requested.recordIntentHash !== record.intentHash
                || typeof requested.assertCurrent !== "function") throw blocked("intent");
              dispatchActive = true;
              const requestedGuard = requested.assertCurrent.bind(requested);
              const check = () => { guard(); synchronous(requestedGuard); assertCurrent(); };
              try {
                check(); const current = await load(operationId, check); check();
                if (!same(current, record)) throw blocked("record-changed");
                return await validate(check, admittedGuard => work(Object.freeze({ assertCurrent: admittedGuard })));
              } finally { dispatchActive = false; }
            };
            const session = Object.freeze({ record, captureLease, assertCurrent, withDispatchAdmission,
              getContext: () => { assertCurrent(); return context(); } });
            assertCurrent(); const result = await task(session); assertCurrent(); return result;
          });
        });
      } finally { active = false; }
    }
  });
}
