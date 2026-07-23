let explicitViewportScrollUntil = 0;

export function markExplicitViewportScrollIntent({
  durationMs = 700,
  now = Date.now()
} = {}) {
  explicitViewportScrollUntil = Math.max(
    explicitViewportScrollUntil,
    Number(now) + Math.max(0, Number(durationMs) || 0)
  );
  return explicitViewportScrollUntil;
}

export function hasExplicitViewportScrollIntent(now = Date.now()) {
  return Number(now) <= explicitViewportScrollUntil;
}

export function resetExplicitViewportScrollIntent() {
  explicitViewportScrollUntil = 0;
}
