import type { DbSql } from "@seap/db";
import { registryNameCorroborates } from "@seap/db";

/**
 * Romanian firms stored with a foreign country (data audit F26, owner decision
 * of 21 October 2026, step 3 (iii)).
 *
 * The resolver keeps the first country a source gave an entity. Some source
 * rows name a foreign country for a Romanian firm with a valid CUI, so
 * Transelectrica (13328043) is stored as DE, BRD (361579) as FR and
 * Nuclearelectrica (10874881) as UK. A valid CUI alone does not prove the firm
 * is Romanian: some foreign registration numbers pass the CUI checksum
 * (L3Harris 813657805, NuScale 883437088).
 *
 * The country becomes RO only when ONRC corroborates the CUI: it registers
 * that number under a name sharing a distinctive token with the entity name,
 * the rule of the ONRC/MF joins (registryNameCorroborates, audit F03). An
 * entity marked foreign is left alone, so its conflict stays visible as
 * "țară de verificat". Only valid-CUI entities change; their monitoring,
 * connection and contract-identity keys are the CUI, never the country, so no
 * approved identity or saved binding changes. Without an ONRC import nothing
 * changes. Idempotent: the resolver never replaces a stored country.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export interface RegistryCountryChange {
  id: bigint;
  previous: string;
}

export async function applyRegistryRomanianCountries(q: TransactionSql): Promise<RegistryCountryChange[]> {
  const [onrc] = await q`select to_regclass('reference.onrc_firm') is not null present`;
  if (!onrc?.["present"]) return [];
  const rows = await q`
    with foreign_coded as (
      select e.id, e.country_code previous from core.entities e
      where e.cui_valid and e.cui_canonical is not null and not coalesce(e.is_foreign, false)
        and nullif(upper(trim(e.country_code)), '') <> 'RO'
        and ${registryNameCorroborates(q, "e")}
      for update)
    update core.entities e set country_code = 'RO'
    from foreign_coded f where e.id = f.id
    returning e.id::text id, f.previous`;
  return rows.map((row) => ({ id: BigInt(String(row.id)), previous: String(row.previous) }));
}
