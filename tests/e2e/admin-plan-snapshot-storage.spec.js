import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const origin='https://admin-storage.localhost';
const bootstrap=`
import {createPersonalDataRepository} from '/src/storage/personal-data-repository.js';
import {adminTemplateCommandPlan,verifyAdminCommandStorageRow as validate,createAdminTemplateSavePlans} from '/src/sync/admin-template-save-plan.js';
import {canonicalTemplateJson as canonical} from '/src/sync/admin-template-protocol.js';
import {migrateAdminPlanSnapshots,resolveAdminPlanStorageRow,adminPlanKey} from '/src/storage/admin-plan-snapshot-storage.js';
const binding={actorId:'admin-native',environment:'bike-packing-experiment',listId:'public-shared-layout-test',itemKey:'shared-layout:test'};
const hash=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
window.seed=async count=>{const rows=[];for(let i=0;i<count;i++){const title='Name '+i;const plan=adminTemplateCommandPlan({binding,operationId:crypto.randomUUID(),kind:'template.metadata',body:{version:1,base:{stateRevision:i+1},metadata:{title,language:'ru'}},editorSnapshot:{payload:{items:{a:{id:'a',name:'Common',note:'retained '.repeat(5500)}},containers:{},layouts:{a:{id:'a',name:title,updatedAt:title}}},metadata:{title,description:'',language:'ru'}}});const raw=canonical({version:1,plan,digest:await hash(canonical(plan)),cancelRequested:false}),key=adminPlanKey(plan);localStorage.setItem(key,raw);rows.push({key,hash:await hash(raw)});}return rows;};
window.bytes=()=>Object.keys(localStorage).reduce((n,k)=>n+k.length+localStorage.getItem(k).length,0);
window.migrate=async()=>{const repository=createPersonalDataRepository({databaseName:'admin-snapshot-native'});try{return await migrateAdminPlanSnapshots({storage:localStorage,repository,locks:navigator.locks,validate});}finally{repository.close();}};
window.audit=async rows=>{const hashes=[];for(const row of rows){const proof=resolveAdminPlanStorageRow(localStorage,row.key);await validate(row.key,proof.raw);for(const dep of proof.dependencies)await validate(dep.key,dep.raw);proof.assertCurrent();hashes.push(await hash(proof.raw));}return hashes;};
window.archives=async()=>{const repository=createPersonalDataRepository({databaseName:'admin-snapshot-native'});try{const view=await repository.read({environment:binding.environment,actorId:binding.actorId,listId:'admin-plan-originals',scopeKey:'id:'+binding.actorId});return Promise.all(view.entries.map(async row=>({key:row.key,hash:await hash(row.raw)})));}finally{repository.close();}};
window.takeProof=key=>{window.proof=resolveAdminPlanStorageRow(localStorage,key);return window.proof.dependencies.map(d=>d.key);};
window.checkProof=()=>{try{window.proof.assertCurrent();return true;}catch{return false;}};
window.ready=true;
`;
test.beforeEach(async({context})=>{
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin||route.request().method()!=='GET')throw Error('Unexpected request');
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><script type="module" src="/bootstrap.js"></script>'});
    if(url.pathname==='/bootstrap.js')return route.fulfill({contentType:'text/javascript',body:bootstrap});
    if(/^\/src\/[A-Za-z0-9_/-]+\.js$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:await readFile(path.resolve('.'+url.pathname),'utf8')});
    throw Error('Unexpected path '+url.pathname);
  });
});
test('full native quota: 52 plans migrate with exact hashes, durable originals and cold reload',async({page})=>{
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const rows=await page.evaluate(()=>window.seed(52));
  const before=await page.evaluate(()=>{let i=0;try{while(i<100){localStorage.setItem('unrelated-filler-'+i,'z'.repeat(100000));i++;}}catch(e){if(e.name!=='QuotaExceededError')throw e;}return {size:window.bytes(),fillers:i};});
  expect(before.fillers).toBeGreaterThan(0);
  const result=await page.evaluate(()=>window.migrate());expect(result.migrated).toBe(51);expect(result.freedChars).toBeGreaterThan(2300000);
  const after=await page.evaluate(()=>({size:window.bytes(),fillers:Object.keys(localStorage).filter(k=>k.startsWith('unrelated-filler-')).length}));
  expect(after.fillers).toBe(before.fillers);expect(before.size-after.size).toBe(result.freedChars);
  expect(await page.evaluate(rows=>window.audit(rows),rows)).toEqual(rows.map(r=>r.hash));
  await page.reload();await page.waitForFunction(()=>window.ready);
  expect(await page.evaluate(rows=>window.audit(rows),rows)).toEqual(rows.map(r=>r.hash));
  const archived=await page.evaluate(()=>window.archives());expect(archived).toHaveLength(51);
  for(const row of archived)expect(row.hash).toBe(rows.find(r=>r.key===row.key).hash);
  expect(await page.evaluate(()=>window.migrate())).toEqual({migrated:0,freedChars:0});
});
test('a second native tab changing or deleting the retained base invalidates an existing proof',async({page,context})=>{
  await page.goto(origin);await page.waitForFunction(()=>window.ready);const rows=await page.evaluate(()=>window.seed(3));await page.evaluate(()=>window.migrate());
  const target=await page.evaluate(()=>Object.keys(localStorage).find(k=>JSON.parse(localStorage.getItem(k)).editorSnapshotReference));
  const [base]=await page.evaluate(key=>window.takeProof(key),target);
  const other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.ready);
  const original=await other.evaluate(key=>localStorage.getItem(key),base);
  await other.evaluate(key=>localStorage.setItem(key,localStorage.getItem(key).replace('Common','Changed')),base);
  expect(await page.evaluate(()=>window.checkProof())).toBe(false);
  await other.evaluate(({base,original})=>localStorage.setItem(base,original),{base,original});
  expect(await page.evaluate(()=>window.checkProof())).toBe(true);
  await other.evaluate(key=>localStorage.removeItem(key),base);expect(await page.evaluate(()=>window.checkProof())).toBe(false);
  await other.evaluate(({base,original})=>localStorage.setItem(base,original),{base,original});
  expect(await page.evaluate(rows=>window.audit(rows),rows)).toEqual(rows.map(r=>r.hash));
});
