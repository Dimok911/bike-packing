import test from 'node:test';
import assert from 'node:assert/strict';
import {createBp2EntryHandoff,validateBp2EntryDestination} from '../../src/bp2/entry-session-handoff.js';
const destination='https://experiment.vniipo-help.ru/bp2-personal/';
const verified=Object.freeze({user:Object.freeze({id:'owner'}),session:Object.freeze({id:'session'})});
const ok=data=>Response.json({ok:true,...data});
const tick=()=>new Promise(r=>setImmediate(r));
async function until(test){for(let i=0;i<30;i++){if(test())return;await tick();}assert.fail('Expected state not reached');}
function setup(handler,options={}){
 const calls=[],states=[],removed=[];let begins=0;
 const hook=createBp2EntryHandoff({storage:{removeItem:key=>removed.push(key)},onState:s=>states.push(s),fetchImpl:async(url,init)=>{
  calls.push({url,init});const custom=await handler?.(url,init);if(custom)return custom;
  if(url.endsWith('/auth/me'))return ok({user:{id:'owner'},session:{id:'session',expiresAt:new Date(Date.now()+86400000).toISOString()}});
  if(url.endsWith('/readyz'))return ok({service:'vniipo-auth',database:'ready'});
  if(url.endsWith('/begin'))return ok({challenge:String(++begins).repeat(43)});
  if(url.endsWith('/issue')||url.endsWith('/accept'))assert.equal(JSON.parse(init.body).expectedActorId,'owner');
  if(url.endsWith('/issue'))return ok({ticket:'ticket'});
  if(url.endsWith('/accept'))return ok({user:{id:'owner'}});
  assert.fail('Unexpected request '+url);
 },...options});
 return {hook,calls,states,removed,start:signal=>hook.afterConfirmed(verified,{destination,signal})};
}

test('hook resolves only after EU accept and repeated calls share the same attempt without verify',async()=>{
 let accept;const f=setup(url=>url.endsWith('/accept')?new Promise(r=>accept=r):null);
 const pending=f.start();assert.equal(f.start(),pending);let finished=false;pending.then(()=>finished=true);
 await until(()=>accept);assert(!finished);assert.equal(f.hook.state(),'working');assert.deepEqual(f.removed,[]);
 accept(ok({user:{id:'owner'}}));await pending;assert.equal(f.hook.state(),'complete');
 assert.equal(f.calls.filter(c=>c.init.method==='POST').length,3);
 assert(!f.calls.some(c=>c.url.includes('verify-magic-link')||c.init.body?.includes('auth_token')));
 assert(!f.hook.retry());
 assert.deepEqual(f.removed,['bp2-experiment-auth-block-v1']);
});

test('destination allowlist and identity shape reject URL flags and token payloads before network',async()=>{
 assert(validateBp2EntryDestination('https://experiment.vniipo-help.ru/'));
 for(const target of ['https://evil.invalid/','https://experiment.vniipo-help.ru/bp2-personal/?authConfirmed=1',destination+'#token=secret','https://user@experiment.vniipo-help.ru/','/bp2-personal/','https://experiment.vniipo-help.ru/other/']){
  const f=setup();assert(!validateBp2EntryDestination(target));await assert.rejects(()=>f.hook.afterConfirmed(verified,{destination:target}));assert.equal(f.calls.length,0);
 }
 for(const payload of [{authConfirmed:true},{...verified,token:'secret'},{user:{id:'owner'},session:{}}]){
  const f=setup();await assert.rejects(()=>f.hook.afterConfirmed(payload,{destination}),{code:'bp2-entry-invalid-identity'});assert.equal(f.calls.length,0);
 }
});

test('current HA actor mismatch and denial stop before EU writes',async()=>{
 for(const reply of [()=>ok({user:{id:'other'},session:{expiresAt:new Date(Date.now()+86400000).toISOString()}}),()=>new Response('',{status:401}),()=>new Response('',{status:403})]){
  const f=setup(url=>url.endsWith('/auth/me')?reply():null);await assert.rejects(()=>f.start());
  assert(!f.calls.some(c=>c.init.method==='POST'));assert.equal(f.hook.state(),'error');assert.deepEqual(f.removed,[]);
 }
});

test('different EU account waits for explicit action, then uses a new challenge and never another verify',async()=>{
 let accepts=0;const f=setup((url,init)=>{
  if(url.endsWith('/accept')){accepts++;assert.equal(JSON.parse(init.body).explicit,accepts>1);if(accepts===1)return Response.json({ok:false,code:'shared_session_account_differs'},{status:409});}
 });
 const pending=f.start();let finished=false;pending.then(()=>finished=true);await until(()=>f.hook.state()==='needs-account-confirmation');
 assert(!finished);assert(!f.hook.retry());const before=f.calls.length;await tick();assert.equal(f.calls.length,before);
 assert(f.hook.confirmAccountChange());assert(!f.hook.confirmAccountChange());await pending;
 const issues=f.calls.filter(c=>c.url.endsWith('/issue'));assert.equal(issues.length,2);
 assert.notEqual(JSON.parse(issues[0].init.body).challenge,JSON.parse(issues[1].init.body).challenge);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/auth/me')).length,2);
});

test('lost POST response waits, manual retry starts new begin; no fallback/replay happens automatically',async()=>{
 for(const action of ['issue','accept']){
  let lost=false;const f=setup(url=>{if(url.endsWith('/'+action)&&!lost){lost=true;throw new TypeError('lost response');}});
  const pending=f.start();await until(()=>f.hook.state()==='outcome-unknown');
  const calls=f.calls.length;await tick();assert.equal(f.calls.length,calls);assert(!f.hook.confirmAccountChange());
  assert(f.hook.retry());assert(!f.hook.retry());await pending;
  assert.equal(f.calls.filter(c=>c.url.endsWith('/begin')).length,2);
  assert(!f.calls.some(c=>c.url.startsWith('https://auth-b.')||c.url.includes('verify-magic-link')));
 }
});

test('timeout ignores late accept and cancellation prevents completion/navigation permission',async()=>{
 let release;const f=setup(url=>url.endsWith('/accept')?new Promise(r=>release=r):null,{timeoutMs:10});
 const pending=f.start();await until(()=>release);await new Promise(r=>setTimeout(r,20));assert.equal(f.hook.state(),'outcome-unknown');
 release(ok({user:{id:'owner'}}));await tick();assert.equal(f.hook.state(),'outcome-unknown');
 f.hook.cancel();await assert.rejects(()=>pending,{code:'bp2-entry-cancelled'});assert.equal(f.hook.state(),'error');
});

test('pagehide abort during pending work or confirmation blocks late continuation',async()=>{
 const controller=new AbortController();let release;
 const f=setup(url=>url.endsWith('/begin')?new Promise(r=>release=r):null);
 const pending=f.start(controller.signal);await until(()=>release);controller.abort();await assert.rejects(()=>pending,{code:'bp2-entry-cancelled'});
 release(ok({challenge:'a'.repeat(43)}));await tick();assert(!f.calls.some(c=>c.url.endsWith('/issue')));
 const g=setup(url=>url.endsWith('/accept')?Response.json({ok:false,code:'shared_session_account_differs'},{status:409}):null);
 const work=g.start();await until(()=>g.hook.state()==='needs-account-confirmation');g.hook.dispose();await assert.rejects(()=>work);assert(!g.hook.confirmAccountChange());
});

test('changed HA actor after manual confirmation never replaces EU; changed accept actor never completes',async()=>{
 let reads=0;const f=setup(url=>{
  if(url.endsWith('/auth/me')&&++reads>1)return ok({user:{id:'other'},session:{expiresAt:new Date(Date.now()+86400000).toISOString()}});
  if(url.endsWith('/accept'))return Response.json({ok:false,code:'shared_session_account_differs'},{status:409});
 });
 const work=f.start();await until(()=>f.hook.state()==='needs-account-confirmation');f.hook.confirmAccountChange();await assert.rejects(()=>work,{code:'bp2-entry-actor-changed'});
 assert.equal(f.calls.filter(c=>c.url.endsWith('/accept')).length,1);
 const g=setup(url=>url.endsWith('/accept')?ok({user:{id:'other'}}):null);await assert.rejects(()=>g.start(),{code:'bp2-entry-actor-changed'});assert.equal(g.hook.state(),'error');
});

test('storage failure after EU accept blocks completion; a second verified identity cannot reuse the hook',async()=>{
 const f=setup(null,{storage:{removeItem:()=>{throw Error('quota');}}});
 await assert.rejects(()=>f.start(),{code:'bp2-auth-storage-unavailable'});assert.equal(f.hook.state(),'error');
 await assert.rejects(()=>f.hook.afterConfirmed({user:{id:'other'},session:{id:'other'}},{destination}),{code:'bp2-entry-identity-changed'});
 assert.equal(f.calls.filter(c=>c.url.endsWith('/accept')).length,1);
});

test('cross-tab lock delays all handoff requests and cancellation while queued prevents work',async()=>{
 let release;const f=setup(null,{locks:{request:async(name,options,work)=>{
  assert.equal(name,'bp2-experiment-auth-transition');assert(options.signal);
  await new Promise(r=>release=r);return work();
 }}});
 const pending=f.start();assert.equal(f.calls.length,0);f.hook.cancel();await assert.rejects(()=>pending,{code:'bp2-entry-cancelled'});
 release();await tick();assert.equal(f.calls.length,0);
});

test('server actor-race rejection never prompts to replace another EU account',async()=>{
 for(const action of ['issue','accept']){
  const f=setup((url,init)=>{if(url.endsWith('/'+action)){assert.equal(JSON.parse(init.body).expectedActorId,'owner');return Response.json({ok:false,code:'shared_session_actor_changed'},{status:409});}});
  await assert.rejects(()=>f.start(),{code:'bp2-entry-actor-changed'});assert.equal(f.hook.state(),'error');
  assert(!f.hook.confirmAccountChange());assert(!f.hook.retry());assert.deepEqual(f.removed,[]);
  if(action==='issue')assert(!f.calls.some(c=>c.url.endsWith('/accept')));
 }
});
