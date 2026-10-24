import {createAuthFailoverClient} from './auth-failover-client.js';

export function readEntryToken(hash) {
  const values = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const token = values.get('token') || '';
  if (values.getAll('token').length !== 1 || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    throw Error('Ссылка входа неполная. Запросите новую ссылку.');
  }
  return token;
}

export function entryDestination(value, origin) {
  const url = new URL(value || '/', origin);
  if (url.origin !== origin || url.username || url.password || !['https:','http:'].includes(url.protocol)) {
    return origin + '/';
  }
  return url.href;
}

export function createEntryConfirmation({endpoints, timeoutMs, fetch, origin, allowLoopbackHttp=false,
  afterConfirmed, validateDestination, signal}) {
  const client=createAuthFailoverClient({endpoints,timeoutMs,fetch,allowLoopbackHttp});
  let attempt;
  // Repeated clicks share the same attempt. An uncertain POST must not be replayed.
  return token => attempt ??= (async()=>{
    signal?.throwIfAborted();
    let result;
    try { result=await client.request('confirmMagicLink',{token},{signal}); }
    finally { token=''; }
    signal?.throwIfAborted();
    if(result.status!==200) {
      const messages={magic_link_used:'Эта ссылка уже использована. Вернитесь в приложение или запросите новую.',
        magic_link_expired:'Срок ссылки истёк. Запросите новую ссылку.',magic_link_invalid:'Ссылка недействительна. Запросите новую ссылку.'};
      throw Error(messages[result.payload?.code] || 'Не удалось подтвердить вход. Попробуйте получить новую ссылку.');
    }
    const {user,session}=result.payload;
    if(result.payload.ok!==true || typeof user?.id!=='string' || !user.id.trim() ||
      typeof session?.id!=='string' || !session.id.trim())throw Error('Не удалось подтвердить сессию.');
    // Restricted consumers validate the original target, before the generic
    // same-origin fallback could conceal an invalid external destination.
    if(validateDestination && validateDestination(result.payload.redirectPath)!==true) {
      throw Error('Переход в приложение не разрешён.');
    }
    const destination=entryDestination(result.payload.redirectPath,origin);
    const verified=Object.freeze({user:Object.freeze({id:user.id}),session:Object.freeze({id:session.id})});
    // The application may finish its session bridge here. No token or other
    // response fields cross this boundary, and the hook cannot change the URL.
    await afterConfirmed?.(verified,Object.freeze({destination,signal}));
    signal?.throwIfAborted();
    return destination;
  })();
}
