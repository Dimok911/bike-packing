import { assertListOperationPayload } from "./list-operation-payload.js";

// Development gate: enabling this requires a separately approved rollout.
export const LIST_OPERATION_QUEUE_ENABLED = false;
export const LIST_OPERATION_CAPABILITY = "personalListCausalOperationsV1";
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
  if (op.state === "rejected") return [400, 403, 404, 409, 413, 422].includes(result?.status) && result.payload?.ok === false;
  if (!(result?.status >= 200 && result.status < 300 && result.payload?.ok === true)) return false;
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

export function createListOperationQueue({ transport, getContext = () => null,
  enabled = LIST_OPERATION_QUEUE_ENABLED, locks = globalThis.navigator?.locks,
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
    return request(gateway, { operationId: entry.id, expectedActorId: saved.actorId, environment,
      kind: saved.kind, listId: saved.listId, body: saved.body });
  };
  const recover = async (entry, { resumeWaiting = false, assertBeforeDispatch = () => {} } = {}) => {
    const data = await read(`${gateway}/${encodeURIComponent(entry.id)}`);
    // ONLY an exact server-bound waiting intent permits another POST of the
    // frozen manifest. Unknown/timeout/404 never means permission to resend.
    if (resumeWaiting && validateWaitingOperation(data, entry.recovery)) {
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
    supports(path, method) { return enabled && transport.experiment && Boolean(listOperationRoute(path, method)); },
    // Read-only historical settlement. It never creates a transport intent,
    // dispatches a mutation or resumes a waiting operation. The proof deliberately
    // excludes business payloads: it is NOT authority to apply an old snapshot.
    async inspect({ path, method, body: bodyText, operationId }) {
      if (!this.supports(path, method)) throw Error("Unsupported list queue request");
      if (!locks?.request) throw paused(operationId, "Блокировка между вкладками недоступна. Сверка остановлена.");
      const initial = { ...getContext() };
      if (!initial.actorId || !initial.generation || initial.scope !== "personal"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId || "")) throw paused(operationId);
      const body = JSON.parse(bodyText || "{}");
      const route = listOperationRoute(path, method), listId = route.listId || body.id;
      if (typeof listId !== "string" || !listId.trim() || listId !== listId.trim() || listId.length > 191) throw paused(operationId);
      const children = route.kind.endsWith(".sync") ? (body[route.kind.split(".")[0]] || []).map(entry => entry.id || entry.payload?.id) : [];
      if (children.some(id => typeof id !== "string" || !id) || new Set(children).size !== children.length) throw paused(operationId);
      const expected = { operationId, actorId: initial.actorId, kind: route.kind, listId, body, children,
        payloadDigest: await sha(canonicalListOperationJson({ environment, actorId: initial.actorId, kind: route.kind, listId, body })) };
      const assertContext = () => {
        const current = getContext();
        if (["actorId", "generation", "scope", "scopeKey", "listId"].some(key => current?.[key] !== initial[key])) {
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
        if (entry) recordReceipt(entry, data);
        assertContext();
        return historicalProof(data);
      });
    },
    // Narrow terminalization, NOT generic retry/cancellation: the immutable
    // parent is already rejected. The backend dependency transaction therefore
    // cannot apply this exact child's effects. Unknown independent actions still
    // have no resend permission. Both complete manifests are verified by GET.
    async settleRejectedDependency({ path, method, body: bodyText, operationId, predecessor }) {
      if (!this.supports(path, method) || !locks?.request) throw paused(operationId);
      const initial = { ...getContext() }, body = JSON.parse(bodyText || "{}"), route = listOperationRoute(path, method);
      const parent = JSON.parse(JSON.stringify(predecessor || {}));
      const parentRoute = listOperationRoute(parent.path, parent.method), parentBody = JSON.parse(parent.body || "{}");
      const validUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || "");
      const listId = route.listId;
      if (!initial.actorId || !initial.generation || initial.scope !== "personal" || !["list.update", "list.restore"].includes(route.kind)
        || !validUuid(operationId) || !validUuid(parent.operationId) || parent.operationId === operationId
        || !["list.create", "list.update", "list.restore"].includes(parentRoute?.kind)
        || (parentRoute.listId || parentBody.id) !== listId
        || body.causal?.baseOperationId !== parent.operationId
        || canonicalListOperationJson(body.causal.dependsOn) !== canonicalListOperationJson([{ operationId: parent.operationId, listId }])
        || canonicalListOperationJson(body.causal.reads) !== "[]") throw paused(operationId);
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
    async run({ path, method, body: bodyText, operationId: requestedId, receiptOnly = false }) {
      if (!this.supports(path, method)) throw Error("Unsupported list queue request");
      if (!locks?.request) throw paused(null, "Блокировка между вкладками недоступна. Запрос не отправлен.");
      const initial = { ...getContext() };
      if (!initial?.actorId || !initial?.generation || initial.scope !== "personal") throw paused(null, "Для сохранения нужен текущий личный аккаунт.");
      // Freeze before waiting for another tab, not after it has changed local data.
      const body = JSON.parse(bodyText || "{}");
      const route = listOperationRoute(path, method);
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
        for (const entry of transport.writes.filter(entry => entry.recovery?.protocol === "causal-v1" && !entry.confirmed
          && entry.recovery.requestKey !== requestKey && entry.recovery.listId === (route.listId || body.id))) {
          if (entry.recovery.actorId !== initial.actorId) throw paused(entry.id);
          const explicitlyRelated = body.causal?.dependsOn?.some(dep => dep.operationId === entry.id)
            || (requestedId && entry.recovery.body?.causal?.dependsOn?.some(dep => dep.operationId === requestedId));
          if (!explicitlyRelated) await recover(entry);
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
        let data;
        if (entry) data = await recover(entry, { resumeWaiting: true,
          assertBeforeDispatch: () => { if (!contextMatches(initial)) throw paused(entry.id); } });
        else {
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId };
          transport.assertWritable(path, method, protocol);
          const capabilities = await read("/bike-packing/capabilities");
          if (!capabilities.capabilities?.includes(LIST_OPERATION_CAPABILITY)) throw paused(null, "Сервер ещё не поддерживает подтверждение этой операции. Запрос не отправлен.");
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
