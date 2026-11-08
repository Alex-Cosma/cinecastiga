/**
 * The case page's sentences (/entitati/{id}/semnale?tip=…): what was found, as a title with the case's own numbers, and the
 * line under it. The wording follows the entity page's "De unde vine scorul" (lib/signal-guidance.ts) so a reader
 * meets the same sentence on both pages; the numbers here come from the cases and their records.
 */
import { countWords } from "./ask/answer-text";
import { cleanName, formatInt, formatRon } from "./format";
import type { RiskRole, ScorePart } from "./risk-score";
import { datesWords, ratioWords, type AboveCeiling, type Capacity, type NearCeiling, type PartnerShare, type SplitSummary, type YearEnd } from "./signal-mirror";

/** A share as a whole percentage ("96%"); a non-zero share under 0,5% says "sub 1%". */
export const pctWords = (share: number): string => (share > 0 && share < 0.005 ? "sub 1%" : `${formatInt(Math.round(share * 100))}%`);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export interface CaseWords { title: string; lede: string | null }

const yearsWords = (years: { from: string; to: string } | null): string =>
  !years ? "" : years.from === years.to ? `în ${years.from}` : `din ${years.from} până în ${years.to}`;

export function splitWords(role: RiskRole, s: SplitSummary, part: ScorePart | undefined): CaseWords {
  const counted = part?.groups != null ? n(part.groups) : s.counted;
  const times = counted || s.groups;
  const who = role === "authority"
    ? "aceeași firmă a câștigat în același an mai multe achiziții directe pentru același fel de lucru"
    : "aceeași instituție a cumpărat de la firmă, în același an, mai multe achiziții directe pentru același fel de lucru";
  const title = `${times === 1 ? "O dată" : `De ${formatInt(times)} ori`}, ${who}: luate pe rând sunt sub plafon, adunate îl depășesc.`;
  const where = s.groups === 1 ? `într-un grup` : `în ${formatInt(s.groups)} grupuri`;
  const scored = counted > 0 && part
    ? ` ${counted === 1 ? "Grupul din scor adună" : `Cele ${formatInt(counted)} grupuri din scor adună`} ${part.value != null ? `${formatRon(n(part.value))}, ` : ""}${pctWords(part.rawShare != null ? n(part.rawShare) : n(part.share))} din banii achizițiilor directe.`
    : " Niciun grup nu trece de 1,2 ori plafonul, așa că tiparul nu adaugă puncte.";
  return { title, lede: `${countWords(s.acquisitions, "achiziție", "achiziții")} ${where}, ${yearsWords(s.years)}.${scored}` };
}

export function roundWords(found: number, part: ScorePart | undefined, items: readonly NearCeiling[], partners: readonly { name: string; n: number }[]): CaseWords {
  const title = `${countWords(found, "achiziție directă s-a oprit", "achiziții directe s-au oprit")} la 96–100% din plafon.`;
  const expected = part?.expected != null ? Math.round(n(part.expected)) : null;
  const years = items.map((i) => i.date?.slice(0, 4)).filter((y): y is string => Boolean(y)).sort();
  const span = years.length ? ` ${yearsWords({ from: years[0]!, to: years[years.length - 1]! }).replace(/^./, (c) => c.toUpperCase())}.` : "";
  const who = partners.length ? ` ${partners.slice(0, 2).map((p, i) => `${formatInt(p.n)} ${i === 0 ? (p.n === 1 ? "e" : "sunt") + " de la" : "de la"} ${cleanName(p.name)}`).join(", ")}.` : "";
  const lede = (expected != null ? `După restul achizițiilor directe și media națională, ne-am aștepta la ${expected === 0 ? "niciuna" : `vreo ${formatInt(expected)}`}.` : "") + span + who;
  return { title, lede: lede.trim() || null };
}

export function aboveWords(items: readonly AboveCeiling[], part: ScorePart | undefined): CaseWords {
  const title = `${countWords(items.length, "achiziție directă a trecut", "achiziții directe au trecut")} de plafon.`;
  const rule = "Cu valoarea estimată sau cu suma finală, chiar și cu TVA.";
  const scored = part ? ` Împreună: ${formatRon(n(part.value))}, ${pctWords(n(part.share))} din bani.`
    : items.length === 1 ? " Se vede aici, dar nu intră în scor: tiparul cere cel puțin două cazuri." : "";
  return { title, lede: rule + scored };
}

export function yearEndWords(years: readonly YearEnd[]): CaseWords {
  const sorted = [...years].sort((a, b) => b.share - a.share);
  const top = sorted[0];
  if (!top) return { title: "Mulți bani contractați în decembrie", lede: null };
  const title = `În ${top.year}, ${pctWords(top.share)} din banii achizițiilor directe au fost contractați în decembrie.`;
  const rest = sorted.slice(1).map((y) => `${y.year}: ${pctWords(y.share)}`);
  const lede = `${formatRon(top.december)} din ${formatRon(top.total)}.`
    + (top.reference != null ? ` La instituțiile de același tip, pragul (percentila 95) e ${pctWords(top.reference)}.` : "")
    + (rest.length ? ` Și ${rest.join(", ")}.` : "");
  return { title, lede };
}

export function partnerWords(code: "da_concentration" | "da_dependence", entityName: string, partnerName: string | null, s: PartnerShare, partnerTotal: number, dates: readonly (string | null)[]): CaseWords {
  const partner = cleanName(partnerName) || (code === "da_dependence" ? "o singură instituție" : "o singură firmă");
  const when = datesWords(dates);
  if (code === "da_dependence") {
    const title = `${pctWords(s.share)} din ce vinde ${cleanName(entityName)} prin achiziții directe vine de la o singură instituție: ${partner}.`;
    const lede = `${countWords(s.count ?? dates.length, "achiziție directă", "achiziții directe")}${when ? `, ${when}` : ""}, ${formatRon(partnerTotal)}.`
      + (s.reverse != null ? ` Pentru ${partner}, firma e ${pctWords(s.reverse)} din ce cumpără direct.` : "");
    return { title, lede };
  }
  const title = `${pctWords(s.share)} din valoarea achizițiilor directe ale instituției e la o singură firmă: ${partner}.`;
  const lede = `${countWords(s.count ?? dates.length, "achiziție directă", "achiziții directe")}${when ? `, ${when}` : ""}, ${formatRon(partnerTotal)}.`
    + (s.adjusted != null ? ` Fără cea mai mare achiziție a ei, tot ${pctWords(s.adjusted)}.` : "")
    + (s.partners != null ? ` ${countWords(s.partners, "furnizor", "furnizori")} în date.` : "");
  return { title, lede };
}

export function capacityWords(c: Capacity): CaseWords {
  const got = `a contractat prin achiziții directe ${formatRon(c.daValue)}`;
  const title = c.zeroStaff ? `În ${c.year}, firma ${got} fără să aibă angajați.`
    : c.turnover != null && c.turnover > 0 && c.ratio != null ? `În ${c.year}, firma ${got}, de ${ratioWords(c.ratio).replace("×", "")} ori cifra ei de afaceri.`
    : `În ${c.year}, firma ${got}, cu o cifră de afaceri ${c.implausible ? "nerealistă" : "nepublicată"} în bilanț.`;
  const sheet = c.turnoverYear ? `Bilanțul din ${c.turnoverYear}: cifră de afaceri ${c.turnover == null ? "nepublicată" : formatRon(c.turnover)}, ${c.employees == null ? "angajați nepublicați" : countWords(c.employees, "angajat", "angajați")}.` : null;
  return { title, lede: sheet };
}

/** What one case of a pattern is called in its tab ("5 grupuri", "16 sume", "3 achiziții"). */
export function caseUnitWords(code: string, count: number): string {
  switch (code) {
    case "da_split": return countWords(count, "grup", "grupuri");
    case "da_round": return countWords(count, "sumă", "sume");
    case "da_above_ceiling": return countWords(count, "achiziție", "achiziții");
    case "da_year_end": case "da_capacity": case "fin_tiny_staff": return countWords(count, "an", "ani");
    case "award_no_competition": case "award_single_bid": case "award_calloffs_over_ceiling": return countWords(count, "procedură", "proceduri");
    case "net_shared_admin": return countWords(count, "legătură", "legături");
    default: return countWords(count, "caz", "cazuri");
  }
}
