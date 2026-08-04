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

  assert.match(docs, /`remotePath: "\/"` means the FTP account root/);
  assert.match(docs, /`\/www\/vniipo-help\.ru\/bike-packing\/`/);
  assert.match(docs, /scripts\/deploy-production-ftp\.ps1 -ExpectedVersion vNNN/);
});
