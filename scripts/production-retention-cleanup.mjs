// Production-only, manifest-bound cleanup. prepare is read-only; apply requires
// a separately verified off-host archive and rechecks every remote file.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertDeletionFile, assertUnchangedRoot, resumeCleanup } from './production-retention-guards.mjs';
import { sha256, verifyBytes } from './production-retention-plan.mjs';
const [mode, directory, configPath] = process.argv.slice(2);
if (!['prepare','apply','verify','audit-kept','resume'].includes(mode) || !directory || !configPath) throw Error('Usage: prepare|apply|resume|verify|audit-kept DIRECTORY IGNORED_SFTP_CONFIG');
const root=path.resolve(directory);
const plan=JSON.parse(await fs.readFile(path.join(root,'plan.json'),'utf8'));
const cfg=JSON.parse((await fs.readFile(configPath,'utf8')).replace(/^\uFEFF/,''));
if(!['vniipo-help.ru','88.212.206.188'].includes(cfg.host)||cfg.remotePath!=='/'||Number(cfg.port)!==21||cfg.protocol!=='ftp'||!cfg.username||!cfg.password)throw Error('Unexpected FTPS config');
const quote=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
const base=['silent','show-error','fail','ssl-reqd','ftp-pasv','insecure','connect-timeout = 15','max-time = 180','pinnedpubkey = "sha256//+gOwS0YQ8/CGtOD9zgyFzgYGLtl38K9YhxYssMpjz+Y="','resolve = "vniipo-help.ru:21:88.212.206.188"','user = '+quote(cfg.username+':'+cfg.password)];
const safe=p=>typeof p==='string'&&!/[\\\x00-\x1f]/.test(p)&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const url=p=>'ftp://vniipo-help.ru:21/www/vniipo-help.ru/'+p.split('/').map(encodeURIComponent).join('/');
const json=async(name,data)=>fs.writeFile(path.join(root,name),JSON.stringify(data,null,2)+'\n');
async function curl(lines){return await new Promise((resolve,reject)=>{const c=spawn('C:/Windows/System32/curl.exe',['--config','-'],{stdio:['pipe','pipe','pipe'],windowsHide:true});const chunks=[];c.stdout.on('data',v=>chunks.push(v));c.stderr.resume();c.on('error',reject);c.on('exit',code=>code===0?resolve(Buffer.concat(chunks)):reject(Error('Transfer failed: '+code)));c.stdin.end(lines.join('\n')+'\n','utf8');});}
async function read(p){if(!safe(p))throw Error('Unsafe path');for(let attempt=0;attempt<3;attempt++){try{return await curl([...base,'url = '+quote(url(p))]);}catch(e){if(attempt===2)throw Error('Read failed: '+p+'; '+e.message);}}}
function parseListing(raw){let dir='';const files=[],links=[],directories=[];for(const line of raw.toString('utf8').split(/\r?\n/)){if(line.endsWith(':')&&!/^[dl-][rwx-]/.test(line)){dir=line.slice(0,-1).replace(/^\.\//,'').replace(/\/$/,'');continue;}const m=line.match(/^([-dl])[rwxstST-]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+(.+)$/);if(!m)continue;const p=(dir?dir+'/':'')+m[3];if(m[1]==='-')files.push({path:p,bytes:Number(m[2]),listing:line});else if(m[1]==='l')links.push(p);else directories.push(p);}if(!files.some(f=>f.path==='bike-packing/index.html'))throw Error('Incomplete root listing');return{files,links,directories};}
async function inventory(name){console.log(JSON.stringify({phase:'listing',name}));const raw=await curl([...base,'url = '+quote(url('')),'request = "LIST -R"']);await fs.writeFile(path.join(root,name+'.txt'),raw);const result=parseListing(raw);await json(name+'.json',result);return result;}
const strip=p=>p.replace(/^\/www\/vniipo-help\.ru\//,'').replace(/\/$/,'');
const permitted = new Map(plan.roots.filter(r=>r.decision==='candidate-blocked'&&!/-(stage|failed)-/.test(r.remotePath)).flatMap(r=>r.files.map(f=>[strip(f.remotePath),f.bytes])));
const publicLines=p=>['silent','show-error','fail','connect-timeout = 15','max-time = 60','header = \"Cache-Control: no-cache\"','url = '+quote('https://vniipo-help.ru/'+p.split('/').map(encodeURIComponent).join('/')+'?retention='+Date.now())];
async function readRelease(p){if(!safe(p))throw Error('Unsafe path');if((p.endsWith('.php')||p.endsWith('.htaccess')))return read(p);for(let a=0;a<3;a++){try{return await curl(publicLines(p));}catch(e){if(a===2)throw Error('HTTPS read failed: '+p+'; '+e.message);}}}
async function liveCheck(){for(const f of plan.downloads.filter(f=>f.remotePath.startsWith('bike-packing/')))verifyBytes(await readRelease(f.remotePath),f.sha256);}
async function batches(items,size,fn){for(let i=0;i<items.length;i+=size)await Promise.all(items.slice(i,i+size).map(fn));}
async function cacheDownload(items,folder){
  const missing=[];
  for(const f of items){if(!safe(f.path))throw Error('Unsafe cache path');const target=path.join(root,folder,f.path);let existing;try{existing=await fs.stat(target);}catch{}if(existing?.size!==f.bytes){await fs.mkdir(path.dirname(target),{recursive:true});missing.push({...f,target});}}
  // Reuse FTPS connections across files; three simultaneous transfers maximum.
  for(let i=0;i<missing.length;i+=150){
    const batch=missing.slice(i,i+150);const lines=['parallel','parallel-max = 3'];
    for(const [n,f] of batch.entries()){if(n)lines.push('next');lines.push(...((f.path.endsWith('.php')||f.path.endsWith('.htaccess'))? [...base,'url = '+quote(url(f.path))]:publicLines(f.path)),'retry = 2','output = '+quote(f.target));}
    await curl(lines);console.log(JSON.stringify({phase:'download',folder,completed:Math.min(i+150,missing.length),pendingSet:missing.length}));
  }
  for(const f of items){const bytes=await fs.readFile(path.join(root,folder,f.path));if(bytes.length!==f.bytes)throw Error('Downloaded size mismatch: '+f.path);f.sha256=sha256(bytes);}
}
if(mode==='audit-kept'){
  const inv=JSON.parse(await fs.readFile(path.join(root,'fresh-before.json'),'utf8'));
  const keepRoots=new Set(plan.roots.filter(r=>r.decision!=='candidate-blocked'||/-(stage|failed)-/.test(r.remotePath)).map(r=>strip(r.remotePath)));
  const refs=inv.files.filter(f=>(keepRoots.has(f.path.split('/')[0])&&(/\.(?:js|css|html|webmanifest|json)$/.test(f.path)||f.path.endsWith('/index.php')))||((f.path==='.htaccess'||f.path.endsWith('/.htaccess'))&&!/(?:backup|stage|previous|failed|replaced|_releases)/i.test(f.path)));
  await cacheDownload(refs,'kept-dependency-audit');
  const candidateRoots=[...new Set([...permitted.keys()].map(p=>p.split('/')[0]))];const hits=[];
  for(const f of refs){const text=(await fs.readFile(path.join(root,'kept-dependency-audit',f.path),'utf8')).replace(/\\\//g,'/');for(const r of candidateRoots)if(text.includes(r))hits.push({source:f.path,target:r});}
  await json('kept-dependency-audit.json',{checkedAt:new Date().toISOString(),files:refs.map(f=>({path:f.path,sha256:f.sha256})),hits,serverMutations:0});
  console.log(JSON.stringify({phase:'kept-dependencies-checked',files:refs.length,hits}));if(hits.length)throw Error('Retained resource references cleanup target');
}else if(mode==='prepare'){
  console.log(JSON.stringify({phase:'checking-live'}));await liveCheck();
  const fresh=await inventory('fresh-before');
  const freshMap=new Map(fresh.files.map(f=>[f.path,f]));
  const candidateRoots=[...new Set([...permitted.keys()].map(p=>p.split('/')[0]))];
  for(const r of candidateRoots){const expected=[...permitted].filter(([p])=>p.startsWith(r+'/')).map(([p,b])=>[p,b]).sort();const actual=fresh.files.filter(f=>f.path.startsWith(r+'/')).map(f=>[f.path,f.bytes]).sort();if(JSON.stringify(expected)!==JSON.stringify(actual)||fresh.links.some(l=>l.startsWith(r+'/')))throw Error('Candidate inventory changed: '+r);}
  const files=[...permitted].map(([p,bytes])=>({path:p,bytes,listing:freshMap.get(p).listing}));
  // Static public entrypoints/runtime plus all protected Production code. Never read server credentials/config PHP.
  const protectedRoots=new Set(plan.roots.filter(r=>r.decision!=='candidate-blocked'||/-(stage|failed)-/.test(r.remotePath)).map(r=>strip(r.remotePath)));
  const references=fresh.files.filter(f=>(/\.(?:js|css|html|webmanifest|json)$/i.test(f.path)||f.path.endsWith('.htaccess')||(protectedRoots.has(f.path.split('/')[0])&&f.path.endsWith('/index.php')))&&!/(?:^|\/)(?:node_modules|vendor|\.git|data)\//.test(f.path)&&(protectedRoots.has(f.path.split('/')[0])||!/(?:backup|stage|previous|replaced|failed|_releases)/i.test(f.path)));
  console.log(JSON.stringify({phase:'backup-and-reference-download',candidateFiles:files.length,candidateBytes:files.reduce((s,f)=>s+f.bytes,0),referenceFiles:references.length}));
  await cacheDownload(files,'candidate-backup'); await json('backup-download-progress.json',files);
  await cacheDownload(references,'reference-audit');
  const protectedHits=new Map();
  function scan(text,from){text=text.replace(/\\\//g,'/');for(const r of candidateRoots)if(text.includes(r)&&!protectedHits.has(r))protectedHits.set(r,from);}
  for(const f of references)scan((await fs.readFile(path.join(root,'reference-audit',f.path))).toString('utf8'),f.path);
  for(const l of fresh.links)scan(l,'symlink:'+l);
  // Preserve transitive dependencies of any historical root referenced by live resources.
  let previous=-1;while(previous!==protectedHits.size){previous=protectedHits.size;for(const f of files.filter(f=>protectedHits.has(f.path.split('/')[0])))scan((await fs.readFile(path.join(root,'candidate-backup',f.path))).toString('utf8'),f.path);}
  const finalFiles=files.filter(f=>!protectedHits.has(f.path.split('/')[0]));
  const prepared={createdAt:new Date().toISOString(),planSha256:sha256(await fs.readFile(path.join(root,'plan.json'))),liveVersion:plan.retention.versions[0],files:finalFiles,bytes:finalFiles.reduce((s,f)=>s+f.bytes,0),excludedStagingAndFailed:true,referenceAudit:{files:references.map(f=>({path:f.path,sha256:f.sha256})),preservedRoots:[...protectedHits].map(([root,referencedFrom])=>({root,referencedFrom})),transport:'Public static files through HTTPS; PHP source and inventory through pinned FTPS. A cached FTPS app.js matched the HTTPS copy byte-for-byte before changing transport.',scope:'Static live application/runtime and protected Production code, plus filesystem symlinks. Not a claim about arbitrary external bookmarks or runtime API user content.'},remoteMutations:0};
  await liveCheck();await json('prepared-cleanup.json',prepared);console.log(JSON.stringify({phase:'prepared',files:prepared.files.length,bytes:prepared.bytes,preservedReferences:[...protectedHits.keys()]}));
}else{
  const manifestBytes=await fs.readFile(path.join(root,'prepared-cleanup.json'));const m=JSON.parse(manifestBytes);
  verifyBytes(await fs.readFile(path.join(root,'plan.json')),m.planSha256);
  if(mode==='apply'||mode==='resume'){
    const lockPath=path.join(path.dirname(path.resolve(configPath)),'production-retention.lock.json');
    const lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),manifest:sha256(manifestBytes)}));await lock.close();
    process.on('exit',()=>{try{fsSync.unlinkSync(lockPath);}catch{}});
    const evidence=JSON.parse(await fs.readFile(path.join(root,'archive-verification.json'),'utf8'));
    if(evidence.manifestSha256!==sha256(manifestBytes)||evidence.files!==m.files.length||evidence.verifiedRestoredFiles!==m.files.length)throw Error('Archive recovery not verified');
    verifyBytes(await fs.readFile(evidence.archivePath),evidence.archiveSha256);
    for(const f of m.files){assertDeletionFile(f,permitted);verifyBytes(await fs.readFile(path.join(root,'candidate-backup',f.path)),f.sha256);}
    console.log(JSON.stringify({phase:'archive-verified',files:m.files.length,bytes:m.bytes}));
    await liveCheck();
    const previous=mode==='resume'?JSON.parse(await fs.readFile(path.join(root,'cleanup-progress.json'),'utf8')):null;
    if(previous)await json('cleanup-progress-before-resume-'+Date.now()+'.json',previous);
    const inv=await inventory('immediately-before-delete');const mp=new Map(inv.files.map(f=>[f.path,f]));
    const resumed=mode==='resume'?resumeCleanup(m.files,inv.files,inv.links,previous):{remaining:m.files,missing:[]};
    for(const r of new Set(resumed.remaining.map(f=>f.path.split('/')[0])))assertUnchangedRoot(resumed.remaining,inv.files,inv.links,r);
    for(const f of resumed.remaining)if(mp.get(f.path)?.listing!==f.listing)throw Error('Candidate metadata changed: '+f.path);
    console.log(JSON.stringify({phase:'rechecking-references',files:m.referenceAudit.files.length}));
    const refCheck=m.referenceAudit.files.map(f=>({path:f.path,bytes:mp.get(f.path)?.bytes}));
    if(refCheck.some(f=>!Number.isSafeInteger(f.bytes)))throw Error('Reference source disappeared');
    await cacheDownload(refCheck,'reference-recheck-'+Date.now());
    for(let i=0;i<refCheck.length;i++)if(refCheck[i].sha256!==m.referenceAudit.files[i].sha256)throw Error('Reference source changed: '+refCheck[i].path);
    console.log(JSON.stringify({phase:'deletion-start',files:m.files.length,bytes:m.bytes}));
    const deleted=resumed.missing.map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256}));await json('cleanup-progress.json',{startedAt:new Date().toISOString(),deleted});
    const groups=Object.groupBy(resumed.remaining,f=>f.path.split('/')[0]);
    // Optimistic publication guard: live checked before each root; all staging stays protected.
    // Read/hash candidate bytes immediately before exact per-file DELE commands.
    for(const [remoteRoot,files] of Object.entries(groups)){
      verifyBytes(await readRelease('bike-packing/index.html'),plan.downloads.find(f=>f.remotePath==='bike-packing/index.html').sha256);
      await batches(files,3,async f=>verifyBytes(await readRelease(f.path),f.sha256));
      const lines=[...base,'head','url = "ftp://vniipo-help.ru:21/"','output = "NUL"',...files.map(f=>'quote = '+quote('DELE www/vniipo-help.ru/'+f.path))];
      await curl(lines); deleted.push(...files.map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256})));
      await json('cleanup-progress.json',{updatedAt:new Date().toISOString(),deleted});
      if(deleted.length%70<files.length)console.log(JSON.stringify({phase:'deleting',files:deleted.length,total:m.files.length}));
    }
    // Empty directory removal is intentionally omitted: unknown/new contents are never recursively touched.
    await liveCheck();await json('cleanup-completed.json',{completedAt:new Date().toISOString(),deletedFiles:deleted.length,deletedBytes:deleted.reduce((s,f)=>s+f.bytes,0),archivePath:evidence.archivePath,archiveSha256:evidence.archiveSha256,liveVersion:m.liveVersion});
  }
  const after=await inventory('after-cleanup');
  const remaining=m.files.filter(f=>after.files.some(a=>a.path===f.path));
  await liveCheck();
  await batches(plan.downloads,3,async f=>verifyBytes(await readRelease(f.remotePath),f.sha256));
  await json('retained-after-cleanup.json',{checkedAt:new Date().toISOString(),versions:plan.retention.versions,verifiedSourceFiles:plan.downloads.length,sha256:'verified',serverMutations:0});
  const before=JSON.parse(await fs.readFile(path.join(root,'fresh-before.json'),'utf8'));
  const deletedSet=new Set(m.files.filter(f=>!remaining.includes(f)).map(f=>f.path));
  const remainingMap=new Map(after.files.map(f=>[f.path,f]));
  const protectedChanges=before.files.filter(f=>f.path.startsWith('bike-packing')&&!deletedSet.has(f.path)&&(remainingMap.get(f.path)?.bytes!==f.bytes));
  const result={checkedAt:new Date().toISOString(),removedFiles:deletedSet.size,removedBytes:m.files.filter(f=>deletedSet.has(f.path)).reduce((s,f)=>s+f.bytes,0),remainingCandidateFiles:remaining.length,protectedProductionChanges:protectedChanges.map(f=>f.path),liveVersion:m.liveVersion};await json('cleanup-final-verification.json',result);console.log(JSON.stringify(result));
  if(remaining.length||protectedChanges.length)throw Error('Post-cleanup verification incomplete');
}
