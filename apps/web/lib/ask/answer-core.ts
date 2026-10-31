import { seatSwitched } from "./seat";
import { namedKind, type AskSpec, type AuthorityKind, type Block } from "./spec";

/*
 * What a watch compares between two checks (plan §2.8), and what a frozen
 * result says it was computed with: the version of the answer and its core.
 * Plain TypeScript for the server (lib/monitoring-engine.ts, captures) and
 * for the page that shows a change (app/urmariri/ResultComparison.tsx).
 *
 * A version is "<id>-<n>". An id without one reads "<id>-1": the meaning of a
 * block or key before any release changed it. A run stored before versions
 * existed therefore compares equal to a run of today, and a release that bumps
 * one block or key alerts once, only the watches whose question has it.
 */

/**
 * A block whose answer a release changed for the same spec. Absent: "<block>-1".
 * trend-2 (F2, plan §4.7): the partition beside the chosen group, the county of
 * an entity's row from its profile instead of a buyer's, the 2018 note.
 * network-2 (F4, plan §4.8): the four lists of partners against a reference
 * year, the first 50 of each, the facts of a row; an old link still lists 14.
 * sankey-2 (F4, plan §4.9): the first 15 partners × 5 domains with their
 * records and rests, two CPV digits below a chosen domain.
 */
export const ANSWER_VERSIONS: Partial<Record<Block, string>> = {
  trend: "trend-2",
  network: "network-2",
  sankey: "sankey-2",
  // distribution-2 (F6a, plan §4.11): the criteria against the group the ticks choose, instead of ten
  // CRI buckets and a percentile over every profile; position more · same · fewer of the others.
  distribution: "distribution-2",
  // fact_check-2 (F6a, plan §4.10): three verdicts (Da · Acord-cadru · Nu), the rows outside the sums say "Da"
  // ("Da · nu intră în sume"), framework ceilings never do; the profile, the weight and the whole relation beside it.
  fact_check: "fact_check-2",
  // entity_card-2 (F6c, plan §4.13): by value the podium (places 1–3, the distance from place 2, the share of the
  // total, the total of the band under CÂȘTIGĂTORII); on the index every profile at the top level, in the order of
  // value, where one name was crowned among the tied. Place 1 stays the card.
  entity_card: "entity_card-2",
};

/** A key whose meaning a release changed, on the questions that carry it. */
export interface KeyVersion {
  /** "<id>-<n>", n ≥ 2. */
  version: string;
  /** What changed, in Romanian, for "Ce s-a schimbat în metodologie". */
  label: string;
  /** The spec paths that bring it (any of them present). */
  paths: readonly string[];
  /** The blocks it applies to; every block when absent. */
  blocks?: readonly Block[];
  /** A narrower rule ("a ranking of firms"). */
  when?(spec: AskSpec): boolean;
}
/**
 * Keyed by id. D1: kind (town halls from the locality registry, hospitals with
 * the clinical institutes, lib/ask/authority-kind.ts); F3: "table:employees"
 * (the employees of a firm ranking become a group, plan §2.6), whose
 * methodology note a watch on such a ranking gets once; F4: seat (a firm's
 * county is its seat, owner-seat-switch), on every answer of before F4 that
 * shows a firm's own county or selects firms by it (seat.ts seatSwitched); D2:
 * uat ("primăria X" with every identity, only where the town hall gained one)
 * and "table:per-capita" (the 41 county councils of the per-inhabitant list).
 */
export const KEY_VERSIONS: Record<string, KeyVersion> = {
  // Only the kinds D1 and D2 corrected: schools keep their institutions and records (0 in, 0 out locally); the county
  // councils gain the three of the strict list whose names the rules missed (D2: Alba, Hunedoara, Prahova); the local
  // administrations (local_admin, F5) are new with F5, so no answer before it.
  kind: { version: "kind-2", label: "Tipul instituției", paths: ["filters.authorityKind"], when: (spec) => KIND_2.has(namedKind(spec.filters.authorityKind) ?? "") },
  // F3 (plan §4.2, §2.6): on a ranking of firms the employees narrow the list (CÂȘTIGĂTORII), the same rows and
  // values; the totals and „% din total” are the whole selection's. "Cine conduce?" by value shows place 1 only: no change.
  "table:employees": {
    version: "table:employees-2", label: "Angajații firmelor", paths: ["filters.minEmployees", "filters.maxEmployees"], blocks: ["table"],
    when: (spec) => spec.dim === "supplier",
  },
  // F4 (owner-seat-switch, 24 October 2026): the "Județ" beside a firm, and a firm profile's county, are its seat (the
  // latest ONRC registration, then SEAP; foreign apart) instead of its SEAP county: the rows' county changes, a
  // county on firm profiles selects other firms. Every question has a block: "block" is always present. A question with
  // only F4's own seat keys could not be asked before: no version, as F3's keys (seat.ts seatSwitched).
  seat: { version: "seat-2", label: "Sediul firmei", paths: ["block"], when: (spec) => seatSwitched(spec) },
  // D2 (plan §9 trusa 10): "primăria X" is every identity of the town hall. Only an answer whose town hall gained one
  // (runSpec's uatJoined) carries it: a town hall with one identity computes as before.
  uat: { version: "uat-2", label: "Primăria", paths: ["filters.uatSiruta"] },
  // D2 (map final §7.3): the per-inhabitant list has all 41 county councils (CJ Prahova, CJ Suceava) and a town hall
  // whose second identity never bought (Pătulele); every ranking per inhabitant can hold them.
  "table:per-capita": {
    version: "table:per-capita-2", label: "Lista pe locuitor", paths: ["measure"], blocks: ["table"],
    when: (spec) => spec.measure === "value_per_capita",
  },
};
const KIND_2: ReadonlySet<string> = new Set<AuthorityKind>(["comuna", "oras_municipiu", "spital", "consiliu_judetean"]);

/** What changed in the methodology with each key version, for "Ce s-a schimbat" (plan §2.6). */
export const KEY_VERSION_NOTES: Record<string, string> = {
  "kind-2": "Tipul instituției a fost corectat (primăriile din registrul localităților, spitalele cu institutele clinice, toate cele 41 de consilii județene).",
  "uat-2": "Primăria cuprinde acum toate identitățile ei din SEAP.",
  "table:per-capita-2": "Lista pe locuitor are acum toate cele 41 de consilii județene.",
  "table:employees-2": "Angajații restrâng acum doar lista firmelor; totalul și „% din total” sunt ale întregii selecții.",
  "seat-2": "Județul firmei e acum sediul ei: ultima înmatriculare la Registrul Comerțului, apoi SEAP; firmele străine apar separat.",
};

/**
 * The notes of the key versions a question carries (plan §2.6 "Ce se schimbă"):
 * what a restored link, saved recipe or local question now computes
 * differently. A link stores no version, so every restored spec with the key
 * gets the note.
 */
export function keyVersionNotes(spec: AskSpec): string[] {
  // A restored link has not run: "primăria X" gets no union note, as only 3 of 3,187 town halls gained an identity
  // with records; the answer that ran carries uat-2 where it moved (runSpec's uatJoined; S5 review).
  return Object.values(answerVersion(spec).conditions).map((version) => KEY_VERSION_NOTES[version]).filter((note): note is string => Boolean(note));
}

/** The version of a question's answer: its block's, and those of the keys it carries. */
export interface AnswerVersion {
  question: string;
  conditions: Record<string, string>;
}

const presentPaths = (spec: AskSpec): Set<string> => {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined) continue;
    paths.add(key);
    if (key !== "filters" && key !== "population" && key !== "minimumRecords" && value && typeof value === "object" && !Array.isArray(value))
      for (const sub of Object.keys(value)) paths.add(`${key}.${sub}`);
  }
  for (const [key, value] of Object.entries(spec.filters)) if (value !== undefined && value !== null && value !== "") paths.add(`filters.${key}`);
  return paths;
};

/**
 * `ran`: how the engine ran it (runSpec's result), where the caller has it: an answer computed on the SEAP county,
 * before the marts build fills the seat (seatColumn false), is the one of before F4 and carries no seat-2; a watch
 * then hears of the switch once, when the seat is read (S4 review: else seat-2 first on the old counties, then a
 * "Rezultat recalculat" when they changed under the same version).
 */
export function answerVersion(spec: AskSpec, ran: { seatColumn?: false; uatJoined?: true } = {}): AnswerVersion {
  const present = presentPaths(spec);
  const conditions: Record<string, string> = {};
  for (const [id, key] of Object.entries(KEY_VERSIONS)) {
    if (key.blocks && !key.blocks.includes(spec.block)) continue;
    if (id === "seat" && ran.seatColumn === false) continue;
    if (id === "uat" && !ran.uatJoined) continue;
    if (!key.paths.some((path) => present.has(path)) || key.when && !key.when(spec)) continue;
    conditions[id] = key.version;
  }
  return { question: ANSWER_VERSIONS[spec.block] ?? `${spec.block}-1`, conditions };
}

/** "<block>-1" with no condition: what a missing version reads as, so a watch need not store it. */
export function isFirstAnswerVersion(version: AnswerVersion, block: string): boolean {
  return version.question === `${block}-1` && Object.keys(version.conditions).length === 0;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** A stored version, read with the rule above: missing (a run from before F0) is "<block>-1". */
export function readAnswerVersion(stored: unknown, block: string): AnswerVersion {
  const question = object(stored) && typeof stored.question === "string" ? stored.question : `${block}-1`;
  const conditions = object(stored) && object(stored.conditions)
    ? Object.fromEntries(Object.entries(stored.conditions).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  return { question, conditions };
}
/** Both versions over the same condition ids, each missing one as "<id>-1", so a reader sees what changed and from what. */
export function alignAnswerVersions(before: AnswerVersion, after: AnswerVersion): [AnswerVersion, AnswerVersion] {
  const ids = [...new Set([...Object.keys(before.conditions), ...Object.keys(after.conditions)])].sort();
  const fill = (version: AnswerVersion): AnswerVersion =>
    ({ question: version.question, conditions: Object.fromEntries(ids.map((id) => [id, version.conditions[id] ?? `${id}-1`])) });
  return [fill(before), fill(after)];
}
export function sameAnswerVersion(before: AnswerVersion, after: AnswerVersion): boolean {
  const [a, b] = alignAnswerVersions(before, after);
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * The part of an answer a watch compares and "Ce s-a schimbat" lists (plan
 * §2.8): the whole answer, except on a trend (trend-2), where it is the chosen
 * group: its rows, years, change and months, and the totals of its own list
 * (`list`: the change, or "Prima dată") and, with the order in percent, of the
 * growths from the base. The other groups' rows and totals, the group noun,
 * the row facts and the firms an employees band leaves out without a filing
 * stay out, so a change only in "Nu mai apar" or only in a fact does not
 * change a watch on "Creșteri". An answer stored before trend-2 is whole.
 */
export function answerCore(block: string, data: unknown): unknown {
  // network-2: the list the question asks for (its group), its totals and its first 50 partners by value; not the other
  // lists, the facts of a row, the order or the length shown. The reference year only where a group is counted from it.
  if (block === "network" && object(data) && object(data.lists)) {
    const list = typeof data.list === "string" ? data.list : "all";
    const own = object(data.lists[list]) ? data.lists[list] as Record<string, unknown> : {};
    const partners = object(data.partners) ? data.partners : {};
    const rows = Array.isArray(own.rows) ? own.rows as { entityId: string; value: number; count: number }[] : [];
    return {
      focal: data.focal, list, ...(list !== "all" ? { since: data.since } : {}),
      totals: { partners: own.partners, value: own.value, count: own.count },
      nodes: rows.slice(0, 50).map((row) => ({ entityId: row.entityId, name: (partners[row.entityId] as { name?: string } | undefined)?.name ?? "?", value: row.value, count: row.count })),
    };
  }
  // sankey-2: its flows and totals; not the strip's shares nor the facts of a node (the firms a partner shares contracts with).
  if (block === "sankey" && object(data) && Array.isArray(data.partners)) {
    const { streams: _streams, partners: _partners, domains: _domains, ...core } = data;
    return core;
  }
  // F3: what an evolution or a breakdown adds for the screen alone (the marker of the year before, every CPV group,
  // the channels' shares) is not compared: a watch on an older question sees the same core as before.
  if (block === "timeseries" && object(data)) { const { ref: _ref, ...core } = data; return core; }
  // F4: a comparison's context rows (the codes above a domain, the suppliers' seat, the distinct contracts, the
  // population's level, a year's records, the selection without the shared clients and the part won together) are
  // for the screen: a watch on a comparison of before F4 sees the same core.
  if (block === "compare" && object(data) && Array.isArray(data.entities)) return compareCore(data);
  if (block === "breakdown" && object(data)) { const { base: _base, streams: _streams, ...core } = data; return core; }
  // F5: the local map's populations and the councils its list lacks are for the screen: a watch compares the counties.
  if (block === "map" && object(data)) { const { local: _local, ...core } = data; return core; }
  if (block === "entity_card") return entityCardCore(data);
  if (block === "distribution") return distributionCore(data);
  if (block === "fact_check") return factCheckCore(data);
  if (block !== "trend" || !object(data) || !object(data.groups)) return data;
  const { groups: _groups, composition, noun: _noun, rowFacts: _facts, withoutFiling: _unfiled, ...core } = data;
  const parts = object(composition) ? composition : {};
  const own = [typeof core.list === "string" ? core.list : "all", "eligible"].filter((part) => part in parts);
  return { ...core, composition: Object.fromEntries(own.map((part) => [part, parts[part]])) };
}
function compareCore(data: Record<string, unknown>): Record<string, unknown> {
  const entities = (data.entities as unknown[]).map((entity) => {
    if (!object(entity)) return entity;
    const { general: _general, seats: _seats, populationLevel: _level, whole: _whole, joint: _joint, ...core } = entity;
    if (Array.isArray(core.years)) core.years = core.years.map((y) => { if (!object(y)) return y; const { count: _count, ...year } = y; return year; });
    if (object(core.streams) && object(core.streams.contracts)) {
      const { distinct: _distinct, ...contracts } = core.streams.contracts;
      core.streams = { ...core.streams, contracts };
    }
    return core;
  });
  const shared = object(data.shared) && Array.isArray(data.shared.rows) ? {
    ...data.shared,
    rows: data.shared.rows.map((row) => {
      if (!object(row)) return row;
      const side = (s: unknown) => { if (!object(s)) return s; const { joint: _joint, ...rest } = s; return rest; };
      return { ...row, a: side(row.a), b: side(row.b) };
    }),
  } : data.shared;
  return { ...data, entities, ...(data.shared !== undefined ? { shared } : {}) };
}

/**
 * entity_card-2 (F6c): place 1 and the places of the podium with the total they are counted against, or the level
 * of the index with the profiles at it. The names and counties are descriptions; the pool, the next level and the
 * facts of the places (loaded apart) are references, not the answer: a firm added to a pool of fifty thousand does
 * not change a watch on the six at the top. An answer stored before entity_card-2 is whole.
 */
function entityCardCore(data: unknown): unknown {
  if (!object(data) || (!object(data.podium) && !object(data.ties))) return data;
  const card = object(data.card) ? data.card : {};
  const core: Record<string, unknown> = {
    block: "entity_card",
    card: { entityId: card.entityId, role: card.role, value: card.value, count: card.count, cri: card.cri, nFlags: card.nFlags, flags: card.flags },
  };
  if (object(data.podium)) {
    const places = Array.isArray(data.podium.places) ? data.podium.places : [];
    core.podium = {
      places: places.map((place) => object(place) ? { entityId: place.entityId, value: place.value, count: place.count } : place),
      // Under a band of CÂȘTIGĂTORII the total is the category's (podiumOf), and a watch names it so.
      ...(object(data.podium.selection) ? { categoryTotals: data.podium.total } : { totals: data.podium.total }),
    };
  }
  if (object(data.ties)) {
    const rows = Array.isArray(data.ties.rows) ? data.ties.rows : [];
    core.ties = {
      level: data.ties.level, maxFlags: data.ties.maxFlags, count: data.ties.count,
      rows: rows.map((row) => object(row) ? { entityId: row.entityId, value: row.value, count: row.count, nFlags: row.nFlags } : row),
    };
  }
  return core;
}

/**
 * distribution-2 (F6a): the entity's criteria, its group (the ticks, its size
 * and members) and its position among them. The words, the facts that name
 * the group, the band's coverage and the country's marks are references, not
 * the answer: a member added nationally does not change a watch on 29 town
 * halls. An answer stored before distribution-2 is whole.
 */
function distributionCore(data: unknown): unknown {
  if (!object(data) || !object(data.distribution) || data.distribution.version !== 2) return data;
  const d = data.distribution;
  const focal = object(d.focal) ? d.focal : {}, group = object(d.group) ? d.group : {};
  return { ...data, distribution: {
    version: 2, role: d.role, status: d.status,
    focal: { entityId: focal.entityId, nFlags: focal.nFlags, flags: focal.flags, nDas: focal.nDas, inGroup: focal.inGroup },
    group: { ticks: group.ticks, legacy: group.legacy, others: group.others, memberIds: group.memberIds },
    position: d.position, hist: d.hist,
    perCriterion: Array.isArray(d.perCriterion) ? d.perCriterion.map((c) => object(c) ? { code: c.code, others: c.others } : c) : d.perCriterion,
    members: Array.isArray(d.members) ? d.members.map((m) => object(m) ? { entityId: m.entityId, nFlags: m.nFlags } : m) : d.members,
  } };
}

/**
 * fact_check-2 (F6a): the verdict and the selection's figures (records and
 * value, the undated ones, each channel, the framework agreements and the rows
 * outside the sums). The profile by year, domain and competition, the list,
 * the weight among the partners (others' records move it), the whole relation,
 * the data's last day and the "Nu" context are descriptions, not the answer.
 * An answer stored before fact_check-2 is whole.
 */
function factCheckCore(data: unknown): unknown {
  if (!object(data) || !object(data.fact) || data.fact.version !== 2) return data;
  const f = data.fact;
  const frameworks = object(f.frameworks) ? f.frameworks : {}, excluded = object(f.excluded) ? f.excluded : {};
  return { ...data, fact: {
    version: 2, state: f.state, authority: object(f.authority) ? f.authority.entityId : f.authority,
    supplier: object(f.supplier) ? f.supplier.entityId : f.supplier,
    count: f.count, value: f.value, undated: f.undated, channels: f.channels,
    frameworks: { count: frameworks.count, ceiling: frameworks.ceiling }, excluded: { count: excluded.count },
  } };
}

/** The two cores are equal as stored JSON (jsonb: key order does not count, array order does). */
export function sameAnswerCore(block: string, before: unknown, after: unknown): boolean {
  return canonicalJson(answerCore(block, before)) === canonicalJson(answerCore(block, after));
}

/** JSON with object keys sorted at every depth: equal for two values jsonb stores as equal. */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted)
      : object(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sorted(v[key])]))
        : v;
  return JSON.stringify(sorted(JSON.parse(JSON.stringify(value ?? null))));
}
