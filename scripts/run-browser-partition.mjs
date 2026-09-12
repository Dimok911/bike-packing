import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Only these reviewed files contain independent, per-test browser fixtures.
// Other files and every nested describe remain indivisible. beforeAll still
// builds each selected file's bundles once per worker, as in an ordinary run.
const SPLIT_FILES = new Map([
  ["admin-template-save-ui.spec.js", 86.08 * 60 / 1433],
  ["personal-save-ui.spec.js", 29.66 * 60 / 362],
]);

export function collectTests(report, project) {
  assert.deepEqual(report.errors, [], "Playwright collection failed");
  const result = [];
  function visit(suite, parents) {
    for (const spec of suite.specs || []) for (const test of spec.tests || []) {
      assert.equal(test.projectName, project, "Unexpected project in test collection");
      result.push({ id: `${spec.id}:${project}`, project, file: spec.file,
        titlePath: [...parents, spec.title] });
    }
    for (const child of suite.suites || []) visit(child, [...parents, child.title]);
  }
  for (const suite of report.suites || []) visit(suite, []);
  validateTests(result);
  return result;
}

function validateTests(tests) {
  assert.ok(tests.length, "Empty test collection");
  const ids = new Set(), identities = new Set();
  for (const test of tests) {
    assert.ok(typeof test.id === "string" && test.id && !ids.has(test.id), "Duplicate or missing test ID");
    ids.add(test.id);
    assert.ok(Array.isArray(test.titlePath) && test.titlePath.length, "Missing complete test title");
    for (const part of [test.project, test.file, ...test.titlePath]) {
      assert.ok(typeof part === "string" && part && part === part.trim() && !/[\r\n›]/u.test(part),
        "Test identity cannot be represented exactly in a native Playwright list");
    }
    assert.ok(!path.isAbsolute(test.file) && !test.file.split(/[\\/]/).includes(".."), "Unsafe test file");
    const identity = testListLine(test);
    assert.ok(!identities.has(identity), "Duplicate native test-list identity");
    identities.add(identity);
  }
}

export function testListLine(test) {
  return `[${test.project}] › ${[test.file, ...test.titlePath].join(" › ")}`;
}

export function partitionTests(tests, count = 4) {
  validateTests(tests);
  assert.ok(Number.isInteger(count) && count > 0 && count <= tests.length, "Invalid partition count");
  const groups = new Map();
  for (const test of tests) {
    const split = SPLIT_FILES.has(test.file);
    const key = JSON.stringify([test.project, test.file, split ? test.titlePath.length > 1 ? test.titlePath[0] : test.id : null]);
    if (!groups.has(key)) groups.set(key, { key, weight: 0, tests: [] });
    const group = groups.get(key);
    group.weight += SPLIT_FILES.get(test.file) || 2;
    group.tests.push(test);
  }
  const partitions = Array.from({ length: count }, (_, index) => ({ index: index + 1, weight: 0, tests: [] }));
  const sorted = [...groups.values()].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const group of sorted) {
    const target = [...partitions].sort((a, b) => a.weight - b.weight || a.index - b.index)[0];
    target.weight += group.weight;
    target.tests.push(...group.tests);
  }
  const order = new Map(tests.map((test, index) => [test.id, index]));
  for (const partition of partitions) partition.tests.sort((a, b) => order.get(a.id) - order.get(b.id));
  verifyCoverage(tests, partitions.map(partition => partition.tests));
  return partitions;
}

export function verifyCoverage(expected, partitions) {
  validateTests(expected);
  const ids = new Set(expected.map(test => test.id)), seen = new Set();
  for (const tests of partitions) {
    validateTests(tests);
    for (const test of tests) {
      assert.ok(ids.has(test.id), "Partition contains an unknown test");
      assert.ok(!seen.has(test.id), "Partitions overlap");
      seen.add(test.id);
    }
  }
  assert.equal(seen.size, ids.size, "Partitions omit tests");
}

export function assertSplittableSource(source) {
  assert.ok(!/\bdescribe\s*\.\s*(?:serial|parallel)\b|\bmode\s*:\s*["'](?:serial|parallel)["']/.test(source),
    "A split file changed its execution mode; review grouping before partitioning it");
}

async function main(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    assert.ok(["--project", "--partition", "--partitions", "--list-only"].includes(name) && !options.has(name), "Invalid or duplicate option");
    options.set(name, name === "--list-only" ? true : args[++index]);
  }
  const project = options.get("--project"), selected = Number(options.get("--partition")), count = Number(options.get("--partitions") || 4);
  assert.ok(["chromium", "mobile-webkit"].includes(project), "Unknown browser project");
  assert.ok(Number.isInteger(selected) && selected >= 1 && selected <= count && count === 4, "Expected partition 1..4 of four");
  const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@playwright/test/package.json")));
  for (const file of SPLIT_FILES.keys()) assertSplittableSource(readFileSync(path.resolve("tests/e2e", file), "utf8"));
  const output = path.resolve("browser-diagnostics/partitions", project);
  mkdirSync(output, { recursive: true });
  function list(extra = []) {
    const result = spawnSync(process.execPath, [cli, "test", "--list", `--project=${project}`, "--reporter=json", ...extra],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    if (result.status !== 0) throw Error(result.error?.message || result.stderr || result.stdout || "Playwright listing failed");
    return collectTests(JSON.parse(result.stdout), project);
  }
  const baseline = list(), partitions = partitionTests(baseline, count), native = [];
  writeFileSync(path.join(output, "baseline.json"), JSON.stringify(baseline, null, 2));
  for (const partition of partitions) {
    partition.file = path.join(output, `partition-${partition.index}.txt`);
    writeFileSync(partition.file, partition.tests.map(testListLine).join("\n") + "\n");
    const actual = list(["--test-list", partition.file]);
    verifyCoverage(partition.tests, [actual]);
    native.push(actual);
  }
  verifyCoverage(baseline, native);
  const summary = { project, total: baseline.length, disjoint: true, selected,
    partitions: partitions.map(partition => ({ index: partition.index, tests: partition.tests.length,
      estimatedMinutes: Math.round(partition.weight / 60 * 100) / 100 })) };
  writeFileSync(path.join(output, "coverage.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`Native browser partition coverage verified: ${JSON.stringify(summary)}`);
  if (options.get("--list-only")) return;
  const result = spawnSync(process.execPath, [cli, "test", `--project=${project}`, "--test-list", partitions[selected - 1].file],
    { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
