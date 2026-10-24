import {readEntryToken,createEntryConfirmation} from './auth-entry-client.js';

export function mountAuthEntry({config,document,location,history,fetch=globalThis.fetch,
  afterConfirmed,validateDestination,lifecycle=globalThis.window}) {
  const button=document.querySelector('[data-confirm-entry]');
  const status=document.querySelector('[data-entry-status]');
  const back=document.querySelector('[data-entry-back]');
  back.href=location.origin+'/';
  let token;
  try { token=readEntryToken(location.hash); }
  catch(error){status.textContent=error.message;button.disabled=true;}
  // Remove the code before any navigation. Keep it only in this page's memory.
  history.replaceState(null,'',location.pathname);
  if(!config.enabled){status.textContent='Резервный вход ещё не включён. Вернитесь в приложение и запросите обычную ссылку.';button.disabled=true;return;}
  if(!token)return;
  const controller=new AbortController();
  const dispose=()=>{
    controller.abort();token='';button.disabled=true;button.onclick=null;
    lifecycle?.removeEventListener('pagehide',dispose);
  };
  lifecycle?.addEventListener('pagehide',dispose,{once:true});
  const confirm=createEntryConfirmation({...config,fetch,origin:location.origin,
    afterConfirmed,validateDestination,signal:controller.signal});
  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;status.textContent='Проверяем ссылку входа…';
    const confirmation=confirm(token);token='';
    try {
      const target=await confirmation;
      if(controller.signal.aborted)return;
      dispose();location.replace(target);
    }
    catch(error){
      if(controller.signal.aborted)return;
      dispose();
      status.textContent=error.code==='auth_write_outcome_unknown'
        ? 'Ответ сервера не получен. Вход мог завершиться. Вернитесь в приложение и проверьте его; повторно эта ссылка не отправлялась.'
        : error.code==='auth_unavailable'
          ? 'Оба сервера входа сейчас недоступны. Вернитесь в приложение и попробуйте позже.'
          : error.message;
    }
  };
  return dispose;
}
