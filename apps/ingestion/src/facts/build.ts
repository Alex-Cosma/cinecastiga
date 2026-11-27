import type { DbSql } from "@seap/db";

/*
 * „Știați că” (owner, 26 November 2026; migration 0118): the proposals of one processing run. Facts of impact only:
 * shares, very many records, large sums; never a petty unit price. A run writes the numbers of each fact (app.facts
 * `data`); the site composes the words from them (apps/web/lib/fact-words.ts) and an administrator chooses what is
 * published (Admin → Știați că). Nothing here is public by itself.
 *
 * Every figure comes from the counted marts of this run (contracts held out of the totals are not in them). A fact
 * that names an entity is skipped when the name looks like a person's (PFA, cabinet, întreprindere individuală), and
 * asks for a look when the entity has a contract held as a probable error.
 *
 * Offline: no source traffic. One transaction; a failure leaves the proposals as they were.
 */

/** Entities whose name is a person's are never named in a fact (owner's rule). */
const PERSON_NAME = /(^|[^a-z])(p\.?\s?f\.?\s?a\.?|persoan[aă] fizic[aă]|cabinet|[iî]ntreprindere (individual[aă]|familial[aă])|[iî]\.\s?i\.|medic|avocat|notar|expert contabil|birou individual)([^a-z]|$)/i;
export const looksLikePerson = (name: string | null | undefined): boolean => !name || PERSON_NAME.test(name);

export type FactKind = "share" | "count" | "sum" | "record" | "pattern";
export interface FactProposal {
  key: string; recipe: string; kind: FactKind; data: Record<string, unknown>;
  entityIds?: string[]; look?: string;
}

const MIN_FIRM_TOTAL = 1_000_000;        // a firm „with public contracts”: at least 1 mil. lei
const ONE_CLIENT_SHARE = 0.9;            // „one public client”: 90% of its value from one institution
const MIN_INSTITUTION_TOTAL = 10_000_000; // an institution counted for concentration: at least 10 mil. lei
const NAMED_MAJORITY_TOTAL = 100_000_000; // an institution named for one firm's majority: at least 100 mil. lei
const NAMED_MAJORITY_SHARE = 0.8;
const MAJORITY_YEAR_SHARE = 0.05; // a year counts as one of the firm's years when it holds at least 5% of the pair's value
const COUNTY_RECORD_MIN = 50_000_000;     // a county's largest contract of the year is a fact from 50 mil. lei
const MANY_DIRECT = 3_000;                // „very many” direct acquisitions of one institution in a year
const DECEMBER_SHARE = 0.12;              // December is a fact when it holds at least 12% of the year

// The second set of recipes (owner, 27 November 2026: about a hundred facts to choose from, „le vei face tu”).
const DOMAINS = 12;                       // the year's largest domains (CPV divisions)
const DOMAIN_MIN_SHARE = 0.005;           // each at least 0.5% of the year
const BUYERS = 6;                         // the institutions with the largest value of the year, named
const FOREIGN_COUNTRIES = 3;              // the countries whose firms won most
const FOREIGN_COUNTRY_MIN = 1_000_000_000;
const TOWNS_PER_CAPITA = 10;              // town halls by lei per inhabitant
const TOWN_MIN_PEOPLE = 100;
const TOWN_MIN_VALUE = 5_000_000;
const MANY_BUYERS_FIRMS = 5;              // the firms with the most institutions as clients in a year
const MANY_BUYERS_MIN_VALUE = 1_000_000;
const PAIRS = 5;                          // an institution and a firm with the most contracts in a year
const PAIR_MIN_VALUE = 10_000_000;
const COUNTY_ENDS = 3;                    // the counties at each end of a ranking
const PAST_YEARS = 4;                     // a year against the one four years before
const NO_NOTICE = "Negociere fara publicare prealabila";
/** The signals a fact counts, and what one flagged subject is. A signal is a lead, never proof. */
const SIGNALS: Record<string, "firms" | "institutions" | "records"> = {
  net_shared_admin: "firms", fin_public_reliance: "firms", fin_tiny_staff: "firms", da_capacity: "firms", da_dependence: "firms",
  da_year_end: "institutions", da_first_month_buyer: "institutions", da_split: "institutions", da_concentration: "institutions",
  da_round: "records", da_above_ceiling: "records", award_calloffs_over_ceiling: "records",
};
const SIGNAL_MIN = 100;
const LOOK_SEAT = "Țara firmei e cea declarată în SEAP; în consorții valoarea e împărțită egal între membri. Verifică firmele mari înainte de publicare.";
const LOOK_TOWN = "O valoare greșită la sursă schimbă mult cifra pe locuitor. Verifică în pagina primăriei contractele mari ale anului.";
const LOOK_PAIR = "Numără înregistrările de contract, cu loturi și contracte subsecvente. Verifică pe pagina instituției.";

const num = (v: unknown): number => Number(v ?? 0);

/** The proposals of this run, from the marts as they stand. `year`: the last complete calendar year. */
export async function factProposals(q: DbSql, year: number): Promise<FactProposal[]> {
  const out: FactProposal[] = [];
  const y = String(year);

  const [firms] = await q`
    with s as (
      select p.total_ron_split t, tp.total_ron top
      from marts.entity_profile p
      join marts.entity_top_partners tp on tp.entity_id = p.entity_id and tp.role = p.role and tp.rank = 1
      where p.role = 'supplier' and p.total_ron_split >= ${MIN_FIRM_TOTAL} and not coalesce(p.is_foreign, false))
    select count(*)::int firms, count(*) filter (where top >= ${ONE_CLIENT_SHARE} * t)::int one from s`;
  if (num(firms?.firms) >= 1000) out.push({ key: "firms_one_client", recipe: "firms_one_client", kind: "share",
    data: { firms: num(firms!.firms), one: num(firms!.one), share: num(firms!.one) / num(firms!.firms), minTotal: MIN_FIRM_TOTAL, threshold: ONE_CLIENT_SHARE } });

  const [inst] = await q`
    select count(*)::int institutions, count(*) filter (where top_supplier_pct >= 0.5)::int majority
    from marts.authority_concentration where total_ron >= ${MIN_INSTITUTION_TOTAL}`;
  if (num(inst?.institutions) >= 100) out.push({ key: "institutions_one_firm", recipe: "institutions_one_firm", kind: "share",
    data: { institutions: num(inst!.institutions), majority: num(inst!.majority), share: num(inst!.majority) / num(inst!.institutions), minTotal: MIN_INSTITUTION_TOTAL } });

  const [top] = await q`
    with s as (select supplier_id, sum(closing_value) v from marts.contract_transactions where left(finalization_date, 4) = ${y} group by 1)
    select (select count(*) from s)::int firms, (select sum(v) from s)::text total,
      (select sum(v) from (select v from s order by v desc limit 10) a)::text top10,
      (select sum(v) from (select v from s order by v desc limit 100) b)::text top100`;
  if (num(top?.firms) >= 1000 && num(top?.total) > 0) out.push({ key: `top_firms_share:${y}`, recipe: "top_firms_share", kind: "share",
    data: { year, firms: num(top!.firms), total: num(top!.total), top10: num(top!.top10) / num(top!.total), top100: num(top!.top100) / num(top!.total) } });

  // The largest contract of the year, in the country and in each county (the buyer's): a record with names.
  const records = await q`
    with c as (
      select t.contract_id, max(t.contract_value_full) v, max(t.authority_id) authority_id, max(t.authority_name) authority, max(t.county) county,
        max(t.finalization_date) signed, jsonb_agg(jsonb_build_object('id', t.supplier_id::text, 'name', t.supplier_name) order by t.supplier_name) suppliers
      from marts.contract_transactions t where left(t.finalization_date, 4) = ${y} group by t.contract_id),
    r as (select c.*, row_number() over (order by v desc) national, row_number() over (partition by county order by v desc) in_county from c)
    select r.contract_id::text id, k.ca_notice_contract_id::text nat, r.v::text v, r.authority_id::text authority_id, r.authority, r.county, r.signed, r.suppliers,
      left(regexp_replace(coalesce(k.title, ''), '\\s+', ' ', 'g'), 200) title, r.national, r.in_county
    from r join core.contracts k on k.id = r.contract_id
    where r.national = 1 or (r.in_county = 1 and r.county is not null and r.v >= ${COUNTY_RECORD_MIN})
    order by r.v desc`;
  for (const r of records) {
    const suppliers = (r.suppliers as { id: string; name: string | null }[]) ?? [];
    if (looksLikePerson(r.authority) || suppliers.some((s) => looksLikePerson(s.name))) continue;
    const data = { year, natId: String(r.nat), value: num(r.v), authorityId: String(r.authority_id), authority: r.authority, suppliers, title: r.title, signed: r.signed };
    const entityIds = [String(r.authority_id), ...suppliers.map((s) => s.id)];
    if (num(r.national) === 1) out.push({ key: `largest_contract:${y}`, recipe: "largest_contract", kind: "record", data: { ...data, county: null }, entityIds });
    if (num(r.in_county) === 1 && r.county && num(r.v) >= COUNTY_RECORD_MIN && num(r.national) !== 1)
      out.push({ key: `largest_contract:${y}:${String(r.county)}`, recipe: "largest_contract", kind: "record", data: { ...data, county: r.county }, entityIds });
  }

  const [da] = await q`
    select count(*)::int n, coalesce(sum(closing_value), 0)::text total, (make_date(${year}::int, 12, 31) - make_date(${year}::int, 1, 1) + 1)::int as days
    from marts.da_transactions where left(finalization_date, 4) = ${y} and closing_value > 0 and closing_value <= 2000000`;
  if (num(da?.n) > 0) out.push({ key: `da_per_day:${y}`, recipe: "da_per_day", kind: "count",
    data: { year, n: num(da!.n), perDay: Math.round(num(da!.n) / num(da!.days)), total: num(da!.total), average: Math.round(num(da!.total) / num(da!.n)) } });

  const many = await q`
    select authority_id::text id, max(authority_name) name, count(*)::int n, sum(closing_value)::text total
    from marts.da_transactions where left(finalization_date, 4) = ${y} and closing_value > 0 and closing_value <= 2000000 and authority_id is not null
    group by authority_id having count(*) >= ${MANY_DIRECT} order by count(*) desc limit 15`;
  many.forEach((r, i) => {
    if (looksLikePerson(r.name)) return;
    out.push({ key: `most_da:${y}:${String(r.id)}`, recipe: "most_da", kind: "count", entityIds: [String(r.id)],
      data: { year, authorityId: String(r.id), authority: r.name, n: num(r.n), perDay: Math.round(num(r.n) / 365), total: num(r.total), rank: i + 1 } });
  });

  const [fresh] = await q`select count(distinct subject_id)::int firms from core.flags where flag_code = 'da_first_month'`;
  if (num(fresh?.firms) >= 50) out.push({ key: "first_month", recipe: "first_month", kind: "pattern", data: { firms: num(fresh!.firms) } });

  const months = await q`
    select y::int y, sum(v)::text total, coalesce(sum(v) filter (where m::int = 12), 0)::text december
    from marts.agg_months where y::int in (${year}::int, ${year - 1}::int) group by 1`;
  for (const r of months) {
    const share = num(r.total) > 0 ? num(r.december) / num(r.total) : 0;
    if (share >= DECEMBER_SHARE) out.push({ key: `december:${String(r.y)}`, recipe: "december", kind: "sum", data: { year: num(r.y), share, december: num(r.december), total: num(r.total) } });
  }
  const totals = new Map(months.map((r) => [num(r.y), num(r.total)]));
  const now = totals.get(year), before = totals.get(year - 1);
  if (now && before) out.push({ key: `year_total:${y}`, recipe: "year_total", kind: "sum", data: { year, total: now, previous: before, change: now / before - 1 } });

  // An institution that contracted most of its value with one firm: named, so only large ones and a clear majority.
  const majority = await q`
    select c.authority_entity_id::text authority_id, a.name_display authority, tp.partner_entity_id::text supplier_id, s.name_display supplier,
      c.top_supplier_pct::float8 share, c.total_ron::text total, tp.total_ron::text top, span.y0, span.y1, held.years
    from marts.authority_concentration c
    join marts.entity_top_partners tp on tp.entity_id = c.authority_entity_id and tp.role = 'authority' and tp.rank = 1
    join core.entities a on a.id = c.authority_entity_id join core.entities s on s.id = tp.partner_entity_id
    -- When it happened (owner, 27 November 2026): the institution's own years, and the years that hold the firm's value.
    left join lateral (select min(p.y::int) y0, max(p.y::int) y1 from marts.agg_pair_year p
      where p.authority_id = c.authority_entity_id and p.y ~ '^[0-9]{4}$' and p.v > 0) span on true
    left join lateral (select array_agg(z.y order by z.y) years from (
      select p.y::int y, sum(p.v) v, sum(sum(p.v)) over () total from marts.agg_pair_year p
      where p.authority_id = c.authority_entity_id and p.supplier_id = tp.partner_entity_id and p.y ~ '^[0-9]{4}$' group by 1) z
      where z.total > 0 and z.v >= z.total * ${MAJORITY_YEAR_SHARE}) held on true
    where c.total_ron >= ${NAMED_MAJORITY_TOTAL} and c.top_supplier_pct >= ${NAMED_MAJORITY_SHARE}
    order by c.total_ron desc limit 60`;
  for (const r of majority) {
    if (looksLikePerson(r.authority) || looksLikePerson(r.supplier)) continue;
    out.push({ key: `one_firm_majority:${String(r.authority_id)}`, recipe: "one_firm_majority", kind: "share", entityIds: [String(r.authority_id), String(r.supplier_id)],
      data: { authorityId: String(r.authority_id), authority: r.authority, supplierId: String(r.supplier_id), supplier: r.supplier, share: num(r.share), total: num(r.total), top: num(r.top),
        from: r.y0 == null ? null : num(r.y0), to: r.y1 == null ? null : num(r.y1), years: ((r.years as number[] | null) ?? []).map(num) } });
  }

  const [single] = await q`
    select count(*) filter (where is_single_bidder is not null)::int known, count(*) filter (where is_single_bidder)::int single,
      count(distinct contract_id)::int contracts
    from marts.contract_transactions where left(finalization_date, 4) = ${y}`;
  if (num(single?.known) >= 500) out.push({ key: `single_bidder:${y}`, recipe: "single_bidder", kind: "share",
    data: { year, known: num(single!.known), single: num(single!.single), share: num(single!.single) / num(single!.known), contracts: num(single!.contracts) },
    look: `Numărul de oferte se cunoaște doar la ${num(single!.known).toLocaleString("ro-RO")} din ${num(single!.contracts).toLocaleString("ro-RO")} de contracte ale anului: proporția nu e a tuturor.` });

  out.push(...await moreProposals(q, year, now ?? 0, num(da?.n), num(da?.total)));
  return out;
}

/**
 * The second set (27 November 2026). `yearTotal`: the value of the year, contracts and direct acquisitions; `daCount`
 * and `daTotal`: its direct acquisitions. Every figure from the counted marts and rollups, as above.
 */
async function moreProposals(q: DbSql, year: number, yearTotal: number, daCount: number, daTotal: number): Promise<FactProposal[]> {
  const out: FactProposal[] = [];
  const y = String(year);
  if (!(yearTotal > 0)) return out;

  // The year's largest domains.
  const domains = await q`
    select m.cpv2, sum(m.v)::text v, sum(m.n)::int n, (select t.name_ro from marts.cpv_tree t where t.code like m.cpv2 || '000000%' limit 1) name
    from marts.agg_national_mix m where m.y = ${y} and m.cpv2 is not null group by m.cpv2 order by sum(m.v) desc limit ${DOMAINS}`;
  for (const r of domains) {
    const share = num(r.v) / yearTotal;
    if (share >= DOMAIN_MIN_SHARE && r.name) out.push({ key: `domain_year:${y}:${String(r.cpv2)}`, recipe: "domain_year", kind: "sum",
      data: { year, cpv2: String(r.cpv2), name: r.name, value: num(r.v), n: num(r.n), share } });
  }

  // The institutions with the largest value of the year, and how much of the year the first ten hold.
  const buyers = await q`
    select eid::text id, max(nm) name, sum(v)::text v, sum(n)::int n from marts.agg_entity_year
    where role = 'authority' and y = ${y} group by eid order by sum(v) desc limit ${BUYERS}`;
  buyers.forEach((r, i) => {
    if (looksLikePerson(r.name)) return;
    out.push({ key: `biggest_buyer:${y}:${String(r.id)}`, recipe: "biggest_buyer", kind: "sum", entityIds: [String(r.id)],
      data: { year, authorityId: String(r.id), authority: r.name, value: num(r.v), n: num(r.n), share: num(r.v) / yearTotal, rank: i + 1 } });
  });
  const [buyerShare] = await q`
    with s as (select eid, sum(v) v from marts.agg_entity_year where role = 'authority' and y = ${y} group by eid)
    select count(*)::int institutions, sum(v)::text total, (select sum(v) from (select v from s order by v desc limit 10) a)::text top10 from s`;
  if (num(buyerShare?.institutions) >= 1000 && num(buyerShare?.total) > 0) out.push({ key: `top_buyers_share:${y}`, recipe: "top_buyers_share", kind: "share",
    data: { year, institutions: num(buyerShare!.institutions), share: num(buyerShare!.top10) / num(buyerShare!.total) } });

  const [active] = await q`
    with s as (select eid, sum(n) n from marts.agg_entity_year where role = 'supplier' and y = ${y} group by eid)
    select count(*)::int firms, count(*) filter (where n = 1)::int once from s`;
  if (num(active?.firms) >= 1000) out.push({ key: `firms_active:${y}`, recipe: "firms_active", kind: "count", data: { year, firms: num(active!.firms), once: num(active!.once) } });

  // Firms with the seat outside Romania, by the country SEAP records.
  const foreign = await q`
    select ep.country_code cc, count(distinct a.eid)::int firms, sum(a.v)::text v
    from marts.agg_entity_year a join marts.entity_profile ep on ep.entity_id = a.eid and ep.role = 'supplier'
    where a.role = 'supplier' and a.y = ${y} and ep.is_foreign and ep.country_code is not null and ep.country_code <> 'RO'
    group by ep.country_code order by sum(a.v) desc`;
  const foreignTotal = foreign.reduce((sum, r) => sum + num(r.v), 0);
  if (foreignTotal > 0) out.push({ key: `foreign_share:${y}`, recipe: "foreign_share", kind: "share", look: LOOK_SEAT,
    data: { year, value: foreignTotal, firms: foreign.reduce((sum, r) => sum + num(r.firms), 0), share: foreignTotal / yearTotal, countries: foreign.length } });
  for (const r of foreign.slice(0, FOREIGN_COUNTRIES)) {
    if (num(r.v) >= FOREIGN_COUNTRY_MIN) out.push({ key: `foreign_country:${y}:${String(r.cc)}`, recipe: "foreign_country", kind: "sum", look: LOOK_SEAT,
      data: { year, country: String(r.cc), value: num(r.v), firms: num(r.firms), share: num(r.v) / yearTotal } });
  }

  const [notice] = await q`
    select coalesce(sum(v) filter (where procedure_type = ${NO_NOTICE}), 0)::text v, coalesce(sum(n) filter (where procedure_type = ${NO_NOTICE}), 0)::int n, sum(v)::text total
    from marts.agg_national_mix where src = 'contracts' and y = ${y}`;
  if (num(notice?.n) >= 100 && num(notice?.total) > 0) out.push({ key: `no_notice:${y}`, recipe: "no_notice", kind: "sum",
    data: { year, value: num(notice!.v), n: num(notice!.n), share: num(notice!.v) / num(notice!.total) } });

  // Firms by their last balance sheet and by the year of their registration.
  const [staff] = await q`
    with s as (
      select a.eid, sum(a.v) v from marts.agg_entity_year a join marts.entity_profile ep on ep.entity_id = a.eid and ep.role = 'supplier'
      where a.role = 'supplier' and a.y = ${y} and ep.employees = 0 group by a.eid)
    select count(*)::int firms, coalesce(sum(v), 0)::text v, count(*) filter (where v >= 1000000)::int large from s`;
  if (num(staff?.firms) >= 100) out.push({ key: `zero_staff:${y}`, recipe: "zero_staff", kind: "pattern",
    data: { year, firms: num(staff!.firms), value: num(staff!.v), large: num(staff!.large) },
    look: "Numărul de angajați e din ultimul bilanț depus de firmă, care poate fi al altui an decât cel al contractelor." });
  const [fresh] = await q`
    select count(distinct a.eid)::int firms, coalesce(sum(a.v), 0)::text v
    from marts.agg_entity_year a join marts.entity_profile ep on ep.entity_id = a.eid and ep.role = 'supplier'
    where a.role = 'supplier' and a.y = ${y} and ep.registered_year = ${year}::int`;
  if (num(fresh?.firms) >= 100) out.push({ key: `new_firms:${y}`, recipe: "new_firms", kind: "pattern", data: { year, firms: num(fresh!.firms), value: num(fresh!.v) } });

  // How many firms, institutions or records each signal marks, in the whole archive.
  const signals = await q`
    select flag_code code, count(*)::int instances, count(distinct subject_id)::int subjects
    from core.flags where triggered and flag_code = any(${q.array(Object.keys(SIGNALS))}::text[]) group by flag_code`;
  for (const r of signals) {
    const what = SIGNALS[String(r.code)];
    const count = what === "records" ? num(r.instances) : num(r.subjects);
    if (what && count >= SIGNAL_MIN) out.push({ key: `signal:${String(r.code)}`, recipe: "signal", kind: "pattern", data: { code: String(r.code), what, n: count, instances: num(r.instances) } });
  }

  // Town halls by the value of the year per inhabitant of their locality.
  const towns = await q`
    with t as (
      select ep.entity_id, ep.name_display name, ep.county, ep.population, sum(a.v) v
      from marts.entity_profile ep join marts.agg_entity_year a on a.eid = ep.entity_id and a.role = 'authority' and a.y = ${y}
      where ep.role = 'authority' and ep.uat_siruta is not null and ep.population >= ${TOWN_MIN_PEOPLE} group by 1, 2, 3, 4)
    select entity_id::text id, name, county, population::int population, v::text v, (select sum(v) / sum(population) from t)::float8 average, (select count(*) from t)::int towns
    from t where v >= ${TOWN_MIN_VALUE} order by v / population desc limit ${TOWNS_PER_CAPITA}`;
  towns.forEach((r, i) => {
    if (looksLikePerson(r.name)) return;
    out.push({ key: `per_capita_town:${y}:${String(r.id)}`, recipe: "per_capita_town", kind: "record", entityIds: [String(r.id)], look: LOOK_TOWN,
      data: { year, authorityId: String(r.id), authority: r.name, county: r.county, population: num(r.population), value: num(r.v),
        perCapita: num(r.v) / num(r.population), average: num(r.average), towns: num(r.towns), rank: i + 1 } });
  });

  // How much of what a county's institutions contract goes to firms of the same county: the whole archive.
  const [span] = await q`select min(y::int)::int y0, max(y::int)::int y1, sum(v_plaf)::text v, sum(n_plaf)::text n from marts.agg_years`;
  const local = (await q`
    select county, v_all::text v, (v_all_same / v_all)::float8 same, (v_all_bucuresti / v_all)::float8 bucharest from marts.agg_map_county
    where v_all > 0 and county is not null order by v_all_same / v_all desc`).map((r) => ({ county: String(r.county), value: num(r.v), same: num(r.same), bucharest: num(r.bucharest) }));
  if (local.length >= 2 * COUNTY_ENDS + 1 && span) {
    const whole = local.reduce((sum, r) => sum + r.value, 0), national = local.reduce((sum, r) => sum + r.value * r.same, 0) / whole;
    const years = { from: num(span.y0), to: num(span.y1) };
    out.push({ key: "local_firms", recipe: "local_firms", kind: "share", data: { county: null, share: national, national, counties: local.length, ...years } });
    local.slice(0, COUNTY_ENDS).forEach((r, i) => out.push({ key: `local_firms:${r.county}`, recipe: "local_firms", kind: "share",
      data: { county: r.county, share: r.same, bucharest: r.bucharest, national, end: "top", rank: i + 1, ...years } }));
    local.slice(-COUNTY_ENDS).reverse().forEach((r, i) => out.push({ key: `local_firms:${r.county}`, recipe: "local_firms", kind: "share",
      data: { county: r.county, share: r.same, bucharest: r.bucharest, national, end: "bottom", rank: i + 1, ...years } }));
  }

  // Firms with the most institutions as clients in the year, and the pairs with the most contracts.
  const sellers = await q`
    select p.supplier_id::text id, max(e.name_display) name, count(distinct p.authority_id)::int buyers, sum(p.n)::int n, sum(p.v)::text v
    from marts.agg_pair_year p join core.entities e on e.id = p.supplier_id
    where p.y = ${y} group by p.supplier_id having sum(p.v) >= ${MANY_BUYERS_MIN_VALUE} order by count(distinct p.authority_id) desc limit ${MANY_BUYERS_FIRMS + 3}`;
  sellers.filter((r) => !looksLikePerson(r.name)).slice(0, MANY_BUYERS_FIRMS).forEach((r, i) => out.push({
    key: `many_buyers:${y}:${String(r.id)}`, recipe: "many_buyers", kind: "count", entityIds: [String(r.id)],
    data: { year, supplierId: String(r.id), supplier: r.name, buyers: num(r.buyers), n: num(r.n), value: num(r.v), rank: i + 1 } }));
  const pairs = await q`
    select p.authority_id::text authority_id, max(a.name_display) authority, p.supplier_id::text supplier_id, max(s.name_display) supplier, sum(p.n)::int n, sum(p.v)::text v
    from marts.agg_pair_year p join core.entities a on a.id = p.authority_id join core.entities s on s.id = p.supplier_id
    where p.src = 'contracts' and p.y = ${y} group by p.authority_id, p.supplier_id having sum(p.v) >= ${PAIR_MIN_VALUE} order by sum(p.n) desc limit ${4 * PAIRS}`;
  // One pair for an institution: its other firms would say the same thing again.
  const paired = new Set<string>();
  pairs.filter((r) => !looksLikePerson(r.authority) && !looksLikePerson(r.supplier) && !paired.has(String(r.authority_id)) && paired.add(String(r.authority_id)))
    .slice(0, PAIRS).forEach((r, i) => out.push({
    key: `pair_contracts:${y}:${String(r.authority_id)}:${String(r.supplier_id)}`, recipe: "pair_contracts", kind: "count", look: LOOK_PAIR,
    entityIds: [String(r.authority_id), String(r.supplier_id)],
    data: { year, authorityId: String(r.authority_id), authority: r.authority, supplierId: String(r.supplier_id), supplier: r.supplier, n: num(r.n), value: num(r.v), rank: i + 1 } }));

  // The year's fullest days.
  const [daDay] = await q`
    select left(finalization_date, 10) "day", count(*)::int n from marts.da_transactions
    where left(finalization_date, 4) = ${y} and closing_value > 0 and closing_value <= 2000000 group by 1 order by count(*) desc limit 1`;
  if (daDay && daCount > 0) out.push({ key: `busiest_day_da:${y}`, recipe: "busiest_day_da", kind: "count", data: { year, day: String(daDay.day), n: num(daDay.n), perDay: Math.round(daCount / 365) } });
  const [contractDay] = await q`
    select left(finalization_date, 10) "day", count(distinct contract_id)::int contracts, sum(closing_value)::text v from marts.contract_transactions
    where left(finalization_date, 4) = ${y} group by 1 order by sum(closing_value) desc limit 1`;
  if (contractDay) out.push({ key: `busiest_day_contracts:${y}`, recipe: "busiest_day_contracts", kind: "sum",
    data: { year, day: String(contractDay.day), contracts: num(contractDay.contracts), value: num(contractDay.v), share: num(contractDay.v) / yearTotal } });

  // The archive as a whole, direct acquisitions by number against value, and the year against one long before.
  if (span && num(span.v) > 0) {
    out.push({ key: "archive_value", recipe: "archive_value", kind: "sum", data: { from: num(span.y0), to: num(span.y1), value: num(span.v) } });
    out.push({ key: "archive_records", recipe: "archive_records", kind: "count", data: { from: num(span.y0), to: num(span.y1), n: num(span.n) } });
  }
  const yearRows = await q`select y::int y, v_plaf::text v, n_plaf::text n from marts.agg_years where y::int in (${year}::int, ${year - PAST_YEARS}::int)`;
  const thisYear = yearRows.find((r) => num(r.y) === year), past = yearRows.find((r) => num(r.y) === year - PAST_YEARS);
  if (thisYear && daCount > 0 && num(thisYear.n) > 0) out.push({ key: `da_share_count:${y}`, recipe: "da_share_count", kind: "share",
    data: { year, das: daCount, records: num(thisYear.n), share: daCount / num(thisYear.n), daValue: daTotal, total: yearTotal, valueShare: daTotal / yearTotal } });
  if (thisYear && past && num(past.v) > 0) out.push({ key: `year_vs_past:${y}`, recipe: "year_vs_past", kind: "sum",
    data: { year, total: num(thisYear.v), pastYear: year - PAST_YEARS, past: num(past.v), ratio: num(thisYear.v) / num(past.v) },
    look: `Verifică în „Surse și acoperire” că arhiva e completă pentru ${year - PAST_YEARS}; prețurile au crescut și ele între cei doi ani.` });

  return out;
}

/**
 * Writes the run's proposals into app.facts. A fact already decided (approved, rejected, withdrawn) is left as it is;
 * a proposal gets this run's numbers; a proposal whose words nobody edited and that the run no longer finds is removed.
 */
export async function buildFacts(sql: DbSql, log: (message: string) => void = () => {}) {
  return sql.begin(async (tx) => {
    const q = tx as unknown as DbSql;
    await q`select pg_advisory_xact_lock(729118, 2)`;
    const [{ year, started }] = await q`select (extract(year from now() at time zone 'Europe/Bucharest') - 1)::int as "year", clock_timestamp() as started` as unknown as [{ year: number; started: Date }];
    const proposals = await factProposals(q, year);
    // An entity with a contract held out of the totals as a probable error: the administrator looks before publishing.
    const named = [...new Set(proposals.flatMap((p) => p.entityIds ?? []))];
    const held = new Set(named.length === 0 ? [] : (await q`
      select distinct e::text id from marts.contract_transactions_held h, lateral (values (h.authority_id), (h.supplier_id)) v(e)
      where e = any(${q.array(named)}::bigint[])`).map((r) => String(r.id)));
    let added = 0;
    for (const p of proposals) {
      const look = p.look ?? ((p.entityIds ?? []).some((id) => held.has(id)) ? "O instituție sau o firmă numită aici are un contract marcat „Eroare probabilă”. Verifică cifra înainte de publicare." : null);
      const rows = await q`
        insert into app.facts (key, recipe, kind, data, entity_ids, check_status, check_note, refreshed_at)
        values (${p.key}, ${p.recipe}, ${p.kind}, ${JSON.stringify(p.data)}::jsonb, ${q.array(p.entityIds ?? [])}::bigint[], ${look ? "look" : "ok"}, ${look}, clock_timestamp())
        on conflict (key) do update set data = excluded.data, entity_ids = excluded.entity_ids, check_status = excluded.check_status,
          check_note = excluded.check_note, refreshed_at = clock_timestamp()
          where app.facts.status = 'proposed'
        returning (xmax = 0) inserted`;
      if (rows[0]?.inserted === true) added += 1;
    }
    const gone = await q`delete from app.facts where status = 'proposed' and figure is null and statement is null and refreshed_at < ${started} returning 1`;
    const [counts] = await q`select count(*) filter (where status = 'proposed')::int proposed, count(*) filter (where status = 'approved')::int approved from app.facts`;
    log(`Facts: ${proposals.length} found, ${added} new, ${gone.length} dropped; ${counts?.proposed ?? 0} proposed, ${counts?.approved ?? 0} approved in all`);
    return { found: proposals.length, added, dropped: gone.length, year };
  });
}
