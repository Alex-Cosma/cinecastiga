import { formatInt } from "../format";
import { COUNTIES } from "../counties";
import { formatShare } from "./answer-text";
import { isHistoricalProfile } from "./population";

/*
 * The counts of the builder's windows (plan §2.5 "Fațetele", kit R5), for the
 * client and the server alike: the parts POST /api/ask/facets answers, the
 * keys each part leaves out of the draft (a window counts its options without
 * its own key, so every option says what choosing it gives), and the words of
 * a count ("32,0% · 88"). Plain TypeScript, no SQL: lib/ask/facets.ts counts.
 */

export const FACET_PARTS = ["channel", "procedure", "domain", "size", "kind", "county", "seat", "employees", "years", "winners", "locate", "mix", "bars", "pair", "compare-peers", "network", "rows", "map"] as const;
export type FacetPart = (typeof FACET_PARTS)[number];
/**
 * The parts that count a window's options; `locate` finds an entity's place in an answer ("Unde e o firmă?"),
 * `mix` is the composition of a total („Din care”, stat) and `bars` the facts of an evolution's bars (F3);
 * `pair` the facts of a comparison's pair for its windows and `compare-peers` the suggestions of
 * "Cu cine comparăm?" (F4, lib/ask/compare-engine.ts); `network` the whole relation of a network whose
 * „Toți” on one channel or in a period was answered from the records it bounds (lib/ask/network-facts.ts).
 * F5: `winners` counts the ranked winners' chips (WINNERS_OPTIONS), `rows` reads the facts of the rows shown
 * (lib/ask/winners.ts rankedFacts). `map`: the county facts of a map (lib/ask/map-facts.ts): the seat split, the
 * largest buyer and record, „Cota firmei”.
 */
export type CountPart = Exclude<FacetPart, "locate" | "mix" | "bars" | "pair" | "compare-peers" | "network" | "rows" | "map">;
export const isFacetPart = (value: unknown): value is FacetPart => (FACET_PARTS as readonly unknown[]).includes(value);

/**
 * What `n` counts: the records of the selection (channel, procedure, domain,
 * size, county, years), the institutions or firms behind them (kind; seat,
 * employees), or the historical profiles of a profile question.
 */
export type FacetUnit = "records" | "institutions" | "firms" | "profiles";

/** One option: its value as the window writes it, its count, its value in lei and its share (of the value; of the profiles on a profile question). */
export interface FacetCount { value: string; n: number; value_ron: number; share: number }
/** What no option holds, so the window adds to 100% (R5): „Alte instituții”, „Sediu necunoscut”, „Fără bilanț”. */
export interface FacetRest extends Omit<FacetCount, "value"> { label: string }
export interface FacetCounts {
  part: CountPart;
  unit: FacetUnit;
  options: FacetCount[];
  rest: FacetRest | null;
  /** Every option and the rest: the window's first row („Toată țara”, „Oriunde”, „Toate achizițiile”). */
  total: { n: number; value_ron: number };
  /** The data checkpoint the counts were read at (null without a published refresh). */
  checkpoint: string | null;
  tookMs: number;
  /**
   * The seat window around an institution (the network, the flow): its county, as the grounding found it, so
   * the option says „În județul Buzău” (kit §6 network 5) where the draft has no county of its own (S4 review).
   */
  centreCounty?: string;
}

/** A window's counts as the builder holds them (use-facet.ts): loading, read, or none (not asked, past the limit, an error). */
export type FacetView = { status: "loading" } | { status: "ready"; counts: FacetCounts } | { status: "none" };

/** A name found in an answer's ranking: its place, or null when the ranking does not hold it. */
export interface LocateMatch { id: string; name: string; county: string | null; rank: number | null; value: number | null; n: number | null }
export interface LocateResult {
  part: "locate";
  /** Every entity the ranking holds („locul 37 din 413”). */
  total: number;
  measure: "value" | "count";
  matches: LocateMatch[];
  checkpoint: string | null;
  tookMs: number;
}

/**
 * „Din care” (plan §4.1, final stat §3.7): the composition of a total by the
 * kind of purchase, the procedure (a direct acquisition is one), the size of
 * the whole purchase and the offers of its contracts. Each tab's rows are
 * records and lei of the same selection, so they add up to the total; a tab
 * the screen hides (one row, a key already chosen) is still answered.
 */
export interface MixRow { value: string; n: number; value_ron: number; share: number }
export interface MixResult {
  part: "mix";
  /** The kinds (produse, servicii, lucrari; "none": records without a CPV code), by value. */
  kind: MixRow[];
  /** "da" (the direct acquisitions), then the procedures of PROCEDURE_ORDER, as SEAP declares them. */
  procedure: MixRow[];
  /** The ranges of VALUE_RANGES by index ("0"–"3"), on the value of the whole purchase. */
  size: MixRow[];
  /** The contracts' offers: "one", "several", "unknown" (shares of the contracts' value), and the share known. */
  offers: { known: number; rows: MixRow[] } | null;
  total: { n: number; value_ron: number };
  checkpoint: string | null;
  tookMs: number;
}
/** The offers tab is shown from this share of the contracts' value with a known number of offers (final stat §3.7, question 6). */
export const OFFERS_KNOWN_MIN = 0.2;

/** A contract above the 1 bn lei cap (final timeseries §3.10): never in a bar, listed apart. */
export interface AboveCapRow { natId: string; title: string | null; value: number }
/**
 * The facts of an evolution's bars (final timeseries §3.10), asked once its
 * answer is on screen: each bar's largest record and its channel (where the
 * rollup or an anchored selection gives it), and the contracts above the
 * analysis cap of each bar's period, counted and the largest listed.
 */
export interface BarsResult {
  part: "bars";
  /** By the bar's key ("2025", "2025-03"); null where the selection would be read live nationally (PRECOMPUTE.md). */
  max: Record<string, { value: number; src: "da" | "contracts" }> | null;
  /** By the bar's key; null where the selection cannot be said on the source contracts (a precise selection, a threshold…). */
  above: Record<string, { n: number; rows: AboveCapRow[] }> | null;
  checkpoint: string | null;
  tookMs: number;
}
/** A bar's sheet lists at most this many contracts above the cap. */
export const ABOVE_CAP_ROWS = 5;

/**
 * F5, the options of the part `winners` (WINNERS_OPTIONS): "buyer:2024", "archive:2025", "registry:2024" (the firms
 * of „Firme noi” from that year on), "main" („Principalul lor client public”), "dominant" („O firmă ia peste
 * jumătate”); each conditioned on the other chips the draft has set, its share of the whole selection's value.
 */
export const winnerOption = (scope: string, year: number): string => `${scope}:${year}`;

/** F5, the facts of the rows shown (part `rows`, lib/ask/winners.ts WinnerFacts), by entity id. */
export interface RowsResult {
  part: "rows";
  facts: Record<string, import("./winners").WinnerFacts>;
  checkpoint: string | null;
  tookMs: number;
}
/** At most this many rows a request asks the facts of (a page of 50). */
export const ROWS_MAX = 50;

/** At most this many names a search returns (plan §2.5: "cel mult 8 potriviri"). */
export const LOCATE_MATCHES = 8;
/** A search starts at two characters (plan §2.5), after the reader stops typing for 250 ms. */
export const LOCATE_MIN_CHARS = 2;
export const LOCATE_DEBOUNCE_MS = 250;

/** The bands of employees (kit §4 Angajați), the values of the builder's bands (Bands.tsx EMPLOYEE_BANDS, test-checked). */
export const EMPLOYEE_BAND_BOUNDS: readonly { value: string; min: number; max: number | null }[] = [
  { value: "0", min: 0, max: 0 },
  { value: "1-9", min: 1, max: 9 },
  { value: "10-49", min: 10, max: 49 },
  { value: "50-249", min: 50, max: 249 },
  { value: "250+", min: 250, max: null },
];

/** The rest row of each part that has one (kit §4). */
export const FACET_REST: Partial<Record<CountPart, string>> = {
  kind: "Alte instituții",
  county: "Județ necunoscut",
  seat: "Sediu necunoscut",
  employees: "Fără bilanț",
  domain: "Fără cod CPV",
  years: "Fără dată",
};
/**
 * The seat window of a ranking of firms (plan §4.2, F4) offers the seat
 * against the buyer's county of each record (firmSeat): its options are the
 * classes of the records, not the firms' counties; so do the network and the
 * flow around an institution (F4, their row FURNIZORII: the firms against
 * that institution's county). Elsewhere ("Cine conduce?" by value, the
 * profiles) the seat is the firm's own county (seatCounty).
 */
export const relativeSeat = (spec: { block: string; dim?: string | undefined }): boolean =>
  spec.block === "table" && spec.dim === "supplier" || (spec.block === "network" || spec.block === "sankey") && spec.dim === "authority";
/**
 * The rest of the seat against the buyer's county (a ranking of firms, the network and flow around an institution):
 * the records whose firm's seat or buyer's county is unknown, most often the buyer's (S4 review, local 2025: 7,522
 * firms with a known seat against 2,872 without one). Neither side is named: the record cannot be compared.
 */
export const SEAT_UNCOMPARED = "Nu se poate compara";
export const SEAT_UNCOMPARED_TIP = { title: SEAT_UNCOMPARED, text: "Nu știm sediul firmei sau județul instituției care a cumpărat." } as const;

/** The option of the seat window for a firm with a foreign seat (kit §4 Sediul firmei: „În străinătate”). */
export const ABROAD = "abroad";

/**
 * The questions on which the buyer is a selection the window "Cine a
 * cumpărat?" writes (an institution, a town hall, a kind), not the entity the
 * question is about (a network's, a flow's, a comparison's or a verification's).
 */
const BUYER_WINDOW_BLOCKS = new Set(["stat", "table", "timeseries", "map", "breakdown", "trend", "entity_card"]);

/**
 * The keys each part leaves out of the draft (R5: a window's numbers are
 * computed without its own key). The channel window writes the procedure too
 * (the group „O procedură anume”); the procedures count the contracts; the
 * buyer's window holds the kinds, an institution and a town hall; the place
 * window a county and a town hall; the seat's window the firm's seat (the
 * county of a firm profile).
 */
function ownKeys(spec: { block: string; dim?: string; rankBy?: string }, part: CountPart): readonly string[] {
  switch (part) {
    case "channel": return ["procedure"];
    case "procedure": return ["procedure"];
    case "domain": return ["purchaseKind"];
    case "size": return ["purchaseValueMin", "purchaseValueMax"];
    case "kind": return BUYER_WINDOW_BLOCKS.has(spec.block) ? ["authorityKind", "authorityId", "authorityName", "uatSiruta", "uatName"] : ["authorityKind"];
    case "county": return ["county", "uatSiruta", "uatName"];
    case "seat": return isHistoricalProfile(spec) ? ["county", "seatCounty"] : ["seatCounty", "firmSeat"];
    case "employees": return ["minEmployees", "maxEmployees"];
    case "years": return ["yearFrom", "yearTo", "monthFrom", "monthTo"];
    // F5: the ranked winners' chips count over the selection without any of them (the others' condition is applied
    // to each option on the server, so a number is the answer after that click); on firms the band is one of them.
    case "winners": return spec.dim === "supplier" ? ["newSince", "newScope", "mainClient", "minEmployees", "maxEmployees"] : ["dominantSupplier"];
  }
}

/**
 * The draft a part counts on: without the part's own keys (a copy; the draft
 * is not changed). The channel counts every channel; the procedures count the
 * contracts. `locate` keeps the question: it finds a place in its answer.
 */
export function facetSpec<T extends { block: string; dataset?: string; dim?: string; rankBy?: string; filters: object }>(spec: T, part: FacetPart): T {
  if (part === "locate" || part === "mix" || part === "bars" || part === "pair" || part === "compare-peers" || part === "network" || part === "rows" || part === "map") return spec;
  const filters = { ...spec.filters } as Record<string, unknown>;
  for (const key of ownKeys(spec, part)) delete filters[key];
  const out = { ...spec, filters } as T;
  if (part === "channel") delete out.dataset;
  if (part === "procedure") out.dataset = "contracts";
  return out;
}

/** The county of the list (the data writes them without diacritics, in any case), or null for anything else. */
const FOLDED_COUNTIES = new Map(COUNTIES.map((name) => [fold(name), name]));
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
}
export const countyOfFolded = (text: string | null | undefined): string | null => text ? FOLDED_COUNTIES.get(fold(text)) ?? null : null;

/** A count as the window shows it (kit R5): „32,0% · 88”. */
export function facetCountText(count: { n: number; share: number }): string {
  return `${formatShare(count.share)} · ${formatInt(count.n)}`;
}
/** The first row's count („Toată țara 15.729”): the whole draft. */
export const facetTotalText = (counts: Pick<FacetCounts, "total">): string => formatInt(counts.total.n);
/** While the counts load (kit, final table §5: „până atunci „…””); on a timeout or an error the options stay without numbers. */
export const FACET_PENDING = "…";
