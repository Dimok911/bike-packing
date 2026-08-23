import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("production FTP deployment keeps the account root separate from the public directory", () => {
  const script = readProjectFile("scripts/deploy-production-ftp.ps1");
  const docs = readProjectFile("docs/production-deployment.md");

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

  assert.match(docs, /`remotePath: "\/"` means the FTP account root/);
  assert.match(docs, /`\/www\/vniipo-help\.ru\/bike-packing\/`/);
  assert.match(docs, /scripts\/deploy-production-ftp\.ps1 -ExpectedVersion vNNN/);
  assert.match(docs, /explicit FTPS/i);
  assert.match(docs, /pinned SPKI public key/i);
  assert.match(docs, /retries transient upload and download failures/i);
});
