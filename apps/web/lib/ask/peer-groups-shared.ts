import { countyKnown } from "../counties";
import { flagEntityRule, flagLabel } from "../flags";
import { formatInt } from "../format";
import { GLOSSARY } from "../glossary";
import { RISK_CRITERIA, type RiskCriterion } from "../risk-score";
import { countWords } from "./answer-text";
import { KIND_WORDS, countyWords } from "./question-ui";
import type { PeersOptions } from "./spec";

/*
 * The comparison group of a distribution (plan §4.11, final distribution §1.1,
 * §3): "Față de cine?". Plain TypeScript for the builder's window, the
 * sentence, the answer and the server (lib/ask/peer-groups.ts computes the
 * numbers). The rules are those of /entitati/[id]/comparatii: the strict
 * population mapping (RPL 2021) and population before rank for town halls,
 * the band ½–2× for activity, at least 5 other members (PEER_MINIMUM), a full
 * list up to 50 (PEER_LIST_LIMIT).
 *
 * The group is written with two keys (plan §3): `peers` (similar, activity,
 * domain: rules computed from the entity) and the existing `filters.county`,
 * ticked as "același județ" when it is the entity's own county. An old link's
 * other county or kind of institution stays applied and is shown apart.
 */

/** Profiles with at least this many accepted direct acquisitions are compared (RISK_MIN_DAS). */
export const PROFILE_MIN_DAS = 10;
/** A group needs at least 5 other members (PEER_MINIMUM_COUNT on /comparatii). */
export const PEER_MINIMUM = 5;
/** Up to 50 other members the answer lists them all instead of the chart. */
export const PEER_LIST_LIMIT = 50;
/** Above 50, a bar of the chart lists its members ten at a time ("Arată încă 10", GET /api/ask/peers/members). */
export const PEER_MEMBERS_PAGE = 10;

export type PeerRowId = "similar" | "domain" | "county" | "activity";
/** The rows of "Față de cine?", in the window's order. */
export const PEER_ROW_ORDER: readonly PeerRowId[] = ["similar", "domain", "county", "activity"];

/**
 * What "același tip" means for one institution (final §3.2): a town hall of
 * the strict mapping by its population (½–2×, communes, towns and cities
 * together), the county councils among themselves, the six sector town halls
 * among themselves, hospitals and schools by their kind (lib/ask/authority-kind.ts).
 */
export type SimilarFacts =
  | { rule: "population"; value: number; min: number; max: number }
  | { rule: "county_councils" }
  | { rule: "sectors" }
  | { rule: "kind"; kind: "spital" | "scoala" };

/** The entity's own facts that name its group: the band bounds, its county, why a row cannot be ticked. */
export interface PeerFacts {
  role: "authority" | "supplier";
  entityId: string;
  name: string;
  /** Display spelling (COUNTIES), null when unknown. */
  county: string | null;
  /** A foreign firm: its seat („Străinătate”) is known but is no county, so „Același județ” has none to name. */
  abroad?: true;
  /** Accepted direct acquisitions of the profile (entity_flags.n_das). */
  nDas: number;
  similar: SimilarFacts | null;
  /** The (?) of an unavailable "același tip" (institutions). */
  similarReason?: string;
  /** ⌈n/2⌉–2n; null below the profile's threshold. */
  activity: { min: number; max: number } | null;
}

/** A row of "Față de cine?" (component 9, checkboxes). */
export interface PeerRow {
  id: PeerRowId;
  /** The concrete group: "Primării cu 52–207 mii de locuitori", "Județul Buzău", "12.101–48.404 de achiziții directe". */
  label: string;
  /** The rule's name under it: "populație apropiată", "același județ", "activitate apropiată". */
  rule: string;
  tip: string;
  /** Visible short reason when it cannot be ticked ("doar 1", "necunoscut"), with its (?). */
  disabled?: { short: string; tip: string };
}

/** What the window needs: the rows and the size of the group for every combination of them (sizes, by peerKey). */
export interface PeerDialogData {
  facts: PeerFacts;
  /** The entity has a profile (≥ 10 accepted direct acquisitions). */
  profile: boolean;
  rows: PeerRow[];
  /** Other members for each combination of ticks: "" none, "similar+county" … (peerKey). With an old link's kind or county applied. */
  sizes: Record<string, number>;
  /** An old link's conditions, applied and shown apart (final §5): another county, a kind by name. */
  legacy: { county?: string; authorityKind?: string };
  /** The window's (?) for the population rule: how many town halls of the band are identified surely. */
  coverage?: PeerCoverage;
}

/** Of the town halls in the band (RPL 2021), how many the strict mapping identifies; the names of a few missing ones. */
export interface PeerCoverage { inBand: number; identified: number; missing: string[] }

/** Romanian county name as COUNTIES spells it ("Buzau" → "Buzău"), or null. */
export function countyDisplay(raw: string | null | undefined): string | null {
  return countyKnown(raw);
}
const sameCounty = (a: unknown, b: string | null) => typeof a === "string" && b !== null && countyDisplay(a) === b;

/** The ticks a spec holds, read against the entity: `filters.county` is "același județ" only when it is the entity's own. */
export function peerTicks(spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> }, facts: Pick<PeerFacts, "county"> | null): PeerRowId[] {
  const p = spec.peers ?? {};
  const ticks: PeerRowId[] = [];
  if (p.similar) ticks.push("similar");
  if (p.domain) ticks.push("domain");
  if (facts && sameCounty(spec.filters.county, facts.county)) ticks.push("county");
  if (p.activity) ticks.push("activity");
  return ticks;
}

/** The key of a combination of ticks, in the window's order: "" for none. */
export function peerKey(ticks: readonly PeerRowId[]): string {
  return PEER_ROW_ORDER.filter((id) => ticks.includes(id)).join("+");
}

/** "52–207 mii de locuitori", "1.587–6.346 de locuitori" (final §1.1); the "de" follows the last number (countWords). */
export function bandWords(min: number, max: number, many: string, thousands = true): string {
  if (thousands && min >= 10_000) return `${formatInt(Math.round(min / 1000))}–${formatInt(Math.round(max / 1000))} mii de ${many}`;
  return `${formatInt(min)}–${countWords(max, many, many)}`;
}
const capitalFirst = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);

/** The noun of "același tip": "primăriile", "consiliile județene", "spitalele" … */
function similarNoun(similar: SimilarFacts | null): string {
  if (!similar) return "instituțiile de același tip";
  switch (similar.rule) {
    case "population": return "primăriile";
    case "county_councils": return KIND_WORDS.consiliu_judetean!.the;
    case "sectors": return "celelalte sectoare ale Capitalei";
    case "kind": return KIND_WORDS[similar.kind]!.the;
  }
}

/**
 * The group in the sentence, after "față de" (final §1.1, kit §4): "toate
 * instituțiile publice", "primăriile cu 52–207 mii de locuitori din județul
 * Buzău", "spitalele cu 12.101–48.404 de achiziții directe", "firmele cu
 * sediul în județul Bacău". Without the entity's facts (a saved question's
 * summary, before the window's numbers arrive) the rules are named instead of
 * their bounds ("cu populație apropiată", "cu activitate apropiată").
 */
export function peerGroupWords(
  spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> },
  role: "authority" | "supplier",
  facts?: PeerFacts | null,
): string {
  const p = spec.peers ?? {};
  const county = typeof spec.filters.county === "string" && spec.filters.county ? spec.filters.county : null;
  const kind = typeof spec.filters.authorityKind === "string" && KIND_WORDS[spec.filters.authorityKind] ? spec.filters.authorityKind : null;
  const similar = role === "authority" && p.similar ? facts?.similar ?? null : null;
  let noun: string;
  if (role === "supplier") noun = p.domain ? "firmele din același domeniu principal" : "firmele";
  else if (p.similar) noun = similarNoun(similar);
  else if (kind) noun = KIND_WORDS[kind]!.the;
  else noun = "instituțiile publice";
  const parts: string[] = [];
  if (similar?.rule === "population") parts.push(bandWords(similar.min, similar.max, "locuitori"));
  if (p.activity) parts.push(facts?.activity ? bandWords(facts.activity.min, facts.activity.max, "achiziții directe", false) : "activitate apropiată");
  let words = noun + (parts.length ? ` cu ${parts.join(" și ")}` : "");
  if (county) words += role === "supplier" ? ` cu sediul ${countyWords(county).replace(/^din /, "în ")}` : ` ${countyWords(county)}`;
  const none = !p.similar && !p.activity && !p.domain && !county && !kind;
  return none ? `toate ${noun}` : words;
}

/** The noun of a group's size: "29 de primării", "328 de spitale", "15.728 de instituții" (the footer, "Grup: …"). */
export function peerCountWords(n: number, spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> }, role: "authority" | "supplier", facts?: PeerFacts | null): string {
  if (role === "supplier") return countWords(n, "firmă", "firme");
  const similar = spec.peers?.similar ? facts?.similar ?? null : null;
  const kind = !spec.peers?.similar && typeof spec.filters.authorityKind === "string" ? spec.filters.authorityKind : null;
  if (similar?.rule === "population") return countWords(n, "primărie", "primării");
  if (similar?.rule === "county_councils" || kind === "consiliu_judetean") return countWords(n, "consiliu județean", "consilii județene");
  if (similar?.rule === "sectors") return countWords(n, "sector", "sectoare");
  if (similar?.rule === "kind" && similar.kind === "spital" || kind === "spital") return countWords(n, "spital", "spitale");
  if (similar?.rule === "kind" && similar.kind === "scoala" || kind === "scoala") return countWords(n, "școală", "școli");
  if (kind === "comuna" || kind === "oras_municipiu") return countWords(n, "primărie", "primării");
  return countWords(n, "instituție", "instituții");
}

/** The rule's name under a row (final §3: the concrete group first, the rule under it). */
export function similarRuleName(similar: SimilarFacts | null): string {
  if (similar?.rule === "population") return "populație apropiată";
  return "același tip";
}

/** A row's concrete group (final §3.2–§3.4). */
export function peerRowLabel(id: PeerRowId, facts: PeerFacts): string {
  switch (id) {
    case "similar": {
      const s = facts.similar;
      if (!s) return "Același tip";
      if (s.rule === "population") return `Primării cu ${bandWords(s.min, s.max, "locuitori")}`;
      if (s.rule === "county_councils") return "Consiliile județene";
      if (s.rule === "sectors") return "Celelalte sectoare ale Capitalei";
      return capitalFirst(KIND_WORDS[s.kind]!.bare);
    }
    case "county":
      if (!facts.county) return "Același județ";
      return facts.role === "supplier" ? `${facts.county}, sediul firmei` : /^bucure/i.test(facts.county) ? "București" : `Județul ${facts.county}`;
    case "activity":
      return facts.activity ? capitalFirst(bandWords(facts.activity.min, facts.activity.max, "achiziții directe", false)) : "Activitate apropiată";
    case "domain":
      return "Același domeniu principal";
  }
}

/** The (?) of each row (final §3.2–§3.5), at the level of the entity's group. */
export function peerRowTip(id: PeerRowId, facts: PeerFacts): string {
  switch (id) {
    case "similar": {
      const s = facts.similar;
      if (!s) return facts.similarReason ?? `Tipul lui ${facts.name} nu se poate stabili sigur.`;
      // The rule in the glossary's words (populatie-apropiata), then this entity's own population.
      if (s.rule === "population")
        return `${GLOSSARY["populatie-apropiata"].text} ${facts.name}: ${countWords(s.value, "locuitor", "locuitori")}. Pe pagina Comparații, grupul automat are cele mai apropiate 10.`;
      if (s.rule === "county_councils") return "Celelalte consilii județene identificate sigur.";
      if (s.rule === "sectors") return "Celelalte primării de sector, cu populația sectorului (RPL 2021). Primăria Capitalei nu intră.";
      return s.kind === "spital"
        ? "După denumire: spitalele, cu institutele clinice. Spitalele numite altfel nu intră."
        : "După denumire: școală, liceu, colegiu sau grădiniță. Numele ambigue nu intră.";
    }
    case "county":
      if (facts.abroad) return `${facts.name} are sediul în străinătate: nu are un județ cu care să fie comparată.`;
      if (!facts.county) return `Județul lui ${facts.name} nu e cunoscut.`;
      return facts.role === "supplier"
        ? "Sediul firmei din registrul nostru, nu județul instituțiilor care cumpără de la ea. Firmele fără sediu cunoscut nu intră."
        : "Județul instituției din registrul nostru.";
    case "activity":
      return `Între jumătate și dublul achizițiilor directe acceptate ale lui ${facts.name} (${formatInt(facts.nDas)}). `
        + "Nu e buget, personal sau populație. Criteriile apar mai des la cine are mai multe achiziții.";
    case "domain":
      return "Diviziunea CPV cu cel puțin jumătate din valoarea achizițiilor directe ale firmei. Codurile CPV sunt alese de cumpărători.";
  }
}

/** What ticking an unticked row does (final §3.1): the size after it, and the ticks it replaces when together they leave fewer than 5. */
export type PeerRowState =
  | { kind: "ticked" }
  | { kind: "add"; size: number; replaces: PeerRowId[] }
  | { kind: "disabled"; short: string; tip: string };

/**
 * "→ N" on an unticked row: the group's size with the current ticks and this
 * row. A row that leaves fewer than 5 with them, but has at least 5 alone,
 * stays active and replaces the ticks it does not fit with (the most ticks
 * kept, in the window's order; "în locul populației apropiate"). A row with
 * fewer than 5 alone is disabled, its reason visible ("doar 1").
 */
export function peerRowState(data: Pick<PeerDialogData, "rows" | "sizes">, ticks: readonly PeerRowId[], id: PeerRowId): PeerRowState {
  if (ticks.includes(id)) return { kind: "ticked" };
  const row = data.rows.find((r) => r.id === id);
  if (row?.disabled) return { kind: "disabled", ...row.disabled };
  const size = (set: readonly PeerRowId[]) => data.sizes[peerKey(set)];
  const together = size([...ticks, id]);
  if (together !== undefined && together >= PEER_MINIMUM) return { kind: "add", size: together, replaces: [] };
  const alone = size([id]);
  if (alone === undefined || alone < PEER_MINIMUM) {
    const n = alone ?? 0;
    return { kind: "disabled", short: n === 0 ? "niciun alt membru" : `doar ${n}`, tip: `Rămân ${countWords(n, "alt membru", "alți membri")}. Comparația cere cel puțin ${PEER_MINIMUM}.` };
  }
  // The largest subset of the current ticks that still fits (ties: the earlier rows of the window stay).
  const subsets: PeerRowId[][] = [[]];
  for (const tick of ticks) for (const s of [...subsets]) subsets.push([...s, tick]);
  const rank = (s: PeerRowId[]) => s.map((t) => PEER_ROW_ORDER.indexOf(t)).sort((a, b) => a - b).join("");
  const best = subsets
    .filter((s) => (size([...s, id]) ?? 0) >= PEER_MINIMUM)
    .sort((a, b) => b.length - a.length || rank(a).localeCompare(rank(b)))[0]!;
  return { kind: "add", size: size([...best, id])!, replaces: ticks.filter((t) => !best.includes(t)) };
}

/** The spec's group after the window's ticks (peers and the county), the rest of the spec as it was. */
export function writePeerTicks<S extends { peers?: PeersOptions | undefined; filters: Record<string, unknown> }>(spec: S, ticks: readonly PeerRowId[], facts: Pick<PeerFacts, "county">): S {
  const next = structuredClone(spec);
  const peers: PeersOptions = {};
  if (ticks.includes("similar")) peers.similar = true;
  if (ticks.includes("activity")) peers.activity = true;
  if (ticks.includes("domain")) peers.domain = true;
  if (Object.keys(peers).length) next.peers = peers;
  else delete next.peers;
  if (ticks.includes("county") && facts.county) next.filters.county = facts.county;
  // Unticking "același județ" removes the entity's county; an old link's other county stays until its ×.
  else if (sameCounty(next.filters.county, facts.county)) delete next.filters.county;
  return next;
}

/**
 * Ticking or unticking one row (final §3.1): no "Aplică", the group changes
 * at once. A row that replaces others says so in a note ("Am scos „Primării
 * cu 52–207 mii de locuitori”: împreună cu „Județul Buzău” nu rămânea niciun
 * alt membru.").
 */
export function togglePeerRow<S extends { peers?: PeersOptions | undefined; filters: Record<string, unknown> }>(
  spec: S, data: PeerDialogData, id: PeerRowId,
): { spec: S; note: string | null } {
  const ticks = peerTicks(spec, data.facts);
  if (ticks.includes(id)) return { spec: writePeerTicks(spec, ticks.filter((t) => t !== id), data.facts), note: null };
  const state = peerRowState(data, ticks, id);
  if (state.kind !== "add") return { spec, note: null };
  const kept = ticks.filter((t) => !state.replaces.includes(t));
  const label = (t: PeerRowId) => data.rows.find((r) => r.id === t)?.label ?? t;
  const left = data.sizes[peerKey([...ticks, id])] ?? 0;
  const note = state.replaces.length
    ? `Am scos ${state.replaces.map((t) => `„${label(t)}”`).join(" și ")}: împreună cu „${label(id)}” ${left === 0 ? "nu rămânea niciun alt membru" : `rămâneau doar ${left}`}.`
    : null;
  return { spec: writePeerTicks(spec, [...kept, id], data.facts), note };
}

/**
 * The tick a new question writes (final §4.2): "populație apropiată" / "același
 * tip" when the institution's group is sure and has at least 5 other members;
 * firms and every other institution compare with the whole country. Written
 * explicitly, so a copied link says what was compared.
 */
export function defaultPeerTicks(data: Pick<PeerDialogData, "facts" | "sizes" | "rows" | "legacy">): PeerRowId[] {
  if (data.facts.role !== "authority" || !data.facts.similar) return [];
  const similar = data.rows.find((r) => r.id === "similar");
  if (!similar || similar.disabled || data.legacy.county || data.legacy.authorityKind) return [];
  return (data.sizes["similar"] ?? 0) >= PEER_MINIMUM ? ["similar"] : [];
}

/**
 * What a new entity, or a new distribution, does to the ticks once the
 * window's facts arrive (final §4.2, §4.4): a new question writes its default
 * tick; after another entity, a county that was the old entity's becomes the
 * new one's (or leaves, with a note, when the new one has none), and "același
 * tip" leaves with a note when the new entity's type is not sure. Null: nothing
 * to change (the facts are of another entity, or nothing follows).
 */
export function peerFollowUp<S extends { peers?: PeersOptions | undefined; filters: Record<string, unknown> }>(
  spec: S, data: PeerDialogData, follow: { fresh?: boolean; previousCounty?: string | null },
): { spec: S; notes: string[] } | null {
  const id = spec.filters[data.facts.role === "authority" ? "authorityId" : "supplierId"];
  if (String(id ?? "") !== data.facts.entityId) return null;
  let next = spec;
  const notes: string[] = [];
  if (follow.fresh && !spec.peers && !spec.filters.county && !spec.filters.authorityKind) {
    const ticks = defaultPeerTicks(data);
    if (ticks.length) next = writePeerTicks(next, ticks, data.facts);
  }
  if (follow.previousCounty !== undefined && follow.previousCounty !== null && countyDisplay(String(next.filters.county ?? "")) === follow.previousCounty
    && data.facts.county !== follow.previousCounty) {
    next = structuredClone(next);
    if (data.facts.county) next.filters.county = data.facts.county;
    else {
      delete next.filters.county;
      notes.push(`Am scos „${/^bucure/i.test(follow.previousCounty) ? "București" : `Județul ${follow.previousCounty}`}”: județul lui ${data.facts.name} nu e cunoscut.`);
    }
  }
  if (next.peers?.similar && data.facts.role === "authority" && !data.facts.similar) {
    next = structuredClone(next);
    delete next.peers!.similar;
    if (!Object.keys(next.peers!).length) delete next.peers;
    notes.push(`Am scos „același tip”: tipul lui ${data.facts.name} nu se poate stabili.`);
  }
  return next === spec ? null : { spec: next, notes };
}

/** The group as one value of the strip beside the answer ("Schimbă grupul"): the ticks and the county. */
export interface PeerGroupValue { peers: PeersOptions | null; county: string | null; kind: string | null }
const text = (v: unknown) => typeof v === "string" && v ? v : null;
export const peerGroupValue = (spec: { peers?: PeersOptions | undefined; filters: Record<string, unknown> }): PeerGroupValue =>
  ({ peers: spec.peers && Object.keys(spec.peers).length ? { ...spec.peers } : null, county: text(spec.filters.county), kind: text(spec.filters.authorityKind) });
/** A question with the group of `value` (JSON of PeerGroupValue): its ticks, county and an old link's kind; the rest as it was. */
export function withPeerGroup<S extends { peers?: PeersOptions | undefined; filters: Record<string, unknown> }>(spec: S, value: string): S {
  const parsed = JSON.parse(value) as PeerGroupValue;
  const next = structuredClone(spec);
  if (parsed.peers && Object.keys(parsed.peers).length) next.peers = { ...parsed.peers };
  else delete next.peers;
  for (const [key, v] of [["county", parsed.county], ["authorityKind", parsed.kind]] as const) {
    if (v) next.filters[key] = v;
    else delete next.filters[key];
  }
  return next;
}

/**
 * The bars of distribution-3 above 50 members (owner decision, 1 November
 * 2026): the score by tenths, 0 alone, then 1–9, 10–19 … 90–100 (rf-2026.20:
 * a weak pattern alone can score under 20). Both bounds are on the displayed
 * score and inclusive.
 */
export interface ScoreBand { from: number; to: number }
export const SCORE_BANDS: readonly ScoreBand[] = [
  { from: 0, to: 0 }, { from: 1, to: 9 }, ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((from) => ({ from, to: from === 90 ? 100 : from + 9 })),
];
/** The bar a displayed score falls in (rf-2026.20 gives 1–19 too: December or capacity alone, a weak firm duty). */
export const scoreBandOf = (score: number): ScoreBand | null =>
  SCORE_BANDS.find((band) => score >= band.from && score <= band.to) ?? null;
/** "0", "20–29", "90–100": a score out of 100, not a percentage (rf-2026.20). */
export const scoreBandWords = (band: ScoreBand): string => band.from === band.to ? `${band.from}` : `${band.from}–${band.to}`;

/**
 * The request of a bar's members (GET /api/ask/peers/members): the group as the
 * answer computed it, its ticks, the county (the entity's own, or an old link's
 * other one) and an old link's kind, not as the draft may say it now. The bar
 * is a band of the score (distribution-3), or, on an answer stored before it,
 * a number of criteria (distribution-2, `k`).
 */
export function barMembersQuery(
  d: { role: "authority" | "supplier"; focal: { entityId: string }; group: { ticks: readonly PeerRowId[]; facts: Pick<PeerFacts, "county">; legacy: { county?: string; authorityKind?: string } } },
  bar: number | ScoreBand, offset: number,
): string {
  const params = new URLSearchParams({ role: d.role, id: d.focal.entityId, ...(typeof bar === "number" ? { k: String(bar) } : { from: String(bar.from), to: String(bar.to) }) });
  if (offset > 0) params.set("offset", String(offset));
  if (d.group.ticks.includes("similar")) params.set("similar", "1");
  if (d.group.ticks.includes("activity")) params.set("activity", "1");
  const county = d.group.ticks.includes("county") ? d.group.facts.county : d.group.legacy.county ?? null;
  if (county) params.set("county", county);
  if (d.group.legacy.authorityKind) params.set("kind", d.group.legacy.authorityKind);
  return params.toString();
}

/** The window's (?) (kit §4: the rules in a tip, not inline): each row's rule, the band's coverage, the thresholds. */
export function peerWindowTip(data: Pick<PeerDialogData, "rows" | "coverage">): { title: string; text: string } {
  const rules = data.rows.map((row) => `${capitalFirst(row.rule)}: ${row.disabled?.tip ?? row.tip}`);
  // The thresholds in the glossary's words (fata-de-cine): its last sentence, after each row's rule and the band's coverage.
  const thresholds = GLOSSARY["fata-de-cine"].text.slice(GLOSSARY["fata-de-cine"].text.indexOf("Intră "));
  return { title: "Față de cine?", text: [...rules, ...(data.coverage ? [coverageWords(data.coverage)] : []), thresholds].join(" ") };
}

/** "30 din cele 32 de primării din interval sunt identificate sigur; lipsesc Alba Iulia și Popești-Leordeni." (final §3.1) */
export function coverageWords(c: PeerCoverage): string {
  const missing = c.inBand - c.identified;
  const names = c.missing.length ? `; lipsesc ${c.missing.join(", ")}${missing > c.missing.length ? ` și încă ${missing - c.missing.length}` : ""}` : "";
  const of = c.inBand === 1 ? "din singura primărie din interval" : `din cele ${countWords(c.inBand, "primărie", "primării")} din interval`;
  return `${formatInt(c.identified)} ${of} ${c.identified === 1 ? "e identificată" : "sunt identificate"} sigur${names}.`;
}

/*
 * The criteria (final §3.7, kit §4 "Semnalele"): the codes a role can meet, in
 * their order. The short label and the rule of each at the level of an entity
 * are FLAG_META.label and .entityRule (lib/flags.ts, F6b), which the risk cloud
 * speaks too; the codes and their order are the risk score's (lib/risk-score.ts
 * RISK_CRITERIA, equal to @seap/db's PROFILE_FLAG_CODES, tested). An answer
 * stored before rf-2026.18 names its own codes, a retired one by its code.
 */
export const CRITERIA: Readonly<Record<"authority" | "supplier", readonly RiskCriterion[]>> = RISK_CRITERIA;
const CRITERIA_CODES = [...new Set([...CRITERIA.authority, ...CRITERIA.supplier])];
export const CRITERION_LABEL: Readonly<Record<string, string>> = Object.fromEntries(CRITERIA_CODES.map((code) => [code, flagLabel(code)]));
export const CRITERION_RULE: Readonly<Record<string, string>> = Object.fromEntries(CRITERIA_CODES.map((code) => [code, flagEntityRule(code)]));
/** "3 din 5 criterii" (final §3.6): the criteria a role can meet. */
export const criteriaOf = (role: "authority" | "supplier") => CRITERIA[role];
