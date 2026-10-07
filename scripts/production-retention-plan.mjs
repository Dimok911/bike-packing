/** Read-only retention planner. Deliberately has no deletion/apply mode. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const liveRoot = 'bike-packing';
const archiveRoot = /^bike-packing(?:[-.]backup(?:-before|-pre)?-v\d+[-A-Za-z0-9_.]*|[-.](?:stage|failed)-v\d+[-A-Za-z0-9_.]*|\.previous-v\d+[-A-Za-z0-9_.]*)$/;
const appFile = /^(?:app\.js|styles\.css|index\.html|index\.php|sw\.js|release-contract\.json|manifest\.webmanifest|assets\/(?:index-[A-Za-z0-9_-]+\.(?:js|css)|manifest-[A-Za-z0-9_-]+\.webmanifest))$/;
const hashPattern = /^[A-Fa-f0-9]{64}$/;
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
function safePath(value) {
  return typeof value === 'string' && !/[\\\x00-\x20%:]/.test(value) && !value.startsWith('/') && value.split('/').every(p => p && p !== '.' && p !== '..');
}
export function buildPlan(inventory, releases) {
  if (releases.length !== 5) throw new Error('Exactly five evidenced successful releases required');
  const uniqueVersions = new Set(releases.map(r => r.version));
  if (uniqueVersions.size !== 5) throw new Error('Duplicate release');
  for (const r of releases) {
    if (!/^v\d+$/.test(r.version) || !archiveRoot.test(r.backupRoot) || !r.verified) throw new Error('Invalid release evidence');
    if (new Set(r.files.map(f => f.path)).size !== r.files.length || !r.files.length) throw new Error('Duplicate/empty release manifest');
    for (const f of r.files) {
      if (!safePath(f.path) || !appFile.test(f.path) || !hashPattern.test(f.releaseHash) || !hashPattern.test(f.deployedHash) || f.changed !== (f.releaseHash !== f.deployedHash)) throw new Error('Invalid file manifest');
    }
  }
  const groups = new Map(), seen = new Set();
  let excludedFiles = 0;
  for (const f of inventory) {
    if (typeof f.path !== 'string') throw new Error('Invalid inventory path');
    const root = f.path.split('/')[0];
    if (/experiment/i.test(root) || (root !== liveRoot && !archiveRoot.test(root))) { excludedFiles++; continue; }
    if (!safePath(f.path) || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || seen.has(f.path)) throw new Error('Unsafe/duplicate inventory entry');
    seen.add(f.path);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(f);
  }
  const liveFiles = groups.get(liveRoot) || [];
  const expectedLive = releases[0].files.map(f => `${liveRoot}/${f.path}`).sort();
  if (JSON.stringify(liveFiles.map(f => f.path).sort()) !== JSON.stringify(expectedLive)) throw new Error('Live inventory differs from evidenced manifest');
  const inventoryByPath = new Map(inventory.map(f => [f.path, f]));
  const downloads = new Map();
  const snapshots = [];
  let sources = new Map(releases[0].files.map(f => [f.path, { remotePath: `${liveRoot}/${f.path}`, sha256: f.releaseHash }]));
  for (let i = 0; i < releases.length; i++) {
    const r = releases[i];
    if (sources.size !== r.files.length) throw new Error('Incomplete release chain');
    const files = r.files.map(f => {
      const source = sources.get(f.path);
      if (!source || source.sha256 !== f.releaseHash) throw new Error('Release chain hash mismatch');
      const item = inventoryByPath.get(source.remotePath);
      if (!item) throw new Error('Required recovery source absent from inventory');
      const result = { path: f.path, ...source, bytes: item.bytes };
      const previous = downloads.get(source.remotePath);
      if (previous && previous.sha256 !== result.sha256) throw new Error('Inconsistent source hashes');
      downloads.set(source.remotePath, { remotePath: source.remotePath, sha256: result.sha256, bytes: item.bytes });
      return result;
    });
    snapshots.push({ version: r.version, evidence: r.evidence, files });
    if (i < releases.length - 1) {
      sources = new Map(r.files.map(f => [f.path, { remotePath: f.changed ? `${r.backupRoot}/${f.path}` : sources.get(f.path).remotePath, sha256: f.deployedHash }]));
    }
  }
  const dependencies = new Set([...downloads.keys()].map(p => p.split('/')[0]));
  const roots = [...groups].map(([root, files]) => {
    const unknown = files.filter(f => !appFile.test(f.path.slice(root.length + 1))).map(f => f.path);
    const decision = root === liveRoot ? 'protect-live' : dependencies.has(root) ? 'protect-retained-release-dependency' : unknown.length ? 'protect-mixed-or-unknown-content' : 'candidate-blocked';
    return { remotePath: `/www/vniipo-help.ru/${root}/`, decision, bytes: files.reduce((s, f) => s + f.bytes, 0), files: files.map(f => ({ remotePath: `/www/vniipo-help.ru/${f.path}`, bytes: f.bytes })), unknownFiles: unknown };
  }).sort((a, b) => a.remotePath.localeCompare(b.remotePath));
  const totals = {};
  for (const r of roots) { const t = totals[r.decision] ||= { roots: 0, files: 0, bytes: 0 }; t.roots++; t.files += r.files.length; t.bytes += r.bytes; }
  return { schemaVersion: 1, mode: 'dry-run-only', retention: { count: 5, includesLive: true, versions: snapshots.map(s => s.version) }, deletionAuthorizedByThisPlan: false, deletionReadyFiles: 0, excludedFiles, totals, blockers: ['Inventory is a historical snapshot; refresh and compare each candidate immediately before any mutation, under a publication lock.', 'Check active staging and references from retained/public/shared resources; no absence-of-references claim has been established.', 'Back up every candidate file outside hosting, hash it and test restoration before removing it. Git source alone is insufficient; restic coverage is unconfirmed.', 'Photo/user-data/mixed directories remain protected; no recursive wildcard deletion.'], retainedSnapshots: snapshots, downloads: [...downloads.values()], roots };
}
export function verifyBytes(bytes, expected) { if (sha256(bytes) !== expected.toUpperCase()) throw new Error('Recovery SHA-256 mismatch'); }
export function loadReleases(project) {
  const evidenceRoot = path.join(project, 'ftp-upload');
  const releases = [];
  for (const name of fs.readdirSync(evidenceRoot)) {
    if (!/^v\d+$/.test(name)) continue;
    const logPath = path.join(evidenceRoot, name, 'deploy.log');
    const comparisonPath = path.join(evidenceRoot, name, 'production-comparison.json');
    if (!fs.existsSync(logPath) || !fs.existsSync(comparisonPath)) continue;
    let log;
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8').replace(/^\uFEFF/, '')); } catch { continue; }
    if (log.Version !== name || log.FtpSha256 !== 'verified' || log.ProductionHttps !== 'verified') continue;
    const match = /^\/www\/vniipo-help\.ru\/(bike-packing-backup-before-v\d+-(\d{8}T\d{6}Z))\/$/.exec(log.RemoteBackup);
    if (!match) continue;
    const files = JSON.parse(fs.readFileSync(comparisonPath, 'utf8').replace(/^\uFEFF/, ''));
    const uploaded = [...log.UploadedFiles].sort();
    if (JSON.stringify(uploaded) !== JSON.stringify(files.filter(f => f.changed).map(f => f.path).sort())) throw new Error(`Changed-file evidence mismatch: ${name}`);
    releases.push({ version: name, backupRoot: match[1], publishedAt: match[2], verified: true, files, evidence: { deployLog: `ftp-upload/${name}/deploy.log`, deployLogSha256: sha256(fs.readFileSync(logPath)), comparison: `ftp-upload/${name}/production-comparison.json`, comparisonSha256: sha256(fs.readFileSync(comparisonPath)) } });
  }
  return releases.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [inventoryPath, outputDirectory] = process.argv.slice(2);
  if (!inventoryPath || !outputDirectory) throw new Error('Usage: node scripts/production-retention-plan.mjs INVENTORY OUTPUT_DIRECTORY');
  const raw = fs.readFileSync(inventoryPath);
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const releases = loadReleases(project);
  const plan = buildPlan(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')), releases);
  plan.createdAt = new Date().toISOString();
  plan.inventory = { source: path.resolve(inventoryPath), sha256: sha256(raw) };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDirectory, 'release-evidence.json'), JSON.stringify(releases, null, 2) + '\n');
  console.log(JSON.stringify({ retained: plan.retention, totals: plan.totals, deletionReadyFiles: 0 }, null, 2));
}
