import type { AskSpec } from "./spec";
import type { DrillRow } from "./compile";

/** An exact selection inside the applied answer, independent of display limits. */
export interface EvidenceScope {
  entityIds?: readonly string[];
  excludeEntityIds?: readonly string[];
  role?: "authority" | "supplier";
  county?: string;
  riskBucket?: { from: number; to: number };
  cpvPrefixes?: readonly string[];
  excludeCpvPrefixes?: readonly string[];
  years?: readonly number[];
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
  cri: number | null;
  flags: string[];
  applicable: number;
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
  const allowed = ["entityIds", "excludeEntityIds", "role", "county", "riskBucket", "cpvPrefixes", "excludeCpvPrefixes", "years"];
  if (Object.keys(o).some((k) => !allowed.includes(k))) return { error: "Filtru de surse necunoscut." };
  const scope: EvidenceScope = {};
  if (o["county"] !== undefined) {
    if (typeof o["county"] !== "string" || !o["county"].trim() || o["county"].length > 100) return { error: "Județ invalid în selecție." };
    scope.county = o["county"].trim();
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
  return scope;
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
