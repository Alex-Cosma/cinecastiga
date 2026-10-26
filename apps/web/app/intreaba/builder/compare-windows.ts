import { formatRon } from "../../../lib/format";
import { formatShare } from "../../../lib/ask/answer-text";
import {
  commonPeriod, GENERAL_NOTE_SHARE, olderRecords, olderRecordsDetail, olderRecordsTip, pairName,
  type ComparePeersResult, type PairResult, type PairShares,
} from "../../../lib/ask/compare-shared";
import { readableCpvName } from "../../../lib/entity-summary";
import { COUNTIES } from "../../../lib/counties";
import { GLOSSARY } from "../../../lib/glossary";
import { KIND_WORDS, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { CoveragePeriods } from "../../../lib/ask/months-window";
import type { KitRestRow } from "./kit-types";
import { periodPresets, type ChoiceOption, type CoverageSpan, type PeriodPreset } from "./window-model";

/*
 * F4, the comparison's windows (plan §4.6, final compare §3.1–§3.6, kit §6
 * compare): their rows from the pair's facts (part=pair, use-pair.ts), pure.
 * - "În ce perioadă?": "Toți anii" (with the records before 2018), "Perioada
 *   comună" only when it changes at least 5% of one's value, the last three
 *   complete years, the last complete year;
 * - "Ce s-a cumpărat?": the group "Cumpără amândouă" / "Vând amândouă";
 * - "Cine a cumpărat?" between firms: each kind's and each county's share of
 *   both, „Alte instituții” and „Județ necunoscut” as rest rows;
 * - "Cu cine comparăm?": the suggestions of the chosen role.
 */

/** The names the pair's words use ("Cluj-Napoca", "PORR CONSTRUCT"): the sentence's entities, short. */
export function pairNames(spec: QuestionSpec): { a: string; b: string } {
  const f = spec.filters;
  const a = String((f.authorityId || f.authorityName ? f.authorityName : f.supplierName) ?? "A");
  return { a: pairName(a), b: pairName(String(f.compareWith ?? "B")) };
}

/**
 * The presets of a comparison's period (kit §6 compare 9): "Toți anii · apr.
 * 2018 – 25 sept. 2026" (+ "+17 mai vechi"), "Perioada comună · 2021–2025"
 * when the pair's years differ enough (commonPeriod), "Ultimii 3 ani compleți",
 * the last complete year; "Alege anii sau lunile…" is the picker's own.
 */
export function comparePeriodPresets(spec: QuestionSpec, span: CoverageSpan | null, year: number, periods: CoveragePeriods | null, pair: PairResult | null):
  { presets: PeriodPreset[]; value: string | null } {
  const base = periodPresets(spec, span, year, periods);
  const pick = (value: string) => base.presets.find((p) => p.value === value);
  const all = pick("all"), three = pick("three");
  // The last complete year: the previous one while the current year runs, else the current one.
  const running = Boolean(span?.to && !span.to.endsWith("-12-31"));
  const last = running ? pick("previous") : pick("current");
  const older = pair ? olderRecordsDetail(olderRecords(pair.years)) : null;
  const common = pair ? commonPeriod(pair.years, pairNames(spec)) : null;
  const presets: PeriodPreset[] = [
    ...(all ? [{ ...all, ...(older ? { detail: [all.detail, older].filter(Boolean).join(" · ") } : {}) }] : []),
    ...(common ? [{ value: "common", label: "Perioada comună", detail: `${common.from}–${common.to} · ${common.detail}`, period: { yearFrom: common.from, yearTo: common.to } }] : []),
    ...(three ? [three] : []),
    ...(last ? [last] : []),
  ];
  const f = spec.filters;
  const same = (p: PeriodPreset) => p.period === undefined
    ? !f.yearFrom && !f.yearTo && !f.monthFrom && !f.monthTo
    : Number(f.yearFrom) === p.period.yearFrom && Number(f.yearTo) === p.period.yearTo && !f.monthFrom && !f.monthTo;
  return { presets, value: presets.find(same)?.value ?? null };
}

/** The (?) of a comparison's period (final §3.1): what "Perioada comună" is, and the records before 2018 where there are some. */
export function comparePeriodTip(spec: QuestionSpec, pair: PairResult | null): { title: string; text: string } {
  const older = pair ? olderRecordsTip(olderRecords(pair.years), pairNames(spec)) : null;
  return { title: "Perioada comună", text: [GLOSSARY["perioada-comuna"].text, older].filter(Boolean).join(" ") };
}

/** Two values as the pair's bars: each against the larger of the two (0–1), with its words. */
const bars = (a: number, b: number, words: (v: number) => string): NonNullable<ChoiceOption["pair"]> => {
  const max = Math.max(a, b, 1);
  return { a: a / max, b: b / max, aText: words(a), bText: words(b) };
};

/**
 * "Cumpără amândouă" / "Vând amândouă" (final §3.2, kit §6 compare 7): the CPV
 * groups both have, by the smaller value, at most six, each with its catalogue
 * name (ș and ț), its code and the two values.
 */
export function pairDomainOptions(pair: PairResult | null): ChoiceOption[] {
  if (!pair) return [];
  return pair.domains.map((d) => ({
    value: `cpv:${d.code}`, label: d.name ? readableCpvName(d.name) : `CPV ${d.code}`, detail: `CPV ${d.code}`,
    pair: bars(d.a, d.b, (v) => formatRon(v).replace(/ lei$/, "")),
    choice: { filter: "cpvTerm", value: d.code },
  }));
}
/** The heading of the group: what both of them buy (institutions) or sell (firms). */
export const pairDomainGroup = (spec: QuestionSpec): string => spec.filters.authorityId || spec.filters.authorityName ? "Cumpără amândouă" : "Vând amândouă";

/** "Pe coduri generale: 12% · 22% din valoare" (final §3.2), when either has at least 10% of its value there. */
export function generalCodesNote(pair: PairResult | null): string | null {
  if (!pair) return null;
  const { a, b, totalA, totalB } = pair.general;
  const sa = totalA > 0 ? a / totalA : 0, sb = totalB > 0 ? b / totalB : 0;
  if (Math.max(sa, sb) < GENERAL_NOTE_SHARE) return null;
  return `Pe coduri generale: ${formatShare(sa)} · ${formatShare(sb)} din valoare`;
}

const shareWords = (total: number) => (v: number) => total > 0 ? formatShare(v / total) : "—";

/** A client window's options with each firm's share (final §3.5): `options` are the window's own (the kinds, the first row too). */
export function withPairShares(options: readonly ChoiceOption[], shares: PairShares | null, valueOf: (option: ChoiceOption) => string | null): ChoiceOption[] {
  if (!shares) return [...options];
  return options.map((option) => {
    const value = valueOf(option);
    if (value === null) return option;
    const found = shares.options.find((o) => o.value === value);
    if (!found) return option;
    const pair = { a: shares.total.a > 0 ? found.a / shares.total.a : 0, b: shares.total.b > 0 ? found.b / shares.total.b : 0 };
    const empty = found.a === 0 && found.b === 0;
    return {
      ...option, pair: { ...pair, aText: shareWords(shares.total.a)(found.a), bText: shareWords(shares.total.b)(found.b) },
      ...(empty && !option.disabled ? { disabled: "Niciuna nu are clienți de acest tip." } : {}),
    };
  });
}

/** A client window's rest row, „Alte instituții” or „Județ necunoscut”, with both shares ("58,2% / 75,7%"). */
export function pairRest(label: string, shares: PairShares | null): KitRestRow[] {
  if (!shares) return [{ label }];
  const words = `${shareWords(shares.total.a)(shares.rest.a)} / ${shareWords(shares.total.b)(shares.rest.b)}`;
  return [{ label, count: words }];
}

/**
 * "Clienți din" (final §3.5): the counties with clients of either firm, by
 * their combined value, each with both shares; then the counties with none,
 * disabled with the reason (R1). Before the facts arrive: every county.
 */
export function pairCountyOptions(shares: PairShares | null): ChoiceOption[] {
  const option = (county: string): ChoiceOption => ({ value: `county:${county}`, label: /^bucure/i.test(county) ? "București" : `Județul ${county}`, choice: { filter: "county", value: county } });
  if (!shares) return COUNTIES.map(option);
  const known = new Set(shares.options.map((o) => o.value));
  const counted = withPairShares(shares.options.map((o) => option(o.value)), shares, (o) => String(o.choice.value));
  const none = COUNTIES.filter((county) => !known.has(county)).map((county) => ({ ...option(county), disabled: "Niciuna nu are clienți aici." }));
  return [...counted, ...none];
}

/** A kind's words in the client window: "Spitale", "Primării de comună" (kit §4 Tipurile). */
export const kindLabel = (kind: string): string => { const bare = KIND_WORDS[kind]?.bare ?? kind; return bare.charAt(0).toUpperCase() + bare.slice(1); };

/** The suggestions as search results above "Cu cine comparăm?"'s field: the group, each row's basis. */
export function peerResults(peers: ComparePeersResult | null, focal: { id?: number | undefined; compareWithId?: number | undefined }): { id: string; name: string; detail: string; group: string; choices: [{ filter: "compareWith"; value: { name: string; id: number } }] }[] {
  if (!peers?.label) return [];
  return peers.peers.filter((p) => p.id !== focal.id).map((p) => ({
    id: `peer:${p.id}`, name: p.name, detail: [p.county, p.detail].filter(Boolean).join(" · "), group: peers.label!,
    choices: [{ filter: "compareWith", value: { name: p.name, id: p.id } }],
  }));
}
