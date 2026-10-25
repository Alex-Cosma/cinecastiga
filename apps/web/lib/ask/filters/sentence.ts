import { countyIsFirmSeat } from "../population";
import {
  KIND_ONE, KIND_OPTIONS, KIND_WORDS, compareWithLabel, countyWords, entityLabel, leaderAxis, subjectWords, type QuestionSpec,
} from "../question-ui";
import type { AskSpec, AuthorityKind, Block } from "../spec";
import { filterContext } from "./context";
import type { FilterCtx, FilterId, FilterSpec, Picker, Slot } from "./types";
import {
  adminLead, adminPhrase, employeesOnBands, employeesPhrase, employeesWords, localityName, periodPhrase, periodWordsWith, streamWords,
} from "./words";

/*
 * The sentence of each question (plan §2.2 sentence.ts, §2.3, §4.1–§4.13;
 * kit §3 components 1 and 1b, §4): what is counted, as tokens: text, an
 * editable phrase (a slot, which opens its filter's window) or a fixed phrase
 * (text that cannot change here). The builder draws them (builder/Sentence.tsx)
 * and the answer's title reads them as text (sentenceText, R11). Today's keys
 * only (F1b): a key read ahead has no phrase until its stage.
 *
 * - The subject is the first phrase of a ranking ("Ce [firme]", "În ce
 *   [județe]"), of the trend, the risk cloud ("Ce [instituții publice] din
 *   [toată țara]") and "Cine conduce?" ("Care [firmă]"), whose axis is the verb.
 * - "din [loc]" is always the buyer's place (R9); on firm profiles the county
 *   is the firm's seat, "cu sediul [în județul Cluj]".
 * - The employees and the administrator are selection phrases (plan §9 F1):
 *   glued to the ranked firms ("Ce [firme] cu [1–9 angajați] câștigă…"), else
 *   "de la [firme cu 1–9 angajați]". No group row says a key the engine still
 *   applies on the records. A range off the kit's bands (0 · 1–9 · 10–49 ·
 *   50–249 · 250+) is an old link's: its window cannot show it, so it stays
 *   under the sentence (kit §5.5).
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

/** What the caller knows besides the spec: the name of a CPV code ("Lucrări de construcții"). */
export interface SentenceLabels { cpvName?: string | null | undefined }

/**
 * Kinds the profiles' subject says only after D1 (plan §9 F1, §4.12, §4.13):
 * by name, "primării de oraș și municipiu" holds 19% communes and "spital"
 * misses the clinical institutes, so the window does not offer them yet. A
 * link that carries one keeps it as a condition under the sentence.
 */
export const KINDS_AFTER_D1: Partial<Record<Block, readonly AuthorityKind[]>> = {
  scatter: ["oras_municipiu"],
  entity_card: ["oras_municipiu", "spital"],
};

/** Each phrase's spoken name and window title (R10; kit §4, §5.46). */
const NAMES = {
  dataset: ["Achizițiile", "Ce fel de achiziții?"],
  cpvTerm: ["Ce s-a cumpărat", "Ce s-a cumpărat?"],
  buyer: ["Cine a cumpărat", "Cine a cumpărat?"],
  place: ["Unde", "Unde?"],
  seat: ["Sediul firmei", "Unde au sediul firmele?"],
  from: ["De la cine", "De la cine?"],
  period: ["Perioada", "În ce perioadă?"],
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
  return KINDS_AFTER_D1[spec.block as Block]?.includes(kind as AuthorityKind) ? undefined : kind;
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

/** On firm profiles the county is the firm's own seat (countyIsFirmSeat): "cu sediul [în județul Cluj]" (kit §4, R9). */
function seat(out: Tokens, spec: Spec): void {
  out.text(" cu sediul ").slot("county", "seat", countyWords(String(spec.filters.county)).replace(/^din /, "în "), { glued: true });
}

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
function fromWhom(out: Tokens, spec: Spec, ctx: FilterCtx, offered: readonly FromWhom[], verb: string): void {
  const id = offered.find((tab) => tab === "supplier" ? ctx.named.supplier : tab === "admin" ? ctx.named.admin : hasEmployees(spec));
  if (!id) return;
  const value = id === "supplier" ? entityLabel(spec, "supplier")
    : id === "admin" ? adminPhrase(spec.filters.adminName)
      : employeesPhrase(spec.filters.minEmployees, spec.filters.maxEmployees)!;
  out.text(` ${verb} `).slot(id, "from", value, { writes: offered, picker: "from" });
}

/** The ranked firms' own selection phrases (plan §9 F1): "cu [1–9 angajați]", "conduse azi de [Ion Popescu]". */
function firmsPhrases(out: Tokens, spec: Spec, ctx: FilterCtx, one: boolean): void {
  if (hasEmployees(spec)) out.text(" ").slot("employees", "employees", employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees)!, { glued: true });
  if (ctx.named.admin) out.text(` ${adminLead(one)} `).slot("admin", "admin", spec.filters.adminName ? String(spec.filters.adminName) : "persoana aleasă", { glued: true });
}

/** What was bought: "pentru [„asfaltare”]" (or "în domeniul […]"); a CPV code by its name when the caller knows it. */
function domain(out: Tokens, spec: Spec, labels: SentenceLabels, lead = " pentru "): void {
  const term = spec.filters.cpvTerm;
  if (!has(term)) return;
  const isCode = /^(?:\d{2,8}|\d{8}-\d)$/.test(String(term).replace(/\s+/g, ""));
  const words = isCode && labels.cpvName ? lowerFirst(labels.cpvName) : subjectWords(spec);
  if (words) out.text(lead).slot("cpvTerm", "cpvTerm", words);
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

/** The noun of the stream after the verb, e.g. "câștigă [achizițiile]". */
const noun = (out: Tokens, spec: Spec, form: "the" | "bare" | "of" | "every" | "via"): Tokens =>
  out.slot("dataset", "dataset", streamWords(spec.dataset)[form], { says: spec.dataset ? ["dataset"] : [] });

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
 * §4.2 Firms: "Ce [firme] {cu [1–9 angajați]} {conduse azi de [X]} câștigă [achizițiile] {pentru […]}
 * făcute de [instituțiile publice] din [toată țara], în [toți anii]?". Institutions: "Ce [spitale] din
 * [județul Cluj] cumpără cel mai mult {pentru […]} {de la [firme …]}, prin [toate achizițiile], în […]?".
 * Counties: "În ce [județe] cumpără cel mai mult [primăriile de comună] {…}, prin […], în […]?".
 * A ranking of firms names its buyer, a ranking of institutions its firm: the other stays a condition.
 */
const table: Write = (out, spec, ctx, labels) => {
  const dim = spec.dim ?? "supplier";
  if (dim === "supplier") {
    out.text("Ce ").slot("dim", "ranked", "firme", { writes: ["authorityKind"], picker: "subject" });
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
    domain(out, spec, labels);
    fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], "de la");
    noun(out.text(", prin "), spec, "via");
  } else {
    out.text("Ce ").slot("dim", "ranked", kindBare(spec), { says: subjectSays(spec), writes: ["authorityKind"], picker: "subject" });
    if (ctx.locality.ok && hasLocality(spec)) out.text(" ale primăriei ").slot("locality", "place", localityName(String(spec.filters.uatName ?? `SIRUTA ${spec.filters.uatSiruta}`)), { writes: ["county"] });
    else place(out, spec, ctx);
    out.text(" cumpără cel mai mult");
    domain(out, spec, labels);
    fromWhom(out, spec, ctx, ["supplier", "admin", "employees"], "de la");
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
  out.text(", ").slot("period", "when", hasPeriod(spec) ? `an de an, ${periodPhrase(spec.filters).value}` : "an de an", { says: hasPeriod(spec) ? ["period"] : [] });
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
  out.text("Ce cumpără ");
  buyer(out, spec, ctx, { place: ctx.named.supplier ? "set" : "always" });
  domain(out, spec, labels, " în domeniul ");
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

/**
 * §4.7 "Ce [firme] au cea mai mare schimbare {a achizițiilor {pentru […]} {făcute de [cumpărător] din
 * [loc]}} {prin [achiziții directe]} între [2024] și [2025]?"; on institutions the kind is the subject and
 * the firm follows ("Ce [spitale] … a achizițiilor de la [DR.MAX]"). The kind of change is F2's phrase.
 */
const trend: Write = (out, spec, ctx, labels) => {
  const dim = spec.dim ?? "supplier", f = spec.filters;
  out.text("Ce ").slot("dim", "ranked", dim === "supplier" ? "firme" : dim === "county" ? "județe" : kindBare(spec), {
    says: dim === "authority" ? subjectSays(spec) : ["dim"], writes: ["authorityKind"], picker: "subject",
  });
  if (dim === "authority") {
    if (ctx.locality.ok && hasLocality(spec)) out.text(" ale primăriei ").slot("locality", "place", localityName(String(f.uatName ?? `SIRUTA ${f.uatSiruta}`)), { writes: ["county"] });
    else if (has(f.county)) place(out, spec, ctx);
  }
  out.text(" au cea mai mare schimbare");
  const buyerSet = dim === "supplier" ? ctx.named.authority || hasLocality(spec) || Boolean(kindOf(spec)) || has(f.county)
    : dim === "county" && Boolean(kindOf(spec));
  const seller = dim !== "supplier" && ctx.named.supplier;
  if (has(f.cpvTerm) || buyerSet || seller) {
    out.text(" a achizițiilor");
    domain(out, spec, labels);
    if (buyerSet) {
      out.text(" făcute de ");
      buyer(out, spec, ctx, dim === "supplier" ? { place: "set" } : { place: "never", locality: false, authority: false });
    }
    fromWhom(out, spec, ctx, dim === "supplier" ? [] : ["supplier"], "de la");
  }
  channel(out, spec);
  // Without years the engine compares the archive's first and last years (compile.ts trend: minY, maxY).
  out.text(" între ").slot("period", "period", f.yearFrom ? String(f.yearFrom) : "primul an", { says: hasPeriod(spec) ? ["period"] : [] });
  out.text(" și ").slot("period", "period", f.yearTo ? String(f.yearTo) : "ultimul an", { says: hasPeriod(spec) ? ["period"] : [] });
  out.text("?");
};

/** §4.8 "Cu cine lucrează [X] {pentru […]} {prin [achiziții directe]}, în [toți anii]?" The partners' conditions are a row. */
const network: Write = (out, spec, ctx, labels) => {
  focal(out.text("Cu cine lucrează "), spec, ctx);
  domain(out, spec, labels);
  channel(out, spec);
  period(out, spec);
  out.text("?");
};

/**
 * §4.9 Institution: "Ce cumpără [X] {în domeniul […]} {prin […]} și de la cine, în [toți anii]?";
 * firm: "Cine cumpără ce {în domeniul […]} de la [X] {prin […]}, în […]?".
 */
const sankey: Write = (out, spec, ctx, labels) => {
  if (ctx.role === "authority") {
    focal(out.text("Ce cumpără "), spec, ctx);
    domain(out, spec, labels, " în domeniul ");
    channel(out, spec);
    out.text(" și de la cine");
  } else {
    out.text("Cine cumpără ce");
    domain(out, spec, labels, " în domeniul ");
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
  domain(out, spec, labels, " ");
  out.text(" de la ").slot("supplier", "from", entityLabel(spec, "supplier"), { required: true });
  channel(out, spec);
  // The same words as the condition's ("în 2024", "din 2023 încoace"), "până acum" without one.
  out.text(" ").slot("period", "when", periodWordsWith(spec.filters, "până acum"), { says: hasPeriod(spec) ? ["period"] : [] });
  out.text("?");
};

/**
 * §4.11 "Unde se situează [X] după indicele de risc, față de [toate instituțiile publice]?" Today the
 * group is the role's profiles in a county and, for institutions, of a kind (F6a's peers come later).
 */
const distribution: Write = (out, spec, ctx) => {
  const county = has(spec.filters.county) ? String(spec.filters.county) : null;
  const kind = ctx.role === "authority" ? kindOf(spec) : undefined;
  const where = county ? ` ${countyIsFirmSeat(spec, ctx.role) ? `cu sediul ${countyWords(county).replace(/^din /, "în ")}` : countyWords(county)}` : "";
  // Kit §4: "instituțiile publice", never "instituțiile" alone (the final's "toate instituțiile din țară").
  const group = ctx.role === "supplier" ? `${county ? "firmele" : "toate firmele"}${where}`
    : kind ? `${KIND_WORDS[kind]!.the}${where}` : `${county ? "" : "toate "}${ALL_BUYERS}${where}`;
  focal(out.text("Unde se situează "), spec, ctx);
  out.text(" după indicele de risc, față de ").slot("county", "peers", group, {
    says: [...(county ? ["county" as const] : []), ...(kind ? ["authorityKind" as const] : [])],
    writes: ctx.role === "authority" ? ["authorityKind"] : [], picker: "peers",
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
    if (county) seat(out, spec);
    else out.text(" din ").slot("county", "seat", "toată țara", { says: [] });
  } else if (kindOf(spec) === "consiliu_judetean" && !county) out.text(" ").fixed("din toată țara", [], "Un consiliu pe județ.");
  else place(out, spec, ctx);
  out.text(" ies din tipar după risc și valoarea achizițiilor directe?");
};

/**
 * §4.13 "Care [firmă] {cu [1–9 angajați]} [câștigă cel mai mult] din [achizițiile] {pentru […]} făcute de
 * [instituțiile publice] din [toată țara], în [toți anii]?"; institutions "Care [spital] din [județul
 * Cluj] [cumpără cel mai mult] {de la [X]}, prin [toate achizițiile], în […]?"; on the index "Care
 * [firmă] {cu sediul [în județul Cluj]} [are cel mai ridicat indice de risc]?". The axis is the verb.
 */
const entityCard: Write = (out, spec, ctx, labels) => {
  const firms = spec.dim === "supplier", risk = leaderAxis(spec) === "risk";
  const kind = kindOf(spec);
  out.text("Care ").slot("dim", "rivals", firms ? "firmă" : kind ? KIND_ONE[kind] ?? "instituție" : "instituție", {
    says: firms ? ["dim"] : subjectSays(spec), writes: ["authorityKind"], picker: "subject",
  });
  if (firms) {
    if (risk) { if (has(spec.filters.county)) seat(out, spec); }
    else firmsPhrases(out, spec, ctx, true);
  } else if (!risk && ctx.locality.ok && hasLocality(spec)) out.text(" a primăriei ").slot("locality", "place", localityName(String(spec.filters.uatName ?? `SIRUTA ${spec.filters.uatSiruta}`)), { writes: ["county"] });
  // Institutions compete in a county only: a town hall would be the answer itself (final §3.3).
  else place(out, spec, ctx, false);
  out.text(" ").slot("rankBy", "axis", risk ? "are cel mai ridicat indice de risc" : firms ? "câștigă cel mai mult" : "cumpără cel mai mult", {
    says: spec.rankBy ? ["rankBy"] : [],
  });
  if (risk) { out.text("?"); return; }
  if (firms) {
    noun(out.text(" din "), spec, "the");
    domain(out, spec, labels);
    out.text(` ${streamWords(spec.dataset).made} `);
    buyer(out, spec, ctx, { place: "always" });
  } else {
    domain(out, spec, labels);
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

/** The sentence of a question as tokens (P1). Unknown questions have none. */
export function sentenceTokens(input: QuestionSpec | AskSpec, ctx?: FilterCtx, labels: SentenceLabels = {}): SentenceToken[] {
  const spec = input as Spec;
  const write = SENTENCES[spec.block as Block];
  if (!write) return [];
  const out = new Tokens();
  write(out, spec, ctx ?? filterContext(spec), labels);
  return out.list;
}

/**
 * P5, the presentation line, where it changes the query today: "Arată [primele 10], după [valoarea
 * înregistrată]." on a ranking, "Arată [primele 10], după diferența în lei." on a trend (the order is
 * F2's phrase). Elsewhere the measure is the sentence's ("Câte…", "Cum evoluează [valoarea]") or the
 * answer's lens (the map).
 */
export function presentationTokens(input: QuestionSpec | AskSpec): SentenceToken[] {
  const spec = input as Spec, out = new Tokens();
  const top = (n: number | undefined) => n === undefined ? "tot clasamentul" : n === 1 ? "primul" : `primele ${n}`;
  if (spec.block === "table") {
    out.text("Arată ").slot("topN", "topN", top(spec.topN), { says: spec.topN === undefined ? [] : ["topN"] });
    out.text(", după ").slot("measure", "order", MEASURE_WORDS[spec.measure] ?? MEASURE_WORDS.value!).text(".");
  } else if (spec.block === "trend") {
    out.text("Arată ").slot("topN", "topN", top(spec.topN ?? 10), { says: spec.topN === undefined ? [] : ["topN"] }).text(", după diferența în lei.");
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
