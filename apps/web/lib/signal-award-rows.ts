import { countWords } from "./ask/answer-text";
import { formatInt } from "./format";
import { noticeIsFrameworkOnly } from "./risk-presentation";

/*
 * A procedure signal's row on its case page (/entitati/{id}/semnale?tip=award_…; UX audit Z6-06, owner 16 November
 * 2026): what the notice bought as its title, the winners named (the page links them), then one line of facts. The
 * pattern's sentence is said once above the list, not on every row. Values are recorded, not payments.
 */

export interface AwardNoticeFacts { title: string | null; cpvName: string | null; ted: string[]; contracts: number }

const AWARD_LIST_NOTE: Record<string, string> = {
  award_single_bid: "Fiecare rând: un anunț cu cel puțin un lot cu o singură ofertă raportată în TED.",
  award_no_competition: "Fiecare rând: un anunț de atribuire prin negociere fără anunț prealabil.",
  award_calloffs_over_ceiling: "Fiecare rând: un acord-cadru cu comenzi declarate peste plafonul lui.",
};

/** The pattern's sentence, said once above its rows, and their order. */
export function awardListNote(code: string): string | null {
  const note = AWARD_LIST_NOTE[code];
  return note ? `${note} Ordonate după valoare.` : null;
}

const num = (evidence: Record<string, unknown>, key: string): number | null => {
  const raw = evidence[key];
  if (raw == null || raw === "" || !["string", "number"].includes(typeof raw)) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

/** „Diverse medicamente”: the notice's published title, else the name of its CPV, with a capital. */
export function awardRowTitle(notice: AwardNoticeFacts | null | undefined): string | null {
  const text = notice?.title ?? notice?.cpvName ?? null;
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

/**
 * The row's facts in one line: „87 de contracte cu o singură ofertă · primul contract în 2020 · TED 211771-2022”.
 * `period` is the signal's year; `evidence.period_source` says which date it is (lib/risk-presentation.ts).
 */
export function awardRowFacts(code: string, evidence: Record<string, unknown> | null, notice: AwardNoticeFacts | null | undefined, period: string | null): string {
  const e = evidence ?? {};
  const parts: string[] = [];
  if (code === "award_single_bid") {
    const n = num(e, "confirmed_contract_count") ?? (Array.isArray(e.contracts) ? e.contracts.length : null);
    if (n) parts.push(`${countWords(n, "contract", "contracte")} cu o singură ofertă`);
  } else if (code === "award_calloffs_over_ceiling") {
    const calloffs = num(e, "calloffs"), value = num(e, "value"), ceiling = num(e, "ceiling");
    const times = value !== null && ceiling ? `de ${(Math.round((value / ceiling) * 10) / 10).toFixed(1).replace(".", ",")} ori plafonul` : null;
    if (calloffs || times) parts.push([calloffs ? countWords(calloffs, "comandă", "comenzi") : null, times].filter(Boolean).join(", "));
    const repeats = num(e, "calloffs_repeating_ceiling") ?? 0;
    // Said as on the sources page (owner, 8 November 2026): most likely the ceiling typed into every call-off.
    if (repeats >= 2) parts.push(`${countWords(repeats, "comandă", "comenzi")} au exact suma plafonului, probabil o eroare de completare`);
    else if (repeats === 1) parts.push("o comandă are exact suma plafonului");
  } else if (notice?.contracts) {
    parts.push(countWords(notice.contracts, "contract", "contracte"));
  }
  if (period && /^\d{4}$/.test(period)) parts.push(e.period_source === "notice_version" ? `anunț preluat în ${period}` : `primul contract în ${period}`);
  const ted = notice?.ted ?? [];
  if (ted.length) parts.push(`TED ${ted[0]}${ted.length > 1 ? ` și încă ${formatInt(ted.length - 1)}` : ""}`);
  if (noticeIsFrameworkOnly(e)) parts.push("suma: plafonul acordului-cadru");
  return parts.join(" · ");
}
