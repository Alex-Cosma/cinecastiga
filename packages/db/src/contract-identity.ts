import { contractReportable } from './contract-reporting.js';
import type { DbSql } from './client.js';
import { contractRonValue } from './contract-money.js';
type IdentitySql = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/** Alias c is a source contract. Source records and their URLs remain intact. */
export function canonicalContract(q: IdentitySql) {
  return q`(not ${contractTemporarilyExcluded(q)} and not exists (select 1 from marts.contract_identity_members im
    join marts.contract_identity_decisions d on d.candidate_id=im.candidate_id
    where im.contract_id=c.id and d.canonical_contract_id<>c.id))`;
}

/** Bounded projection of approved/candidate members, with a fingerprint of their
 * current source state. Includes the publication cohort: a third publication or
 * new call-off must not silently change an already approved decision.
 * Hash inputs use epochs, not connection-dependent timestamp serialization. */
export async function readContractIdentityMembers(q: IdentitySql, ids: string[]) {
  if (!ids.length) return [];
  return q`with selected as materialized (select * from core.contracts where id=any(${ids}::bigint[])),
    scope as materialized (select distinct a.notice_no from selected c join core.awards a using(ca_notice_id)),
    cohort as materialized (
      select a.notice_no, count(c.id)::text n, array_agg(distinct a.ca_notice_id order by a.ca_notice_id)::text publications
      from scope s join core.awards a using(notice_no) left join core.contracts c using(ca_notice_id) group by a.notice_no
    ), projected as (
      select c.id::text, c.ca_notice_contract_id::text "publicId",c.ca_notice_id::text "noticeId",a.notice_no "noticeNo",
        a.authority_entity_id::text authority,e.cui_canonical "authorityCui",c.contract_no number,
        to_char(c.contract_date at time zone 'Europe/Bucharest','YYYY-MM-DD') date,
        trim_scale(${contractRonValue(q)})::text value,case when ${contractRonValue(q)} is not null then 'RON' end currency,
        c.title,c.lots_caption lots,coalesce(c.cpv_code,a.cpv_code) cpv,a.procedure_type procedure,a.acquisition_type acquisition,
        array(select w.entity_id::text from core.contract_winners w where w.contract_id=c.id order by w.entity_id) winners,
        array(select we.cui_canonical from core.contract_winners w join core.entities we on we.id=w.entity_id where w.contract_id=c.id order by w.entity_id) "winnerCuis",
        coalesce(${contractRonValue(q)}>0 and ${contractRonValue(q)}<=1000000000 and c.contract_date is not null and a.authority_entity_id is not null
          and exists(select 1 from core.contract_winners w where w.contract_id=c.id)
          and ${contractReportable(q)},false) eligible,
        jsonb_build_object('contract',(to_jsonb(c)-'contract_date'-'source_contract_type'-'contract_type_raw_id')||jsonb_build_object('date_epoch',extract(epoch from c.contract_date)),
          'award',(to_jsonb(a)-'state_date')||jsonb_build_object('date_epoch',extract(epoch from a.state_date)),
          'cohort',to_jsonb(cohort)) source_state
      from selected c left join core.awards a using(ca_notice_id) left join core.entities e on e.id=a.authority_entity_id
      left join cohort using(notice_no)
    ), identified as (
      -- Most contracts have only valid Romanian identities. Avoid a third
      -- supplier lookup for those, and keep their historical JSON/hash intact.
      select p.id,p.eligible,to_jsonb(p) || case when array_position(p."winnerCuis",null) is null then '{}'::jsonb
        else coalesce((select jsonb_build_object('winnerForeignIds',jsonb_agg(
          jsonb_build_object('entityId',we.id::text,'country',we.country_code,'id',we.foreign_id_norm) order by we.id))
          from core.contract_winners w join core.entities we on we.id=w.entity_id where w.contract_id=p.id::bigint
          and we.cui_canonical is null and we.is_foreign and we.country_code<>'RO' and we.foreign_id_norm is not null
          having count(*)>0),'{}'::jsonb) end state from projected p
    ) select state-'source_state'-'eligible' identity,eligible,
      md5(state::text) snapshot_hash from identified order by id::bigint`;
}

export const SNAPSHOT_HASH_CHUNK=20000;
/** Current snapshot hashes in bounded id chunks. Each member's cohort is computed
 * per official notice number over ALL its publications, independent of which
 * contracts a chunk selects, so the hashes equal a single read. Keeps each
 * statement under publication timeouts (180k approved members, 14 October 2026). */
export async function currentSnapshotHashes(q: IdentitySql, ids: string[], size=SNAPSHOT_HASH_CHUNK) {
  const hashes=new Map<string,string>();
  for(let i=0;i<ids.length;i+=size){
    for(const r of await readContractIdentityMembers(q,ids.slice(i,i+size)))hashes.set(String(r.identity.id),String(r.snapshot_hash));
  }
  return hashes;
}

/** Read-only fail-closed check. Never silently revoke approvals and republish a
 * doubled total. A changed decision needs source review while maintenance stays on. */
export async function readContractIdentityQuality(q: IdentitySql) {
  return (await inspectContractIdentityQuality(q)).report;
}
/** The quality report plus the approved groups holding a stale member, which a
 * targeted revalidation must re-verify. Kept out of the report: it is audited. */
export async function inspectContractIdentityQuality(q: IdentitySql) {
  const members=await q`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members`;
  const hashes=await currentSnapshotHashes(q,members.map(m=>String(m.contract_id)));
  const staleRows=members.filter(m=>hashes.get(String(m.contract_id))!==m.snapshot_hash);
  const stale=staleRows.map(m=>String(m.contract_id));
  const invalid=await q`select d.candidate_id from marts.contract_identity_decisions d
    left join marts.contract_identity_candidates c on c.id=d.candidate_id
    left join marts.contract_identity_observations o on o.fingerprint=d.fingerprint and o.candidate_id=d.candidate_id
    where c.active is distinct from true or c.status is distinct from 'source_verified' or c.fingerprint is distinct from d.fingerprint
      or o.evidence is distinct from c.evidence
      or jsonb_array_length(c.evidence->'members')<2
      or (jsonb_array_length(c.evidence->'members')>2 and coalesce(c.evidence->>'methodology','') not in ('contract-identity-2','contract-identity-3'))
      or (select count(distinct e->>'id') from jsonb_array_elements(c.evidence->'members') e)<>jsonb_array_length(c.evidence->'members')
      or (select count(*) from marts.contract_identity_members m where m.candidate_id=d.candidate_id)<>jsonb_array_length(c.evidence->'members')
      or exists(select 1 from jsonb_array_elements(c.evidence->'members') e
        where not exists(select 1 from marts.contract_identity_members m where m.candidate_id=d.candidate_id and m.contract_id=(e->>'id')::bigint))
      or not exists(select 1 from marts.contract_identity_members m where m.candidate_id=d.candidate_id and m.contract_id=d.canonical_contract_id)
      or (c.evidence->>'methodology'='contract-identity-3' and not exists(
        select 1 from core.contracts chosen where chosen.id=d.canonical_contract_id and chosen.ca_notice_contract_id::text=c.evidence->>'latestPublicId'))`;
  const report={members:members.length,staleMembers:stale.length,invalidDecisions:invalid.length,examples:stale.slice(0,10),valid:!stale.length&&!invalid.length};
  return {report,staleGroups:[...new Set(staleRows.map(m=>String(m.candidate_id)))].sort()};
}
export async function assertContractIdentityQuality(q: IdentitySql) {
  const report=await readContractIdentityQuality(q);
  if(!report.valid)throw Error(`Contract publication identity changed: ${report.staleMembers} source members, ${report.invalidDecisions} decisions require review before publication`);
  return report;
}

/** Kept separate from intrinsic member eligibility to avoid a quarantine /
 * eligibility feedback loop during later source verification. */
export function contractTemporarilyExcluded(q: IdentitySql, alias='c') {
  return q`exists (select 1 from marts.contract_identity_exclusions x where x.contract_id=${q(alias)}.id)`;
}

export async function assertContractExclusionsQuality(q: IdentitySql) {
  const excluded=await q`select contract_id::text,snapshot_hash from marts.contract_identity_exclusions`;
  const hashes=await currentSnapshotHashes(q,excluded.map(r=>String(r.contract_id)));
  const stale=excluded.filter(r=>hashes.get(String(r.contract_id))!==r.snapshot_hash);
  const invalid=await q`select distinct x.candidate_id from marts.contract_identity_exclusions x
    left join marts.contract_identity_candidates c on c.id=x.candidate_id
    left join marts.contract_identity_observations o on o.fingerprint=x.fingerprint and o.candidate_id=x.candidate_id
    where c.active is distinct from true or c.fingerprint is distinct from x.fingerprint
      or c.status='source_verified' or o.evidence is distinct from c.evidence
      or (c.evidence->>'methodology'='contract-identity-review-1' and not exists(
        select 1 from marts.contract_identity_observations prior where prior.fingerprint=c.evidence->>'previousObservation'))
      or exists(select 1 from marts.contract_identity_members m where m.contract_id=x.contract_id)
      or not exists(select 1 from jsonb_array_elements(c.evidence->'members') m where m->>'id'=x.contract_id::text)
      or exists(select 1 from jsonb_array_elements(c.evidence->'members') m where not exists(
        select 1 from marts.contract_identity_exclusions other where other.candidate_id=x.candidate_id and other.contract_id=(m->>'id')::bigint))`;
  if(stale.length||invalid.length)throw Error(`Temporary identity exclusions need review: ${stale.length} changed members, ${invalid.length} invalid groups`);
  return {excludedPublications:excluded.length,valid:true};
}
