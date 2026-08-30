import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPERIMENT_API_BASE,
  EXPERIMENT_SHARED_AUTH_URL,
  resolveApiBase,
} from "../../src/config/constants.js";
import { ensureExperimentSharedAuthSession } from "../../src/sync/experiment-shared-auth.js";
import { bikePackingPhotoAssetUrl } from "../../src/sync/photos.js";

test("CRITICAL experiment auth: existing shared session is picked up without changing the app API", async () => {
  const requests = [];
  const result = await ensureExperimentSharedAuthSession({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, user: { id: "user-1" }, session: { id: "session-1" } }),
      };
    },
    locationLike: { hostname: "experiment.vniipo-help.ru" },
  });

  assert.equal(result.handled, true);
  assert.equal(requests[0].url, EXPERIMENT_SHARED_AUTH_URL);
  assert.equal(requests[0].options.credentials, "include");
  assert.equal(resolveApiBase({ hostname: "experiment.vniipo-help.ru" }), EXPERIMENT_API_BASE);
});

test("CRITICAL experiment photos: private photo routes stay on the experiment API", () => {
  const url = bikePackingPhotoAssetUrl("list-one", "photo-one", "thumb", EXPERIMENT_API_BASE);
  assert.match(url, /^https:\/\/experiment\.vniipo-help\.ru\/letters-vniipo\/api\/bike-packing\/lists\//);
  assert.doesNotMatch(url, /^https:\/\/api\.vniipo-help\.ru\//);
});
