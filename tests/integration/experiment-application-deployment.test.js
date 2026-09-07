import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, statSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";

// Exercise the actual remote entry point on the same GNU/Linux platform as the
// VPS. CI must run these tests before this commit may be published.
const options = { skip: process.platform !== "linux" ? "Requires the VPS GNU/Linux symlink and inode semantics; mandatory in Linux CI" : false };
const hash = value => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "bike-app-deploy-")), parent = path.join(root, "www");
  t.after(() => { assert.ok(root.startsWith(path.join(tmpdir(), "bike-app-deploy-"))); rmSync(root, { recursive: true, force: true }); });
  const release = "v1606-0123456789-20260908T000000Z";
  const live = path.join(parent, "experiment"), assets = path.join(parent, "experiment-shared/assets");
  const upload = path.join(parent, `.experiment-upload-${release}`), source = path.join(root, "source");
  for (const directory of [live, assets, upload, source]) mkdirSync(directory, { recursive: true });
  const write = (base, file, value) => { mkdirSync(path.dirname(path.join(base, file)), { recursive: true }); writeFileSync(path.join(base, file), value); };
  const old = { "index.html": "old index", "app.js": "old application", "chunks/old.js": "old chunk" };
  const next = { "index.html": "new index", "app.js": "new application", "chunks/new.js": "new chunk" };
  for (const [file, value] of Object.entries(old)) write(live, file, value);
  for (const [file, value] of Object.entries(next)) write(source, file, value);
  write(assets, "existing-photo.jpg", Buffer.from([0, 17, 255, 30]));
  symlinkSync(assets, path.join(live, "assets"));
  const manifest = (name, rows) => write(upload, name, Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)).map(([file, value]) => `${hash(value)}  ${file}\n`).join(""));
  const paths = (name, rows) => write(upload, name, Object.keys(rows).sort().join("\n") + "\n");
  manifest("frontend.sha256", next); paths("frontend.paths", next);
  manifest("assets.sha256", { "existing-photo.jpg": readFileSync(path.join(assets, "existing-photo.jpg")) });
  const baseline = { ...old, "assets/existing-photo.jpg": readFileSync(path.join(assets, "existing-photo.jpg")) };
  manifest("baseline.sha256", baseline); paths("baseline.paths", baseline);
  execFileSync("tar", ["-cf", path.join(upload, "frontend.tar"), "-C", source, ...Object.keys(next)]);
  const script = path.join(root, "remote.sh");
  const original = readFileSync(new URL("../../scripts/deploy-experiment-application-remote.sh", import.meta.url), "utf8");
  assert.equal(original.split("parent=/var/www").length, 2);
  // The production script keeps its fixed root; only this disposable test copy
  // substitutes a temporary filesystem, without any server or network access.
  writeFileSync(script, original.replace("parent=/var/www", `parent='${parent}'`));
  const run = (mode, env = {}) => spawnSync("bash", [script, mode, release, String(Object.keys(next).length), String(Object.values(next).reduce((n, value) => n + Buffer.byteLength(value), 0)), "1", "4"],
    { encoding: "utf8", env: { ...process.env, ...env } });
  const ok = result => assert.equal(result.status, 0, result.stdout + result.stderr);
  const photoIdentity = () => [assets, path.join(assets, "existing-photo.jpg")].map(file => {
    const value = statSync(file); return [value.dev, value.ino, value.mtimeMs, value.ctimeMs, value.nlink, value.size];
  });
  const identity = photoIdentity();
  const untouched = () => { assert.deepEqual(photoIdentity(), identity); assert.deepEqual(readFileSync(path.join(assets, "existing-photo.jpg")), Buffer.from([0, 17, 255, 30])); };
  const restored = () => { for (const [file, value] of Object.entries(old)) assert.equal(readFileSync(path.join(live, file), "utf8"), value); untouched(); };
  return { root, parent, live, assets, upload, source, release, next, run, ok, untouched, restored, manifest, paths, write };
}

test("application activation and explicit rollback leave photo bytes and directory/file inodes untouched", options, t => {
  const f = fixture(t); f.ok(f.run("stage")); f.untouched(); f.ok(f.run("activate"));
  assert.equal(readFileSync(path.join(f.live, "app.js"), "utf8"), "new application"); f.untouched();
  f.ok(f.run("rollback")); f.restored(); f.ok(f.run("cleanup-rollback")); f.untouched();
});

test("lost activation response is recoverable through abort without touching shared photos", options, t => {
  const f = fixture(t); f.ok(f.run("stage")); f.ok(f.run("activate"));
  f.ok(f.run("abort")); f.restored(); assert.equal(existsSync(f.upload), false);
});

test("a concurrent application change after staging prevents activation and keeps that version", options, t => {
  const f = fixture(t); f.ok(f.run("stage")); f.write(f.live, "app.js", "another operator's application");
  assert.notEqual(f.run("activate").status, 0);
  assert.equal(readFileSync(path.join(f.live, "app.js"), "utf8"), "another operator's application");
  assert.equal(existsSync(path.join(f.parent, `experiment-backup-before-${f.release}`)), false); f.untouched();
});

test("a wrong asset hash or an image in the application archive stops before creating a stage", options, t => {
  const f = fixture(t); f.manifest("assets.sha256", { "existing-photo.jpg": "different" });
  assert.notEqual(f.run("stage").status, 0); f.restored();
  assert.equal(existsSync(path.join(f.parent, `experiment-stage-${f.release}`)), false);
  f.manifest("assets.sha256", { "existing-photo.jpg": readFileSync(path.join(f.assets, "existing-photo.jpg")) });
  const bad = { ...f.next, "assets/new-photo.jpg": "must never publish" };
  f.paths("frontend.paths", bad); f.write(f.source, "assets/new-photo.jpg", bad["assets/new-photo.jpg"]);
  execFileSync("tar", ["-cf", path.join(f.upload, "frontend.tar"), "-C", f.source, ...Object.keys(bad)]);
  assert.notEqual(f.run("stage").status, 0); f.restored();
  assert.equal(existsSync(path.join(f.assets, "new-photo.jpg")), false);
});

test("post-rename verification failure automatically restores the previous application", options, t => {
  const f = fixture(t); f.ok(f.run("stage"));
  const bin = path.join(f.root, "bin"); mkdirSync(bin);
  const realMv = execFileSync("which", ["mv"], { encoding: "utf8" }).trim();
  // Inject corruption immediately after the real staging rename. The remote
  // verification must fail even inside an `if !` shell function call.
  writeFileSync(path.join(bin, "mv"), `#!/bin/bash\n'${realMv}' "$@" || exit $?\nif [[ "${"${2:-}"}" == '${f.parent}/experiment-stage-${f.release}' ]]; then printf corrupt > '${f.live}/app.js'; fi\n`, { mode: 0o755 });
  assert.equal(f.run("activate", { PATH: `${bin}:${process.env.PATH}` }).status, 52);
  f.restored();
});
