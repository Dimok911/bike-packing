import {createAuthFailoverClient} from './auth-failover-client.js';
import {AUTH_HA_CONFIG} from './auth-ha-config.js';
const operationByRoute=new Map([
 ['GET /auth/me','session'],['POST /auth/request-magic-link','requestMagicLink'],
 ['POST /auth/verify-magic-link','confirmMagicLink'],['POST /auth/logout','logout'],
 ['POST /auth/video-handoff','videoHandoff'],['POST /auth/vdoc-handoff','vdocHandoff'],['PATCH /auth/me','profile'],
]);
const messageByCode={auth_unavailable:'Сервис входа временно недоступен. Текущий вход не сброшен.',
 auth_write_outcome_unknown:'Ответ сервера не получен. Запрос повторно не отправлялся. Проверьте почту или состояние входа.',
 auth_migration_unavailable:'Не удалось проверить прежний вход. Попробуйте позже.',
 auth_invalid_response:'Сервис входа вернул некорректный ответ.'};

export function createSharedAuthFetch({config=AUTH_HA_CONFIG,fetchImpl=globalThis.fetch,onState=()=>{}}={}){
 const client=config.enabled?createAuthFailoverClient({endpoints:config.endpoints,fetch:fetchImpl,timeoutMs:config.timeoutMs,mutationTimeoutMs:config.mutationTimeoutMs,mailTimeoutMs:config.mailTimeoutMs,onState}):null;
 let migration, established=false;
 async function checkLegacy(){
  // Read the old host once so its existing HttpOnly cookie can be promoted.
  // Failure is not logout. A valid HA session still works when old Auth is down.
  try{
   const response=await fetchImpl(config.legacyOrigin+'/auth/me',{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(config.timeoutMs)});
   if(!response.ok)return {known:false};
   const data=await response.json();
   return {known:data?.ok===true&&Object.hasOwn(data,'user'),user:data?.user||null};
  }catch{return {known:false};}
 }
 return async function authFetch(input,options={}){
  const url=new URL(String(input),globalThis.location?.href||'https://ovik-doc.info/');
  const route=url.pathname.replace(/^\/letters-vniipo\/api\/auth(?=\/|$)/,'/auth');
  const operation=operationByRoute.get((options.method||'GET').toUpperCase()+' '+route);
  if(!client||url.origin!==config.legacyOrigin||!operation)return fetchImpl(input,options);
  if(url.search||url.hash)throw Error('Unexpected Auth request parameters');
  try{
   let session;
   if(operation==='session'||operation==='vdocHandoff'||operation==='videoHandoff'){
    session=await client.request('session',undefined,{signal:options.signal});
    if(session.status===200&&session.payload.user)established=true;
    else if(session.status===200&&!established){
     migration??=checkLegacy();const legacy=await migration;
     if(legacy.user){session=await client.request('session',undefined,{signal:options.signal});if(session.status===200&&session.payload.user)established=true;}
     if(session.status===200&&!session.payload.user&&(legacy.known!==true||legacy.user)){
      const error=Error('auth_migration_unavailable');error.code='auth_migration_unavailable';throw error;
     }
    }
   }
   const result=operation==='session'?session:await client.request(operation,options.body===undefined?undefined:JSON.parse(options.body),{signal:options.signal});
   // Explicit successful login/logout supersedes any legacy observation.
   if(result.status===200&&(operation==='logout'||operation==='confirmMagicLink')){established=true;migration=Promise.resolve({known:true,user:null});}
   return new Response(JSON.stringify(result.payload||{ok:false}),{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch(error){if(messageByCode[error.code])error.message=messageByCode[error.code];throw error;}
 };
}
export const sharedAuthFetch=createSharedAuthFetch();
