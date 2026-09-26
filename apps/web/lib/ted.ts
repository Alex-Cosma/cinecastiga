import type { DbSql } from "@seap/db";

/**
 * Display metadata for the TED publication source. Plain-Romanian
 * labels for the eForms/TED code vocabulary — principle #8 (translate the
 * bureaucratese) — plus the caveats that keep the labels honest (#2, #7).
 */

/** ISO-2 → Romanian country name (the ones that appear as RO-tender winners). */
export const COUNTRY_RO: Record<string, string> = {
  RO: "România", DE: "Germania", IT: "Italia", FR: "Franța", ES: "Spania",
  NL: "Olanda", BE: "Belgia", AT: "Austria", PL: "Polonia", HU: "Ungaria",
  BG: "Bulgaria", GR: "Grecia", CZ: "Cehia", SK: "Slovacia", SI: "Slovenia",
  HR: "Croația", PT: "Portugalia", IE: "Irlanda", DK: "Danemarca", SE: "Suedia",
  FI: "Finlanda", LU: "Luxemburg", LT: "Lituania", LV: "Letonia", EE: "Estonia",
  CY: "Cipru", MT: "Malta", GB: "Marea Britanie", UK: "Marea Britanie",
  CH: "Elveția", NO: "Norvegia", US: "SUA", TR: "Turcia", CN: "China",
  IL: "Israel", RS: "Serbia", UA: "Ucraina", MD: "Moldova", JP: "Japonia",
  KR: "Coreea de Sud", IN: "India", CA: "Canada", BIH: "Bosnia și Herțegovina",
};

export function countryName(code: string | null | undefined): string {
  if (!code) return "necunoscut";
  return COUNTRY_RO[code] ?? code;
}

/** TED procurement-procedure code → plain Romanian. */
export const PROCEDURE_RO: Record<string, string> = {
  open: "Licitație deschisă",
  restricted: "Licitație restrânsă",
  "neg-w-call": "Negociere cu publicare",
  "neg-wo-call": "Negociere fără publicare",
  "comp-dial": "Dialog competitiv",
  "comp-tend": "Procedură concurențială",
  innovation: "Parteneriat pentru inovare",
};

export function procedureName(code: string | null | undefined): string {
  if (!code) return "—";
  return PROCEDURE_RO[code] ?? code;
}

export interface TedLabelMeta {
  title: string;
  hint: string;
}

/** also-in-seap / ted-only, with the honest explanation of what each means. */
export const TED_LABEL: Record<string, TedLabelMeta> = {
  "also-in-seap": {
    title: "și în SEAP",
    hint: "Am identificat automat o înregistrare corespunzătoare în datele SEAP analizate. Verifică anunțurile originale.",
  },
  "ted-only": {
    title: "Fără potrivire SEAP",
    hint: "Nu am identificat o înregistrare corespunzătoare în datele SEAP analizate. Atribuirea poate exista în SEAP chiar dacă potrivirea lipsește.",
  },
  "possible-match": {
    title: "Potrivire SEAP posibilă",
    hint: "Legătura automată nu îndeplinește criteriile pentru o potrivire confirmată. Nu transferăm numărul de oferte către contractul SEAP.",
  },
};

export const TED_AMOUNT_LABEL: Record<string, string> = {
  payable: "Valoarea ofertei / rezultatului",
  contract_value: "Valoarea contractului publicată",
  multiple_tenders: "Mai multe oferte publicate",
  framework_offer: "Ofertă pentru acord-cadru",
  tender_range: "Interval de valori ale ofertelor",
  framework_ceiling: "Plafon de acord-cadru",
  missing: "Valoare nepublicată în câmpurile preluate",
  legacy_unknown: "Tipul valorii nu este încă verificat",
  tender_lower: "Oferta cu valoarea cea mai mică",
  tender_upper: "Oferta cu valoarea cea mai mare",
};

/** Preserve the database decimal and the source currency, including zero. */
export function formatTedAmount(value: string | number | null, currency: string | null): string {
  if (value == null) return "—";
  const decimal = String(value).replace(/^([+-]?)\./, (_, sign: string) => `${sign}0.`);
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(decimal);
  if (!match) return "Valoare indisponibilă";
  const integer = new Intl.NumberFormat("ro-RO").format(BigInt(`${match[1] === "-" ? "-" : ""}${match[2]}`));
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const sign = match[1] === "-" && BigInt(match[2]!) === 0n ? "−" : "";
  return `${sign}${integer}${fraction ? `,${fraction}` : ""} ${currency || "(monedă neprecizată)"}`;
}

export function competitionLabel(count: number | null): string {
  return count == null ? "Număr de oferte necunoscut" : count === 1 ? "1 ofertă primită" : `${count} oferte primite`;
}

export function tedAmountHeadline(row: {
  awardedValue: string | null;
  currency: string | null;
  amountKind: string | null;
  amountDetails: import("@seap/db").TedAmountDetails | null;
}): string {
  if (row.awardedValue != null) return formatTedAmount(row.awardedValue, row.currency);
  const details = row.amountDetails;
  if (!details) return "—";
  if (row.amountKind === "multiple_tenders") {
    return `${details.tenders.length} ${details.missingTenderIds.length ? "referințe de ofertă" : "oferte"} · fără total`;
  }
  const kind = row.amountKind === "framework_ceiling" ? "framework_ceiling"
    : row.amountKind === "framework_offer" ? "payable" : null;
  const scalar = kind ? details.amounts.filter((a) => a.kind === kind) : [];
  if (scalar.length === 1) return formatTedAmount(scalar[0]!.value, scalar[0]!.currency);
  if (row.amountKind === "tender_range") {
    const lower = details.amounts.filter((a) => a.kind === "tender_lower");
    const upper = details.amounts.filter((a) => a.kind === "tender_upper");
    if (lower.length <= 1 && upper.length <= 1) return [
      lower[0] ? `Minim ${formatTedAmount(lower[0].value, lower[0].currency)}` : null,
      upper[0] ? `Maxim ${formatTedAmount(upper[0].value, upper[0].currency)}` : null,
    ].filter(Boolean).join(" · ") || "—";
  }
  return "Vezi valorile din sursă";
}

/** URL input is untrusted; keep SQL offsets finite and inside the filtered set. */
export function tedPagination(requestedPage: number | undefined, requestedSize: number | undefined, total: number) {
  const pageSize = Number.isSafeInteger(requestedSize) && requestedSize! > 0 ? Math.min(100, requestedSize!) : 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(requestedPage) && requestedPage! > 0 ? Math.min(totalPages, requestedPage!) : 1;
  return { page, pageSize, totalPages, offset: (page - 1) * pageSize };
}

/** A filter token, not an invented country code or a repaired entity identity. */
export const TED_COUNTRY_UNRESOLVED = "neclar";
export const TED_COUNTRY_REVIEW_LABEL = "Țară de verificat";
type TedSql = DbSql | Parameters<Parameters<DbSql["begin"]>[1]>[0];

/** The same predicate powers the displayed count and its exact result list. */
export function tedCountryFilter(sql: TedSql, country?: string) {
  if (country === TED_COUNTRY_UNRESOLVED) return sql`
    is_foreign and not exists (
      select 1 from unnest(winner_countries) as source_country(code)
      where nullif(upper(btrim(source_country.code)), '') is not null
        and upper(btrim(source_country.code)) <> 'RO'
    )`;
  return country ? sql`${country} = any(winner_countries)` : sql`true`;
}

export function tedCountryNeedsReview(isForeign: boolean, countries: (string | null)[]) {
  return isForeign && !countries.some(country => {
    const code = country?.trim().toUpperCase();
    return !!code && code !== "RO";
  });
}
