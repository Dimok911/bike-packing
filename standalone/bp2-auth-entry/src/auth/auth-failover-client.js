// Shared browser transport: pinned origins, bounded reads, and no mutation replay.
const temporaryStatuses = new Set([502, 503, 504]);
const operations = Object.freeze({
  session: ['GET', '/auth/me'],
  requestMagicLink: ['POST', '/auth/request-magic-link'],
  confirmMagicLink: ['POST', '/auth/verify-magic-link'],
  logout: ['POST', '/auth/logout'],
  vdocHandoff: ['POST','/auth/vdoc-handoff'],
  videoHandoff: ['POST','/auth/video-handoff'],
  profile: ['PATCH','/auth/me'],
});

export class AuthFailoverError extends Error {
  constructor(code, endpoint = '') {
    super(code);
    this.name = 'AuthFailoverError';
    this.code = code;
    this.endpoint = endpoint;
  }
}

export function createAuthFailoverClient({endpoints, fetch: fetchImpl = globalThis.fetch,
  timeoutMs = 2500, mutationTimeoutMs = 15000, mailTimeoutMs = 60000, cooldownMs = 30000, now = Date.now, onState = () => {}, allowLoopbackHttp = false} = {}) {
  if (!Array.isArray(endpoints) || endpoints.length !== 2) throw new Error('Two explicit endpoints required');
  const addresses = endpoints.map(value => {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(allowLoopbackHttp && local && url.protocol === 'http:'))) {
      throw new Error('Auth endpoint must be a trusted HTTPS origin');
    }
    return url.origin;
  });
  if (new Set(addresses).size !== 2) throw new Error('Endpoints must be distinct');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || !Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('Invalid timeouts');
  if (![mutationTimeoutMs,mailTimeoutMs].every(value=>Number.isFinite(value)&&value>=1)) throw new Error('Invalid mutation timeouts');
  let active = 0;
  const unavailableUntil = [0, 0];
  const emit = (state, index, extra = {}) => {
    try { onState({state, endpoint: addresses[index], ...extra}); } catch { /* UI callbacks cannot change request semantics. */ }
  };
  const fail = index => { unavailableUntil[index] = now() + cooldownMs; emit('unavailable', index); };
  const accept = index => {
    active = index; unavailableUntil[index] = 0; emit('connected', index);
  };
  const order = () => {
    const all = [active, 1 - active];
    const available = all.filter(index => unavailableUntil[index] <= now());
    return [...available, ...all.filter(index => !available.includes(index))];
  };
  const exchange = async (index, method, path, body, signal, requestTimeoutMs = timeoutMs) => {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    let timeout;
    let knownErrorResponse;
    const abort = () => controller.abort(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, {once:true});
    const aborted = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {once:true});
      timeout = setTimeout(() => controller.abort(new AuthFailoverError('auth_timeout', addresses[index])), requestTimeoutMs);
    });
    try {
      return await Promise.race([aborted, (async () => {
        let response;
        try {
          response = await fetchImpl(addresses[index] + path, {
            method, credentials:'include', cache:'no-store', redirect:'error', signal:controller.signal,
            headers: body === undefined ? {Accept:'application/json'} : {Accept:'application/json','Content-Type':'application/json'},
            ...(body === undefined ? {} : {body:JSON.stringify(body)}),
          });
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          throw new AuthFailoverError('auth_transport_failed', addresses[index]);
        }
        // Error pages need not be JSON. Do not let an HTML 401 trigger failover.
        if (!response.ok) {
          // Keep safe application errors for the UI. A slow/malformed error body
          // must not turn a denial/rate limit into a failover or repeated POST.
          knownErrorResponse={status:response.status,payload:null,endpoint:addresses[index]};
          let payload=null;
          if(!temporaryStatuses.has(response.status)){
            try {payload=await Promise.race([response.json(),aborted]);} catch {}
          }else response.body?.cancel().catch(()=>{});
          return {status:response.status,payload,endpoint:addresses[index]};
        }
        let payload;
        try { payload = await response.json(); }
        catch { throw new AuthFailoverError('auth_invalid_response', addresses[index]); }
        if (!payload || payload.ok !== true) throw new AuthFailoverError('auth_invalid_response', addresses[index]);
        return {status:response.status, payload, endpoint:addresses[index]};
      })()]);
    } catch(error) {
      if(knownErrorResponse && !signal?.aborted)return knownErrorResponse;
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
  const recoverable = error => error instanceof AuthFailoverError && ['auth_timeout','auth_transport_failed'].includes(error.code);
  const read = async (path, signal, readiness = false) => {
    for (const index of order()) {
      emit('checking', index);
      let result;
      try { result = await exchange(index, 'GET', path, undefined, signal); }
      catch (error) {
        if (signal?.aborted) throw signal.reason || error;
        if (!recoverable(error)) throw error;
        fail(index); continue;
      }
      if (temporaryStatuses.has(result.status)) { fail(index); continue; }
      if (readiness && result.status === 200 && (result.payload.service !== 'vniipo-auth' || result.payload.database !== 'ready')) {
        throw new AuthFailoverError('auth_invalid_response', addresses[index]);
      }
      if (!readiness && result.status === 200 && (!Object.hasOwn(result.payload, 'user') || !Object.hasOwn(result.payload, 'session'))) {
        throw new AuthFailoverError('auth_invalid_response', addresses[index]);
      }
      accept(index);
      return {index, result};
    }
    emit('offline', active);
    throw new AuthFailoverError('auth_unavailable');
  };
  const request = async (operation, body, {signal} = {}) => {
    if (!Object.hasOwn(operations, operation)) throw new Error('Unknown Auth operation');
    const [method, path] = operations[operation];
    if (method === 'GET') return (await read(path, signal)).result;
    // Select a ready node BEFORE dispatch. Once a mutation is sent, never replay it.
    const selected = await read('/readyz', signal, true);
    if (selected.result.status !== 200) return selected.result;
    try {
      const result = await exchange(selected.index, method, path, body ?? {}, signal, operation === 'requestMagicLink' ? mailTimeoutMs : mutationTimeoutMs);
      if (temporaryStatuses.has(result.status)) throw new AuthFailoverError('auth_write_outcome_unknown', result.endpoint);
      accept(selected.index);
      return result;
    } catch (error) {
      // Even cancellation after dispatch may hide a committed operation.
      fail(selected.index);
      emit('outcome-unknown', selected.index);
      throw new AuthFailoverError('auth_write_outcome_unknown', addresses[selected.index]);
    }
  };
  return Object.freeze({request, get endpoint() { return addresses[active]; }});
}
