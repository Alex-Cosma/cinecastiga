import { createHash } from "node:crypto";
import type { CorpusEntry } from "./legacy-corpus";

/**
 * One corpus entry through the three routes a link reaches: /api/ask (the
 * answer), /api/ask/rows page 0 (the sources drawer) and /api/ask/rows/csv
 * (the export). The caller sends each request (`send`), so the test and the
 * local script choose the database; the record drops only timings, keeps
 * every word and number, and orders the arrays the database returns unordered.
 */

export type GoldenRoute = "ask" | "rows" | "csv";
export interface RouteReply { status: number; headers: Headers; text: string }
export type SendRoute = (route: GoldenRoute, body: Record<string, unknown>) => Promise<RouteReply>;

export interface GoldenRecord {
  id: string;
  origin: CorpusEntry["origin"];
  source: string;
  request: Pick<CorpusEntry, "spec" | "table" | "rows">;
  answer: Record<string, unknown>;
  sources: Record<string, unknown>;
  csv: Record<string, unknown>;
}

const CSV_HEADERS = ["x-total-rows", "x-exported-rows", "x-source-rows", "x-source-value", "x-filtered-value"] as const;
const byKey = <T>(key: (x: T) => string) => (x: T, y: T) => key(x).localeCompare(key(y));

/** stat.byStream comes from `group by src`, scatter from a union of two samples: neither order is shown. */
function canonicalData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const stat = data["stat"] as { byStream?: { src: string }[] } | undefined;
  stat?.byStream?.sort(byKey((s) => s.src));
  if (data["block"] === "scatter") {
    // scatter-2: the cloud's points by id, the cells of its grey layers by position (group by); the list is in the strip's order.
    const cloud = (data["scatter"] as { cloud?: { points?: { id: string }[]; bands?: { cells: number[][] }; flagged?: { cells: number[][] }; named?: { id: string }[] } } | undefined)?.cloud;
    const cells = (a: number[], b: number[]) => a[0]! - b[0]! || a[1]! - b[1]!;
    cloud?.points?.sort(byKey((p) => p.id.padStart(20, "0")));
    cloud?.bands?.cells.sort(cells);
    cloud?.flagged?.cells.sort(cells);
    // An answer stored before it: a union of two samples and an unordered density.
    (data["points"] as { entityId: string }[] | undefined)?.sort(byKey((p) => p.entityId.padStart(20, "0")));
    (data["density"] as { cells: number[][] } | undefined)?.cells.sort(cells);
  }
}

/** A source row in a fixed column order; the CSV hash covers every field of every row. */
const ROW_FIELDS = ["src", "refId", "daCode", "date", "authorityId", "supplierId", "county", "cpvCode", "valueExact", "state", "nWinners", "contractValueFull", "valueSuspect", "title"] as const;

export async function goldenRecord(entry: CorpusEntry, send: SendRoute, opts: { csvMaxTotal?: number } = {}): Promise<GoldenRecord> {
  const table = entry.table ? { tablePage: entry.table.page, tableSort: entry.table.sort, tableDir: entry.table.dir } : {};
  const { page = 0, ...drawer } = entry.rows ?? {};

  const asked = await send("ask", { spec: entry.spec, ...table });
  const { tookMs: _took, executedAt: _at, ...answer } = JSON.parse(asked.text) as Record<string, unknown>;
  canonicalData(answer["data"] as Record<string, unknown> | undefined);

  const listed = await send("rows", { spec: entry.spec, page, ...drawer });
  const { rows, statuses, ...sources } = JSON.parse(listed.text) as Record<string, unknown>;
  if (Array.isArray(statuses)) sources["statuses"] = [...statuses].sort(byKey((s: { state: string | null }) => s.state ?? ""));
  if (Array.isArray(rows)) sources["rows"] = rows.map((r: Record<string, unknown>) => ROW_FIELDS.map((f) => r[f] ?? null));

  let csv: Record<string, unknown>;
  const total = typeof sources["total"] === "number" ? sources["total"] : null;
  // On real data (csvMaxTotal set) a failed source list would only repeat its timeout in the export.
  if (opts.csvMaxTotal !== undefined && (total === null || total > opts.csvMaxTotal))
    csv = { skipped: total === null ? "the source list failed" : `${total} records > ${opts.csvMaxTotal}` };
  else {
    const exported = await send("csv", { spec: entry.spec, ...drawer });
    const isCsv = exported.headers.get("content-type")?.includes("text/csv");
    csv = isCsv
      ? {
          status: exported.status,
          file: exported.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? null,
          ...Object.fromEntries(CSV_HEADERS.map((h) => [h, exported.headers.get(h)])),
          lines: exported.text.split("\n").filter(Boolean).length,
          sha256: createHash("sha256").update(exported.text).digest("hex"),
        }
      : { status: exported.status, ...(JSON.parse(exported.text) as Record<string, unknown>) };
  }
  return {
    id: entry.id, origin: entry.origin, source: entry.source,
    request: { spec: entry.spec, ...(entry.table ? { table: entry.table } : {}), ...(entry.rows ? { rows: entry.rows } : {}) },
    answer: { status: asked.status, ...answer },
    sources: { status: listed.status, ...sources },
    csv,
  };
}

export const GOLDEN_FORMAT = "golden-legacy-1";

/** JSON with one key per line and short arrays of scalars (a source row, a density cell) on one line, so a diff names the field. */
export function goldenJson(value: unknown, indent = ""): string {
  const inner = indent + " ";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const scalars = value.every((v) => v === null || typeof v !== "object");
    const line = scalars ? JSON.stringify(value) : "";
    if (scalars && line.length <= 160) return line;
    return `[\n${value.map((v) => inner + goldenJson(v, inner)).join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${goldenJson(v, inner)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}
