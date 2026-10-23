import test from 'node:test';
import assert from 'node:assert/strict';
test('Bike browser preserves the signed-in session, leaves data routes alone and never replays mail',async()=>{
 const original=globalThis.fetch,win=globalThis.window;
 const calls=[];let mode='session';
 globalThis.window={setTimeout,clearTimeout};
 globalThis.fetch=async(url,o={})=>{
  calls.push({url:String(url),method:o.method||'GET'});
  if(String(url).includes('auth-a.api.'))throw TypeError('offline');
  if(String(url).endsWith('/readyz'))return Response.json({ok:true,service:'vniipo-auth',database:'ready'});
  if(mode==='mail'&&o.method==='POST')throw TypeError('reply lost');
  return Response.json({ok:true,user:{id:'existing'},session:{id:'existing-session'}});
 };
 try{
  const {apiFetchRequest}=await import('../../src/sync/api-client.js');
  assert.equal((await apiFetchRequest('/auth/me')).session.id,'existing-session');
  assert(calls.some(c=>c.url.startsWith('https://auth-b.api.')));
  assert(!calls.some(c=>c.url.startsWith('https://api.vniipo-help.ru/auth')));
  await apiFetchRequest('/bike-packing/lists');assert.equal(calls.at(-1).url,'https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists');
  mode='mail';await assert.rejects(apiFetchRequest('/auth/request-magic-link',{method:'POST',body:JSON.stringify({email:'reader@example.invalid'})}),e=>e.cause?.code==='auth_write_outcome_unknown');
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
 }finally{globalThis.fetch=original;globalThis.window=win;}
});
