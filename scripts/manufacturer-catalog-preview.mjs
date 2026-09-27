import { createServer } from 'node:http';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { catalogPhotoSelection, catalogPhotoSelectionMatches } from '../src/data/manufacturer-catalog-photo-selection.js';
import { MANUFACTURER_BAG_CATALOG_GENERATED as current } from '../src/data/manufacturer-bag-catalog.generated.js';
import { buildManufacturerCatalogScanReport, manufacturerIdForEntry } from '../src/data/manufacturer-catalog-scan.js';
const root=resolve('.'), cache=resolve('node_modules/.cache/catalog-photo-repair');
const port=Number(process.env.CATALOG_PREVIEW_PORT || 4191), origin=`http://127.0.0.1:${port}`;
const draft=(await import(pathToFileURL(resolve(cache,'repaired-catalog.mjs')).href)).MANUFACTURER_BAG_CATALOG_GENERATED;
const audit=JSON.parse(await readFile('catalog-review-inputs/gallery-repair-audit-20260927.json','utf8'));
const report=buildManufacturerCatalogScanReport({approvedEntries:current,scannedEntries:draft,scannedAt:'2026-09-27T12:00:00.000Z',manufacturers:[...new Map(current.map(e=>[e.brand,{id:manufacturerIdForEntry(e),name:e.brand}])).values()]});
report.id='gallery-repair-review-20260927';
const fingerprint=createHash('sha256').update(JSON.stringify(report.changes)).digest('hex');
const decisionFile=resolve(cache,'user-review-decisions.json');
let saved={fingerprint,decisions:{}};
let saving=Promise.resolve();
try { const old=JSON.parse(await readFile(decisionFile,'utf8')); if(old.fingerprint===fingerprint)saved=old; } catch {}
const urlMap=new Map([...current,...draft].flatMap(e=>(e.sourceImageUrls||[]).map((url,i)=>[url,e.imageAssetPaths?.[i]])).filter(([,p])=>p));
function imageUrl(url){return urlMap.has(url)?origin+'/'+urlMap.get(url):url;}
function snapshot(s){return !s?s:{...s,sourceImageUrl:imageUrl(s.sourceImageUrl),sourceImageUrls:(s.sourceImageUrls||[]).map(imageUrl)};}
function review(){return {photoExceptions:Object.entries(saved.decisions).filter(([,d])=>d.decision==='approved'&&(d.photoSelection?.retainedUrls?.length||d.photoSelection?.excludedUrls?.length)).map(([id,d])=>({...d.photoSelection,note:d.decisionNote,reviewedAt:d.reviewedAt,productId:report.changes.find(c=>c.id===id)?.productId,productName:report.changes.find(c=>c.id===id)?.productName,manufacturer:report.changes.find(c=>c.id===id)?.manufacturer})),photoSelectionSupported:true,generatedAt:report.scannedAt,scans:[{...report,changes:report.changes.map(c=>({...c,before:snapshot(c.before),after:snapshot(c.after),fields:c.fields.map(f=>['sourceImageUrl','sourceImageUrls'].includes(f.field)?{...f,before:Array.isArray(f.before)?f.before.map(imageUrl):imageUrl(f.before),after:Array.isArray(f.after)?f.after.map(imageUrl):imageUrl(f.after)}:f),...(saved.decisions[c.id]||{})}))}]};}
function entries(rows){return rows.map(e=>({...e,imageUrls:(e.imageAssetPaths||[]).map(p=>origin+'/'+p),imageUrl:e.imageAssetPath?origin+'/'+e.imageAssetPath:''}));}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end();}
 const path=new URL(req.url,origin).pathname;
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const json=(data)=>{res.setHeader('Content-Type',types['.json']);res.end(JSON.stringify(data));};
 if(path==='/decision'&&req.method==='POST'){
  if(req.headers.origin!==origin){res.writeHead(403);return res.end();}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>10000){res.writeHead(413);return res.end();}}
  const value=JSON.parse(body);if(!report.changes.some(c=>c.id===value.changeId)||!['approved','rejected','deferred'].includes(value.decision)||typeof value.note!=='string'||value.note.length>1000){res.writeHead(400);return res.end();}
  const change=review().scans[0].changes.find(c=>c.id===value.changeId);
  const selection=value.photoSelection;
  if(selection&&(!catalogPhotoSelectionMatches(selection,change)||(value.decision==='approved'&&!selection.selectedUrls.length))){res.writeHead(409);return res.end();}
  if(selection){const proposed=catalogPhotoSelection({...change,photoSelection:null}).selectedUrls;selection.retainedUrls=selection.selectedUrls.filter(url=>!proposed.includes(url));selection.excludedUrls=proposed.filter(url=>!selection.selectedUrls.includes(url));}
  const save=saving.catch(()=>{}).then(async()=>{const next={...saved,decisions:{...saved.decisions,[value.changeId]:{decision:value.decision,decisionNote:value.note,photoSelection:selection,reviewedAt:new Date().toISOString()}}};await writeFile(decisionFile+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(decisionFile+'.tmp',decisionFile);saved=next;return next.decisions[value.changeId];});
  saving=save;return json(await save);
 }
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(path==='/review.json')return json(review());
 if(path==='/catalog.json')return json({current:entries(current),draft:entries(draft),audit,fingerprint});
 if(path==='/decisions.json'){res.setHeader('Content-Disposition','attachment; filename="catalog-review-decisions.json"');return json(saved);}
 let file;
 if(path==='/')file=resolve(root,'scripts/manufacturer-catalog-preview.html');
 else if(/^\/src\/[a-z0-9/.-]+\.js$/i.test(path)||path==='/styles.css'||/^\/assets\/(manufacturer-catalog|manufacturer-brands)\/[a-z0-9/_.-]+$/i.test(path))file=resolve(root,'.'+path);
 else {res.writeHead(404);return res.end();}
 if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
 try{await stat(file);}catch{if(path.startsWith('/assets/manufacturer-catalog/'))file=resolve(cache,'downloaded','.'+path);else throw Error('missing');}
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(500);res.end('Preview request failed');}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:origin,changes:report.changes.length,pending:audit.pending,decisionFile})));
