import { processingWritable } from "@seap/db";
import { processingStage, type DbSql } from '@seap/db';
import { identityOf as identityOfTx } from '../normalize/da-supplier-vat.js';

/**
 * Owner-authorized merge (4 November 2026) of the legacy authority fragments
 * the 1 October identity repair left alone.
 *
 * The historical DA importer read the fiscal CUI printed before an authority's
 * name ("4455226 COMUNA RACOVA(CONSILIUL LOCAL)") as a SICAP participant id.
 * On 1 October every string whose CUI and name matched the original authority
 * dimension (contractingAuthority.bson) was moved to the valid-CUI entity and
 * its fragment became a redirect. 313 strings were left "unresolved", mostly
 * because the institution had since been renamed ("Liceul Tehnologic Oglinzi"
 * is now "Școala Profesională Oglinzi") and name alone is never a merge key.
 *
 * The source string itself states the CUI, so for those strings the CUI is the
 * key, not the name: a group whose numeric prefix is exactly the valid CUI of
 * an entity moves to that entity, which is the same legal person under a later
 * name. On production (read-only, 4 November) that is 282 key-less fragments
 * whose only SICAP id is the fabricated prefix, 29,083 acquisitions. CT BUS
 * (2144688) has a real SICAP id and is skipped; a string whose prefix is no
 * valid CUI (20 groups) stays.
 *
 * The evidence is the staged 1 October audit (identity_repair.groups and
 * source_rows, hashed against the BSON manifest). Without it (a local copy)
 * the repair reports itself skipped and changes nothing. Every holder is
 * checked inside the transaction: key-less, only the fabricated SICAP id,
 * every one of its acquisitions planned to one target, no other role, no
 * redirect on either side, no conflicting UAT, archive rows only. Anything
 * else is skipped with its reason, never guessed. Only rows still on their
 * holder are updated, and the moved rows must keep every other field.
 *
 * It runs inside a backed-up processing run, before normalization, and only
 * on a full run: authority acquisitions feed the risk signals, which a daily
 * run keeps from the previous full run, so a daily publication would show the
 * merged profiles with the fragments' old signals. A daily run defers it.
 * finishProcessing marks it completed with the verified publication.
 */
export const AUTHORITY_FRAGMENT_REPAIR_ID = 'authority-fragments-20261104';
export const AUTHORITY_FRAGMENT_REASON = 'legacy-authority-cui-prefix';

/**
 * Reviewed strings whose prefix is a mistyped CUI. Applied only when
 * `approved`; the CUI rule above never matches them.
 */
export type PinnedFragment = { prefix: string; holderId: string; targetId: string; targetCui: string; approved: boolean; evidence: string };
export const PINNED_FRAGMENTS: readonly PinnedFragment[] = [
  { prefix: '2164244', holderId: '2151208', targetId: '2205736', targetCui: '2614244', approved: true,
    evidence: 'Comuna Tibucani (Neamț): source prefix 2164244, CUI 2614244 (first two digits swapped); same name and county; '
      + 'the fragment buys 2018-04..2019-12, the commune 2020-01 onwards; no entity holds 2164244. Approved by the owner on 4 November 2026.' },
];

/** What one holder looks like inside the repair transaction. */
export type FragmentHolder = {
  holderId: string;
  targets: string[];
  prefixes: string[];
  groups: number[];
  raws: string[];
  planned: number;
  /** Planned rows that came from a live source (non-null raw_id). */
  liveRows: number;
  holder: { cuiValid: boolean; cui: string | null; foreignId: string | null; isForeign: boolean } | null;
  sicap: string[];
  /** All acquisitions the holder buys. */
  authorityRows: number;
  otherRoles: boolean;
  holderRedirect: string | null;
  holderIsTarget: boolean;
  targetRedirected: boolean;
  holderUat: number | null;
  targetUat: number | null;
  prefixInDimension: boolean;
};

export type FragmentSkipReason =
  | 'holder-missing' | 'holder-has-key' | 'several-targets' | 'sicap-not-fabricated' | 'not-fully-evacuated'
  | 'live-rows' | 'other-roles' | 'redirected-elsewhere' | 'holder-is-redirect-target' | 'target-redirected'
  | 'uat-conflict' | 'prefix-is-sicap-id';
export type FragmentOutcome = { holderId: string; targetId: string | null; prefix: string | null; rows: number; groups: number[]; raws: string[] }
  & ({ outcome: 'merge'; uat: 'none' | 'move' | 'same' } | { outcome: 'skipped'; reason: FragmentSkipReason });

/** Pure decision for one holder; the caller writes only a `merge` outcome. */
export function planFragment(h: FragmentHolder): FragmentOutcome {
  const target = h.targets.length === 1 ? h.targets[0]! : null;
  const base = { holderId: h.holderId, targetId: target, prefix: h.prefixes.length === 1 ? h.prefixes[0]! : null, rows: h.planned, groups: h.groups, raws: h.raws };
  const skip = (reason: FragmentSkipReason): FragmentOutcome => ({ ...base, outcome: 'skipped', reason });
  if (!h.holder) return skip('holder-missing');
  if (h.holder.cuiValid || h.holder.cui || h.holder.foreignId || h.holder.isForeign) return skip('holder-has-key');
  if (!target || h.prefixes.length !== 1) return skip('several-targets');
  if (h.sicap.length !== 1 || h.sicap[0] !== `authority:${h.prefixes[0]}`) return skip('sicap-not-fabricated');
  if (h.prefixInDimension) return skip('prefix-is-sicap-id');
  if (h.liveRows > 0) return skip('live-rows');
  if (h.authorityRows !== h.planned) return skip('not-fully-evacuated');
  if (h.otherRoles) return skip('other-roles');
  if (h.holderRedirect !== null) return skip('redirected-elsewhere');
  if (h.holderIsTarget) return skip('holder-is-redirect-target');
  if (h.targetRedirected) return skip('target-redirected');
  if (h.holderUat !== null && h.targetUat !== null && h.holderUat !== h.targetUat) return skip('uat-conflict');
  return { ...base, outcome: 'merge', uat: h.holderUat === null ? 'none' : h.targetUat === null ? 'move' : 'same' };
}

const PRE_REFRESH = new Set(['backup-verified', 'currency-repair', 'reference-repair', 'authority-uat-repair', 'authority-fragment-repair']);
const PREFIX = String.raw`^\s*(?:RO)?\s*([0-9]{2,10})\M`;

/** Called by the processing runner after the verified backup, before the refresh. */
export async function runAuthorityFragmentRepair(q: DbSql, runId: string, log: (message: string) => void = () => {},
  pinned: readonly PinnedFragment[] = PINNED_FRAGMENTS) {
  return q.begin(async tx => {
    const sql = tx as unknown as DbSql;
    const [repair] = await sql`select status,processing_run_id::text run_id,report from app.data_repairs where id=${AUTHORITY_FRAGMENT_REPAIR_ID} for update`;
    if (repair?.status === 'completed') return null;
    if (repair?.status === 'applied' && repair.run_id === runId) return repair.report;
    const [run] = await sql`select r.status,r.mode,r.scope,r.scheduled_day::text run_day,r.stage,r.stages,r.raw_boundary,r.control_revision,c.maintenance,c.paused,c.revision
      from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1 for update of r`;
    if (!run || run.status !== 'running' || !processingWritable(run) || run.revision !== run.control_revision || !run.raw_boundary
      || !run.stages?.backup?.completedAt || !PRE_REFRESH.has(String(run.stage)))
      throw Error('Authority fragment repair requires a backed-up publication before normalization');
    if (run.scope !== 'full') { log('Authority fragment repair deferred to the next full run (risk signals are recalculated only there)'); return null; }
    const [evidence] = await sql`select to_regclass('identity_repair.groups') is not null and to_regclass('identity_repair.source_rows') is not null
      and to_regclass('identity_repair.manifest') is not null present`;
    if (!evidence?.present) { log('Authority fragment repair skipped: no staged identity audit (identity_repair) in this database'); return null; }

    await processingStage(sql, runId, 'authority-fragment-repair');
    await sql`set local statement_timeout='300s'`;
    await sql`set local lock_timeout='10s'`;
    await sql`select pg_advisory_xact_lock(710012026)`;
    await sql`lock table core.entities, core.entity_sicap_ids, core.entity_redirects, core.direct_acquisitions, reference.authority_uat in share row exclusive mode`;

    const approved = pinned.filter(p => p.approved);
    // The candidate rows, once: the 4.8M-row archive map has no group index.
    // DDL takes no bind parameters: an empty table, then an insert.
    // A second call in the same session (a fixture's savepoints) finds the previous one.
    const [stale] = await sql`select to_regclass('authority_fragment_rows') is not null present`;
    if (stale?.present) await sql`drop table authority_fragment_rows`;
    await sql`create temp table authority_fragment_rows (gid int, raw text, prefix text, target bigint, da_id bigint, holder bigint, raw_id bigint) on commit drop`;
    await sql`
      insert into authority_fragment_rows
      with u as (
        select g.id gid, g.raw, substring(g.raw from ${PREFIX}) prefix
        from identity_repair.groups g where g.identity->>'kind' = 'unresolved'),
      pin as (select * from unnest(${approved.map(p => p.prefix)}::text[], ${approved.map(p => p.targetId)}::bigint[],
                                   ${approved.map(p => p.targetCui)}::text[], ${approved.map(p => p.holderId)}::bigint[]) as x(prefix, target, cui, holder)),
      ut as (
        select u.*, e.id target, null::bigint pinned_holder from u join core.entities e on e.cui_valid and e.cui_canonical = u.prefix
        union all
        select u.*, e.id, pin.holder from u join pin on pin.prefix = u.prefix
          join core.entities e on e.id = pin.target and e.cui_valid and e.cui_canonical = pin.cui
        where not exists (select 1 from core.entities v where v.cui_valid and v.cui_canonical = u.prefix))
      select ut.gid, ut.raw, ut.prefix, ut.target, d.id da_id, d.authority_entity_id holder, d.raw_id
      from ut join identity_repair.source_rows s on s.group_id = ut.gid
        join core.direct_acquisitions d on d.sicap_da_id = s.sicap_da_id
      where d.authority_entity_id is not null and d.authority_entity_id is distinct from ut.target
        and (ut.pinned_holder is null or d.authority_entity_id = ut.pinned_holder)`;
    await sql`create index on authority_fragment_rows(holder)`;
    const holders = await sql`
      with r as (select * from authority_fragment_rows),
      h as (
        select holder, array_agg(distinct target::text) targets, array_agg(distinct prefix) prefixes, array_agg(distinct gid) groups,
          array_agg(distinct raw) raws, count(*)::int planned, count(*) filter (where raw_id is not null)::int live_rows
        from r group by holder)
      select h.holder::text holder_id, h.targets, h.prefixes, h.groups, h.raws, h.planned, h.live_rows,
        e.id is not null holder_exists, coalesce(e.cui_valid, false) cui_valid, e.cui_canonical cui, e.foreign_id_norm foreign_id, coalesce(e.is_foreign, false) is_foreign,
        coalesce((select array_agg(k.namespace||':'||k.sicap_id::text order by k.namespace, k.sicap_id) from core.entity_sicap_ids k where k.entity_id = h.holder), '{}') sicap,
        (select count(*)::int from core.direct_acquisitions d where d.authority_entity_id = h.holder) authority_rows,
        (exists (select 1 from core.direct_acquisitions d where d.supplier_entity_id = h.holder)
          or exists (select 1 from core.notices n where n.authority_entity_id = h.holder)
          or exists (select 1 from core.awards a where a.authority_entity_id = h.holder)
          or exists (select 1 from core.contract_winners w where w.entity_id = h.holder)
          or exists (select 1 from core.ted_notices t where t.buyer_entity_id = h.holder)
          or exists (select 1 from core.ted_lot_winners w where w.entity_id = h.holder)) other_roles,
        (select x.canonical_id::text from core.entity_redirects x where x.old_id = h.holder) holder_redirect,
        exists (select 1 from core.entity_redirects x where x.canonical_id = h.holder) holder_is_target,
        exists (select 1 from core.entity_redirects x where x.old_id::text = any(h.targets)) target_redirected,
        (select u.uat_siruta from reference.authority_uat u where u.entity_id = h.holder) holder_uat,
        case when cardinality(h.targets) = 1 then (select u.uat_siruta from reference.authority_uat u where u.entity_id = h.targets[1]::bigint) end target_uat,
        (to_regclass('identity_repair.dimension') is not null and exists (
          select 1 from identity_repair.dimension dim where dim.sicap_id::text = any(h.prefixes))) prefix_in_dimension
      from h left join core.entities e on e.id = h.holder
      order by h.holder`;

    const outcomes = holders.map(row => planFragment({
      holderId: String(row.holder_id), targets: row.targets, prefixes: row.prefixes, groups: row.groups.map(Number), raws: row.raws,
      planned: Number(row.planned), liveRows: Number(row.live_rows),
      holder: row.holder_exists ? { cuiValid: !!row.cui_valid, cui: row.cui ?? null, foreignId: row.foreign_id ?? null, isForeign: !!row.is_foreign } : null,
      sicap: row.sicap, authorityRows: Number(row.authority_rows), otherRoles: !!row.other_roles,
      holderRedirect: row.holder_redirect ?? null, holderIsTarget: !!row.holder_is_target, targetRedirected: !!row.target_redirected,
      holderUat: row.holder_uat ?? null, targetUat: row.target_uat ?? null, prefixInDimension: !!row.prefix_in_dimension,
    }));
    const merges = outcomes.filter((o): o is Extract<FragmentOutcome, { outcome: 'merge' }> => o.outcome === 'merge');

    const [manifest] = await sql`select document from identity_repair.manifest limit 1`;
    const sourceManifest = manifest?.document ? { rows: manifest.document.rows, files: manifest.document.files, groups: manifest.document.groups } : null;
    const archived: { holderId: string; uat: unknown; sicap: unknown }[] = [];
    for (const m of merges) {
      const holder = m.holderId, target = m.targetId!;
      const plannedRows = sql`select da_id from authority_fragment_rows where holder = ${holder}::bigint`;
      // The moved rows keep every other field: fingerprint before and after, without the authority.
      const [before] = await sql`select count(*)::int n, coalesce(sum(closing_value),0)::text amount,
          coalesce(sum(hashtextextended((to_jsonb(d)-'authority_entity_id')::text,0)::numeric),0)::text fp
        from core.direct_acquisitions d where d.id in (${plannedRows})`;
      if (Number(before!.n) !== m.rows) throw Error(`Fragment ${holder}: planned rows changed during the repair`);
      const [previous] = await identityOf(sql, [holder]);
      const [uatRow] = await sql`select entity_id::text, uat_siruta, population from reference.authority_uat where entity_id = ${holder}::bigint`;
      const sicapRows = await sql`select namespace, sicap_id::text from core.entity_sicap_ids where entity_id = ${holder}::bigint`;
      const moved = await sql`update core.direct_acquisitions d set authority_entity_id = ${target}::bigint
        where d.id in (${plannedRows}) and d.authority_entity_id = ${holder}::bigint returning d.id`;
      if (moved.length !== m.rows) throw Error(`Fragment ${holder}: moved ${moved.length} of ${m.rows} rows`);
      const [after] = await sql`select count(*)::int n, coalesce(sum(closing_value),0)::text amount,
          coalesce(sum(hashtextextended((to_jsonb(d)-'authority_entity_id')::text,0)::numeric),0)::text fp,
          count(*) filter (where authority_entity_id <> ${target}::bigint)::int elsewhere
        from core.direct_acquisitions d where d.id = any(${moved.map(r => r.id)}::bigint[])`;
      const [left] = await sql`select count(*)::int n from core.direct_acquisitions where authority_entity_id = ${holder}::bigint`;
      if (after!.n !== before!.n || after!.amount !== before!.amount || after!.fp !== before!.fp || after!.elsewhere !== 0 || left!.n !== 0)
        throw Error(`Fragment ${holder}: conservation check failed`);
      if (m.uat === 'move') await sql`update reference.authority_uat set entity_id = ${target}::bigint where entity_id = ${holder}::bigint`;
      if (m.uat === 'same') await sql`delete from reference.authority_uat where entity_id = ${holder}::bigint`;
      const dropped = await sql`delete from core.entity_sicap_ids where entity_id = ${holder}::bigint and namespace = 'authority' and sicap_id::text = ${m.prefix!} returning entity_id`;
      if (dropped.length !== 1) throw Error(`Fragment ${holder}: fabricated SICAP id changed during the repair`);
      await sql`update core.entities k set first_seen = least(k.first_seen, f.first_seen), last_seen = greatest(k.last_seen, f.last_seen)
        from core.entities f where f.id = ${holder}::bigint and k.id = ${target}::bigint`;
      const [canonical] = await identityOf(sql, [target]);
      const pin = pinned.find(p => p.holderId === holder && p.targetId === target);
      await sql`insert into core.entity_redirects (old_id, canonical_id, reason, evidence) values (${holder}::bigint, ${target}::bigint, ${AUTHORITY_FRAGMENT_REASON}, ${JSON.stringify({
        version: 1,
        rule: pin ? 'reviewed mistyped CUI prefix of a legacy DA authority string' : 'legacy DA authority string led by the exact valid CUI of the target',
        decision: 'owner, 4 November 2026',
        ...(pin ? { note: pin.evidence } : {}),
        sourceManifest, sourceGroups: m.groups, sourceStrings: m.raws, correctedRows: m.rows,
        previousIdentity: previous!.identity, canonicalIdentity: canonical!.identity,
      })}::jsonb)`;
      archived.push({ holderId: holder, uat: uatRow ?? null, sicap: sicapRows });
    }

    const count = (reason: FragmentSkipReason) => outcomes.filter(o => o.outcome === 'skipped' && o.reason === reason).length;
    const skipped = outcomes.filter(o => o.outcome === 'skipped');
    const [already] = await sql`select count(*)::int n from core.entity_redirects where reason = ${AUTHORITY_FRAGMENT_REASON}`;
    const report = {
      decision: 'owner authorization 4 November 2026', merged: merges.length, movedRows: merges.reduce((n, m) => n + m.rows, 0),
      redirects: Number(already!.n), skipped: skipped.length,
      skippedBy: Object.fromEntries((['holder-missing', 'holder-has-key', 'several-targets', 'sicap-not-fabricated', 'not-fully-evacuated', 'live-rows', 'other-roles',
        'redirected-elsewhere', 'holder-is-redirect-target', 'target-redirected', 'uat-conflict', 'prefix-is-sicap-id'] as FragmentSkipReason[])
        .map(r => [r, count(r)]).filter(([, n]) => Number(n) > 0)),
      pinned: pinned.map(p => ({ holderId: p.holderId, targetId: p.targetId, approved: p.approved })),
      rows: outcomes, archived,
      ...(repair?.status === 'applied' ? { previous: { runId: repair.run_id, report: repair.report } } : {}),
    };
    await sql`insert into app.data_repairs(id,scheduled_day,status,processing_run_id,applied_at,report)
      values(${AUTHORITY_FRAGMENT_REPAIR_ID},${run.run_day}::date,'applied',${runId}::uuid,clock_timestamp(),${JSON.stringify(report)}::jsonb)
      on conflict(id) do update set status='applied',processing_run_id=excluded.processing_run_id,applied_at=excluded.applied_at,report=excluded.report,error=null`;
    const { rows: _rows, archived: _archived, ...summary } = report;
    await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
      values('system:processor','Unirea fragmentelor de autorități din arhivă','authority-fragment-repair','{}'::jsonb,${JSON.stringify({ runId, ...summary })}::jsonb)`;
    log(`Authority fragment repair: ${report.merged} merged (${report.movedRows} acquisitions), ${report.skipped} skipped ${JSON.stringify(report.skippedBy)}`);
    return report;
  });
}

const identityOf = (q: DbSql, ids: string[]) => identityOfTx(q as unknown as Parameters<typeof identityOfTx>[0], ids);
