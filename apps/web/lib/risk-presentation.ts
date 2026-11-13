import { countWords } from "./ask/answer-text";
import { formatCalendarDate, formatExactDecimal, formatInt, formatRon } from "./format";

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

/** award_single_bid (rf-2026.9): which value the signal uses and whether the
 * cited contracts exceed it. Older signals lack these fields and add nothing. */
export function singleBidValueNote(evidence: Record<string, unknown>): string {
  const n = (key: string): number | null => {
    const raw = evidence[key];
    if (raw == null || raw === "" || !["string", "number"].includes(typeof raw)) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  // Exact, like the signal card: these are source sums, not headline figures.
  const lei = (key: string) => {
    const raw = evidence[key];
    const text = typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
    return /^\d+(?:\.\d+)?$/.test(text) ? `${formatExactDecimal(text)} lei` : "valoare necunoscută";
  };
  const value = n("value"), cited = n("cited_contracts_value"), unknown = n("cited_unknown_value_count");
  const parts: string[] = [];
  if (evidence.value_scope === "confirmed_contracts") parts.push(`Anunțul SEAP nu are o valoare; valoarea semnalului (${lei("value")}) este suma contractelor citate care sunt contracte sau comenzi subsecvente, fără plafoane de acord-cadru.`);
  if (value !== null && cited !== null && cited > value) parts.push(`Contractele citate însumează ${lei("cited_contracts_value")}, mai mult decât ${evidence.value_scope === "confirmed_contracts" ? "valoarea semnalului" : `valoarea anunțului (${lei("value")})`}; suma poate include plafoane de acord-cadru, care nu sunt cheltuieli. Verifică anunțul SEAP.`);
  if (unknown) parts.push(`${formatInt(unknown)} ${unknown === 1 ? "contract citat nu are" : "contracte citate nu au"} valoare cunoscută în lei.`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** What an award notice publishes (evidence.notice_contracts, rf-2026.12, audit
 * F14), by the shared contract classification. */
export const NOTICE_CONTRACTS_LABEL: Record<string, string> = {
  contract: "contracte obișnuite",
  framework: "doar plafonul unui acord-cadru",
  calloff: "doar contracte subsecvente",
  mixed: "contracte de tipuri diferite",
  amendment: "doar acte adiționale",
  review: "contracte cu tip neclar, de verificat",
  none: "fără contracte publicate",
};

/** The notice holds only framework ceilings: its value is a ceiling, not spending. */
export function noticeIsFrameworkOnly(evidence: Record<string, unknown> | null | undefined): boolean {
  return evidence?.notice_contracts === "framework";
}

/** Label of the value an award signal shows. Older signals lack notice_contracts. */
export function awardValueLabel(evidence: Record<string, unknown> | null | undefined): string {
  if (evidence?.value_scope === "confirmed_contracts") return "contractele citate";
  return noticeIsFrameworkOnly(evidence) ? "plafon acord-cadru" : "valoarea anunțului";
}

/** One sentence on what the notice publishes; empty for older signals. */
export function noticeContractsNote(evidence: Record<string, unknown>): string {
  const label = typeof evidence.notice_contracts === "string" ? NOTICE_CONTRACTS_LABEL[evidence.notice_contracts] : undefined;
  if (!label) return "";
  if (evidence.notice_contracts === "none") return " Anunțul nu are contracte publicate.";
  return noticeIsFrameworkOnly(evidence)
    ? ` Anunțul conține ${label}: valoarea este plafonul acordului, nu o cheltuială, și nu se adună la totaluri.`
    : ` Anunțul conține ${label}.`;
}

/** net_shared_admin (rf-2026.13, audit F31): the person's ONRC role(s) at the
 * signal's firm. Older signals lack `roles` and add nothing. */
export function onrcRoleNote(evidence: Record<string, unknown>): string {
  if (!Array.isArray(evidence.roles)) return "";
  const roles = evidence.roles.filter((role): role is string => typeof role === "string" && role.trim() !== "");
  return roles.length
    ? ` ${roles.length === 1 ? "Calitatea" : "Calitățile"} în ONRC la această firmă: ${roles.join("; ")}.`
    : " Calitatea în ONRC la această firmă nu este precizată.";
}


/** award_calloffs_over_ceiling (rf-2026.23): the declared call-offs against their frameworks' ceilings, and how many
 * repeat the whole ceiling (owner, 8 November 2026: say that it may be a data-entry error, never hide what SEAP holds). */
export function calloffsOverCeilingLine(evidence: Record<string, unknown>): string {
  const num = (key: string) => { const v = Number(evidence[key]); return evidence[key] == null || !Number.isFinite(v) ? null : v; };
  const value = num("value"), ceiling = num("ceiling"), calloffs = num("calloffs"), repeats = num("calloffs_repeating_ceiling") ?? 0;
  const times = value !== null && ceiling ? (Math.round((value / ceiling) * 10) / 10).toFixed(1).replace(".", ",") : null;
  const head = `Comenzile subsecvente declarate în SEAP: ${value === null ? "valoare necunoscută" : formatRon(value)}${calloffs ? ` (${calloffs === 1 ? "1 comandă" : `${calloffs} comenzi`})` : ""}, față de un plafon al acordului-cadru de ${ceiling === null ? "valoare necunoscută" : formatRon(ceiling)}${times ? `: de ${times} ori plafonul` : ""}.`;
  if (repeats >= 2) return `${head} ${repeats} comenzi au exact suma plafonului: probabil plafonul copiat în fiecare comandă, o eroare de completare în SEAP. Valorile reale sunt în documentele contractelor.`;
  if (repeats === 1) return `${head} O comandă are exact suma plafonului. Poate fi și o eroare de completare în SEAP.`;
  return `${head} Poate fi o depășire reală sau o eroare de completare în SEAP.`;
}

/**
 * da_first_month and its reverse on the institution, da_first_month_buyer (rf-2026.24; owner, 13 November 2026): the
 * registration day, the firm's age at its first award and what was contracted in the window, then the two facts that
 * sharpen or explain a case: an award close to the ceiling, and an older firm of one of the firm's legal
 * representatives (the usual explanation: the new firm of an existing supplier).
 */
export function firstMonthLine(code: string, evidence: Record<string, unknown>): string {
  const num = (key: string) => { const v = Number(evidence[key]); return evidence[key] == null || evidence[key] === "" || !Number.isFinite(v) ? null : v; };
  const text = (key: string) => (typeof evidence[key] === "string" && evidence[key] ? String(evidence[key]) : null);
  const money = (key: string) => (num(key) === null ? "valoare necunoscută" : formatRon(num(key)));
  const window = countWords(num("window_days") ?? 30, "zi", "zile");
  const age = num("age_days"), count = num("count"), buyers = num("buyers"), everBuyers = num("buyers_all");
  const registered = text("registered_on") ? `la ${formatCalendarDate(text("registered_on"))}` : "la o dată neprecizată";
  const awards = count === null ? "" : `, ${countWords(count, "achiziție", "achiziții")}`;
  const closest = num("closest_value"), ceiling = num("closest_ceiling");
  const near = evidence.near_ceiling === true && closest !== null && ceiling
    ? ` O achiziție de ${formatRon(closest)}: ${closest > ceiling ? "peste" : `${Math.floor((closest / ceiling) * 100)}% din`} plafonul de ${formatRon(ceiling)}.`
    : "";
  const older = text("older_firm_name");
  if (code === "da_first_month_buyer") {
    const first = age === null ? "" : age === 0 ? " Prima achiziție: chiar în ziua înmatriculării." : ` La prima achiziție avea ${countWords(age, "zi", "zile")}.`;
    const firmBuyers = num("firm_buyers");
    const context = firmBuyers !== null && firmBuyers > 1
      ? ` În aceeași perioadă, firma a contractat în total ${money("firm_total")} cu ${countWords(firmBuyers, "instituție", "instituții")}.`
      : everBuyers === 1 ? " Instituția este singurul ei cumpărător din achizițiile directe ale arhivei." : "";
    const kin = older ? ` Un reprezentant legal al firmei are și o firmă mai veche, ${older}, care contractase cu instituția.` : "";
    return `Firmă înmatriculată ${registered}.${first} În primele ei ${window}, instituția a contractat cu ea ${money("total")}${awards}.${context}${near}${kin}`;
  }
  const first = age === null ? "" : age === 0 ? "; prima achiziție directă, chiar în ziua înmatriculării" : `; prima achiziție directă, după ${countWords(age, "zi", "zile")}`;
  const from = buyers === null ? ""
    : buyers === 1 ? `, de la o singură instituție${everBuyers === 1 ? " (singura din achizițiile ei directe din arhivă)" : ""}`
      : `, de la ${countWords(buyers, "instituție", "instituții")}`;
  const kin = !older ? ""
    : ` Un reprezentant legal are și o firmă mai veche, ${older}${evidence.older_firm_same_buyer === true ? (buyers === 1 ? ", care contractase cu aceeași instituție" : ", care contractase cu una dintre aceste instituții") : ""}.`;
  return `Înmatriculată ${registered}${first}. În primele ${window}: ${money("total")}${awards}${from}.${near}${kin}`;
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
    // Both compare one acquisition's closing value with its own ceiling (rf-2026.18: closing, ceiling, type).
    case "da_round":
    case "da_above_ceiling":
      return nearThresholdEvidence(evidence);
    case "da_concentration":
      // rf-2026.20: the rule reads the share without the supplier's largest DA (adjusted_pct).
      return `Furnizorul principal: ${pct("top_supplier_pct")} din valoarea achizițiilor directe${n("adjusted_pct") === null ? "" : `, ${pct("adjusted_pct")} fără cea mai mare achiziție a lui`} (${money("total")} în total, ${s("suppliers")} furnizori, HHI ${s("hhi")}).`;
    case "da_dependence":
      // Audit F30: a supplier with one public client meets the share criterion
      // by construction; the owner kept the rule and asked for it to be said.
      return n("authorities") === 1
        ? `Autoritatea principală: ${pct("top_authority_pct")} din valoarea achizițiilor directe ale furnizorului (o singură autoritate în date). Cu un singur client public, semnalul apare automat: dependența de acest client este pista de verificat, nu o dovadă de neregulă.`
        : `Autoritatea principală: ${pct("top_authority_pct")} din valoarea achizițiilor directe ale furnizorului (${s("authorities")} autorități în date).`;
    case "da_capacity": {
      // rf-2026.20: a year's DA sales against the firm's turnover (balance sheet of that year or up to two before).
      const sheet = n("turnover_year") !== null && n("turnover_year") !== n("year") ? ` (bilanț ${s("turnover_year")})` : "";
      const staff = evidence.zero_staff === true ? " · 0 angajați" : "";
      const ratio = n("ratio") === null ? "" : ` · ${(Math.round(n("ratio")! * 10) / 10).toFixed(1).replace(".", ",")}× cifra de afaceri`;
      return `${s("year")}: ${money("da_value")} în ${s("da_count")} achiziții directe · ${n("turnover") === null ? "cifră de afaceri necunoscută" : `cifră de afaceri ${money("turnover")}`}${sheet}${ratio}${staff}${evidence.young === true ? " · firmă nouă" : ""}.`;
    }
    case "da_first_month":
    case "da_first_month_buyer":
      return firstMonthLine(code, evidence);
    case "award_no_competition":
      return `${s("procedure")} · ${awardValueLabel(evidence)}: ${money("value")} · CPV ${s("cpv")}.${noticeContractsNote(evidence)}`;
    case "award_single_bid":
      return evidence.confirmed_contract_count
        ? `${n("confirmed_contract_count") === 1 ? "1 contract asociat unui lot TED" : `${s("confirmed_contract_count")} contracte asociate unor loturi TED`} cu o singură ofertă raportată.${singleBidValueNote(evidence)}${noticeContractsNote(evidence)}`
        : "Lista contractelor cu o singură ofertă raportată nu este disponibilă în această versiune a semnalului.";
    case "award_calloffs_over_ceiling":
      return calloffsOverCeilingLine(evidence);
    case "award_concentration":
      return `Furnizorul principal: ${pct("top_winner_pct")} din valoarea contractelor (${s("winners")} furnizori în date, HHI ${s("hhi")}).`;
    case "award_dependence":
      return `Autoritatea principală: ${pct("top_authority_pct")} din valoarea contractelor furnizorului (${s("authorities")} autorități în date).`;
    case "fin_tiny_staff":
      return `${s("year")}: ${s("employees")} salariați în medie · ${money("total")} în achiziții înregistrate.`;
    case "fin_public_reliance":
      return `Raport valori contractate / cifră de afaceri: ${pct("ratio")} (${money("public_total")} / ${money("revenue_total")}, ${s("years")} ani cu bilanț). Nu reprezintă ponderea încasărilor de la stat.`;
    case "net_shared_admin":
      return `${s("person")} apare ca reprezentant legal pentru ${s("n_firms")} firme cu ${money("combined")} în achiziții înregistrate la ${s("authority")}.${onrcRoleNote(evidence)}`;
    default:
      return null;
  }
}

/** Award signals (rf-2026.15) are dated by the first contract of the notice,
 * across its SEAP versions, or, without one, by its first version we hold.
 * Older signals carry no period_source and keep the plain label. */
const PERIOD_SOURCE_LABEL: Record<string, string> = {
  first_contract: "anul primului contract din anunț",
  notice_version: "anul primei versiuni preluate a anunțului; anunțul nu are contracte cu dată plauzibilă",
};

export function signalPeriodLabel(period: string | null, evidence?: Record<string, unknown> | null): string {
  if (period === "all") return "Întreaga perioadă disponibilă la calcul";
  if (!period) return "Perioada calculului nu este precizată";
  const source = typeof evidence?.period_source === "string" ? PERIOD_SOURCE_LABEL[evidence.period_source] : undefined;
  return source ? `Perioada calculului: ${period} (${source})` : `Perioada calculului: ${period}`;
}
