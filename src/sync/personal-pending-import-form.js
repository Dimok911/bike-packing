import { assertListOperationPayload } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const fail = () => { throw Error("Форма больше не совпадает с сохранённым переносом. Поля остались в открытой форме."); };

// Field-only continuation of a frozen import. It never touches the source,
// file inventory or selected photo references. Capture is synchronous, before
// the first await, closing the dialog, replacing memory or scheduling a writer.
export function createPersonalPendingImportFormSession({ outbox, getContext, onDurable,
  snapshotToPayload = value => value, createUuid = () => crypto.randomUUID(), enabled = false, findSource,
  readPayload = record => record.action.body.payload, recoveryPhase = "pending-import-fields" }) {
  let completion, preview = null, initial = null, operationId = null, request = null;
  return {
    submit(input) {
      if (completion) return completion;
      let resolve, reject;
      completion = new Promise((yes, no) => { resolve = yes; reject = no; });
      try {
        if (!enabled || !outbox || typeof findSource !== "function" || typeof onDurable !== "function") fail();
        assertListOperationPayload({ ...outbox.binding, kind: "list.update", body: input });
        const frozen = clone(input); initial = clone(getContext());
        const head = outbox.recover(), source = findSource({ records: outbox.list(),
          operationId: head?.action.operationId, listId: outbox.binding.listId, includeSource: true });
        if (!source || !outbox.hasPending() || !initial.generation || initial.scope !== "personal"
          || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key] || frozen.binding?.[key] !== outbox.binding[key])
          || frozen.created !== false || frozen.parentOperationId !== head.action.operationId
          || !["item", "container"].includes(frozen.entityType) || !same(frozen.basePayload, readPayload(head))
          || !same(snapshotToPayload(frozen.snapshot), frozen.basePayload)) fail();
        const collection = frozen.entityType === "item" ? "items" : "containers", owner = frozen.snapshot[collection]?.[frozen.entityId];
        const fields = frozen.fields, allowed = ["name", "weight", "color", "location", "category", "categories", "note", "dimensions",
          "updatedAt", "updatedByDeviceId", "updatedByDeviceName", ...(collection === "items" ? ["quantity"] : ["volume", "nestable"])];
        if (!owner || owner.id !== frozen.entityId || !fields || typeof fields !== "object" || Array.isArray(fields)
          || !Object.keys(fields).length || Object.keys(fields).some(key => !allowed.includes(key))
          || Object.hasOwn(fields, "name") && (typeof fields.name !== "string" || !fields.name.trim())
          || ["weight", "volume"].some(key => Object.hasOwn(fields, key) && (typeof fields[key] !== "number" || fields[key] < 0))
          || Object.hasOwn(fields, "quantity") && fields.quantity !== 1) fail();
        request = clone(frozen);
        for (const [key, value] of Object.entries(fields)) {
          if (key === "dimensions" && value === null) delete owner[key]; else owner[key] = value;
        }
        preview = frozen.snapshot; operationId = createUuid();
        if (!same(initial, getContext())) fail();
        const record = outbox.capture({ operationId, snapshot: preview,
          body: { payload: snapshotToPayload(clone(preview)), baseStateRevision: frozen.baseStateRevision } });
        if (!same(initial, getContext())) fail();
        const adopted = onDurable(record);
        if (adopted?.then) throw Error("Отображение сохранённой формы должно быть синхронным.");
        resolve(record);
      } catch (error) {
        if (preview) error.unconfirmedMemoryDraft = clone(preview);
        reject(error);
      }
      return completion;
    },
    recoveryCopy() {
      const context = getContext();
      return preview && initial?.scope === "personal" && context?.scope === "personal"
        && Object.keys(outbox.binding).every(key => context[key] === initial[key])
        ? { version: 1, phase: recoveryPhase, operationId, request: clone(request), preview: clone(preview), files: [], automaticImportAllowed: false } : null;
    }
  };
}
