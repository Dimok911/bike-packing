import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Experiment VPS deployment reuses unchanged files without weakening release gates", () => {
  const script = readProjectFile("scripts/deploy-experiment-vps.ps1");
  const remoteScript = readProjectFile("scripts/deploy-experiment-vps-remote.sh");
  const docs = readProjectFile("docs/experimental-deployment.md");

  assert.match(script, /\$server\s*=\s*"root@90\.156\.128\.115"/);
  assert.match(script, /\$livePath\s*=\s*"\/var\/www\/experiment"/);
  assert.match(script, /\$catalogPrefix\s*=\s*"assets\/manufacturer-catalog\/"/);
  assert.match(remoteScript, /catalog=\$shared_parent\/manufacturer-catalog/);
  assert.match(remoteScript, /cp -al "\$catalog\/\." "\$catalog_stage\/"/);
  assert.match(remoteScript, /unlink_changed "\$catalog_stage"[\s\S]*tar -xf "\$upload\/catalog\.tar"/);
  assert.match(remoteScript, /sha256sum -c --quiet/);
  assert.match(remoteScript, /cmp -s "\$paths" "\$actual_paths"/);
  assert.match(remoteScript, /verify_tree "\$stage"[^\n]+ no/);
  assert.match(remoteScript, /remove_extra_files "\$catalog_stage"/);
  assert.match(remoteScript, /ln -s "\$catalog" "\$stage\/assets\/manufacturer-catalog"/);
  assert.match(remoteScript, /mv "\$live" "\$backup"/);
  assert.match(remoteScript, /mv "\$stage" "\$live"/);
  assert.match(remoteScript, /rm -rf -- "\$catalog_backup" "\$migration_old" "\$upload"/);
  assert.match(remoteScript, /abort\)[\s\S]*rm -rf -- "\$stage" "\$catalog_stage"/);
  assert.match(script, /Experiment deployment failed; the previous release was restored/);
  assert.match(script, /\$catalogPrefix\*/);
  assert.doesNotMatch(script, /88\.212\.206\.188|FTPS|ftp:\/\//i);

  assert.match(docs, /manifest of actual SHA-256/i);
  assert.match(docs, /persistent shared directory/i);
  assert.match(docs, /hard links/i);
  assert.match(docs, /only new or changed\s+files/i);
  assert.match(docs, /full file-count, byte-count,\s+and SHA-256 verification/i);
});
