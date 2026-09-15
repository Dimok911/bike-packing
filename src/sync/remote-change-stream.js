// SSE invalidations trigger the existing guarded reader, never apply wire data.
// fetch streaming preserves the Experiment transport's redirect prohibition.
export function createRemoteChangeStream({ getContext, transport, refresh,
  fetchImpl = globalThis.fetch, retryMs = 5000, idleMs = 45000 } = {}) {
  let active = null;
  let draining = false;
  let stopped = false;
  let paused = false;
  const keyOf = context => context ? JSON.stringify([context.actorId, context.listId]) : "";
  const current = owner => active === owner && !owner.controller.signal.aborted &&
    keyOf(getContext()) === owner.key;
  const drain = async () => {
    const owner = active;
    if (draining || !owner?.pending || !current(owner)) return;
    const sequence = owner.sequence;
    draining = true;
    try {
      const checked = await refresh();
      if (checked && current(owner) && sequence === owner.sequence) owner.pending = false;
    } catch { /* Polling remains the fallback; no mutation or sync status change. */ }
    finally {
      draining = false;
      if (current(owner) && sequence !== owner.sequence) void drain();
    }
  };
  const signal = owner => {
    if (!current(owner)) return;
    owner.pending = true;
    owner.sequence += 1;
    void drain();
  };
  const run = async owner => {
    let idleTimer;
    let reader;
    const options = { credentials: "include", cache: "no-store", redirect: "error",
      signal: owner.controller.signal };
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => owner.controller.abort(), idleMs);
    };
    try {
      resetIdle();
      await transport.prepare();
      if (!current(owner)) return;
      const capabilities = await fetchImpl(transport.apiUrl("/bike-packing/capabilities"), options);
      if (!capabilities.ok || !(await capabilities.json())?.capabilities?.includes("listLiveUpdatesV1")) return;
      owner.supported = true;
      if (!current(owner)) return;
      const response = await fetchImpl(transport.apiUrl(`/bike-packing/lists/${encodeURIComponent(owner.context.listId)}/events`), options);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream")) return;
      if (!current(owner)) return;
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (current(owner)) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 8192) throw new Error("Invalid notification stream");
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (/^event: (ready|changed)$/m.test(event)) signal(owner);
        }
      }
    } catch { /* Loss of SSE never implies a failed save. */ }
    finally {
      clearTimeout(idleTimer);
      await reader?.cancel().catch(() => {});
      owner.controller.abort();
      if (active === owner) {
        // Unsupported servers use polling; retry no faster than that polling.
        owner.retry = setTimeout(() => {
          if (active !== owner) return;
          active = null;
          reconcile();
        }, owner.supported ? retryMs : 60000);
      }
    }
  };
  function reconcile() {
    if (stopped) return;
    const context = paused ? null : getContext();
    const key = keyOf(context);
    if (active?.key === key) { void drain(); return; }
    if (active) {
      clearTimeout(active.retry);
      active.controller.abort();
      active = null;
    }
    if (!context) return;
    active = { key, context, controller: new AbortController(), pending: false, sequence: 0 };
    void run(active);
  }
  return { reconcile, pause() { paused = true; reconcile(); },
    resume() { paused = false; reconcile(); }, stop() {
    stopped = true;
    if (active) { clearTimeout(active.retry); active.controller.abort(); active = null; }
  } };
}
