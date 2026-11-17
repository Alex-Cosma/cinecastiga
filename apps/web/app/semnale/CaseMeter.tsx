import { DOMAIN_ALIASES } from "@/lib/cpv-aliases";
import { formatInt, formatRon, formatRonFull } from "@/lib/format";
import { pctWords } from "@/lib/signal-case-words";
import { ratioWords, SPLIT_COUNTS_ABOVE, splitRatioWords } from "@/lib/signal-mirror";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** „2024-05-28” → „28.05.2024”. */
const day = (v: unknown): string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join(".") : "";

/**
 * A case of the national list in one small picture and its number (owner, 6 November 2026, "Oglinda"): the sum of a
 * group with the ceiling's line inside it, how close a purchase stopped to its ceiling, the part above it, a share.
 * Null for the signals the list tells in words. A group of „Adunate” is green up to its ceiling and red past it; a sum just
 * under the ceiling has no picture, its number says it (UX audit Z6-16). In motion, the fill grows from 0 (an above-the-ceiling pair as one
 * piece, components/motion/chart-motion.css); the reference line stays. `tip`: what the picture draws, in figures, for
 * the card shown on hover (owner, 13 November 2026), its first line the title.
 */
export function caseMeter(code: string, evidence: Record<string, unknown> | null): { bar: React.ReactNode; value: string; note: string; tip: string[]; under?: boolean } | null {
  const e = evidence ?? {};
  switch (code) {
    case "da_split": {
      const ceiling = num(e.ceiling), total = num(e.total);
      if (!(ceiling > 0 && total > 0)) return null;
      const r = total / ceiling;
      // At 1,2× or under a group adds nothing to the score: listed only on request, its multiple says so (UX audit Z6-04).
      const under = r <= SPLIT_COUNTS_ABOVE;
      return { value: splitRatioWords(r), under, note: `${formatInt(num(e.count))} achiziții${under ? " · nu intră în scor" : ""}`,
        tip: [`${formatInt(num(e.count))} achiziții${e.year ? ` în ${e.year}` : ""}${e.cpv_class ? `, ${DOMAIN_ALIASES[String(e.cpv_class)] ? `${DOMAIN_ALIASES[String(e.cpv_class)]} (CPV ${e.cpv_class})` : `clasa CPV ${e.cpv_class}`}` : ""}`, `Adunate: ${formatRonFull(total)}`,
          `Verde: plafonul de ${formatRonFull(ceiling)}`, ...(r > 1 ? [`Roșu: ${formatRonFull(Math.round((total - ceiling) * 100) / 100)} peste plafon`] : []), `De ${splitRatioWords(r)} plafonul`],
        // Red only past the ceiling (UX audit Z6-16): up to it green, as „Declarate directe”, so 1,2× has a short red
        // tail and 15,8× a long one; the bar is the group's own sum, no common scale.
        bar: <span className="sg-meter over cm-x"><i className="g" style={{ flex: Math.min(1, r) }} />{r > 1 && <i className="r" style={{ flex: r - 1 }} />}</span> };
    }
    case "da_round": {
      const ceiling = num(e.ceiling), value = num(e.closing);
      if (!(ceiling > 0 && value > 0)) return null;
      // No bar (UX audit Z6-16): every one would be 96–100% full and repeat the number beside it; the ceiling is said in words.
      return { value: `−${formatInt(Math.round(ceiling - value))} lei`, note: `sub plafonul de ${formatRon(ceiling)}`,
        tip: [], bar: null };
    }
    case "da_above_ceiling": {
      const ceiling = num(e.ceiling), value = e.basis === "estimate" ? num(e.estimate) || num(e.closing) : num(e.closing);
      if (!(ceiling > 0 && value > ceiling)) return null;
      return { value: `+${formatInt(Math.round(value - ceiling))} lei`, note: `peste plafonul de ${formatRon(ceiling)}`,
        tip: [`Achiziția: ${formatRonFull(value)}${e.basis === "estimate" ? " (valoarea estimată)" : ""}`, `Verde: plafonul de ${formatRonFull(ceiling)}`, `Roșu: ${formatRonFull(Math.round(value - ceiling))} peste plafon`],
        bar: <span className="sg-meter over cm-x"><i className="g" style={{ flex: ceiling }} /><i className="r" style={{ flex: value - ceiling }} /></span> };
    }
    case "da_year_end": {
      const share = num(e.december_pct) || (num(e.total) > 0 ? num(e.december) / num(e.total) : 0);
      return { value: pctWords(share), note: "",
        tip: [`Decembrie ${e.year ?? ""}`.trim(), ...(num(e.total) > 0 ? [`${formatRonFull(num(e.december))} din ${formatRonFull(num(e.total))} în tot anul`] : []), `Bara: ${pctWords(share)} din valoarea anului`,
          ...(e.peer_p95 != null ? [`Linia: ${pctWords(num(e.peer_p95))}; 95% dintre instituțiile de același tip sunt sub ea`] : [])],
        bar: <span className="sg-meter"><i className="cm-x" style={{ width: `${share * 100}%` }} />{e.peer_p95 != null && <b style={{ left: `${num(e.peer_p95) * 100}%` }} />}</span> };
    }
    case "da_concentration": case "da_dependence": {
      const share = num(code === "da_dependence" ? e.top_authority_pct : e.top_supplier_pct);
      if (!share) return null;
      const many = num(code === "da_dependence" ? e.top_authority_count : e.top_supplier_count), years = num(code === "da_dependence" ? e.top_authority_years : e.top_supplier_years);
      return { value: pctWords(share), note: code === "da_dependence" ? "din vânzări, de la un client" : "din valoare, la o firmă",
        tip: [code === "da_dependence" ? `${pctWords(share)} din vânzări, de la un singur client` : `${pctWords(share)} din valoare, la o singură firmă`,
          ...(num(e.total) > 0 ? [`${code === "da_dependence" ? "Vânzările firmei" : "Achizițiile directe"}: ${formatRonFull(num(e.total))}`] : []),
          ...(many > 0 ? [`${formatInt(many)} ${many === 1 ? "achiziție" : "achiziții"}${years > 0 ? `, în ${formatInt(years)} ${years === 1 ? "an" : "ani"}` : ""}`] : [])],
        bar: <span className="sg-meter"><i className="g cm-x" style={{ width: `${share * 100}%` }} /></span> };
    }
    case "da_capacity": {
      // What the multiple is of (UX audit bug: the column said only „cifra de afaceri”): the turnover and its year.
      const r = num(e.ratio), turnover = num(e.turnover), year = e.turnover_year ?? e.year;
      // The year is under the firm and the multiple is the row's number (owner, 17 November 2026: less small print).
      const sheet = e.implausible === true ? "cifră de afaceri nerealistă" : turnover > 0 ? `cifra de afaceri de ${formatRon(turnover)}` : "cifra de afaceri";
      return r > 0 ? { value: ratioWords(r), note: `${formatInt(num(e.da_count))} ${num(e.da_count) === 1 ? "achiziție directă" : "achiziții directe"} · ${sheet}${year ? ` (bilanț ${year})` : ""}`, bar: null, tip: [] } : null;
    }
    // A firm's first month (rf-2026.24): how soon after its registration the first direct award came, against the window.
    case "da_first_month": case "da_first_month_buyer": {
      if (e.age_days == null) return null;
      const age = num(e.age_days), days = num(e.window_days) || 30;
      return { value: `ziua ${formatInt(age)}`, note: "de la înmatriculare, la prima achiziție",
        tip: [`Prima achiziție în ziua ${formatInt(age)}`, ...(day(e.registered_on) ? [`Înmatriculată: ${day(e.registered_on)}`] : []), ...(day(e.first_award_on) ? [`Prima achiziție: ${day(e.first_award_on)}`] : []),
          `Bara: primele ${formatInt(days)} de zile; linia, ziua achiziției`],
        // The window as a line, the first award as a mark on it: an early day is the notable one, so nothing is filled.
        bar: <span className="sg-meter"><b style={{ left: `${Math.max(0, Math.min(100, (age / days) * 100))}%` }} /></span> };
    }
    default:
      return null;
  }
}
