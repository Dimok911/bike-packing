// Adds only the alternate-delivery action; existing forms and handlers stay owned by the application.
export function mountMailChannelRetry({form,email,send,document:doc=form.ownerDocument,className='',label=()=> 'Письмо не пришло — отправить другим способом',cooldownMs=30000,now=Date.now}){
 const button=doc.createElement('button');button.type='button';button.className=className;button.hidden=true;button.textContent=label();form.append(button);
 let channel=null,target='',readyAt=0,pending=false,timer;
 const normalized=()=>email.value.trim().toLowerCase();
 const reset=()=>{clearTimeout(timer);channel=null;target='';button.hidden=true;button.disabled=true;};
 const paint=()=>{button.textContent=label();button.hidden=!channel;button.disabled=pending||now()<readyAt;};
 email.addEventListener('input',reset);
 button.onclick=()=>{if(pending||!channel||target!==normalized()||now()<readyAt)return;void send(channel);};
 return {
  begin(){if(pending)return false;pending=true;paint();return true;},
  accepted(result,sentEmail){
   reset();if(String(sentEmail).trim().toLowerCase()!==normalized())return;
   const other=result?.deliveryChannel==='primary'?'backup':result?.deliveryChannel==='backup'?'primary':null;
   if(!other||!result.availableDeliveryChannels?.includes(other))return;
   channel=other;target=normalized();readyAt=now()+cooldownMs;paint();timer=setTimeout(paint,cooldownMs);
  },
  finish(){pending=false;paint();},reset,
  destroy(){reset();email.removeEventListener('input',reset);button.remove();}
 };
}
