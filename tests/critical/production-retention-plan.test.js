import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, sha256, verifyBytes } from '../../scripts/production-retention-plan.mjs';
function fixture() {
  const hash = n => sha256(Buffer.from(String(n)));
  const releases = [5,4,3,2,1].map(n => ({version:`v${n}`, backupRoot:`bike-packing-backup-before-v${n}-20261003T10000${n}Z`, verified:true, evidence:{}, files:[{path:'app.js', releaseHash:hash(n), deployedHash:hash(n-1), changed:true},{path:'styles.css',releaseHash:hash(99),deployedHash:hash(99),changed:false}]}));
  const inventory = [{path:'bike-packing/app.js',bytes:1},{path:'bike-packing/styles.css',bytes:2},...releases.map(r=>({path:`${r.backupRoot}/app.js`,bytes:1}))];
  return {releases, inventory};
}
test('retains five complete versions including unchanged files and all delta dependencies', () => {
  const {inventory,releases}=fixture(); const p=buildPlan(inventory,releases);
  assert.equal(p.retainedSnapshots.length,5);
  assert.equal(p.totals['protect-retained-release-dependency'].roots,4);
  assert.equal(p.retainedSnapshots.at(-1).files[1].remotePath,'bike-packing/styles.css');
  assert.equal(p.deletionReadyFiles,0);
  assert.equal(p.deletionAuthorizedByThisPlan,false);
  assert.equal(p.totals['candidate-blocked'].roots,1);
});
test('protects whole mixed directories, including their app files', () => {
  const {inventory,releases}=fixture(); inventory.push({path:'bike-packing-stage-v10-old/app.js',bytes:12},{path:'bike-packing-stage-v10-old/photos/user.heic',bytes:100});
  const r=buildPlan(inventory,releases).roots.find(r=>r.remotePath.includes('stage-v10'));
  assert.equal(r.decision,'protect-mixed-or-unknown-content'); assert.equal(r.bytes,112);
});
test('excludes Experiment, VDOC, shared UI and similar names', () => {
  const {inventory,releases}=fixture();
  for(const root of ['bike-packing-experiment','bike-packing-experiment-backup-v1','bike-packing-backup-experiment-v1','bike-packing-backup-v1-experiment','_releases/vdoc','shared-ui','bike-packing2']) inventory.push({path:`${root}/app.js`,bytes:500});
  const p=buildPlan(inventory,releases); assert.equal(p.excludedFiles,7); assert.equal(p.roots.length,6);
});
test('rejects traversal, duplicates, unexpected live files and invalid sizes', () => {
  for (const extra of [{path:'bike-packing-backup-v0-old/../app.js',bytes:1},{path:'bike-packing/app.js',bytes:1},{path:'bike-packing/new.js',bytes:1},{path:'bike-packing-backup-v0-old/app.js',bytes:-1}]) {
    const {inventory,releases}=fixture(); inventory.push(extra); assert.throws(()=>buildPlan(inventory,releases));
  }
});
test('fails closed on missing backup dependency or inconsistent release hashes', () => {
  const a=fixture(); a.inventory=a.inventory.filter(f=>!f.path.includes('before-v4')); assert.throws(()=>buildPlan(a.inventory,a.releases));
  const b=fixture(); b.releases[2].files[0].releaseHash=sha256('wrong'); assert.throws(()=>buildPlan(b.inventory,b.releases));
});
test('requires exactly five successful unique releases', () => {
  const a=fixture(); assert.throws(()=>buildPlan(a.inventory,a.releases.slice(1)));
  a.releases[1].verified=false; assert.throws(()=>buildPlan(a.inventory,a.releases));
});
test('recovery verification rejects changed or corrupted bytes', () => {
  const expected=sha256('correct'); verifyBytes(Buffer.from('correct'),expected);
  assert.throws(()=>verifyBytes(Buffer.from('corrupt'),expected));
});

import { assertDeletionFile, assertUnchangedRoot } from '../../scripts/production-retention-guards.mjs';
test('delete guard rejects live, photos, staging, foreign roots and unreviewed names', () => {
  const accepted = {path:'bike-packing-backup-before-v4-old/app.js',bytes:2,sha256:sha256('ok')};
  const allowed=new Map([[accepted.path,2]]);assert.equal(assertDeletionFile(accepted,allowed),accepted.path);
  for(const p of ['bike-packing/app.js','shared-ui/app.js','_releases/vdoc/app.js','bike-packing-stage-v4-old/app.js','bike-packing-backup-v4-experiment/app.js','bike-packing-backup-before-v4-old/photos/a.jpg','bike-packing-backup-before-v4-old/../app.js','bike-packing-backup-before-v4-old/app.js\r\nDELE live'])assert.throws(()=>assertDeletionFile({...accepted,path:p},allowed));
  assert.throws(()=>assertDeletionFile({...accepted,bytes:3},allowed));
  assert.throws(()=>assertDeletionFile({...accepted,sha256:''},allowed));
});
test('new files or symlinks in an old directory stop cleanup', () => {
  const root='bike-packing-backup-v4-old';const files=[{path:root+'/app.js',bytes:2}];
  assertUnchangedRoot(files,files,[],root);
  assert.throws(()=>assertUnchangedRoot(files,[...files,{path:root+'/photo.jpg',bytes:20}],[],root));
  assert.throws(()=>assertUnchangedRoot(files,files,[root+'/assets -> ../live/assets'],root));
  assert.throws(()=>assertUnchangedRoot(files,[],[],root));
});

import { resumeCleanup } from '../../scripts/production-retention-guards.mjs';
test('resume recovers an unjournaled partial batch without deleting extra files', () => {
  const files=['app.js','styles.css','index.html'].map(p=>({path:'bike-packing-backup-v1-old/'+p,bytes:1,sha256:sha256(p)}));
  const state=resumeCleanup(files,[files[2]],[],{deleted:[files[0]]});
  assert.deepEqual(state.missing,files.slice(0,2));assert.deepEqual(state.remaining,[files[2]]);
  assert.throws(()=>resumeCleanup(files,[files[2],{path:'bike-packing-backup-v1-old/photo.jpg',bytes:9}],[],{deleted:[files[0]]}));
  assert.throws(()=>resumeCleanup(files,files,[],{deleted:[files[0]]}));
  assert.throws(()=>resumeCleanup(files,[],[],{deleted:[{...files[0],sha256:sha256('different')}]}));
});
