import { createDb } from "@seap/db";

/**
 * Safe exact-name entity merge (tier-2c, batch). Collapses no-id entities that
 * share EXACT normalized name + same NUTS + same country — two corroborating
 * signals, so the false-merge risk that bare name matching carries is contained.
 * Only touches entities WITHOUT a valid CUI and WITHOUT a foreign/RO merge id
 * (i.e. the residual name-only fragments); CUI/id-keyed entities are never merged.
 *
 * Keeper per group = lowest id. All entity references are repointed to it, then
 * the loser rows are deleted. Idempotent (a second run finds no groups).
 *
 *   pnpm --filter ingestion merge-exact-name
 */
async function main(): Promise<void> {
  const { sql } = createDb();
  const log = (m: string) => console.log(m);

  // Build the keeper map server-side: (name_normalized, nuts, country) group with
  // >1 no-id member → keep min(id), map every other member to it. Guards: name
  // >= 5 chars, nuts present (the corroborating signal). Materialize to a temp
  // table so the repoints below are pure set-based SQL (no JS round-trip).
  await sql`create temp table _merge_map (loser bigint primary key, keep bigint not null)`;
  const mapped = await sql`
    insert into _merge_map (loser, keep)
    with no_id as (
      select id, name_normalized,
             coalesce(nuts_code, '') nz, coalesce(country_code, 'RO') cc
      from core.entities
      where cui_valid = false and foreign_id_norm is null
        and length(name_normalized) >= 5
    ),
    grp as (
      select name_normalized, nz, cc, min(id) keep
      from no_id
      where nz <> ''
      group by name_normalized, nz, cc
      having count(*) > 1
    )
    select n.id as loser, g.keep
    from grp g
    join no_id n
      on n.name_normalized = g.name_normalized and n.nz = g.nz and n.cc = g.cc
    where n.id <> g.keep
  `;
  log(`exact-name merge: ${mapped.count} loser rows → keepers`);
  if (mapped.count === 0) {
    await sql`drop table _merge_map`;
    await sql.end();
    return;
  }

  // Link tables have composite PKs → insert keeper edge where absent, then drop
  // loser edges (a plain UPDATE would collide on the PK).
  await sql`
    insert into core.contract_winners (contract_id, entity_id)
    select cw.contract_id, m.keep from core.contract_winners cw
    join _merge_map m on m.loser = cw.entity_id
    on conflict do nothing`;
  await sql`delete from core.contract_winners cw using _merge_map m where m.loser = cw.entity_id`;

  await sql`
    insert into core.ted_lot_winners (lot_result_id, entity_id)
    select tlw.lot_result_id, m.keep from core.ted_lot_winners tlw
    join _merge_map m on m.loser = tlw.entity_id
    on conflict do nothing`;
  await sql`delete from core.ted_lot_winners tlw using _merge_map m where m.loser = tlw.entity_id`;

  // Plain FK columns → straight repoint.
  await sql`update core.direct_acquisitions d set authority_entity_id = m.keep from _merge_map m where m.loser = d.authority_entity_id`;
  await sql`update core.direct_acquisitions d set supplier_entity_id = m.keep from _merge_map m where m.loser = d.supplier_entity_id`;
  await sql`update core.notices n set authority_entity_id = m.keep from _merge_map m where m.loser = n.authority_entity_id`;
  await sql`update core.awards a set authority_entity_id = m.keep from _merge_map m where m.loser = a.authority_entity_id`;
  await sql`update core.ted_notices t set buyer_entity_id = m.keep from _merge_map m where m.loser = t.buyer_entity_id`;
  await sql`
    insert into core.entity_sicap_ids (namespace, sicap_id, entity_id)
    select s.namespace, s.sicap_id, m.keep from core.entity_sicap_ids s
    join _merge_map m on m.loser = s.entity_id
    on conflict do nothing`;
  await sql`delete from core.entity_sicap_ids s using _merge_map m where m.loser = s.entity_id`;
  // Name-suggestion pairs pointing at a loser are now moot → drop them.
  await sql`delete from core.entity_name_suggestions es using _merge_map m where m.loser = es.entity_a or m.loser = es.entity_b`;

  // Carry any richer fields onto the keeper, then delete losers.
  await sql`
    update core.entities k set
      county    = coalesce(k.county, l.county),
      nuts_code = coalesce(k.nuts_code, l.nuts_code),
      country_code = coalesce(k.country_code, l.country_code),
      first_seen = least(k.first_seen, l.first_seen),
      last_seen  = greatest(k.last_seen, l.last_seen)
    from _merge_map m join core.entities l on l.id = m.loser
    where k.id = m.keep`;

  const del = await sql`delete from core.entities e using _merge_map m where m.loser = e.id`;
  log(`merged: deleted ${del.count} loser entities`);
  await sql`drop table _merge_map`;
  await sql.end();
}

main().catch(async (err) => {
  console.error("merge-exact-name crashed:", err);
  process.exit(1);
});
