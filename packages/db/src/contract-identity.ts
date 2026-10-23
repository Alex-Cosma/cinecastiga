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
 * statement under publication timeouts (180k approved members, 14 October 2026).
 * With `cache`, hashes still valid for the current source version are reused
 * (see SnapshotHashCache); the result is the same map either way. */
export async function currentSnapshotHashes(q: IdentitySql, ids: string[], size=SNAPSHOT_HASH_CHUNK, cache?: SnapshotHashCache) {
  if(cache)return cachedSnapshotHashes(q,ids,size,cache);
  const hashes=new Map<string,string>();
  for(let i=0;i<ids.length;i+=size){
    for(const r of await readContractIdentityMembers(q,ids.slice(i,i+size)))hashes.set(String(r.identity.id),String(r.snapshot_hash));
  }
  return hashes;
}

/** Every relation readContractIdentityMembers reads, and nothing else: contracts
 * (also counted per notice in the cohort), awards (row and cohort), winners and
 * the authority/winner entities. Migration 0083 puts the statement trigger
 * `contract_identity_source_changed` on each; keep the two lists identical. */
export const CONTRACT_IDENTITY_HASH_SOURCES=['core.contracts','core.awards','core.contract_winners','core.entities'] as const;

/** In-process memo of current snapshot hashes for ONE processing run. A daily run
 * otherwise recomputes the hash of every approved member up to nine times (~2 min
 * each in production, 23 October 2026) although nothing they read has changed.
 * Entries are valid for one source token (snapshotHashSourceToken): any committed
 * write to CONTRACT_IDENTITY_HASH_SOURCES changes it and empties the memo. Only
 * the current hashes are kept; stored member hashes, decisions and exclusions are
 * always read fresh. The publication validation never reads it
 * (verifyContractIdentityQuality). Never share one between databases or runs. */
export interface SnapshotHashCache {
  readonly label: string;
  token: string | null;
  /** null: no current contract with that id (a fresh read omits it too). */
  readonly hashes: Map<string, string | null>;
  readonly stats: { reused: number; computed: number; invalidated: number; bypassed: number };
}
export function createSnapshotHashCache(label = 'processing'): SnapshotHashCache {
  return { label, token: null, hashes: new Map(), stats: { reused: 0, computed: 0, invalidated: 0, bypassed: 0 } };
}

/** The version of everything the snapshot hashes read, as visible to this
 * statement. Migration 0083 stamps marts.contract_identity_source_state with a
 * new, never reused sequence value in every transaction that writes any source
 * relation (statement triggers: insert, update, delete, truncate), so two reads
 * returning the same token saw the same committed source rows. Null whenever the
 * memo must not be used: the state row or one of the four triggers is missing,
 * disabled or altered, this session does not fire triggers, or this transaction
 * has itself written a source relation (its later writes would not change the
 * version again, and a rollback would hide them). Also part of the token: the
 * database, the columns of the source relations and the settings that affect
 * the JSON text of a row. */
export async function snapshotHashSourceToken(q: IdentitySql): Promise<string | null> {
  const [state]=await q`select to_regclass('marts.contract_identity_source_state') is not null present`;
  if(!state?.present)return null;
  const [s]=await q`with sources as (select to_regclass(name) rel from unnest(array['core.contracts','core.awards','core.contract_winners','core.entities']) name)
    select s.instance::text instance,s.version::text version,current_database() db,
      coalesce(s.changed_by=pg_current_xact_id_if_assigned(),false) own,
      current_setting('session_replication_role')='origin' fires,
      (select count(*) from sources where rel is null)::int missing,
      (select count(*) from pg_trigger t join sources on sources.rel=t.tgrelid
        where t.tgname='contract_identity_source_changed' and not t.tgisinternal and t.tgenabled in ('O','A')
          and t.tgtype=60 and cardinality(t.tgattr::int2[])=0 and t.tgqual is null
          and t.tgfoid=to_regprocedure('marts.contract_identity_source_changed()'))::int triggers,
      (select md5(string_agg(a.attrelid::regclass::text||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod),',' order by a.attrelid::regclass::text,a.attnum))
        from pg_attribute a join sources on sources.rel=a.attrelid where a.attnum>0 and not a.attisdropped) columns,
      current_setting('TimeZone') timezone,current_setting('extra_float_digits') digits
    from marts.contract_identity_source_state s where s.id=1`;
  if(!s||s.own||!s.fires||s.missing!==0||s.triggers!==CONTRACT_IDENTITY_HASH_SOURCES.length)return null;
  return JSON.stringify([s.db,s.instance,s.version,s.columns,s.timezone,s.digits]);
}

async function cachedSnapshotHashes(q: IdentitySql, ids: string[], size: number, cache: SnapshotHashCache): Promise<Map<string, string>> {
  const reset=()=>{cache.token=null;cache.hashes.clear();cache.stats.bypassed++;};
  const token=await snapshotHashSourceToken(q);
  if(token===null){reset();return currentSnapshotHashes(q,ids,size);}
  if(cache.token!==token){
    if(cache.hashes.size)cache.stats.invalidated++;
    cache.hashes.clear();cache.token=token;
  }
  const missing=[...new Set(ids)].filter(id=>!cache.hashes.has(id));
  if(missing.length){
    const fresh=await currentSnapshotHashes(q,missing,size);
    // Kept only if nothing the hashes read changed while they were computed;
    // otherwise everything is recomputed exactly as without a memo.
    if(await snapshotHashSourceToken(q)!==token||cache.token!==token){reset();return currentSnapshotHashes(q,ids,size);}
    for(const id of missing)cache.hashes.set(id,fresh.get(id)??null);
    cache.stats.computed+=missing.length;
  }
  cache.stats.reused+=ids.length-missing.length;
  const hashes=new Map<string,string>();
  for(const id of ids){const hash=cache.hashes.get(id);if(hash!=null)hashes.set(id,hash);}
  return hashes;
}

/** Read-only fail-closed check. Never silently revoke approvals and republish a
 * doubled total. A changed decision needs source review while maintenance stays on. */
export async function readContractIdentityQuality(q: IdentitySql, cache?: SnapshotHashCache) {
  return (await inspectContractIdentityQuality(q, cache)).report;
}
/** The quality report plus the approved groups holding a stale member, which a
 * targeted revalidation must re-verify. Kept out of the report: it is audited. */
export async function inspectContractIdentityQuality(q: IdentitySql, cache?: SnapshotHashCache) {
  const {report,staleGroups}=await inspectWithHashes(q,ids=>currentSnapshotHashes(q,ids,SNAPSHOT_HASH_CHUNK,cache));
  return {report,staleGroups};
}

/** The publication gate. Every member hash is recomputed, never taken from the
 * memo. Where the memo is still valid for the current source token, each of its
 * entries must equal the fresh hash; a difference means the change tracking
 * failed, so earlier checks of this run may have used stale hashes, and
 * publication stops (`hashCache.mismatches`, `valid: false`). */
export async function verifyContractIdentityQuality(q: IdentitySql, cache?: SnapshotHashCache) {
  const {report,ids,hashes}=await inspectWithHashes(q,ids=>currentSnapshotHashes(q,ids));
  if(!cache)return report;
  const token=await snapshotHashSourceToken(q);
  const compared=token!==null&&token===cache.token?ids.filter(id=>cache.hashes.has(id)):[];
  const mismatches=compared.filter(id=>(cache.hashes.get(id)??undefined)!==hashes.get(id)).length;
  return {...report,valid:report.valid&&!mismatches,hashCache:{compared:compared.length,mismatches,...cache.stats}};
}

async function inspectWithHashes(q: IdentitySql, current: (ids: string[]) => Promise<Map<string, string>>) {
  const members=await q`select contract_id::text,candidate_id,snapshot_hash from marts.contract_identity_members`;
  const ids=members.map(m=>String(m.contract_id));
  const hashes=await current(ids);
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
  return {report,staleGroups:[...new Set(staleRows.map(m=>String(m.candidate_id)))].sort(),ids,hashes};
}
export async function assertContractIdentityQuality(q: IdentitySql, cache?: SnapshotHashCache) {
  const report=await readContractIdentityQuality(q, cache);
  if(!report.valid)throw Error(`Contract publication identity changed: ${report.staleMembers} source members, ${report.invalidDecisions} decisions require review before publication`);
  return report;
}

/** Product filter on procedure contracts (/metodologie#totaluri): a RON value
 * above it keeps the contract out of every total and partner ranking. It is
 * not proof that a larger contract is invalid; the disclosures count them. */
export const CONTRACT_VALUE_CAP_RON = 1_000_000_000;

/** Source contract c (award alias a) meeting every other condition of
 * marts.contract_transactions but above CONTRACT_VALUE_CAP_RON: canonical,
 * identified contract/call-off, dated, with authority and winner. Framework
 * ceilings and addenda are excluded by their own policy, not by the cap.
 * Disclosure only: these rows are counted and listed, never summed into totals. */
export function contractAboveValueCap(q: IdentitySql, award='a') {
  return q`(${contractRonValue(q)} > ${CONTRACT_VALUE_CAP_RON} and c.contract_date is not null
    and ${q(award)}.authority_entity_id is not null and ${contractReportable(q)} and ${canonicalContract(q)}
    and ${contractHasSupplier(q, award)})`;
}

/** A recorded winner is a supplier only when it is not the contracting
 * authority of the same contract. SICAP sometimes carries the buyer itself in
 * the winner object (audit F12, 21 October 2026: 90 contracts of 37 authorities,
 * 1.40 mld. lei, e.g. Transelectrica and CUP Focșani "winning" their own
 * tenders). The source row stays and the contract page shows it, labelled; it
 * is never a supplier, partner or dependency. `award` holds `authorityColumn`. */
export function winnerIsSupplier(q: IdentitySql, winner='w', award='a', authorityColumn='authority_entity_id') {
  return q`${q(winner)}.entity_id is distinct from ${q(award)}.${q(authorityColumn)}`;
}

/** Source contract c (award alias a) has at least one winner that is a
 * supplier. The "câștigător" condition of the contract population: a contract
 * whose only recorded winner is its own authority has no known supplier and,
 * like a contract without winners, stays out of every total. */
export function contractHasSupplier(q: IdentitySql, award='a') {
  return q`exists (select 1 from core.contract_winners sw where sw.contract_id=c.id and ${winnerIsSupplier(q, 'sw', award)})`;
}

/** Disclosure only: source contract c has winners, all of them its own
 * contracting authority (award alias a). Counted in data_coverage and labelled
 * on the contract page; never summed. */
export function contractWinnerIsAuthority(q: IdentitySql, award='a') {
  return q`(${q(award)}.authority_entity_id is not null
    and exists (select 1 from core.contract_winners sw where sw.contract_id=c.id)
    and not ${contractHasSupplier(q, award)})`;
}

/** Kept separate from intrinsic member eligibility to avoid a quarantine /
 * eligibility feedback loop during later source verification. */
export function contractTemporarilyExcluded(q: IdentitySql, alias='c') {
  return q`exists (select 1 from marts.contract_identity_exclusions x where x.contract_id=${q(alias)}.id)`;
}

export async function assertContractExclusionsQuality(q: IdentitySql, cache?: SnapshotHashCache) {
  const excluded=await q`select contract_id::text,snapshot_hash from marts.contract_identity_exclusions`;
  const hashes=await currentSnapshotHashes(q,excluded.map(r=>String(r.contract_id)),SNAPSHOT_HASH_CHUNK,cache);
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
