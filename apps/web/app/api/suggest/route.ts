import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { cleanName, onrcBirthYear } from "@/lib/format";
import { devlog } from "@/lib/devlog";
import { officialUnitPopulation, sectorSuggestions } from "@/lib/peer-population";
import {
  TIP_LABEL, foldSuggest as fold, prettyUat,
  suggestAuthorities, suggestCpv, suggestPersons, suggestSuppliers, suggestUat,
} from "@/lib/intent/vocabulary-queries";

/**
 * GET /api/suggest?q=…&county=…  — typeahead feed for the "Construiește"
 * builder. One call searches every ground-able vocabulary at once: CPV
 * catalogue and synonyms, localities (reference.uat), authorities and suppliers. The static
 * vocabularies (blocks, measures, counties, years) live client-side.
 */

const g = globalThis as unknown as { __seapSuggestSql?: DbSql };
function db(): DbSql {
  if (!g.__seapSuggestSql) g.__seapSuggestSql = createDb().sql;
  return g.__seapSuggestSql;
}

export interface SuggestResponse {
  cpv: { term: string; cpvName: string | null }[];
  uat: { siruta: number; name: string; tip: string; county: string; population: number | null }[];
  authority: { name: string; county: string | null }[];
  supplier: { name: string; county: string | null }[];
  /** ONRC administrators — "firme conduse de X". */
  person: {
    key: string;
    name: string;
    /** Null when ONRC has no date or an implausible one (see onrcBirthYear). */
    birthYear: number | null;
    birthDateImplausible: boolean;
    birthLocality: string | null;
    nFirms: number;
  }[];
  /** Top-level CPV divisions by spend — starters for the breakdown form. */
  division?: { code: string; name: string }[];
}

/** Biggest authorities + suppliers + CPV divisions, for empty-query starters. */
async function topEntities() {
  const sql = db();
  const pick = (role: string) =>
    sql`
      select ep.name_display, ep.county
      from marts.entity_profile ep
      where ep.role = ${role} and ep.name_display is not null
      order by ep.total_ron_full desc nulls last
      limit 5
    ` as unknown as Promise<{ name_display: string | null; county: string | null }[]>;
  const [authority, supplier, divisions] = await Promise.all([
    pick("authority"),
    pick("supplier"),
    sql`
      select division, name_ro from marts.spend_by_cpv
      where kind = 'all' and name_ro is not null
      order by total_ron desc nulls last
      limit 8
    ` as unknown as Promise<{ division: string; name_ro: string }[]>,
  ]);
  const body: SuggestResponse = {
    cpv: [],
    uat: [],
    authority: authority
      .filter((r) => r.name_display)
      .map((r) => ({ name: cleanName(r.name_display), county: r.county })),
    supplier: supplier
      .filter((r) => r.name_display)
      .map((r) => ({ name: cleanName(r.name_display), county: r.county })),
    person: [],
    division: divisions.map((d) => ({ code: d.division, name: d.name_ro })),
  };
  return NextResponse.json(body, {
    headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = fold(url.searchParams.get("q") ?? "");
  const county = fold(url.searchParams.get("county") ?? "");
  if (q.length < 2) {
    // top=1 → starter suggestions for focal steps (network/sankey/…): the
    // biggest entities by contracted value, so the dropdown is never empty.
    if (url.searchParams.get("top") === "1") return topEntities();
    return NextResponse.json({ cpv: [], uat: [], authority: [], supplier: [], person: [] });
  }
  devlog("suggest", county ? { q, county } : { q });
  const sql = db();
  // One vocabulary, shared with the free-text interpreter (lib/intent).
  const [cpv, uat, authority, supplier, person] = await Promise.all([
    suggestCpv(sql, q),
    suggestUat(sql, q, county),
    suggestAuthorities(sql, q),
    suggestSuppliers(sql, q),
    suggestPersons(sql, q),
  ]);

  const body: SuggestResponse = {
    cpv: cpv.map((r) => ({ term: r.term, cpvName: r.cpv_name })),
    uat: [
      ...uat,
      // reference.uat has no București sectors; they come from the RPL 2021 catalog (owner decision F05).
      ...sectorSuggestions(q, county).map((s) => ({ siruta: s.siruta, name: s.name, tip: "sector", county: "bucuresti", pos: s.pos })),
    ]
      .map((r) => ({ r, population: officialUnitPopulation(Number(r.siruta), r.county) }))
      .sort((a, b) => Number(a.r.pos) - Number(b.r.pos) || (b.population ?? -1) - (a.population ?? -1) || Number(a.r.siruta) - Number(b.r.siruta))
      .slice(0, 6)
      .map(({ r, population }) => ({
        siruta: Number(r.siruta),
        name: prettyUat(r.name),
        tip: TIP_LABEL[String(r.tip ?? "")] ?? "localitate",
        county: r.county ?? "",
        population,
      })),
    authority: authority
      .filter((r) => r.name_display)
      .map((r) => ({ name: cleanName(r.name_display), county: r.county })),
    supplier: supplier
      .filter((r) => r.name_display)
      .map((r) => ({ name: cleanName(r.name_display), county: r.county })),
    person: person.map((r) => ({
      key: r.person_key,
      name: cleanName(r.nm),
      ...onrcBirthYear(r.by, r.sy),
      birthLocality: r.bl && /\p{L}/u.test(r.bl) ? r.bl : null,
      nFirms: Number(r.nf ?? 0),
    })),
  };
  return NextResponse.json(body, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
