export function installRuntimeActiveLayoutId(targetState, initialLayoutId = "") {
  if (!targetState || typeof targetState !== "object") return targetState;
  const descriptor = Object.getOwnPropertyDescriptor(targetState, "activeLayoutId");
  let activeLayoutId = String(
    initialLayoutId ||
    (descriptor && "value" in descriptor ? descriptor.value : targetState.activeLayoutId) ||
    ""
  );

  Object.defineProperty(targetState, "activeLayoutId", {
    configurable: true,
    enumerable: false,
    get() {
      return activeLayoutId;
    },
    set(value) {
      activeLayoutId = String(value || "");
    }
  });

  return targetState;
}

