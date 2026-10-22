import { cleanName, formatRon } from "./format";
import { consortiumRankingNote } from "./consortium";
import { roCount } from "./ro-count";

/**
 * "Pe scurt" on an entity page: one to three plain sentences and two short bar
 * lists, composed only from numbers the page already shows (the KPI total and
 * counts, the partner list) plus the same selection grouped by CPV division.
 * Pure and client-safe; the page supplies the data.
 */

export interface SummaryDivision { code: string | null; name: string | null; valueExact: string; n: number }
export interface SummaryPartner { partnerId: string; partnerName: string | null; totalRon: number; pct: number; nConsortium: number }

export interface SummaryInput {
  role: "authority" | "supplier";
  /** Same exact total as the "Valoare înregistrată" KPI. */
  totalExact: string;
  nDa: number;
  /** Distinct procedure contracts, as in the KPI. */
  nContracts: number;
  dateFrom: string | null;
  dateTo: string | null;
  divisions: readonly SummaryDivision[];
  /** Distinct consortium contracts in the selection. */
  nConsortium: number;
  /** First page of the partner list, largest first. */
  partners: readonly SummaryPartner[];
}

export type Segment = string | { text: string; href?: string; strong?: boolean };

export interface SummaryBar {
  key: string;
  label: string;
  href?: string;
  valueLabel: string;
  /** 0–1 share of the entity total (bar width). */
  share: number;
  shareLabel: string;
  /** Tooltip text when the value includes consortium shares. */
  consortium?: string;
}

export interface EntitySummary {
  sentences: Segment[][];
  subjectsTitle: string;
  subjects: SummaryBar[];
  partnersTitle: string;
  partners: SummaryBar[];
}

/** Official CPV names use cedilla letters (ş, ţ); show the Romanian comma forms. */
export function readableCpvName(name: string): string {
  return name.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț").trim();
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLocaleLowerCase("ro-RO") + s.slice(1) : s;
}

/** "21%"; "<1%" / ">99%" when rounding would hide that a part is missing or present. */
export function shareLabel(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  const pct = Math.round(share * 100);
  if (pct === 0) return "<1%";
  if (pct >= 100 && share < 1) return ">99%";
  return `${Math.min(pct, 100)}%`;
}

export function divisionLabel(d: SummaryDivision): string {
  if (d.code == null) return "Fără cod CPV";
  return d.name ? readableCpvName(d.name) : `Diviziunea CPV ${d.code}`;
}

function yearsPhrase(from: string | null, to: string | null): string | null {
  const y0 = from?.slice(0, 4), y1 = to?.slice(0, 4);
  if (!y0 || !y1 || !/^\d{4}$/.test(y0) || !/^\d{4}$/.test(y1)) return null;
  return y0 === y1 ? `în ${y0}` : `între ${y0} și ${y1}`;
}

function channelsPhrase(nDa: number, nContracts: number): string {
  const da = roCount(nDa, "o achiziție directă", "achiziții directe");
  const ct = roCount(nContracts, "un contract prin procedură", "contracte prin proceduri");
  if (nDa > 0 && nContracts > 0) return `${da} și ${ct}`;
  return nDa > 0 ? da : ct;
}

/** "prin un" stays, but "din un contract" becomes "dintr-un contract". */
function withPreposition(prep: "prin" | "din", phrase: string): string {
  return prep === "din" && /^(un|o) /.test(phrase) ? `dintr-${phrase}` : `${prep} ${phrase}`;
}

export function composeEntitySummary(input: SummaryInput): EntitySummary | null {
  const total = Number(input.totalExact);
  if (!Number.isFinite(total) || total <= 0 || input.nDa + input.nContracts === 0) return null;
  const isAuth = input.role === "authority";
  const sentences: Segment[][] = [];

  const years = yearsPhrase(input.dateFrom, input.dateTo);
  sentences.push([
    isAuth ? "A atribuit " : "A câștigat ",
    { text: formatRon(input.totalExact), strong: true },
    " (valoare înregistrată, nu plăți) ",
    withPreposition(isAuth ? "prin" : "din", channelsPhrase(input.nDa, input.nContracts)),
    years ? `, ${years}.` : ".",
  ]);

  const top = input.partners[0];
  const topDivision = input.divisions.find((d) => d.code != null);
  const second: Segment[] = [];
  if (top && top.partnerId !== "0" && top.totalRon > 0) {
    second.push(isAuth ? "Cel mai mare furnizor este " : "Cel mai mare client este ",
      { text: cleanName(top.partnerName), href: `/entitati/${top.partnerId}` },
      `, cu ${shareLabel(top.pct)} din valoare${top.nConsortium > 0 ? " (inclusiv părți din contracte în consorțiu)" : ""}.`);
  }
  if (topDivision) {
    const share = Number(topDivision.valueExact) / total;
    // "Cea mai mare parte" only for a real majority of the value.
    const lead = share > 0.5 ? "Cea mai mare parte din valoare privește " : "Cel mai mare domeniu: ";
    second.push(`${second.length > 0 ? " " : ""}${lead}${lowerFirst(divisionLabel(topDivision))} (${shareLabel(share)}).`);
  }
  if (second.length > 0) sentences.push(second);

  if (input.nConsortium > 0) {
    const n = input.nConsortium;
    sentences.push([isAuth
      ? n === 1
        ? "Un contract a fost atribuit unui consorțiu: fiecare membru apare cu o parte egală estimată din valoare, iar suma nu se adună de mai multe ori."
        : `${roCount(n, "un contract", "contracte")} au fost atribuite unor consorții: fiecare membru apare cu o parte egală estimată din valoare, iar suma nu se adună de mai multe ori.`
      : n === 1
        ? "Un contract a fost câștigat în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri)."
        : `${roCount(n, "un contract", "contracte")} au fost câștigate în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri).`]);
  }

  const subjects: SummaryBar[] = input.divisions.slice(0, 3).map((d) => {
    const share = Number(d.valueExact) / total;
    return { key: d.code ?? "none", label: divisionLabel(d), valueLabel: formatRon(d.valueExact), share, shareLabel: shareLabel(share) };
  });
  const partners: SummaryBar[] = input.partners.slice(0, 3).map((p) => ({
    key: p.partnerId,
    label: p.partnerId === "0" ? "Partener neidentificat" : p.partnerName ? cleanName(p.partnerName) : `Entitate #${p.partnerId}`,
    ...(p.partnerId !== "0" ? { href: `/entitati/${p.partnerId}` } : {}),
    valueLabel: formatRon(p.totalRon),
    share: p.pct,
    shareLabel: shareLabel(p.pct),
    ...(p.nConsortium > 0 ? { consortium: consortiumRankingNote(p.nConsortium) } : {}),
  }));

  return {
    sentences,
    subjectsTitle: isAuth ? "Ce a atribuit" : "Ce a câștigat",
    subjects,
    partnersTitle: isAuth ? "Cui a atribuit" : "Cine i-a atribuit",
    partners,
  };
}
