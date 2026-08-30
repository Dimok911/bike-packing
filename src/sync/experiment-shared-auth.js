import { EXPERIMENT_SHARED_AUTH_URL } from "../config/constants.js";

let shareAttempt = null;

export async function ensureExperimentSharedAuthSession({
  fetchImpl = typeof fetch === "function" ? fetch : null,
  locationLike = typeof window !== "undefined" ? window.location : null,
  shareUrl = EXPERIMENT_SHARED_AUTH_URL,
} = {}) {
  if (String(locationLike?.hostname || "").toLowerCase() !== "experiment.vniipo-help.ru") {
    return { handled: false, reason: "not-experiment" };
  }
  if (typeof fetchImpl !== "function") return { handled: false, reason: "fetch-unavailable" };
  if (shareAttempt) return shareAttempt;

  shareAttempt = (async () => {
    const response = await fetchImpl(shareUrl, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await response.json().catch(() => null);
    return {
      handled: Boolean(response.ok && data?.user?.id),
      reason: response.ok ? "session-shared" : response.status === 401 ? "signed-out" : "unavailable",
    };
  })().catch(() => ({ handled: false, reason: "network-error" }));

  return shareAttempt;
}
