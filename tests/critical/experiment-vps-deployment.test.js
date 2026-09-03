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
  const workflow = readProjectFile(".github/workflows/frontend-quality.yml");
  const liveContractCheck = readProjectFile("scripts/verify-live-api-contract.mjs");

  assert.match(script, /\$server\s*=\s*"root@90\.156\.128\.115"/);
  assert.match(script, /\$livePath\s*=\s*"\/var\/www\/experiment"/);
  assert.match(script, /\$sharedPrefix\s*=\s*"assets\/"/);
  assert.match(script, /\$Lines -join "`n"/);
  assert.match(script, /WriteAllText/);
  assert.doesNotMatch(script, /WriteAllLines/);
  assert.match(script, /Substring\(0, \[Math\]::Min\(16, \$hex\.Length\)\)/);
  assert.match(remoteScript, /DEPLOY_FAILED mode=%s line=%s/);
  assert.match(remoteScript, /shared_assets=\$shared_parent\/assets/);
  assert.match(remoteScript, /cp -al "\$shared_assets\/\." "\$assets_stage\/"/);
  assert.match(remoteScript, /unlink_changed "\$assets_stage"[\s\S]*tar -xf "\$upload\/assets\.tar"/);
  assert.match(remoteScript, /sha256sum -c --quiet/);
  assert.match(remoteScript, /cmp -s "\$paths" "\$actual_paths"/);
  assert.match(remoteScript, /verify_tree "\$stage"[^\n]+ no/);
  assert.match(remoteScript, /remove_extra_files "\$assets_stage"/);
  assert.match(remoteScript, /ln -s "\$shared_assets" "\$stage\/assets"/);
  assert.match(remoteScript, /mv "\$live" "\$backup"/);
  assert.match(remoteScript, /mv "\$stage" "\$live"/);
  assert.match(remoteScript, /rm -rf -- "\$assets_backup" "\$migration_old" "\$upload"/);
  assert.match(remoteScript, /abort\)[\s\S]*rm -rf -- "\$stage" "\$assets_stage"/);
  assert.match(script, /Experiment deployment failed; the previous release was restored/);
  assert.match(script, /\$sharedPrefix\*/);
  assert.match(script, /\$ApiCapabilitiesUrl\s*=\s*"https:\/\/experiment\.vniipo-help\.ru\/letters-vniipo\/api\/bike-packing\/capabilities"/);
  assert.match(script, /function Assert-ExperimentApiContract/);
  assert.match(script, /requiredApiCompatibilityVersion/);
  assert.match(script, /requiredApiCapabilities/);
  assert.match(script, /release-contract\.json/);
  assert.match(script, /Experiment was not changed/);
  const preflightCall = script.indexOf("$apiContractVerification = Assert-ExperimentApiContract");
  const firstRemoteRead = script.indexOf("$remoteLines = @(& $sshPath");
  assert.ok(preflightCall > 0 && firstRemoteRead > preflightCall, "API preflight must finish before the first remote read/upload");
  assert.match(liveContractCheck, /EXPERIMENT_API_BASE/);
  assert.match(liveContractCheck, /REQUIRED_ADMIN_API_VERSION/);
  assert.match(liveContractCheck, /REQUIRED_ADMIN_API_CAPABILITIES/);
  assert.match(liveContractCheck, /\/bike-packing\/capabilities/);
  assert.match(workflow, /name: Live Experiment API contract[\s\S]*?npm run check:live-api-contract/);
  assert.doesNotMatch(script, /88\.212\.206\.188|FTPS|ftp:\/\//i);

  assert.match(docs, /manifest of actual SHA-256/i);
  assert.match(docs, /persistent shared directory/i);
  assert.match(docs, /hard links/i);
  assert.match(docs, /only new or changed\s+files/i);
  assert.match(docs, /full file-count, byte-count,\s+and SHA-256 verification/i);
});
