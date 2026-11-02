"use client";

import { useState } from "react";
import EntityName from "../../components/EntityName";
import { formatInt, formatRon } from "../../lib/format";
import { countyMap, foldCounty } from "../../lib/map";
import { encodeSpec } from "../../lib/ask/permalink";
import { countWords, formatShare } from "../../lib/ask/answer-text";
import { exclusionBlocked } from "../../lib/ask/filters/exclusions";
import type { AskSpec, FirmSeat } from "../../lib/ask/spec";
import type { BlockData } from "../../lib/ask/compile";
import type { MapCountyFacts, MapFacts } from "../../lib/ask/map-facts";
import { useAnswerEvidence } from "./AnswerEvidence";
import DetailCard, { type CardFact, type CardLine } from "./answer/DetailCard";
import { recordsWords } from "./answer/KitLink";
import type { AnswerFact } from "./answer/use-answer-fact";
import HelpTip from "./builder/HelpTip";
import type { KitLink } from "./builder/kit-types";
import { countyMetrics, localNotes, mapFirm, metricWords, nationalMetric, type CountyMetric, type MapLensValue } from "./map-answer";

type MapData = Extract<BlockData, { block: "map" }>;
type CountyValue = MapData["counties"][number];
type MapUnknown = MapData["unknown"];

/** Five steps of the theme's map ramp (--map-0 … --map-4, light and dark in approved.css). */
const MAP_STEPS = 5;
/** The legend's (?) (final map §3.7, §6 Etapa 1). */
const LEGEND_TIP = { title: "Culorile hărții", text: "Cinci trepte egale ca număr de județe (cuantile), de la cele mai mici valori ale selecției la cele mai mari. Gri: nicio înregistrare. Hașurat: prea puține date pentru un procent." };
/** „Firme din județ” under the map (map final §3.9, §4). */
const SEAT_TIP = { title: "Sediul firmei", text: "Sediul social de azi (Registrul Comerțului; SEAP când lipsește), comparat cu județul instituției. Nu e locul lucrării; multe firme mari au sediul în București." };
/** The units of each lens, after the legend's ends. */
const LENS_UNIT: Record<MapLensValue, string> = { value: "lei", count: "înregistrări", value_per_capita: "lei/locuitor", seat: "la firme din județ", share: "cota firmei" };
const NO_FACTS: AnswerFact<MapFacts> = { status: "none" };

/** The county under the pointer: what the map shows there, in the answer's words. */
export function CountyTip({ label, value, count, national, asCount, lens, metric }: {
  label: string;
  value: number;
  count: number;
  national: number;
  asCount: boolean;
  /** F5: the lens beyond value and records, and the county's number on it. */
  lens?: MapLensValue;
  metric?: CountyMetric;
}) {
  // On a count the value is the number of records: said once, in words.
  const share = national > 0 ? `${formatShare(value / national)} din total` : null;
  const other = lens && lens !== "value" && lens !== "count" ? lens : null;
  return (
    <>
      <div className="t">{label}</div>
      {value > 0 ? (
        <>
          {other ? (
            <div className="v">{metric?.metric !== null && metric?.metric !== undefined ? `${metricWords(other, metric.metric)}${other === "seat" ? " la firme din județ" : ""}` : "—"}</div>
          ) : (
            <div className="v">{asCount ? countWords(value, "înregistrare", "înregistrări") : formatRon(value)}</div>
          )}
          {other && metric?.muted && <div className="s">{metric.muted}</div>}
          {asCount ? share && <div className="s">{share}</div> : (
            <div className="s">
              {other ? `${formatRon(value)} · ` : ""}{countWords(count, "înregistrare", "înregistrări")}
              {share && !other && ` · ${share}`}
            </div>
          )}
          <div className="s">click → fișa județului</div>
        </>
      ) : (
        <div className="s">nicio înregistrare pentru aceste filtre</div>
      )}
    </>
  );
}

/** The seat rows of the card (map final §3.9): label, class, the drawer's seat filter (none where no key holds it). */
const SEAT_ROWS: readonly { key: keyof NonNullable<MapCountyFacts["seat"]>; label: string; seat?: FirmSeat; indent?: boolean }[] = [
  { key: "same", label: "Firme din județ", seat: "same" },
  { key: "other", label: "Firme din alte județe", seat: "other" },
  { key: "bucuresti", label: "din care din București", indent: true },
  { key: "foreign", label: "Din străinătate", seat: "abroad" },
  { key: "unknown", label: "Sediu necunoscut" },
];

export default function MapBlock({
  counties,
  unknown,
  spec,
  local,
  facts = NO_FACTS,
  lens = (spec as AskSpec).measure === "count" ? "count" : "value",
}: {
  counties: CountyValue[];
  unknown: MapUnknown;
  spec: unknown;
  /** F5: the local administrations' map (populations, the councils its list lacks). */
  local?: MapData["local"];
  /** F5: the county facts (part `map`): the seat split, the largest buyer and record, the firm's share. */
  facts?: AnswerFact<MapFacts>;
  /** The lens drawn (map-answer.ts shownLens). */
  lens?: MapLensValue;
}) {
  const asked = spec as AskSpec;
  const asCount = lens === "count";
  const firm = mapFirm(asked);
  const ready = facts.status === "ready" ? facts.value : null;
  const display = (v: number) =>
    asCount ? formatInt(v) + " înreg." : formatRon(v);
  // county click → same filters, scoped to that county, drill rows opened
  const countyUrl = (label: string): string =>
    `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify({ county:label }))}`;

  // The answer's rows by the map's key; each county's number on the lens (map-answer.ts countyMetrics).
  const rowByKey = new Map<string, CountyValue>();
  for (const c of counties) rowByKey.set(foldCounty(c.county), c);
  const metrics = countyMetrics({ counties, ...(local ? { local } : {}) }, lens, ready);
  const metricOf = (key: string): CountyMetric => {
    const row = rowByKey.get(key);
    return row ? metrics.get(row.county) ?? { metric: null, muted: null } : { metric: null, muted: null };
  };
  const factsOf = (key: string): MapCountyFacts | undefined => { const row = rowByKey.get(key); return row ? ready?.counties[row.county] : undefined; };
  // Shares are of the whole selection, including records whose authority has
  // no known county and so are not on the map (audit F13).
  const unknownMeasure = asCount ? unknown.count : unknown.value;
  const national =
    counties.reduce((s, c) => s + (asCount ? c.count : c.value), 0) +
    unknownMeasure;
  const [tip, setTip] = useState<{ key: string; label: string; x: number; y: number } | null>(null);
  // Component 19, the county's card (plan §4.4, final map §3.11): a tap, a click or Enter opens it; the records are
  // its links, not the tap itself (a phone has no hover).
  const evidence = useAnswerEvidence();
  const [card, setCard] = useState<{ label: string; key: string } | null>(null);
  const blocked = exclusionBlocked(asked);
  const cardOf = (label: string, key: string) => {
    const row = rowByKey.get(key), value = row?.value ?? 0, count = row?.count ?? 0, f = factsOf(key), m = metricOf(key);
    const sources = (title: string, next: AskSpec = asked, sort?: "value"): KitLink => evidence
      ? { label: title, onClick: () => evidence.open(next, { county: row?.county ?? label }, `${label} · înregistrările județului`, sort ? { sort } : undefined) }
      : { label: title, href: countyUrl(label) };
    const cardFacts: CardFact[] = value > 0 ? [
      ...(asCount ? [] : [{ label: "Valoare", value: formatRon(value) }]),
      { label: "Înregistrări", value: formatInt(count) },
      ...(lens === "value_per_capita" && local?.population[row!.county] ? [
        { label: "Pe locuitor", value: m.metric !== null ? metricWords(lens, m.metric) : "—" },
        { label: "Populație", value: formatInt(local.population[row!.county]) },
      ] : []),
      ...(lens === "share" && f?.base ? [{ label: firm && asked.filters.adminName ? "Cota firmelor" : "Cota firmei", value: `${formatShare(value / f.base.value)} din ${formatRon(f.base.value)}` }] : []),
      ...(firm && f ? [{ label: "Cumpărători", value: formatInt(f.buyers) }] : []),
      ...(!firm && lens !== "share" && national > 0 ? [{ label: "Din selecție", value: formatShare((asCount ? count : value) / national) }] : []),
    ] : [];
    const lines: CardLine[] = [];
    if (value > 0 && m.muted && (lens === "seat" || lens === "share" || lens === "value_per_capita")) lines.push({ text: `Gri pe hartă: ${m.muted}` });
    if (value > 0 && f?.buyer && !firm) lines.push({ text: <>Cel mai mare cumpărător: <EntityName id={f.buyer.id} role="authority">{f.buyer.name}</EntityName> · {formatShare(f.buyer.value / f.value)}</> });
    if (value > 0 && f?.record) lines.push({
      text: `Cea mai mare înregistrare: ${formatRon(f.record.value)} · ${formatShare(f.record.value / f.value)}`,
      records: sources("Vezi în surse", asked, "value"),
    });
    if (value > 0 && lens === "seat" && f?.seat) for (const r of SEAT_ROWS) {
      const part = f.seat[r.key];
      const words = `${r.indent ? "  " : ""}${r.label}: ${formatRon(part.value)} · ${formatShare(f.value > 0 ? part.value / f.value : 0)}`;
      lines.push(r.seat && part.count > 0
        ? { text: words, records: sources(recordsWords(part.count), { ...asked, filters: { ...asked.filters, firmSeat: r.seat } }) }
        : { text: words });
    }
    const actions: KitLink[] = count > 0 ? [{ ...sources(count === 1 ? "Vezi înregistrarea" : `Vezi cele ${recordsWords(count)}`), glyph: "→" }] : [];
    // „Scoate din calcul” (map final §3.6, kit §5.13): the county's largest buyer, out of every county; not beside a firm.
    const excludable = !firm && f?.buyer && evidence?.exclude && !blocked;
    if (excludable) actions.push({ label: "Scoate cumpărătorul din calcul", onClick: () => evidence!.exclude!({ id: f!.buyer!.id, name: f!.buyer!.name, field: "authority" }, 0) });
    const meta = value > 0 ? (facts.status === "loading" ? "Se calculează cumpărătorul și înregistrarea…" : undefined) : "Nicio înregistrare pentru această întrebare.";
    return { label, value, count, facts: cardFacts, lines, actions, meta };
  };

  // Quantile classes over the counties with a number that is not grey.
  const values = countyMap.shapes
    .map((s) => metricOf(s.key))
    .filter((m) => m.metric !== null && m.metric > 0 && !m.muted)
    .map((m) => m.metric!)
    .sort((a, b) => a - b);
  const th: number[] = [];
  for (let i = 1; i < MAP_STEPS; i++) {
    th.push(
      values[
        Math.min(
          Math.floor((i / MAP_STEPS) * values.length),
          values.length - 1,
        )
      ] ?? 0,
    );
  }
  const bucket = (v: number) => {
    let b = 0;
    while (b < th.length && v > th[b]!) b++;
    return b;
  };
  const shapeClass = (key: string): string => {
    const m = metricOf(key);
    if (m.metric === null || m.metric <= 0) return "ask-county-none";
    return m.muted ? "ask-county-muted" : `ask-county-${bucket(m.metric)}`;
  };
  const ranked = countyMap.shapes
    .map((s) => ({ label: s.label, key: s.key, m: metricOf(s.key) }))
    .filter((r) => r.m.metric !== null && r.m.metric > 0)
    .sort((a, b) => Number(Boolean(a.m.muted)) - Number(Boolean(b.m.muted)) || b.m.metric! - a.m.metric!)
    .slice(0, 10);
  const sold = counties.filter((c) => c.count > 0).length;
  const country = lens === "value_per_capita" || lens === "seat" || lens === "share" ? nationalMetric({ counties, unknown, ...(local ? { local } : {}) }, lens, ready,
    Boolean(asked.filters.county) || asked.filters.uatSiruta != null) : null;
  const tipRow = tip ? rowByKey.get(tip.key) : undefined;

  return (
    <div className="ask-maplayout">
      <div className="ask-mapwrap">
        <svg
          viewBox={`0 0 ${countyMap.width} ${countyMap.height}`}
          className="ask-choropleth"
          role="img"
          aria-label="Hartă pe județe"
        >
          <defs>
            {/* Grey for a share on too few records (map final §3.9–§3.10): hatched, the theme's tokens. */}
            <pattern id="ask-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="ask-hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="6" className="ask-hatch-line" />
            </pattern>
          </defs>
          {countyMap.shapes.map((s) => {
            const m = metricOf(s.key);
            const move = (e: React.MouseEvent) => setTip({ key: s.key, label: s.label, x: e.clientX, y: e.clientY });
            const said = m.metric !== null && m.metric > 0
              ? (lens === "value" || lens === "count" ? display(m.metric) : metricWords(lens, m.metric)) + (m.muted ? " (date puține)" : "")
              : "nicio înregistrare";
            // Colours and outline are theme tokens (question-results.css), so both themes keep their contrast.
            return (
              <a
                key={s.key}
                href={countyUrl(s.label)}
                aria-label={`${s.label}: ${said}`}
                onClick={(event) => {
                  // A new tab keeps the link; otherwise the card (Enter on the focused county too).
                  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
                  event.preventDefault();
                  setTip(null);
                  setCard({ label: s.label, key: s.key });
                }}
              >
                <path
                  d={s.d}
                  className={`ask-county ${shapeClass(s.key)}${tip?.key === s.key || card?.key === s.key ? " hovered" : ""}`}
                  onMouseEnter={move}
                  onMouseMove={move}
                  onMouseLeave={() => setTip(null)}
                />
              </a>
            );
          })}
        </svg>
        <div className="ask-legend qb-tipwrap">
          <span>mai puțin</span>
          {Array.from({ length: MAP_STEPS }, (_, i) => (
            <span key={i} className={`sw ask-county-${i}`} />
          ))}
          <span>mai mult</span>
          {(lens === "seat" || lens === "share" || lens === "value_per_capita") && <span className="sw ask-county-muted" aria-label="date puține" />}
          <span className="qb"><HelpTip tip={LEGEND_TIP} /></span>
        </div>
        {card && (() => {
          const c = cardOf(card.label, card.key);
          return (
            <div className="qb ask-mapcard">
              <DetailCard
                title={c.label}
                {...(c.meta ? { meta: c.meta } : {})}
                facts={c.facts}
                lines={c.lines}
                actions={c.actions}
                onClose={() => setCard(null)}
              />
            </div>
          );
        })()}
        {country !== null && (
          <p className="ask-fine">Pe țară: {metricWords(lens, country)}{lens === "seat" ? " la firme din județ" : lens === "value_per_capita" ? " (populația rezidentă, RPL 2021)" : ""}</p>
        )}
        {lens === "seat" && (
          <p className="ask-fine qb-tipwrap-sm">București și Ilfov: firmele mari au sediul în capitală <span className="qb"><HelpTip tip={SEAT_TIP} /></span></p>
        )}
        {local && localNotes(local).map((note) => (
          <p key={note.text} className="ask-fine qb-tipwrap-sm">{note.text} <span className="qb"><HelpTip tip={{ title: "Primăriile și consiliile județene", text: note.tip }} /></span></p>
        ))}
        {unknown.count > 0 && national > 0 && (
          <p className="ask-fine">
            {asCount
              ? `${countWords(unknown.count, "înregistrare", "înregistrări")} (${formatShare(unknownMeasure / national)} din selecție)`
              : `${formatRon(unknown.value)} (${formatShare(unknownMeasure / national)} din selecție, ${countWords(unknown.count, "înregistrare", "înregistrări")})`}{" "}
            {asCount && unknown.count === 1 ? "are instituția fără județ cunoscut și nu apare" : "au instituția fără județ cunoscut și nu apar"} pe hartă · procentele sunt din totalul selecției
          </p>
        )}
        {tip && (
          <div
            className="ask-maptip"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
          >
            <CountyTip label={tip.label} value={tipRow?.value ?? 0} count={tipRow?.count ?? 0} national={national} asCount={asCount}
              lens={lens} metric={metricOf(tip.key)} />
          </div>
        )}
      </div>
      <div className="ask-mapside-wrap">
        {firm && <p className="ask-fine ask-mapside-lead">Apare în {countWords(sold, "județ", "județe")}</p>}
        <table className="ask-table ask-mapside">
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.key}>
                <td className="pos">{i + 1}</td>
                <td>
                  <a href={countyUrl(r.label)}>
                    {r.label} →
                  </a>
                </td>
                <td className="num">{lens === "value" || lens === "count" ? display(r.m.metric!) : lens === "value_per_capita" ? formatInt(Math.round(r.m.metric!)) : metricWords(lens, r.m.metric!)}{r.m.muted ? " ·" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lens !== "value" && lens !== "count" && <p className="ask-fine">{LENS_UNIT[lens] === "lei/locuitor" ? "lei pe locuitor" : LENS_UNIT[lens]}{ranked.some((r) => r.m.muted) ? " · „·” = date puține" : ""}</p>}
      </div>
    </div>
  );
}
