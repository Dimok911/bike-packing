/** Read-only FTPS recovery drill; downloads and local copies only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sha256, verifyBytes, buildPlan } from './production-retention-plan.mjs';

const [directory, configPath] = process.argv.slice(2);
if (!directory || !configPath) throw new Error('Usage: node scripts/production-retention-verify.mjs PLAN_DIRECTORY IGNORED_SFTP_CONFIG');
const root = path.resolve(directory);
const planBytes = await fs.readFile(path.join(root, 'plan.json'));
const plan = JSON.parse(planBytes);
const inventoryBytes = await fs.readFile(plan.inventory.source);
verifyBytes(inventoryBytes, plan.inventory.sha256);
const releases = JSON.parse(await fs.readFile(path.join(root, 'release-evidence.json'), 'utf8'));
const rebuilt = buildPlan(JSON.parse(inventoryBytes.toString('utf8').replace(/^\uFEFF/, '')), releases);
if (JSON.stringify(rebuilt.downloads) !== JSON.stringify(plan.downloads) || JSON.stringify(rebuilt.retainedSnapshots) !== JSON.stringify(plan.retainedSnapshots)) throw new Error('Plan/evidence mismatch');
const settings = JSON.parse((await fs.readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''));
if (!['vniipo-help.ru','88.212.206.188'].includes(settings.host) || settings.remotePath !== '/' || Number(settings.port) !== 21 || settings.protocol !== 'ftp' || !settings.username || !settings.password) throw new Error('Unexpected FTPS configuration');
const q = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
async function read(remote, https = false, listing = false) {
  if (!/^bike-packing(?:\/|[-.])/.test(remote) || /[\\\r\n]/.test(remote) || remote.split('/').includes('..')) throw new Error('Path outside Production');
  const url = (https ? 'https://vniipo-help.ru/' : 'ftp://vniipo-help.ru:21/www/vniipo-help.ru/') + remote.split('/').map(encodeURIComponent).join('/');
  const lines = ['silent', 'show-error', 'fail', 'connect-timeout = 15', 'max-time = 120', 'url = ' + q(url)];
  if (https) lines.push('header = "Cache-Control: no-cache"');
  else lines.push('ssl-reqd','ftp-pasv','insecure','pinnedpubkey = "sha256//+gOwS0YQ8/CGtOD9zgyFzgYGLtl38K9YhxYssMpjz+Y="','resolve = "vniipo-help.ru:21:88.212.206.188"','user = ' + q(settings.username + ':' + settings.password));
  if (listing) lines.push('request = "LIST -R"');
  return await new Promise((resolve, reject) => {
    const child = spawn('C:/Windows/System32/curl.exe', ['--config', '-'], {stdio:['pipe','pipe','pipe'], windowsHide:true});
    const chunks = [];
    child.stdout.on('data', c => chunks.push(c));
    // Do not expose credential-bearing curl diagnostics.
    child.stderr.resume();
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Read-only transfer failed (${code}): ${remote}`)));
    child.stdin.end(lines.join('\n') + '\n', 'utf8');
  });
}
const results = [];
for (const source of plan.downloads) {
  const bytes = await read(source.remotePath);
  verifyBytes(bytes, source.sha256);
  if (bytes.length !== source.bytes) throw new Error('Inventory size changed');
  const target = path.join(root, 'download', source.remotePath);
  await fs.mkdir(path.dirname(target), {recursive:true});
  await fs.writeFile(target, bytes);
  verifyBytes(await fs.readFile(target), source.sha256);
  results.push({...source, verified: true});
}
const snapshots = [];
for (const snapshot of plan.retainedSnapshots) {
  for (const file of snapshot.files) {
    const target = path.join(root, 'restore-drill', snapshot.version, file.path);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.copyFile(path.join(root, 'download', file.remotePath), target);
    verifyBytes(await fs.readFile(target), file.sha256);
  }
  const html = await fs.readFile(path.join(root, 'restore-drill', snapshot.version, 'index.html'), 'utf8');
  const contract = JSON.parse(await fs.readFile(path.join(root, 'restore-drill', snapshot.version, 'release-contract.json'), 'utf8'));
  if (!html.includes('app.js?v=' + snapshot.version.slice(1)) || contract.appVersion !== snapshot.version) throw new Error('Recovered version mismatch');
  snapshots.push({version: snapshot.version, files: snapshot.files.length, sha256: 'verified', recovery: 'local isolated copy, not activated'});
}
// Confirm public static files and detect a publication during the drill.
for (const source of plan.downloads.filter(s => s.remotePath.startsWith('bike-packing/'))) {
  verifyBytes(await read(source.remotePath), source.sha256);
  if (!source.remotePath.endsWith('.php')) verifyBytes(await read(source.remotePath, true), source.sha256);
}
const result = {verifiedAt: new Date().toISOString(), planSha256: sha256(planBytes), liveVersion: plan.retention.versions[0], liveFtpsAndHttps: 'verified (PHP source: FTPS only)', downloads: results, restoredSnapshots: snapshots, serverMutations: 0, resticCoverage: 'unconfirmed', candidateFileRecovery: 'not yet tested; retained versions only'};
await fs.writeFile(path.join(root, 'recovery-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({...result, downloads: `${results.length} individually hash-verified files`}, null, 2));
