import { formatExactDecimal, formatInt, formatRon } from "./format";

/** Mirrors the fixed CRI denominator in ingestion/flags/marts.ts, not all 13 flags. */
export const CRI_CRITERIA = {
  authority: ["da_split", "da_concentration", "da_year_end", "da_rapid", "da_round"],
  supplier: ["da_split", "da_dependence", "da_rapid", "da_round"],
} as const;

export function thresholdTypeLabel(type: unknown): string {
  return type === "da_ceiling_works" ? "lucrări"
    : type === "da_ceiling_goods_services" ? "produse / servicii" : "tip neprecizat";
}

// Decimal strings come from PostgreSQL ->>, before JSON numbers lose precision.
function decimal(value: unknown): { units: bigint; scale: number; text: string } | null {
  const text = typeof value === "string" ? value
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^\d{1,30}(?:\.\d{1,20})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return { units: BigInt(whole! + fraction), scale: fraction.length, text };
}

/** Exact distance from the threshold; never round a below-threshold value to 100%. */
export function nearThresholdEvidence(evidence: Record<string, unknown>): string {
  const closing = decimal(evidence.closing), ceiling = decimal(evidence.ceiling);
  if (!closing || !ceiling || ceiling.units === 0n) return "Diferența față de prag nu poate fi calculată din valorile disponibile.";
  const scale = Math.max(closing.scale, ceiling.scale);
  const difference = ceiling.units * 10n ** BigInt(scale - ceiling.scale)
    - closing.units * 10n ** BigInt(scale - closing.scale);
  const absolute = difference < 0n ? -difference : difference;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const gap = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") : digits;
  const distance = `${formatExactDecimal(gap || "0")} ${absolute === 10n ** BigInt(scale) ? "leu" : "lei"}`;
  const relation = difference > 0n ? `cu ${distance} sub pragul de`
    : difference < 0n ? `cu ${distance} peste pragul de` : "egală cu pragul de";
  return `${formatExactDecimal(closing.text)} lei — ${relation} ${formatExactDecimal(ceiling.text)} lei (${thresholdTypeLabel(evidence.type)}).`;
}

/** Display-only explanations shared by entity profiles and the signal explorer. */
export function riskEvidenceLine(code: string, evidence: Record<string, unknown> | null): string | null {
  if (!evidence) return null;
  const n = (key: string): number | null => {
    const raw = evidence[key];
    if (raw == null || raw === "" || !["string", "number"].includes(typeof raw)) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const s = (key: string) => evidence[key] == null ? "neprecizat" : String(evidence[key]);
  const money = (key: string) => n(key) === null ? "valoare necunoscută" : formatRon(n(key));
  const pct = (key: string) => n(key) === null ? "pondere necunoscută" : `${Math.round(n(key)! * 100)}%`;
  switch (code) {
    case "da_split":
      return `${s("count")} achiziții în ${s("year")}${evidence.cpv_class ? ` · CPV ${s("cpv_class")}` : ""}, plafon de referință ${money("ceiling")}.`;
    case "da_year_end":
      return `${s("year")}: ${pct("december_pct")} din valoarea achizițiilor directe finalizate în acel an revine lunii decembrie (${money("december")} din ${money("total")}).`;
    case "da_rapid":
      return `Interval publicare–finalizare: ${n("minutes") === null ? "necunoscut" : `${formatInt(n("minutes"))} min. (rotunjit)`} · ${money("closing")}.`;
    case "da_round":
      return nearThresholdEvidence(evidence);
    case "da_concentration":
      return `Furnizorul principal: ${pct("top_supplier_pct")} din valoarea achizițiilor directe (${money("total")} în total, ${s("suppliers")} furnizori, HHI ${s("hhi")}).`;
    case "da_dependence":
      return `Autoritatea principală: ${pct("top_authority_pct")} din valoarea achizițiilor directe ale furnizorului (${s("authorities")} autorități în date).`;
    case "award_no_competition":
      return `${s("procedure")} · valoarea anunțului: ${money("value")} · CPV ${s("cpv")}.`;
    case "award_single_bid":
      return evidence.confirmed_contract_count
        ? `${s("confirmed_contract_count")} contracte asociate unor loturi TED cu o singură ofertă raportată.`
        : "Lista contractelor cu o singură ofertă raportată nu este disponibilă în această versiune a semnalului.";
    case "award_concentration":
      return `Furnizorul principal: ${pct("top_winner_pct")} din valoarea contractelor (${s("winners")} furnizori în date, HHI ${s("hhi")}).`;
    case "award_dependence":
      return `Autoritatea principală: ${pct("top_authority_pct")} din valoarea contractelor furnizorului (${s("authorities")} autorități în date).`;
    case "fin_tiny_staff":
      return `${s("year")}: ${s("employees")} salariați în medie · ${money("total")} în achiziții înregistrate.`;
    case "fin_public_reliance":
      return `Raport valori contractate / cifră de afaceri: ${pct("ratio")} (${money("public_total")} / ${money("revenue_total")}, ${s("years")} ani cu bilanț). Nu reprezintă ponderea încasărilor de la stat.`;
    case "net_shared_admin":
      return `${s("person")} apare ca reprezentant legal pentru ${s("n_firms")} firme cu ${money("combined")} în achiziții înregistrate la ${s("authority")}.`;
    default:
      return null;
  }
}

export function signalPeriodLabel(period: string | null): string {
  return period === "all" ? "Întreaga perioadă disponibilă la calcul"
    : period ? `Perioada calculului: ${period}` : "Perioada calculului nu este precizată";
}
