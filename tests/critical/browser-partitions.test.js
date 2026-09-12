import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectTests, partitionTests, verifyCoverage, testListLine, assertSplittableSource } from "../../scripts/run-browser-partition.mjs";

const row = (id, file = "admin-template-save-ui.spec.js", titlePath = [`test ${id}`]) => ({
  id, project: "chromium", file, titlePath,
});
const fixture = () => [
  ...Array.from({ length: 32 }, (_, index) => row(`admin-${index}`)),
  ...Array.from({ length: 12 }, (_, index) => row(`personal-${index}`, "personal-save-ui.spec.js")),
  ...Array.from({ length: 7 }, (_, index) => row(`nested-${index}`, "admin-template-save-ui.spec.js", ["reverse import", `case ${index}`])),
  ...Array.from({ length: 4 }, (_, index) => row(`small-${index}`, "other.spec.js")),
];

test("native JSON collection preserves complete nested titles, skipped cases, and project identity", () => {
  const collected = collectTests({ errors: [], suites: [{ title: "file.spec.js", specs: [], suites: [{ title: "nested", specs: [
    { id: "one", file: "file.spec.js", title: "case", tests: [{ projectName: "chromium", expectedStatus: "skipped" }] },
  ] }] }] }, "chromium");
  assert.deepEqual(collected, [row("one:chromium", "file.spec.js", ["nested", "case"])]);
  assert.equal(testListLine(collected[0]), "[chromium] › file.spec.js › nested › case");
  assert.throws(() => collectTests({ errors: [{ message: "Collection error" }], suites: [] }, "chromium"), /collection failed/);
});

test("balanced partitions split only reviewed files and preserve every nested group and small file", () => {
  const expected = fixture(), partitions = partitionTests(expected);
  verifyCoverage(expected, partitions.map(partition => partition.tests));
  for (const ids of [expected.filter(test => test.titlePath.length > 1), expected.filter(test => test.file === "other.spec.js")]) {
    const owner = partitions.find(partition => partition.tests.some(test => test.id === ids[0].id));
    assert.ok(ids.every(test => owner.tests.includes(test)));
  }
  assert.equal(partitions.filter(partition => partition.tests.some(test => test.id.startsWith("admin-"))).length, 4);
  assert.deepEqual(partitionTests(expected), partitions, "Partition assignment must be deterministic");
  const positions = new Map(expected.map((test, index) => [test.id, index]));
  for (const partition of partitions) {
    const order = partition.tests.map(test => positions.get(test.id));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  }
});

test("coverage refuses omissions, overlap, invented tests, and empty partitions", () => {
  const a = row("a"), b = row("b");
  assert.throws(() => verifyCoverage([a, b], [[a]]), /omit/);
  assert.throws(() => verifyCoverage([a, b], [[a], [a, b]]), /overlap/);
  assert.throws(() => verifyCoverage([a, b], [[a], [row("alien")]]), /unknown/);
  assert.throws(() => verifyCoverage([a, b], [[a, b], []]), /Empty/);
});

test("native list identities refuse ambiguous duplicate titles and delimiter injection", () => {
  assert.throws(() => partitionTests([row("a"), row("a")], 1), /Duplicate/);
  assert.throws(() => partitionTests([row("a", "file.spec.js", ["same"]), row("b", "file.spec.js", ["same"])], 1), /Duplicate native/);
  for (const title of ["title\nsecond", "title › child", " title "]) {
    assert.throws(() => partitionTests([row("a", "file.spec.js", [title])], 1), /represented exactly/);
  }
});

test("a future serial or parallel declaration in a split file requires review", () => {
  for (const source of ["test.describe.serial('suite', fn)", "test.describe.configure({ mode: 'serial' })",
    'test.describe.configure({ mode: "parallel" })', "test.describe.parallel('suite', fn)"]) {
    assert.throws(() => assertSplittableSource(source), /execution mode/);
  }
  assert.doesNotThrow(() => assertSplittableSource("test.beforeAll(build); test('case', independentFixture);"));
});

test("workflow keeps isolated runner partitions, unique artifacts, and one mandatory owner-gate run per browser", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/frontend-quality.yml", import.meta.url), "utf8");
  const quality = workflow.split("  webkit-diagnostic:")[0];
  const config = readFileSync(new URL("../../playwright.config.js", import.meta.url), "utf8");
  assert.match(quality, /browser: \[chromium, mobile-webkit\]/);
  assert.match(quality, /partition: \[1, 2, 3, 4\]/);
  assert.match(quality, /timeout-minutes: 120/);
  assert.match(quality, /run-browser-partition\.mjs --project \$\{\{ matrix.browser \}\} --partition \$\{\{ matrix.partition \}\}/);
  assert.match(quality, /name: playwright-smoke-\$\{\{ matrix.browser \}\}-\$\{\{ matrix.partition \}\}/);
  assert.match(quality, /id: disabled_owner\s+if: matrix.partition == 1/);
  assert.match(quality, /name: playwright-disabled-owner-\$\{\{ matrix.browser \}\}-\$\{\{ matrix.partition \}\}/);
  assert.match(config, /fullyParallel: false/);
  assert.match(config, /workers: 1/);
  assert.match(config, /retries: process.env.CI \? 1 : 0/);
});
