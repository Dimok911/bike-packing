import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("production FTP deployment keeps the account root separate from the public directory", () => {
  const script = readProjectFile("scripts/deploy-production-ftp.ps1");
  const docs = readProjectFile("docs/production-deployment.md");
  const workflow = readProjectFile(".github/workflows/frontend-quality.yml");
  const liveContractCheck = readProjectFile("scripts/verify-live-api-contract.mjs");

  assert.match(script, /\$productionRemotePath\s*=\s*"www\/vniipo-help\.ru\/bike-packing"/);
  assert.match(script, /remotePath\)\.Trim\(\)\s*-ne\s*"\/"/);
  assert.match(script, /Move-FtpDirectory \$productionRemotePath \$backupRemotePath/);
  assert.match(script, /Move-FtpDirectory \$stageRemotePath \$productionRemotePath/);
  assert.match(script, /--config -/);
  assert.match(script, /Curl-Line "user" \$credential/);
  assert.match(script, /\$OutputEncoding\s*=\s*\[System\.Text\.UTF8Encoding\]::new\(\$false\)/);
  assert.match(script, /\$ftpCanonicalHost\s*=\s*"vniipo-help\.ru"/);
  assert.match(script, /\$ftpFallbackIp\s*=\s*"88\.212\.206\.188"/);
  assert.match(script, /\$ftpPort\s*=\s*21/);
  assert.match(script, /\$ftpPinnedPublicKey\s*=\s*"sha256\/\/[A-Za-z0-9+/]+=*"/);
  assert.match(script, /"ssl-reqd"/);
  assert.match(script, /"ftp-pasv"/);
  assert.match(script, /Curl-Line "pinnedpubkey" \$ftpPinnedPublicKey/);
  assert.match(script, /Curl-Line "resolve" "\$\{ftpCanonicalHost\}:\$\{ftpPort\}:\$\{ftpFallbackIp\}"/);
  assert.match(script, /Invoke-CurlConfig -Ftps -Lines/);
  assert.match(script, /function Send-FtpFile[\s\S]*?Invoke-CurlConfig -Ftps -Attempts 5 -Lines/);
  assert.match(script, /function Receive-FtpFile[\s\S]*?Invoke-CurlConfig -Ftps -Attempts 5 -Lines/);
  assert.match(script, /\$productionApiCapabilitiesUrl\s*=\s*"https:\/\/api\.vniipo-help\.ru\/letters-vniipo\/api\/bike-packing\/capabilities"/);
  assert.match(script, /function Assert-ProductionApiContract/);
  assert.match(script, /requiredApiCompatibilityVersion/);
  assert.match(script, /requiredApiCapabilities/);
  assert.match(script, /Assert-ProductionApiContract[\s\S]*?foreach \(\$file in \$artifactFiles\)/);
  assert.match(script, /Production was not changed/);
  assert.match(script, /release-contract\.json/);
  assert.match(liveContractCheck, /REQUIRED_ADMIN_API_VERSION/);
  assert.match(liveContractCheck, /REQUIRED_ADMIN_API_CAPABILITIES/);
  assert.match(liveContractCheck, /\/bike-packing\/capabilities/);
  assert.match(workflow, /name: Live API contract[\s\S]*?npm run check:live-api-contract/);

  assert.match(docs, /`remotePath: "\/"` means the FTP account root/);
  assert.match(docs, /`\/www\/vniipo-help\.ru\/bike-packing\/`/);
  assert.match(docs, /scripts\/deploy-production-ftp\.ps1 -ExpectedVersion vNNN/);
  assert.match(docs, /explicit FTPS/i);
  assert.match(docs, /pinned SPKI public key/i);
  assert.match(docs, /retries transient upload and download failures/i);
  assert.match(docs, /live production API contract/i);
});


test("partial staging checks only transferred files and complete verification still checks styles", { skip: process.platform !== "win32" }, () => {
  const source = readProjectFile("scripts/deploy-production-ftp.ps1");
  const start = source.indexOf("function Assert-PublicBuild(");
  const end = source.indexOf("function Assert-ProductionApiContract", start);
  const directory = mkdtempSync(join(tmpdir(), "bike-partial-deploy-"));
  const harness = String.raw`
$ErrorActionPreference = "Stop"
$ArtifactRoot = $PSScriptRoot
$script:versionNumber = "1624"
$ExpectedVersion = "v1624"
$script:requests = [Collections.Generic.List[string]]::new()
$script:checks = 0
function Receive-HttpsFile($url, $path) {
  $name = [IO.Path]::GetFileName(([uri]$url).AbsolutePath)
  $script:requests.Add($name)
  if ($name -eq "index.html") { Set-Content -LiteralPath $path -Value 'app.js?v=1624 styles.css?v=1624' }
  if ($name -eq "sw.js") { Set-Content -LiteralPath $path -Value 'bike-packing-prototype-v1624' }
}
function Assert-FilesEqual($candidate, $received, $label) {
  $script:checks += 1
  if ($script:rejectStyles -and $label -eq "HTTPS/styles.css") { throw "Unchanged styles mismatch" }
}
` + source.slice(start, end) + String.raw`
Assert-PublicBuild "https://example.test/stage" $PSScriptRoot "test" -Files @("app.js", "index.html", "sw.js", "release-contract.json")
if ($script:requests.Count -ne 4 -or $script:requests.Contains("styles.css") -or $script:checks -ne 4) { throw "Partial payload verification failed" }
$script:requests.Clear()
Assert-PublicBuild "https://example.test/production" $PSScriptRoot "test"
if ($script:requests.Count -ne 5 -or -not $script:requests.Contains("styles.css")) { throw "Complete verification skipped unchanged file" }
$script:rejectStyles = $true
$rejected = $false
try { Assert-PublicBuild "https://example.test/production" $PSScriptRoot "test" -Files @("styles.css") } catch { $rejected = $_.Exception.Message -eq "Unchanged styles mismatch" }
if (-not $rejected) { throw "Hash mismatch was not rejected" }
Write-Output "partial, complete and unchanged mismatch checks passed"
`;
  try {
    const path = join(directory, "verify.ps1");
    writeFileSync(path, harness);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-File", path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /unchanged mismatch checks passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("publication stops at an active cleanup lock before reading credentials or contacting hosting", { skip: process.platform !== "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "bike-retention-lock-"));
  try {
    const configPath = join(directory, "sftp.json");
    // Deliberately invalid credentials: the lock must reject first.
    writeFileSync(configPath, "{}");
    writeFileSync(join(directory, "production-retention.lock.json"), "{}");
    const scriptPath = new URL("../../scripts/deploy-production-ftp.ps1", import.meta.url);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-File", decodeURIComponent(scriptPath.pathname).replace(/^\/(?=[A-Za-z]:)/, ""), "-ArtifactRoot", directory, "-ConfigPath", configPath], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Production retention cleanup is active/);
    assert.doesNotMatch(result.stdout + result.stderr, /Missing required FTP setting/);
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), "bike-retention-lock-")));
    rmSync(directory, { recursive: true, force: true });
  }
});
