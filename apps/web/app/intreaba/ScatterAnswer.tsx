"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { countWords, formatDecimal } from "../../lib/ask/answer-text";
import type { LocateMatch, LocateResult, ProfileFactsResult } from "../../lib/ask/facet-parts";
import { LOCATE_DEBOUNCE_MS, LOCATE_MIN_CHARS } from "../../lib/ask/facet-parts";
import { askLink } from "../../lib/ask/source-spec";
import { questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import {
  SCATTER_LIST_MAX, SCATTER_LIST_PAGE, belowListWords, listPlace, scatterFlagsOf, withScatterChoice,
  type ScatterFlag, type ScatterFlagFact, type ScatterListRow,
} from "../../lib/ask/scatter-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { flagEntityRule, flagLabel } from "../../lib/flags";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import AnswerStrip, { StripRow } from "./answer/AnswerStrip";
import DetailCard, { type CardLine } from "./answer/DetailCard";
import Locate, { placeWords } from "./answer/Locate";
import ListFoot from "./answer/ListFoot";
import { FactTag } from "./answer/RowFacts";
import HelpTip from "./builder/HelpTip";
import Pills, { type PillOption } from "./builder/Pills";
import Segmented from "./builder/Segmented";
import {
  bandIndex, cardFacts, cellRects, dots, flagTag, geometry, listHeadTip, listHeadWords, nearest, p90Words, rowMeta, withFacts,
  kindWords, employeesWords, type Dot, type ScatterV2,
} from "./scatter-answer";
import "./scatter.css";

/*
 * "Ce instituții / firme ies din tipar?" (scatter-2, plan §4.12, final scatter
 * §3.3–§3.6, §4.3, §4.6): the strip beside the chart chooses who is named
 * ("Primele după" Semnale | Valoare, "Semnal" with the number of profiles that
 * have each), the chart is one band per number of criteria met (the index
 * unchanged beside the band), the group stays the whole cloud and the chosen
 * signal colours its points; "Unde e o instituție?" finds a profile in the group,
 * a point, a row or a hit opens its card, and the list below names the first
 * 50 in the strip's order. A change of order or signal is a short new query
 * (AskPanel.applyStripChange), never a reload. The signals' shares and records
 * come after the answer (part=profile), so it never waits for the acquisitions
 * of the largest profiles. Signals are leads, not proof; values are recorded,
 * not payments.
 */

export interface ScatterAnswerProps {
  data: ScatterV2;
  spec: AskSpec;
  /** The strip's change, as the applied question writes it: "rankBy:value", "flag:da_split", "flag:" (every profile). */
  onStrip: (value: string) => void;
}

/** What the card holds: a point of the chart, a row, or a profile the search found. */
interface Picked {
  id: string;
  name: string;
  value: number;
  nDas: number;
  nFlags: number;
  cri: number;
  county: string | null;
  flags: string[];
  kind?: string | null;
  employees?: number | null;
  employeesYear?: number | null;
  /** Its place in the list of the strip's order, or why it has none. */
  place?: string;
  /** Where it was picked, so the focus goes back there on closing. */
  from: "chart" | "list" | "find";
}

const FACTS_KEPT = new Map<string, Map<string, ScatterFlagFact[]>>();

/** The facts of the profiles on screen, asked once the answer is drawn and as more are shown (part=profile). */
function useProfileFacts(spec: AskSpec, wanted: readonly string[]): { facts: ReadonlyMap<string, ScatterFlagFact[]> } {
  const key = useMemo(() => questionKey({ ...spec, scatter: undefined } as unknown as QuestionSpec), [spec]);
  const [store, setStore] = useState<{ key: string; facts: ReadonlyMap<string, ScatterFlagFact[]> }>(() => ({ key, facts: FACTS_KEPT.get(key) ?? new Map() }));
  const facts = store.key === key ? store.facts : FACTS_KEPT.get(key) ?? EMPTY_FACTS;
  // The ids asked for this question: another question starts again, an answer for an older one is dropped.
  const asked = useRef({ key, ids: new Set<string>() });
  if (asked.current.key !== key) asked.current = { key, ids: new Set() };
  const need = wanted.filter((id) => !facts.has(id) && !asked.current.ids.has(id)).slice(0, SCATTER_LIST_MAX);
  const needKey = need.join(",");
  useEffect(() => {
    if (!need.length) return;
    const mine = asked.current;
    need.forEach((id) => mine.ids.add(id));
    const forget = () => need.forEach((id) => mine.ids.delete(id));
    void fetch("/api/ask/facets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: withScatterChoice(spec, "flag:"), part: "profile", ids: need }),
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & ProfileFactsResult) | null).then((answer) => {
      if (asked.current !== mine) return;
      if (!answer?.ok) { forget(); return; }
      setStore((current) => {
        const next = new Map(current.key === key ? current.facts : []);
        for (const row of answer.rows) next.set(row.id, row.flags);
        FACTS_KEPT.set(key, next);
        return { key, facts: next };
      });
    }).catch(forget);
  }, [needKey, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `need` is its key
  return { facts };
}
const EMPTY_FACTS: ReadonlyMap<string, ScatterFlagFact[]> = new Map();

/** The width of an element, for a chart drawn in real pixels (text keeps its size; a phone gets its own proportions). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(Math.round(node.getBoundingClientRect().width) || 720);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const flagHelp = (role: "authority" | "supplier") => <>
  <span>Cât de des apare fiecare semnal în grup. Un semnal pe care îl are jumătate din grup nu iese din tipar. Ales, păstrează în listă doar profilurile cu el; norul rămâne tot grupul.</span>
  <ul className="sc-tip-list">{scatterFlagsOf(role).map((code) => <li key={code}><b>{flagLabel(code)}.</b> {flagEntityRule(code)}</li>)}</ul>
</>;

/** A name on the chart: without the parenthesis ("Comuna Sageata (Primaria Comunei Sageata)"), short. */
const chartName = (name: string): string => { const short = cleanName(name).replace(/\s*\(.*$/, ""); return short.length > 28 ? `${short.slice(0, 27)}…` : short; };

export default function ScatterAnswer({ data, spec, onStrip }: ScatterAnswerProps) {
  const evidence = useAnswerEvidence();
  const [wrap, width] = useWidth();
  const [more, setMore] = useState(SCATTER_LIST_PAGE);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; dot: Dot } | null>(null);
  const [found, setFound] = useState<{ results: LocateMatch[]; name: string; place: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [answered, setAnswered] = useState(data);
  // The strip's choice while its answer is on the way (a short new query): the buttons move at once.
  const [chosen, setChosen] = useState<{ rank?: string; flag?: string }>({});
  const searchSeq = useRef(0);
  const listRef = useRef<HTMLOListElement>(null), returnTo = useRef<HTMLElement | null>(null);
  if (answered !== data) { setAnswered(data); setChosen({}); setMore(SCATTER_LIST_PAGE); setPicked(null); setFound(null); }

  const { role, levels } = data;
  const firm = role === "supplier";
  const rows = data.list;
  const shown = Math.min(more, rows.length);
  const visible = rows.slice(0, shown);
  const flag = data.flag;
  const g = useMemo(() => geometry(data, width), [data, width]);
  const listed = useMemo(() => new Set(rows.map((r) => r.entityId)), [rows]);
  const all = useMemo(() => dots(data, g, listed), [data, g, listed]);
  const wanted = useMemo(() => [...visible.map((r) => r.entityId), ...(picked ? [picked.id] : [])], [visible, picked]);
  const { facts } = useProfileFacts(spec, wanted);
  const rank = data.rankBy;
  const noun = firm ? "firmă" : "instituție";
  const labels = useMemo(() => {
    // The first names of the list on the chart, each where it fits: one that would sit on another label is left to the list.
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [], out: { id: string; x: number; y: number; anchor: "start" | "end"; text: string }[] = [];
    for (const row of rows.slice(0, g.box.compact ? 3 : 6)) {
      const d = all.find((x) => x.point.id === row.entityId);
      if (!d) continue;
      const text = chartName(row.name), w = text.length * 6.3, right = d.x < g.box.width * 0.62;
      const x = d.x + (right ? 8 : -8), box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: d.y - 8, y1: d.y + 6 };
      if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) continue;
      placed.push(box);
      out.push({ id: row.entityId, x, y: d.y + 3, anchor: right ? "start" : "end", text });
    }
    return out;
  }, [rows, all, g.box.compact, g.box.width]);

  // The legend, the cloud and the list speak of the same profiles with the same classes.
  const total = data.chosen ? data.chosen.nList : data.group.nList;

  const strip = <AnswerStrip rows label="Ajustează lista și semnalul">
    <StripRow label="Primele după" tip={{ title: "Primele după", text: rank === "risk"
      ? "Semnale: cele mai multe semnale; la egalitate, valoarea mai mare întâi. În listă: cine are cel puțin 20 de achiziții directe, ca la «Cel mai ridicat indice de risc». Semnalele apar mai des la cine cumpără mult."
      : "Valoare: cea mai mare valoare a achizițiilor directe. Linia punctată: cele mai mari 10% din grup. Contractele din proceduri nu intră." }}>
      <Segmented label="Primele după" value={chosen.rank ?? rank}
        options={[{ value: "risk", label: "Semnale" }, { value: "value", label: "Valoare" }]}
        onChange={(value) => { if (value !== (chosen.rank ?? rank)) { setChosen((c) => ({ ...c, rank: value })); onStrip(`rankBy:${value}`); } }} />
    </StripRow>
    <StripRow label="Semnal" tip={{ title: "Semnal", text: flagHelp(role) }}>
      <Pills label="Semnal" value={chosen.flag ?? flag ?? ""}
        options={[{ value: "", label: "Tot grupul", count: formatInt(data.group.n) } as PillOption,
          ...scatterFlagsOf(role).filter((code) => (data.criteria[code] ?? 0) > 0 || code === flag).map((code): PillOption => ({
            value: code, label: flagLabel(code), count: formatInt(data.criteria[code] ?? 0), signal: true,
            ...((data.criteria[code] ?? 0) === 0 ? { disabled: "Niciun profil din grup nu are acest semnal." } : {}),
          }))]}
        onChange={(value) => { if (value !== (chosen.flag ?? flag ?? "")) { setChosen((c) => ({ ...c, flag: value })); onStrip(`flag:${value}`); } }} />
    </StripRow>
  </AnswerStrip>;

  const records = (scope: Parameters<NonNullable<typeof evidence>["open"]>[1], title: string, plain = false) => {
    // "All of a profile's records" is the cloud's question without its chosen signal (which would narrow the sources).
    const base = plain && spec.scatter?.flag ? withScatterChoice(spec, "flag:") : undefined;
    evidence?.open(base, { role, ...scope }, title);
  };

  const pick = (next: Picked) => setPicked(next);
  const rowPick = (row: ScatterListRow, index: number, from: Picked["from"]): Picked => ({
    id: row.entityId, name: row.name, value: row.value, nDas: row.nDas, nFlags: row.nFlags, cri: row.cri, county: row.county, flags: row.flags.map((f) => f.code),
    kind: row.kind ?? null, employees: row.employees ?? null, employeesYear: row.employeesYear ?? null,
    place: listPlace(index + 1, total, rank), from,
  });
  const pickPoint = (dot: Dot, from: Picked["from"]) => {
    const point = dot.point, at = rows.findIndex((r) => r.entityId === point.id);
    if (at >= 0) return pick(rowPick(rows[at]!, at, from));
    const codes = scatterFlagsOf(role).filter((code) => (point.flags & (1 << scatterFlagsOf(role).indexOf(code))) !== 0);
    const floor = data.group.small ? 10 : 20;
    pick({
      id: point.id, name: point.name, value: point.value, nDas: point.nDas, nFlags: point.nFlags, cri: point.nFlags / levels, county: null, flags: codes, from,
      ...(point.nDas < floor ? { place: belowListWords(point.nDas) } : flag && !codes.includes(flag) ? { place: `nu are semnalul „${flagLabel(flag).toLocaleLowerCase("ro-RO")}”` } : {}),
    });
  };

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch") return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const dot = nearest(all, x, y);
    setHover(dot ? { x, y, dot } : null);
  };
  const onClick = (event: PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dot = nearest(all, event.clientX - box.left, event.clientY - box.top, event.nativeEvent instanceof MouseEvent && (event.nativeEvent as unknown as { pointerType?: string }).pointerType === "touch" ? 24 : 18);
    if (dot) { returnTo.current = null; pickPoint(dot, "chart"); }
  };

  // "Unde e o instituție?" (part=locate): the profiles of the group whose name holds the text, with their place in the list.
  const search = async (q: string) => {
    const seq = ++searchSeq.current;
    if (q.length < LOCATE_MIN_CHARS) { setFound(null); return; }
    setSearching(true);
    try {
      const r = await fetch("/api/ask/facets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec, part: "locate", q }) });
      const body = (await r.json().catch(() => null)) as ({ ok: boolean } & LocateResult) | null;
      if (seq !== searchSeq.current) return;
      setFound(body?.ok ? { results: body.matches, name: "", place: "" } : { results: [], name: "", place: "" });
      if (body?.ok && body.matches.length === 1) openMatch(body.matches[0]!, body.total);
    } finally { if (seq === searchSeq.current) setSearching(false); }
  };
  const matchPlace = (m: LocateMatch, totalList: number): string =>
    m.rank !== null ? placeWords(m.rank, totalList, rank === "risk" ? "semnale" : "valoare")
      : m.profile?.why === "below" ? belowListWords(m.n ?? 0) : `nu are semnalul „${flag ? flagLabel(flag).toLocaleLowerCase("ro-RO") : ""}”`;
  const openMatch = (m: LocateMatch, totalList: number) => {
    const place = matchPlace(m, totalList);
    setFound((current) => ({ results: current?.results ?? [m], name: m.name, place }));
    pick({
      id: m.id, name: m.name, value: m.value ?? 0, nDas: m.n ?? 0, nFlags: m.profile?.nFlags ?? 0, cri: m.profile?.cri ?? 0, county: m.county,
      flags: m.profile?.flags ?? [], place: m.rank !== null ? listPlace(m.rank, totalList, rank) : place, from: "find",
    });
  };

  const results = (found?.results ?? []).map((m) => ({
    id: m.id, name: cleanName(m.name), detail: m.rank !== null ? `locul ${formatInt(m.rank)} din ${formatInt(total)}` : m.profile?.why === "below" ? belowListWords(m.n ?? 0) : "nu are semnalul ales",
    ...(m.county ? { side: m.county } : {}),
  }));

  const pickedFacts = picked ? withFacts(picked.flags.map((code) => ({ code: code as ScatterFlag })), facts.get(picked.id)) : [];
  const cardLines = (): CardLine[] => pickedFacts.map((fact) => ({
    tag: flagTag(fact),
    ...(fact.rows !== undefined && picked ? {
      records: { label: countWords(fact.rows, "înregistrare", "înregistrări"),
        onClick: () => records({ entityIds: [picked.id], flag: fact.code }, `${picked.name} · ${flagLabel(fact.code).toLocaleLowerCase("ro-RO")}`) },
    } : {}),
  }));

  const widen = (() => {
    const next = structuredClone(spec) as AskSpec;
    delete next.filters.county; delete next.filters.seatCounty;
    return next.filters.authorityKind ? (() => { delete next.filters.authorityKind; return next; })() : next;
  })();

  const rowRecordsLabel = (row: ScatterListRow) => {
    if (!flag) return countWords(row.nDas, "înregistrare", "înregistrări");
    const rowsOf = facts.get(row.entityId)?.find((f) => f.code === flag)?.rows;
    return rowsOf === undefined ? "Înregistrările semnalului" : countWords(rowsOf, "înregistrare", "înregistrări");
  };
  const signalRecords = (id: string) => {
    const n = facts.get(id)?.find((f) => f.code === flag)?.rows;
    return n === undefined ? "Vezi înregistrările semnalului" : `Vezi cele ${formatInt(n)} cu semnalul`;
  };
  const signalRows = flag ? visible.reduce((sum, row) => sum + (facts.get(row.entityId)?.find((f) => f.code === flag)?.rows ?? 0), 0) : 0;
  const signalLoaded = flag ? visible.every((row) => facts.get(row.entityId)?.some((f) => f.code === flag)) : false;

  return <div className="qb sc" ref={wrap}>
    {strip}

    {data.group.small ? <p className="sc-small" role="note">
      {countWords(data.group.n, noun === "firmă" ? "profil" : "profil", "profiluri")} în grup: prea puține pentru un nor. Le arătăm ca listă.
      {" "}<Link className="qb-relax-link" href={askLink(widen as unknown as QuestionSpec)}>Toată țara<span className="qb-glyph" aria-hidden="true">›</span></Link>
    </p> : <figure className="sc-figure">
      <svg className="sc-chart" role="img" width={g.box.width} height={g.box.height} viewBox={`0 0 ${g.box.width} ${g.box.height}`}
        aria-label={`Norul de risc: ${countWords(data.group.n, "profil", "profiluri")}, pe ${levels + 1} benzi după numărul de semnale și pe scara valorii achizițiilor directe. Lista de mai jos are aceleași profiluri, cu cele numite.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick}>
        {Array.from({ length: levels + 1 }, (_, k) => {
          const label = bandIndex(k, levels);
          return <g key={k} className="sc-band">
            <rect x={g.pad.l} y={g.yBand(k) - g.bandH / 2} width={g.plotW} height={g.bandH} className={k % 2 ? "sc-stripe" : "sc-stripe is-alt"} />
            <text x={g.pad.l - 8} y={g.yBand(k) - 1} textAnchor="end" className="sc-idx">{label.index}</text>
            <text x={g.pad.l - 8} y={g.yBand(k) + 11} textAnchor="end" className="sc-ratio">{label.ratio}</text>
          </g>;
        })}
        {g.ticks.map((t) => <g key={t.lg}>
          <line x1={t.x} x2={t.x} y1={g.pad.t} y2={g.box.height - g.pad.b} className="sc-grid" />
          <text x={t.x} y={g.box.height - g.pad.b + 16} textAnchor="middle" className="sc-tick">{t.text}{g.box.compact ? "" : " lei"}</text>
        </g>)}
        <text x={g.pad.l + g.plotW / 2} y={g.box.height - 6} textAnchor="middle" className="sc-axis">achiziții directe (scară logaritmică)</text>
        {data.p90 > 0 && <g className={`sc-p90${rank === "value" ? " is-on" : ""}`}>
          <line x1={g.x(data.p90)} x2={g.x(data.p90)} y1={g.pad.t} y2={g.box.height - g.pad.b} />
          <text x={Math.min(g.x(data.p90) + 4, g.box.width - 4)} y={g.pad.t + 10} textAnchor={g.x(data.p90) + 100 > g.box.width ? "end" : "start"}>{p90Words}</text>
        </g>}
        {"bands" in data.cloud && <g className="sc-cells">{cellRects(data.cloud.bands, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={c.o} className="sc-cell" />)}</g>}
        {"bands" in data.cloud && data.cloud.flagged && <g className="sc-cells is-flag">{cellRects(data.cloud.flagged, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={Math.min(1, c.o + 0.15)} className="sc-cell" />)}</g>}
        {all.filter((d) => !d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={3} className="sc-dot" />)}
        {all.filter((d) => d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4} className="sc-dot is-flag" />)}
        {all.filter((d) => d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4.5} className={`sc-dot is-list${d.flagged ? " is-flag" : ""}`} />)}
        {labels.map((l) => <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className="sc-name">{l.text}</text>)}
        {picked && (() => {
          const d = all.find((x) => x.point.id === picked.id);
          return d ? <circle cx={d.x} cy={d.y} r={9} className="sc-ring" /> : null;
        })()}
        {found?.results.map((m) => { const d = all.find((x) => x.point.id === m.id); return d ? <circle key={m.id} cx={d.x} cy={d.y} r={8} className="sc-ring is-find" /> : null; })}
      </svg>
      {hover && <div className="sc-hover" style={{ left: Math.min(hover.x + 12, g.box.width - 190), top: Math.max(hover.y - 8, 0) }} role="presentation">
        <b>{cleanName(hover.dot.point.name)}</b>
        <span>{formatRon(hover.dot.point.value)} · {hover.dot.point.nFlags} din {levels} semnale</span>
      </div>}
      <figcaption className="sc-legend">
        <span><i className="sc-key" aria-hidden="true" /> grupul</span>
        {flag && <span><i className="sc-key is-flag" aria-hidden="true" /> cu „{flagLabel(flag).toLocaleLowerCase("ro-RO")}”</span>}
        <span><i className="sc-key is-list" aria-hidden="true" /> în listă</span>
        <span><i className="sc-key is-ring" aria-hidden="true" /> ales sau căutat</span>
        <span><i className="sc-key is-line" aria-hidden="true" /> {p90Words}</span>
      </figcaption>
    </figure>}

    <div className="sc-find">
      <Locate key={`${data.flag ?? ""}|${data.rankBy}`} label={firm ? "Unde e o firmă?" : "Unde e o instituție?"} results={results} loading={searching} onSearch={(q) => void search(q)} delay={LOCATE_DEBOUNCE_MS} minChars={LOCATE_MIN_CHARS}
        emptyText={`Niciun profil în acest grup. Încearcă un nume mai scurt.`}
        onPick={(result) => { const m = found?.results.find((x) => x.id === result.id); if (m) openMatch(m, total); }}
        found={found && found.name ? { name: cleanName(found.name), place: found.place } : null} />
    </div>

    {picked && <DetailCard
      title={cleanName(picked.name)}
      meta={[firm ? employeesWords(picked.employees, picked.employeesYear) : kindWords(picked.kind), picked.county, picked.place].filter(Boolean).join(" · ")}
      facts={cardFacts(picked.value, picked.cri, picked.nFlags, levels).map((f) => ({ label: f.label, value: f.value }))}
      lines={cardLines()}
      returnTo={returnTo.current}
      onClose={() => setPicked(null)}
      actions={[
        ...(flag && picked.flags.includes(flag) ? [{ label: signalRecords(picked.id), glyph: "→" as const,
          onClick: () => records({ entityIds: [picked.id], flag }, `${picked.name} · ${flagLabel(flag).toLocaleLowerCase("ro-RO")}`) }] : []),
        { label: "Vezi înregistrările", glyph: "→" as const, onClick: () => records({ entityIds: [picked.id] }, `${picked.name} · înregistrările profilului`, true) },
        { label: "Unde se situează?", glyph: "›" as const, href: askLink({ block: "distribution", measure: "value", dim: role, filters: { [`${role}Id`]: Number(picked.id), [`${role}Name`]: picked.name } } as unknown as QuestionSpec) },
        { label: firm ? "Fișa firmei" : "Fișa instituției", glyph: "↗" as const, href: `/entitati/${picked.id}` },
      ]}
    />}

    {rows.length > 0 ? <section className="sc-list-wrap" aria-label="Lista profilurilor">
      <h3 className="qb-tipwrap sc-list-head">{listHeadWords(data, shown)} <HelpTip tip={{ title: listHeadWords(data, shown), text: listHeadTip(data) }} /></h3>
      <ol className="sc-list" ref={listRef}>
        {visible.map((row, index) => {
          const own = withFacts(row.flags, facts.get(row.entityId));
          return <li key={row.entityId} className={`sc-row${picked?.id === row.entityId ? " is-picked" : ""}`}>
            <span className="sc-rank qb-num">{index + 1}</span>
            <span className="sc-who">
              <button type="button" data-qb-arow="" className="sc-name-btn" aria-haspopup="false"
                onClick={(event) => { returnTo.current = event.currentTarget; pick(rowPick(row, index, "list")); }}>{cleanName(row.name)}</button>
              <small>{rowMeta(row, role)}</small>
              {own.length > 0 && <span className="qb-tags">{own.map((fact) => <FactTag key={fact.code} fact={flagTag(fact)} />)}</span>}
            </span>
            <span className="sc-val qb-num">{formatRon(row.value)}</span>
            <span className="sc-cri qb-num">{formatDecimal(row.cri, levels === 4 ? 2 : 1)} · {row.nFlags} din {levels}</span>
            <button type="button" className="qb-rec sc-rec"
              onClick={() => records({ entityIds: [row.entityId], ...(flag ? { flag } : {}) }, `${row.name} · ${flag ? flagLabel(flag).toLocaleLowerCase("ro-RO") : "înregistrările profilului"}`)}>
              {rowRecordsLabel(row)}<span className="qb-glyph" aria-hidden="true">→</span></button>
          </li>;
        })}
      </ol>
      <ListFoot shown={shown} total={rows.length} noun={["profil", "profiluri", "n"]} list={listRef} onMore={() => setMore((m) => Math.min(m + SCATTER_LIST_PAGE, rows.length))}
        records={{ label: flag ? (signalLoaded ? `Vezi cele ${countWords(signalRows, "înregistrare", "înregistrări")} cu semnalul` : "Vezi înregistrările cu semnalul") : "Vezi înregistrările celor din listă", glyph: "→",
          onClick: () => records({ entityIds: visible.map((r) => r.entityId), ...(flag ? { flag } : {}) }, flag ? `semnalul „${flagLabel(flag).toLocaleLowerCase("ro-RO")}” · profilurile din listă` : "profilurile din listă", !flag) }} />
      <p className="sc-more"><Link className="qb-link" href={flag ? `/semnale?tip=${encodeURIComponent(flag)}&rol=${role}` : `/semnale?rol=${role}`}>Toată lista pe /semnale<span className="qb-glyph" aria-hidden="true">↗</span></Link></p>
    </section> : <p className="qb-empty-note sc-none">{flag ? `Niciun profil din grup cu 20 de achiziții directe nu are semnalul „${flagLabel(flag).toLocaleLowerCase("ro-RO")}”.` : "Niciun profil din grup nu are destule achiziții directe pentru listă."}</p>}

    <p className="sc-foot qb-tipwrap">Semnalele sunt piste, nu dovezi. Valori înregistrate, nu plăți.{" "}
      <HelpTip tip={{ title: "Valori înregistrate", text: "Suma achizițiilor directe acceptate, fiecare de cel mult 2 mil. lei. Contractele din proceduri nu intră în profil." }} /></p>
  </div>;
}

