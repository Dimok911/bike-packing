import { EXPERIMENT_SESSION_MIGRATION_URL } from "../config/constants.js";
export const isExperimentHost = (locationLike = globalThis.location) =>
  String(locationLike?.hostname || "").toLowerCase() === "experiment.vniipo-help.ru";
export async function clearLegacyExperimentCookie({ fetchImpl = globalThis.fetch, locationLike = globalThis.location } = {}) {
  if (!isExperimentHost(locationLike)) return;
  const response = await fetchImpl("https://experiment.vniipo-help.ru/session/clear-legacy", {
    method: "POST", credentials: "include", cache: "no-store",
  });
  if (!response.ok) throw new Error("Legacy cookie cleanup unavailable");
}
// Only the dedicated transfer button may invoke migration, never startup/focus.
export async function migrateExperimentSession({
  explicitIntent = false, fetchImpl = globalThis.fetch, locationLike = globalThis.location,
} = {}) {
  if (!isExperimentHost(locationLike)) return { handled: false, reason: "not-experiment" };
  if (explicitIntent !== true) return { handled: false, reason: "explicit-intent-required" };
  const response = await fetchImpl(EXPERIMENT_SESSION_MIGRATION_URL, {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useExperimentSession: true }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.user?.id) return { handled: false, reason: response.status === 401 ? "sign-in-required" : "unavailable" };
  await clearLegacyExperimentCookie({ fetchImpl, locationLike }).catch(() => null);
  return { handled: true };
}
