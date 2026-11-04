-- Read-only preview of the authority fragment repair (owner decision, 4 November 2026).
-- Mirrors planFragment in apps/ingestion/src/reference/authority-fragment-repair.ts
-- (CUI rule only; the pinned Tibucani entry, approved 4 Nov, adds 1 fragment / 114 rows). Changes nothing.
--   ssh seap@<server> 'docker exec -i cinecastiga-postgres-1 psql -U seap -d seap' < dry-run.sql
set statement_timeout = '180s';
set default_transaction_read_only = on;

with u as (
  select g.id gid, g.raw, substring(g.raw from '^\s*(?:RO)?\s*([0-9]{2,10})\M') prefix
  from identity_repair.groups g where g.identity->>'kind' = 'unresolved'),
ut as (select u.*, e.id target from u join core.entities e on e.cui_valid and e.cui_canonical = u.prefix),
r as (
  select ut.gid, ut.raw, ut.prefix, ut.target, d.id da_id, d.authority_entity_id holder, d.raw_id, d.closing_value
  from ut join identity_repair.source_rows s on s.group_id = ut.gid
    join core.direct_acquisitions d on d.sicap_da_id = s.sicap_da_id
  where d.authority_entity_id is not null and d.authority_entity_id is distinct from ut.target),
h as (
  select holder, array_agg(distinct target::text) targets, array_agg(distinct prefix) prefixes, count(*)::int planned,
    count(*) filter (where raw_id is not null)::int live_rows, sum(closing_value) amount
  from r group by holder),
f as (
  select h.*, e.id is not null holder_exists, coalesce(e.cui_valid, false) cui_valid, e.cui_canonical cui, e.foreign_id_norm foreign_id, coalesce(e.is_foreign, false) is_foreign,
    coalesce((select array_agg(k.namespace||':'||k.sicap_id::text) from core.entity_sicap_ids k where k.entity_id = h.holder), '{}') sicap,
    (select count(*)::int from core.direct_acquisitions d where d.authority_entity_id = h.holder) authority_rows,
    (exists (select 1 from core.direct_acquisitions d where d.supplier_entity_id = h.holder)
      or exists (select 1 from core.notices n where n.authority_entity_id = h.holder)
      or exists (select 1 from core.awards a where a.authority_entity_id = h.holder)
      or exists (select 1 from core.contract_winners w where w.entity_id = h.holder)
      or exists (select 1 from core.ted_notices t where t.buyer_entity_id = h.holder)
      or exists (select 1 from core.ted_lot_winners w where w.entity_id = h.holder)) other_roles,
    exists (select 1 from core.entity_redirects x where x.old_id = h.holder) holder_redirect,
    exists (select 1 from core.entity_redirects x where x.canonical_id = h.holder) holder_is_target,
    exists (select 1 from core.entity_redirects x where x.old_id::text = any(h.targets)) target_redirected,
    (select u.uat_siruta from reference.authority_uat u where u.entity_id = h.holder) holder_uat,
    case when cardinality(h.targets) = 1 then (select u.uat_siruta from reference.authority_uat u where u.entity_id = h.targets[1]::bigint) end target_uat,
    exists (select 1 from identity_repair.dimension dim where dim.sicap_id::text = any(h.prefixes)) prefix_in_dimension
  from h left join core.entities e on e.id = h.holder),
o as (
  select f.*, case
    when not holder_exists then 'holder-missing'
    when cui_valid or cui is not null or foreign_id is not null or is_foreign then 'holder-has-key'
    when cardinality(targets) <> 1 or cardinality(prefixes) <> 1 then 'several-targets'
    when cardinality(sicap) <> 1 or sicap[1] <> 'authority:'||prefixes[1] then 'sicap-not-fabricated'
    when prefix_in_dimension then 'prefix-is-sicap-id'
    when live_rows > 0 then 'live-rows'
    when authority_rows <> planned then 'not-fully-evacuated'
    when other_roles then 'other-roles'
    when holder_redirect then 'redirected-elsewhere'
    when holder_is_target then 'holder-is-redirect-target'
    when target_redirected then 'target-redirected'
    when holder_uat is not null and target_uat is not null and holder_uat <> target_uat then 'uat-conflict'
    else 'merge' end outcome,
    case when holder_uat is null then 'none' when target_uat is null then 'move' else 'same' end uat
  from f)
select outcome, case when outcome = 'merge' then uat end uat, count(*) holders, sum(planned) rows, round(sum(amount)) amount
from o group by 1, 2 order by 1, 2;

select count(*) already_redirected from core.entity_redirects where reason = 'legacy-authority-cui-prefix';
