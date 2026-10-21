import type { DbSql } from "@seap/db";
import { normForeignId, parseVatPrefixedString } from "./foreign.js";
import { normalizeName } from "./name.js";

/**
 * Direct-award suppliers listed with a foreign VAT number (data audit F18,
 * 21 October 2026).
 *
 * SEAP's DA list names a foreign supplier as "ATU14260100 ECOLAB GMBH". The
 * list parser recognised only a Romanian CUI at the start of the string, so
 * such a supplier had no key and every acquisition created a new entity: on
 * the local snapshot of 1 October, 'ATU14260100 ECOLAB GMBH' had 1,524
 * entities and Shimadzu 1,220, while TED already held both firms under their
 * VAT number (2270107, 2270137). The list parser now reads the prefixed VAT
 * number as the tier-2b key (country + id). This step applies the same key to
 * the entities created before the fix.
 *
 * A fragment qualifies only if it has no key of its own (no valid CUI, no
 * country, no foreign id), its name parses as a VAT number of the exact
 * national format, it is used only as a DA supplier and it takes part in no
 * redirect. Its DAs and SICAP ids move to the entity holding that
 * (country, VAT number), created with the parsed name when none exists, and
 * the fragment row stays with a redirect that records both identities, as the
 * verified repairs of 1 October do. Idempotent; returns the fragment ids
 * redirected now.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export const DA_SUPPLIER_VAT_REASON = "da-supplier-vat-number";

const PREFIX = "^\\s*(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|SE|SI|SK|GB|CHE|NO)[\\s.-]*[A-Za-z]{0,2}[\\s.-]*[0-9]";

/** Same shape the web reads with readConnectionEntities / readMonitoringBindings:
 * the previous and canonical identities a redirect records as evidence. */
export function identityOf(q: TransactionSql, ids: string[]) {
  return q`
    select e.id::text id, jsonb_build_object(
      'id', e.id::text,
      'cui', case when e.cui_valid then e.cui_canonical else null end,
      'foreign', case when e.foreign_id_norm is not null and e.country_code is not null
                      then e.country_code||':'||e.foreign_id_norm else null end,
      'sicap', coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace, s.sicap_id)
                         from core.entity_sicap_ids s where s.entity_id = e.id), '[]'::jsonb),
      'fallback', md5(concat_ws('|', e.name_normalized, e.country_code, e.county))) identity
    from core.entities e where e.id = any(${ids}::bigint[])`;
}

export async function applyDaSupplierVatIdentities(q: TransactionSql): Promise<bigint[]> {
  const candidates = await q`
    select e.id::text id, e.name_display from core.entities e
    where not e.cui_valid and e.foreign_id_norm is null and e.country_code is null
      and e.name_display ~* ${PREFIX}
      and exists (select 1 from core.direct_acquisitions d where d.supplier_entity_id = e.id)
      and not exists (select 1 from core.direct_acquisitions d where d.authority_entity_id = e.id)
      and not exists (select 1 from core.notices n where n.authority_entity_id = e.id)
      and not exists (select 1 from core.awards a where a.authority_entity_id = e.id)
      and not exists (select 1 from core.contract_winners w where w.entity_id = e.id)
      and not exists (select 1 from core.ted_lot_winners w where w.entity_id = e.id)
      and not exists (select 1 from core.ted_notices t where t.buyer_entity_id = e.id)
      and not exists (select 1 from core.entity_redirects r where r.old_id = e.id or r.canonical_id = e.id)
    order by e.id`;

  const groups = new Map<string, { country: string; idNorm: string; idRaw: string; name: string; ids: string[]; raws: Set<string> }>();
  for (const row of candidates) {
    const vat = parseVatPrefixedString(String(row.name_display));
    const idNorm = vat && normForeignId(vat.idRaw);
    if (!vat || !idNorm) continue;
    const key = `${vat.country}:${idNorm}`;
    const group = groups.get(key);
    if (group) {
      group.ids.push(String(row.id));
      group.raws.add(vat.idRaw);
    }
    // The lowest id is the earliest record: its spelling names a new entity.
    else groups.set(key, { country: vat.country, idNorm, idRaw: vat.idRaw, name: vat.name, ids: [String(row.id)], raws: new Set([vat.idRaw]) });
  }

  const redirected: bigint[] = [];
  for (const g of groups.values()) {
    const [held] = await q`
      select core.canonical_entity_id(id)::text id from core.entities
      where not cui_valid and country_code = ${g.country} and foreign_id_norm = ${g.idNorm}`;
    let canonical = held?.id as string | undefined;
    if (!canonical) {
      const { normalized, legalForm } = normalizeName(g.name);
      const [created] = await q`
        insert into core.entities (cui_valid, name_display, name_normalized, legal_form, country_code,
          is_foreign, foreign_id_raw, foreign_id_norm, cui_raw_variants, first_seen, last_seen)
        select false, ${g.name}, ${normalized}, ${legalForm}, ${g.country}, ${g.country !== "RO"},
          ${g.idRaw}, ${g.idNorm}, array[${g.idRaw}::text], min(first_seen), max(last_seen)
        from core.entities where id = any(${g.ids}::bigint[])
        returning id::text id`;
      canonical = String(created!.id);
    }
    const previous = new Map((await identityOf(q, g.ids)).map((r) => [String(r.id), r.identity]));
    await q`update core.direct_acquisitions set supplier_entity_id = ${canonical}
            where supplier_entity_id = any(${g.ids}::bigint[])`;
    await q`update core.entity_sicap_ids set entity_id = ${canonical}
            where entity_id = any(${g.ids}::bigint[])`;
    await q`
      update core.entities k set
        first_seen = least(k.first_seen, f.first_seen),
        last_seen = greatest(k.last_seen, f.last_seen),
        cui_raw_variants = (select array(select distinct unnest(coalesce(k.cui_raw_variants, '{}'::text[]) || ${[...g.raws]}::text[])))
      from (select min(first_seen) first_seen, max(last_seen) last_seen
            from core.entities where id = any(${g.ids}::bigint[])) f
      where k.id = ${canonical}`;
    const [after] = await identityOf(q, [canonical]);
    for (const id of g.ids) {
      await q`
        insert into core.entity_redirects (old_id, canonical_id, reason, evidence)
        values (${id}, ${canonical}, ${DA_SUPPLIER_VAT_REASON}, ${JSON.stringify({
          rule: "DA supplier string led by a foreign VAT number (audit F18)",
          country: g.country,
          vatNumber: g.idNorm,
          previousIdentity: previous.get(id),
          canonicalIdentity: after!.identity,
        })}::jsonb)`;
      redirected.push(BigInt(id));
    }
  }
  return redirected;
}
