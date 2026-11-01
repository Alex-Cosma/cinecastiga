import { countWords, formatShare } from "../../lib/ask/answer-text";
import {
  buyerForm, jointShare, levelWords, oneRecordShare, placeShare, RISK_SHOWN, signalsWords, tiesNotDistinct,
  type LegacyTiePlace, type LegacyTies, type Podium, type PodiumFact, type PodiumPlace, type RiskPlace, type RiskRanking,
} from "../../lib/ask/entity-card-shared";
import { countyName } from "../../lib/counties";
import { flagLabel } from "../../lib/flags";
import { retarget } from "../../lib/ask/filters/retarget";
import { employeesWords } from "../../lib/ask/filters/words";
import { KIND_ONE, KIND_WORDS, type QuestionSpec } from "../../lib/ask/question-ui";
import { SEAT_ABROAD } from "../../lib/ask/seat";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import { RISK_BAND_CLASS, RISK_BAND_WORD, riskBand, riskPercent } from "../../lib/risk-score";
import { newFirmTag, rankedGroupLead } from "../../lib/ask/winner-words";
import type { RowFact } from "./answer/RowFacts";

/*
 * "Cine conduce?" (entity_card-3; entity_card-2: final entity_card §3.9–§3.10)
 * as the answer draws it: the words, the tags and the order of the podium and
 * of the ranking by the risk score, and of the group at the top of the old
 * index an answer stored as entity_card-2 holds. Pure: EntityCardAnswer.tsx
 * draws it, answer-csv.ts exports the same rows.
 */

type Spec = Pick<QuestionSpec, "dim" | "filters">;

/** A balance sheet older than this many years before the data's latest filing year is read with care (amber). */
const OLD_BALANCE_YEARS = 2;

/** The place beside a name: "Firmă · sediul în București", "Instituție · județul Cluj" (R9: a firm's county is its seat). */
export function placeWords(place: Pick<PodiumPlace, "county">, spec: Spec, population: number | null = null): string {
  const firm = spec.dim === "supplier";
  // The data writes a county without diacritics ("Bucuresti"): the list's own spelling.
  const county = place.county && place.county !== SEAT_ABROAD ? countyName(place.county) : place.county;
  const named = county && county !== SEAT_ABROAD ? (/^bucure[sș]ti$/i.test(county) ? county : `județul ${county}`) : null;
  const where = !county ? null : county === SEAT_ABROAD ? (firm ? "din străinătate" : null) : firm ? `sediul în ${named}` : named;
  return [firm ? "Firmă" : "Instituție", where, population !== null && population > 0 ? countWords(population, "locuitor", "locuitori") : null].filter(Boolean).join(" · ");
}

/**
 * The tags of a place (P8, at most three, final §3.9): the share of its value that comes from contracts with
 * several winners (from a quarter), a single record with at least half of it (amber), and the band of
 * CÂȘTIGĂTORII the question set, with the year of the balance sheet it was read from (amber when old).
 * „Firme noi” (F5, S6) puts its own tag first — „prima dată aici: 02.10.2024”, „prima dată în 2025”, „înmatriculată
 * în 2024” — as on the rows of "Cine câștigă?" (winner-words.ts newFirmTag).
 * „În asociere” is a firm's tag (plan P8: an institution's would be its largest supplier): a buyer has no share in a
 * contract of several winners, and its (?) speaks of firms.
 */
export function placeFacts(place: PodiumPlace, fact: PodiumFact | undefined, spec: Spec, lastYear: number | null): RowFact[] {
  const tags: RowFact[] = [];
  const chosen = spec.dim === "supplier" && fact
    ? newFirmTag(spec, { first: fact.firstActivity, registered: fact.registeredYear ?? null, firstHere: fact.firstHere ?? null }) : null;
  if (chosen) tags.push(chosen);
  const joint = spec.dim === "supplier" ? jointShare(place.value, fact) : null;
  if (joint !== null) tags.push({ text: `${Math.round(joint * 100)}% în asociere`, tip: { id: "in-asociere" } });
  const one = oneRecordShare(place, fact);
  // A place of a single record says so too (final §3.9: ENERGOMONTAJ, one contract, 100%).
  if (one !== null) tags.push({
    text: `${one.src === "contracts" ? "1 contract" : "1 achiziție directă"}: ${Math.round(one.share * 100)}%`, tone: "caveat",
    tip: { title: "O înregistrare mare", text: `Cea mai mare înregistrare a locului face ${formatShare(one.share)} din valoarea lui. Un contract intră întreg în anul atribuirii: indiciu de verificat, nu concluzie.` },
  });
  const band = employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees);
  if (band && fact && fact.employees !== null) {
    // Old against the data's latest filing year (PodiumResult.balanceYear), never the wall clock; unknown, not amber.
    const stale = fact.employeesYear !== null && lastYear !== null && fact.employeesYear < lastYear - OLD_BALANCE_YEARS;
    tags.push({
      text: `${countWords(fact.employees, "angajat", "angajați")}${fact.employeesYear !== null ? ` · bilanț ${fact.employeesYear}` : ""}`,
      ...(stale ? { tone: "caveat" as const } : {}), tip: { id: "angajati-benzi" },
    });
  }
  return tags.slice(0, 3);
}

/** Place 1's distance from place 2, in lei, as the answer writes it. */
export const leadWords = (lead: number): string => formatRon(lead);

/** The largest record of a place, "452,9 mil. lei", or null while the facts load or without one. */
export const largestWords = (fact: PodiumFact | undefined): string | null => fact?.largest ? formatRon(fact.largest.value) : null;

/** A place's share of the total, "21,1%", or null without a total. */
export function shareWords(place: Pick<PodiumPlace, "value">, podium: Pick<Podium, "total">): string | null {
  const share = placeShare(place, podium.total);
  return share === null ? null : formatShare(share);
}

/** The ranked role's nouns: one and many, and the same for the kind of institution the question names. */
export function subjectNouns(spec: Spec): { one: string; many: string } {
  if (spec.dim === "supplier") return { one: "firmă", many: "firme" };
  const kind = spec.filters.authorityKind;
  return typeof kind === "string" && KIND_WORDS[kind] ? { one: KIND_ONE[kind] ?? "instituție", many: KIND_WORDS[kind]!.bare } : { one: "instituție", many: "instituții" };
}

/**
 * The line under the podium: "Din 26,46 mld. lei, câștigați de 1.467 firme"; for institutions "Din 2,30 mld. lei, la 17 spitale"
 * (a purchase is not a payment, so no verb of spending). Under a band of CÂȘTIGĂTORII the total is the band's.
 */
export function totalLead(podium: Pick<Podium, "total">, spec: Spec): { value: string; link: string; who: string } | null {
  const total = podium.total;
  if (!total) return null;
  const nouns = subjectNouns(spec);
  return { value: formatRon(total.value), link: spec.dim === "supplier" ? ", câștigați de " : ", la ", who: countWords(total.entities, nouns.one, nouns.many) };
}

/**
 * The words before the category's sum on the total line, under CÂȘTIGĂTORII (the podium's `selection`): the list as
 * "Cine câștigă?" says it with „Firme noi” („3.658 de firme înmatriculate din 2024, cu 1–9 angajați”,
 * winner-words.ts rankedGroupLead), else the firms of the band („412 firme cu 1–9 angajați”).
 */
export function categoryLead(podium: Pick<Podium, "total">, spec: Spec): string | null {
  if (!podium.total) return null;
  const listed = rankedGroupLead({ block: "entity_card", dim: spec.dim, filters: spec.filters }, podium.total.entities);
  if (listed) return listed;
  const nouns = subjectNouns(spec), band = employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees);
  return [countWords(podium.total.entities, nouns.one, nouns.many), band].filter(Boolean).join(" ");
}

/** What the three places leave: "celelalte 1.464 firme · 49,2%". */
export function restWords(rest: { entities: number; share: number }, spec: Spec): string {
  const nouns = subjectNouns(spec);
  return `${rest.entities === 1 ? "cealaltă" : "celelalte"} ${countWords(rest.entities, nouns.one, nouns.many)} · ${formatShare(rest.share)}`;
}

/* ── the risk axis (entity_card-3) ──────────────────────────────────────── */

/**
 * The headline of the ranking by the risk score (the owner-approved mockup, 1 November 2026): „Primul: Spitalul
 * Orășenesc Agnita, 71% · puternic.”, or „3 la egalitate pe primul loc, 60% · moderat.” when several share the best
 * displayed score (the screen adds the (?) of a tie, glossary `indice-egalitate`); „Nu are semnale în profil” when
 * nobody in the group has a score.
 */
export type RankingHeadline =
  | { kind: "none"; kicker: string; lead: string }
  | { kind: "first" | "tied"; lead: string; score: string; band: string };

export function rankingHeadline(ranking: Pick<RiskRanking, "pool" | "top" | "topCount" | "rows">, spec: Spec): RankingHeadline {
  const first = ranking.rows[0];
  if (ranking.top <= 0 || !first) {
    const nouns = subjectNouns(spec);
    return { kind: "none", kicker: "Nu are semnale în profil", lead: `Niciuna din ${countWords(ranking.pool, nouns.one, nouns.many)} nu are semnale în profil` };
  }
  const { text: score, band } = scorePill(ranking.top);
  return ranking.topCount > 1
    ? { kind: "tied", lead: `${formatInt(ranking.topCount)} la egalitate pe primul loc`, score, band }
    : { kind: "first", lead: `Primul: ${cleanName(first.name)}`, score, band };
}

/** A score as its pill says it, the band's word beside it and the pill's colour class: „71%”, „puternic”, risk-high. */
export function scorePill(score: number): { text: string; band: string; className: string } {
  const band = riskBand(score);
  return { text: riskPercent(score), band: RISK_BAND_WORD[band], className: RISK_BAND_CLASS[band] };
}

/** A pattern in lower case, in the site's words („achiziții repetate, peste plafon cumulat”); a code the site no longer names stays the code. */
export const patternWord = (code: string): string => {
  const label = flagLabel(code);
  return label.charAt(0).toLocaleLowerCase("ro-RO") + label.slice(1);
};

/**
 * The tags of a ranked profile (P8, at most three): its patterns in the site's words (orange is theirs), the first two
 * and „+N” for the rest with the list in the (?), then „societate” / „asociație” for a buyer whose name shows a legal
 * form that is no institution's (final §3.10).
 */
export function riskFacts(row: Pick<RiskPlace, "name" | "flags">, spec: Spec): RowFact[] {
  const tags: RowFact[] = row.flags.slice(0, 2).map((code) => ({ text: patternWord(code), tone: "signal" as const }));
  if (row.flags.length > 2) tags.push({
    text: `+${row.flags.length - 2}`,
    tip: { title: "Alte tipare", text: row.flags.slice(2).map(patternWord).join(", ") + ". Piste de verificat, nu dovezi." },
  });
  const form = spec.dim === "supplier" ? null : buyerForm(row.name);
  if (form && tags.length < 3) tags.push({ text: form, tip: { id: "cumparator-societate" } });
  return tags.slice(0, 3);
}

/** A profile's line beside its name: its county and its direct acquisitions. */
export const profilePlace = (row: Pick<RiskPlace, "county" | "count">): string =>
  [row.county ? countyName(row.county) : null, countWords(row.count, "achiziție directă", "achiziții directe")].filter(Boolean).join(" · ");

/** With no signal in the group, what the sources and the CSV hold (runRows: the first profiles by value): „Sursele: primele 50 după valoare, fără semnale.” */
export const noneSources = (rows: readonly unknown[]): string =>
  rows.length === 1 ? "Sursele: singurul profil, fără semnale." : `Sursele: primele ${countWords(rows.length, "profil", "profiluri")} după valoare, fără semnale.`;

/** The rows shown first, and how many wait behind „Arată toate”. */
export function shownRows<T>(rows: readonly T[], all: boolean): { rows: T[]; hidden: number } {
  const shown = all ? [...rows] : rows.slice(0, RISK_SHOWN);
  return { rows: shown, hidden: rows.length - shown.length };
}

/** The shown rows all have the same displayed score: their order is the value's („În ordinea valorii, nu a riscului”). */
export const shownTied = (rows: readonly Pick<RiskPlace, "score">[]): boolean => rows.length > 1 && rows.every((row) => row.score === rows[0]!.score);

/** „Arată toate cele 14” when the list holds every profile with a score, „Arată primele 50” when the group has more. */
export function showAllWords(ranking: Pick<RiskRanking, "pool" | "scored" | "top" | "rows">): string {
  const whole = ranking.top > 0 ? ranking.scored : ranking.pool;
  return `${ranking.rows.length >= whole ? "Arată toate cele" : "Arată primele"} ${formatInt(ranking.rows.length)}`;
}

/** „+ 5 fără semnale”: under the whole list, once it is all shown, the profiles of the group without a score. */
export function rankingRest(ranking: Pick<RiskRanking, "pool" | "scored" | "top" | "rows">, hidden: number): string | null {
  if (ranking.top <= 0 || hidden > 0 || ranking.rows.length < ranking.scored) return null;
  const without = ranking.pool - ranking.scored;
  return without > 0 ? `+ ${formatInt(without)} fără semnale` : null;
}

/* ── an answer stored as entity_card-2: the group at the top of the old index, drawn as it was ── */

export interface LegacyTiesHeadline {
  /** The bold line above (final frame E): „Indicele nu le deosebește”, „Singur pe primul loc”, or none. */
  kicker: string | null;
  /** The sentence: its bold parts apart, so the screen sets them. */
  lead: string;
  level: string;
  signals: string;
  /** The next level, for the single leader: „Următorul nivel, 0,75: 14 din 2.237 firme.” */
  next: string | null;
  /** Nobody in the group meets a signal. */
  none: boolean;
  /** „Indicele nu le deosebește”: the kicker carries its (?) (glossary `indice-egalitate`, final §3.10). */
  notDistinct: boolean;
}

export function legacyTiesHeadline(ties: LegacyTies, spec: Spec): LegacyTiesHeadline {
  const nouns = subjectNouns(spec);
  const level = levelWords(ties.level), signals = signalsWords(ties);
  const next = ties.nextLevel !== null
    ? `Următorul nivel, ${levelWords(ties.nextLevel)}: ${formatInt(ties.nextCount)} din ${countWords(ties.pool, nouns.one, nouns.many)}.` : null;
  const plain = { level, signals, next: null, none: false, notDistinct: false };
  if (ties.maxFlags === 0) return { ...plain, kicker: "Nu are semnale în profil", lead: `Niciuna din ${countWords(ties.pool, nouns.one, nouns.many)} nu are semnale în profil`, none: true };
  if (ties.count === 1) return { ...plain, kicker: "Singur pe primul loc", lead: "", next };
  if (tiesNotDistinct(ties)) return {
    ...plain, kicker: "Indicele nu le deosebește", lead: `${formatInt(ties.count)} din ${countWords(ties.pool, nouns.one, nouns.many)} au același indice`, notDistinct: true,
  };
  return { ...plain, kicker: null, lead: `${countWords(ties.count, nouns.one, nouns.many)} au indicele maxim` };
}

/** The tags of a profile at the top of the old index: as riskFacts, with that answer's words for the rest („Alte semnale”). */
export function legacyTieFacts(row: LegacyTiePlace, spec: Spec): RowFact[] {
  const tags: RowFact[] = row.flags.slice(0, 2).map((code) => ({ text: patternWord(code), tone: "signal" as const }));
  if (row.flags.length > 2) tags.push({
    text: `+${row.flags.length - 2}`,
    tip: { title: "Alte semnale", text: row.flags.slice(2).map(patternWord).join(", ") + ". Semnale statistice, nu dovezi." },
  });
  const form = spec.dim === "supplier" ? null : buyerForm(row.name);
  if (form && tags.length < 3) tags.push({ text: form, tip: { id: "cumparator-societate" } });
  return tags.slice(0, 3);
}

/** „+ încă 9 cu același indice · 5 fără semnale”: what the first rows leave at the same level, and the profiles with none. */
export function legacyTiesRest(ties: LegacyTies, hidden: number): string | null {
  const parts: string[] = [];
  if (hidden > 0) parts.push(`încă ${formatInt(hidden)} cu același indice`);
  // The tied profiles past the 50 listed: said, never silent.
  const unlisted = ties.count - ties.rows.length;
  if (unlisted > 0) parts.push(`${formatInt(unlisted)} nu încap în listă`);
  if (ties.nextLevel === 0 && ties.nextCount > 0 && hidden > 0) parts.push(`${formatInt(ties.nextCount)} fără semnale`);
  return parts.length ? `+ ${parts.join(" · ")}` : null;
}

/**
 * „Pe harta riscului ›” of the index (F6c, final entity_card §3.10): the same profiles as the risk cloud, which applies
 * the county, the seat and the kind but not a firm's size (unsupportedPopulationView refuses it there; plan §3 gives
 * the employees to the index alone). A band is left out of the link and said in its tip, never carried into a refusal.
 */
export function riskCloudLink(spec: QuestionSpec): { spec: QuestionSpec; tip: string | null } {
  const cloud = retarget(spec, "scatter");
  const band = employeesWords(cloud.filters.minEmployees, cloud.filters.maxEmployees);
  if (cloud.filters.minEmployees === undefined && cloud.filters.maxEmployees === undefined) return { spec: cloud, tip: null };
  const { minEmployees: _min, maxEmployees: _max, ...filters } = cloud.filters;
  return { spec: { ...cloud, filters }, tip: `Norul nu se restrânge după angajați: arată toate firmele, nu doar cele ${band ?? "din banda aleasă"}.` };
}
