import {EXPERIMENT_API_BASE} from '../config/constants.js';
import {magicLinkTokenFromInput} from '../auth/magic-link-confirmation.js';
import {profileDisplayNameRequest} from '../ui/profile-settings.js';
import {createBp2IssuerSelector} from './shared-session-issuer.js';

export const BP2_AUTH_BLOCK_KEY='bp2-experiment-auth-block-v1';
const error=code=>Object.assign(new Error(code),{code});

// Both approved API hosts proxy to the same existing Auth. Match the selected
// API host so a new host-only session cookie can reach subsequent data requests.
// Importing the legacy transport here would also import its old write queues.
export function createPersonalAppAuth({fetchImpl=globalThis.fetch,storage=globalThis.localStorage,
  locks=globalThis.navigator?.locks,timeoutMs=8000,requestLinkTimeoutMs=30000,onInvalidate=()=>{},onSignedIn=()=>{},authBaseUrl=EXPERIMENT_API_BASE,sharedIssuerMode='legacy'}={}) {
  if(![EXPERIMENT_API_BASE,'https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api'].includes(authBaseUrl))throw error('bp2-auth-destination');
  if(!['legacy','ha'].includes(sharedIssuerMode))throw error('bp2-auth-destination');
  const selectIssuer=sharedIssuerMode==='ha'?createBp2IssuerSelector({fetchImpl,readTimeoutMs:Math.min(timeoutMs,2500)}):null;
  let busy=false,closed=false,controller=null,locallyBlocked=false;
  function mayRead() {try{return !closed&&!busy&&!locallyBlocked&&storage.getItem(BP2_AUTH_BLOCK_KEY)===null;}catch{return false;}}
  function block() {
    locallyBlocked=true;
    onInvalidate();
    try{storage.setItem(BP2_AUTH_BLOCK_KEY,'1');}catch{throw error('bp2-auth-storage-unavailable');}
  }
  async function request(url,options,waitMs=timeoutMs) {
    controller=new AbortController();let timer;
    try {
      const result=await Promise.race([
        fetchImpl(url,{credentials:'include',cache:'no-store',redirect:'error',
          signal:controller.signal,headers:{'Content-Type':'application/json'},...options}).then(async response=>({response,data:await response.json()})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(error('bp2-auth-unconfirmed'));},waitMs);})
      ]);
      if(closed)throw error('bp2-auth-closed');
      if(!result.response.ok||result.data?.ok!==true) {
        const code=result.data?.code;
        throw error(['magic_link_used','magic_link_expired','magic_link_invalid','shared_session_missing','shared_session_account_differs'].includes(code)?code:'bp2-auth-unconfirmed');
      }
      return result.data;
    } finally {clearTimeout(timer);controller=null;}
  }
  const post=(path,body,base=authBaseUrl+'/auth',waitMs=timeoutMs)=>request(base+'/'+path,{method:'POST',body:JSON.stringify(body)},waitMs);
  async function profileUser(actorId){
    if(closed||locallyBlocked||storage.getItem(BP2_AUTH_BLOCK_KEY)!==null)throw error('bp2-auth-signed-out');
    const data=await request(authBaseUrl+'/auth/me',{method:'GET'});
    if(!actorId||data.user?.id!==actorId)throw error('bp2-profile-account-changed');
    return data.user;
  }
  async function exclusive(work,{mutatesSession=false}={}) {
    if(closed||busy)throw error('bp2-auth-busy');busy=true;
    try {
      const run=async()=>{if(closed)throw error('bp2-auth-closed');return work();};
      return mutatesSession&&locks?await locks.request('bp2-experiment-auth-transition',run):await run();
    }finally{busy=false;}
  }
  return Object.freeze({
    mayRead,busy:()=>busy,
    readProfile(actorId){return exclusive(()=>profileUser(actorId),{mutatesSession:true});},
    saveProfile(actorId,value,isCurrent=()=>true){return exclusive(async()=>{
      await profileUser(actorId);
      if(!isCurrent())throw error('bp2-profile-account-changed');
      const data=await request(authBaseUrl+'/auth/me',profileDisplayNameRequest(value));
      if(data.user?.id!==actorId)throw error('bp2-profile-account-changed');
      return data.user;
    },{mutatesSession:true});},
    async useExisting({explicit=false}={}) {
      if(!explicit&&!mayRead())return false; // Never undo an explicit logout on bootstrap.
      await exclusive(async()=>{
        // Recheck after acquiring the cross-tab lock: another tab may have logged out.
        if(!explicit&&(locallyBlocked||storage.getItem(BP2_AUTH_BLOCK_KEY)!==null))throw error('bp2-auth-signed-out');
        if(authBaseUrl===EXPERIMENT_API_BASE)throw error('bp2-auth-destination');
        if(explicit)block();else onInvalidate();
        let selected;
        if(selectIssuer){
          controller=new AbortController();
          try{selected=await selectIssuer({signal:controller.signal});}finally{controller=null;}
          if(closed)throw error('bp2-auth-closed');
        }
        const target='https://api-eu.vniipo-help.ru/experiment/bp2-session';
        const start=await post('begin',{},target);
        if(typeof start.challenge!=='string'||!/^[\w-]{43}$/.test(start.challenge))throw error('bp2-auth-unconfirmed');
        const expected=selected?{expectedActorId:selected.actorId}:{};
        const issued=await post('issue',{challenge:start.challenge,...expected},selected?.base||'https://api.vniipo-help.ru/experiment/bp2-session');
        if(typeof issued.ticket!=='string'||issued.ticket.length>8192)throw error('bp2-auth-unconfirmed');
        block();
        const accepted=await post('accept',{ticket:issued.ticket,explicit,...expected},target);
        if(typeof accepted.user?.id!=='string'||!accepted.user.id)throw error('bp2-auth-unconfirmed');
        if(selected&&accepted.user.id!==selected.actorId)throw error('shared_session_account_differs');
        storage.removeItem(BP2_AUTH_BLOCK_KEY);locallyBlocked=false;
      },{mutatesSession:true});
      if(!closed&&mayRead())await onSignedIn();
      return true;
    },
    requestLink(email,returnUrl,{deliveryChannel='auto'}={}) {
      return exclusive(async()=>{
        if(!['auto','primary','backup'].includes(deliveryChannel))throw error('bp2-auth-mail-channel');
        const url=new URL(returnUrl);
        if(url.origin!=='https://experiment.vniipo-help.ru'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw error('bp2-auth-return-url');
        url.search='';url.hash='';
        if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email.trim())||email.length>254)throw error('bp2-auth-email-required');
        // SMTP acceptance may take longer than a session lookup. Keep one
        // bounded request; losing its response must never resend the email.
        try {
          const data=await post('request-magic-link',{email:email.trim(),language:'ru',redirectUrl:url.href,
            ...(deliveryChannel==='auto'?{}:{deliveryChannel})},authBaseUrl+'/auth',requestLinkTimeoutMs);
          // Legacy success without metadata remains valid, but cannot offer an alternate.
          return Object.freeze({deliveryChannel:['primary','backup'].includes(data.deliveryChannel)?data.deliveryChannel:null,
            availableDeliveryChannels:Object.freeze(Array.isArray(data.availableDeliveryChannels)
              ?[...new Set(data.availableDeliveryChannels.filter(c=>['primary','backup'].includes(c)))]:[])});
        }
        catch(e){if(e?.code==='bp2-auth-unconfirmed'||e?.name==='AbortError'||e instanceof TypeError)throw error('bp2-auth-mail-unconfirmed');throw e;}
      });
    },
    async verify(input) {
      const token=magicLinkTokenFromInput(input);
      if(!token)throw error('bp2-auth-token-required');
      await exclusive(async()=>{
        block();
        const data=await post('verify-magic-link',{token});
        if(typeof data.user?.id!=='string'||!data.user.id)throw error('bp2-auth-unconfirmed');
        try{storage.removeItem(BP2_AUTH_BLOCK_KEY);}catch{throw error('bp2-auth-storage-unavailable');}
        locallyBlocked=false;
      },{mutatesSession:true});
      if(!closed&&mayRead())await onSignedIn(); // Always rediscover identity/scopes on the server.
    },
    logout(){return exclusive(async()=>{block();await post('logout',{});},{mutatesSession:true});},
    dispose(){closed=true;controller?.abort();onInvalidate();}
  });
}

export function personalAuthMessage(e) {
  return ({'bp2-auth-token-required':'Вставьте ссылку или код из письма.',
    'bp2-auth-mail-unconfirmed':'Не удалось подтвердить отправку. Письмо могло уже уйти: проверьте входящие и спам. Если оно пришло, нажмите «Уже есть ссылка или код?». Автоматически повторно письмо не отправляется.',
    'bp2-auth-email-required':'Введите адрес электронной почты.',
    'magic_link_used':'Эта ссылка уже использована. Запросите новую.',
    'magic_link_expired':'Срок действия ссылки истёк. Запросите новую.',
    'magic_link_invalid':'Ссылка недействительна. Запросите новую.',
    'bp2-auth-storage-unavailable':'Не удалось сохранить состояние входа на устройстве. Данные остаются скрыты.',
    'shared_session_missing':'В этом браузере нет действующего общего входа. После входа в основной Bikepacking нажмите «Использовать общий вход».',
    'shared_session_account_differs':'Здесь открыт другой аккаунт. Для перехода нажмите «Использовать общий вход».',
    'bp2-auth-signed-out':'Вы вышли из аккаунта. Для входа нажмите «Использовать общий вход».',
    'bp2-auth-busy':'Дождитесь завершения предыдущего запроса.'})[e?.code]
    ||'Сервер не подтвердил результат. Проверьте соединение и повторите вход. При действующей общей сессии используйте «Использовать общий вход».';
}
