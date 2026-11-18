import type {DbSql} from '@seap/db';
import {documentDb} from './store';

export type WithheldDocument={id:string;filename:string;hold:'held'|'kept';reason:string|null;page:number|null;at:string|null;hasPdf:boolean;noticeNo:string;noticeTitle:string;noticeUrl:string;decidedBy:string|null};
export type WithheldDocuments={waiting:number;kept:number;documents:WithheldDocument[]};
const LIST_LIMIT=200;

/** The documents not served: those waiting for a decision first, the newest first. */
export async function withheldDocuments(q:DbSql=documentDb()):Promise<WithheldDocuments>{
 const rows=await q`select d.id,d.filename,d.privacy_hold,d.privacy_reason,d.privacy_page,d.privacy_at,d.pdf_hash is not null has_pdf,d.privacy_decided_by,
   n.notice_no,n.title,n.url,count(*) filter (where d.privacy_hold='held') over() waiting,count(*) filter (where d.privacy_hold='kept') over() kept
  from app.procurement_documents d join app.document_notices n on n.key=d.notice_key
  where d.privacy_hold in ('held','kept') order by (d.privacy_hold='held') desc,d.privacy_at desc nulls last,d.id limit ${LIST_LIMIT}`;
 return {waiting:Number(rows[0]?.waiting??0),kept:Number(rows[0]?.kept??0),
  documents:rows.map(r=>({id:r.id,filename:r.filename,hold:r.privacy_hold,reason:r.privacy_reason,page:r.privacy_page,at:r.privacy_at instanceof Date?r.privacy_at.toISOString():r.privacy_at??null,
   hasPdf:!!r.has_pdf,noticeNo:r.notice_no??'',noticeTitle:r.title??'',noticeUrl:r.url??'',decidedBy:r.privacy_decided_by??null}))};
}

/** The administrator's decision: 'release' publishes it for good (the check never catches it again), 'keep' hides it. */
export async function decideWithheld(id:string,decision:'release'|'keep',by:string,q:DbSql=documentDb()):Promise<boolean>{
 const rows=await q`update app.procurement_documents set privacy_hold=${decision==='release'?'released':'kept'},privacy_decided_by=${by},privacy_decided_at=clock_timestamp()
  where id=${id} and privacy_hold in ('held','kept','released') returning id`;
 return rows.length===1;
}
