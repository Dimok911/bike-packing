import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createLocalReleaseReport, fingerprintLocalRelease, verifyLocalReleaseReport } from "../../scripts/verify-local-release.mjs";

function fixture(t) {
  const temporary = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporary, "local-release-validation-"));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), temporary);
    assert.ok(path.basename(resolved).startsWith("local-release-validation-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const write = (relative, bytes) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  git("init", "--quiet");
  git("config", "core.autocrlf", "false");
  write(".gitignore", "/dist/\n/evidence/\n");
  write("app.js", "export const release = 1611;\n");
  write("package.json", '{"type":"module"}\n');
  git("add", ".");
  const commit = () => git("-c", "user.name=Release validation test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture");
  commit();
  write("dist/index.html", '<script src="app.js?v=1611"></script><link href="styles.css?v=1611">');
  for (const file of ["app.js", "styles.css", "sw.js", "manifest.webmanifest"]) write(`dist/${file}`, file);
  write("dist/release-contract.json", '{"appVersion":"v1611"}');
  write("dist/assets/photo.svg", "unchanged photo bytes");
  const options = { root, artifact: path.join(root, "dist"), version: "v1611" };
  const fingerprint = fingerprintLocalRelease(options);
  const checks = ["source", "critical", "transport", "browser", "build", "liveApi", "linuxApplication"].map(id => {
    const check = { id, log: `${id}.txt`, exitCode: 0 };
    if (["critical", "transport", "browser", "linuxApplication"].includes(id)) Object.assign(check, { tests: 5, passed: 5, failed: 0, skipped: 0 });
    if (id === "linuxApplication") check.platform = "linux";
    write(`evidence/${check.log}`, id === "linuxApplication"
      ? "TAP version 13\n# tests 5\n# pass 5\n# fail 0\n# skipped 0\n"
      : `${id} completed successfully\n`);
    return check;
  });
  const checksPath = path.join(root, "evidence/checks.json"), reportPath = path.join(root, "evidence/report.json");
  const input = { ...fingerprint, checks };
  const saveInput = () => fs.writeFileSync(checksPath, JSON.stringify(input));
  saveInput();
  const create = () => createLocalReleaseReport({ ...options, checksPath, reportPath });
  const verify = () => verifyLocalReleaseReport({ ...options, commit: fingerprint.commit, reportPath });
  const rewriteReport = change => {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    change(report);
    fs.writeFileSync(reportPath, JSON.stringify(report));
  };
  return { root, write, git, commit, options, fingerprint, input, saveInput, create, verify, rewriteReport, reportPath };
}

test("local validation binds a clean exact commit, every tracked source, artifact and seven logs", t => {
  const f = fixture(t), report = f.create(), verified = f.verify();
  assert.equal(verified.validation, "local");
  assert.equal(verified.commit, f.fingerprint.commit);
  assert.equal(verified.checks, 7);
  assert.deepEqual(report.sourceManifest.map(row => row.path), [".gitignore", "app.js", "package.json"]);
  assert.equal(report.artifactManifest.length, 7);
  assert.ok(report.checks.every(check => /^[0-9a-f]{64}$/.test(check.logSha256)));
  assert.throws(f.create, /EEXIST/, "a recorded release is not silently overwritten");
});

for (const staged of [false, true]) {
  test(`local validation rejects changed tracked source (staged=${staged})`, t => {
    const f = fixture(t); f.create();
    f.write("app.js", "unverified change\n");
    if (staged) f.git("add", "app.js");
    assert.throws(f.verify, /source tree is not clean/);
  });
}

test("local validation rejects another clean HEAD and nonignored new source", t => {
  const f = fixture(t); f.create();
  f.write("new-source.js", "new source\n");
  assert.throws(f.verify, /source tree is not clean/);
  f.git("add", "new-source.js"); f.commit();
  assert.throws(f.verify, /fingerprint mismatch/);
});

for (const mutation of ["changed", "extra", "missing"]) {
  test(`local validation rejects ${mutation} artifact bytes or paths`, t => {
    const f = fixture(t); f.create();
    if (mutation === "changed") f.write("dist/app.js", "stale build");
    if (mutation === "extra") f.write("dist/extra.js", "unverified build file");
    if (mutation === "missing") fs.unlinkSync(path.join(f.root, "dist/assets/photo.svg"));
    assert.throws(f.verify, /fingerprint mismatch/);
  });
}

test("report creation refuses checks recorded before an artifact or source change", t => {
  const f = fixture(t);
  f.write("dist/app.js", "rebuild differs");
  assert.throws(f.create, /fingerprint mismatch/);
});

test("local validation rejects the wrong application version", t => {
  const f = fixture(t); f.create();
  f.write("dist/release-contract.json", '{"appVersion":"v1610"}');
  assert.throws(f.verify, /artifact version mismatch/);
});

test("local validation rejects failed, absent and duplicate required checks", t => {
  const f = fixture(t);
  f.input.checks[0].exitCode = 1; f.saveInput();
  assert.throws(f.create, /failed check/);
  f.input.checks[0].exitCode = 0;
  const removed = f.input.checks.pop(); f.saveInput();
  assert.throws(f.create, /seven required/);
  f.input.checks.push(f.input.checks[0]); f.saveInput();
  assert.throws(f.create, /duplicate check/);
  f.input.checks[f.input.checks.length - 1] = removed;
  f.input.checks.find(check => check.id === "browser").skipped = 1; f.saveInput();
  assert.throws(f.create, /failed or skipped tests/);
});

test("local validation rejects changed logs and report manifest tampering", t => {
  const f = fixture(t); f.create();
  f.write("evidence/source.txt", "a different check\n");
  assert.throws(f.verify, /log hash mismatch/);
  f.write("evidence/source.txt", "source completed successfully\n");
  f.rewriteReport(report => report.sourceManifest[0].sha256 = "0".repeat(64));
  assert.throws(f.verify, /manifest mismatch/);
});

for (const location of ["log", "source", "artifact"]) {
  test(`local validation rejects traversal in ${location} paths`, t => {
    const f = fixture(t); f.create();
    f.rewriteReport(report => {
      if (location === "log") report.checks[0].log = "../package.json";
      else report[`${location}Manifest`][0].path = "../outside";
    });
    assert.throws(f.verify, /unsafe relative path/);
  });
}

test("Linux proof rejects Windows, skipped tests and contradictory TAP totals", t => {
  const f = fixture(t), check = f.input.checks.find(check => check.id === "linuxApplication");
  check.platform = "win32"; f.saveInput();
  assert.throws(f.create, /five real Linux/);
  check.platform = "linux"; check.skipped = 5; check.passed = 0; f.saveInput();
  assert.throws(f.create, /failed or skipped tests/);
  check.skipped = 0; check.passed = 5; f.saveInput();
  f.write("evidence/linuxApplication.txt", "# tests 5\n# pass 0\n# fail 0\n# skipped 5\n");
  assert.throws(f.create, /Linux TAP totals/);
});

test("deploy keeps the default exact-SHA workflow gate and validates local bytes before remote access and packing", () => {
  const source = fs.readFileSync(new URL("../../scripts/deploy-experiment-vps.ps1", import.meta.url), "utf8");
  assert.match(source, /Local validation is supported only for application-only publication/);
  assert.match(source, /if \(\$ApplicationOnly -and \[string\]::IsNullOrWhiteSpace\(\$LocalValidationReport\)\) \{\s*\$workflowJson = & gh run list/);
  assert.match(source, /\$_.headSha -eq \$ExpectedCommit -and \$_.conclusion -eq 'success' -and \$_.status -eq 'completed'/);
  const firstCheck = source.indexOf("    Assert-LocalReleaseValidation");
  assert.ok(firstCheck > 0 && firstCheck < source.indexOf("$apiContractVerification = Assert-ExperimentApiContract"));
  const secondCheck = source.indexOf("{ Assert-LocalReleaseValidation }", firstCheck);
  assert.ok(secondCheck > firstCheck && secondCheck < source.indexOf('Invoke-NativeChecked $tarPath @("-cf"'));
});
