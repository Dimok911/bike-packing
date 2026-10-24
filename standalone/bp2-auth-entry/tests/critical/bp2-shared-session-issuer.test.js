import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonalAppAuth} from '../../src/bp2/personal-app-auth.js';
import {createBp2IssuerSelector} from '../../src/bp2/shared-session-issuer.js';
const A='https://auth-a.api.vniipo-help.ru',B='https://auth-b.api.vniipo-help.ru',L='https://api.vniipo-help.ru',EU='https://api-eu.vniipo-help.ru';
const ok=value=>Response.json({ok:true,...value});
const user=id=>({user:{id},session:{expiresAt:new Date(Date.now()+86400000).toISOString()}});
const ready=()=>ok({service:'vniipo-auth',database:'ready'});
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function setup(handler,options={}){
 const calls=[];let begins=0,refreshes=0;
 const auth=createPersonalAppAuth({storage:storage(),sharedIssuerMode:'ha',authBaseUrl:EU+'/experiment/letters-vniipo/api',onSignedIn:()=>refreshes++,
  fetchImpl:async(url,init)=>{calls.push({url,init});const custom=await handler?.(url,init,calls);if(custom)return custom;
   if(url.endsWith('/auth/me'))return ok(user('owner'));
   if(url.endsWith('/readyz'))return ready();
   if(url.endsWith('/begin'))return ok({challenge:String(++begins).repeat(43)});
   if(url.endsWith('/issue'))return ok({ticket:'synthetic-ticket'});
   if(url.endsWith('/accept'))return ok({user:{id:'owner'}});
   assert.fail('Unexpected request');},...options});
 return {auth,calls,get refreshes(){return refreshes;}};
}

test('explicit HA selects ready issuer before a single begin/issue/accept, EU endpoints stay fixed',async()=>{
 const f=setup(url=>url===A+'/readyz'?new Response('',{status:503}):null);
 await f.auth.useExisting();assert.equal(f.refreshes,1);
 assert.deepEqual(f.calls.map(c=>c.url),[A+'/auth/me',A+'/readyz',B+'/readyz',EU+'/experiment/bp2-session/begin',B+'/experiment/bp2-session/issue',EU+'/experiment/bp2-session/accept']);
 assert(f.calls.every(c=>c.init.credentials==='include'&&c.init.redirect==='error'));
 assert.equal(f.calls.filter(c=>c.init.method==='POST').length,3);assert(f.auth.mayRead());
 for(const c of f.calls.filter(c=>c.url.endsWith('/issue')||c.url.endsWith('/accept')))assert.equal(JSON.parse(c.init.body).expectedActorId,'owner');
});

test('legacy mode remains default and does not contact A/B at all',async()=>{
 const f=setup(null,{sharedIssuerMode:undefined});await f.auth.useExisting();
 assert.deepEqual(f.calls.map(c=>c.url),['begin','issue','accept'].map((p,i)=>(i===1?L:EU)+'/experiment/bp2-session/'+p));
 assert(f.calls.every(c=>!Object.hasOwn(JSON.parse(c.init.body),'expectedActorId')));
 assert.throws(()=>setup(null,{sharedIssuerMode:'https://evil.invalid'}),{code:'bp2-auth-destination'});
});

test('session/ready denials stop without fallback, bridge POSTs or legacy identity search',async()=>{
 for(const status of [401,403])for(const route of ['/auth/me','/readyz']){
  const f=setup(url=>url===A+route?new Response('denied',{status}):null);
  await assert.rejects(()=>f.auth.useExisting(),{code:'shared_session_missing'});
  assert(!f.calls.some(c=>c.url.startsWith(B)||c.url.startsWith(L)||c.init.method==='POST'));
 }
});

test('anonymous HA may promote legacy once; no session on either side causes no issue',async()=>{
 let reads=0;
 const f=setup(url=>{
  if(url===A+'/auth/me')return ++reads===1?ok({user:null,session:null}):ok(user('owner'));
  if(url===L+'/auth/me')return ok(user('owner'));
 });
 await f.auth.useExisting();await f.auth.useExisting();
 assert.equal(f.calls.filter(c=>c.url===L+'/auth/me').length,1);
 const absent=setup(url=>url.endsWith('/auth/me')?ok({user:null,session:null}):null);
 await assert.rejects(()=>absent.auth.useExisting(),{code:'shared_session_missing'});
 await assert.rejects(()=>absent.auth.useExisting(),{code:'shared_session_missing'});
 assert.equal(absent.calls.filter(c=>c.url===L+'/auth/me').length,1);
 assert(!absent.calls.some(c=>c.init.method==='POST'));
});

test('ambiguous issue never retries, and a manual next attempt receives a fresh challenge',async()=>{
 let lost=true;
 const f=setup(url=>{if(url.endsWith('/issue')&&lost){lost=false;throw new TypeError('response lost');}});
 await assert.rejects(()=>f.auth.useExisting());
 assert.equal(f.calls.filter(c=>c.url.endsWith('/issue')).length,1);
 assert(!f.calls.some(c=>c.url.endsWith('/accept')));
 await f.auth.useExisting({explicit:true});
 const issues=f.calls.filter(c=>c.url.endsWith('/issue'));
 assert.equal(issues.length,2);assert.notEqual(JSON.parse(issues[0].init.body).challenge,JSON.parse(issues[1].init.body).challenge);
 assert(issues.every(c=>c.url===A+'/experiment/bp2-session/issue'));
});

test('lost accept blocks local data and no other endpoint is tried; changed actor remains blocked',async()=>{
 for(const mismatch of [false,true]){
  const f=setup(url=>{if(url.endsWith('/accept')){if(mismatch)return ok({user:{id:'different'}});throw new TypeError('response lost');}});
  await assert.rejects(()=>f.auth.useExisting());assert(!f.auth.mayRead());assert.equal(f.refreshes,0);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/accept')).length,1);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/issue')).length,1);
 }
});

test('ready transport timeout can select B; invalid readiness fails closed',async()=>{
 const calls=[],select=createBp2IssuerSelector({readTimeoutMs:5,fetchImpl:async(url,init)=>{
  calls.push(url);if(url.endsWith('/auth/me'))return ok(user('owner'));
  if(url===A+'/readyz')return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
  return ready();}});
 assert.equal((await select()).base,B+'/experiment/bp2-session');
 assert.deepEqual(calls,[A+'/auth/me',A+'/readyz',B+'/readyz']);
 const f=setup(url=>url.endsWith('/readyz')?ok({service:'other',database:'ready'}):null);
 await assert.rejects(()=>f.auth.useExisting(),{code:'bp2-auth-unconfirmed'});assert.equal(f.calls.length,2);
});

test('disposal during readiness stops before any POST',async()=>{
 let started;const waiting=new Promise(r=>started=r);
 const f=setup((url,init)=>{if(url.endsWith('/readyz')){started();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));}});
 const work=f.auth.useExisting();await waiting;f.auth.dispose();await assert.rejects(()=>work);
 assert(!f.calls.some(c=>c.init.method==='POST'));assert.equal(f.refreshes,0);
});
