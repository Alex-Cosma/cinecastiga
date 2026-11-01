import { countyIsFirmSeat } from "../population";
import { firmSeatWords, firmsKindPhrase, seatCountyWords } from "../seat";
import { PROCEDURE_WORDS, PURCHASE_KIND_WORDS, type Procedure, type PurchaseKind } from "../purchase";
import {
  KIND_ONE, KIND_OPTIONS, KIND_WORDS, compareWithLabel, countyWords, entityLabel, leaderAxis, subjectWords, type QuestionSpec,
} from "../question-ui";
import { DEFAULT_TREND_MIN_BASE, type AskSpec, type AuthorityKind, type Block, type FirmSeat } from "../spec";
import { formatRon } from "../../format";
import { peerGroupWords, type PeerFacts } from "../peer-groups-shared";
import { filterContext, formOf } from "./context";
import { TREND_CHANGE_LABELS, TREND_CHANGE_PHRASE, TREND_NO_RECORDS, firstTimeTip, firstTimeWords, trendGap } from "./defs/trend";
import { lastNetworkYear } from "./defs/network";
import { NETWORK_ORDER_WORDS, NETWORK_VERBS, networkShow } from "../network-shared";
import type { FilterCtx, FilterId, FilterSpec, Picker, Slot } from "./types";
import {
  TREND_ORDER_WORDS, adminLead, adminPhrase, employeesOnBands, localityName, periodPhrase, periodWordsWith,
  streamWords, trendBaseWho,
} from "./words";

/*
 * The sentence of each question (plan §2.2 sentence.ts, §2.3, §4.1–§4.13;
 * kit §3 components 1 and 1b, §4): what is counted, as tokens: text, an
 * editable phrase (a slot, which opens its filter's window) or a fixed phrase
 * (text that cannot change here). The builder draws them (builder/Sentence.tsx)
 * and the answer's title reads them as text (sentenceText, R11). Today's keys
 * and the trend's (F2): a key read ahead has no phrase until its stage.
 *
 * - The subject is the first phrase of a ranking ("Ce [firme]", "În ce
 *   [județe]"), of the trend, the risk cloud ("Ce [instituții publice] din
 *   [toată țara]") and "Cine conduce?" ("Care [firmă]"), whose axis is the verb.
 * - "din [loc]" is always the buyer's place (R9); the firm's seat is glued to
 *   the firms that are the subject, "cu sediul [în alt județ]" (F4: firmSeat,
 *   seatCounty; on firm profiles a link's county is that seat too).
 * - The administrator is a selection phrase (plan §9 F1), glued to the ranked
 *   firms ("Ce [firme] conduse azi de [X] câștigă…"), else "de la [firmele
 *   conduse azi de …]". The employees of the ranked firms are the group row
 *   CÂȘTIGĂTORII since F3 (table:employees-2, blocks.ts winners), elsewhere
 *   "de la [firme cu 1–9 angajați]". A range off the kit's bands (0 · 1–9 ·
 *   10–49 · 50–249 · 250+) is an old link's: its window cannot show it, so it
 *   stays under the sentence (kit §5.5).
 * - A condition the sentence does not say stays a condition under it ("Din
 *   link", legacyConditions): saidFilters tells which ones it says.
 *
 * The words are the shared ones (filters/words.ts, question-ui.ts KIND_*), so
 * the chips, the total line and the title say the same thing.
 */

/** An editable phrase. `id` is unique in its sentence (the second year of a trend is "period.2"). */
export interface SentenceSlot {
  kind: "slot";
  id: string;
  /** The filter whose window the phrase opens. */
  filter: FilterId;
  /** The filters whose values the words state; empty on a default ("toată țara"). */
  says: readonly FilterId[];
  /** Other filters the same window writes (the buyer's window: an institution, a kind or a town hall). */
  writes?: readonly FilterId[];
  /** A window that writes several filters as one choice (types.ts Picker): the focal entity, the subject, the buyer, "De la cine?". */
  picker?: Picker;
  /**
   * A selection glued to the ranked firms (their size, administrator or seat):
   * part of the subject, so the total line repeats it (G8).
   */
  glued?: true;
  /** The question needs a value here (the pair of a verification): the window has no empty row. */
  required?: true;
  /** Spoken with the value: "Perioada: 2025" (kit component 1). */
  slot: string;
  value: string;
  /** The window's title, the question the phrase answers (R10). */
  window: string;
}
/** Words that cannot change here (component 1b): "din toată țara" for county councils. Text, not a button. */
export interface SentenceFixed { kind: "fixed"; text: string; says: readonly FilterId[]; tip?: string }
export type SentenceToken = { kind: "text"; text: string } | SentenceSlot | SentenceFixed;

/** What the caller knows besides the spec. */
export interface SentenceLabels {
  /** The name of a CPV code ("Lucrări de construcții"). */
  cpvName?: string | null | undefined;
  /** The reader's own words for the domain, said quoted ("pentru [„iluminat”]"): the interpreter's subject. */
  subject?: string | null | undefined;
  /** The years a trend's answer compared (its data.yearA/yearB): said where the spec has none (the archive's first and last). */
  trendYears?: { yearA: number; yearB: number } | null | undefined;
  /** The reader asked about town halls and the question counts every institution: the default institutions say so. */
  allInstitutions?: boolean | undefined;
  /** The reference year a network's answer counted its groups from (its data.since): said where the spec has none. */
  networkSince?: number | null | undefined;
  /** A distribution's entity and the facts that bound its group ("cu 52–207 mii de locuitori"): the window's or the answer's. */
  peerGroup?: PeerFacts | null | undefined;
}

/**
 * Kinds the profiles' subject could say only after D1 (plan §9 F1, §4.12,
 * §4.13): by name, "primării de oraș și municipiu" held 19% communes and
 * "spital" missed the clinical institutes. D1 classifies them from the
 * locality registry and the clinical-institute list (authority-kind.ts), so
 * none waits any more; the hook stays for a kind that will.
 */
export const KINDS_AFTER_D1: Partial<Record<Block, readonly AuthorityKind[]>> = {};

/**
 * Whether a kind waits for D1 on this question: only as the profiles'
 * subject (institutions). As the buyers of a ranking of firms ("Care firmă
 * câștigă cel mai mult din achizițiile făcute de [spitalele]…") it is a
 * buyer's kind like on "Cine câștigă?", and the engine applies it.
 */
export function kindAfterD1(spec: { block: string; dim?: string | undefined }, kind: unknown): boolean {
  return spec.dim !== "supplier" && (KINDS_AFTER_D1[spec.block as Block] ?? []).includes(kind as AuthorityKind);
}

/** Each phrase's spoken name and window title (R10; kit §4, §5.46). */
const NAMES = {
  dataset: ["Achizițiile", "Ce fel de achiziții?"],
  cpvTerm: ["Ce s-a cumpărat", "Ce s-a cumpărat?"],
  buyer: ["Cine a cumpărat", "Cine a cumpărat?"],
  place: ["Unde", "Unde?"],
  seat: ["Sediul firmei", "Unde au sediul firmele?"],
  from: ["De la cine", "De la cine?"],
  period: ["Perioada", "În ce perioadă?"],
  // The trend's two years open the same period window, titled by what it compares (trend final §3.2).
  years: ["Perioada", "Ce ani compari?"],
  when: ["Perioada", "Când?"],
  ranked: ["Ce clasăm", "Ce clasăm?"],
  who: ["Cine", "Cine?"],
  rivals: ["Cine concurează", "Cine concurează?"],
  axis: ["Ce cauți", "Ce cauți?"],
  measure: ["Ce măsori", "Ce măsori?"],
  focal: ["Despre cine", "Despre cine vrei să afli?"],
  compareWith: ["Cu cine comparăm", "Cu cine comparăm?"],
  peers: ["Față de cine", "Față de cine?"],
  employees: ["Angajați", "Câți angajați au firmele?"],
  admin: ["Administrator", "Cine conduce firmele?"],
  topN: ["Câte rânduri", "Cât de lung să fie clasamentul?"],
  order: ["Ordinea", "Cum comparăm?"],
  change: ["Felul schimbării", "Ce fel de schimbare?"],
  minBase: ["Pragul", "De la ce valoare?"],
  partners: ["Ce parteneri", "Ce parteneri?"],
  since: ["Anul de referință", "Față de ce an?"],
  show: ["Câți parteneri", "Câți parteneri arăți?"],
  partnerOrder: ["Ordinea", "Cum ordonăm partenerii?"],
} as const satisfies Record<string, readonly [string, string]>;
type Name = keyof typeof NAMES;

/** P5 measures, kit §4 "Măsura". */
const MEASURE_WORDS: Record<string, string> = {
  value: "valoarea înregistrată", count: "numărul de înregistrări", value_per_capita: "valoarea pe locuitor",
};
const ALL_BUYERS = KIND_OPTIONS[0][1];
const ALL_BUYERS_BARE = "instituții publice";

type Spec = FilterSpec;
const has = (v: unknown) => v !== undefined && v !== null && v !== "";
const hasPeriod = (spec: Spec) => ["yearFrom", "yearTo", "monthFrom", "monthTo"].some((key) => has(spec.filters[key]));
/** Employees the sentence says: on the kit's bands (an old link's range stays under it, kit §5.5). */
const hasEmployees = (spec: Spec) =>
  (has(spec.filters.minEmployees) || has(spec.filters.maxEmployees)) && employeesOnBands(spec.filters.minEmployees, spec.filters.maxEmployees);
const hasLocality = (spec: Spec) => has(spec.filters.uatSiruta) || has(spec.filters.uatName);
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase("ro-RO") + text.slice(1);

/** The tokens of one sentence, adjacent text merged. */
class Tokens {
  readonly list: SentenceToken[] = [];
  private readonly ids = new Map<string, number>();
  text(text: string): this {
    const last = this.list[this.list.length - 1];
    if (last?.kind === "text") last.text += text;
    else if (text) this.list.push({ kind: "text", text });
    return this;
  }
  slot(filter: FilterId, name: Name, value: string, extra: { says?: readonly FilterId[]; writes?: readonly FilterId[]; picker?: Picker; glued?: true; required?: true; id?: string } = {}): this {
    const seen = this.ids.get(filter) ?? 0;
    this.ids.set(filter, seen + 1);
    const writes = extra.writes?.filter((id) => id !== filter);
    this.list.push({
      kind: "slot", id: extra.id ?? (seen ? `${filter}.${seen + 1}` : filter), filter, says: extra.says ?? [filter],
      ...(writes?.length ? { writes } : {}), ...(extra.picker ? { picker: extra.picker } : {}), ...(extra.glued ? { glued: true as const } : {}),
      ...(extra.required ? { required: true as const } : {}),
      slot: NAMES[name][0], value, window: NAMES[name][1],
    });
    return this;
  }
  fixed(text: string, says: readonly FilterId[], tip?: string): this {
    this.list.push({ kind: "fixed", text, says, ...(tip ? { tip } : {}) });
    return this;
  }
}

/** A kind the sentence can say on this question; a newer one (local_admin) or one waiting for D1 stays a condition under it. */
function kindOf(spec: Spec): string | undefined {
  const kind = spec.filters.authorityKind;
  if (typeof kind !== "string" || !KIND_WORDS[kind]) return undefined;
  return kindAfterD1(spec, kind) ? undefined : kind;
}

/**
 * "din [toată țara]", "din [județul Cluj]", "din [București]": the buyer's place (R9). Its window
 * also finds a town hall where the question takes one, unless `locality` is false (an institution
 * that is the subject: the town hall would be the answer itself).
 */
function place(out: Tokens, spec: Spec, ctx: FilterCtx, locality = true): void {
  const county = has(spec.filters.county) ? String(spec.filters.county) : null;
  out.text(" din ").slot("county", "place", county ? countyWords(county).replace(/^din /, "") : "toată țara", {
    says: county ? ["county"] : [], ...(locality && ctx.locality.ok ? { writes: ["locality"] } : {}),
  });
}

/**
 * The firm's seat, glued to the firms that are the subject (F4, kit §4, §5.28, R9): "cu sediul [în alt
 * județ]" (firmSeat, against the buyer's county) or "cu sediul [în județul Cluj]" (seatCounty). On firm
 * profiles a link's county is the same seat: it says it until the window writes seatCounty in its place.
 * Nothing when no seat is chosen: the invitation "+ Sediul firmei" adds it.
 */
function seat(out: Tokens, spec: Spec): void {
  const f = spec.filters;
  // A profile has no record to compare with the buyer's county: there the window writes only a county.
  const profile = countyIsFirmSeat(spec, spec.dim === "supplier" ? "supplier" : "authority");
  const writes: FilterId[] = profile ? ["seatCounty"] : ["firmSeat", "seatCounty"];
  if (has(f.firmSeat)) out.text(" cu sediul ").slot("firmSeat", "seat", firmSeatWords(f.firmSeat as FirmSeat, has(f.county) ? String(f.county) : null), { glued: true, writes });
  else if (has(f.seatCounty)) out.text(" cu sediul ").slot("seatCounty", "seat", seatCountyWords(String(f.seatCounty)), { glued: true, writes });
  else if (has(f.county) && profile)
    out.text(" cu sediul ").slot("county", "seat", seatCountyWords(String(f.county)), { glued: true, writes });
}
/** A seat the sentence says (seat above). */
const hasSeat = (spec: Spec) => has(spec.filters.firmSeat) || has(spec.filters.seatCounty)
  || has(spec.filters.county) && countyIsFirmSeat(spec, spec.dim === "supplier" ? "supplier" : "authority");

/**
 * Who bought, after its verb ("făcute de "): a named institution, a town hall
 * ("primăria [Cluj-Napoca]") or a kind of institution with its place. The
 * buyer's window writes all three; `place` says when "din [loc]" follows a kind.
 */
function buyer(out: Tokens, spec: Spec, ctx: FilterCtx, opts: { place: "always" | "set" | "never"; locality?: boolean; authority?: boolean }): void {
  const locality = opts.locality !== false && ctx.locality.ok;
  const writes: FilterId[] = [...(opts.authority !== false ? ["authority" as const] : []), "authorityKind", ...(locality ? ["locality" as const] : [])];
  if (opts.authority !== false && ctx.named.authority) {
    out.slot("authority", "buyer", entityLabel(spec, "authority"), { writes, picker: "buyer" });
    return;
  }
  if (locality && hasLocality(spec)) {
    out.text("primăria ").slot("locality", "buyer", spec.filters.uatName ? localityName(String(spec.filters.uatName)) : `SIRUTA ${spec.filters.uatSiruta}`, { writes, picker: "buyer" });
    return;
  }
  const kind = kindOf(spec);
  out.slot("authorityKind", "buyer", kind ? KIND_WORDS[kind]!.the : ALL_BUYERS, { says: kind ? ["authorityKind"] : [], writes, picker: "buyer" });
  if (opts.place === "always" || opts.place === "set" && has(spec.filters.county)) place(out, spec, ctx);
}

/** The buyer is the default (every institution, the whole country): hidden beside a named firm or person (kit §6 stat). */
const defaultBuyer = (spec: Spec, ctx: FilterCtx) =>
  !ctx.named.authority && !hasLocality(spec) && !kindOf(spec) && !has(spec.filters.county);
/** A named firm or person is the scope: the default buyer and "din toată țara" would read as a national answer. */
const namedSeller = (ctx: FilterCtx) => ctx.named.supplier || ctx.named.admin;

type FromWhom = "supplier" | "admin" | "employees";
/**
 * "de la [PORR]" / "câștigate de [PORR]", "de la [firmele conduse azi de …]",
 * "de la [firme cu 1–9 angajați]": the tabs of "De la cine?" are exclusive
 * (kit §5.24), so one phrase says the firm, else the person, else the size.
 * `offered` are the tabs of this question, in that order.
 */
function fromWhom(out: Tokens, spec: Spec, ctx: FilterCtx, offered: readonly FromWhom[], verb: string, opts: { seat?: boolean } = {}): void {
  // On institutions and counties „Ce fel de firme” also holds the firms' seat (S4r-from-seat): "de la [firme cu sediul în alt județ]".
  const seat = Boolean(opts.seat) && offered.includes("employees");
  const seated = seat && has(spec.filters.firmSeat);
  // F5: there too the firms' own years, in the archive or the register: "de la [firme înmatriculate din 2024]".
  const aged = seat && has(spec.filters.newSince) && (spec.filters.newScope === "archive" || spec.filters.newScope === "registry");
  const id = offered.find((tab) => tab === "supplier" ? ctx.named.supplier : tab === "admin" ? ctx.named.admin : hasEmployees(spec) || seated || aged);
  if (!id) return;
  const value = id === "supplier" ? entityLabel(spec, "supplier")
    : id === "admin" ? adminPhrase(spec.filters.adminName)
      : firmsKindPhrase(spec.filters, seat)!;
  const says: FilterId[] = id !== "employees" ? [id]
    : [...(hasEmployees(spec) ? ["employees" as const] : []), ...(seated ? ["firmSeat" as const] : []), ...(aged ? ["newSince" as const] : [])];
  out.text(` ${verb} `).slot(id, "from", value, { writes: seat ? [...offered, "firmSeat", "newSince"] : offered, picker: "from", says });
}

/**
 * The ranked firms' own selection phrase (plan §9 F1): "conduse azi de [Ion Popescu]". Their size is the
 * group row CÂȘTIGĂTORII (F3, plan §4.2 P3a): the list narrows, the total stays the sentence's.
 */
function firmsPhrases(out: Tokens, spec: Spec, ctx: FilterCtx, one: boolean): void {
  if (ctx.named.admin) out.text(` ${adminLead(one)} `).slot("admin", "admin", spec.filters.adminName ? String(spec.filters.adminName) : "persoana aleasă", { glued: true });
}

/**
 * F3 (plan §3, kit §4): the questions whose sentence says the purchase kind ("de [lucrări]"): stat,
 * table, timeseries, map, breakdown, trend, "Cine conduce?" on value, the verification and the
 * comparison; elsewhere (a relation's centre, the profiles) a link's kind is a chip under the sentence.
 */
const KIND_FORMS: ReadonlySet<string> = new Set(["stat", "table", "timeseries", "map", "breakdown", "trend", "entity_card:value", "fact_check", "compare"]);
/** F3, kit item 8: the questions whose noun can be a procedure's ("[contractele din licitații deschise]"). */
const PROCEDURE_FORMS: ReadonlySet<string> = new Set(["stat", "table", "timeseries", "map", "entity_card:value"]);
export const offersKind = (spec: Spec): boolean => KIND_FORMS.has(formOf(spec));
export const offersProcedure = (spec: Spec): boolean => PROCEDURE_FORMS.has(formOf(spec));
/** The kind the sentence says, on a question that offers it. */
const kindSaid = (spec: Spec): PurchaseKind | undefined => {
  const kind = spec.filters.purchaseKind as PurchaseKind | undefined;
  return kind && PURCHASE_KIND_WORDS[kind] && offersKind(spec) ? kind : undefined;
};
/** "[lucrări]": the kind's phrase; its window is "Ce s-a cumpărat?", which also searches the domain. */
function kindPhrase(out: Tokens, kind: PurchaseKind): Tokens {
  return out.slot("purchaseKind", "cpvTerm", PURCHASE_KIND_WORDS[kind].noun, { writes: ["cpvTerm"] });
}

/**
 * What was bought: "de [lucrări] pentru [„asfaltare”]" (or "în domeniul […]"); a CPV code by its name
 * when the caller knows it, the reader's own words when the interpreter does. The kind and the domain
 * combine (kit §5.3): `kindLead` is the kind's lead ("de" after a noun, a space after "cumpără"), null
 * where the question does not say it; after a bare kind the domain says "pentru".
 */
function domain(out: Tokens, spec: Spec, labels: SentenceLabels, lead = " pentru ", kindLead: string | null = " de "): void {
  const kind = kindLead === null ? undefined : kindSaid(spec);
  if (kind) kindPhrase(out.text(kindLead!), kind);
  const term = spec.filters.cpvTerm;
  if (!has(term)) return;
  const isCode = /^(?:\d{2,8}|\d{8}-\d)$/.test(String(term).replace(/\s+/g, ""));
  const words = labels.subject ? `„${labels.subject}”` : isCode && labels.cpvName ? lowerFirst(labels.cpvName) : subjectWords(spec);
  if (words) out.text(kind && lead === " " ? " pentru " : lead).slot("cpvTerm", "cpvTerm", words, kindLead !== null && offersKind(spec) ? { writes: ["purchaseKind"] } : {});
}

/** "prin [achiziții directe]" where the sentence has no noun for the stream; nothing on all of them (kit §5.1). */
function channel(out: Tokens, spec: Spec): void {
  if (spec.dataset === "da" || spec.dataset === "contracts") out.text(" prin ").slot("dataset", "dataset", streamWords(spec.dataset).via);
}

/** ", în [toți anii]", ", în [2024–2025]", ", [din 2024 încoace]" (kit §4 Perioada). */
function period(out: Tokens, spec: Spec): void {
  const { lead, value } = periodPhrase(spec.filters);
  out.text(lead ? `, ${lead} ` : ", ").slot("period", "period", value, { says: hasPeriod(spec) ? ["period"] : [] });
}

/**
 * The noun of the stream after the verb, e.g. "câștigă [achizițiile]"; a procedure names its contracts
 * ("[contractele din licitații deschise]", stat final §1) where the question offers it (kit item 8).
 */
const noun = (out: Tokens, spec: Spec, form: "the" | "bare" | "of" | "every" | "via"): Tokens => {
  const offered = offersProcedure(spec);
  const procedure = offered && spec.dataset === "contracts" ? PROCEDURE_WORDS[spec.filters.procedure as Procedure] : undefined;
  return out.slot("dataset", "dataset", (procedure ?? streamWords(spec.dataset))[form], {
    says: [...(spec.dataset ? ["dataset" as const] : []), ...(procedure ? ["procedure" as const] : [])],
    ...(offered ? { writes: ["procedure"] } : {}),
  });
};

/** The ranked kind after "Ce" (nearticulated, kit §5.41) or the default. */
const kindBare = (spec: Spec) => { const kind = kindOf(spec); return kind ? KIND_WORDS[kind]!.bare : ALL_BUYERS_BARE; };
/** The subject of a ranking of institutions also states its kind. */
const subjectSays = (spec: Spec): FilterId[] => ["dim", ...(kindOf(spec) ? ["authorityKind" as const] : [])];

type Write = (out: Tokens, spec: Spec, ctx: FilterCtx, labels: SentenceLabels) => void;

/** §4.1 "Cât valorează [achizițiile] {pentru […]} {făcute de [cumpărător] din [loc]} {de la [firmă]}, în [perioadă]?" */
const stat: Write = (out, spec, ctx, labels) => {
  const s = streamWords(spec.dataset), count = spec.measure === "count";
  // A count keeps the form "Câte achiziții…", without a control of its own (final stat §1).
  if (count) noun(out.text("Câte "), spec, "bare");
  else noun(out.text("Cât valorează "), spec, "the");
  domain(out, spec, labels);
  if (!(defaultBuyer(spec, ctx) && namedSeller(ctx))) {
    out.text(count ? ` au fost ${s.made} ` : ` ${s.made} `);
    buyer(out, spec, ctx, { place: namedSeller(ctx) ? "set" : "always" });
  }
  fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], s.from);
  period(out, spec);
  out.text("?");
};

/**
 * §4.2 Firms: "Ce [firme] {conduse azi de [X]} câștigă [achizițiile] {pentru […]}
 * făcute de [instituțiile publice] din [toată țara], în [toți anii]?". Institutions: "Ce [spitale] din
 * [județul Cluj] cumpără cel mai mult {pentru […]} {de la [firme …]}, prin [toate achizițiile], în […]?".
 * Counties: "În ce [județe] cumpără cel mai mult [primăriile de comună] {…}, prin […], în […]?".
 * A ranking of firms names its buyer, a ranking of institutions its firm: the other stays a condition.
 */
const table: Write = (out, spec, ctx, labels) => {
  const dim = spec.dim ?? "supplier";
  if (dim === "supplier") {
    out.text("Ce ").slot("dim", "ranked", "firme", { writes: ["authorityKind"], picker: "subject" });
    seat(out, spec);
    firmsPhrases(out, spec, ctx, false);
    noun(out.text(" câștigă "), spec, "the");
    domain(out, spec, labels);
    out.text(` ${streamWords(spec.dataset).made} `);
    buyer(out, spec, ctx, { place: "always" });
  } else if (dim === "county") {
    out.text("În ce ").slot("dim", "ranked", "județe", { writes: ["authorityKind"], picker: "subject" });
    out.text(" cumpără cel mai mult ");
    // One institution would be one county: the buyers of a county ranking are kinds (plan §4.2).
    buyer(out, spec, ctx, { place: "never", locality: false, authority: false });
    domain(out, spec, labels, " pentru ", " ");
    fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], "de la", { seat: true });
    noun(out.text(", prin "), spec, "via");
  } else {
    out.text("Ce ").slot("dim", "ranked", kindBare(spec), { says: subjectSays(spec), writes: ["authorityKind"], picker: "subject" });
    if (ctx.locality.ok && hasLocality(spec)) out.text(" ale primăriei ").slot("locality", "place", localityName(String(spec.filters.uatName ?? `SIRUTA ${spec.filters.uatSiruta}`)), { writes: ["county"] });
    else place(out, spec, ctx);
    out.text(" cumpără cel mai mult");
    domain(out, spec, labels, " pentru ", " ");
    fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], "de la", { seat: true });
    noun(out.text(", prin "), spec, "via");
  }
  period(out, spec);
  out.text("?");
};

/**
 * §4.3 "Cum evoluează [valoarea] [tuturor achizițiilor] {pentru […]} {făcute de [cumpărător] din [loc]}
 * {de la [firmă | firmele conduse azi de …]}, [an de an]?"; with the count, "[numărul de înregistrări]
 * din [toate achizițiile]". The period carries its preposition ("Când?", R10).
 */
const timeseries: Write = (out, spec, ctx, labels) => {
  const s = streamWords(spec.dataset), count = spec.measure === "count";
  out.text("Cum evoluează ").slot("measure", "measure", count ? "numărul de înregistrări" : "valoarea", { says: [] });
  noun(out.text(count ? " din " : " "), spec, count ? "every" : "of");
  domain(out, spec, labels);
  if (!(defaultBuyer(spec, ctx) && namedSeller(ctx))) {
    out.text(` ${s.made} `);
    buyer(out, spec, ctx, { place: namedSeller(ctx) ? "set" : "always" });
  }
  fromWhom(out, spec, ctx, ["supplier", "admin"], s.from);
  // The pace and the period, one phrase (final §1, R10 „Când?”): "an de an, 2021–2026", "lună de lună, în 2025",
  // "lună de lună, 2025–2026" (F3: its window writes the grain with the period).
  const month = spec.timeseries?.grain === "month";
  const { value } = periodPhrase(spec.filters), oneYear = /^\d{4}$/.test(value);
  const words = month ? `lună de lună, ${oneYear ? `în ${value}` : value}` : hasPeriod(spec) ? `an de an, ${value}` : "an de an";
  out.text(", ").slot("period", "when", words, {
    says: [...(hasPeriod(spec) ? ["period" as const] : []), ...(month ? ["timeseriesGrain" as const] : [])], writes: ["timeseriesGrain"],
  });
  out.text("?");
};

/**
 * §4.4 "Cum se împart [achizițiile] {pentru […]} {făcute de [cumpărători]} {de la [firmă]} pe județe,
 * în [perioadă]?". The counties are the answer: no place, no single institution, no town hall.
 */
const map: Write = (out, spec, ctx, labels) => {
  const s = streamWords(spec.dataset);
  noun(out.text("Cum se împart "), spec, "the");
  domain(out, spec, labels);
  if (!(namedSeller(ctx) && !kindOf(spec))) {
    out.text(` ${s.made} `);
    buyer(out, spec, ctx, { place: "never", locality: false, authority: false });
  }
  fromWhom(out, spec, ctx, ["supplier", "admin"], s.from);
  out.text(" pe județe");
  period(out, spec);
  out.text("?");
};

/**
 * §4.5 "Ce cumpără [primăria Cluj-Napoca | spitalele] {din [județul Cluj]} {în domeniul […]} {de la
 * [firmă]} {prin [achiziții directe]}, în [2025]?". The buyer is the subject, also beside a firm
 * ("Ce cumpără [instituțiile publice] de la [X]?", kit §5.21).
 */
const breakdown: Write = (out, spec, ctx, labels) => {
  // The kind is what is bought, before the verb (final breakdown §1): "Ce [lucrări] cumpără …".
  const kind = kindSaid(spec);
  out.text("Ce ");
  if (kind) kindPhrase(out, kind).text(" ");
  out.text("cumpără ");
  buyer(out, spec, ctx, { place: ctx.named.supplier ? "set" : "always" });
  domain(out, spec, labels, " în domeniul ", null);
  fromWhom(out, spec, ctx, ["supplier"], "de la");
  channel(out, spec);
  period(out, spec);
  out.text("?");
};

/** The focal entity: one window with an institution/firm switch (it rewrites the dimension to the role). */
function focal(out: Tokens, spec: Spec, ctx: FilterCtx): Tokens {
  return out.slot(ctx.role, "focal", entityLabel(spec, ctx.role), { picker: "focal", writes: [ctx.role === "authority" ? "supplier" : "authority"] });
}

/**
 * §4.6 "Compară [A] cu [B] la [toate achizițiile] {pentru […]}, în [toți anii]." Between firms, who
 * bought is a condition on the clients: "…făcute de [spitalele] din [București]…".
 */
const compare: Write = (out, spec, ctx, labels) => {
  focal(out.text("Compară "), spec, ctx);
  out.text(" cu ").slot("compareWith", "compareWith", compareWithLabel(spec));
  noun(out.text(" la "), spec, "every");
  domain(out, spec, labels);
  if (ctx.role === "supplier" && (kindOf(spec) || has(spec.filters.county))) {
    out.text(` ${streamWords(spec.dataset).made} `);
    buyer(out, spec, ctx, { place: "set", locality: false, authority: false });
  }
  period(out, spec);
  out.text(".");
};

/** The kind of change after "cea mai mare" (trend final §1); "schimbare" is every change, as an old link without the key. */
const CHANGE_WORDS = TREND_CHANGE_PHRASE;
/** The new ones' and the gone ones' phrases: the buttons' words in the sentence („noi”, „nu mai apar”). */
const NEW_WORD = TREND_CHANGE_LABELS.new.toLocaleLowerCase("ro-RO"), GONE_WORDS = TREND_CHANGE_LABELS.gone.toLocaleLowerCase("ro-RO");
/** Across other years (trend final §1, defs/trend.ts trendGap): the new „fără înregistrări în [A]”, the gone „nu au înregistrări în [B]”. */
const NO_RECORDS = TREND_NO_RECORDS.toLocaleLowerCase("ro-RO");

/**
 * "Prima dată" on the new ones (trend final §3.8, kit §4): the first record of the entity anywhere in
 * the archive is in year B. A fixed phrase: the answer's strip sets it, the sentence only says it,
 * with the glossary's one (?) (firstTimeTip).
 */
function firstTime(out: Tokens, narrowed: boolean): void {
  out.text(" ").fixed(firstTimeWords(), ["trendFirstOnly"], firstTimeTip(narrowed));
}

/**
 * §4.7, by the kind of change (trend final §1; kit §4 „Noi” always with its year):
 * - "Ce [firme] au cea mai mare [creștere] {a achizițiilor {pentru […]} {făcute de [cumpărător] din [loc]}}
 *   {prin [achiziții directe]} între [2024] și [2025]?", also [scădere], and [schimbare] on every change
 *   and on an old link without the key (its words of today);
 * - "Ce [firme] [noi] apar {în achizițiile …} {prima dată} în [2025], față de [2024]?";
 * - "Ce [firme] din [2024] [nu mai apar] {în achizițiile …} în [2025]?".
 * On institutions the kind is the subject and the firm follows: "Ce [spitale] [noi] cumpără de la
 * [DR.MAX] în [2025], față de [2024]?", "Ce [spitale] din [2024] [nu mai cumpără] de la [DR.MAX] în
 * [2025]?". With their place ("din [județul Cluj]") the gone ones say "în [2025], față de [2024]": one
 * "din" for the place (R9). Across other years (2023 → 2025, trend final §1) only the year without
 * records is sure: "Ce [firme] [fără înregistrări] în [2023] apar în [2025]?", "Ce [firme] din [2023]
 * [nu au înregistrări] în [2025]?" ("nu cumpără" where they buy). The order and its base are the
 * presentation line's.
 */
const trend: Write = (out, spec, ctx, labels) => {
  const dim = spec.dim ?? "supplier", f = spec.filters, t = spec.trend ?? {}, change = t.change ?? "all";
  const changeSays: FilterId[] = t.change !== undefined ? ["trendChange"] : [];
  out.text("Ce ").slot("dim", "ranked", dim === "supplier" ? "firme" : dim === "county" ? "județe" : kindBare(spec), {
    says: dim === "authority" ? subjectSays(spec) : ["dim"], writes: ["authorityKind"], picker: "subject",
  });
  // Without years the engine compares the archive's first and last years (compile.ts trend: minY, maxY);
  // the title says the ones its answer compared (labels.trendYears). Across other years (trendGap) the
  // new ones' phrase follows the place, with year A.
  const yearWord = (year: unknown, ran: number | undefined, none: string) => has(year) ? String(year) : ran !== undefined ? String(ran) : none;
  const a = yearWord(f.yearFrom, labels.trendYears?.yearA, "primul an"), b = yearWord(f.yearTo, labels.trendYears?.yearB, "ultimul an");
  const gap = trendGap(a, b);
  if (change === "new" && !gap) out.text(" ").slot("trendChange", "change", NEW_WORD, { says: changeSays });
  const town = dim === "authority" && ctx.locality.ok && hasLocality(spec), placed = town || dim === "authority" && has(f.county);
  if (town) out.text(" ale primăriei ").slot("locality", "place", localityName(String(f.uatName ?? `SIRUTA ${f.uatSiruta}`)), { writes: ["county"] });
  else if (placed) place(out, spec, ctx);
  const buyerSet = dim === "supplier" ? ctx.named.authority || hasLocality(spec) || Boolean(kindOf(spec)) || has(f.county)
    : dim === "county" && Boolean(kindOf(spec));
  const seller = dim !== "supplier" && ctx.named.supplier;
  // Institutions buy: with a domain or a firm, "cumpără …" / "nu mai cumpără …" (kit §4 Plecați).
  const bought = has(f.cpvTerm) || Boolean(kindSaid(spec));
  const buys = dim === "authority" && (bought || seller);
  /** What the change is of: its noun ("a achizițiilor", "în achizițiile"; none after "cumpără"), the kind and domain, the buyer, the firm. */
  const fragments = (noun: string | null) => {
    if (!(bought || buyerSet || seller)) return;
    if (noun) out.text(noun);
    domain(out, spec, labels, " pentru ", noun ? " de " : " ");
    if (buyerSet) {
      out.text(" făcute de ");
      buyer(out, spec, ctx, dim === "supplier" ? { place: "set" } : { place: "never", locality: false, authority: false });
    }
    fromWhom(out, spec, ctx, dim === "supplier" ? [] : ["supplier"], "de la");
  };
  const periodSays: FilterId[] = hasPeriod(spec) ? ["period"] : [];
  const year = (lead: string, value: string) => out.text(lead).slot("period", "years", value, { says: periodSays });
  if (change === "new") {
    if (gap) { out.text(" ").slot("trendChange", "change", NO_RECORDS, { says: changeSays }); year(" în ", a); }
    out.text(buys ? " cumpără" : " apar");
    fragments(buys ? null : " în achizițiile");
    channel(out, spec);
    if (t.firstOnly) firstTime(out, bought || buyerSet || seller);
    year(" în ", b);
    if (!gap) year(", față de ", a);
  } else if (change === "gone") {
    if (!placed) year(" din ", a);
    out.text(" ").slot("trendChange", "change", gap ? buys ? "nu cumpără" : "nu au înregistrări" : buys ? "nu mai cumpără" : GONE_WORDS, { says: changeSays });
    fragments(buys ? null : " în achizițiile");
    channel(out, spec);
    year(" în ", b);
    if (placed) year(", față de ", a);
  } else {
    out.text(" au cea mai mare ").slot("trendChange", "change", CHANGE_WORDS[change], { says: changeSays });
    fragments(" a achizițiilor");
    channel(out, spec);
    year(" între ", a);
    year(" și ", b);
  }
  out.text("?");
};

/**
 * §4.8 (final network §1, kit §6 network 1): the group is the verb, "Cu cine [lucrează] [X] {pentru […]}
 * {prin [achiziții directe]}, în [toți anii]?"; a group of the whole relation takes its reference year
 * instead of a period: "Cu cine [a început să lucreze | a continuat să lucreze | nu mai lucrează] [X] …
 * din [2025]?" (the year the builder knows as the last complete one, until the reader picks another). The
 * partners' conditions are a row; the order and the length the presentation line.
 */
const network: Write = (out, spec, ctx, labels) => {
  const group = spec.network?.partners, since = spec.network?.since;
  out.text("Cu cine ").slot("networkPartners", "partners", NETWORK_VERBS[group ?? "all"], { says: group ? ["networkPartners"] : [] });
  focal(out.text(" "), spec, ctx);
  domain(out, spec, labels, " pentru ", null);
  channel(out, spec);
  if (group) out.text(" din ").slot("networkSince", "since", String(since ?? labels.networkSince ?? lastNetworkYear(ctx)), { says: since !== undefined ? ["networkSince"] : [] });
  else period(out, spec);
  out.text("?");
};

/**
 * §4.9 Institution: "Ce cumpără [X] {în domeniul […]} {prin […]} și de la cine, în [toți anii]?";
 * firm: "Cine cumpără ce {în domeniul […]} de la [X] {prin […]}, în […]?".
 */
const sankey: Write = (out, spec, ctx, labels) => {
  if (ctx.role === "authority") {
    focal(out.text("Ce cumpără "), spec, ctx);
    domain(out, spec, labels, " în domeniul ", null);
    channel(out, spec);
    out.text(" și de la cine");
  } else {
    out.text("Cine cumpără ce");
    domain(out, spec, labels, " în domeniul ", null);
    focal(out.text(" de la "), spec, ctx);
    channel(out, spec);
  }
  period(out, spec);
  out.text("?");
};

/**
 * §4.10 "A cumpărat [X] {[„pavaj”]} de la [Y] {prin [achiziții directe]} [până acum]?" The period
 * carries its preposition ("Când?", R10): "în toți anii" would mean "every year". The pair is the
 * question: each phrase searches one institution or one firm, with no "any" row to clear it (R1).
 */
const factCheck: Write = (out, spec, _ctx, labels) => {
  out.text("A cumpărat ").slot("authority", "buyer", entityLabel(spec, "authority"), { required: true });
  domain(out, spec, labels, " ", " ");
  out.text(" de la ").slot("supplier", "from", entityLabel(spec, "supplier"), { required: true });
  channel(out, spec);
  // The same words as the condition's ("în 2024", "din 2023 încoace"), "până acum" without one.
  out.text(" ").slot("period", "when", periodWordsWith(spec.filters, "până acum"), { says: hasPeriod(spec) ? ["period"] : [] });
  out.text("?");
};

/**
 * §4.11 "Unde se situează [X] după risc, față de [primăriile cu 52–207 mii de locuitori]?"
 * (final distribution §1.1): the group in words, from the ticks of "Față de cine?" (`peers` and the
 * county) and the entity's facts that bound them (labels.peerGroup: the window's or the answer's);
 * without them, the rules by name ("cu populație apropiată"). An old link's kind is said too. Kit §4:
 * "instituțiile publice", never "instituțiile" alone; on firms the county is the seat (R9).
 */
const distribution: Write = (out, spec, ctx, labels) => {
  const county = has(spec.filters.county) ? String(spec.filters.county) : null;
  const kind = ctx.role === "authority" ? kindOf(spec) : undefined;
  const peers = spec.peers && Object.keys(spec.peers).length ? spec.peers : null;
  const id = String(spec.filters[ctx.role === "authority" ? "authorityId" : "supplierId"] ?? "");
  const facts = labels.peerGroup && labels.peerGroup.role === ctx.role && labels.peerGroup.entityId === id ? labels.peerGroup : null;
  focal(out.text("Unde se situează "), spec, ctx);
  out.text(" după risc, față de ").slot("peers", "peers", peerGroupWords(spec, ctx.role, facts), {
    says: [...(peers ? ["peers" as const] : []), ...(county ? ["county" as const] : []), ...(kind ? ["authorityKind" as const] : [])],
    writes: ctx.role === "authority" ? ["county", "authorityKind"] : ["county"], picker: "peers",
  });
  out.text("?");
};

/**
 * §4.12 "Ce [instituții publice] din [toată țara] ies din tipar după risc și valoarea achizițiilor
 * directe?" ("Cine" / "Unde"); firms "Ce [firme] cu sediul [în județul Buzău]…". A county council has
 * one per county: "din toată țara" is fixed there (component 1b).
 */
const scatter: Write = (out, spec, ctx) => {
  const firms = spec.dim === "supplier", county = has(spec.filters.county);
  out.text("Ce ").slot("dim", "who", firms ? "firme" : kindBare(spec), { says: firms ? ["dim"] : subjectSays(spec), writes: ["authorityKind"], picker: "subject" });
  if (firms) {
    if (hasSeat(spec)) seat(out, spec);
    else out.text(" din ").slot("seatCounty", "seat", "toată țara", { says: [] });
  } else if (kindOf(spec) === "consiliu_judetean" && !county) out.text(" ").fixed("din toată țara", [], "Un consiliu pe județ.");
  else place(out, spec, ctx);
  out.text(" ies din tipar după risc și valoarea achizițiilor directe?");
};

/**
 * §4.13 "Care [firmă] {condusă azi de [X]} [câștigă cel mai mult] din [achizițiile] {pentru […]} făcute de
 * [instituțiile publice] din [toată țara], în [toți anii]?"; institutions "Care [spital] din [județul
 * Cluj] [cumpără cel mai mult] {de la [X]}, prin [toate achizițiile], în […]?"; on the risk score "Care
 * [firmă] {cu sediul [în județul Cluj]} [are cel mai ridicat risc]?". The axis is the verb.
 */
const entityCard: Write = (out, spec, ctx, labels) => {
  const firms = spec.dim === "supplier", risk = leaderAxis(spec) === "risk";
  const kind = kindOf(spec);
  out.text("Care ").slot("dim", "rivals", firms ? "firmă" : kind ? KIND_ONE[kind] ?? "instituție" : "instituție", {
    says: firms ? ["dim"] : subjectSays(spec), writes: ["authorityKind"], picker: "subject",
  });
  if (firms) {
    seat(out, spec);
    if (!risk) firmsPhrases(out, spec, ctx, true);
  } else if (!risk && ctx.locality.ok && hasLocality(spec)) out.text(" a primăriei ").slot("locality", "place", localityName(String(spec.filters.uatName ?? `SIRUTA ${spec.filters.uatSiruta}`)), { writes: ["county"] });
  // Institutions compete in a county only: a town hall would be the answer itself (final §3.3).
  else place(out, spec, ctx, false);
  out.text(" ").slot("rankBy", "axis", risk ? "are cel mai ridicat risc" : firms ? "câștigă cel mai mult" : "cumpără cel mai mult", {
    says: spec.rankBy ? ["rankBy"] : [],
  });
  if (risk) { out.text("?"); return; }
  if (firms) {
    noun(out.text(" din "), spec, "the");
    domain(out, spec, labels);
    out.text(` ${streamWords(spec.dataset).made} `);
    buyer(out, spec, ctx, { place: "always" });
  } else {
    domain(out, spec, labels, " pentru ", " ");
    fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], "de la");
    noun(out.text(", prin "), spec, "via");
  }
  period(out, spec);
  out.text("?");
};

const SENTENCES: Record<Block, Write> = {
  stat, table, timeseries, map, breakdown, compare, trend, network, sankey,
  fact_check: factCheck, distribution, scatter, entity_card: entityCard,
};

/** The default institutions, as each sentence names them: the buyer, the ranked ones, one of them. */
const EVERY_INSTITUTION: Readonly<Record<string, string>> = {
  [ALL_BUYERS]: " (toate, nu doar primăriile)", [ALL_BUYERS_BARE]: " (toate, nu doar primăriile)", instituție: " (oricare, nu doar primăriile)",
};

/** The reader asked about town halls (SentenceLabels.allInstitutions): the first default institutions say they are every one. */
function everyInstitution(list: SentenceToken[]): void {
  const at = list.findIndex((t) => t.kind === "slot" && t.says.every((id) => id !== "authorityKind" && id !== "authority" && id !== "locality")
    && EVERY_INSTITUTION[t.value] !== undefined);
  if (at < 0) return;
  const words = EVERY_INSTITUTION[(list[at] as SentenceSlot).value]!, next = list[at + 1];
  if (next?.kind === "text") next.text = words + next.text;
  else list.splice(at + 1, 0, { kind: "text", text: words });
}

/** The sentence of a question as tokens (P1). Unknown questions have none. */
export function sentenceTokens(input: QuestionSpec | AskSpec, ctx?: FilterCtx, labels: SentenceLabels = {}): SentenceToken[] {
  const spec = input as Spec;
  const write = SENTENCES[spec.block as Block];
  if (!write) return [];
  const out = new Tokens();
  write(out, spec, ctx ?? filterContext(spec), labels);
  if (labels.allInstitutions) everyInstitution(out.list);
  return out.list;
}

/**
 * P5, the presentation line, where it changes the query: "Arată [primele 10], după [valoarea
 * înregistrată]." on a ranking. On a trend the order is a phrase on the growths only (kit §6 trend 4,
 * TREND_RULES): "Arată [primele 10], după [diferența în lei | creșterea în procente]", the percent
 * with its base ", dintre firmele cu cel puțin [1 mil. lei] în 2024."; the other changes keep
 * "…, după diferența în lei." Elsewhere the measure is the sentence's ("Câte…", "Cum evoluează
 * [valoarea]") or the answer's lens (the map).
 */
export function presentationTokens(input: QuestionSpec | AskSpec): SentenceToken[] {
  const spec = input as Spec, out = new Tokens();
  const top = (n: number | undefined) => n === undefined ? "tot clasamentul" : n === 1 ? "primul" : `primele ${n}`;
  if (spec.block === "table") {
    out.text("Arată ").slot("topN", "topN", top(spec.topN), { says: spec.topN === undefined ? [] : ["topN"] });
    out.text(", după ").slot("measure", "order", MEASURE_WORDS[spec.measure] ?? MEASURE_WORDS.value!).text(".");
  } else if (spec.block === "network") {
    // Final network §1, §3.5: "Arată primii [15] parteneri, după [valoarea înregistrată]." (14 on an old link).
    const n = networkShow(spec), order = spec.network?.order ?? "value";
    out.text("Arată primii ").slot("networkShow", "show", String(n), { says: spec.network?.show === undefined ? [] : ["networkShow"] });
    out.text(" parteneri, după ").slot("networkOrder", "partnerOrder", NETWORK_ORDER_WORDS[order].phrase, { says: spec.network?.order === undefined ? [] : ["networkOrder"] }).text(".");
  } else if (spec.block === "trend") {
    const t = spec.trend ?? {};
    out.text("Arată ").slot("topN", "topN", top(spec.topN ?? 10), { says: spec.topN === undefined ? [] : ["topN"] });
    if (t.change !== "up") return out.text(", după diferența în lei.").list;
    const percent = t.order === "percent";
    out.text(", după ").slot("trendOrder", "order", TREND_ORDER_WORDS[percent ? "percent" : "lei"], { says: t.order ? ["trendOrder"] : [] });
    if (percent) {
      // A percent order without its base ranks from 1 mil. lei (TREND_RULES, DEFAULT_TREND_MIN_BASE).
      out.text(`, dintre ${trendBaseWho(spec.dim)} cu cel puțin `)
        .slot("trendMinBase", "minBase", formatRon(t.minBase ?? DEFAULT_TREND_MIN_BASE), { says: t.minBase !== undefined ? ["trendMinBase"] : [] });
      if (has(spec.filters.yearFrom)) out.text(` în ${spec.filters.yearFrom}`);
    }
    out.text(".");
  }
  return out.list;
}

/** The tokens read as text: the answer's title before its tail (R11, G7). */
export function sentenceText(tokens: readonly SentenceToken[]): string {
  return tokens.map((token) => token.kind === "slot" ? token.value : token.text).join("");
}

/** The filters whose values the sentence states; a condition outside it is said under it (P4). */
export function saidFilters(tokens: readonly SentenceToken[]): Set<FilterId> {
  return new Set(tokens.flatMap((token) => token.kind === "text" ? [] : token.says));
}

/** The sentence as BLOCK_FILTERS places it (types.ts Slot): each phrase's filter and what its window writes. */
export function sentenceSlots(tokens: readonly SentenceToken[]): Slot[] {
  return tokens.flatMap((token): Slot[] => token.kind !== "slot" ? [] : [{
    id: token.filter, ...(token.picker ? { picker: token.picker } : {}), ...(token.writes ? { writes: token.writes } : {}),
    ...(token.required ? { required: true as const } : {}),
  }]);
}
