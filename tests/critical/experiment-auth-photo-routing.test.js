import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXPERIMENT_API_BASE, EXPERIMENT_SESSION_MIGRATION_URL, PRODUCTION_API_BASE, resolveApiBase } from "../../src/config/constants.js";
import { migrateExperimentSession, clearLegacyExperimentCookie } from "../../src/sync/experiment-shared-auth.js";
import { bikePackingPhotoAssetUrl, normalizeRemotePhotoUrl } from "../../src/sync/photos.js";

const experiment = { hostname: "experiment.vniipo-help.ru" };
test("Experiment uses canonical host with an isolated full API prefix; Production is unchanged", () => {
  assert.equal(resolveApiBase(experiment), "https://api.vniipo-help.ru/experiment/letters-vniipo/api");
  assert.equal(resolveApiBase({ hostname: "vniipo-help.ru" }), PRODUCTION_API_BASE);
  const url = bikePackingPhotoAssetUrl("list-one", "photo-one", "thumb", EXPERIMENT_API_BASE);
  assert.ok(url.startsWith(`${EXPERIMENT_API_BASE}/bike-packing/lists/`));
  for (const origin of ["https://experiment.vniipo-help.ru", "https://api.vniipo-help.ru"]) {
    assert.equal(normalizeRemotePhotoUrl(`${origin}/letters-vniipo/api/bike-packing/lists/a/photos/b/thumb?v=2`, EXPERIMENT_API_BASE),
      `${EXPERIMENT_API_BASE}/bike-packing/lists/a/photos/b/thumb?v=2`);
  }
});
test("migration requires explicit intent and never runs on another host", async () => {
  const fetchImpl = () => { throw new Error("Unexpected request"); };
  assert.equal((await migrateExperimentSession({ fetchImpl, locationLike: experiment })).reason, "explicit-intent-required");
  assert.equal((await migrateExperimentSession({ fetchImpl, explicitIntent: true, locationLike: { hostname: "vniipo-help.ru" } })).reason, "not-experiment");
  await clearLegacyExperimentCookie({ fetchImpl, locationLike: { hostname: "vniipo-help.ru" } });
  const flow = readFileSync(new URL("../../src/sync/auth-load-flow.js", import.meta.url), "utf8");
  assert.doesNotMatch(flow, /migrateExperimentSession|ensureExperimentSharedAuthSession|experiment-share-session/);
});
test("explicit migration uses the canonical endpoint and then clears only the old host cookie", async () => {
  const requests = [];
  const result = await migrateExperimentSession({ explicitIntent: true, locationLike: experiment,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ user: { id: "isolated-user" } }));
    },
  });
  assert.equal(result.handled, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, EXPERIMENT_SESSION_MIGRATION_URL);
  assert.deepEqual(JSON.parse(requests[0].options.body), { useExperimentSession: true });
  assert.equal(requests[1].url, "https://experiment.vniipo-help.ru/session/clear-legacy");
  assert.ok(requests.every(({ options }) => options.method === "POST" && options.credentials === "include"));
});
test("failed migration preserves the old cookie and can be explicitly retried", async () => {
  let calls = 0;
  const options = { explicitIntent: true, locationLike: experiment,
    fetchImpl: async () => { calls++; return new Response("{}", { status: 401 }); },
  };
  assert.equal((await migrateExperimentSession(options)).handled, false);
  assert.equal((await migrateExperimentSession(options)).handled, false);
  assert.equal(calls, 2);
});
