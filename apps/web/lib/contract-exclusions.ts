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
/** A group's institution: its first publication's authority (as the page always showed it). */
const groupAuthority=(q:DbSql)=>q`(c.evidence->'members'->0->>'authority')`;

/** One page of groups: all of them, one group (`group`), or one institution's (`authority`; "none" = unidentified). */
export async function readContractExclusions(q:DbSql,page=1,group?:string,authority?:string) {
 const size=10;
 const byAuthority=authority===undefined?q`true`:authority==='none'?q`${groupAuthority(q)} is null`:q`${groupAuthority(q)}=${authority}`;
 const [count]=await q`select count(distinct x.candidate_id)::int n from marts.contract_identity_exclusions x
   join marts.contract_identity_candidates c on c.id=x.candidate_id
   where (${group??null}::text is null or x.candidate_id=${group??null}) and ${byAuthority}`;
 const total=Number(count?.n??0),pages=Math.max(1,Math.ceil(total/size));
 const selectedPage=Math.max(1,Math.min(Number.isFinite(page)?Math.floor(page):1,pages));
 const rows=await q`with selected as (
   select x.candidate_id,max(x.reviewed_at)::text reviewed_at from marts.contract_identity_exclusions x
    join marts.contract_identity_candidates c on c.id=x.candidate_id
    where (${group??null}::text is null or x.candidate_id=${group??null}) and ${byAuthority}
    group by x.candidate_id order by x.candidate_id limit ${size} offset ${(selectedPage-1)*size}
 ) select c.id,c.evidence->'reasons' reasons,c.evidence->'members' members,s.reviewed_at,
    e.id::text authority_id,e.name_display authority
   from selected s join marts.contract_identity_candidates c on c.id=s.candidate_id
   left join core.entities e on e.id=(c.evidence->'members'->0->>'authority')::bigint order by c.id`;
 return {total,page:selectedPage,pages,groups:rows.map(r=>({id:String(r.id),reasons:r.reasons??[],members:r.members??[],
  authority:r.authority??null,authorityId:r.authority_id??null,reviewedAt:String(r.reviewed_at)})) as ExclusionGroup[]};
}
export function getContractExclusions(page=1,group?:string,authority?:string) {
 return readContractExclusions(globalDb.__seapSql??=createDb().sql,page,group,authority);
}

export type ExclusionInstitution={authorityId:string|null;authority:string|null;groups:number;reasons:number};
/**
 * The groups gathered by institution (UX audit Z7-36, owner 16 November 2026): how many groups and how many different
 * reasons each has, the most groups first; `name` keeps the institutions whose name holds it (case and diacritics
 * ignored). The whole count of groups comes with it. No sum of values: the page counts groups, as before.
 */
export async function readExclusionInstitutions(q:DbSql,name?:string) {
 const words=(name??'').trim().slice(0,100);
 const rows=await q`with g as (select distinct candidate_id from marts.contract_identity_exclusions)
  select ${groupAuthority(q)} authority_id,e.name_display authority,count(distinct c.id)::int groups,count(distinct r.reason)::int reasons
  from g join marts.contract_identity_candidates c on c.id=g.candidate_id
  left join core.entities e on e.id=(${groupAuthority(q)})::bigint
  left join lateral jsonb_array_elements_text(coalesce(c.evidence->'reasons','[]'::jsonb)) r(reason) on true
  group by 1,2 order by groups desc,authority nulls last`;
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const all=rows.map(r=>({authorityId:r.authority_id??null,authority:r.authority??null,groups:Number(r.groups),reasons:Number(r.reasons)})) as ExclusionInstitution[];
 const shown=words?all.filter(i=>fold(i.authority??'instituție neidentificată').includes(fold(words))):all;
 return {total:all.reduce((n,i)=>n+i.groups,0),institutions:all.length,shown};
}
export function getExclusionInstitutions(name?:string) {
 return readExclusionInstitutions(globalDb.__seapSql??=createDb().sql,name);
}
