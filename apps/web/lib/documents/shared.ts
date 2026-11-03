import type {Classification} from './classification';
export type DocumentNotice = { key:string; noticeId:string; noticeType:number; noticeNo:string; title:string; url:string };
export type FileJob = {id:string; status:string; stage:string; pagesDone:number; pagesTotal:number|null; error:string|null; position:number;automatic?:boolean};
export type ContractFile = {id:string; code:string; filename:string; section:string; sourceType:string|null; publishedAt:string|null; originalHash:string|null; pdfHash:string|null; downloadedAt:string|null; processedAt:string|null; pageCount:number|null; signature:string|null; classification?:Classification; contents?:{name:string;firstPage?:number;pages?:number;rendition?:string;error?:string}[]|null; job:FileJob|null};
/** Files SEAP attaches to the award notice itself (documente constatatoare): their count, from the list once
 * it was read, before that from the award's detail as last collected; the list's job. */
export type AwardAttachments = {caNoticeId:string; count:number; checkedAt:string; listed:boolean; job:FileJob|null};
/** linked: one participation notice of a supported family; none: the procedure has none by law
 * (negociere fără publicare prealabilă); unlinked: no single notice matched. */
export type Participation = 'linked'|'none'|'unlinked';
export type ContractFiles = {notice:DocumentNotice|null; participation:Participation; award:AwardAttachments|null; checkedAt:string|null; inventory:number; total:number|null; files:ContractFile[]; job:FileJob|null; requestCount:number; enabled:boolean};
export type DocumentPage = {page:number; text:string; method:string};
export const stageLabel:Record<string,string>={specifications_only:'Disponibil la cerere · în afara colectării automate',process_queued:'Descărcat · așteaptă procesarea',rate_limit:'Așteaptă conexiunea SEAP',queued:'În așteptare',source:'Se verifică sursa',list:'Se citește lista de fișiere',download:'Se descarcă originalul',extract:'Se pregătește PDF-ul',text:'Se extrage textul',ocr:'Se citesc paginile scanate',complete:'Pregătit pentru citire și căutare',failed:'Operațiunea nu s-a încheiat'};
export const isActiveFileJob=(job:FileJob|null|undefined)=>!!job&&['queued','running'].includes(job.status)&&job.stage!=='specifications_only';
export const foldText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');
export function textMatches(text:string,query:string):boolean { return foldText(text).includes(foldText(query.trim())); }
export function validQuote(text:string,quote:unknown):quote is string { return typeof quote==='string' && quote.trim().length>=3 && quote.length<=8000 && text.includes(quote); }
/** Participation notice families whose files SEAP serves through the same two public routes (pilot,
 * 3 November 2026): the notice's public page (session and Referer), its documentation section and its
 * document list. 2 open tenders (CN), 17 simplified (SCN), 19 dynamic purchasing (RFD), 7 concessions (PC),
 * 12 requests for quotes (RFQ), 6 design contests (DC). */
export const NOTICE_VIEWS:Record<number,string>={2:'c-notice',17:'simplified-notice',19:'rfq-invitation',7:'pc-notice',12:'rfq-invitation',6:'dc-notice'};
export const DOCUMENT_NOTICE_TYPES=Object.keys(NOTICE_VIEWS).map(Number);
export const noticeViewUrl=(type:number,id:string|number)=>`https://www.e-licitatie.ro/pub/notices/${NOTICE_VIEWS[type]}/v2/view/${id}`;
/** The award notice's own documents (documente constatatoare): a source of type 3 keyed by the award, opened
 * on the award's public page, listed by api-pub/PUBLICAckDoc (pilot, 3 November 2026). */
export const AWARD_NOTICE_TYPE=3;
export const awardDocumentsKey=(caNoticeId:string|number)=>`ack:${caNoticeId}`;
export const awardViewUrl=(caNoticeId:string|number)=>`https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/${caNoticeId}`;
export function safeFileUrl(url:string):string {
 const u=new URL(url,'https://www.e-licitatie.ro/');
 if(!['https://www.e-licitatie.ro','https://e-licitatie.ro'].includes(u.origin)||!/^\/api-pub\/files\/noticedoc\/[a-f0-9]{32}$/i.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('Adresă de fișier SEAP neacceptată.');
 u.hostname='www.e-licitatie.ro';return u.href;
}

export const SIGNATURE_VERIFIED='Integritatea semnăturii verificată; încrederea și revocarea certificatului nu au fost verificate.';
export const SIGNATURE_UNVERIFIED='Verificarea criptografică a semnăturii a eșuat. Conținutul a fost extras fără validarea semnăturii; originalul P7S este păstrat.';
