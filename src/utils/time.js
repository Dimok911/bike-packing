export function nowIso() {
  return new Date().toISOString();
}

export function timeValue(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
