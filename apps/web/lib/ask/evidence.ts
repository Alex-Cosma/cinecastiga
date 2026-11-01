import type { AskSpec } from "./spec";
import { SCATTER_FLAGS } from "./spec";
import type { DrillRow } from "./compile";
import type { ScatterFlag } from "./scatter-shared";
import type { ScoreParts } from "../risk-score";

/** An exact selection inside the applied answer, independent of display limits. */
export interface EvidenceScope {
  entityIds?: readonly string[];
  excludeEntityIds?: readonly string[];
  role?: "authority" | "supplier";
  county?: string;
  /** Several buyer counties at once: a group of a county trend (at most 42, plan §2.5). */
  counties?: readonly string[];
  /**
   * distribution-1 (an old link's bar): a tenth of the index, 0–1. Since rf-2026.18 it selects the band of the score
   * with the same percents (riskBucketScore: 0.2–0.3 → 20–29%, 0.9–1 → 90–100%), on the population it always had.
   */
  riskBucket?: { from: number; to: number };
  /** distribution-2 (an old link's bar): the group's profiles that meet exactly this many criteria (0–5). */
  criteria?: number;
  /** distribution-3: the group's profiles whose displayed risk score is in this band, both bounds inclusive (a bar of the chart, 0–100). */
  score?: { from: number; to: number };
  /**
   * scatter-2 (F6b): the records behind one signal of the risk cloud's profiles, not their whole history: the profiles
   * that have it, and of each the acquisitions it flags (lib/ask/scatter-records.ts). The cloud's chosen signal is the default.
   */
  flag?: ScatterFlag;
  cpvPrefixes?: readonly string[];
  excludeCpvPrefixes?: readonly string[];
  years?: readonly number[];
  /** fact_check-2: the contracts won in association (more than one winner), whose rows carry the firm's share. */
  consortium?: true;
  /** fact_check-2: the open or restricted tenders with one known offer (TED), as the answer's line "Concurență" counts them. */
  singleBid?: true;
}

export interface EvidenceFilters { search?: string; state?: string; stream?: "da" | "contracts" }
/** Portable drawer filters; a bad saved filter must never broaden the capture. */
export function validateEvidenceFilters(raw: unknown): EvidenceFilters | { error: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "Filtre de surse invalide." };
  const value = raw as Record<string, unknown>, filters: EvidenceFilters = {};
  if (Object.keys(value).some(key => !["search", "state", "stream"].includes(key))) return { error: "Filtru de surse necunoscut." };
  for (const key of ["search", "state"] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string" || value[key].length > (key === "search" ? 200 : 100)) return { error: "Filtru de surse invalid." };
    if (value[key].trim()) filters[key] = value[key].trim();
  }
  if (value.stream !== undefined && value.stream !== "") {
    if (value.stream !== "da" && value.stream !== "contracts") return { error: "Canal de surse invalid." };
    filters.stream = value.stream;
  }
  return filters;
}

export const PROFILE_BLOCKS: readonly AskSpec["block"][] = [
  "compare", "distribution", "scatter", "entity_card",
];
export const EVIDENCE_CSV_LIMIT = 100_000;

export interface EvidenceStatus { state: string | null; count: number; value: string }
export interface EvidenceProfile {
  entityId: string;
  name: string;
  role: "authority" | "supplier";
  count: number;
  value: string;
  /** The risk score 0–100 and the strength of each criterion met (rf-2026.18, entity_flags.score / score_parts). */
  score: number;
  parts: ScoreParts;
  flags: string[];
}

/** PostgreSQL numeric values retain all digits (including consortium fractions). */
export function sumDecimalStrings(values: readonly string[]): string {
  const scale = values.reduce((n, value) => Math.max(n, value.split(".")[1]?.length ?? 0), 2);
  const sum = values.reduce((n, value) => {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = value.replace(/^[+-]/, "").split(".");
    const integer = BigInt(whole + fraction.padEnd(scale, "0"));
    return n + (negative ? -integer : integer);
  }, 0n);
  const digits = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, "0");
  return `${sum < 0n ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function formatEvidenceAmount(value: string, exact = false): string {
  const negative = value.startsWith("-");
  const [whole = "0", rawFraction = ""] = value.replace(/^[+-]/, "").split(".");
  if (exact) return `${negative ? "-" : ""}${BigInt(whole).toLocaleString("ro-RO")},${rawFraction.replace(/0+$/, "").padEnd(2, "0")} lei`;
  // Display cents without ever passing a large monetary amount through Number.
  const pennies = BigInt(whole + rawFraction.padEnd(2, "0").slice(0, 2)) + ((rawFraction[2] ?? "0") >= "5" ? 1n : 0n);
  return `${negative && pennies !== 0n ? "-" : ""}${(pennies / 100n).toLocaleString("ro-RO")},${(pennies % 100n).toString().padStart(2, "0")} lei`;
}

/** Reject unknown selections rather than silently broadening source evidence. */
export function validateEvidenceScope(raw: unknown): EvidenceScope | { error: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "Selecție de surse invalidă." };
  const o = raw as Record<string, unknown>;
  const allowed = ["entityIds", "excludeEntityIds", "role", "county", "counties", "riskBucket", "criteria", "score", "flag", "cpvPrefixes", "excludeCpvPrefixes", "years", "consortium", "singleBid"];
  if (Object.keys(o).some((k) => !allowed.includes(k))) return { error: "Filtru de surse necunoscut." };
  const scope: EvidenceScope = {};
  if (o["county"] !== undefined) {
    if (typeof o["county"] !== "string" || !o["county"].trim() || o["county"].length > 100) return { error: "Județ invalid în selecție." };
    scope.county = o["county"].trim();
  }
  if (o["counties"] !== undefined) {
    const value = o["counties"];
    if (!Array.isArray(value) || value.length === 0 || value.length > 42 || value.some((c) => typeof c !== "string" || !c.trim() || c.length > 100))
      return { error: "Județe invalide în selecție." };
    scope.counties = [...new Set((value as string[]).map((c) => c.trim()))];
  }
  for (const key of ["entityIds", "excludeEntityIds"] as const) {
    const value = o[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > 500 || value.some((id) => typeof id !== "string" || !/^[1-9]\d{0,17}$/.test(id)))
      return { error: "Identificator de entitate invalid în selecție." };
    scope[key] = [...new Set(value as string[])];
  }
  if (o["role"] !== undefined) {
    if (o["role"] !== "authority" && o["role"] !== "supplier") return { error: "Rol invalid în selecție." };
    scope.role = o["role"];
  }
  if ((scope.entityIds || scope.excludeEntityIds) && !scope.role) return { error: "Selecția entităților necesită un rol." };
  for (const key of ["cpvPrefixes", "excludeCpvPrefixes"] as const) {
    const value = o[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > 100 || value.some((prefix) => typeof prefix !== "string" || !/^\d{2,8}$/.test(prefix)))
      return { error: "Cod CPV invalid în selecție." };
    scope[key] = [...new Set(value as string[])];
  }
  if (o["years"] !== undefined) {
    const value = o["years"];
    if (!Array.isArray(value) || value.length > 101 || value.some((year) => !Number.isInteger(year) || year < 2000 || year > 2100))
      return { error: "Ani invalizi în selecție." };
    scope.years = [...new Set(value as number[])];
  }
  if (o["riskBucket"] !== undefined) {
    const b = o["riskBucket"] as Record<string, unknown> | null;
    if (!b || typeof b !== "object" || typeof b["from"] !== "number" || typeof b["to"] !== "number" ||
      !Number.isFinite(b["from"]) || !Number.isFinite(b["to"]) || b["from"] < 0 || b["to"] > 1 || b["from"] >= b["to"] ||
      Math.abs((b["to"] - b["from"]) - 0.1) > 1e-8 || Math.abs(b["from"] * 10 - Math.round(b["from"] * 10)) > 1e-8)
      return { error: "Interval de risc invalid." };
    scope.riskBucket = { from: b["from"], to: b["to"] };
  }
  if (o["criteria"] !== undefined) {
    const k = o["criteria"];
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k > 5) return { error: "Număr de criterii invalid." };
    scope.criteria = k;
  }
  if (o["score"] !== undefined) {
    const b = o["score"] as Record<string, unknown> | null;
    const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;
    if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some((key) => key !== "from" && key !== "to")
      || !whole(b["from"]) || !whole(b["to"]) || b["from"] > b["to"])
      return { error: "Interval de scor invalid." };
    scope.score = { from: b["from"], to: b["to"] };
  }
  if (o["flag"] !== undefined) {
    if (typeof o["flag"] !== "string" || !(SCATTER_FLAGS as readonly string[]).includes(o["flag"])) return { error: "Semnal invalid în selecție." };
    scope.flag = o["flag"] as ScatterFlag;
  }
  for (const key of ["consortium", "singleBid"] as const) {
    if (o[key] === undefined) continue;
    if (o[key] !== true) return { error: "Selecție de surse invalidă." };
    scope[key] = true;
  }
  return scope;
}

/**
 * The band of the risk score an old link's tenth of the index selects (distribution-1, riskBucket): the same percents,
 * both bounds inclusive on the displayed score; the last tenth keeps 100 (the index's 1 was in it).
 */
export function riskBucketScore(bucket: { from: number; to: number }): { from: number; to: number } {
  const from = Math.round(bucket.from * 10) * 10;
  return { from, to: bucket.to >= 1 ? 100 : Math.round(bucket.to * 10) * 10 - 1 };
}

/** Source links identify imported primary records, never an invented search result. */
export function evidenceLinks(row: Pick<DrillRow, "src" | "refId" | "caNoticeId" | "tedPubnum">) {
  const id = row.src === "da" ? row.refId : row.caNoticeId;
  return {
    seap: id && /^\d+$/.test(id)
      ? `https://e-licitatie.ro/pub/${row.src === "da" ? "direct-acquisition/view" : "notices/ca-notices/view-c"}/${id}`
      : null,
    ted: row.tedPubnum && /^[\d-]+$/.test(row.tedPubnum)
      ? `https://ted.europa.eu/en/notice/-/detail/${row.tedPubnum}` : null,
  };
}

/** Text cells are protected against spreadsheet formula execution. Numeric columns stay numeric. */
export function evidenceCsvText(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function evidenceCsv(rows: DrillRow[]): string {
  const header = "cod,data,autoritate,id_autoritate,judet,furnizor,id_furnizor,cod_cpv,domeniu_cpv,valoare_ron,stare,sursa,id_sursa,numar_castigatori,valoare_contract_integral,link_seap,link_ted";
  const lines = rows.map((r) => {
    const links = evidenceLinks(r);
    return [
      evidenceCsvText(r.daCode), evidenceCsvText(r.date), evidenceCsvText(r.authority), evidenceCsvText(r.authorityId),
      evidenceCsvText(r.county), evidenceCsvText(r.supplier), evidenceCsvText(r.supplierId), evidenceCsvText(r.cpvCode),
      evidenceCsvText(r.cpvName), r.valueExact, evidenceCsvText(r.state), r.src === "da" ? "achizitie_directa" : "contract",
      evidenceCsvText(r.refId), r.nWinners ?? "", r.contractValueFull ?? "", evidenceCsvText(links.seap), evidenceCsvText(links.ted),
    ].join(",");
  });
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}
