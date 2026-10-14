import { contractKind, contractReportable, CONTRACT_REPORTING_VERSION, type DbSql } from '@seap/db';

/** Replay only the missing/stale source type projection, not economic amounts,
 * identities or winners. Bounded batches; raw pages are expanded once per batch.
 * Missing historical archives stay legacy, never a guessed source type. */
export async function repairContractTypes(q: DbSql, boundary?: bigint) {
  let cursor = '0', repaired = 0;
  for (;;) {
    const rows = await q`select id::text,raw_id::text from core.contracts
      where id>${cursor}::bigint and contract_type_raw_id is distinct from raw_id
        and (${boundary?.toString() ?? null}::bigint is null or raw_id<=${boundary?.toString() ?? null}::bigint)
      order by contracts.id limit 5000`;
    if (!rows.length) break;
    const ids = rows.map(r=>String(r.id));
    const rawIds = [...new Set(rows.map(r=>String(r.raw_id)))];
    const updated = await q`with items as materialized (
      select r.id raw_id,r.payload->>'caNoticeId' parent,i
      from raw.raw_documents r cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.payload->'items')='array' then r.payload->'items' else '[]'::jsonb end) i
      where r.id=any(${rawIds}::bigint[]) and r.endpoint_version='award-contracts:v1'
    ), matched as (
      select c.id,count(i.raw_id) copies,min(i.i->>'contractType') kind,
        bool_and(coalesce(i.i->>'caNoticeId',i.parent)=c.ca_notice_id::text) parent_matches
      from core.contracts c left join items i on i.raw_id=c.raw_id and i.i->>'caNoticeContractId'=c.ca_notice_contract_id::text
      where c.id=any(${ids}::bigint[]) group by c.id
    ) update core.contracts c set source_contract_type=case
      when m.copies=0 then null
      when m.copies=1 and m.parent_matches and (m.kind is null or m.kind ~ '^[0-9]{1,6}$') then m.kind::integer
      else -1 end,contract_type_raw_id=c.raw_id
      from matched m where c.id=m.id returning c.id`;
    repaired += updated.length;
    cursor = String(rows.at(-1)!.id);
  }
  // Historical proofs are retained even when the corresponding archive lives
  // only in the pinned bundle. They contain the per-publication SEAP type.
  // The next identity stage revalidates ALL economic/source fields against that
  // bundle before any public aggregates may be rebuilt.
  const historical=await q`update core.contracts c set source_contract_type=(proof->>'contractType')::integer,
      contract_type_raw_id=c.raw_id
    from marts.contract_identity_members member
    join marts.contract_identity_decisions decision on decision.candidate_id=member.candidate_id
    join marts.contract_identity_candidates verified on verified.id=decision.candidate_id
      and verified.fingerprint=decision.fingerprint and verified.active and verified.status='source_verified'
    join marts.contract_identity_observations observation on observation.fingerprint=verified.fingerprint
      and observation.evidence=verified.evidence
    cross join lateral jsonb_array_elements(verified.evidence->'proofs') proof
    where c.id=member.contract_id and c.source_contract_type is null
      and proof->>'contract'=c.ca_notice_contract_id::text and proof->>'contractType' ~ '^[0-9]{1,6}$'
    returning c.id`;
  return { repaired, historicalTypes:historical.length };
}

export async function contractReportingSummary(q: DbSql) {
  const rows = await q`select ${contractKind(q)} kind,count(*)::int publications,
    count(*) filter(where not ${contractReportable(q)})::int excluded
    from core.contracts c group by 1 order by 1`;
  return { methodology: CONTRACT_REPORTING_VERSION, rows };
}
