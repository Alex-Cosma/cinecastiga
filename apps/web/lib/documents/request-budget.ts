import type {DbSql} from '@seap/db';

export function validateDocumentRequestLimit(limit:number|undefined){
 if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1||limit>100))throw Error('Limita cererilor trebuie să fie între 1 și 100.');
}
/** Counts persisted attempts, so resuming the same job cannot reset its allowance. */
export async function assertDocumentRequestBudget(q:DbSql,jobId:string,limit:number|undefined){
 validateDocumentRequestLimit(limit);
 if(limit===undefined)return;
 const [row]=await q`select count(*)::int n from app.document_requests where job_id=${jobId}`;
 if(Number(row?.n??0)>=limit)throw Error(`SEAP: limita de ${limit} cereri pentru această operațiune a fost atinsă. Nu s-a trimis o cerere suplimentară.`);
}
