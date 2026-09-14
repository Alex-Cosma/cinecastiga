import { NextResponse } from "next/server";
import { createDb, type DbSql } from "@seap/db";
import { cleanName } from "@/lib/format";
import { devlog } from "@/lib/devlog";
import { aliasQueries, queryTokens } from "@/lib/ask/entity-alias";

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

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "MUNICIPIUL  CLUJ-NAPOCA" → "Cluj-Napoca" (registry names are shouty). */
function prettyUat(name: string): string {
  const stripped = name
    .replace(/^\s*(municipiul|oras|oraş|oraș)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return stripped.replace(/(^|[\s\-".(])(\p{L})/gu, (m, pre, ch: string) => pre + ch.toUpperCase());
}

const TIP_LABEL: Record<string, string> = {
  "1": "municipiu",
  "2": "oraș",
  "3": "comună",
  "4": "municipiu",
  "9": "municipiu",
};

export interface SuggestResponse {
  cpv: { term: string; cpvName: string | null }[];
  uat: { siruta: number; name: string; tip: string; county: string; population: number | null }[];
  authority: { name: string; county: string | null }[];
  supplier: { name: string; county: string | null }[];
  /** ONRC administrators — "firme conduse de X". */
  person: {
    key: string;
    name: string;
    birthYear: number | null;
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
  const like = `%${q}%`;
  // Bind text[] explicitly, including on the first request before the driver
  // has discovered array types. Otherwise a string array can bind as text.
  const textArray = (values: string[]) => sql.typed(values, 1009);
  // institutional aliases ("primaria X" → "municipiul X") + all-tokens fallback
  const authPats = aliasQueries(q).map((a) => `%${a}%`);
  const toks = queryTokens(q).map((t) => `%${t}%`);
  const authTokFrag =
    toks.length > 1
      ? sql`or lower(unaccent(ep.name_display)) like all(${textArray(toks)}::text[])`
      : sql``;
  const supTokFrag = authTokFrag;
  // A CPV code typed directly ("45", "45233", "45233120-6") → catalog by prefix.
  const codeM = /^(\d{2,8})(?:-\d)?$/.exec(q.replace(/\s+/g, ""));
  // Search the official Romanian labels as well as colloquial synonyms.
  // Separate words tolerate intervening words, word order and inflections
  // such as "spatii" inside "spatiilor". Punctuation is not a SQL wildcard.
  const cpvWords = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const cpvPhrase = cpvWords.join(" ");
  const cpvPatterns = cpvWords.map((word) => `%${word}%`);

  const [cpv, uat, authority, supplier, person] = await Promise.all([
    codeM
      ? (sql`
          select c.code as term, c.name_ro as cpv_name
          from core.cpv_codes c
          where c.code like ${codeM[1] + "%"}
          order by length(c.code), c.code
          limit 5
        ` as unknown as Promise<{ term: string; cpv_name: string | null }[]>)
      : (sql`
          with catalog_matches as (
            select c.code as term, c.name_ro as cpv_name,
                   case
                     when lower(unaccent(c.name_ro)) = ${cpvPhrase} then 0
                     when lower(unaccent(c.name_ro)) like ${cpvPhrase + "%"} then 1
                     when lower(unaccent(c.name_ro)) like ${"%" + cpvPhrase + "%"} then 2
                     else 3
                   end as priority,
                   length(c.name_ro) as label_length
            from core.cpv_codes c
            where ${cpvWords.length > 0}
              and lower(unaccent(c.name_ro)) like all(${textArray(cpvPatterns)}::text[])
          ), synonym_matches as (
            select distinct on (s.term) s.term,
                   (select c.name_ro from core.cpv_codes c
                    where c.code like s.cpv_prefix || '%'
                    order by length(c.code), c.code limit 1) cpv_name,
                   case when lower(unaccent(s.term)) = ${cpvPhrase} then 0 else 4 end as priority,
                   length(s.term) as label_length
            from reference.cpv_synonym s
            where ${cpvWords.length > 0}
              and lower(unaccent(s.term)) like all(${textArray(cpvPatterns)}::text[])
            order by s.term, length(s.cpv_prefix) desc, s.cpv_prefix
          )
          select term, cpv_name from (
            select * from catalog_matches
            union all
            select * from synonym_matches
          ) matches
          order by priority, label_length, term
          limit 8
        ` as unknown as Promise<{ term: string; cpv_name: string | null }[]>),
    sql`
      select u.siruta, u.name, u.tip, u.county, u.population
      from reference.uat u
      where lower(unaccent(u.name)) like ${like}
        and (${county} = '' or u.county = ${county})
      order by position(${q} in lower(unaccent(u.name))), u.population desc nulls last
      limit 6
    ` as unknown as Promise<
      { siruta: number; name: string; tip: string | null; county: string | null; population: number | null }[]
    >,
    sql`
      select name_display, county from (
        select distinct on (lower(unaccent(ep.name_display)))
               ep.name_display, ep.county, ep.total_ron_full
        from marts.entity_profile ep
        where ep.role = 'authority'
          and (lower(unaccent(ep.name_display)) like any(${textArray(authPats)}::text[]) ${authTokFrag})
        order by lower(unaccent(ep.name_display)), ep.total_ron_full desc nulls last
      ) d
      order by d.total_ron_full desc nulls last
      limit 5
    ` as unknown as Promise<{ name_display: string | null; county: string | null }[]>,
    sql`
      select name_display, county from (
        select distinct on (lower(unaccent(ep.name_display)))
               ep.name_display, ep.county, ep.total_ron_full
        from marts.entity_profile ep
        where ep.role = 'supplier'
          and (lower(unaccent(ep.name_display)) like ${like} ${supTokFrag})
        order by lower(unaccent(ep.name_display)), ep.total_ron_full desc nulls last
      ) d
      order by d.total_ron_full desc nulls last
      limit 5
    ` as unknown as Promise<{ name_display: string | null; county: string | null }[]>,
    // ONRC administrators (solid identities only: name + birth data). ilike
    // rides the trigram GIN index; needs 4+ chars to stay cheap on 3.7M rows.
    q.length >= 4
      ? (sql`
          select r.person_key, max(r.person_name) nm,
                 max(extract(year from r.birth_date))::int by,
                 max(r.birth_locality) bl, count(distinct r.cui) nf
          from reference.company_reps r
          where r.birth_date is not null and r.person_name ilike ${like}
          group by r.person_key
          order by nf desc
          limit 4
        ` as unknown as Promise<
          { person_key: string; nm: string; by: number | null; bl: string | null; nf: string }[]
        >)
      : Promise.resolve([]),
  ]);

  const body: SuggestResponse = {
    cpv: cpv.map((r) => ({ term: r.term, cpvName: r.cpv_name })),
    uat: uat.map((r) => ({
      siruta: Number(r.siruta),
      name: prettyUat(r.name),
      tip: TIP_LABEL[String(r.tip ?? "")] ?? "localitate",
      county: r.county ?? "",
      population: r.population === null ? null : Number(r.population),
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
      birthYear: r.by === null ? null : Number(r.by),
      birthLocality: r.bl && /\p{L}/u.test(r.bl) ? r.bl : null,
      nFirms: Number(r.nf ?? 0),
    })),
  };
  return NextResponse.json(body, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
