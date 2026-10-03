import type { DbSql } from './client.js';
import { contractRonValue } from './contract-money.js';
type IdentitySql = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/** Alias c is a source contract. Source records and their URLs remain intact. */
export function canonicalContract(q: IdentitySql) {
  return q`not exists (select 1 from marts.contract_identity_members im
    join marts.contract_identity_decisions d on d.candidate_id=im.candidate_id
    where im.contract_id=c.id and d.canonical_contract_id<>c.id)`;
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
          and not(coalesce(c.title,'')~*'acord[- ]cadru' and coalesce(c.title,'')!~*'subsecvent'
            and exists(select 1 from core.contracts s where s.ca_notice_id=c.ca_notice_id and s.title~*'subsecvent')),false) eligible,
        jsonb_build_object('contract',(to_jsonb(c)-'contract_date')||jsonb_build_object('date_epoch',extract(epoch from c.contract_date)),
          'award',(to_jsonb(a)-'state_date')||jsonb_build_object('date_epoch',extract(epoch from a.state_date)),
          'cohort',to_jsonb(cohort)) source_state
      from selected c left join core.awards a using(ca_notice_id) left join core.entities e on e.id=a.authority_entity_id
      left join cohort using(notice_no)
    ) select (to_jsonb(p)-'source_state'-'eligible') identity,eligible,
      md5((to_jsonb(p))::text) snapshot_hash from projected p order by p.id::bigint`;
}

/** Read-only fail-closed check. Never silently revoke approvals and republish a
 * doubled total. A changed decision needs source review while maintenance stays on. */
export async function readContractIdentityQuality(q: IdentitySql) {
  const members=await q`select contract_id::text,snapshot_hash from marts.contract_identity_members`;
  const current=await readContractIdentityMembers(q,members.map(m=>String(m.contract_id)));
  const hashes=new Map(current.map(r=>[String(r.identity.id),String(r.snapshot_hash)]));
  const stale=members.filter(m=>hashes.get(String(m.contract_id))!==m.snapshot_hash).map(m=>String(m.contract_id));
  const invalid=await q`select d.candidate_id from marts.contract_identity_decisions d
    left join marts.contract_identity_candidates c on c.id=d.candidate_id
    left join marts.contract_identity_observations o on o.fingerprint=d.fingerprint and o.candidate_id=d.candidate_id
    where c.active is distinct from true or c.status is distinct from 'source_verified' or c.fingerprint is distinct from d.fingerprint
      or o.evidence is distinct from c.evidence
      or (select count(*) from marts.contract_identity_members m where m.candidate_id=d.candidate_id)<>2
      or not exists(select 1 from marts.contract_identity_members m where m.candidate_id=d.candidate_id and m.contract_id=d.canonical_contract_id)`;
  return {members:members.length,staleMembers:stale.length,invalidDecisions:invalid.length,examples:stale.slice(0,10),valid:!stale.length&&!invalid.length};
}
export async function assertContractIdentityQuality(q: IdentitySql) {
  const report=await readContractIdentityQuality(q);
  if(!report.valid)throw Error(`Contract publication identity changed: ${report.staleMembers} source members, ${report.invalidDecisions} decisions require review before publication`);
  return report;
}
