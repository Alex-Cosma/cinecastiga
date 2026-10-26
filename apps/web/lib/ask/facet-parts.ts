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

export const FACET_PARTS = ["channel", "procedure", "domain", "size", "kind", "county", "seat", "employees", "years", "locate"] as const;
export type FacetPart = (typeof FACET_PARTS)[number];
/** The parts that count a window's options; `locate` finds an entity's place in an answer ("Unde e o firmă?"). */
export type CountPart = Exclude<FacetPart, "locate">;
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
    case "seat": return isHistoricalProfile(spec) ? ["county"] : ["seatCounty", "firmSeat"];
    case "employees": return ["minEmployees", "maxEmployees"];
    case "years": return ["yearFrom", "yearTo", "monthFrom", "monthTo"];
  }
}

/**
 * The draft a part counts on: without the part's own keys (a copy; the draft
 * is not changed). The channel counts every channel; the procedures count the
 * contracts. `locate` keeps the question: it finds a place in its answer.
 */
export function facetSpec<T extends { block: string; dataset?: string; dim?: string; rankBy?: string; filters: object }>(spec: T, part: FacetPart): T {
  if (part === "locate") return spec;
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
