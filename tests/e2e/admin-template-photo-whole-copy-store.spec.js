import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { wholeRecordInput } from '../fixtures/admin-template-photo-whole-copy-record-fixture.js';

const origin='https://whole-store.localhost';
const databaseName='bike-packing-admin-template-photo-whole-copy-actions-v1';
const bootstrap=`
import {createAdminTemplatePhotoWholeCopyActionStore,readWholeCopyActionSnapshot} from '/src/sync/admin-template-photo-whole-copy-action-store.js';
window.opens=0;window.transactions=0;
const nativeOpen=indexedDB.open,nativeTransaction=IDBDatabase.prototype.transaction;
indexedDB.open=function(...args){window.opens++;return nativeOpen.apply(this,args)};
IDBDatabase.prototype.transaction=function(...args){window.transactions++;return nativeTransaction.apply(this,args)};
window.configure=binding=>{window.context={...binding,scope:'admin-template',admin:true,generation:'native'};window.store=createAdminTemplatePhotoWholeCopyActionStore({binding,getContext:()=>window.context,enabled:true});};
window.invoke=async(method,...args)=>{try{return{ok:true,value:await window.store[method](...args)}}catch(error){return{ok:false,code:error.code}}};
window.takeSnapshot=async id=>{window.snapshot=await readWholeCopyActionSnapshot(window.store,id);return !!window.snapshot.record};
window.checkSnapshot=async()=>{try{await window.snapshot.assertUnchanged();return {ok:true}}catch(error){return {ok:false,code:error.code}}};
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
async function capture(page){
  const input=await wholeRecordInput();await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const result=await page.evaluate(async input=>{window.configure(input.binding);return window.invoke('capture',{action:input.action,snapshot:input.snapshot})},input);
  expect(result.ok).toBe(true);return input;
}
test('native connection reuse keeps fresh readbacks and sees a second-tab record change',async({page,context})=>{
  const input=await capture(page);
  const result=await page.evaluate(async id=>{const start=window.transactions;for(let i=0;i<5;i++){const r=await window.invoke('read',id);if(!r.ok)throw Error(r.code)}return{opens:window.opens,transactions:window.transactions-start}},input.action.operationId);
  expect(result).toEqual({opens:1,transactions:10});
  const other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.ready);
  await other.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('actions','readwrite'),store=tx.objectStore('actions'),r=store.getAll();r.onsuccess=()=>{const row=r.result[0];row.intentHash='0'.repeat(64);store.put(row)};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close()},databaseName);
  const changed=await page.evaluate(id=>window.invoke('read',id),input.action.operationId);
  expect(changed.ok).toBe(false);expect(changed.code).toBe('admin-template-photo-whole-copy-record');
});
test('native versionchange closes the retained connection and a newer schema fails closed',async({page,context})=>{
  const input=await capture(page),other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.ready);
  await other.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close()},databaseName);
  const result=await page.evaluate(async id=>({read:await window.invoke('read',id),opens:window.opens}),input.action.operationId);
  expect(result.read.ok).toBe(false);expect(result.read.code).toBe('admin-template-photo-whole-copy-storage-open');expect(result.opens).toBe(2);
});

test('native raw readback sees changed and deleted bytes from another tab',async({page,context})=>{
  const input=await capture(page);
  const other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.ready);
  expect(await page.evaluate(id=>window.takeSnapshot(id),input.action.operationId)).toBe(true);
  const initial=await page.evaluate(()=>window.transactions);
  expect(await page.evaluate(()=>window.checkSnapshot())).toEqual({ok:true});
  expect(await page.evaluate(()=>window.transactions)).toBe(initial+1);
  await other.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('actions','readwrite'),store=tx.objectStore('actions'),r=store.getAll();r.onsuccess=()=>{const row=r.result[0];row.intentHash='0'.repeat(64);store.put(row)};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close()},databaseName);
  expect(await page.evaluate(()=>window.checkSnapshot())).toEqual({ok:false,code:'admin-template-photo-whole-copy-storage-inventory-changed'});
  await other.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('actions','readwrite');tx.objectStore('actions').clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close()},databaseName);
  expect(await page.evaluate(()=>window.checkSnapshot())).toEqual({ok:false,code:'admin-template-photo-whole-copy-storage-inventory-changed'});
});


test('warm command derivation observes another tab replacement, additions and deletion',async({page,context})=>{
  const input=await wholeRecordInput();await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const setup=await page.evaluate(async binding=>{
    const {adminTemplateCommandPlan,createAdminTemplateSavePlans}=await import('/src/sync/admin-template-save-plan.js');
    const {canonicalTemplateJson:canonical}=await import('/src/sync/admin-template-protocol.js');
    window.commandHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),x=>x.toString(16).padStart(2,'0')).join('');
    const id=crypto.randomUUID(),plan=adminTemplateCommandPlan({binding,operationId:id,kind:'template.metadata',body:{version:1,base:{stateRevision:1},metadata:{title:'Before',language:'en'}},editorSnapshot:{payload:{note:'large snapshot'.repeat(4000)},metadata:{title:'Original',language:'en'}}});
    const key='bike-packing-admin-save-plans-v1:'+encodeURIComponent(canonical(binding))+':'+id;
    const raw=canonical({version:1,plan,digest:await window.commandHash(plan),cancelRequested:false});localStorage.setItem(key,raw);
    window.commandContext={...binding,scope:'admin-template',admin:true,generation:'native'};
    window.commandPlans=createAdminTemplateSavePlans({binding,storage:localStorage,client:{},getContext:()=>window.commandContext,enabled:false});
    window.readCommand=async id=>{try{const row=await window.commandPlans.read(id);return{ok:true,title:row?.plan.operations[0].body.metadata.title??null}}catch(error){return{ok:false,code:error.code}}};
    return{id,key,raw,first:await window.readCommand(id),warm:await window.readCommand(id)};
  },input.binding);
  expect(setup.first).toEqual({ok:true,title:'Before'});expect(setup.warm).toEqual(setup.first);
  const other=await context.newPage();await other.goto(origin);await other.waitForFunction(()=>window.ready);
  await other.evaluate(({key})=>{const row=JSON.parse(localStorage.getItem(key));row.plan.editorSnapshot.payload.note+='corrupt';localStorage.setItem(key,JSON.stringify(row));},setup);
  expect((await page.evaluate(id=>window.readCommand(id),setup.id)).ok).toBe(false);
  await other.evaluate(async({key,raw})=>{
    const {canonicalTemplateJson:canonical}=await import('/src/sync/admin-template-protocol.js');
    const row=JSON.parse(raw);row.plan.operations[0].body.metadata.title='Valid replacement';
    row.digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(row.plan)))),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,canonical(row));
  },setup);
  expect(await page.evaluate(id=>window.readCommand(id),setup.id)).toEqual({ok:true,title:'Valid replacement'});
  const added=await other.evaluate(async({key,raw})=>{
    const {canonicalTemplateJson:canonical}=await import('/src/sync/admin-template-protocol.js');const row=JSON.parse(raw),id=crypto.randomUUID();row.plan.id=id;row.plan.operations[0].id=id;
    row.digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(row.plan)))),x=>x.toString(16).padStart(2,'0')).join('');const next=key.slice(0,-36)+id;localStorage.setItem(next,canonical(row));return next;
  },setup);
  expect(await page.evaluate(async()=> (await window.commandPlans.list()).length)).toBe(2);
  await other.evaluate(key=>localStorage.removeItem(key),added);
  expect(await page.evaluate(async()=> (await window.commandPlans.list()).length)).toBe(1);
  await other.evaluate(key=>localStorage.removeItem(key),setup.key);
  expect(await page.evaluate(id=>window.readCommand(id),setup.id)).toEqual({ok:true,title:null});
});
