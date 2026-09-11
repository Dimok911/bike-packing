import { EXPERIMENT_SESSION_MIGRATION_URL } from "../config/constants.js";
import { experimentTransport } from "./experiment-transport.js";

export function isExperimentHost(locationLike = globalThis.location) {
  return String(locationLike?.hostname || "").toLowerCase() === "experiment.vniipo-help.ru";
}

async function mutateSession(url, path, { fetchImpl, timeoutMs, transport, body, migration = false }) {
  // These session endpoints have fixed destinations. They still participate in
  // the cross-tab mutation barrier, including an unknown result after timeout.
  const writeId = await transport.beginWrite(path, "POST", body);
  try {
    transport.assertWritable(path, "POST");
  } catch (error) {
    transport.confirmWrite(writeId, { committed: false });
    throw error;
  }
  const controller = new AbortController();
  let timeoutId;
  try {
    const { response, data } = await Promise.race([
      fetchImpl(url, {
        method: "POST", credentials: "include", cache: "no-store", redirect: "error",
        signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      }).then(async response => ({ response, data: migration ? await response.json().catch(() => null) : null })),
      new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          const error = new Error("Session request timed out; result is unconfirmed");
          error.name = "AbortError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
    if (response.status >= 500 || response.status === 408
      || (migration && response.ok && (data?.ok === false || !data?.user?.id))) {
      const error = new Error("Session result is unconfirmed");
      error.status = response.ok ? 0 : response.status;
      throw error;
    }
    if (transport.confirmWrite(writeId, { committed: response.ok }) === false) {
      throw new Error("Session acknowledgement could not be saved");
    }
    return { response, data };
  } catch (error) {
    throw transport.noteFailure(error, path, "POST", writeId);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function migrateExperimentSession({
  explicitIntent = false, fetchImpl = globalThis.fetch, locationLike = globalThis.location,
  timeoutMs = 7000, transport = experimentTransport,
} = {}) {
  if (!isExperimentHost(locationLike)) return { handled: false, reason: "not-experiment" };
  if (!explicitIntent) return { handled: false, reason: "explicit-intent-required" };
  if (typeof fetchImpl !== "function") return { handled: false, reason: "fetch-unavailable" };
  const { response } = await mutateSession(EXPERIMENT_SESSION_MIGRATION_URL, "/auth/migrate-session", {
    fetchImpl, timeoutMs, transport, body: JSON.stringify({ useExperimentSession: true }), migration: true,
  });
  if (!response.ok) return { handled: false, reason: response.status === 401 ? "sign-in-required" : "unavailable" };
  await clearLegacyExperimentCookie({ fetchImpl, locationLike, timeoutMs, transport }).catch(() => null);
  return { handled: true, reason: "session-migrated" };
}

export async function clearLegacyExperimentCookie({
  fetchImpl = globalThis.fetch, locationLike = globalThis.location,
  timeoutMs = 7000, transport = experimentTransport,
} = {}) {
  if (!isExperimentHost(locationLike)) return;
  if (typeof fetchImpl !== "function") throw new Error("Session cleanup is unavailable");
  const { response } = await mutateSession("https://experiment.vniipo-help.ru/session/clear-legacy", "/session/clear-legacy", {
    fetchImpl, timeoutMs, transport,
  });
  if (!response.ok) throw new Error("Legacy session cleanup failed");
}
