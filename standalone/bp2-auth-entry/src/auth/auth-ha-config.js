// Vendored shared transport stays disabled globally. Only the explicit BP2
// issuer adapter creates an enabled instance; publishing this file is not activation.
export const AUTH_HA_CONFIG=Object.freeze({enabled:false,legacyOrigin:'https://api.vniipo-help.ru',
 endpoints:Object.freeze(['https://auth-a.api.vniipo-help.ru','https://auth-b.api.vniipo-help.ru']),
 timeoutMs:2500,mutationTimeoutMs:15000,mailTimeoutMs:60000});
