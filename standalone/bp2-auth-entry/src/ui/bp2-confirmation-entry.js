import {mountAuthEntry} from '../auth/auth-entry-page.js';
import {AUTH_HA_CONFIG} from '../auth/auth-ha-config.js';
import {createBp2EntryHandoff,validateBp2EntryDestination} from '../bp2/entry-session-handoff.js';

export const BP2_CONFIRMATION_ENTRY_CONFIG=Object.freeze({enabled:false,endpoints:AUTH_HA_CONFIG.endpoints,timeoutMs:2500});

// Dedicated page bootstrap; does not load the personal UI, journals or old writers.
export function mountBp2ConfirmationEntry({config=BP2_CONFIRMATION_ENTRY_CONFIG,document:doc=globalThis.document,
 location=globalThis.location,history=globalThis.history,lifecycle=globalThis.window,fetchImpl=globalThis.fetch,
 storage=globalThis.localStorage,locks=globalThis.navigator?.locks}={}){
 const status=doc.querySelector('[data-entry-status]'),actions=doc.querySelector('[data-bp2-entry-actions]'),
  confirm=doc.querySelector('[data-bp2-confirm-account]'),retry=doc.querySelector('[data-bp2-retry]'),cancel=doc.querySelector('[data-bp2-cancel]');
 let disposed=false,disposeEntry;
 const reset=()=>{actions.hidden=true;confirm.hidden=true;retry.hidden=true;confirm.disabled=true;retry.disabled=true;};
 reset();
 const hook=createBp2EntryHandoff({fetchImpl,storage,locks,onState:({phase})=>{
  if(disposed)return;reset();
  if(phase==='working')status.textContent='Завершаем вход…';
  if(phase==='needs-account-confirmation'){
   status.textContent='В Experiment открыт другой аккаунт. Перейти в аккаунт, подтверждённый по ссылке?';
   actions.hidden=false;confirm.hidden=false;confirm.disabled=false;
  }
  if(phase==='outcome-unknown'){
   status.textContent='Ответ сервера не получен. Вход мог завершиться. Нажмите «Продолжить вход», чтобы проверить.';
   actions.hidden=false;retry.hidden=false;retry.disabled=false;
  }
 }});
 const confirmClick=()=>{if(!disposed)hook.confirmAccountChange();};
 const retryClick=()=>{if(!disposed)hook.retry();};
 function dispose(){
  if(disposed)return;disposed=true;disposeEntry?.();hook.dispose();reset();
  confirm.removeEventListener('click',confirmClick);retry.removeEventListener('click',retryClick);cancel.removeEventListener('click',cancelClick);
  lifecycle?.removeEventListener('pagehide',dispose);
 }
 const cancelClick=()=>{dispose();status.textContent='Вход отменён. Можно вернуться в приложение.';};
 confirm.addEventListener('click',confirmClick);retry.addEventListener('click',retryClick);cancel.addEventListener('click',cancelClick);
 lifecycle?.addEventListener('pagehide',dispose,{once:true});
 const afterConfirmed=async(...args)=>{
  try{return await hook.afterConfirmed(...args);}
  catch(error){
   const messages={
    'bp2-entry-actor-changed':'Аккаунт изменился в другой вкладке. Вернитесь в приложение и начните вход заново.',
    'shared_session_missing':'Сессия входа недоступна. Вернитесь в приложение и запросите новую ссылку.',
    'bp2-auth-storage-unavailable':'Браузер не разрешает сохранить состояние входа. Проверьте настройки хранения данных для этого сайта.',
   };
   throw Object.assign(new Error(messages[error.code]||'Не удалось завершить вход. Вернитесь в приложение и попробуйте ещё раз.'),{code:error.code});
  }
 };
 disposeEntry=mountAuthEntry({config,document:doc,location,history,lifecycle,fetch:fetchImpl,
  afterConfirmed,validateDestination:validateBp2EntryDestination});
 return dispose;
}
