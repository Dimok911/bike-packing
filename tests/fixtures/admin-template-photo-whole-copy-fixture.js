import { randomUUID } from "node:crypto";
import { projectAdminTemplateCopy } from "../../src/sync/admin-template-copy-projection.js";

export const clone = structuredClone;
export function wholeCopyFixture() {
  const sourceListId = "public-demo-state-whole-source", targetListId = "public-shared-layout-whole-target", operationId = randomUUID();
  const original = (key, aliases = false) => ({ ...(aliases ? { photoId: key } : { id: key, photoId: key }), listId: sourceListId,
    status: "synced", ...(aliases ? { urls: { original: `https://legacy.example/${key}.png`, thumb: `https://legacy.example/${key}-thumb.png` } }
      : { url: `/letters-vniipo/api/bike-packing/lists/${sourceListId}/photos/${key}/file`, thumbUrl: `/letters-vniipo/api/bike-packing/lists/${sourceListId}/photos/${key}/thumb` }),
    createdAt: "2024-01-02T03:04:05Z", updatedAt: null });
  const container = (id, parentId, childIds, itemIds) => ({ id, name: id, parentId, childIds, itemIds,
    order: [...itemIds.map(id => ({type:"item",id})), ...childIds.map(id => ({type:"container",id}))],
    note: "Keep original note", createdAt: "2023-12-01T00:00:00Z", opaque: { owner: id, sequence: [3,1,2] } });
  const item = (id, containerId, quantity, availabilityStatus) => ({ id, name: id, containerId, quantity, availabilityStatus,
    updatedAt: "2024-01-01T00:00:00Z", opaque: { untouched: "a-root" } });
  const containers = {
    "z-free": {...container("z-free", null, [], []), photos: []},
    "detached-child": container("detached-child", "detached-root", [], []),
    "b-root": container("b-root", "", [], ["item-b"]),
    "a-child": container("a-child", "a-root", [], ["item-nested"]),
    "detached-root": {...container("detached-root", "", ["detached-child"], ["item-detached"]), photos:[original("photo-detached",true)]},
    "a-root": {...container("a-root", "", ["a-child"], ["item-a"]), photos:[original("photo-a-1"),original("photo-a-2")]}
  };
  const items = { "item-unplaced": {...item("item-unplaced","",9,"reserved"),photos:[original("photo-unplaced")]},
    "item-b":item("item-b","b-root",2,"bought"), "item-detached":item("item-detached","detached-root",5,"unavailable"),
    "item-a":item("item-a","a-root",4,"unavailable"), "item-nested":{...item("item-nested","a-child",3,"available"),photos:[original("photo-nested")]} };
  const p = (id,parent,children,members) => ({ id, parentId:parent, childIds:children, itemIds:members,
    order:[...children.map(id=>({type:"container",id,opaqueOrder:"retained"})),...members.map(id=>({type:"item",id}))],
    opaquePlacement: { separateFromRaw:true } });
  const arrangement = { rootContainerIds:["b-root","a-root"],
    containers:{"b-root":p("b-root","",["a-child"],["item-b"]),"a-child":p("a-child","b-root",[],["item-nested"]),"a-root":p("a-root","",[],["item-a"])},
    items:{"item-a":"a-root","item-b":"b-root","item-nested":"a-child"}, itemQuantities:{"item-a":1,"item-b":2,"item-nested":3},
    packedItems:{"item-a":false,"item-b":true,"item-nested":true}, opaqueArrangement:{ photoRecoveryMarker:"keep", order:[9,1] } };
  const sourcePayload = {activeLayoutId:"source-layout",items,containers, locations:["Raw place"],categories:["Raw category"],
    packedItems:{"item-unplaced":true,"item-a":false},opaqueTop:{ idLookingString:"a-root", list:["item-a"] },
    layouts:{"source-layout":{id:"source-layout",name:"Old name",note:"Original layout",language:"en",rootContainerIds:["b-root","a-root"],arrangement,
      locations:["Distinct layout mirror"],categories:["Distinct category mirror"],opaqueLayout:{keep:true},adminDemo:true}}};
  const f = {sourcePayload,sourceListId,targetListId,operationId,metadata:{title:"Whole copy",description:"Complete catalog",language:"ru"}};
  return refreshOwners(f);
}

export function refreshOwners(f) {
  const projected = projectAdminTemplateCopy(f.sourcePayload,f.operationId,f.metadata);
  let index=0;
  f.owners=["containers","items"].flatMap(type=>Object.keys(f.sourcePayload[type]).sort().map((sourceEntityId,ownerIndex)=>({
    entityType:type==="items"?"item":"container",sourceEntityId,entityId:Object.keys(projected[type])[ownerIndex],
    photos:(f.sourcePayload[type][sourceEntityId].photos||[]).map(reference=>{
      const sourcePhotoId=reference.id??reference.photoId, photoId=`new-photo-${++index}`;
      return {sourcePhotoId,photo:{id:photoId,photoId,assetId:randomUUID(),listId:f.targetListId,status:"synced",
        url:`/letters-vniipo/api/bike-packing/lists/${f.targetListId}/photos/${photoId}/file`,
        thumbUrl:`/letters-vniipo/api/bike-packing/lists/${f.targetListId}/photos/${photoId}/thumb`,fileName:"Original.png",type:"image/png",size:42,width:1,height:1,
        ...Object.fromEntries(["createdAt","updatedAt"].filter(key=>Object.hasOwn(reference,key)).map(key=>[key,reference[key]]))}};
    })
  })));
  return f;
}
