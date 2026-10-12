import {createDb,type DbSql} from '@seap/db';
const globalDb=globalThis as unknown as {__seapSql?:DbSql};
export const EXCLUSION_REASONS:Record<string,string>={
 identity_relationship_unresolved:'Datele s-au schimbat; legătura cu publicațiile comparate anterior rămâne de lămurit.',
 incomplete_identity:'Identificatori incompleți în sursă (de exemplu, lot sau cod fiscal).',
 missing_amendment_evidence:'Publicațiile diferă, iar dovada modificării contractului lipsește.',
 archive_disagrees_with_core:'Arhiva și înregistrarea importată conțin informații diferite.',
 archive_notice_disagrees_with_core:'Datele anunțului diferă între arhivă și import.',
 archive_authority_unverified:'Instituția nu poate fi confirmată din arhivă.',
 archive_authority_disagrees:'Instituția diferă între arhivă și import.',
 missing_procedure:'Identificatorul procedurii lipsește din dovezile disponibile.',
 conflicting_archived_versions:'Arhivele conțin versiuni diferite pentru aceeași publicație.',
 ambiguous_multiplicity:'Mai multe înregistrări coexistă; nu putem stabili câte contracte distincte sunt.',
 different_source_conditions:'Tipul contractului sau condițiile diferă între publicații.',
 different_source_currency:'Publicațiile indică monede originale diferite.',
 different_source_money:'Echivalentele în lei coincid, dar valorile în moneda originală diferă.',
 different_contract_fields:'Datele contractelor nu coincid.',
 conflicting_procedure:'Sursele indică proceduri diferite.',
 different_procedures:'Înregistrările aparțin unor proceduri diferite.',
 missing_archive:'Lipsește o parte din arhiva necesară verificării.',
 unverified_publication_order:'Ordinea versiunilor nu poate fi confirmată.',
 ambiguous_version_order:'Ordinea versiunilor este ambiguă.',
};
export type ExclusionMember={id:string;publicId:string;noticeId:string;noticeNo:string;title:string|null;number:string|null;date:string|null;value:string|null;currency:string|null};
export type ExclusionGroup={id:string;reasons:string[];members:ExclusionMember[];authority:string|null;authorityId:string|null;reviewedAt:string};
export async function readContractExclusions(q:DbSql,page=1,group?:string) {
 const size=10;
 const [count]=await q`select count(distinct candidate_id)::int n from marts.contract_identity_exclusions
   where (${group??null}::text is null or candidate_id=${group??null})`;
 const total=Number(count?.n??0),pages=Math.max(1,Math.ceil(total/size));
 const selectedPage=Math.max(1,Math.min(Number.isFinite(page)?Math.floor(page):1,pages));
 const rows=await q`with selected as (
   select candidate_id,max(reviewed_at)::text reviewed_at from marts.contract_identity_exclusions
    where (${group??null}::text is null or candidate_id=${group??null})
    group by candidate_id order by candidate_id limit ${size} offset ${(selectedPage-1)*size}
 ) select c.id,c.evidence->'reasons' reasons,c.evidence->'members' members,s.reviewed_at,
    e.id::text authority_id,e.name_display authority
   from selected s join marts.contract_identity_candidates c on c.id=s.candidate_id
   left join core.entities e on e.id=(c.evidence->'members'->0->>'authority')::bigint order by c.id`;
 return {total,page:selectedPage,pages,groups:rows.map(r=>({id:String(r.id),reasons:r.reasons??[],members:r.members??[],
  authority:r.authority??null,authorityId:r.authority_id??null,reviewedAt:String(r.reviewed_at)})) as ExclusionGroup[]};
}
export function getContractExclusions(page=1,group?:string) {
 return readContractExclusions(globalDb.__seapSql??=createDb().sql,page,group);
}
