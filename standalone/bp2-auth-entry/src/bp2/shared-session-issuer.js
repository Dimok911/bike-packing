import {createSharedAuthFetch} from '../auth/shared-auth-fetch.js';
import {AUTH_HA_CONFIG} from '../auth/auth-ha-config.js';
const fail=code=>Object.assign(new Error(code),{code});
const temporary=new Set([502,503,504]);

export function createBp2IssuerSelector({fetchImpl=globalThis.fetch,readTimeoutMs=2500}={}){
 if(!Number.isFinite(readTimeoutMs)||readTimeoutMs<1||readTimeoutMs>2500)throw fail('bp2-auth-destination');
 let activeSignal=null,busy=false;
 // Also guard the shared helper's legacy promotion read before dispatch.
 const guardedFetch=(url,options)=>{
  if(activeSignal?.aborted)throw activeSignal.reason||fail('bp2-auth-closed');
  return fetchImpl(url,options);
 };
 const sharedAuthFetch=createSharedAuthFetch({fetchImpl:guardedFetch,
  config:{...AUTH_HA_CONFIG,enabled:true,timeoutMs:readTimeoutMs}});
 async function ready(base,signal){
  const controller=new AbortController();let timer;
  const abort=()=>controller.abort(signal.reason||fail('bp2-auth-closed'));
  signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)abort();
   const cancelled=new Promise((_,reject)=>{
    const rejectAbort=()=>reject(controller.signal.reason);
    if(controller.signal.aborted)rejectAbort();else controller.signal.addEventListener('abort',rejectAbort,{once:true});
    timer=setTimeout(()=>controller.abort(fail('bp2-issuer-read-timeout')),readTimeoutMs);
   });
   const result=await Promise.race([cancelled,(async()=>{
    if(controller.signal.aborted)throw controller.signal.reason;
    const response=await fetchImpl(base+'/readyz',{method:'GET',credentials:'include',cache:'no-store',redirect:'error',
      headers:{Accept:'application/json'},signal:controller.signal});
    // An HTML/slow denial must remain final, not become a transport failover.
    if(response.status!==200)return {status:response.status};
    return {status:200,data:await response.json()};
   })()]);
   return result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
 }
 return async function select({signal}={}){
  if(busy)throw fail('bp2-auth-busy');busy=true;activeSignal=signal;
  try{
   if(signal?.aborted)throw signal.reason||fail('bp2-auth-closed');
   const response=await sharedAuthFetch(AUTH_HA_CONFIG.legacyOrigin+'/auth/me',{method:'GET',signal});
   if(signal?.aborted)throw signal.reason||fail('bp2-auth-closed');
   if([401,403].includes(response.status))throw fail('shared_session_missing');
   if(response.status!==200)throw fail('bp2-auth-unconfirmed');
   const data=await response.json();
   if(data?.ok!==true)throw fail('bp2-auth-unconfirmed');
   if(!data.user)throw fail('shared_session_missing');
   if(typeof data.user.id!=='string'||!data.user.id||!Number.isFinite(Date.parse(data.session?.expiresAt))
     ||Date.parse(data.session.expiresAt)<=Date.now())throw fail('bp2-auth-unconfirmed');
   for(const base of AUTH_HA_CONFIG.endpoints){
    let result;
    try{result=await ready(base,signal);}
    catch(error){
     if(signal?.aborted)throw signal.reason||error;
     if(error instanceof TypeError||error?.code==='bp2-issuer-read-timeout')continue;
     throw fail('bp2-auth-unconfirmed');
    }
    if(temporary.has(result.status))continue;
    if([401,403].includes(result.status))throw fail('shared_session_missing');
    if(result.status!==200||result.data?.ok!==true||result.data.service!=='vniipo-auth'||result.data.database!=='ready')throw fail('bp2-auth-unconfirmed');
    return {base:base+'/experiment/bp2-session',actorId:data.user.id};
   }
   throw fail('bp2-auth-unconfirmed');
  }finally{busy=false;activeSignal=null;}
 };
}
