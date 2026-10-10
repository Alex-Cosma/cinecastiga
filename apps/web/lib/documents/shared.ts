export type DocumentNotice = { key:string; noticeId:string; noticeType:number; noticeNo:string; title:string; url:string };
export type FileJob = {id:string; status:string; stage:string; pagesDone:number; pagesTotal:number|null; error:string|null; position:number};
export type ContractFile = {id:string; code:string; filename:string; publishedAt:string|null; originalHash:string|null; pdfHash:string|null; downloadedAt:string|null; processedAt:string|null; pageCount:number|null; signature:string|null; job:FileJob|null};
export type ContractFiles = {notice:DocumentNotice|null; checkedAt:string|null; total:number|null; files:ContractFile[]; job:FileJob|null; requestCount:number; enabled:boolean};
export type DocumentPage = {page:number; text:string; method:string};
export const stageLabel:Record<string,string>={process_queued:'Descărcat · așteaptă procesarea',rate_limit:'Așteaptă conexiunea SEAP',queued:'În așteptare',source:'Se verifică sursa',list:'Se citește lista de fișiere',download:'Se descarcă originalul',extract:'Se pregătește PDF-ul',text:'Se extrage textul',ocr:'Se citesc paginile scanate',complete:'Pregătit pentru citire și căutare',failed:'Operațiunea nu s-a încheiat'};
export const foldText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');
export function textMatches(text:string,query:string):boolean { return foldText(text).includes(foldText(query.trim())); }
export function validQuote(text:string,quote:unknown):quote is string { return typeof quote==='string' && quote.trim().length>=3 && quote.length<=8000 && text.includes(quote); }
export function safeFileUrl(url:string):string {
 const u=new URL(url,'https://www.e-licitatie.ro/');
 if(!['https://www.e-licitatie.ro','https://e-licitatie.ro'].includes(u.origin)||!/^\/api-pub\/files\/noticedoc\/[a-f0-9]{32}$/i.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('Adresă de fișier SEAP neacceptată.');
 u.hostname='www.e-licitatie.ro';return u.href;
}
