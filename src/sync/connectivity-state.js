// A browser network hint is not proof that the API is reachable (notably on iOS).
export function createConnectivityState({ online = true, onChange = () => {} } = {}) {
  let state = online === false ? "offline" : "checking";
  let sequence = 0;
  let observed = 0;
  const set = (next) => {
    if (state === next) return;
    state = next;
    onChange(state);
  };
  return {
    current: () => state,
    begin: () => ++sequence,
    browserChanged(online) {
      observed = ++sequence;
      set(online === false ? "offline" : "checking");
    },
    observe(token, reachable) {
      if (token < observed) return;
      observed = token;
      set(reachable ? "connected" : "offline");
    }
  };
}
