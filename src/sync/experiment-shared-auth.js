import { EXPERIMENT_SHARED_AUTH_URL } from "../config/constants.js";
import { experimentTransport } from "./experiment-transport.js";

let shareAttempt = null;

export async function ensureExperimentSharedAuthSession({
  fetchImpl = typeof fetch === "function" ? fetch : null,
  locationLike = typeof window !== "undefined" ? window.location : null,
  shareUrl = EXPERIMENT_SHARED_AUTH_URL,
  timeoutMs = 7000,
  transport = experimentTransport,
} = {}) {
  if (String(locationLike?.hostname || "").toLowerCase() !== "experiment.vniipo-help.ru") {
    return { handled: false, reason: "not-experiment" };
  }
  if (typeof fetchImpl !== "function") return { handled: false, reason: "fetch-unavailable" };
  if (shareAttempt) return shareAttempt;

  shareAttempt = (async () => {
    // This host-only-cookie bridge has one fixed RU destination, not a fallback.
    // Still participate in the same cross-tab mutation barrier before dispatch.
    const path = "/auth/experiment-share-session";
    const writeId = await transport.beginWrite(path, "POST");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(shareUrl, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
        redirect: "error",
      });
      const data = await response.json().catch(() => null);
      if (response.status >= 500 || response.status === 408 || (response.ok && !data)) {
        const error = new Error("Shared session result is unconfirmed");
        error.status = response.ok ? 0 : response.status;
        throw error;
      }
      transport.confirmWrite(writeId, { committed: response.ok });
      return {
        handled: Boolean(response.ok && data?.user?.id),
        reason: response.ok ? "session-shared" : response.status === 401 ? "signed-out" : "unavailable",
      };
    } catch (error) {
      throw transport.noteFailure(error, path, "POST", writeId);
    } finally {
      clearTimeout(timeoutId);
    }
  })().catch(() => ({ handled: false, reason: "network-error" }));

  return shareAttempt;
}
