import type {DbSql} from '@seap/db';
type TransactionSql=Parameters<Parameters<DbSql['begin']>[1]>[0];

/** Daily procurement read models; uses the retained flags without recomputing CRI. */
export async function buildTransactionMarts(q:TransactionSql){
    // Calendar days/years must match SEAP detail pages in Romanian time.
    await q`set local time zone 'Europe/Bucharest'`;
    // ── da_transactions (per-DA investigative read model) ───────────────────
    await q`truncate marts.da_transactions`;
    await q`
      insert into marts.da_transactions
        (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name,
         county, cpv_code, cpv_name, acquisition_type, estimated_value_ron, closing_value,
         publication_date, finalization_date, gap_minutes, da_flags, value_suspect)
      select da.sicap_da_id, da.da_code,
        da.authority_entity_id, a.name_display, da.supplier_entity_id, s.name_display,
        a.county, da.cpv_code, cpv.name_ro, da.acquisition_type,
        da.estimated_value_ron, da.closing_value,
        to_char(da.publication_date, 'YYYY-MM-DD HH24:MI'),
        to_char(da.finalization_date, 'YYYY-MM-DD HH24:MI'),
        case when da.publication_date is not null and da.finalization_date is not null
              and da.finalization_date >= da.publication_date
          then round(extract(epoch from (da.finalization_date - da.publication_date))/60)::int end,
        fl.codes,
        -- implausible recorded value, both directions: over the 2M cap /
        -- ≥100× the estimate (thousand-separator typos: 400.000 instead of
        -- 400), or ≤1% of the estimate (symbolic 1-leu entries: a unit price
        -- or placeholder typed as the total)
        (da.closing_value is not null and (
          da.closing_value > 2000000
          or (da.estimated_value_ron is not null and da.estimated_value_ron > 0
              and (da.closing_value >= 100 * da.estimated_value_ron
                   or da.closing_value <= da.estimated_value_ron / 100))
        ))
      from core.direct_acquisitions da
      left join core.entities a on a.id = da.authority_entity_id
      left join core.entities s on s.id = da.supplier_entity_id
      left join core.cpv_codes cpv on cpv.code = da.cpv_code
      left join (
        select subject_id, array_agg(flag_code) codes
        from core.flags where subject_type = 'da' group by subject_id
      ) fl on fl.subject_id = da.id
      where da.state = 'Oferta acceptata'
    `;
    // Pair-level flags stamped onto their constituent rows: the entity page's
    // "Fracționare sub prag" table filter must surface the acquisitions that
    // make up the flagged pattern, excluding unknown types, other CPV classes
    // and purchases at/above their own applicable ceiling.
    await q`
      update marts.da_transactions dt
      set da_flags = array_append(coalesce(dt.da_flags, '{}'), 'da_split')
      from core.flags f
      where f.flag_code = 'da_split' and f.subject_type = 'pair'
        and f.subject_id = dt.authority_id and f.partner_id = dt.supplier_id
        and left(dt.finalization_date, 4) = f.period
        and f.evidence->'source_ids' ? dt.sicap_da_id::text
        and not ('da_split' = any(coalesce(dt.da_flags, '{}')))
    `;

    // ── agg_* (bare-query shortcuts for the ask engine) ─────────────────────
    // Precomputed answers for completely unfiltered national questions (map,
    // top entities, total, per-year) over BOTH channels. Must mirror the ask
    // engine's live semantics exactly: closing_value > 0, and the 2M DA
    // plausibility plafond as the _plaf variants (contracts always count).
    // Runs here (not in normalize/marts) because da_transactions is final
    // only after this stage.
    await q`
      drop table if exists marts.agg_map_county, marts.agg_top_entities,
                          marts.agg_national, marts.agg_years
    `;
    await q`
      create table marts.agg_map_county as
      select county,
             coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             coalesce(sum(cv), 0) v_all, count(*) n_all
      from (
        select county, closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0
        union all
        select county, closing_value, true from marts.contract_transactions where closing_value > 0
      ) x where county is not null group by county
    `;
    await q`alter table marts.agg_map_county add primary key (county)`;
    await q`
      create table marts.agg_national as
      select src,
             coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             coalesce(sum(cv), 0) v_all, count(*) n_all
      from (
        select 'da'::text src, closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0
        union all
        select 'contracts', closing_value, true from marts.contract_transactions where closing_value > 0
      ) x group by src
    `;
    await q`alter table marts.agg_national add primary key (src)`;
    await q`
      create table marts.agg_years as
      select y,
             coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             coalesce(sum(cv), 0) v_all, count(*) n_all
      from (
        select substr(finalization_date, 1, 4) y, closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0
        union all
        select substr(finalization_date, 1, 4), closing_value, true
        from marts.contract_transactions where closing_value > 0
      ) x where y is not null group by y
    `;
    await q`alter table marts.agg_years add primary key (y)`;
    await q`
      create table marts.agg_top_entities as
      with base as (
        select authority_id eid, 'authority'::text role, authority_name nm, county,
               closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0
        union all
        select authority_id, 'authority', authority_name, county, closing_value, true
        from marts.contract_transactions where closing_value > 0
        union all
        select supplier_id, 'supplier', supplier_name, county, closing_value, (closing_value <= 2000000)
        from marts.da_transactions where closing_value > 0
        union all
        select supplier_id, 'supplier', supplier_name, county, closing_value, true
        from marts.contract_transactions where closing_value > 0
      ), g as (
        select role, eid, max(nm) nm, max(county) county,
               coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
               coalesce(sum(cv), 0) v_all, count(*) n_all
        from base where eid is not null group by role, eid
      )
      select role, eid, nm, county, v_plaf, n_plaf, v_all, n_all from (
        select g.*, row_number() over (partition by role order by v_plaf desc, eid) rv,
                    row_number() over (partition by role order by n_all desc, eid) rn
        from g
      ) r where rv <= 2000 or rn <= 2000
    `;
    await q`alter table marts.agg_top_entities add primary key (role, eid)`;

    // Same publication transaction as the daily sources; retained risk is not recalculated.
    await q`refresh materialized view marts.signal_lookup`;
    await q`analyze marts.signal_lookup`;
    const [row]=await q`select count(*)::int n from marts.da_transactions`;
    return {daTransactions:Number(row!.n)};
}
export async function runTransactionMarts(sql:DbSql,opts:{log?:(message:string)=>void}={}){
 const report=await sql.begin(q=>buildTransactionMarts(q));
 opts.log?.(`transaction marts: da_transactions=${report.daTransactions}`);
 return report;
}
