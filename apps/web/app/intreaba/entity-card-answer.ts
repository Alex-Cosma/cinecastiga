import { countWords, formatShare } from "../../lib/ask/answer-text";
import {
  buyerForm, jointShare, levelWords, oneRecordShare, placeShare, signalsWords, TIES_SHOWN, tiesNotDistinct,
  type Podium, type PodiumFact, type PodiumPlace, type Ties, type TiePlace,
} from "../../lib/ask/entity-card-shared";
import { countyName } from "../../lib/counties";
import { CRITERION_LABEL } from "../../lib/ask/peer-groups-shared";
import { employeesWords } from "../../lib/ask/filters/words";
import { KIND_ONE, KIND_WORDS, type QuestionSpec } from "../../lib/ask/question-ui";
import { SEAT_ABROAD } from "../../lib/ask/seat";
import { formatInt, formatRon } from "../../lib/format";
import { newFirmTag } from "../../lib/ask/winner-words";
import type { RowFact } from "./answer/RowFacts";

/*
 * "Cine conduce?" (entity_card-2, final entity_card §3.9–§3.10) as the answer
 * draws it: the words, the tags and the order of the podium and of the group at
 * the top of the index. Pure: EntityCardAnswer.tsx draws it, answer-csv.ts
 * exports the same rows.
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

/** What the three places leave: "celelalte 1.464 firme · 49,2%". */
export function restWords(rest: { entities: number; share: number }, spec: Spec): string {
  const nouns = subjectNouns(spec);
  return `${rest.entities === 1 ? "cealaltă" : "celelalte"} ${countWords(rest.entities, nouns.one, nouns.many)} · ${formatShare(rest.share)}`;
}

/* ── the index ──────────────────────────────────────────────────────────── */

export interface TiesHeadline {
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

export function tiesHeadline(ties: Ties, spec: Spec): TiesHeadline {
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

/** The lower-case word of a signal, as the official label says it ("posibilă fracționare"). */
export const signalWord = (code: string): string => {
  const label = CRITERION_LABEL[code] ?? code;
  return label.charAt(0).toLocaleLowerCase("ro-RO") + label.slice(1);
};

/**
 * The tags of a profile at the top (P8, at most three): its signals with the official words (orange is theirs), the
 * first two and „+N” for the rest with the list in the (?), then „societate” / „asociație” for a buyer whose name
 * shows a legal form that is no institution's (final §3.10).
 */
export function tieFacts(row: TiePlace, spec: Spec): RowFact[] {
  const tags: RowFact[] = row.flags.slice(0, 2).map((code) => ({ text: signalWord(code), tone: "signal" as const }));
  if (row.flags.length > 2) tags.push({
    text: `+${row.flags.length - 2}`,
    tip: { title: "Alte semnale", text: row.flags.slice(2).map(signalWord).join(", ") + ". Semnale statistice, nu dovezi." },
  });
  const form = spec.dim === "supplier" ? null : buyerForm(row.name);
  if (form && tags.length < 3) tags.push({ text: form, tip: { id: "cumparator-societate" } });
  return tags.slice(0, 3);
}

/** A profile's line beside its name: its county and its direct acquisitions. */
export const tiePlace = (row: TiePlace): string => [row.county ? countyName(row.county) : null, countWords(row.count, "achiziție directă", "achiziții directe")].filter(Boolean).join(" · ");

/** With no signal in the group, what the sources and the CSV hold (runRows: the first profiles by value): „Sursele: primele 50 după valoare, fără semnale.” */
export const tiesNoneSources = (ties: Pick<Ties, "rows">): string =>
  ties.rows.length === 1 ? "Sursele: singurul profil, fără semnale." : `Sursele: primele ${countWords(ties.rows.length, "profil", "profiluri")} după valoare, fără semnale.`;

/** The rows shown first, and how many wait behind „Arată toate”. */
export function tiesShown(ties: Ties, all: boolean): { rows: TiePlace[]; hidden: number } {
  const rows = all ? ties.rows : ties.rows.slice(0, TIES_SHOWN);
  return { rows, hidden: ties.rows.length - rows.length };
}

/** „+ încă 9 cu același indice · 5 fără semnale”: what the first rows leave at the same level, and the profiles with none. */
export function tiesRest(ties: Ties, hidden: number): string | null {
  const parts: string[] = [];
  if (hidden > 0) parts.push(`încă ${formatInt(hidden)} cu același indice`);
  // The tied profiles past the 50 listed: said, never silent.
  const unlisted = ties.count - ties.rows.length;
  if (unlisted > 0) parts.push(`${formatInt(unlisted)} nu încap în listă`);
  if (ties.nextLevel === 0 && ties.nextCount > 0 && hidden > 0) parts.push(`${formatInt(ties.nextCount)} fără semnale`);
  return parts.length ? `+ ${parts.join(" · ")}` : null;
}
