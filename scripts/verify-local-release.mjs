import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHECK_IDS = ["source", "critical", "transport", "browser", "build", "liveApi", "linuxApplication"];
const TEST_CHECKS = new Set(["critical", "transport", "browser", "linuxApplication"]);
const SHA = /^[0-9a-f]{64}$/;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const fail = message => { throw new Error(`Local release validation: ${message}`); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifestHash = rows => hash(JSON.stringify(rows));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !same(Object.keys(value).sort(), [...keys].sort())) fail(`${label} has an invalid shape`);
}

function relativePath(value) {
  if (typeof value !== "string" || !value || /[\\:\x00-\x1f]/.test(value)
    || path.posix.isAbsolute(value) || value.split("/").some(part => !part || part === "." || part === "..")) {
    fail("unsafe relative path");
  }
  return value;
}

function safeFile(root, relative) {
  const parts = relativePath(relative).split("/");
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      fail(`not an ordinary file: ${relative}`);
    }
  }
  return current;
}

function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) fail("invalid report/checks file");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

function cleanHead(root) {
  const commit = git(root, "rev-parse", "HEAD").trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) fail("invalid HEAD");
  if (git(root, "status", "--porcelain=v1", "--untracked-files=normal").trim()) fail("source tree is not clean");
  return commit;
}

function manifest(root, paths) {
  return [...paths].sort().map(relative => {
    const bytes = fs.readFileSync(safeFile(root, relative));
    return { path: relative, size: bytes.length, sha256: hash(bytes) };
  });
}

function artifactPaths(root, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = relativePath(prefix + entry.name);
    if (entry.isDirectory()) result.push(...artifactPaths(root, `${relative}/`));
    else if (entry.isFile()) result.push(relative);
    else fail(`unsupported artifact entry: ${relative}`);
  }
  return result;
}

function assertVersion(artifact, version) {
  if (!/^v\d+$/.test(version)) fail("invalid version");
  for (const file of ["index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest", "release-contract.json"]) safeFile(artifact, file);
  const html = fs.readFileSync(safeFile(artifact, "index.html"), "utf8");
  const appVersion = html.match(/app\.js\?v=(\d+)/)?.[1];
  const styleVersion = html.match(/styles\.css\?v=(\d+)/)?.[1];
  if (`v${appVersion}` !== version || appVersion !== styleVersion
    || readJson(safeFile(artifact, "release-contract.json")).appVersion !== version) fail("artifact version mismatch");
}

function snapshot({ root, artifact, version }) {
  root = fs.realpathSync(root);
  artifact = fs.realpathSync(artifact);
  const commit = cleanHead(root);
  assertVersion(artifact, version);
  const sourceManifest = manifest(root, git(root, "ls-files", "-z").split("\0").filter(Boolean));
  const artifactManifest = manifest(artifact, artifactPaths(artifact));
  if (!sourceManifest.length || !artifactManifest.length || cleanHead(root) !== commit) fail("source changed during validation");
  return { commit, version, sourceManifest, artifactManifest,
    sourceManifestSha256: manifestHash(sourceManifest), artifactManifestSha256: manifestHash(artifactManifest) };
}

export function fingerprintLocalRelease(options) {
  const { commit, version, sourceManifestSha256, artifactManifestSha256 } = snapshot(options);
  return { commit, version, sourceManifestSha256, artifactManifestSha256 };
}

function validateManifest(rows, label) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100000) fail(`invalid ${label}`);
  let previous = "";
  for (const row of rows) {
    exactKeys(row, ["path", "size", "sha256"], label);
    relativePath(row.path);
    if (row.path <= previous || !Number.isSafeInteger(row.size) || row.size < 0 || !SHA.test(row.sha256)) fail(`invalid ${label} entry`);
    previous = row.path;
  }
}

function validateChecks(checks, directory, withHashes) {
  if (!Array.isArray(checks) || checks.length !== CHECK_IDS.length) fail("all seven required checks are mandatory");
  const byId = new Map();
  const logs = new Set();
  for (const check of checks) {
    if (!CHECK_IDS.includes(check?.id) || byId.has(check.id)) fail("unknown or duplicate check");
    const keys = ["id", "log", "exitCode"];
    if (TEST_CHECKS.has(check.id)) keys.push("tests", "passed", "failed", "skipped");
    if (check.id === "linuxApplication") keys.push("platform");
    if (withHashes) keys.push("logSha256");
    exactKeys(check, keys, `check ${check.id}`);
    if (check.exitCode !== 0) fail(`failed check: ${check.id}`);
    if (TEST_CHECKS.has(check.id)) {
      if (!Number.isSafeInteger(check.tests) || check.tests < 1 || check.passed !== check.tests
        || check.failed !== 0 || check.skipped !== 0) fail(`failed or skipped tests: ${check.id}`);
    }
    if (check.id === "linuxApplication" && (check.platform !== "linux" || check.tests !== 5)) fail("five real Linux filesystem tests are required");
    relativePath(check.log);
    if (logs.has(check.log)) fail("each check requires its own log");
    logs.add(check.log);
    const log = safeFile(directory, check.log);
    const size = fs.statSync(log).size;
    if (!size || size > 128 * 1024 * 1024) fail(`missing or oversized log: ${check.id}`);
    const bytes = fs.readFileSync(log);
    const logSha256 = hash(bytes);
    if (withHashes && (!SHA.test(check.logSha256) || logSha256 !== check.logSha256)) fail(`log hash mismatch: ${check.id}`);
    if (check.id === "linuxApplication") {
      const text = bytes.toString("utf8");
      for (const [label, expected] of [["tests", 5], ["pass", 5], ["fail", 0], ["skipped", 0]]) {
        const values = [...text.matchAll(new RegExp(`^# ${label} (\\d+)\\s*$`, "gm"))];
        if (values.length !== 1 || Number(values[0][1]) !== expected) fail("Linux TAP totals do not prove five passing, unskipped tests");
      }
    }
    byId.set(check.id, { ...check, logSha256 });
  }
  return CHECK_IDS.map(id => byId.get(id));
}

function assertFingerprint(value, current, expectedCommit = current.commit) {
  if (value.commit !== expectedCommit || current.commit !== expectedCommit || value.version !== current.version
    || value.sourceManifestSha256 !== current.sourceManifestSha256
    || value.artifactManifestSha256 !== current.artifactManifestSha256) fail("commit, version, source or artifact fingerprint mismatch");
}

// This is explicit operator evidence, not a GitHub attestation or a test runner.
// Hashes bind the recorded local checks to the exact source and build bytes.
export function createLocalReleaseReport({ checksPath, reportPath, ...options }) {
  const current = snapshot(options);
  const input = readJson(checksPath);
  exactKeys(input, ["commit", "version", "sourceManifestSha256", "artifactManifestSha256", "checks"], "check input");
  assertFingerprint(input, current);
  const directory = fs.realpathSync(path.dirname(reportPath));
  if (directory !== fs.realpathSync(path.dirname(checksPath))) fail("checks and report must share their evidence directory");
  const checks = validateChecks(input.checks, directory, false);
  assertFingerprint(current, snapshot(options));
  const report = { schemaVersion: 1, kind: "experiment-local-validation", ...current, checks };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}

export function verifyLocalReleaseReport({ reportPath, commit, ...options }) {
  if (!/^[0-9a-f]{40}$/.test(commit)) fail("an exact expected commit is required");
  const report = readJson(reportPath);
  exactKeys(report, ["schemaVersion", "kind", "commit", "version", "sourceManifestSha256", "artifactManifestSha256", "sourceManifest", "artifactManifest", "checks"], "report");
  if (report.schemaVersion !== 1 || report.kind !== "experiment-local-validation") fail("unsupported report");
  validateManifest(report.sourceManifest, "source manifest");
  validateManifest(report.artifactManifest, "artifact manifest");
  const current = snapshot(options);
  assertFingerprint(report, current, commit);
  if (!same(report.sourceManifest, current.sourceManifest) || !same(report.artifactManifest, current.artifactManifest)) fail("source or artifact manifest mismatch");
  validateChecks(report.checks, fs.realpathSync(path.dirname(reportPath)), true);
  assertFingerprint(current, snapshot(options), commit);
  return { validation: "local", commit, version: current.version, checks: CHECK_IDS.length,
    sourceManifestSha256: current.sourceManifestSha256, artifactManifestSha256: current.artifactManifestSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index];
      if (!/^--(root|artifact|version|commit|checks|report)$/.test(key) || !args[index + 1]
        || Object.hasOwn(options, key.slice(2))) fail("invalid CLI arguments");
      options[key.slice(2)] = args[index + 1];
    }
    const common = { root: options.root || process.cwd(), artifact: options.artifact, version: options.version };
    let result;
    if (mode === "fingerprint") result = fingerprintLocalRelease(common);
    else if (mode === "create") {
      const report = createLocalReleaseReport({ ...common, checksPath: options.checks, reportPath: options.report });
      result = { report: path.resolve(options.report), commit: report.commit, version: report.version,
        sourceFiles: report.sourceManifest.length, artifactFiles: report.artifactManifest.length, checks: report.checks.length };
    }
    else if (mode === "verify") result = verifyLocalReleaseReport({ ...common, commit: options.commit, reportPath: options.report });
    else fail("expected fingerprint, create or verify");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
