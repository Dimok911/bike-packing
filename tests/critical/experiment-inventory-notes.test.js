import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePersonalDictionaryMutation} from '../../src/sync/personal-dictionary-mutation.js';
import {preparePersonalPhotoFormAttachments} from '../../src/sync/personal-photo-form-plan.js';
import {encodePersonalPhotoFormRecord,decodePersonalPhotoFormRecord} from '../../src/sync/personal-photo-form-record.js';
import {compactItemForEntitySync,compactContainerForEntitySync} from '../../src/sync/serialize.js';

const fields={name:'Фонарь',note:'Проверить',noteHtml:'<strong>Проверить</strong>',stockQuantity:3,stockLocations:[{location:'Дом',quantity:0},{location:'Дача',quantity:3}],location:'Дом',quantity:1};
test('private dictionary mutations rename secondary stock places, merge quantities and preserve layout plans',()=>{
 const state={items:{lamp:{id:'lamp',...structuredClone(fields)}},containers:{},layouts:{trip:{arrangement:{itemQuantities:{lamp:8}}}},locations:['Дом','Дача'],customLocations:['Дом','Дача']};
 const before=structuredClone(state),r=preparePersonalDictionaryMutation(state,{type:'location',action:'delete',value:'Дача',fallback:'Дом',values:['Дом','Дача'],itemIds:['lamp'],containerIds:[]});
 assert.deepEqual(r.snapshot.items.lamp.stockLocations,[{location:'Дом',quantity:3}]);assert.equal(r.snapshot.items.lamp.stockQuantity,3);
 assert.deepEqual(r.intent.items,['lamp']);assert.deepEqual(r.snapshot.layouts,state.layouts);assert.deepEqual(state,before);
});
test('deleting a custom category never assigns a built-in preparation state as fallback',()=>{
 const state={items:{lamp:{id:'lamp',categories:['Custom'],category:'Custom'}},containers:{},layouts:{},categories:['Нужна починка','Custom']};
 const r=preparePersonalDictionaryMutation(state,{type:'category',action:'delete',value:'Custom',fallback:'',values:state.categories,itemIds:['lamp'],containerIds:[]});
 assert.deepEqual(r.snapshot.items.lamp.categories,[]);
});
test('personal photo form survives durable encode/decode with both note forms and independent inventory',async()=>{
 for(const entityType of ['item','container']) {
 const binding={environment:'bike-packing-experiment',actorId:'actor',listId:'list',scopeKey:'id:actor'},base={items:{},containers:{},layouts:{}};
 const selected=entityType==='item'?structuredClone(fields):{name:'Bag',note:fields.note,noteHtml:fields.noteHtml};
 const plan=preparePersonalPhotoFormAttachments({binding,snapshot:base,basePayload:base,baseStateRevision:1,entityType,entityId:'new-owner',baseEntityRevision:0,fields:selected,files:[{fileName:'new.png',file:new Blob(['original'],{type:'image/png'}),thumb:new Blob(['thumb'],{type:'image/png'})}]},{enabled:true});
 const action={...binding,operationId:plan.operationId,kind:'photos.mutate',generation:1,body:{...plan.body,causal:{dependsOn:[],reads:[]}}};
 const record=await encodePersonalPhotoFormRecord({binding,snapshot:plan.snapshot,files:plan.files,action});
 const saved=await decodePersonalPhotoFormRecord(record,binding,plan.operationId);assert.deepEqual(saved.action.body.fields,selected);
 const owner=saved.snapshot[entityType==='item'?'items':'containers']['new-owner'];assert.equal(owner.noteHtml,fields.noteHtml);
 if(entityType==='item'){assert.equal(owner.quantity,1);assert.equal(owner.stockQuantity,3);assert.deepEqual(owner.stockLocations,fields.stockLocations);}
 const compact=entityType==='item'?compactItemForEntitySync(owner):compactContainerForEntitySync(owner);assert.equal(compact.noteHtml,fields.noteHtml);
 const tampered=structuredClone(record);tampered.intentJson=tampered.intentJson.replace('Проверить','Подменено');await assert.rejects(()=>decodePersonalPhotoFormRecord(tampered,binding,plan.operationId));
 }
});
