import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyFixture, clone } from "../fixtures/admin-template-photo-whole-copy-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { projectAdminTemplateCopy } from "../../src/sync/admin-template-copy-projection.js";
import { adminTemplatePhotoWholeCopySourceInventory as inventory, projectAdminTemplatePhotoWholeCopyPayload as project,
  ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_PROJECTION_LIMITS as limits } from "../../src/sync/admin-template-photo-whole-copy-projection.js";
const inspect=f=>inventory({payload:f.sourcePayload,listId:f.sourceListId});
const mapped=(f,id)=>f.owners.find(owner=>owner.sourceEntityId===id).entityId;
const flat=f=>f.owners.flatMap(owner=>owner.photos);
const fails=(f,part)=>assert.throws(()=>project(f), part ? error=>error.code===`admin-template-photo-whole-copy-${part}` : undefined);

test("complete sorted inventory includes two placed roots, detached forest, unplaced and photo-free owners",()=>{
  const f=wholeCopyFixture(),before=clone(f),value=inspect(f);
  assert.equal(value.layoutId,"source-layout");assert.equal(value.owners.length,11);assert.equal(value.photoCount,5);
  assert.deepEqual(value.owners.map(row=>row.sourceEntityId),["a-child","a-root","b-root","detached-child","detached-root","z-free","item-a","item-b","item-detached","item-nested","item-unplaced"]);
  assert.equal(value.owners.filter(row=>!row.photos.length).length,7);
  assert.deepEqual(value.owners.find(row=>row.sourceEntityId==="a-root").photos.map(row=>row.sourcePhotoId),["photo-a-1","photo-a-2"]);
  assert.deepEqual(value.owners.find(row=>row.sourceEntityId==="detached-root").photos[0].reference,f.sourcePayload.containers["detached-root"].photos[0]);
  assert.ok(Object.isFrozen(value.owners[1].photos[0].reference));assert.deepEqual(f,before);
});

test("projection is the existing whole-template conversion with only complete photo arrays replaced",()=>{
  const f=wholeCopyFixture(),before=clone(f),expected=projectAdminTemplateCopy(f.sourcePayload,f.operationId,f.metadata),actual=project(f);
  for(const owner of f.owners){const type=owner.entityType==="item"?"items":"containers";
    if(Object.hasOwn(f.sourcePayload[type][owner.sourceEntityId],"photos"))expected[type][owner.entityId].photos=clone(owner.photos.map(row=>row.photo));}
  assert.deepEqual(actual,expected);assert.deepEqual(f,before);assert.deepEqual(project(f),actual);
  assert.equal(actual.activeLayoutId,`layout-${f.operationId}`);assert.equal(actual.layouts[actual.activeLayoutId].name,"Whole copy");
  assert.equal(Object.hasOwn(actual.layouts[actual.activeLayoutId],"adminDemo"),false);
  assert.equal(Object.hasOwn(actual.items[mapped(f,"item-b")],"photos"),false);
  assert.deepEqual(actual.containers[mapped(f,"z-free")].photos,[]);
  assert.deepEqual(actual.opaqueTop,f.sourcePayload.opaqueTop);
  assert.deepEqual(actual.layouts[actual.activeLayoutId].locations,["Distinct layout mirror"]);
  assert.ok(Object.isFrozen(actual.items[mapped(f,"item-unplaced")].photos[0]));
});

test("raw forest and arrangement remain different while statuses, quantities, packing and both root orders survive",()=>{
  const f=wholeCopyFixture(),actual=project(f),a=actual.layouts[actual.activeLayoutId].arrangement;
  assert.equal(actual.containers[mapped(f,"a-child")].parentId,mapped(f,"a-root"));
  assert.equal(a.containers[mapped(f,"a-child")].parentId,mapped(f,"b-root"));
  assert.deepEqual(a.rootContainerIds,[mapped(f,"b-root"),mapped(f,"a-root")]);
  assert.deepEqual(actual.layouts[actual.activeLayoutId].rootContainerIds,a.rootContainerIds);
  assert.equal(actual.items[mapped(f,"item-a")].availabilityStatus,"unavailable");
  assert.equal(actual.items[mapped(f,"item-b")].availabilityStatus,"bought");
  assert.equal(actual.items[mapped(f,"item-a")].quantity,4);assert.equal(a.itemQuantities[mapped(f,"item-a")],1);
  assert.deepEqual(actual.packedItems,{[mapped(f,"item-a")]:false,[mapped(f,"item-b")]:true,[mapped(f,"item-nested")]:true});
  assert.equal(Object.hasOwn(actual.packedItems,mapped(f,"item-unplaced")),false,"existing projector chooses arrangement packed state");
  assert.equal(actual.containers[mapped(f,"detached-child")].parentId,mapped(f,"detached-root"));
  assert.equal(actual.items[mapped(f,"item-unplaced")].containerId,"");
  assert.deepEqual(a.opaqueArrangement,{photoRecoveryMarker:"keep",order:[9,1]});
  assert.equal(a.containers[mapped(f,"b-root")].order[0].opaqueOrder,"retained");
});

test("raw aliases, duplicate membership, dangling links and cycles reject before projection",()=>{
  for(const mutate of [
    p=>p.containers["a-child"].parentContainerId="a-root",p=>p.items["item-a"].parentId="a-root",
    p=>p.containers["a-root"].childIds.push("a-child"),p=>p.containers["a-child"].parentId="missing",
    p=>p.items["item-unplaced"].containerId="missing",p=>p.containers["a-root"].itemIds.push("item-b"),
    p=>{p.containers["a-root"].parentId="a-child";p.containers["a-child"].childIds=["a-root"];p.containers["a-child"].order.push({type:"container",id:"a-root"});},
    p=>p.containers["a-child"].order=[]
  ]){const f=wholeCopyFixture();mutate(f.sourcePayload);assert.throws(()=>inspect(f));}
});

test("arrangement separately rejects orphan placements, cycles, duplicate membership and malformed packing",()=>{
  for(const mutate of [
    a=>a.rootContainerIds.reverse(),a=>a.containers["a-child"].parentId="a-root",a=>a.containers["b-root"].childIds.push("b-root"),
    a=>a.containers["a-root"].itemIds.push("item-b"),a=>a.items["item-unplaced"]="a-root",a=>a.itemQuantities["item-a"]=0,
    a=>a.packedItems["item-unplaced"]=true,a=>a.packedItems["item-a"]="true",a=>a.containers["ghost"]={parentId:"",childIds:[],itemIds:[],order:[]}
  ]){const f=wholeCopyFixture();mutate(f.sourcePayload.layouts["source-layout"].arrangement);assert.throws(()=>inspect(f));}
});

test("single-layout raw inventory rejects cross-type IDs, hidden photos, cross-list refs and unsupported photo metadata",()=>{
  for(const mutate of [
    p=>p.layouts.second={...clone(p.layouts["source-layout"]),id:"second"},p=>p.activeLayoutId="foreign",
    p=>p.sharedLayoutsIndex=[],p=>p.items["a-root"]={id:"a-root",containerId:""},p=>p.items["item-a"].id="different",
    p=>p.opaqueTop.photos=[clone(p.containers["a-root"].photos[0])],p=>p.containers["a-root"].photos[0].listId="public-demo-state-foreign",
    p=>p.containers["a-root"].photos[0].url=p.containers["a-root"].photos[0].url.replace("whole-source","foreign"),
    p=>p.containers["a-root"].photos[1]=clone(p.containers["a-root"].photos[0]),p=>p.containers["a-root"].photos[0].secretUnknown="not dropped"
  ]){const f=wholeCopyFixture();mutate(f.sourcePayload);assert.throws(()=>inspect(f));}
  const f=wholeCopyFixture();f.sourcePayload.containers["a-root"].photos[0].unsupported={preserve:true};
  assert.throws(()=>inspect(f),error=>error.code==="admin-template-photo-copy-unsupported-photo-metadata");
});

test("every derived owner and photo-free owner must occur once in exact order and every source photo retains order",()=>{
  for(const mutate of [f=>f.owners.pop(),f=>f.owners.push(clone(f.owners[0])),f=>f.owners.reverse(),f=>f.owners[0].entityId="wrong",
    f=>f.owners.find(row=>row.sourceEntityId==="a-root").photos.reverse(),f=>f.owners.find(row=>row.sourceEntityId==="a-root").photos.pop(),
    f=>f.owners[0].photos.push(clone(flat(f)[0])),f=>f.owners[0].entityType="item"
  ]){const f=wholeCopyFixture();mutate(f);fails(f);}
});

test("new layout and owner IDs cannot collide with any original raw collection",()=>{
  for(const type of ["items","containers","layouts"]){const f=wholeCopyFixture(),key=`layout-${f.operationId}`;
    if(type==="items")f.sourcePayload.items[key]={id:key,containerId:""};
    if(type==="containers")f.sourcePayload.containers[key]={id:key,parentId:"",childIds:[],itemIds:[],order:[]};
    if(type==="layouts"){f.sourcePayload.layouts[key]=f.sourcePayload.layouts["source-layout"];delete f.sourcePayload.layouts["source-layout"];f.sourcePayload.layouts[key].id=key;f.sourcePayload.activeLayoutId=key;}
    fails(f,"collision");}
  const f=wholeCopyFixture(),key=`template-copy-${f.operationId}-c-0`;f.sourcePayload.items[key]={id:key,containerId:""};fails(f,"collision");
  const action=wholeCopyFixture();action.sourcePayload.containers["a-root"].photos[0].assetId=action.operationId;fails(action,"collision");
});

test("new photo and asset allocations are globally disjoint from source IDs, action and other allocations",()=>{
  for(const mutate of [
    f=>{flat(f)[0].photo.id=flat(f)[0].photo.photoId="item-unplaced";},
    f=>{flat(f)[0].photo.id=flat(f)[0].photo.photoId="photo-a-1";},
    f=>{flat(f)[0].photo.id=flat(f)[0].photo.photoId=f.owners[0].entityId;},
    f=>{flat(f)[0].photo.assetId=f.operationId;},f=>{flat(f)[1].photo.assetId=flat(f)[0].photo.assetId;},
    f=>{flat(f)[1].photo.id=flat(f)[1].photo.photoId=flat(f)[0].photo.assetId;},
    f=>{f.sourcePayload.containers["a-root"].photos[0].assetId=flat(f)[0].photo.assetId;}
  ]){const f=wholeCopyFixture();mutate(f);fails(f,"projected-photo");}
});

test("canonical target references require exact list/photo routes, supported metadata and preserved source dates",()=>{
  for(const mutate of [f=>f.targetListId=f.sourceListId,f=>f.metadata.title=" padded ",f=>f.metadata.language="fr",f=>f.metadata.description=" padded "]){
    const f=wholeCopyFixture();mutate(f);fails(f,"projection");}
  const ordinaryText=wholeCopyFixture();ordinaryText.metadata.description="constructor";
  assert.equal(project(ordinaryText).layouts[`layout-${ordinaryText.operationId}`].note,"constructor");
  for(const mutate of [p=>p.url="//api.vniipo-help.ru/letters-vniipo/api"+p.url.slice("/letters-vniipo/api".length),
    p=>p.url="https://foreign.example"+p.url,p=>p.thumbUrl+="?token=fake",p=>p.listId="public-demo-state-foreign",p=>p.fileUrl=p.url,
    p=>p.fileName="../unsafe.png",p=>p.size=0,p=>p.width=-1,p=>p.createdAt="2025-01-01T00:00:00Z",p=>delete p.updatedAt,
    p=>p.photoId="wrong",p=>p.type="application/octet-stream"
  ]){const f=wholeCopyFixture();mutate(flat(f)[0].photo);fails(f,"projected-photo");}
  for(const base of ["https://api.vniipo-help.ru/experiment/letters-vniipo/api","https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api"]){
    const f=wholeCopyFixture();for(const row of flat(f))for(const key of ["url","thumbUrl"])row.photo[key]=row.photo[key].replace("/letters-vniipo/api",base);assert.ok(project(f));}
});

test("complete owner and photo limits include detached and unplaced records while fileless copies stay on existing projection",()=>{
  const f=wholeCopyFixture();for(let i=11;i<100;i++)f.sourcePayload.items[`free-${i}`]={id:`free-${i}`,containerId:""};
  assert.equal(inspect(f).owners.length,100);f.sourcePayload.items.tooMany={id:"tooMany",containerId:""};assert.throws(()=>inspect(f));
  const photos=wholeCopyFixture(),row=photos.sourcePayload.items["item-unplaced"];
  for(let i=5;i<50;i++){const photo=clone(row.photos[0]);photo.id=photo.photoId=`extra-${i}`;photo.url=`https://legacy.example/extra-${i}.png`;photo.thumbUrl=photo.url;row.photos.push(photo);}
  assert.equal(inspect(photos).photoCount,50);const extra=clone(row.photos[0]);extra.id=extra.photoId="extra-50";extra.url=extra.thumbUrl="https://legacy.example/extra-50.png";row.photos.push(extra);assert.throws(()=>inspect(photos));
  const empty=wholeCopyFixture();for(const type of ["items","containers"])for(const owner of Object.values(empty.sourcePayload[type]))delete owner.photos;
  assert.throws(()=>inspect(empty));assert.ok(projectAdminTemplateCopy(empty.sourcePayload,empty.operationId,empty.metadata));
});

test("raw and arrangement forest depth are bounded independently",()=>{
  for(const kind of ["raw","arrangement"]){
    const f=wholeCopyFixture(),a=f.sourcePayload.layouts["source-layout"].arrangement;let parent=kind==="raw"?"detached-child":"a-child";
    const add=key=>{
      f.sourcePayload.containers[key]={id:key,parentId:kind==="raw"?parent:"",childIds:[],itemIds:[],order:[]};
      if(kind==="arrangement")a.containers[key]={parentId:parent,childIds:[],itemIds:[],order:[]};
      const row=(kind==="raw"?f.sourcePayload.containers:a.containers)[parent];row.childIds.push(key);row.order.push({type:"container",id:key});parent=key;
    };
    for(let i=2;i<32;i++)add(`depth-${i}`);
    assert.equal(inspect(f).owners.length,41);add("tooDeep");assert.throws(()=>inspect(f));
  }
});

test("UTF-8 source byte limit is exact and malformed JSON cannot be normalized into a valid copy",()=>{
  const f=wholeCopyFixture();f.sourcePayload.padding="";const initial=Buffer.byteLength(canonical(f.sourcePayload));
  const remaining=limits.sourceBytes-initial;f.sourcePayload.padding="я".repeat(Math.floor(remaining/2))+(remaining%2?"x":"");
  assert.equal(Buffer.byteLength(canonical(f.sourcePayload)),limits.sourceBytes);assert.equal(inspect(f).photoCount,5);
  f.sourcePayload.padding+="x";assert.throws(()=>inspect(f));
  for(const value of [undefined,NaN,new Date()]){const changed=wholeCopyFixture();changed.sourcePayload.opaqueTop.bad=value;assert.throws(()=>inspect(changed));}
});

test("returned inventory and projection detach input; later tampering is revalidated and ordinary unknown fields are retained",()=>{
  const f=wholeCopyFixture(),value=inspect(f),projected=project(f),before=clone(projected),refBefore=clone(value.owners[1].photos[0].reference);
  f.sourcePayload.containers["a-root"].photos[0].url="https://legacy.example/later.png";
  f.sourcePayload.opaqueTop.list.push("later");flat(f)[0].photo.fileName="Later.png";
  assert.deepEqual(value.owners[1].photos[0].reference,refBefore);assert.deepEqual(projected,before);
  f.sourcePayload.containers["a-root"].photos[0].unsupported="reject";assert.throws(()=>project(f));
  assert.throws(()=>value.owners.push({}),TypeError);assert.throws(()=>projected.opaqueTop.list.push("bad"),TypeError);
});
