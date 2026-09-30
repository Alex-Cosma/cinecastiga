import { validateSignalLookup, type DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "../flags/methodology.js";
import { assertCeilingEras } from "../flags/thresholds.js";
import { TED_NORMALIZATION_VERSION } from "../normalize/ted.js";

export interface SnapshotCheck { check: string; passed: boolean; scope: string; details: unknown }
/** SELECT-only consistency checks; caller controls transaction and the writer gate. */
export async function validateBatch1Snapshot(q: DbSql, options: {
  fullProfiles: boolean; allAnnual: boolean; profileLimit?: number; annualLimit?: number;
}, emit?: (check: SnapshotCheck) => void): Promise<SnapshotCheck[]> {
  const { fullProfiles, allAnnual, profileLimit = 100, annualLimit = 500 } = options;
  const checks: SnapshotCheck[] = [];
  const report = (check: string, passed: boolean, scope: string, details: unknown) => {
    const item = { check, passed, scope, details }; checks.push(item); emit?.(item);
  };
  const [ted] = await q`select count(*)::text total,
    count(*) filter (where normalization_version is null or normalization_version < ${TED_NORMALIZATION_VERSION})::text pending,
    count(*) filter (where normalization_version > ${TED_NORMALIZATION_VERSION})::text unexpected_newer
    from core.ted_notices`;
  report("ted_normalization", ted?.["pending"] === "0" && ted?.["unexpected_newer"] === "0", "all TED notices", ted);
  const eraCount = await assertCeilingEras(q);
  report("legal_threshold_registry", true, "all canonical ceiling eras", { eraCount });

  // Full contract population: eligible source records and all allocated rows.
  const [allocations] = await q`
    with has_sub as (select distinct ca_notice_id from core.contracts where title ~* 'subsecvent'),
    winners as (select contract_id, count(distinct entity_id) n from core.contract_winners group by contract_id),
    source as (
      select c.id, c.ca_notice_contract_id, c.contract_value, w.n winners,
        coalesce(c.contract_value > 0 and c.contract_value <= 1000000000 and c.contract_date is not null
          and (c.currency is null or c.currency ilike '%ron%') and a.authority_entity_id is not null and w.n > 0
          and not (coalesce(c.title, '') ~* 'acord[- ]cadru' and coalesce(c.title, '') !~* 'subsecvent'
            and c.ca_notice_id in (select ca_notice_id from has_sub)), false) eligible
      from core.contracts c left join core.awards a on a.ca_notice_id = c.ca_notice_id
      left join winners w on w.contract_id = c.id
    ), allocated as (
      select contract_id, count(*) n, count(distinct supplier_id) suppliers,
        sum(closing_value) total, min(contract_value_full) full_min, max(contract_value_full) full_max,
        min(n_winners) winners_min, max(n_winners) winners_max,
        count(*) filter (where closing_value is null or closing_value <= 0) invalid_values
      from marts.contract_transactions group by contract_id
    ), compared as (
      select s.ca_notice_contract_id::text public_contract_id,
        s.contract_value::text source_value, a.total::text allocated_value,
        s.eligible and a.contract_id is null missing_allocation,
        a.contract_id is not null and not coalesce(s.eligible, false) excluded_but_included,
        a.contract_id is not null and (a.total is distinct from s.contract_value
          or a.full_min is distinct from s.contract_value or a.full_max is distinct from s.contract_value
          or a.n <> a.suppliers or a.n is distinct from s.winners
          or a.winners_min is distinct from s.winners or a.winners_max is distinct from s.winners
          or a.invalid_values > 0) allocation_mismatch
      from source s full join allocated a on a.contract_id = s.id
    ) select count(*)::text contracts_considered,
      count(*) filter (where missing_allocation)::text eligible_missing,
      count(*) filter (where excluded_but_included)::text excluded_included,
      count(*) filter (where allocation_mismatch)::text allocation_mismatches,
      (select coalesce(jsonb_agg(to_jsonb(example)), '[]'::jsonb) from (
        select public_contract_id, source_value, allocated_value from compared
        where missing_allocation or excluded_but_included or allocation_mismatch
        order by public_contract_id nulls last limit 10
      ) example) examples
    from compared
  `;
  report("contract_population_and_allocations", ["eligible_missing", "excluded_included", "allocation_mismatches"].every(k => allocations?.[k] === "0"),
    "all source contracts and contract allocations; every identified winner retains a positive share", allocations);

  const money = await q`
    with da as (
      select coalesce(sum(closing_value), 0) total,
        coalesce(sum(closing_value) filter (where authority_entity_id is not null), 0) authority,
        coalesce(sum(closing_value) filter (where supplier_entity_id is not null), 0) supplier
      from core.direct_acquisitions where state = 'Oferta acceptata' and closing_value > 0 and closing_value <= 2000000
    ), ct as (
      select coalesce(sum(closing_value), 0) total,
        coalesce(sum(closing_value) filter (where authority_id is not null), 0) authority,
        coalesce(sum(closing_value) filter (where supplier_id is not null), 0) supplier
      from marts.contract_transactions where closing_value > 0
    ), comparisons as (
      select 'national_spend' check_name, da.total + ct.total expected,
        (select sum(total_ron) from marts.national_stats where kind = 'spend' and year is null) actual,
        (select count(*) = 1 from marts.national_stats where kind = 'spend' and year is null) rows_valid from da, ct
      union all select 'ask_da', da.total, coalesce((select sum(v_plaf) from marts.agg_national where src = 'da'), 0), true from da
      union all select 'ask_contracts', ct.total, coalesce((select sum(v_plaf) from marts.agg_national where src = 'contracts'), 0), true from ct
      union all select 'authority_profiles', da.authority + ct.authority,
        coalesce((select sum(total_ron_split) from marts.entity_profile where role = 'authority'), 0), true from da, ct
      union all select 'supplier_profiles', da.supplier + ct.supplier,
        coalesce((select sum(total_ron_split) from marts.entity_profile where role = 'supplier'), 0), true from da, ct
    ) select check_name, expected::text expected_exact, actual::text actual_exact,
      rows_valid and expected is not distinct from actual matches from comparisons order by check_name
  `;
  report("canonical_national_and_role_totals", money.every(row => row["matches"] === true), "full accepted positive DA population<=2M and canonical contract allocations", money);

  const [profiles] = await q`
    with selected as (
      select entity_id, role from (
        select entity_id, role,
          row_number() over (partition by role order by entity_id) by_id,
          row_number() over (partition by role order by total_ron_split desc nulls last, entity_id) by_value
        from marts.entity_profile
      ) p where ${fullProfiles} or by_id <= ${profileLimit} or by_value <= ${profileLimit}
    ), components as (
      select authority_entity_id id, 'authority'::text role, sum(closing_value) total, count(*) n_da, 0::bigint n_contracts
      from core.direct_acquisitions where authority_entity_id is not null and state = 'Oferta acceptata'
        and closing_value > 0 and closing_value <= 2000000
        and (${fullProfiles} or authority_entity_id in (select entity_id from selected where role = 'authority')) group by 1
      union all select supplier_entity_id, 'supplier', sum(closing_value), count(*), 0::bigint
      from core.direct_acquisitions where supplier_entity_id is not null and state = 'Oferta acceptata'
        and closing_value > 0 and closing_value <= 2000000
        and (${fullProfiles} or supplier_entity_id in (select entity_id from selected where role = 'supplier')) group by 1
      union all select authority_id, 'authority', sum(closing_value), 0::bigint, count(distinct contract_id)
      from marts.contract_transactions where authority_id is not null and closing_value > 0
        and (${fullProfiles} or authority_id in (select entity_id from selected where role = 'authority')) group by 1
      union all select supplier_id, 'supplier', sum(closing_value), 0::bigint, count(distinct contract_id)
      from marts.contract_transactions where supplier_id is not null and closing_value > 0
        and (${fullProfiles} or supplier_id in (select entity_id from selected where role = 'supplier')) group by 1
    ), expected as (select id, role, sum(total) total, sum(n_da) n_da, sum(n_contracts) n_contracts from components group by id, role),
    displayed as (select p.* from marts.entity_profile p join selected s on s.entity_id = p.entity_id and s.role = p.role),
    compared as (
      select coalesce(e.id, p.entity_id)::text entity_id, coalesce(e.role, p.role) role,
        e.total::text expected_exact, p.total_ron_split::text actual_exact,
        e.total is not distinct from p.total_ron_split and e.total is not distinct from p.total_ron_full
          and e.n_da is not distinct from p.n_das and e.n_contracts is not distinct from p.n_contracts matches
      from expected e full join displayed p on p.entity_id = e.id and p.role = e.role
    ) select count(*)::text checked, count(*) filter (where not matches)::text mismatches,
      (select count(*)::text from marts.entity_profile) available_profiles,
      (select coalesce(jsonb_agg(to_jsonb(example)), '[]'::jsonb) from (
        select entity_id, role, expected_exact, actual_exact from compared where not matches order by role, entity_id limit 10
      ) example) examples from compared
  `;
  report("entity_profile_reconciliation", profiles?.["mismatches"] === "0",
    fullProfiles ? "all entity/roles, including expected but absent profiles" : `deterministic sample: first ${profileLimit} IDs and top ${profileLimit} values per role; missing profiles outside this sample are only covered by the full role-total check`, profiles);

  const [flags] = await q`select count(*)::text total,
    count(*) filter (where methodology_version is distinct from ${METHODOLOGY_VERSION})::text wrong_version from core.flags`;
  report("flag_methodology", flags?.["total"] !== "0" && flags?.["wrong_version"] === "0", "all current flags; this populated dataset is expected to have flags", flags);
  const signalLookup = await validateSignalLookup(q);
  report("complete_signal_lookup", signalLookup.mismatches === "0", "all eligible signal rows, parties, values and sort severity", signalLookup);
  const [references] = await q`select count(*)::text stored_samples,
    count(*) filter (where f.id is null)::text absent_flag_ids,
    count(*) filter (where f.id is not null and (i.flag_code is distinct from f.flag_code
      or i.subject_type is distinct from f.subject_type or i.period is distinct from f.period
      or i.evidence is distinct from f.evidence))::text mismatched_samples
    from marts.flag_instances i left join core.flags f on f.id = i.id`;
  report("flag_sample_references", references?.["stored_samples"] !== "0" && references?.["absent_flag_ids"] === "0" && references?.["mismatched_samples"] === "0",
    "all stored flag_instances; this checks their references, not whether capped samples cover all core flags", references);

  const [annual] = await q`
    with ranked as (
      select id, evidence, row_number() over (partition by period order by id) period_position
      from core.flags where flag_code = 'da_split' and triggered = true
    ), sampled as (
      select id, evidence from ranked order by period_position, id limit ${allAnnual ? null : annualLimit}
    ), compared as (
      select f.id::text flag_id, f.evidence->>'total' recorded_total,
        live.total::text current_total, members.expected_count, live.found,
        jsonb_typeof(f.evidence->'source_ids') = 'array' and members.invalid_count = 0
          and members.expected_count = members.distinct_count
          and members.expected_count = live.found
          and members.expected_count = case when f.evidence->>'count' ~ '^[0-9]{1,18}$' then (f.evidence->>'count')::bigint end
          and live.total = case when f.evidence->>'total' ~ '^-?[0-9]+([.][0-9]+)?$' then (f.evidence->>'total')::numeric end matches
      from sampled f
      cross join lateral (
        select count(*) expected_count, count(distinct item #>> '{}') distinct_count,
          count(*) filter (where jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[0-9]{1,18}$') invalid_count,
          array_agg(distinct (item #>> '{}')::bigint) filter (where jsonb_typeof(item) = 'string' and (item #>> '{}') ~ '^[0-9]{1,18}$') ids
        from jsonb_array_elements(case when jsonb_typeof(f.evidence->'source_ids') = 'array' then f.evidence->'source_ids' else '[]'::jsonb end) item
      ) members
      cross join lateral (
        select count(*) found, coalesce(sum(closing_value), 0) total from core.direct_acquisitions where sicap_da_id = any(members.ids)
      ) live
    ) select (select count(*)::text from ranked) available_flags, count(*)::text checked,
      count(*) filter (where matches is not true)::text mismatches,
      (select coalesce(jsonb_agg(to_jsonb(example)), '[]'::jsonb) from (
        select flag_id, recorded_total, current_total, expected_count, found from compared
        where matches is not true order by flag_id limit 10
      ) example) examples from compared
  `;
  report("annual_signal_source_membership", annual?.["mismatches"] === "0",
    allAnnual ? "all annual split signals; exact recorded IDs/counts/current numeric sums" : `up to ${annualLimit} signals, interleaved across periods then flag ID; does not verify untested signals or unchanged individual historical rows`, annual);

  const coverage = await q`
    with expected(dataset, kind, keys) as (values
      ('da', 'object', array['available','included','missing_date','missing_cpv','missing_raw','date_from','date_to']),
      ('contracts', 'object', array['available','included','allocations','missing_date','missing_cpv','missing_currency','date_from','date_to']),
      ('ted', 'object', array['available','results','unknown_competition','unverified','missing_date','missing_cpv','date_from','date_to']),
      ('years', 'array', array[]::text[]))
    select e.dataset, c.calculated_at::text calculated_at, jsonb_typeof(c.observation) actual_kind,
      coalesce(jsonb_typeof(c.observation) = e.kind and
        case when e.kind = 'object' then c.observation ?& e.keys else true end, false) matches
    from expected e left join marts.data_coverage c on c.dataset = e.dataset order by e.dataset
  `;
  report("coverage_observations", coverage.length === 4 && coverage.every(row => row["matches"] === true),
    "DA/contracts/TED object shape and required keys; years array exists. Does not establish external source completeness.", coverage);
  return checks;
}
