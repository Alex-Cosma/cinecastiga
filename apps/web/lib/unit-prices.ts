import { createDb, type DbSql, LEAD_MIN_AWARDS, LEAD_MIN_BUYERS, LEAD_MIN_EXCESS, LEAD_MIN_RATIO, PRICE_FAMILIES, PRICE_GROUP_LABEL, PRICE_UNIT_LABEL, priceFamilyBySlug, pricePackOf, type PriceFamily, type PriceGroup } from "@seap/db";
import { countyKnown, countyName } from "./counties";
import { PRICE_BUYER_COLUMNS, PRICE_BUYER_SORTS, type PriceBuyerSort } from "./price-columns";
import { readFilters } from "./table-filters/codec";
import { channelWhere, facetOf, normalizedPattern, type FilterSource, type Fragment } from "./table-filters/server/query";
import type { Facet, FilterState } from "./table-filters/types";
import { applyPin, clampPage, parsePage, parsePin, parseYear } from "./unit-prices-params";
import { AXIS_FROM, AXIS_TO, DEFAULT_PRICE_ORDER, PRICE_ORDERS, dotOf, type PriceOption, type PriceOrder, type PriceState, type StripDot } from "./unit-prices-shared";
export { DEFAULT_PRICE_ORDER, PRICE_ORDERS, leadHref, priceHref, productHref, type PriceOption, type PriceOrder, type PriceState, type StripDot } from "./unit-prices-shared";

/**
 * Unit prices (owner, 10–11 November 2026): the same product, in the same pack, bought by different institutions in
 * one year, compared per kilogram, litre or piece (marts.unit_price_groups / unit_price_buyers / unit_price_lines,
 * built by apps/ingestion/src/aggregate/unit-prices.ts). Prices are lei without VAT, as SEAP gives them; amounts are
 * contracted, not paid.
 *
 * A lead (owner, 11 November 2026) is the mart's `unit_price_buyers.lead`: at least LEAD_MIN_RATIO times the median,
 * in at least LEAD_MIN_AWARDS awards, at least LEAD_MIN_EXCESS lei above the median, in a group of at least
 * LEAD_MIN_BUYERS institutions. Nothing here decides a lead from the multiple alone: a buyer at twice the median that
 * is not a lead is an ordinary row. A lead is a lead, not proof.
 *
 * Administrators only until the data is complete: every caller checks lib/price-access.ts before reading.
 */
const globalDb = globalThis as unknown as { __seapPriceSql?: DbSql };
const database = () => globalDb.__seapPriceSql ??= createDb().sql;

/** What makes a lead, for the pages' words (packages/db/src/unit-prices.ts; the mart applies them). */
export const LEAD_RULE = { ratio: LEAD_MIN_RATIO, awards: LEAD_MIN_AWARDS, excess: LEAD_MIN_EXCESS, buyers: LEAD_MIN_BUYERS } as const;
/** A product where more than this share of the comparisons sit at twice the median or more mixes brands or kinds more
 * than packs explain (a note on the spread, not a lead test). */
export const MIXED_SHARE = 0.1;
/** Leads loaded under an opened strip (GET /api/preturi/piste); the product page has them all. */
export const STRIP_LEADS = 5;
/** Lead dots drawn on a strip. */
export const STRIP_DOTS = 14;
export const BUYERS_PAGE = 25;

const GROUPS = Object.keys(PRICE_GROUP_LABEL) as PriceGroup[];

export function parsePriceState(sp: Record<string, string | undefined>): PriceState {
  const year = parseYear(sp.an);
  const group = GROUPS.includes(sp.grupa as PriceGroup) ? sp.grupa as PriceGroup : null;
  const product = sp.produs && priceFamilyBySlug(sp.produs) ? sp.produs : null;
  const county = countyKnown(sp.judet) ?? null;
  const order = PRICE_ORDERS.some((o) => o.value === sp.ordine) ? sp.ordine as PriceOrder : DEFAULT_PRICE_ORDER;
  return { year, group: product ? null : group, product, county, order };
}

/** „Apă îmbuteliată” and its pack („sticle de până la 0,75 l”), or the family's label alone. */
export function productNames(family: PriceFamily, pack: string): { name: string; pack: string | null } {
  return { name: family.label, pack: pricePackOf(family, pack)?.label ?? null };
}

export const unitPer = (family: PriceFamily) => PRICE_UNIT_LABEL[family.unit].per;

/** What the reader can type in „Grupă sau produs”: our groups, then our products with their group. */
export function priceOptions(): PriceOption[] {
  const groups = GROUPS.map((g) => {
    const n = PRICE_FAMILIES.filter((f) => f.group === g).length;
    return { kind: "group" as const, value: g, label: PRICE_GROUP_LABEL[g], detail: n === 1 ? "grupă, un produs" : `grupă, ${n} produse` };
  });
  const products = PRICE_FAMILIES.filter((f, i, all) => all.findIndex((o) => o.label === f.label) === i)
    .map((f) => ({ kind: "product" as const, value: f.slug, label: f.label, detail: PRICE_GROUP_LABEL[f.group] }));
  return [...groups, ...products];
}

export interface PriceLead {
  authorityId: string; name: string; county: string | null;
  /** The year of this comparison: an institution is compared with the median of its own year. */
  year: number;
  price: number; median: number; ratio: number; quantity: number; paid: number; excess: number;
  awards: number; lines: number; supplierIds: string[];
  /** The mart's lead flag (see LEAD_RULE); never derived from `ratio` here. */
  lead: boolean;
}

/**
 * A product and pack: its buyers in one year, or across the years (owner, 11 November 2026: all years by default),
 * each buyer always against the median of its own year, so years of different prices never compare.
 */
export interface PriceStrip {
  family: string; pack: string; name: string; packLabel: string | null; group: PriceGroup; per: string;
  /** The year shown, or null for every year. */
  year: number | null; years: number[];
  /** Institutions once each, and their comparisons (an institution in a year). */
  buyers: number; comparisons: number;
  /** The median price; its lowest and highest across the years shown. */
  medianLo: number; medianHi: number;
  /** The spread in multiples of the median: eight comparisons in ten between r10 and r90, half between r25 and r75. */
  r10: number; r25: number; r75: number; r90: number;
  /** No year shown has LEAD_MIN_BUYERS institutions: the strip is drawn, it can have no lead. */
  thin: boolean;
  /** Leads in the county filter (all counties without one), their lei above the median and their largest multiple. */
  leads: number; excess: number; maxRatio: number | null; mixed: boolean;
  /** The largest leads by lei above the median (at most STRIP_DOTS), out of `dotsTotal` (= `leads`). */
  dots: StripDot[]; dotsTotal: number;
  /** Every lead's multiple of the median (two decimals, largest lei first), for a density mark: no names. */
  leadRatios: number[];
  /** The lead the strip names: the largest by lei above the median (`dots[0]`), the same for the same address. */
  named: StripDot | null;
}

export interface PricePage {
  years: number[]; year: number | null;
  /** The year the address asked for that no product has: every year is shown instead, and the page says so. */
  yearMissing: number | null;
  strips: PriceStrip[];
  totals: { leads: number; buyers: number; products: number; excess: number };
  counties: string[];
}

/** The leads of one strip, loaded when it opens (GET /api/preturi/piste). */
export interface StripLeads { leads: PriceLead[]; total: number; suppliers: Record<string, string> }

type LeadRow = { family: string; pack: string; authority_id: string; year: number; name: string | null; county: string | null; price: string; median: string;
  ratio: string; quantity: string; paid: string; excess: string; awards: number; lines: number; supplier_ids: string[]; lead: boolean };
const lead = (r: LeadRow): PriceLead => ({
  authorityId: r.authority_id, name: r.name ?? "Instituție neidentificată", county: countyKnown(r.county) ?? r.county, year: Number(r.year),
  price: Number(r.price), median: Number(r.median), ratio: Number(r.ratio), quantity: Number(r.quantity), paid: Number(r.paid),
  excess: Number(r.excess), awards: r.awards, lines: r.lines, supplierIds: r.supplier_ids ?? [], lead: r.lead === true,
});

const BUYER_COLUMNS_SQL = (q: DbSql) => q`b.family, b.pack, b.authority_id::text, b.year::int, p.name_display name, b.county, b.price::text, b.median::text,
  b.ratio::text, b.quantity::text, b.paid::text, b.excess::text, b.awards, b.lines, b.supplier_ids::text[] supplier_ids, b.lead`;
const yearIs = (q: DbSql, year: number | null) => year ? q`and b.year = ${year}` : q``;
/** The one order of leads everywhere (owner, 11 November 2026): the same address always names the same institution. */
const LEAD_ORDER = (q: DbSql) => q`b.excess desc nulls last, b.ratio desc, b.authority_id, b.year`;

type SpreadRow = { family: string; pack: string; comparisons: number; buyers: number; r10: string; r25: string; r75: string; r90: string;
  over_double: number; med_lo: string; med_hi: string; years: number[]; max_buyers: number };
/** The spreads change with the nightly marts: kept 15 minutes per question, so every year's percentiles (~0,15 s) are
 * counted once, not per visit. */
const SPREAD_TTL_MS = 15 * 60_000;
const spreads = new Map<string, { at: number; rows: Promise<SpreadRow[]> }>();
function spreadOf(q: DbSql, families: string, year: number | null, pack?: string): Promise<SpreadRow[]> {
  const key = `${families}|${year ?? "*"}|${pack ?? "*"}`;
  const hit = spreads.get(key);
  if (hit && Date.now() - hit.at < SPREAD_TTL_MS) return hit.rows;
  if (spreads.size > 400) spreads.clear();
  const rows = countSpread(q, families, year, pack);
  spreads.set(key, { at: Date.now(), rows });
  rows.catch(() => spreads.delete(key));
  return rows;
}
/** Each product and pack's spread in multiples of the median, in one year or across all (marts.unit_price_buyers). */
const countSpread = (q: DbSql, families: string, year: number | null, pack?: string) => q<SpreadRow[]>`
  select b.family, b.pack, count(*)::int comparisons, count(distinct b.authority_id)::int buyers,
    percentile_cont(0.1) within group (order by b.ratio)::text r10, percentile_cont(0.25) within group (order by b.ratio)::text r25,
    percentile_cont(0.75) within group (order by b.ratio)::text r75, percentile_cont(0.9) within group (order by b.ratio)::text r90,
    count(*) filter (where b.ratio >= ${LEAD_MIN_RATIO})::int over_double, min(b.median)::text med_lo, max(b.median)::text med_hi,
    array_agg(distinct b.year::int) years, max(g.buyers)::int max_buyers
  from marts.unit_price_buyers b
  join marts.unit_price_groups g on g.family = b.family and g.pack = b.pack and g.year = b.year
  where b.ratio is not null and b.family = any(string_to_array(${families}, ',')) ${yearIs(q, year)} ${pack == null ? q`` : q`and b.pack = ${pack}`}
  group by b.family, b.pack`;

const stripOf = (g: SpreadRow, family: PriceFamily, year: number | null) => {
  const names = productNames(family, g.pack);
  return { family: g.family, pack: g.pack, name: names.name, packLabel: names.pack, group: family.group, per: unitPer(family),
    year, years: [...g.years].sort((a, b) => a - b), buyers: g.buyers, comparisons: g.comparisons,
    medianLo: Number(g.med_lo), medianHi: Number(g.med_hi), r10: Number(g.r10), r25: Number(g.r25), r75: Number(g.r75), r90: Number(g.r90),
    thin: g.max_buyers < LEAD_MIN_BUYERS, mixed: g.over_double / g.comparisons > MIXED_SHARE };
};

async function supplierNames(q: DbSql, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await q<{ id: string; name: string | null }[]>`select entity_id::text id, name_display name from marts.entity_profile
    where role = 'supplier' and entity_id = any(string_to_array(${[...new Set(ids)].join(",")}, ',')::bigint[])`;
  return Object.fromEntries(rows.map((r) => [r.id, r.name ?? "Furnizor neidentificat"]));
}

const familiesOf = (state: PriceState) => state.product ? [state.product]
  : state.group ? PRICE_FAMILIES.filter((f) => f.group === state.group).map((f) => f.slug)
  : PRICE_FAMILIES.map((f) => f.slug);

type DotRow = { family: string; pack: string; authority_id: string; year: number; name: string | null; county: string | null; price: string; ratio: string; excess: string };
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPricePage(state: PriceState): Promise<PricePage> {
  const q = database();
  const yearsRows = await q<{ year: number }[]>`select distinct year::int from marts.unit_price_groups order by year desc`;
  const years = yearsRows.map((y) => y.year);
  const year = state.year && years.includes(state.year) ? state.year : null;
  const families = familiesOf(state).join(",");
  const [spreads, leads, counties] = await Promise.all([
    spreadOf(q, families, year),
    // Only what a dot shows; a strip's lead rows are loaded when it opens (getStripLeads).
    q<DotRow[]>`
      select b.family, b.pack, b.authority_id::text, b.year::int, p.name_display name, b.county, b.price::text, b.ratio::text, b.excess::text
      from marts.unit_price_buyers b
      left join marts.entity_profile p on p.entity_id = b.authority_id and p.role = 'authority'
      where b.lead and b.family = any(string_to_array(${families}, ',')) ${yearIs(q, year)}
      order by ${LEAD_ORDER(q)}`,
    // Institutions once each (one buys several products, in several years), by county for the filter and its count.
    q<{ county: string | null; n: number }[]>`select b.county, count(distinct b.authority_id)::int n from marts.unit_price_buyers b
      where b.ratio is not null and b.family = any(string_to_array(${families}, ',')) ${yearIs(q, year)} group by b.county`,
  ]);
  const byGroup = new Map<string, StripDot[]>();
  for (const r of leads) if (!state.county || countyKnown(r.county) === state.county) {
    const k = `${r.family}|${r.pack}`;
    (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push({ id: r.authority_id, year: Number(r.year), name: r.name ?? "Instituție neidentificată",
      price: Number(r.price), ratio: Number(r.ratio), excess: Number(r.excess), lead: true });
  }
  const strips: PriceStrip[] = [];
  for (const g of spreads) {
    const family = priceFamilyBySlug(g.family);
    if (!family) continue;
    // Already in the leads' one order (lei above the median first).
    const all = byGroup.get(`${g.family}|${g.pack}`) ?? [];
    strips.push({ ...stripOf(g, family, year), leads: all.length, excess: all.reduce((s, l) => s + l.excess, 0),
      maxRatio: all.length ? Math.max(...all.map((l) => l.ratio)) : null, dots: all.slice(0, STRIP_DOTS), dotsTotal: all.length,
      leadRatios: all.map((l) => round2(l.ratio)), named: all[0] ?? null });
  }
  const label = (s: PriceStrip) => `${s.name} ${s.packLabel ?? ""}`;
  const byLabel = (a: PriceStrip, b: PriceStrip) => label(a).localeCompare(label(b), "ro") || `${a.family}|${a.pack}`.localeCompare(`${b.family}|${b.pack}`);
  strips.sort((a, b) => state.order === "multiplu" ? (b.maxRatio ?? 0) - (a.maxRatio ?? 0) || b.excess - a.excess || byLabel(a, b)
    : state.order === "dublu" ? b.leads - a.leads || b.excess - a.excess || byLabel(a, b)
    : b.excess - a.excess || b.leads - a.leads || byLabel(a, b));
  return {
    years, year, yearMissing: state.year && !year ? state.year : null, strips,
    totals: { leads: strips.reduce((s, x) => s + x.leads, 0), products: strips.length, excess: strips.reduce((s, x) => s + x.excess, 0),
      buyers: counties.filter((c) => !state.county || countyKnown(c.county) === state.county).reduce((s, c) => s + c.n, 0) },
    counties: [...new Set(counties.map((c) => countyKnown(c.county)).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ro")),
  };
}

/**
 * The lead rows of one strip of the list, loaded when the strip opens so the list does not ship the rows of closed
 * strips: `produs`, `ambalaj`, `an`, `judet` and `ordine` as on /preturi. The first STRIP_LEADS in the leads' one order
 * (by the multiple first when the list is ordered by it), and how many there are. Null when the product is unknown.
 */
export async function getStripLeads(sp: Record<string, string | undefined>): Promise<StripLeads | null> {
  const family = priceFamilyBySlug(sp.produs ?? "");
  if (!family) return null;
  const pack = sp.ambalaj ?? "";
  if (family.packs ? !pricePackOf(family, pack) : pack !== "") return { leads: [], total: 0, suppliers: {} };
  const year = parseYear(sp.an), county = countyKnown(sp.judet);
  const q = database();
  const rows = await q<LeadRow[]>`select ${BUYER_COLUMNS_SQL(q)}
    from marts.unit_price_buyers b left join marts.entity_profile p on p.entity_id = b.authority_id and p.role = 'authority'
    where b.lead and b.family = ${family.slug} and b.pack = ${pack} ${yearIs(q, year)}
    order by ${sp.ordine === "multiplu" ? q`b.ratio desc, ` : q``}${LEAD_ORDER(q)}`;
  const inCounty = rows.filter((r) => !county || countyKnown(r.county) === county);
  const leads = inCounty.slice(0, STRIP_LEADS).map(lead);
  return { leads, total: inCounty.length, suppliers: await supplierNames(q, leads.flatMap((l) => l.supplierIds.slice(0, 3))) };
}

// ── one product ─────────────────────────────────────────────────────────────
export interface ProductLine {
  daId: string; date: string | null; name: string | null; unit: string | null; quantity: number | null;
  unitPrice: number | null; measure: number | null; measureSource: string | null; pricePerUnit: number | null;
}
export interface ProductBuyer extends PriceLead { linesShown: ProductLine[]; pinned: boolean }
/** The product and pack's own strip, without the list's dots. */
export type ProductGroup = Omit<PriceStrip, "dots" | "dotsTotal" | "leadRatios" | "named">;
export interface ProductPage {
  family: PriceFamily; pack: string; packs: { slug: string; label: string; buyers: number }[];
  years: number[]; year: number | null;
  /** The year the address asked for that this pack does not have: every year is shown instead, and the page says so. */
  yearMissing: number | null;
  group: ProductGroup | null;
  /** Comparisons per bin of log2(price / median) across the strip's axis, 0,1 wide; the ends collect the rest. */
  bins: number[];
  /** The largest leads by lei above the median (at most PRODUCT_DOTS, the full form), out of `dotsTotal`. */
  dots: StripDot[]; dotsTotal: number;
  /** Every lead's multiple of the median (two decimals, largest lei first), for a density mark. */
  leadRatios: number[];
  /** The rows of this page; a pinned row (`deschis`) stands first. */
  buyers: ProductBuyer[];
  /** Rows under the filters, the page shown (0-based, kept inside `pages`) and how many pages there are. */
  total: number; page: number; pages: number;
  /** Pinned rows brought from another page: the page shows this many rows more than its range. */
  pinnedExtra: number;
  onlyLeads: boolean;
  sort: PriceBuyerSort; dir: "asc" | "desc"; filtered: boolean;
  /** The parameters a funnel's request needs besides the filters (the product, pack, year and which buyers). */
  scope: Record<string, string>;
  suppliers: Record<string, string>;
}
/** Lead dots drawn on the product page's strip. */
export const PRODUCT_DOTS = 40;
/** The histogram shares the strip's axis (unit-prices-shared.ts). */
export const BIN_FROM = AXIS_FROM, BIN_TO = AXIS_TO, BIN_STEP = 0.1;

/**
 * The buyers of one product and pack, in one year or all (each against its own year's median), as one channel of the
 * column filters (lib/price-columns.ts): the funnels count each column's values under the other filters, as on the
 * app's other tables.
 */
export function priceBuyerSource(q: DbSql, slug: string, pack: string, year: number | null, onlyLeads: boolean): FilterSource {
  const matching = (term: string): Fragment => q`(select id from core.entities where name_normalized like ${normalizedPattern(term)})`;
  const named = (role: "authority" | "supplier") => (ids: string[]): Fragment =>
    q`select entity_id::text v, name_display l from marts.entity_profile where role = ${role} and entity_id = any(${q.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`;
  return {
    columns: PRICE_BUYER_COLUMNS,
    labelOf: (key, value) => key === "judet" ? countyName(value) : undefined,
    channels: [{
      name: "unit-price-buyers",
      from: q`marts.unit_price_buyers b`,
      where: q`b.family = ${slug} and b.pack = ${pack} ${yearIs(q, year)} and b.ratio is not null${onlyLeads ? q` and b.lead` : q``}`,
      bindings: {
        institutie: { kind: "list", value: q`b.authority_id::text`, match: (ids) => q`b.authority_id = any(${q.array(ids)}::bigint[])`,
          names: { lookup: named("authority"), search: (term) => q`b.authority_id in ${matching(term)}` } },
        an: { kind: "list", value: q`b.year::text`, match: (ys) => q`b.year = any(${q.array(ys.map(Number))}::int[])` },
        judet: { kind: "list", value: q`b.county` },
        pret: { kind: "range", value: q`b.price` },
        multiplu: { kind: "range", value: q`b.ratio` },
        cantitate: { kind: "range", value: q`b.quantity` },
        peste: { kind: "range", value: q`b.excess` },
        furnizor: { kind: "list", value: q`unnest(b.supplier_ids)::text`, match: (ids) => q`b.supplier_ids && ${q.array(ids)}::bigint[]`,
          names: { lookup: named("supplier"), search: (term) => q`b.supplier_ids && array${matching(term)}::bigint[]`, matches: (term) => q`v::bigint in ${matching(term)}` } },
      },
    }],
  };
}

/** The product, pack, year (null: every year) and population a buyers' request names; null when the product is unknown. */
function productScope(slug: string, sp: Record<string, string | undefined>) {
  const family = priceFamilyBySlug(slug);
  if (!family) return null;
  return { family, wantedPack: sp.ambalaj ?? "", wantedYear: parseYear(sp.an), onlyLeads: sp.toate !== "1" };
}

/** One funnel of a product's buyers. */
export async function getPriceBuyerFacet(sp: Record<string, string | undefined>, key: string, filters: FilterState, term: string): Promise<Facet | null> {
  const scope = productScope(sp.produs ?? "", sp);
  if (!scope) return null;
  const q = database();
  return facetOf(q, priceBuyerSource(q, scope.family.slug, scope.wantedPack, scope.wantedYear, scope.onlyLeads), key, filters, term ? { term } : {});
}

export async function getProductPage(slug: string, sp: Record<string, string | undefined>): Promise<ProductPage | null> {
  const scope = productScope(slug, sp);
  if (!scope) return null;
  const { family, onlyLeads } = scope;
  const q = database();
  const groups = await q<{ pack: string; year: number; buyers: number }[]>`select pack, year::int, buyers from marts.unit_price_groups where family = ${slug}`;
  const packsIn = [...new Set(groups.map((g) => g.pack))];
  const packs = (family.packs?.list ?? []).filter((p) => packsIn.includes(p.slug))
    .map((p) => ({ slug: p.slug, label: p.label, buyers: groups.filter((g) => g.pack === p.slug).reduce((s, g) => s + g.buyers, 0) }));
  const pack = family.packs ? (packs.find((p) => p.slug === scope.wantedPack) ?? [...packs].sort((a, b) => b.buyers - a.buyers)[0])?.slug ?? "" : "";
  const years = [...new Set(groups.filter((g) => g.pack === pack).map((g) => g.year))].sort((a, b) => b - a);
  // Every year by default (owner, 11 November 2026); one year when the address names one this product has.
  const year = scope.wantedYear && years.includes(scope.wantedYear) ? scope.wantedYear : null;
  const yearMissing = scope.wantedYear && !year ? scope.wantedYear : null;
  const sort: PriceBuyerSort = PRICE_BUYER_SORTS.includes(sp.ordine as PriceBuyerSort) && !(sp.ordine === "an" && year) ? sp.ordine as PriceBuyerSort : onlyLeads ? "lei" : "multiplu";
  const dir: "asc" | "desc" = sp.sens === "asc" || (sp.sens !== "desc" && sort === "institutie") ? "asc" : "desc";
  const filters = readFilters(PRICE_BUYER_COLUMNS, (k) => sp[k]);
  if (year) delete (filters as Record<string, unknown>)["an"];
  const filtered = Object.keys(filters).length > 0;
  const requestScope: Record<string, string> = { produs: slug, ambalaj: pack, ...(year ? { an: String(year) } : {}), ...(onlyLeads ? {} : { toate: "1" }) };
  const empty: ProductPage = { family, pack, packs, years, year, yearMissing, group: null, bins: [], dots: [], dotsTotal: 0, leadRatios: [], buyers: [], total: 0, page: 0, pages: 1,
    pinnedExtra: 0, onlyLeads, sort, dir, filtered, scope: requestScope, suppliers: {} };
  const [g] = await spreadOf(q, slug, year, pack);
  if (!g) return empty;
  const nBins = Math.round((BIN_TO - BIN_FROM) / BIN_STEP);
  const [channel] = priceBuyerSource(q, slug, pack, year, onlyLeads).channels;
  const where = channelWhere(q, channel!, filters) ?? q`false`;
  const by: Record<PriceBuyerSort, Fragment> = { lei: q`b.excess`, multiplu: q`b.ratio`, pret: q`b.price`, cantitate: q`b.quantity`, institutie: q`p.name_display`, an: q`b.year` };
  const order = q`${by[sort]} ${dir === "asc" ? q`asc` : q`desc`} nulls last, ${LEAD_ORDER(q)}`;
  const [[stats = { leads: 0, excess: "0", max_ratio: null }], binRows, dotRows, ratioRows, [{ total } = { total: 0 }]] = await Promise.all([
    q<{ leads: number; excess: string; max_ratio: string | null }[]>`
      select count(*) filter (where b.lead)::int leads, coalesce(sum(b.excess) filter (where b.lead), 0)::text excess, max(b.ratio) filter (where b.lead)::text max_ratio
      from marts.unit_price_buyers b where b.family = ${slug} and b.pack = ${pack} ${yearIs(q, year)} and b.ratio is not null`,
    q<{ bin: number; n: number }[]>`select least(greatest(floor((log(2, b.ratio) - ${BIN_FROM}) / ${BIN_STEP})::int, 0), ${nBins - 1}) bin, count(*)::int n
      from marts.unit_price_buyers b where b.family = ${slug} and b.pack = ${pack} ${yearIs(q, year)} and b.ratio > 0 group by 1`,
    q<LeadRow[]>`select ${BUYER_COLUMNS_SQL(q)}
      from marts.unit_price_buyers b left join marts.entity_profile p on p.entity_id = b.authority_id and p.role = 'authority'
      where b.family = ${slug} and b.pack = ${pack} ${yearIs(q, year)} and b.lead order by ${LEAD_ORDER(q)} limit ${PRODUCT_DOTS}`,
    q<{ ratio: string }[]>`select b.ratio::text from marts.unit_price_buyers b
      where b.family = ${slug} and b.pack = ${pack} ${yearIs(q, year)} and b.lead order by ${LEAD_ORDER(q)}`,
    q<{ total: number }[]>`select count(*)::int total from marts.unit_price_buyers b where ${where}`,
  ]);
  const group: ProductGroup = { ...stripOf(g, family, year), leads: stats.leads, excess: Number(stats.excess), maxRatio: stats.max_ratio == null ? null : Number(stats.max_ratio) };
  // A page past the end is the last page, never an empty list that reads as "no institution".
  const { page, pages } = clampPage(parsePage(sp.pagina), total, BUYERS_PAGE);
  const pageRows = await q<LeadRow[]>`select ${BUYER_COLUMNS_SQL(q)}
    from marts.unit_price_buyers b left join marts.entity_profile p on p.entity_id = b.authority_id and p.role = 'authority'
    where ${where} order by ${order} limit ${BUYERS_PAGE} offset ${page * BUYERS_PAGE}`;
  const bins = Array.from({ length: nBins }, (_, i) => binRows.find((b) => b.bin === i)?.n ?? 0);
  // A dot or a lead of the list opens its institution in its year: that row first, opened. It is looked up under the
  // same population and filters as the list (only leads, the columns' filters), so the list never shows a row its
  // heading excludes; a pin the filters leave out opens nothing.
  const pin = parsePin(sp.deschis);
  const pinnedRows = pin ? await q<LeadRow[]>`select ${BUYER_COLUMNS_SQL(q)}
    from marts.unit_price_buyers b left join marts.entity_profile p on p.entity_id = b.authority_id and p.role = 'authority'
    where ${where} and b.authority_id = ${pin.authorityId} ${pin.year ? q`and b.year = ${pin.year}` : q``} order by b.year desc` : [];
  const { rows, extra: pinnedExtra } = applyPin(pageRows, pinnedRows);
  const pinnedKeys = new Set(pinnedRows.map((r) => `${r.authority_id}-${Number(r.year)}`));
  const ids = [...new Set(rows.map((r) => r.authority_id))];
  const lineRows = ids.length ? await q<{ authority_id: string; year: number; da: string; date: string | null; name: string | null; unit: string | null; quantity: string | null;
      unit_price: string | null; measure: string | null; source: string | null; ppu: string | null }[]>`
    select authority_id::text, year, da, date, name, unit, quantity, unit_price, measure, source, ppu from (
      select l.authority_id, l.year::int, l.sicap_da_id::text da, l.finalization_date::text date, l.item_name name, l.unit_raw unit, l.quantity::text quantity,
        l.unit_price::text unit_price, l.measure::text measure, l.measure_source source, l.price_per_unit::text ppu,
        row_number() over (partition by l.authority_id, l.year order by l.price_per_unit desc, l.item_id) rk
      from marts.unit_price_lines l
      where l.family = ${slug} and l.pack = ${pack} and l.status = 'ok' ${year ? q`and l.year = ${year}` : q``}
        and l.authority_id = any(string_to_array(${ids.join(",")}, ',')::bigint[])) s where rk <= 8` : [];
  const num = (v: string | null) => v == null ? null : Number(v);
  const buyers = rows.map((r) => ({ ...lead(r), pinned: pinnedKeys.has(`${r.authority_id}-${Number(r.year)}`),
    linesShown: lineRows.filter((l) => l.authority_id === r.authority_id && Number(l.year) === Number(r.year)).map((l) => ({
      daId: l.da, date: l.date, name: l.name, unit: l.unit, quantity: num(l.quantity), unitPrice: num(l.unit_price), measure: num(l.measure),
      measureSource: l.source, pricePerUnit: num(l.ppu) })) }));
  return { ...empty, group, bins, dots: dotRows.map((r) => dotOf(lead(r))), dotsTotal: stats.leads, leadRatios: ratioRows.map((r) => round2(Number(r.ratio))),
    buyers, total, page, pages, pinnedExtra, suppliers: await supplierNames(q, rows.flatMap((r) => r.supplier_ids ?? [])) };
}

// ── the award's own lines ───────────────────────────────────────────────────
export interface ItemPrice { itemId: string; family: string; pack: string; name: string; packLabel: string | null; per: string; year: number;
  pricePerUnit: number; measure: number; measureSource: string; median: number | null; buyers: number | null;
  /** The institution is a lead for this product, pack and year (the mart's flag) and this line is itself at
   * LEAD_MIN_RATIO times the median or more. */
  lead: boolean }
/** The compared lines of one award, keyed by core.da_items.id, with their product's median that year. */
export async function getAwardItemPrices(sicapDaId: string): Promise<Record<string, ItemPrice>> {
  if (!/^[1-9]\d{0,17}$/.test(sicapDaId)) return {};
  const rows = await database()<{ item_id: string; family: string; pack: string; year: number; ppu: string; measure: string; source: string; median: string | null; buyers: number | null; buyer_lead: boolean }[]>`
    select l.item_id::text, l.family, l.pack, l.year::int, l.price_per_unit::text ppu, l.measure::text, l.measure_source source, g.median::text, g.buyers,
      coalesce(b.lead, false) buyer_lead
    from marts.unit_price_lines l
    left join marts.unit_price_groups g on g.family = l.family and g.pack = l.pack and g.year = l.year
    left join marts.unit_price_buyers b on b.family = l.family and b.pack = l.pack and b.year = l.year and b.authority_id = l.authority_id
    where l.sicap_da_id = ${sicapDaId} and l.status = 'ok'`.catch(() => []);
  const out: Record<string, ItemPrice> = {};
  for (const r of rows) {
    const family = priceFamilyBySlug(r.family);
    if (!family) continue;
    const names = productNames(family, r.pack);
    const median = r.median == null ? null : Number(r.median);
    out[r.item_id] = { itemId: r.item_id, family: r.family, pack: r.pack, name: names.name, packLabel: names.pack, per: unitPer(family), year: r.year,
      pricePerUnit: Number(r.ppu), measure: Number(r.measure), measureSource: r.source, median, buyers: r.buyers,
      lead: r.buyer_lead === true && median != null && median > 0 && Number(r.ppu) / median >= LEAD_MIN_RATIO };
  }
  return out;
}
