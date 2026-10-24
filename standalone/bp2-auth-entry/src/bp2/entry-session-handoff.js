import {createBp2IssuerSelector} from './shared-session-issuer.js';
import {BP2_AUTH_BLOCK_KEY} from './personal-app-auth.js';
const EU='https://api-eu.vniipo-help.ru/experiment/bp2-session';
const fail=code=>Object.assign(new Error(code),{code});
export function validateBp2EntryDestination(value){
 return ['https://experiment.vniipo-help.ru/','https://experiment.vniipo-help.ru/bp2-personal/'].includes(String(value));
}
function identity(value){
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=191;
 if(!value||Object.keys(value).sort().join(',')!=='session,user'
  ||!value.user||Object.keys(value.user).join(',')!=='id'||!id(value.user.id)
  ||!value.session||Object.keys(value.session).join(',')!=='id'||!id(value.session.id))throw fail('bp2-entry-invalid-identity');
 return {actorId:value.user.id,sessionId:value.session.id};
}

// Headless afterConfirmed hook. The existing entry UI owns explicit retry /
// account confirmation buttons. This controller never verifies a token or navigates.
export function createBp2EntryHandoff({fetchImpl=globalThis.fetch,storage=globalThis.localStorage,locks=globalThis.navigator?.locks,timeoutMs=8000,onState=()=>{}}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>8000)throw fail('bp2-entry-invalid-timeout');
 const select=createBp2IssuerSelector({fetchImpl,readTimeoutMs:Math.min(timeoutMs,2500)}),controller=new AbortController();
 let phase='idle',binding=null,promise,resolve,reject,detach=()=>{},closed=false;
 const emit=(next,code)=>{phase=next;try{onState(Object.freeze({phase,...(code?{code}:{})}));}catch{}};
 function finish(error){
  if(closed)return;closed=true;detach();controller.abort();
  if(error){emit('error',error.code||'bp2-entry-unconfirmed');reject?.(error);}
  else{emit('complete');resolve();}
 }
 function cancel(){finish(fail('bp2-entry-cancelled'));}
 async function post(base,action,body){
  if(closed||controller.signal.aborted)throw fail('bp2-entry-cancelled');
  const request=new AbortController();let timer;
  const abort=()=>request.abort(fail('bp2-entry-cancelled'));
  controller.signal.addEventListener('abort',abort,{once:true});
  try{
   const cancelled=new Promise((_,stop)=>{
    request.signal.addEventListener('abort',()=>stop(request.signal.reason),{once:true});
    timer=setTimeout(()=>request.abort(fail('bp2-entry-outcome-unknown')),timeoutMs);
   });
   return await Promise.race([cancelled,(async()=>{
    let response,data;
    try{response=await fetchImpl(base+'/'+action,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:request.signal});}
    catch{throw fail('bp2-entry-outcome-unknown');}
    if([401,403].includes(response.status))throw fail('shared_session_missing');
    if(response.status>=500)throw fail('bp2-entry-outcome-unknown');
    try{data=await response.json();}catch{throw fail('bp2-entry-outcome-unknown');}
    if(response.status===409&&action==='accept'&&data?.code==='shared_session_account_differs')throw fail('shared_session_account_differs');
    if(response.status===409&&data?.code==='shared_session_actor_changed')throw fail('bp2-entry-actor-changed');
    if(response.status!==200||data?.ok!==true)throw fail('bp2-entry-unconfirmed');
    return data;
   })()]);
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);request.abort();}
 }
 async function run(explicit){
  emit('working');
  try{
   const transfer=async()=>{
   if(closed)return;
   const selected=await select({signal:controller.signal});if(closed)return;
   if(selected.actorId!==binding.actorId)throw fail('bp2-entry-actor-changed');
   const begun=await post(EU,'begin',{});if(closed)return;
   if(typeof begun.challenge!=='string'||!/^[\w-]{43}$/.test(begun.challenge))throw fail('bp2-entry-unconfirmed');
   const issued=await post(selected.base,'issue',{challenge:begun.challenge,expectedActorId:binding.actorId});if(closed)return;
   if(typeof issued.ticket!=='string'||!issued.ticket||issued.ticket.length>8192)throw fail('bp2-entry-unconfirmed');
   const accepted=await post(EU,'accept',{ticket:issued.ticket,explicit,expectedActorId:binding.actorId});if(closed)return;
   if(accepted.user?.id!==binding.actorId)throw fail('bp2-entry-actor-changed');
   // The successful verify is an explicit new sign-in. Clear only the local
   // logout fence, and only after EU identity is confirmed. No token is stored.
   try{storage.removeItem(BP2_AUTH_BLOCK_KEY);}catch{throw fail('bp2-auth-storage-unavailable');}
   finish();
   };
   // Use the same cross-tab lock as ordinary BP2 sign-in/logout, but never
   // retain it while waiting for a user's retry or account confirmation.
   if(locks)await locks.request('bp2-experiment-auth-transition',{signal:controller.signal},transfer);
   else await transfer();
  }catch(error){
   if(closed)return;
   if(error.code==='shared_session_account_differs'){emit('needs-account-confirmation',error.code);return;}
   if(error.code==='bp2-entry-outcome-unknown'){emit('outcome-unknown',error.code);return;}
   finish(error);
  }
 }
 function afterConfirmed(verified,{destination,signal}={}){
  let current;
  try{current=identity(verified);if(!validateBp2EntryDestination(destination))throw fail('bp2-entry-destination');}
  catch(error){return Promise.reject(error);}
  if(promise){
   if(binding.actorId!==current.actorId||binding.sessionId!==current.sessionId||binding.destination!==String(destination))return Promise.reject(fail('bp2-entry-identity-changed'));
   return promise;
  }
  if(closed)return Promise.reject(fail('bp2-entry-cancelled'));
  binding={...current,destination:String(destination)};
  promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  if(signal?.aborted)cancel();else{
   signal?.addEventListener('abort',cancel,{once:true});detach=()=>signal?.removeEventListener('abort',cancel);
   void run(false);
  }
  return promise;
 }
 return Object.freeze({afterConfirmed,state:()=>phase,
  retry(){if(closed||phase!=='outcome-unknown')return false;void run(false);return true;},
  confirmAccountChange(){if(closed||phase!=='needs-account-confirmation')return false;void run(true);return true;},
  cancel,dispose:cancel});
}
