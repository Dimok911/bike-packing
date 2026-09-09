import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { personalPhotoFormOwner } from "./personal-photo-form-protocol.js";
import { applyPersonalPhotoItemFormContext, refreshPersonalPhotoItemContextView } from "./personal-photo-item-form-context.js";
import { applyPersonalPhotoContainerFormContext, refreshPersonalPhotoContainerContextView } from "./personal-photo-container-form-context.js";
import { personalImportPendingPhotoFormChain } from "./personal-import-pending-photo-chain.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

export const PERSONAL_PENDING_IMPORT_CREATE_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const payloadOf = record => record.photoState?.payload || record.action.body.payload;
const fail = () => { throw Object.assign(Error("Новая запись не подтверждена как продолжение сохранённого переноса. Форма и исходные файлы сохранены."),
  { code: "pending-import-create" }); };

// An empty owner uses the same field/placement grammar as a normal new form.
// The local grammar body is never stored or sent as an empty photo operation:
// the result is an ordinary DB descendant with the original import references.
export function preparePersonalPendingImportCreate(input, { enabled = PERSONAL_PENDING_IMPORT_CREATE_ENABLED,
  snapshotToPayload = value => value, itemContextEnabled = false, containerContextEnabled = false } = {}) {
  if (!enabled) fail();
  assertListOperationJsonValue(input);
  const { binding, snapshot, basePayload, baseStateRevision, entityType, entityId, fields, created,
    formContext = null, containerFormContext = null } = input;
  if (created !== true || !same(snapshotToPayload(clone(snapshot)), basePayload)
    || formContext !== null && !itemContextEnabled || containerFormContext !== null && !containerContextEnabled
    || ["files", "photoIds", "photoSelection", "manufacturerSource", "copySource"].some(key => Object.hasOwn(input, key))) fail();
  const body = { version: 1, action: "form", baseStateRevision, entityType, entityId, baseEntityRevision: 0, fields: clone(fields), changes: [],
    ...(formContext === null ? {} : { formContext: clone(formContext) }),
    ...(containerFormContext === null ? {} : { containerFormContext: clone(containerFormContext) }) };
  const owner = personalPhotoFormOwner(basePayload, body, { allowEmptyCreate: true }), view = clone(snapshot);
  const collection = entityType === "item" ? "items" : "containers";
  // A new ID may not collide with either kind of owner or any placement.
  if (basePayload.items?.[entityId] || basePayload.containers?.[entityId]
    || Object.values(basePayload.layouts || {}).some(layout => layout.arrangement?.items?.[entityId]
      || layout.arrangement?.containers?.[entityId] || layout.rootContainerIds?.includes(entityId))) fail();
  view[collection][entityId] = owner;
  if (formContext !== null) refreshPersonalPhotoItemContextView(view, applyPersonalPhotoItemFormContext(view, body, basePayload), entityId);
  if (containerFormContext !== null) refreshPersonalPhotoContainerContextView(view, applyPersonalPhotoContainerFormContext(view, body, basePayload));
  const payload = snapshotToPayload(clone(view));
  assertListOperationJsonValue({ binding, payload, snapshot: view });
  return { snapshot: view, body: { baseStateRevision, payload } };
}

export function createPersonalPendingImportCreateSession({ outbox, store, getContext, onDurable,
  enabled = PERSONAL_PENDING_IMPORT_CREATE_ENABLED, snapshotToPayload = value => value,
  itemContextEnabled = false, containerContextEnabled = false, createUuid = () => crypto.randomUUID() }) {
  let attempt;
  return {
    submit(input) {
      if (attempt) return attempt.promise;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      attempt = { promise, request: null, plan: null, operationId: null };
      try {
        if (!enabled || !outbox || !store || typeof onDurable !== "function") fail();
        assertListOperationJsonValue(input);
        const frozen = clone(input), initial = clone(getContext()), head = outbox.recover();
        const assertCurrent = () => {
          if (!initial.generation || initial.scope !== "personal" || !same(initial, getContext())
            || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key] || frozen.binding?.[key] !== outbox.binding[key])
            || outbox.recover()?.action.operationId !== head?.action.operationId) fail();
        };
        assertCurrent();
        const chain = personalImportPendingPhotoFormChain({ records: outbox.list(), operationId: head?.action.operationId, listId: outbox.binding.listId });
        if (!chain || !outbox.hasPending() || frozen.parentOperationId !== head.action.operationId
          || frozen.baseStateRevision !== head.action.body.baseStateRevision || !same(frozen.basePayload, payloadOf(head))
          || chain.steps.some(step => payloadOf(step).items?.[frozen.entityId] || payloadOf(step).containers?.[frozen.entityId])) fail();
        attempt.request = frozen;
        attempt.plan = preparePersonalPendingImportCreate(frozen, { enabled, snapshotToPayload, itemContextEnabled, containerContextEnabled });
        attempt.operationId = createUuid(); assertCurrent();
        (async () => {
          const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
          if (inventory.entries.some(entry => entry.state !== "settled-retained"
            && (entry.state !== "linked" || !chain.forms.some(form => form.action.operationId === entry.operationId)))
            || chain.forms.some(form => !inventory.entries.some(entry => entry.operationId === form.action.operationId
              && ["linked", "settled-retained"].includes(entry.state)))) fail();
          const record = outbox.capture({ ...clone(attempt.plan), operationId: attempt.operationId });
          if (!same(initial, getContext())) fail();
          const result = onDurable(clone(record)); if (result?.then) fail();
          resolve(record);
        })().catch(reject);
      } catch (error) { reject(error); }
      return promise;
    },
    recoveryCopy() {
      const current = getContext();
      return attempt?.plan && current?.scope === "personal" && Object.keys(outbox.binding).every(key => current[key] === outbox.binding[key])
        ? { version: 1, phase: "pending-import-create", operationId: attempt.operationId, request: clone(attempt.request),
          preview: clone(attempt.plan.snapshot), files: [], automaticImportAllowed: false } : null;
    }
  };
}
