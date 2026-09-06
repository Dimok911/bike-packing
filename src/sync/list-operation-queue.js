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
  if (expected.kind === "list.create" || expected.kind === "list.update") return result.payload.list?.id === expected.listId;
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
    return current?.actorId === initial.actorId && current?.generation === initial.generation && current?.scope === initial.scope;
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
  const recover = async (entry, { resumeWaiting = false } = {}) => {
    const data = await read(`${gateway}/${encodeURIComponent(entry.id)}`);
    // ONLY an exact server-bound waiting intent permits another POST of the
    // frozen manifest. Unknown/timeout/404 never means permission to resend.
    if (resumeWaiting && validateWaitingOperation(data, entry.recovery)) {
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
    async run({ path, method, body: bodyText, operationId: requestedId }) {
      if (!this.supports(path, method)) throw Error("Unsupported list queue request");
      if (!locks?.request) throw paused(null, "Блокировка между вкладками недоступна. Запрос не отправлен.");
      const initial = getContext();
      if (!initial?.actorId || !initial?.generation || initial.scope !== "personal") throw paused(null, "Для сохранения нужен текущий личный аккаунт.");
      // Freeze before waiting for another tab, not after it has changed local data.
      const body = JSON.parse(bodyText || "{}");
      const route = listOperationRoute(path, method);
      const generation = await sha(initial.generation);
      if (requestedId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestedId)) throw paused(null);
      const requestKey = await sha(canonicalListOperationJson({ path, method, body, generation, actorId: initial.actorId,
        ...(requestedId ? { operationId: requestedId } : {}) }));
      return locks.request(`${LIST_OPERATION_QUEUE_LOCK}:${initial.actorId}:${route.listId || body.id || requestKey}`, async () => {
        if (!contextMatches(initial)) throw paused(null, "Локальные данные изменились. Устаревший запрос не отправлен.");
        await transport.prepare();
        const me = await read("/auth/me");
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
        let entry = transport.writes.find(entry => entry.recovery?.type === "list" && entry.recovery.requestKey === requestKey);
        let data;
        if (entry) data = await recover(entry, { resumeWaiting: true });
        else {
          const protocol = { type: "list", protocol: "causal-v1", actorId: initial.actorId };
          transport.assertWritable(path, method, protocol);
          const capabilities = await read("/bike-packing/capabilities");
          if (!capabilities.capabilities?.includes(LIST_OPERATION_CAPABILITY)) throw paused(null, "Сервер ещё не поддерживает подтверждение этой операции. Запрос не отправлен.");
          const listId = route.listId || body.id || `list-${crypto.randomUUID()}`;
          const operationId = requestedId || crypto.randomUUID();
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
