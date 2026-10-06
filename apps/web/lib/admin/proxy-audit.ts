/** Operator audit snapshots may predate the nested API format. Never break admin on an incomplete entry. */
export function proxyAuditText(after:unknown):string {
 if(!after||typeof after!=='object')return 'Configurația conexiunii SEAP a fost modificată.';
 const record=after as Record<string,unknown>;
 const value=record.proxies??record;
 if(!value||typeof value!=='object')return 'Configurația conexiunii SEAP a fost modificată.';
 const p=value as Record<string,unknown>;
 if(typeof p.enabled!=='boolean'||!Array.isArray(p.activeIds)||!p.activeIds.every(id=>typeof id==='string')||![p.min_seconds,p.max_seconds,p.requests_per_minute].every(n=>typeof n==='number'&&Number.isFinite(n)))return 'Configurația conexiunii SEAP a fost modificată.';
 return `Conexiune ${p.enabled?'prin proxy':'directă'}; ${p.activeIds.length} proxy-uri selectate; ${p.min_seconds}–${p.max_seconds} sec/IP; plafon ${p.requests_per_minute}/min.${typeof p.max_in_flight==='number'?` Maximum ${p.max_in_flight} cereri simultane.`:''}`;
}
