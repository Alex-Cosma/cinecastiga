import type { DbSql } from "@seap/db";
import { coverageDate, type Coverage } from "./coverage";
import { TED_COUNTRY_UNRESOLVED, countryName } from "./ted-labels";

// The vocabulary is in ted-labels.ts, safe for the browser (the column filters' declarations use it).
export * from "./ted-labels";

/**
 * Display metadata for the TED publication source. Plain-Romanian
 * labels for the eForms/TED code vocabulary — principle #8 (translate the
 * bureaucratese) — plus the caveats that keep the labels honest (#2, #7).
 */

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
  // TED's trailing zeros are notation, not precision; a single decimal is written in bani (848.444,80), like the site's
  // other amounts, and RON as "lei".
  const trimmed = (match[3] ?? "").replace(/0+$/, ""), fraction = trimmed.length === 1 ? `${trimmed}0` : trimmed;
  const sign = match[1] === "-" && BigInt(match[2]!) === 0n ? "−" : "";
  const unit = currency && currency.trim().toUpperCase() === "RON" ? "lei" : currency || "(monedă neprecizată)";
  return `${sign}${integer}${fraction ? `,${fraction}` : ""} ${unit}`;
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

/**
 * Country part of an entity page's eyebrow. An entity whose stored foreign
 * marker sits next to the country RO (data audit F26: Candu Energy Inc.
 * 2270125, Synevo Romania 2270902) has sources that disagree about its
 * country. The page then states neither "firmă străină" nor "România", only
 * that the country needs checking, as the TED list does for its result rows.
 * The stored identity is not changed.
 */
export function entityCountryLabel(isForeign: boolean, countryCode: string | null | undefined): string | null {
  if (!isForeign) return null;
  const code = countryCode?.trim().toUpperCase();
  if (code === "RO") return "țară de verificat";
  return code ? `firmă străină · ${countryName(code)}` : "firmă străină";
}

export function tedCountryNeedsReview(isForeign: boolean, countries: (string | null)[]) {
  return isForeign && !countries.some(country => {
    const code = country?.trim().toUpperCase();
    return !!code && code !== "RO";
  });
}

/**
 * Period of the TED publications behind /supra-prag (data audit F29). TED is
 * imported separately from SEAP and can stop months earlier (local snapshot of
 * 1 Oct 2026: TED to 30.06.2026, SEAP to 25.09.2026), so the page's totals,
 * single-bid and "Fără potrivire SEAP" counts must say which publication days
 * they cover. Endpoints are the oldest and newest stored publication dates
 * (marts.data_coverage), not a promise that every day in between is complete.
 * `line` is the short period shown under the title; `tip` explains it in a (?).
 */
export function tedCoverageNote(coverage: Pick<Coverage, "observations"> | null | undefined): { line: string; tip: string | null } {
  const observation = (dataset: string) => coverage?.observations.find((o) => o.dataset === dataset)?.observation;
  const ted = observation("ted");
  const tedTo = ted?.date_to?.slice(0, 10);
  if (!ted?.date_from || !tedTo) return { line: "Perioada publicațiilor TED preluate nu este încă inventariată; cifrele de mai jos nu au un interval confirmat.", tip: null };
  const seapTo = [observation("da")?.date_to, observation("contracts")?.date_to]
    .map((d) => d?.slice(0, 10)).filter((d): d is string => !!d).sort().at(-1);
  const later = seapTo && seapTo > tedTo ? coverageDate(seapTo) : null;
  return {
    line: `TED: ${coverageDate(ted.date_from)} – ${coverageDate(tedTo)}${later ? ` · SEAP: până la ${later}` : ""}`,
    tip: `Data publicării în Jurnalul Oficial al UE. Anunțurile publicate în TED după ${coverageDate(tedTo)} nu sunt încă preluate${later ? ", deci cifrele TED acoperă o perioadă mai scurtă decât cele SEAP" : ""}.`,
  };
}
