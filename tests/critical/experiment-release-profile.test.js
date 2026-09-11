import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { experimentReleasePlugin, EXPERIMENT_RELEASE_ORIGIN, EXPERIMENT_RELEASE_GATES } from "../../scripts/experiment-release-profile.mjs";

const root = resolve(import.meta.dirname, "../..");
test("release cohort activates only on exact Experiment origin and keeps source defaults disabled", () => {
  const plugin = experimentReleasePlugin(root);
  plugin.buildStart();
  for (const [path, gates] of Object.entries(EXPERIMENT_RELEASE_GATES)) {
    const input = readFileSync(resolve(root, path), "utf8");
    const output = plugin.transform(input, resolve(root, path) + "?v=release").code;
    for (const gate of gates) {
      assert.ok(input.includes(`export const ${gate} = false;`));
      const expression = output.match(new RegExp(`export const ${gate} = (.*);`))?.[1];
      assert.ok(expression);
      for (const origin of [EXPERIMENT_RELEASE_ORIGIN, "https://vniipo-help.ru", "https://api-eu.vniipo-help.ru",
        "https://experiment.vniipo-help.ru.attacker.example", "http://127.0.0.1:4173", undefined]) {
        assert.equal(runInNewContext(expression, { location: origin ? { origin } : undefined }), origin === EXPERIMENT_RELEASE_ORIGIN);
      }
    }
    if (path.endsWith("experiment-transport.js")) assert.ok(output.includes("AUTO_TRANSPORT_RELEASE_ENABLED = false"));
  }
  plugin.buildEnd();
  assert.equal(Object.values(EXPERIMENT_RELEASE_GATES).flat().length, 22);
});
test("release refuses changed or absent gate declarations and ignores unrelated source paths", () => {
  const plugin = experimentReleasePlugin(root);
  const path = resolve(root, "src/sync/personal-save-outbox.js");
  const text = "export const PERSONAL_SAVE_OUTBOX_ENABLED = false;";
  assert.throws(() => plugin.transform(text + text, path), /declaration changed/);
  assert.throws(() => plugin.transform(text.replace("false", "true"), path), /declaration changed/);
  assert.equal(plugin.transform(text, resolve(root, "untrusted/src/sync/personal-save-outbox.js")), null);
  plugin.buildStart();
  assert.throws(() => plugin.buildEnd(), /not compiled/);
});
