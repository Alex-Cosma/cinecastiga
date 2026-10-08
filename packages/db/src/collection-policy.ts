export const COLLECTION_STREAMS=['da','tenders','awards','documents','catalogue'] as const;
export type CollectionStream=typeof COLLECTION_STREAMS[number];
export interface CollectionSettings {revision:number;minSeconds:number;maxSeconds:number;dailyLimit:number|null;processingTime:string;paused:boolean;pausedStreams:string[]}
export function validateCollectionSettings(value:unknown):Omit<CollectionSettings,'paused'|'pausedStreams'>{
 const v=value as Record<string,unknown>;
 if(!v||typeof v!=='object'||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw Error('Versiunea setărilor lipsește. Reîncarcă pagina.');
 if(!Number.isInteger(v.minSeconds)||!Number.isInteger(v.maxSeconds)||Number(v.minSeconds)<1||Number(v.maxSeconds)>3600||Number(v.minSeconds)>Number(v.maxSeconds))throw Error('Intervalul trebuie să fie între 1 și 3.600 secunde, cu minimum ≤ maximum.');
 if(v.dailyLimit!==null&&(!Number.isSafeInteger(v.dailyLimit)||Number(v.dailyLimit)<1||Number(v.dailyLimit)>10_000_000))throw Error('Limita zilnică trebuie să fie între 1 și 10.000.000 de cereri.');
 if(typeof v.processingTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.processingTime))throw Error('Ora procesării nu este validă.');
 return {revision:Number(v.revision),minSeconds:Number(v.minSeconds),maxSeconds:Number(v.maxSeconds),dailyLimit:v.dailyLimit as number|null,processingTime:v.processingTime};
}
/** Only search identifiers/filters, never credentials, URLs, free text, headers or payload records. */
export function safeCollectionParameters(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object')return {};
 const out:Record<string,unknown>={};
 const allowed=['pageIndex','pageSize','skip','take','contractingAuthorityId','caNoticeId','cNoticeId','rfqInvitationId','pcNoticeId','dcNoticeId','noticeId','noticeLotId','dfNoticeId','initNoticeId','sysNoticeTypeId','sysNoticeTypeIds','finalizationDateStart','finalizationDateEnd','startPublicationDate','endPublicationDate'];
 for(const key of allowed){const v=(value as Record<string,unknown>)[key];if(v===null||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(?:[T\d:.+Z-]*)$/.test(v)||Array.isArray(v)&&v.length<20&&v.every(x=>Number.isSafeInteger(x)))out[key]=v;}
 if(typeof (value as Record<string,unknown>).isNoticeChange==='boolean')out.isNoticeChange=(value as Record<string,unknown>).isNoticeChange;
 return out;
}
export function safeCollectionEndpoint(url:string){
 const path=new URL(url,'https://www.e-licitatie.ro').pathname;
 if(path.startsWith('/api-pub/files/noticedoc/'))return '/api-pub/files/noticedoc/{fișier}';
 // Public notice UI modules are used for bounded API discovery through the same request budget.
 if(/^\/views\/pub\/(?:notices|sad)\/[\w/-]+(?:\.min)?\.js$/.test(path))return path.slice(0,300);
 if(!/^\/(api-pub|pub)\/[\w/.-]+$/.test(path))throw Error('Endpoint SEAP neacceptat.');
 return path.slice(0,300);
}
export function retryAfterSeconds(value:string|null,now=Date.now()):number|null{
 if(!value)return null;const numeric=Number(value),secs=Number.isFinite(numeric)?numeric:(Date.parse(value)-now)/1000;
 return Number.isFinite(secs)&&secs>=0?Math.min(30*86400,Math.ceil(secs)):null;
}
