import { assertListOperationPayload } from "./list-operation-payload.js";
import { PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED, PERSONAL_PHOTO_PUBLICATION_CAPABILITY,
  personalPhotoPublicationManifest, validatePersonalPhotoPublicationResult } from "./personal-photo-publication-protocol.js";
import { validateCancelledStagedPhotoReceipt, STAGED_PHOTO_CANCELLATION_CAPABILITY } from "./personal-photo-staging.js";
import { PERSONAL_LIST_MIGRATION_ENABLED, PERSONAL_LIST_MIGRATION_CAPABILITY,
  assertPersonalListMigrationHash, validatePersonalListMigrationResult } from "./personal-list-migration.js";
import { PERSONAL_PHOTO_FORM_ENABLED, PERSONAL_PHOTO_FORM_CAPABILITY,
  personalPhotoFormManifest, validatePersonalPhotoFormResult } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_COPY_FORM_ENABLED, PERSONAL_PHOTO_COPY_FORM_CAPABILITY } from "./personal-photo-copy-source.js";
import { PERSONAL_PHOTO_COPY_BATCH_ENABLED, PERSONAL_PHOTO_COPY_BATCH_CAPABILITY,
  personalPhotoCopyBatchManifest, validatePersonalPhotoCopyBatchResult } from "./personal-photo-copy-batch-protocol.js";
import { PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, PERSONAL_PENDING_PHOTO_COPY_DELETION_CAPABILITY,
  PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED, PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_CAPABILITY,
  personalPhotoCopyBodyResultReference } from "./personal-pending-photo-copy-deletion.js";

// Development gate: enabling this requires a separately approved rollout.
export const LIST_OPERATION_QUEUE_ENABLED = false;
export const LIST_OPERATION_CANCELLATION_ENABLED = false;
export const LIST_OPERATION_CAPABILITY = "personalListCausalOperationsV1";
export const LIST_OPERATION_CANCELLATION_CAPABILITY = "personalListOperationCancellationV1";
export const LIST_OPERATION_QUEUE_LOCK = "bike-packing-list-operation-dispatch-v1";
const environment = "bike-packing-experiment";
const gateway = "/bike-packing/list-operations";
const sha = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

export function canonicalListOperationJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalListOperationJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalListOperationJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function listOperationRoute(path, method = "GET") {
  if (method === "POST" && path === "/bike-packing/lists") return { kind: "list.create", listId: "" };
  const restore = /^\/bike-packing\/lists\/([^/]+)\/restore$/.exec(path);
  if (restore && method === "POST") return { kind: "list.restore", listId: decodeURIComponent(restore[1]) };
  const migration = /^\/bike-packing\/lists\/([^/]+)\/migration$/.exec(path);
  if (migration && method === "POST") return { kind: "list.migrate", listId: decodeURIComponent(migration[1]) };
  // Virtual adapter path: only the operation gateway dispatches this mutation.
  const photos = /^\/bike-packing\/lists\/([^/]+)\/photos\/mutate$/.exec(path);
  if (photos && method === "POST") return { kind: "photos.mutate", listId: decodeURIComponent(photos[1]) };
  const match = /^\/bike-packing\/lists\/([^/]+)(?:\/(items|containers|layouts|dictionaries)\/sync)?$/.exec(path);
  if (!match) return null;
  const kind = match[2] ? method === "POST" && `${match[2]}.sync`
    : method === "PUT" ? "list.update" : method === "DELETE" ? "list.delete" : null;
  return kind ? { kind, listId: decodeURIComponent(match[1]) } : null;
}

function paused(id, message = "Сохранение ещё не подтверждено. Повтор приостановлен, изменения остались на устройстве.") {
  return Object.assign(new Error(message), { isAmbiguousMutation: true, isOperationReceiptError: true, uncertainWriteId: id });
}

export function validateListReceipt(data, expected) {
  const op = data?.operation, result = data?.result;
  if (data?.ok !== true || !["committed", "rejected"].includes(op?.state)
    || op.id !== expected.operationId || op.environment !== environment || op.actorId !== expected.actorId
    || op.kind !== expected.kind || op.listId !== expected.listId || op.payloadDigest !== expected.payloadDigest) return false;
  if (op.state === "rejected") {
    if (![400, 403, 404, 409, 413, 422].includes(result?.status) || result.payload?.ok !== false) return false;
    const proof = result.payload.cancellation;
    return result.payload.code !== "operation_cancelled" || result.status === 409 && proof?.version === 1
      && proof.operationId === expected.operationId && proof.noBusinessEffects === true && proof.operationCannotApply === true;
  }
  if (!(result?.status >= 200 && result.status < 300 && result.payload?.ok === true)) return false;
  if (expected.kind === "photos.mutate" && expected.body?.action === "copy-batch") return validatePersonalPhotoCopyBatchResult(result.payload, expected);
  if (expected.kind === "photos.mutate") return expected.body?.action === "form"
    ? validatePersonalPhotoFormResult(result.payload, expected) : validatePersonalPhotoPublicationResult(result.payload, expected);
  if (expected.kind === "list.migrate") return validatePersonalListMigrationResult(result.payload, expected);
  if (["list.create", "list.update", "list.restore"].includes(expected.kind)) return result.payload.list?.id === expected.listId;
  if (!expected.kind.endsWith(".sync")) return true;
  const type = expected.kind.split(".")[0];
  const payload = result.payload;
  if (![payload.upserted, payload.deleted, payload.conflicts].every(Array.isArray)) return false;
  const conflictId = type === "items" ? "itemId" : type === "containers" ? "containerId" : type === "layouts" ? "layoutId" : "dictionaryId";
  const outcomes = [...payload.upserted, ...payload.deleted, ...payload.conflicts.map(entry => entry[conflictId]),
    ...(payload.skipped || []).map(entry => typeof entry === "string" ? entry : entry.id)];
  const ids = expected.children || (expected.body?.[type] || []).map(entry => entry.id || entry.payload?.id);
  return new Set(ids).size === ids.length && new Set(outcomes).size === outcomes.length
    && outcomes.length === ids.length && ids.every(id => outcomes.includes(id));
}

export function validateWaitingOperation(data, expected) {
  const op = data?.operation;
  const declared = expected.body?.causal?.dependsOn?.map(dep => dep.operationId) || [];
  return data?.ok === true && op?.state === "waiting" && op.id === expected.operationId
    && op.environment === environment && op.actorId === expected.actorId && op.kind === expected.kind
    && op.listId === expected.listId && op.payloadDigest === expected.payloadDigest && data.result === null
    && data.waiting?.code === "dependency_not_committed" && data.waiting.retrySameOperation === true
    && Array.isArray(data.waiting.operationIds) && data.waiting.operationIds.length > 0
    && data.waiting.operationIds.every(id => declared.includes(id));
}

const waitingError = id => Object.assign(paused(id, "Действие ждёт подтверждения предыдущего. Его номер и данные сохранены."), { isOperationWaiting: true });
const historicalProof = data => {
  const op = data.operation, stateRevision = data.result.payload.list?.stateRevision ?? data.result.payload.stateRevision;
  return { historicalOnly: true,
    operation: { id: op.id, environment: op.environment, actorId: op.actorId, kind: op.kind,
      listId: op.listId, payloadDigest: op.payloadDigest, state: op.state },
    resultStatus: data.result.status,
    stateRevision: Number.isSafeInteger(stateRevision) && stateRevision > 0 ? stateRevision : null,
    rejectionCode: op.state === "rejected" && typeof data.result.payload.code === "string" ? data.result.payload.code : null };
};

// A waiting grandchild must not block the ancestor it is waiting for. Walk
// directed, locally known dependency paths in this exact actor/list namespace;
// sharing an ancestor is NOT proof that two sibling actions are ordered.
function relatedCausalOperationIds(writes, { actorId, listId, operationId, body }) {
  const start = operationId || Symbol("new action"), bodies = new Map();
  for (const entry of writes) {
    const saved = entry.recovery;
    if (saved?.type === "list" && saved.protocol === "causal-v1" && saved.actorId === actorId && saved.listId === listId && saved.body) {
      bodies.set(entry.id, saved.body);
    }
  }
  bodies.set(start, body);
  const parents = new Map(), children = new Map();
  for (const [id, value] of bodies) {
    for (const dep of Array.isArray(value.causal?.dependsOn) ? value.causal.dependsOn : []) {
      if (dep?.listId !== listId || typeof dep.operationId !== "string") continue;
      if (!parents.has(id)) parents.set(id, []);
      if (!children.has(dep.operationId)) children.set(dep.operationId, []);
      parents.get(id).push(dep.operationId); children.get(dep.operationId).push(id);
    }
  }
  const related = new Set();
  for (const graph of [parents, children]) {
    const seen = new Set([start]), pending = [start];
    while (pending.length) for (const next of graph.get(pending.pop()) || []) {
      if (seen.has(next)) continue;
      seen.add(next); related.add(next); pending.push(next);
    }
  }
  return related;
}

export function createListOperationQueue({ transport, getContext = () => null,
  enabled = LIST_OPERATION_QUEUE_ENABLED, locks = globalThis.navigator?.locks,
  photoEnabled = PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED, readOnly = false, cancellationEnabled = LIST_OPERATION_CANCELLATION_ENABLED,
  migrationEnabled = PERSONAL_LIST_MIGRATION_ENABLED,
  photoFormEnabled = PERSONAL_PHOTO_FORM_ENABLED,
  photoCopyEnabled = PERSONAL_PHOTO_COPY_FORM_ENABLED,
  pendingPhotoCopyDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED,
  photoCopyBatchEnabled = PERSONAL_PHOTO_COPY_BATCH_ENABLED,
  pendingPhotoCopyBatchDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED,
  fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 15000 } = {}) {
  const request = async (path, body) => {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        fetchImpl(transport.apiUrl(path), { method: body === undefined ? "GET" : "POST", credentials: "include",
          redirect: "error", cache: "no-store", signal: controller.signal,
          ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        }).then(async response => ({ status: response.status, data: await response.json() })),
        new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(paused(null)); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const read = async path => {
    const response = await request(path);
    if (response.status !== 200) throw paused(null);
    return response.data;
  };
  const contextMatches = initial => {
    const current = getContext();
    return ["actorId", "generation", "scope", "scopeKey", "listId", "environment"].every(key => current?.[key] === initial[key]);
  };
  const recordReceipt = (entry, data) => {
    if (validateWaitingOperation(data, entry.recovery)) throw waitingError(entry.id);
    if (!validateListReceipt(data, entry.recovery)) throw paused(entry.id);
    // Keep a compact terminal proof, not another multi-megabyte copy of list
    // state. Replaying an unapplied receipt always reads the full server result.
    const op = data.operation;
    const proof = { operation: { id: op.id, actorId: op.actorId, environment: op.environment,
      kind: op.kind, listId: op.listId, payloadDigest: op.payloadDigest, state: op.state },
      resultStatus: data.result.status };
    if (!transport.confirmWrite(entry.id, { receipt: proof })) throw paused(entry.id);
    return data;
  };
  const dispatch = entry => {
    const saved = entry.recovery;
    if (saved.cancellationOnly === true) throw paused(entry.id, "Для этого номера сохранена отмена. Исходное действие не отправлено заново.");
    return request(gateway, { operationId: entry.id, expectedActorId: saved.actorId, environment,
      kind: saved.kind, listId: saved.listId, body: saved.body });
  };
  const recover = async (entry, { resumeWaiting = false, assertBeforeDispatch = () => {} } = {}) => {
    const data = await read(`${gateway}/${encodeURIComponent(entry.id)}`);
    // ONLY an exact server-bound waiting intent permits another POST of the
    // frozen manifest. Unknown/timeout/404 never means permission to resend.
    if (resumeWaiting && !entry.recovery.cancellationOnly && validateWaitingOperation(data, entry.recovery)) {
      assertBeforeDispatch();
      try {
        const response = await dispatch(entry);
        if (response.status !== 200) throw paused(entry.id);
        return recordReceipt(entry, response.data);
      } catch (error) {
        if (error.isOperationWaiting) throw error;
        return recordReceipt(entry, await read(`${gateway}/${encodeURIComponent(entry.id)}`));
      }
    }
    return recordReceipt(entry, data);
  };

  return {
    supports(path, method) {
      const route = listOperationRoute(path, method);
      return !readOnly && enabled && transport.experiment && Boolean(route) && (route.kind !== "photos.mutate" || photoEnabled)
        && (route.kind !== "list.migrate" || migrationEnabled);
    },
    supportsCancellation(path, method) { return cancellationEnabled && this.supports(path, method); },
    // An explicit cancellation fences the ORIGINAL immutable intent. It never
    // sends that intent to the execution endpoint, fabricates a fresh ID or
    // adopts business state. A prior committed/rejected receipt wins unchanged.
    async cancelExact({ path, method, body: bodyText, operationId }) {
      if (!this.supportsCancellation(path, method) || !locks?.request) throw paused(operationId);
      const initial = { ...getContext() }, body = JSON.parse(bodyText || "{}"), route = listOperationRoute(path, method);
      const listId = route.listId || body.id;
      if (!initial.actorId || !initial.generation || initial.scope !== "personal" || initial.environment !== environment
        || initial.listId !== listId || initial.scopeKey !== `id:${initial.actorId}`
        || typeof listId !== "string" || !listId.trim() || listId !== listId.trim() || listId.length > 191
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId || "")) throw paused(operationId);
      const expected = { operationId, actorId: initial.actorId, kind: route.kind, listId, body,
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body })) };
      assertListOperationPayload(expected);
      const assertCurrent = () => { if (!contextMatches(initial)) throw paused(operationId, "Редактор изменился. Отмена остановлена; данные сохранены."); };
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${listId}`, async () => {
        assertCurrent(); await transport.prepare(); assertCurrent();
        const me = await read("/auth/me"); assertCurrent();
        if (String(me?.user?.id || "") !== initial.actorId) throw paused(operationId);
        let entry = transport.writes.find(value => value.id === operationId);
        if (entry && (entry.recovery?.type !== "list" || entry.recovery.actorId !== initial.actorId
          || entry.recovery.kind !== route.kind || entry.recovery.listId !== listId || entry.recovery.payloadDigest !== expected.payloadDigest
          || !entry.confirmed && canonicalListOperationJson(entry.recovery.body) !== canonicalListOperationJson(body))) throw paused(operationId);
        const terminal = data => {
          assertCurrent(); if (!validateListReceipt(data, expected)) throw paused(operationId);
          if (entry) recordReceipt({ ...entry, recovery: expected }, data);
          assertCurrent(); return historicalProof(data);
        };
        const known = await read(`${gateway}/${encodeURIComponent(operationId)}`); assertCurrent();
        if (["committed", "rejected"].includes(known?.operation?.state)) return terminal(known);
        const op = known?.operation;
        if (entry?.confirmed || !(validateWaitingOperation(known, expected) || known?.ok === true && op?.state === "unknown"
          && op.id === operationId && (op.actorId === undefined || op.actorId === initial.actorId)
          && (op.environment === undefined || op.environment === environment) && (op.listId === undefined || op.listId === listId))) throw paused(operationId);
        const capabilities = await read("/bike-packing/capabilities"); assertCurrent();
        if (![LIST_OPERATION_CAPABILITY, LIST_OPERATION_CANCELLATION_CAPABILITY].every(value => capabilities.capabilities?.includes(value))) throw paused(operationId,
          "Сервер ещё не поддерживает подтверждённую отмену действия. Данные сохранены.");
        if (!entry) {
          const cancellationOnly = route.kind === "photos.mutate" && photoEnabled && photoFormEnabled
            && (body.action === "form" || body.action === "copy-batch" && photoCopyBatchEnabled && photoCopyEnabled);
          if (cancellationOnly) {
            if (body.action === "copy-batch") personalPhotoCopyBatchManifest(body);
            else personalPhotoFormManifest(body);
          }
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId, ...(cancellationOnly ? { cancellationOnly: true } : {}) };
          transport.assertWritable(path, method, { ...expected, ...protocol });
          const generation = await sha(initial.generation);
          const requestKey = await sha(canonicalListOperationJson({ path, method, body, actorId: initial.actorId, operationId }));
          assertCurrent();
          await transport.beginWrite(path, method, bodyText, { ...expected, ...protocol, generation, requestKey });
          entry = transport.writes.find(value => value.id === operationId);
        }
        assertCurrent();
        try {
          const response = await request(`${gateway}/${encodeURIComponent(operationId)}/cancel`, {
            operationId, expectedActorId: initial.actorId, environment, kind: route.kind, listId, body });
          if (response.status !== 200) throw paused(operationId);
          return terminal(response.data);
        } catch (error) {
          if (!transport.writes.find(value => value.id === operationId)?.confirmed) transport.noteFailure(error, path, method, operationId);
          assertCurrent(); return terminal(await read(`${gateway}/${encodeURIComponent(operationId)}`));
        }
      });
    },
    // Read-only historical settlement. It never creates a transport intent,
    // dispatches a mutation or resumes a waiting operation. The proof deliberately
    // excludes business payloads: it is NOT authority to apply an old snapshot.
    async inspect({ path, method, body: bodyText, operationId }) {
      if (!this.supports(path, method) && !(readOnly && transport.experiment && listOperationRoute(path, method))) throw Error("Unsupported list queue request");
      if (!locks?.request) throw paused(operationId, "Блокировка между вкладками недоступна. Сверка остановлена.");
      const initial = { ...getContext() };
      if (!initial.actorId || !initial.generation || initial.scope !== "personal"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId || "")) throw paused(operationId);
      const body = JSON.parse(bodyText || "{}");
      const route = listOperationRoute(path, method), listId = route.listId || body.id;
      if (typeof listId !== "string" || !listId.trim() || listId !== listId.trim() || listId.length > 191) throw paused(operationId);
      if (route.kind === "photos.mutate" && (initial.environment !== environment || initial.listId !== listId || initial.scopeKey !== `id:${initial.actorId}`)) throw paused(operationId);
      const children = route.kind.endsWith(".sync") ? (body[route.kind.split(".")[0]] || []).map(entry => entry.id || entry.payload?.id) : [];
      if (children.some(id => typeof id !== "string" || !id) || new Set(children).size !== children.length) throw paused(operationId);
      const expected = { operationId, actorId: initial.actorId, kind: route.kind, listId, body, children,
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body })) };
      const assertContext = () => {
        const current = getContext();
        if (["actorId", "generation", "scope", "scopeKey", "listId", "environment"].some(key => current?.[key] !== initial[key])) {
          throw paused(operationId, "Аккаунт или локальные данные изменились. Результат сверки не применён.");
        }
      };
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${listId}`, async () => {
        assertContext();
        await transport.prepare(); assertContext();
        const me = await read("/auth/me"); assertContext();
        if (String(me?.user?.id || "") !== initial.actorId) throw paused(operationId, "Аккаунт изменился. Сверка остановлена.");
        const entry = transport.writes.find(entry => entry.id === operationId);
        if (entry && (entry.recovery?.type !== "list" || entry.recovery.actorId !== expected.actorId
          || entry.recovery.kind !== expected.kind || entry.recovery.listId !== listId
          || entry.recovery.payloadDigest !== expected.payloadDigest)) throw paused(operationId, "Номер действия связан с другими данными.");
        const data = await read(`${gateway}/${encodeURIComponent(operationId)}`); assertContext();
        if (validateWaitingOperation(data, expected)) throw waitingError(operationId);
        if (!validateListReceipt(data, expected)) throw paused(operationId);
        if (entry) recordReceipt({ ...entry, recovery: expected }, data);
        assertContext();
        return historicalProof(data);
      });
    },
    // Narrow terminalization, NOT generic retry/cancellation: the immutable
    // parent is already rejected. The backend dependency transaction therefore
    // cannot apply this exact child's effects. Unknown independent actions still
    // have no resend permission. Both complete manifests are verified by GET.
    async settleRejectedDependency({ path, method, body: bodyText, operationId, predecessor, photoResultPredecessor }) {
      if (!this.supports(path, method) || !locks?.request) throw paused(operationId);
      const initial = { ...getContext() }, body = JSON.parse(bodyText || "{}"), route = listOperationRoute(path, method);
      const parent = JSON.parse(JSON.stringify(predecessor || {}));
      const parentRoute = listOperationRoute(parent.path, parent.method), parentBody = JSON.parse(parent.body || "{}");
      const rejectedFormParent = photoEnabled && photoFormEnabled && parentRoute?.kind === "photos.mutate"
        && (parentBody.action === "form" || parentBody.action === "copy-batch" && photoCopyBatchEnabled && pendingPhotoCopyBatchDeletionEnabled)
        && route.kind === "list.update";
      const validUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || "");
      const listId = route.listId;
      const dependencies = [{ operationId: parent.operationId, listId }];
      let copyExpected;
      if (body.photoResults) {
        if (!pendingPhotoCopyDeletionEnabled || !photoCopyEnabled || !photoEnabled || !photoFormEnabled) throw paused(operationId);
        const copy = JSON.parse(JSON.stringify(photoResultPredecessor || {})), copyRoute = listOperationRoute(copy.path, copy.method);
        const copyBody = JSON.parse(copy.body || "{}"), reference = personalPhotoCopyBodyResultReference(copyBody, copy.operationId);
        if (reference.version === 2 && (!photoCopyBatchEnabled || !pendingPhotoCopyBatchDeletionEnabled)
          || copyRoute?.kind !== "photos.mutate" || copyRoute.listId !== listId || !validUuid(copy.operationId)
          || canonicalListOperationJson(body.photoResults) !== canonicalListOperationJson(reference)) throw paused(operationId);
        if (copy.operationId !== parent.operationId) dependencies.push({ operationId: copy.operationId, listId });
        copyExpected = { operationId: copy.operationId, actorId: initial.actorId, listId, kind: "photos.mutate", body: copyBody,
          payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: "photos.mutate", listId, body: copyBody })) };
      }
      if (!initial.actorId || !initial.generation || initial.scope !== "personal" || !["list.update", "list.restore"].includes(route.kind)
        || !validUuid(operationId) || !validUuid(parent.operationId) || parent.operationId === operationId
        || !["list.create", "list.update", "list.restore"].includes(parentRoute?.kind) && !rejectedFormParent
        || (parentRoute.listId || parentBody.id) !== listId
        || body.causal?.baseOperationId !== parent.operationId
        || canonicalListOperationJson(body.causal.dependsOn) !== canonicalListOperationJson(dependencies)
        || canonicalListOperationJson(body.causal.reads) !== "[]") throw paused(operationId);
      if (rejectedFormParent) {
        if (parentBody.action === "copy-batch") personalPhotoCopyBatchManifest(parentBody);
        else personalPhotoFormManifest(parentBody);
      }
      const expected = { operationId, actorId: initial.actorId, listId, kind: route.kind, body, children: [],
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body })) };
      const parentExpected = { operationId: parent.operationId, actorId: initial.actorId, listId, kind: parentRoute.kind,
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: parentRoute.kind, listId, body: parentBody })) };
      const assertCurrent = () => { if (!contextMatches(initial)) throw paused(operationId, "Редактор изменился. Сверка зависимого действия остановлена."); };
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${listId}`, async () => {
        assertCurrent(); await transport.prepare(); assertCurrent();
        const me = await read("/auth/me"); assertCurrent();
        if (String(me?.user?.id || "") !== initial.actorId) throw paused(operationId);
        const parentReceipt = await read(`${gateway}/${encodeURIComponent(parent.operationId)}`); assertCurrent();
        if (!validateListReceipt(parentReceipt, parentExpected) || parentReceipt.operation.state !== "rejected") throw paused(operationId);
        if (copyExpected) {
          const copyReceipt = copyExpected.operationId === parent.operationId ? parentReceipt : await read(`${gateway}/${encodeURIComponent(copyExpected.operationId)}`);
          assertCurrent(); if (!validateListReceipt(copyReceipt, copyExpected)) throw paused(operationId);
        }
        let entry = transport.writes.find(value => value.id === operationId);
        if (entry && (entry.recovery?.type !== "list" || entry.recovery.actorId !== initial.actorId
          || entry.recovery.listId !== listId || entry.recovery.kind !== route.kind
          || entry.recovery.payloadDigest !== expected.payloadDigest
          || !entry.confirmed && canonicalListOperationJson(entry.recovery.body) !== canonicalListOperationJson(body))) throw paused(operationId);
        const terminal = data => {
          assertCurrent();
          if (!validateListReceipt(data, expected) || data.operation.state !== "rejected"
            || data.result.status !== 409 || data.result.payload.code !== "dependency_rejected") throw paused(operationId);
          if (entry) recordReceipt(entry, data);
          return historicalProof(data);
        };
        const known = await read(`${gateway}/${encodeURIComponent(operationId)}`); assertCurrent();
        if (["committed", "rejected"].includes(known?.operation?.state)) return terminal(known);
        if (entry?.confirmed || !(validateWaitingOperation(known, expected)
          || known?.ok === true && known.operation?.state === "unknown")) throw paused(operationId);
        const capabilities = await read("/bike-packing/capabilities"); assertCurrent();
        if (!capabilities.capabilities?.includes(LIST_OPERATION_CAPABILITY)) throw paused(operationId);
        if (copyExpected && !capabilities.capabilities?.includes(PERSONAL_PENDING_PHOTO_COPY_DELETION_CAPABILITY)) throw paused(operationId);
        if (body.photoResults?.version === 2 && !capabilities.capabilities?.includes(PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_CAPABILITY)) throw paused(operationId);
        assertListOperationPayload(expected);
        if (!entry) {
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId };
          transport.assertWritable(path, method, protocol);
          const generation = await sha(initial.generation);
          const requestKey = await sha(canonicalListOperationJson({ path, method, body, actorId: initial.actorId, operationId }));
          assertCurrent();
          await transport.beginWrite(path, method, bodyText, { ...expected, ...protocol, generation, requestKey });
          entry = transport.writes.find(value => value.id === operationId);
        }
        assertCurrent();
        try {
          const response = await dispatch(entry);
          if (response.status !== 200) throw paused(operationId);
          return terminal(response.data);
        } catch {
          // One POST at most in this call. A lost result is read by exact ID;
          // no loop and no replacement ID, even for this no-effect rejection.
          assertCurrent();
          return terminal(await read(`${gateway}/${encodeURIComponent(operationId)}`));
        }
      });
    },
    // Explicit no-effect settlement of ONE frozen attach whose exact staged
    // asset is permanently cancelled. Never general retry, batch or new UUID.
    async settleCancelledPhotoStage({ path, method, body: bodyText, operationId, fileHash, thumbHash }) {
      if (!this.supports(path, method) || !locks?.request) throw paused(operationId);
      const initial = { ...getContext() }, route = listOperationRoute(path, method), body = JSON.parse(bodyText || "{}");
      if (route.kind !== "photos.mutate" || body.action !== "attach" || initial.scope !== "personal" || !initial.generation
        || initial.environment !== environment || initial.listId !== route.listId || initial.scopeKey !== `id:${initial.actorId}`
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId || "")
        || ![fileHash, thumbHash].every(value => /^[a-f0-9]{64}$/.test(value || ""))) throw paused(operationId);
      personalPhotoPublicationManifest(body);
      const expected = { operationId, actorId: initial.actorId, listId: route.listId, kind: route.kind, body, children: [],
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId: route.listId, body })) };
      assertListOperationPayload(expected);
      const stageExpected = { operationId: body.assetId, actorId: initial.actorId, listId: route.listId,
        entityType: body.entityType, entityId: body.entityId, photoId: body.photoId, fileHash, thumbHash };
      const assertCurrent = () => { if (!contextMatches(initial)) throw paused(operationId); };
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${route.listId}`, async () => {
        assertCurrent(); await transport.prepare(); assertCurrent();
        const me = await read("/auth/me"); assertCurrent();
        if (String(me?.user?.id || "") !== initial.actorId) throw paused(operationId);
        // Re-read the immutable stage decision; a supplied/local proof or a
        // hash match alone is never authority for another network request.
        const stage = await read(`/bike-packing/lists/${encodeURIComponent(route.listId)}/photo-assets/${encodeURIComponent(body.assetId)}`);
        assertCurrent(); if (!validateCancelledStagedPhotoReceipt(stage, stageExpected)) throw paused(operationId);
        let entry = transport.writes.find(value => value.id === operationId);
        if (entry && (entry.recovery?.type !== "list" || entry.recovery.actorId !== initial.actorId
          || entry.recovery.listId !== route.listId || entry.recovery.kind !== route.kind || entry.recovery.payloadDigest !== expected.payloadDigest
          || !entry.confirmed && canonicalListOperationJson(entry.recovery.body) !== canonicalListOperationJson(body))) throw paused(operationId);
        const terminal = data => {
          assertCurrent();
          // Any exact durable rejection proves no owner effects. A committed
          // owner contradicts the stage fence and must remain blocked.
          if (!validateListReceipt(data, expected) || data.operation.state !== "rejected") throw paused(operationId);
          if (entry) recordReceipt({ ...entry, recovery: expected }, data);
          return historicalProof(data);
        };
        const known = await read(`${gateway}/${encodeURIComponent(operationId)}`); assertCurrent();
        if (["committed", "rejected"].includes(known?.operation?.state)) return terminal(known);
        const op = known?.operation;
        if (entry?.confirmed || !(validateWaitingOperation(known, expected) || known?.ok === true && op?.state === "unknown"
          && op.id === operationId && (op.environment === undefined || op.environment === environment)
          && (op.actorId === undefined || op.actorId === initial.actorId) && (op.listId === undefined || op.listId === route.listId))) throw paused(operationId);
        const capabilities = await read("/bike-packing/capabilities"); assertCurrent();
        if (![LIST_OPERATION_CAPABILITY, PERSONAL_PHOTO_PUBLICATION_CAPABILITY, STAGED_PHOTO_CANCELLATION_CAPABILITY]
          .every(capability => capabilities.capabilities?.includes(capability))) throw paused(operationId);
        if (!entry) {
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId };
          transport.assertWritable(path, method, protocol);
          const generation = await sha(initial.generation);
          const requestKey = await sha(canonicalListOperationJson({ path, method, body, actorId: initial.actorId, operationId }));
          assertCurrent();
          await transport.beginWrite(path, method, bodyText, { ...expected, ...protocol, generation, requestKey });
          entry = transport.writes.find(value => value.id === operationId);
        }
        assertCurrent();
        try {
          const response = await dispatch(entry);
          if (response.status !== 200) throw paused(operationId);
          return terminal(response.data);
        } catch (error) {
          if (!transport.writes.find(value => value.id === operationId)?.confirmed) transport.noteFailure(error, path, method, operationId);
          assertCurrent(); return terminal(await read(`${gateway}/${encodeURIComponent(operationId)}`));
        }
      });
    },
    async run({ path, method, body: bodyText, operationId: requestedId, receiptOnly = false }) {
      if (!this.supports(path, method)) throw Error("Unsupported list queue request");
      if (!locks?.request) throw paused(null, "Блокировка между вкладками недоступна. Запрос не отправлен.");
      const initial = { ...getContext() };
      if (!initial?.actorId || !initial?.generation || initial.scope !== "personal") throw paused(null, "Для сохранения нужен текущий личный аккаунт.");
      // Freeze before waiting for another tab, not after it has changed local data.
      const body = JSON.parse(bodyText || "{}");
      const route = listOperationRoute(path, method);
      if (route.kind === "list.migrate") {
        if (initial.environment !== environment || initial.listId !== route.listId || initial.scopeKey !== `id:${initial.actorId}`) throw paused(requestedId);
        await assertPersonalListMigrationHash(body);
      }
      if (route.kind === "photos.mutate") {
        if (initial.environment !== environment || initial.listId !== route.listId || initial.scopeKey !== `id:${initial.actorId}`) throw paused(requestedId);
        if (body.action === "copy-batch") {
          if (!photoCopyBatchEnabled || !photoCopyEnabled || !photoFormEnabled) throw paused(requestedId, "Массовое копирование с фото ещё не включено.");
          personalPhotoCopyBatchManifest(body);
        } else if (body.action === "form") {
          if (!photoFormEnabled) throw paused(requestedId, "Сохранение карточки вместе с фото ещё не включено.");
          if (body.copySource && !photoCopyEnabled) throw paused(requestedId, "Копирование карточки с фото ещё не включено.");
          personalPhotoFormManifest(body);
        } else personalPhotoPublicationManifest(body);
      }
      if (body.photoResults && (!pendingPhotoCopyDeletionEnabled || !photoEnabled || !photoFormEnabled || !photoCopyEnabled || route.kind !== "list.update"
        || body.photoResults.version === 2 && (!photoCopyBatchEnabled || !pendingPhotoCopyBatchDeletionEnabled))) {
        throw paused(requestedId, "Удаление до подтверждения копии ещё не включено.");
      }
      const generation = await sha(initial.generation);
      if (requestedId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestedId)) throw paused(null);
      const requestKey = await sha(canonicalListOperationJson({ path, method, body, ...(!requestedId ? { generation } : {}), actorId: initial.actorId,
        ...(requestedId ? { operationId: requestedId } : {}) }));
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${route.listId || body.id || requestKey}`, async () => {
        if (!contextMatches(initial)) throw paused(null, "Локальные данные изменились. Устаревший запрос не отправлен.");
        await transport.prepare();
        if (!contextMatches(initial)) throw paused(null);
        const me = await read("/auth/me");
        if (!contextMatches(initial)) throw paused(null);
        if (String(me?.user?.id || "") !== initial.actorId) throw paused(null, "Аккаунт изменился. Сохранение приостановлено.");
        // Settle old same-account unknown list actions first, without applying
        // their historical result to a newer local generation or another action.
        for (const entry of transport.writes.filter(entry => entry.recovery?.type === "list" && !entry.confirmed && entry.recovery.protocol !== "causal-v1")) {
          if (entry.recovery.actorId !== initial.actorId) throw paused(entry.id);
          await recover(entry);
        }
        let entry = requestedId ? transport.writes.find(entry => entry.id === requestedId)
          : transport.writes.find(entry => entry.recovery?.type === "list" && entry.recovery.requestKey === requestKey);
        if (entry && requestedId) {
          const listId = route.listId || body.id;
          const digest = await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body }));
          if (entry.recovery?.type !== "list" || entry.recovery.actorId !== initial.actorId
            || entry.recovery.kind !== route.kind || entry.recovery.listId !== listId
            || entry.recovery.payloadDigest !== digest) throw paused(requestedId, "Номер действия уже связан с другими данными. Отправка остановлена.");
        }
        const related = relatedCausalOperationIds(transport.writes, { actorId: initial.actorId,
          listId: route.listId || body.id, operationId: requestedId || entry?.id, body });
        for (const other of transport.writes.filter(value => value.recovery?.protocol === "causal-v1" && !value.confirmed
          && value.recovery.requestKey !== requestKey && value.recovery.listId === (route.listId || body.id))) {
          if (other.recovery.actorId !== initial.actorId) throw paused(other.id);
          if (!related.has(other.id)) await recover(other);
        }
        let data;
        // Terminal transport records omit their large body. Restore only the
        // caller's exact hash-bound immutable manifest for result validation.
        if (entry) data = await recover({ ...entry, recovery: { ...entry.recovery, body } }, { resumeWaiting: true,
          assertBeforeDispatch: () => { if (!contextMatches(initial)) throw paused(entry.id); } });
        else {
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId };
          transport.assertWritable(path, method, protocol);
          const capabilities = await read("/bike-packing/capabilities");
          if (!capabilities.capabilities?.includes(LIST_OPERATION_CAPABILITY)) throw paused(null, "Сервер ещё не поддерживает подтверждение этой операции. Запрос не отправлен.");
          if (route.kind === "list.migrate" && !capabilities.capabilities?.includes(PERSONAL_LIST_MIGRATION_CAPABILITY)) throw paused(null, "Сервер ещё не поддерживает подготовку старого списка. Запрос не отправлен.");
          if (route.kind === "photos.mutate" && !capabilities.capabilities?.includes(PERSONAL_PHOTO_PUBLICATION_CAPABILITY)) {
            throw paused(null, "Сервер ещё не поддерживает подтверждение фотодействий. Запрос не отправлен.");
          }
          if (route.kind === "photos.mutate" && body.action === "form" && !capabilities.capabilities?.includes(PERSONAL_PHOTO_FORM_CAPABILITY)) {
            throw paused(requestedId, "Сервер ещё не поддерживает сохранение карточки вместе с фото. Запрос не отправлен.");
          }
          if (route.kind === "photos.mutate" && body.copySource && !capabilities.capabilities?.includes(PERSONAL_PHOTO_COPY_FORM_CAPABILITY)) {
            throw paused(null, "Сервер ещё не поддерживает копирование карточки с фото. Запрос не отправлен.");
          }
          if (route.kind === "photos.mutate" && body.action === "copy-batch" && !capabilities.capabilities?.includes(PERSONAL_PHOTO_COPY_BATCH_CAPABILITY)) {
            throw paused(requestedId, "Сервер ещё не поддерживает массовое копирование с фото. Запрос не отправлен.");
          }
          if (body.photoResults && !capabilities.capabilities?.includes(PERSONAL_PENDING_PHOTO_COPY_DELETION_CAPABILITY)) {
            throw paused(requestedId, "Сервер ещё не поддерживает удаление до подтверждения копии. Запрос не отправлен.");
          }
          if (body.photoResults?.version === 2 && !capabilities.capabilities?.includes(PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_CAPABILITY)) {
            throw paused(requestedId, "Сервер ещё не поддерживает удаление до подтверждения массовой копии.");
          }
          const listId = route.listId || body.id || `list-${crypto.randomUUID()}`;
          const operationId = requestedId || crypto.randomUUID();
          assertListOperationPayload({ environment, actorId: initial.actorId, kind: route.kind, listId, body });
          const payloadDigest = await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body }));
          const children = route.kind.endsWith(".sync") ? (body[route.kind.split(".")[0]] || []).map(entry => entry.id || entry.payload?.id) : [];
          if (children.some(id => typeof id !== "string" || !id) || new Set(children).size !== children.length) throw paused(null, "В пакете повторяются или отсутствуют номера элементов. Запрос не отправлен.");
          const expected = { ...protocol, operationId, actorId: initial.actorId, kind: route.kind, listId, body, children, payloadDigest, generation, requestKey };
          if (!contextMatches(initial)) throw paused(null, "Локальные данные изменились. Устаревший запрос не отправлен.");
          await transport.beginWrite(path, method, bodyText, expected);
          entry = transport.writes.find(entry => entry.id === operationId);
          // No await between this final local check and dispatch.
          if (!contextMatches(initial)) {
            transport.confirmWrite(operationId, { committed: false });
            throw paused(null, "Локальные данные изменились. Запрос не отправлен.");
          }
          try {
            const response = await dispatch(entry);
            if (response.status !== 200) throw paused(operationId);
            data = recordReceipt(entry, response.data);
          } catch (error) {
            if (error.isOperationWaiting) throw error;
            transport.noteFailure(paused(operationId), path, method, operationId);
            data = await recover(entry); // Never POST retry, even after 404/5xx/timeout.
          }
        }
        if (!contextMatches(initial)) throw paused(entry.id, "Подтверждено прежнее сохранение. Более новые локальные изменения не затронуты.");
        if (data.operation.state === "rejected") {
          if (data.result.payload.serverPayload) {
            const fresh = await read(`/bike-packing/lists/${encodeURIComponent(entry.recovery.listId)}/freshness`);
            if (data.result.payload.stateRevision == null || fresh.stateRevision !== data.result.payload.stateRevision
              || !contextMatches(initial)) throw paused(entry.id, "Устаревший ответ о конфликте не применён. Нужна сверка с сервером.");
          }
          throw Object.assign(new Error(data.result.payload.message || data.result.payload.code || "Сервер отклонил сохранение"), {
            status: data.result.status, data: data.result.payload, path, method,
            isOperationReceiptError: true, isConfirmedOperationRejection: true, operationId: entry.id,
          });
        }
        // Internal outbox scheduler only: this is terminal historical proof,
        // not authority to apply a historical payload to the current editor.
        if (receiptOnly) return { operation: data.operation, status: data.result.status };
        // A receipt is historical: never resurrect a deleted list or apply a
        // snapshot after its server revision has advanced on another device.
        const current = await request(`/bike-packing/lists/${encodeURIComponent(entry.recovery.listId)}/freshness`);
        if (entry.recovery.kind === "list.delete") {
          if (current.status !== 404) throw paused(entry.id, "Состояние списка изменилось после удаления. Нужна сверка.");
        } else {
          const revision = data.result.payload.list?.stateRevision ?? data.result.payload.stateRevision;
          if (current.status !== 200 || revision == null || current.data.stateRevision !== revision) {
            throw paused(entry.id, "Серверные данные уже изменились. Старая квитанция не применена.");
          }
        }
        if (!contextMatches(initial)) throw paused(entry.id, "Локальные данные изменились. Старый ответ не применён.");
        return data.result.payload;
      });
    },
  };
}
