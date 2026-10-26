"use client";

import { useState } from "react";
import Link from "next/link";
import type { PartialYear } from "@/lib/ask/compile";
import type { EvidenceFilters, EvidenceScope } from "@/lib/ask/evidence";
import type { AskSpec } from "@/lib/ask/spec";
import type { SeriesPoint } from "@/lib/ask/series";
import { countWords } from "@/lib/ask/answer-text";
import { askLink } from "@/lib/ask/source-spec";
import { monthsLabel } from "@/lib/ask/months-window";
import { formatInt, formatRon, formatRonFull, cleanName } from "@/lib/format";
import { readableCpvName } from "@/lib/entity-summary";
import { useTip } from "./blocks";
import DetailCard from "./answer/DetailCard";
import KitLink, { recordsWords } from "./answer/KitLink";
import { RECORDED_VALUE } from "./answer/TotalLine";
import { useAnswerFact } from "./answer/use-answer-fact";
import HelpTip from "./builder/HelpTip";
import { CHART_FIRST_YEAR, seriesLabels } from "./series-labels";
import {
  aboveTotal, aboveWords, barFacts, barKey, barLinks, barName, barParts, barSources, largestWords, monthTick, partSources, partTone, seriesBars,
  type SeriesData,
} from "./series-answer";

/*
 * "Cum evoluează…" (plan §4.3; final timeseries §3.7–§3.10, §4): the bars,
 * year by year from 2018 or month by month, split by channel or domain, the
 * marker of the incomplete last year on the bar before it, and the sheet of a
 * bar (component 19) with its facts and the answers about its period. The bar
 * facts (each bar's largest record, the contracts above the 1 bn lei cap) are
 * asked once the bars are drawn (use-answer-fact.ts) and never delay them.
 */

export type Sources = (spec: AskSpec, scope?: EvidenceScope, title?: string, opts?: { filters?: EvidenceFilters; sort?: "value" }) => void;

/** The cap of the DA analysis moved on 10.09.2022: its mark under 2022 where the direct acquisitions are drawn (final §4). */
const DA_CAP_YEAR = 2022;
const DA_CAP_TIP = { title: "Plafonul achizițiilor directe", text: "Din 10.09.2022 plafonul legal e mai mare (270.120 lei produse și servicii, 900.400 lei lucrări); o mutare între directe și proceduri poate veni din lege." };
const YEAR_TIP = { title: "Lei ai fiecărui an", text: "Neajustați la inflație. Un contract pe mai mulți ani intră întreg în anul atribuirii." };
const ABOVE_TIP = { title: "Contracte peste 1 mld. lei", text: "Filtru al aplicației, nu dovada unei erori. Le listăm separat; valoarea lor nu intră în bare." };

export default function SeriesAnswer({ data, spec, partial, onSources }: { data: SeriesData; spec: AskSpec; partial: readonly PartialYear[]; onSources: Sources }) {
  const t = useTip();
  const facts = useAnswerFact(spec, "bars");
  const [picked, setPicked] = useState<string | null>(null);
  const asCount = spec.measure === "count";
  const metric = (p: { value: number; count: number }) => (asCount ? p.count : p.value);
  const display = (p: { value: number; count: number }) => (asCount ? formatInt(p.count) : formatRon(p.value));
  if (data.series.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  const monthly = data.grain === "month";
  const { bars, before } = seriesBars(data);
  const f = spec.filters;
  // One year with data, year by year, is one number, not a chart of one bar (final timeseries §5.4).
  if (!monthly && bars.length === 1 && !before) {
    const only = bars[0]!;
    const months = askLink({ ...spec, timeseries: { ...spec.timeseries, grain: "month" }, filters: { ...f, yearFrom: only.year, yearTo: only.year } });
    return (
      <div className="ask-bigstat ask-ts-one">
        <div className="v">{display(only)}</div>
        <div className="d">{only.year} · {formatRonFull(only.value)} · {countWords(only.count, "înregistrare", "înregistrări")}</div>
        <div className="qb qb-relax">
          {!spec.timeseries?.months && !f.monthFrom && !f.monthTo && <KitLink className="qb-relax-link" link={{ label: "Vezi lună de lună", glyph: "›", href: months }} />}
          {(f.yearFrom || f.yearTo) && <KitLink className="qb-relax-link" link={{ label: "Toți anii", glyph: "›", href: askLink(withoutPeriod(spec)) }} />}
        </div>
      </div>
    );
  }
  const drawn = bars.filter((p): p is SeriesPoint => !("empty" in p));
  const max = Math.max(...drawn.map(metric), 1);
  const peak = drawn.reduce((a, b) => (metric(b) > metric(a) ? b : a));
  const labels = seriesLabels(bars.length, bars.indexOf(peak));
  const off = (on: boolean, className: string) => (on ? "" : ` ${className}`);
  const split = Boolean(data.parts?.length);
  const daMark = !monthly && (spec.dataset === "da" || spec.timeseries?.split === "channel");
  const ready = facts.status === "ready" ? facts.value : null;
  const above = aboveTotal(ready, drawn);
  const ref = !data.months && data.ref ? data.ref : null;
  const card = picked ? drawn.find((p) => barKey(p) === picked) ?? null : null;
  const yearLabel = (p: { year: number; month?: number }, mark: string) => monthly
    ? <span className="ts-m">{monthTick(p)}{mark}</span>
    : <><span className="ts-y">{p.year}{mark}</span><span className="ts-y-short" aria-hidden="true">’{String(p.year).slice(2)}{mark}</span></>;
  return (
    <div className={`ask-ts-wrap${card ? " has-card" : ""}`}>
      {t.el}
      {split && <ul className="ts-legend" aria-label="Părțile barelor">
        {[...data.parts!].reverse().map((part) => <li key={part.key}>
          <i className={`ts-sw ts-sw--${partTone(data, part)}`} aria-hidden="true" />{part.label}
          {part.name && <HelpTip tip={{ title: part.label, text: `${readableCpvName(part.name)} (CPV ${part.code}). Diviziunea declarată de cumpărător; un salt poate veni dintr-un singur contract.` }} />}
        </li>)}
      </ul>}
      <div className="ts-row">
        <div className={`ask-ts${monthly ? " ask-ts--months" : ""}`}>
          {bars.map((p, i) => {
            const key = barKey(p);
            const part = !monthly ? partial.find((x) => x.year === p.year) : undefined;
            if ("empty" in p)
              return (
                <div key={key} className="col empty" role="img" aria-label={`${barName(p)}: nicio înregistrare`}>
                  <div className="cv ts-off" aria-hidden="true">0</div>
                  <div className="bar" style={{ height: "0%" }} />
                  <div className={`cl${off(labels.yearPhone.has(i), "ts-off-sm")}`}>{yearLabel(p, "")}</div>
                </div>
              );
            const on = picked === key;
            const isRef = ref && !monthly && p.year === ref.year && p.value > 0;
            return (
              <button
                type="button"
                key={key}
                className={`col${part ? " partial" : ""}${on ? " is-picked" : ""}`}
                aria-pressed={on}
                aria-label={`${barName(p)}: ${asCount ? countWords(p.count, "înregistrare", "înregistrări") : formatRonFull(p.value)}${part ? ", incomplet" : ""}`}
                onClick={() => setPicked(on ? null : key)}
                {...t.bind(
                  barName(p),
                  asCount ? countWords(p.count, "înregistrare", "înregistrări") : formatRonFull(p.value),
                  `${countWords(p.count, "înregistrare", "înregistrări")}${part ? ` · ${part.provisional ? "date parțiale sau provizorii" : "an acoperit parțial"}` : ""} · click → detaliul barei`,
                )}
              >
                <div className={`cv${off(labels.value.has(i), "ts-off")}${off(labels.valuePhone.has(i), "ts-off-sm")}`}>{display(p)}</div>
                <div className={!split && p === peak ? "bar peak" : "bar"} style={{ height: `${Math.max(2, (metric(p) / max) * 100)}%` }}>
                  {split && barParts(data, p).map(({ part: piece, value, count }) => {
                    const amount = asCount ? count : value;
                    return amount > 0 ? <i key={piece.key} className={`ts-seg ts-sw--${partTone(data, piece)}`} style={{ height: `${(amount / Math.max(metric(p), 1)) * 100}%` }} /> : null;
                  })}
                  {isRef && <i className="ts-ref" style={{ bottom: `${Math.min(100, (metric(ref) / Math.max(metric(p), 1)) * 100)}%` }} aria-hidden="true" />}
                </div>
                <div className={`cl${off(monthly ? bars.length <= 6 || p.month === 1 : labels.yearPhone.has(i), "ts-off-sm")}${off(!monthly || bars.length <= 12 || p.month === 1 || p.month === 7, "ts-off")}`}>{yearLabel(p, part ? "*" : "")}{daMark && p.year === DA_CAP_YEAR && <span className="ts-cap" aria-hidden="true">▴</span>}</div>
              </button>
            );
          })}
        </div>
        {/* In the kit's scope (.qb): its buttons and type, as the trend's card. */}
        {card && <div className="qb ts-card"><BarCard data={data} spec={spec} point={card} partial={partial} facts={facts} onSources={onSources} onClose={() => setPicked(null)} /></div>}
      </div>
      {/* One-line notes, the details in their (?) (final timeseries §4; owner: terse copy). */}
      <div className="qb ask-ts-notes">
        {ref && <p className="ask-fine qb-tipwrap"><i className="ts-ref-key" aria-hidden="true" /> {monthsLabel({ from: ref.months[0], to: ref.months[1] })} {ref.year}, reper pentru {ref.year + 1}{" "}
          <HelpTip tip={{ title: "Aceleași luni", text: `Linia de pe bara lui ${ref.year} arată ${monthsLabel({ from: ref.months[0], to: ref.months[1] })}, lunile complete din ${ref.year + 1}. „Aceleași luni” compară toți anii pe ele.` }} /></p>}
        {before && (
          <p className="ask-fine">
            {countWords(before.count, "înregistrare", "înregistrări")} datate {before.from === before.to ? before.from : `${before.from}–${before.to}`} ({formatRon(before.value)}) nu apar pe axă.{" "}
            <KitLink className="qb-rec" link={{ label: "Vezi-le", glyph: "→", onClick: () => onSources(spec, { years: before.years }, `${before.from}–${before.to} · înregistrările dinainte de ${CHART_FIRST_YEAR}`) }} />
          </p>
        )}
        {partial.filter((x) => drawn.some((p) => p.year === x.year)).length > 0 && (() => {
          const shown = partial.filter((x) => drawn.some((p) => p.year === x.year));
          return <p className="ask-fine ask-partial-note qb-tipwrap">
            * {[...new Set(shown.map((x) => x.year))].join(", ").replace(/, (\d+)$/, " și $1")} {shown.length === 1 ? "e incomplet" : "sunt incomplete"}{" "}
            <HelpTip tip={{ title: shown.length === 1 ? "An incomplet" : "Ani incompleți", text: `${shown.map((x) => `${x.year}: ${x.note}`).join("; ")}. Nu se compară direct cu un an întreg.` }} />
          </p>;
        })()}
        {above.n > 0 && <p className="ask-fine qb-tipwrap">{countWords(above.n, "contract", "contracte")} peste 1 mld. lei nu intră în bare <HelpTip tip={ABOVE_TIP} />{" "}
          <KitLink className="qb-rec" link={{ label: "Vezi-le", glyph: "›", onClick: () => setPicked(above.first) }} /></p>}
        {daMark && <p className="ask-fine qb-tipwrap">▴ 10.09.2022: plafon DA mai mare <HelpTip tip={DA_CAP_TIP} /></p>}
        {(f.adminPersonKey || f.adminName) && <p className="ask-fine">Administratorul e cel de azi; în anii trecuți putea fi altul.</p>}
        <p className="ask-fine qb-tipwrap">{RECORDED_VALUE.text} <HelpTip tip={RECORDED_VALUE.tip} /> · lei ai fiecărui an <HelpTip tip={YEAR_TIP} /></p>
      </div>
    </div>
  );
}

/** The sheet of a bar (component 19, final §3.10): its facts and the answers about its period. */
function BarCard({ data, spec, point, partial, facts, onSources, onClose }: {
  data: SeriesData; spec: AskSpec; point: SeriesPoint; partial: readonly PartialYear[];
  facts: ReturnType<typeof useAnswerFact<"bars">>; onSources: Sources; onClose: () => void;
}) {
  const name = barName(point), key = barKey(point);
  const { facts: rows, lines } = barFacts(data, point, partial);
  const records = barSources(spec, point);
  const ready = facts.status === "ready" ? facts.value : null;
  const largest = ready?.max?.[key];
  const above = ready?.above?.[key];
  const links = barLinks(spec, data, point, partial);
  const unit = point.month ? "lunii" : "anului";
  return <DetailCard
    title={name}
    {...(partial.some((p) => p.year === point.year) && !point.month ? { meta: "An incomplet: nu se compară direct cu un an întreg." } : {})}
    facts={rows}
    lines={[
      ...lines.map((text) => ({ text })),
      ...(data.parts ? barParts(data, point).filter((x) => x.count > 0).map(({ part }) => ({
        text: `Înregistrările părții „${part.label}”`,
        records: { label: recordsWords(point.parts?.[part.key]?.count ?? 0), onClick: () => {
          const { scope, filters } = partSources(data, part);
          onSources(records.spec, { ...records.scope, ...scope }, `${name} · ${part.label}`, filters ? { filters } : {});
        } },
      })) : []),
      ...(facts.status === "loading" ? [{ text: "Cea mai mare înregistrare: …" }] : largest ? [{
        text: largestWords(point, largest),
        records: { label: "vezi", glyph: "›" as const, onClick: () => onSources(records.spec, records.scope, `${name} · după valoare`, { sort: "value" }) },
      }] : []),
      ...(above?.n ? [{ text: aboveWords(above.n), tag: { text: "peste plafon", tone: "caveat" as const, tip: ABOVE_TIP } }] : []),
    ]}
    actions={[
      { label: `Vezi înregistrările ${unit}`, glyph: "→", onClick: () => onSources(records.spec, records.scope, `${name} · înregistrările ${unit}`) },
      ...links.map((link) => ({ label: link.label, glyph: "›" as const, href: askLink(link.spec) })),
    ]}
    onClose={onClose}
  >
    {above?.rows.length ? <ul className="ts-above">{above.rows.map((row) => <li key={row.natId}>
      <Link href={`/contracte/${row.natId}`} title={row.title ? cleanName(row.title) : undefined}>{row.title ? cleanName(row.title) : `Contractul ${row.natId}`}</Link> <span className="qb-num">{formatRon(row.value)}</span>
    </li>)}</ul> : null}
  </DetailCard>;
}

/** The same question without its years ("Toți anii", the first row of "Când?"). */
function withoutPeriod(spec: AskSpec): AskSpec {
  const filters = { ...spec.filters };
  for (const key of ["yearFrom", "yearTo", "monthFrom", "monthTo"] as const) delete filters[key];
  const { grain: _grain, ...options } = spec.timeseries ?? {};
  const next: AskSpec = { ...spec, filters };
  if (Object.keys(options).length) next.timeseries = options;
  else delete next.timeseries;
  return next;
}
