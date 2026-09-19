import test from 'node:test';
import assert from 'node:assert/strict';
import { sameProtocolJson as same } from '../../src/sync/protocol-json-equality.js';
import { canonicalAccessJson as canonical } from '../../src/sync/personal-access-protocol.js';

test('complete JSON comparison matches canonical equality including key order and numeric keys', () => {
  const values = [null, false, true, 0, -0, 1, 1.5, '', 'я\n𠜎', [], {}, [0], {2:'two',10:'ten'},
    {b:[{z:1,a:null}],a:'x'}, {a:'x',b:[{a:null,z:1}]}, {normal:null}, JSON.parse('{"__proto__":2}')];
  for (const left of values) for (const right of values) assert.equal(same(left,right), canonical(left)===canonical(right));
  let seed=33;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  const value=depth=>depth===0?values[Math.floor(random()*11)]:random()<.5
    ?Array.from({length:Math.floor(random()*5)},()=>value(depth-1))
    :Object.fromEntries(Array.from({length:Math.floor(random()*5)},(_,i)=>['k'+i,value(depth-1)]).reverse());
  for(let i=0;i<1000;i++){const a=value(3),b=i%2?JSON.parse(canonical(a)):value(3);assert.equal(same(a,b),canonical(a)===canonical(b));}
});
test('warm comparison detects changed, added and removed journal fields without an identity memo', () => {
  const original={intent:{owners:Array.from({length:33},(_,i)=>({id:'photo-'+i,digest:'a'.repeat(64)}))},receipt:{state:'committed'}};
  const current=structuredClone(original);
  assert.equal(same(original,current),true);
  current.intent.owners[32].digest='b'.repeat(64);assert.equal(same(original,current),false);
  current.intent.owners[32].digest='a'.repeat(64);current.extra=1;assert.equal(same(original,current),false);
  delete current.extra;delete current.receipt.state;assert.equal(same(original,current),false);
  current.receipt.state='committed';assert.equal(same(original,current),true);
});
test('invalid values are rejected even behind an early mismatch or identical reference', () => {
  const cyclic={};cyclic.self=cyclic;
  for(const invalid of [undefined,NaN,Infinity,1n,()=>{},new Date(),new Array(2),cyclic,{a:undefined},Object.create(null)]){
    assert.throws(()=>same(invalid,invalid));assert.throws(()=>same({first:0},{first:1,last:invalid}));
  }
});
test('accessors retain serializer evaluation and rejection behavior', () => {
  let calls=0;const accessor={get a(){calls++;return {n:3};}};
  assert.equal(same(accessor,{a:{n:3}}),true);assert.equal(calls,2);
  const invalid={get a(){return undefined;}};assert.throws(()=>same(invalid,invalid));
});
test('large full record comparisons allocate no canonical JSON strings', () => {
  const left={binding:{actor:'actor'},intentJson:'x'.repeat(300000),snapshot:{photos:Array.from({length:33},(_,i)=>({id:i,path:'path/'+i}))}};
  const right=structuredClone(left),original=JSON.stringify;let calls=0;
  JSON.stringify=(...args)=>{calls++;return original(...args);};
  try{for(let i=0;i<60;i++)assert.equal(same(left,right),true);}finally{JSON.stringify=original;}
  assert.equal(calls,0);
});
