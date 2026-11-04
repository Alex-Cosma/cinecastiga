/*
 * Column filters for record tables (owner decision of 4 November 2026): a funnel in the header of each filterable
 * column, whose options are the values of the rows the other filters leave, as in a spreadsheet. Above the table only
 * the applied filters remain, each with its ✕.
 *
 * One vocabulary for every table. A table declares its columns (a TableColumns list); the codec reads and writes their
 * values in the address; the server turns them into SQL and counts each column's options; the browser draws the
 * funnels and the band from the same declaration. This file is shared by both sides and holds no logic.
 */

/**
 * What a column filters by, and so which window its funnel opens:
 *   dates    the years, or an interval of months
 *   options  a short fixed list (the record's type, its signals)
 *   pick     a searchable multi-select (a partner, a CPV code)
 *   range    a numeric interval (the value)
 */
export type FilterKind = "dates" | "options" | "pick" | "range";

/** The years chosen (any set), or an interval of months (YYYY-MM, either end open); never both. */
export interface DatesValue {
  kind: "dates";
  years: string[];
  from: string | null;
  to: string | null;
}

/** The values chosen: an options column's codes or a pick column's ids. */
export interface ListValue {
  kind: "options" | "pick";
  values: string[];
}

/** A numeric interval, either end open. */
export interface RangeValue {
  kind: "range";
  min: number | null;
  max: number | null;
}

export type FilterValue = DatesValue | ListValue | RangeValue;

/** The filters of one table, by column key; a column without a value (or with an empty one) does not filter. */
export type FilterState = Readonly<Record<string, FilterValue>>;

export interface ColumnDef {
  /** The column's key in the state, the facet request and the server's bindings. */
  key: string;
  kind: FilterKind;
  /** The header's text, which is also the funnel's accessible name: „Filtrează după {label}”. */
  label: string;
  /** The chip's lead word before the value: „furnizor ROTACO”, „anul 2021”. Empty for options that say it all. */
  chip: string;
  /** The address parameter. */
  param: string;
  /** Values the address may carry for an options or pick column; anything else is dropped. */
  valuePattern?: RegExp;
  /** An options column's fixed labels (others come from the server with the counts). */
  labels?: Readonly<Record<string, string>>;
  /** Whether a funnel shows each option's rows; off where every option is one row (a table of suppliers). */
  counts?: boolean;
  /** How a funnel orders its options: by their rows (the default), or newest first (years). */
  order?: "rows" | "newest";
  /** A range column's unit, after the numbers in a chip: „lei”. */
  unit?: string;
  /** Older parameters that meant this column: read when `param` is absent, always removed when writing. */
  legacy?: {
    params: readonly string[];
    read: (get: (key: string) => string | null) => FilterValue | null;
  };
}

export type TableColumns = readonly ColumnDef[];

/** One option of an options or pick column, with the rows it keeps under the other filters. */
export interface OptionCount {
  value: string;
  label: string;
  n: number;
}

/** What a funnel shows: the column's values in the rows left by every other filter. */
export type Facet =
  | { kind: "options" | "pick"; options: OptionCount[]; more: boolean }
  | { kind: "dates"; months: { month: string; n: number }[]; undated: number }
  | { kind: "range"; min: number | null; max: number | null; bins: { from: number; to: number; n: number }[] };
