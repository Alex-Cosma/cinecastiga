import type { DbSql } from "@seap/db";

/**
 * County from the entity's own Romanian NUTS-3 code (data audit F13, 21 October
 * 2026).
 *
 * Only SICAP award winners carry an address county. Authorities created by live
 * ingestion (notice/award/DA lists) and by TED, and DA suppliers, had no county,
 * so their spending fell out of the county map, county filters and county
 * totals, although many of them carry the NUTS-3 code of the same source
 * address (TED buyer address, SICAP winner address). A Romanian NUTS-3 code
 * names exactly one county, so the county is derived from it, for Romanian
 * entities only, and only where the entity has no county.
 *
 * NUTS-3 identifies the address the source gives, like the county field: it is
 * the seat of the institution or firm, not the place of the works. A NUTS-2 or
 * country-level code ("RO32", "RO") does not identify a county and is ignored.
 * Where the ONRC register gives the firm with that CUI a different county, the
 * two sources contradict each other and the county stays unknown.
 *
 * Values use the spelling of `core.entities.county` from the SICAP address
 * (ASCII, as the historical import and the winner addresses store it).
 */
export const RO_NUTS3_COUNTY: Readonly<Record<string, string>> = {
  RO111: "Bihor", RO112: "Bistrita-Nasaud", RO113: "Cluj", RO114: "Maramures",
  RO115: "Satu Mare", RO116: "Salaj",
  RO121: "Alba", RO122: "Brasov", RO123: "Covasna", RO124: "Harghita",
  RO125: "Mures", RO126: "Sibiu",
  RO211: "Bacau", RO212: "Botosani", RO213: "Iasi", RO214: "Neamt",
  RO215: "Suceava", RO216: "Vaslui",
  RO221: "Braila", RO222: "Buzau", RO223: "Constanta", RO224: "Galati",
  RO225: "Tulcea", RO226: "Vrancea",
  RO311: "Arges", RO312: "Calarasi", RO313: "Dambovita", RO314: "Giurgiu",
  RO315: "Ialomita", RO316: "Prahova", RO317: "Teleorman",
  RO321: "Bucuresti", RO322: "Ilfov",
  RO411: "Dolj", RO412: "Gorj", RO413: "Mehedinti", RO414: "Olt", RO415: "Valcea",
  RO421: "Arad", RO422: "Caras-Severin", RO423: "Hunedoara", RO424: "Timis",
};

/** Sources store the code alone ("RO321") or with its label ("RO321 Bucureşti"). */
const NUTS3 = /^(RO[0-9]{3})(?![0-9A-Za-z])/;

/** County named by a Romanian NUTS-3 code, or null when it names none. */
export function countyFromNuts(nutsCode: string | null | undefined): string | null {
  const code = NUTS3.exec((nutsCode ?? "").trim().toUpperCase())?.[1];
  return code ? (RO_NUTS3_COUNTY[code] ?? null) : null;
}

type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

/**
 * Fill the county of Romanian entities that have none from their NUTS-3 code,
 * in the caller's transaction. Idempotent; returns the ids filled now. Runs in
 * the normal normalize stage, before the marts copy `core.entities.county`.
 */
export async function applyNutsCounties(q: TransactionSql): Promise<bigint[]> {
  const codes = Object.keys(RO_NUTS3_COUNTY);
  const counties = codes.map((code) => RO_NUTS3_COUNTY[code]!);
  const [onrc] = await q`select to_regclass('reference.onrc_firm') is not null present`;
  // The ONRC register is a reference import, absent from a fresh database.
  const contradicted = onrc?.present
    ? q`and not exists (
          select 1 from reference.onrc_firm o
          where e.cui_valid and o.cui = e.cui_canonical and nullif(trim(o.county), '') is not null
            and lower(unaccent(trim(o.county))) <> lower(m.county))`
    : q``;
  const rows = await q`
    update core.entities e set county = m.county
    from unnest(${q.array(codes)}::text[], ${q.array(counties)}::text[]) m(nuts, county)
    where nullif(trim(e.county), '') is null
      and e.country_code = 'RO' and not e.is_foreign
      and upper(substring(trim(e.nuts_code) from '^[Rr][Oo][0-9]{3}(?![0-9A-Za-z])')) = m.nuts
      ${contradicted}
    returning e.id
  `;
  return rows.map((row) => BigInt(row.id as string | number | bigint));
}
