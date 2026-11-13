import { formatInt, formatRon } from "@/lib/format";
import { pctWords } from "@/lib/signal-case-words";
import { ratioWords } from "@/lib/signal-mirror";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * A case of the national list in one small picture and its number (owner, 6 November 2026, "Oglinda"): the sum of a
 * group with the ceiling's line inside it, how close a purchase stopped to its ceiling, the part above it, a share.
 * Null for the signals the list tells in words. In motion, the fill grows from 0 (an above-the-ceiling pair as one
 * piece, components/motion/chart-motion.css); the reference line stays.
 */
export function caseMeter(code: string, evidence: Record<string, unknown> | null): { bar: React.ReactNode; value: string; note: string } | null {
  const e = evidence ?? {};
  switch (code) {
    case "da_split": {
      const ceiling = num(e.ceiling), total = num(e.total);
      if (!(ceiling > 0 && total > 0)) return null;
      const r = total / ceiling;
      return { value: ratioWords(r), note: `${formatInt(num(e.count))} achiziții adunate față de plafon`,
        bar: <span className="sg-meter sum"><i className="cm-x" style={{ width: "100%" }} /><b style={{ left: `${Math.max(1, (1 / r) * 100)}%` }} /></span> };
    }
    case "da_round": {
      const ceiling = num(e.ceiling), value = num(e.closing);
      if (!(ceiling > 0 && value > 0)) return null;
      return { value: `−${formatInt(Math.round(ceiling - value))} lei`, note: `sub plafonul de ${formatRon(ceiling)}`,
        bar: <span className="sg-meter"><i className="g cm-x" style={{ width: `${Math.min(100, (value / ceiling) * 100)}%` }} /><b style={{ left: "100%" }} /></span> };
    }
    case "da_above_ceiling": {
      const ceiling = num(e.ceiling), value = e.basis === "estimate" ? num(e.estimate) || num(e.closing) : num(e.closing);
      if (!(ceiling > 0 && value > ceiling)) return null;
      return { value: `+${formatInt(Math.round(value - ceiling))} lei`, note: `peste plafonul de ${formatRon(ceiling)}`,
        bar: <span className="sg-meter over cm-x"><i className="g" style={{ flex: ceiling }} /><i className="r" style={{ flex: value - ceiling }} /></span> };
    }
    case "da_year_end": {
      const share = num(e.december_pct) || (num(e.total) > 0 ? num(e.december) / num(e.total) : 0);
      return { value: pctWords(share), note: `în decembrie ${e.year ?? ""}`.trim(),
        bar: <span className="sg-meter"><i className="cm-x" style={{ width: `${share * 100}%` }} />{e.peer_p95 != null && <b style={{ left: `${num(e.peer_p95) * 100}%` }} />}</span> };
    }
    case "da_concentration": case "da_dependence": {
      const share = num(code === "da_dependence" ? e.top_authority_pct : e.top_supplier_pct);
      if (!share) return null;
      return { value: pctWords(share), note: code === "da_dependence" ? "din vânzări, de la un client" : "din bani, la o firmă",
        bar: <span className="sg-meter"><i className="g cm-x" style={{ width: `${share * 100}%` }} /></span> };
    }
    case "da_capacity": {
      const r = num(e.ratio);
      return r > 0 ? { value: ratioWords(r), note: "cifra de afaceri", bar: null } : null;
    }
    // A firm's first month (rf-2026.24): how soon after its registration the first direct award came, against the window.
    case "da_first_month": case "da_first_month_buyer": {
      if (e.age_days == null) return null;
      const age = num(e.age_days), days = num(e.window_days) || 30;
      return { value: `ziua ${formatInt(age)}`, note: "de la înmatriculare, la prima achiziție",
        // The window as a line, the first award as a mark on it: an early day is the notable one, so nothing is filled.
        bar: <span className="sg-meter"><b style={{ left: `${Math.max(0, Math.min(100, (age / days) * 100))}%` }} /></span> };
    }
    default:
      return null;
  }
}
