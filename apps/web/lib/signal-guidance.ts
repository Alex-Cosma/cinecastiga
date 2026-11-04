/**
 * The entity page's signal rows (variant A, owner, 4 November 2026): one plain
 * sentence of what was found, what to check and how it may be explained,
 * per criterion of the risk score. The numbers come from the profile's score
 * parts (marts.entity_flags.score_parts); the rule, thresholds and limits stay
 * on /metodologie. Signals are leads, not proof.
 */
import { countWords } from "./ask/answer-text";
import { formatInt, formatRon } from "./format";
import type { RiskCriterion, RiskRole, ScorePart } from "./risk-score";

const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
/** A share as a whole percentage ("13%"); a non-zero share under 0.5% says "sub 1%". */
const pct = (share: number): string => (share > 0 && share < 0.005 ? "sub 1%" : `${formatInt(Math.round(share * 100))}%`);

export interface SignalGuidance {
  /** Ce verifici: the record a reader opens first, in a few words. */
  check: string;
  /** Se poate explica: the ordinary explanations, always beside the signal. */
  explain: string;
}

export const SIGNAL_GUIDANCE: Record<RiskCriterion, SignalGuidance> = {
  da_split: {
    check: "Dacă achizițiile trebuiau cumpărate împreună, prin licitație.",
    explain: "Lucrări sau servicii diferite sub același cod, nevoi apărute pe parcursul anului.",
  },
  da_round: {
    check: "Cum s-a stabilit prețul achizițiilor lipite de plafon.",
    explain: "Prețuri de piață apropiate de plafon, o ofertă ajustată la bugetul disponibil.",
  },
  da_above_ceiling: {
    check: "De ce achiziția a fost directă, deși valoarea trece de plafon.",
    explain: "O greșeală de introducere în SEAP, o excepție prevăzută de lege, o urgență.",
  },
  da_year_end: {
    check: "Ce s-a cumpărat în decembrie și dacă era nevoie atunci.",
    explain: "Bugetul aprobat târziu, plăți programate la final de an.",
  },
  da_concentration: {
    check: "Cum a fost ales furnizorul principal, an de an.",
    explain: "Un singur furnizor local, un serviciu specializat.",
  },
  da_dependence: {
    check: "Istoricul relației cu instituția și cum a fost aleasă firma.",
    explain: "Specializarea firmei, piața locală, vânzări private care nu apar aici.",
  },
  da_capacity: {
    check: "Dacă firma avea oameni și cifră de afaceri pentru ce a vândut.",
    explain: "Subcontractori, o firmă nouă al cărei bilanț nu e încă publicat.",
  },
};

/**
 * What was found, as a sentence: "De 4 ori, aceeași firmă a primit …". Falls
 * back to null when the part carries none of the numbers the sentence needs;
 * the caller then shows riskFact's terse line.
 */
export function signalSentence(code: RiskCriterion, part: ScorePart, role: RiskRole): string | null {
  switch (code) {
    case "da_split": {
      const groups = n(part.groups);
      if (!groups) return null;
      const share = part.rawShare != null ? n(part.rawShare) : n(part.share);
      const who = role === "authority"
        ? "aceeași firmă a primit în același an mai multe achiziții directe pentru același fel de lucru"
        : "aceeași instituție a cumpărat de la firmă, în același an, mai multe achiziții directe pentru același fel de lucru";
      return `${groups === 1 ? "O dată" : `De ${formatInt(groups)} ori`}, ${who}. Luate pe rând sunt sub plafon; adunate, îl depășesc. Împreună: ${pct(share)} din bani.`;
    }
    case "da_round": {
      const found = n(part.n);
      if (!found) return null;
      const expected = part.expected != null ? Math.round(n(part.expected)) : null;
      return `${countWords(found, "achiziție s-a oprit", "achiziții s-au oprit")} la 96–100% din plafon.`
        + (expected != null ? ` După media instituțiilor de același tip, ne-am aștepta la ${expected === 0 ? "niciuna" : `vreo ${formatInt(expected)}`}.` : "");
    }
    case "da_above_ceiling": {
      const found = n(part.n);
      if (!found) return null;
      return `${countWords(found, "achiziție directă are", "achiziții directe au")} valoare cu peste 10% mai mare decât plafonul. Împreună: ${formatRon(n(part.value))}, ${pct(n(part.share))} din bani.`;
    }
    case "da_year_end": {
      const years = Array.isArray(part.years) ? (part.years as { y: number; pct: number }[]) : [];
      if (!years.length) return null;
      return `${years.map((y, i) => `${i ? "în" : "În"} ${y.y}, decembrie a adus ${pct(n(y.pct))}`).join("; ")} din achizițiile directe ale anului.`;
    }
    case "da_concentration":
      return part.share == null ? null : `Un singur furnizor a primit ${pct(n(part.share))} din valoarea achizițiilor directe, chiar fără achiziția lui cea mai mare.`;
    case "da_dependence":
      return part.share == null ? null
        : `${pct(n(part.share))} din ce vinde firma prin achiziții directe vine de la o singură instituție; pentru ea, firma înseamnă ${pct(n(part.partnerShare))} din achizițiile directe.`
          + (part.capture === true ? " Firma vinde și peste capacitatea ei." : "");
    default:
      return null;
  }
}

/** The share a bar draws beside the sentence (0–1), when the criterion has one. */
export function signalShare(code: RiskCriterion, part: ScorePart): number | null {
  if (code === "da_above_ceiling" || code === "da_concentration" || code === "da_dependence") return part.share == null ? null : Math.min(1, Math.max(0, n(part.share)));
  return null;
}
