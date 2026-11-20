"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { countWords, formatDecimal } from "../../lib/ask/answer-text";
import type { LocateMatch, LocateResult } from "../../lib/ask/facet-parts";
import { LOCATE_DEBOUNCE_MS, LOCATE_MIN_CHARS } from "../../lib/ask/facet-parts";
import { askLink } from "../../lib/ask/source-spec";
import { countyWords, questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import {
  SCATTER_LIST_MAX, SCATTER_LIST_PAGE, belowListWords, codeBit, flagDetail, groupPlural, isRetiredScatterFlag, isScatterFlag, listPlace, scatterCodes, scatterFlagLabel, scatterFlagsOf,
  withScatterChoice, type ScatterData, type ScatterFlag, type ScatterFlagFact,
} from "../../lib/ask/scatter-shared";
import { namedKind, SCATTER_FLAGS_BY_ROLE, type AskSpec } from "../../lib/ask/spec";
import { flagEntityRule, flagLabel } from "../../lib/flags";
import { G } from "../../components/ghost/Ghost";
import { useChartMotion } from "./answer/chart-motion";
import { RISK_BAND_CLASS, RISK_BAND_WORD, riskBand, riskScoreText } from "../../lib/risk-score";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import EntityName from "../../components/EntityName";
import { useAnswerEvidence } from "./AnswerEvidence";
import AnswerStrip, { StripRow } from "./answer/AnswerStrip";
import DetailCard, { type CardLine } from "./answer/DetailCard";
import Locate, { placeWords } from "./answer/Locate";
import ColumnFilter from "../../components/table-filters/ColumnFilter";
import FilterBand from "../../components/table-filters/FilterBand";
import Pager from "../entitati/[id]/Pager";
import { SCATTER_LIST_PAGE_SIZE } from "../../lib/ask/scatter-list-columns";
import { useScatterList } from "./use-scatter-list";
import KitLink from "./answer/KitLink";
import { forgetListReturn, readListReturn, rememberListReturn, type ListReturn } from "./answer/list-return";
import { FactTag } from "./answer/RowFacts";
import { historicFact, historicLeftOutWords, historicPlaceWords } from "../../lib/ask/historic";
import HelpTip from "./builder/HelpTip";
import { SelectRing } from "../../components/motion/Selection";
import { arrive } from "../../components/motion/outline";
import Term from "../../components/Term";
import InfoMark from "../../components/InfoMark";
import Pills, { type PillOption } from "./builder/Pills";
import Segmented from "./builder/Segmented";
import {
  RISK_AXIS, RISK_GRID, RISK_ZONES, axisWords, bandIndex, cardFacts, cardFactsV2, cellRects, chartLabels, density, dots, employeesWords, exactDot, fetchScatterFacts, flagTag, geometry, groupCounty,
  keptScatterFacts, kindWords, listHeadTip, listHeadWords, listSumParts, SCATTER_FEW, listTotal, nearest, p90Label, p90Words, pointLevel, pointPlace, rankWords, rowMeta, rowPlace, scatterFactsKey, scoreBandWord, scoreWords,
  signalsPageLink, stepWords, stripStatusWords, withFacts, type AnyListRow, type Dot, type MeasureText,
} from "./scatter-answer";
import "./scatter.css";

/*
 * "Ce instituții / firme ies din tipar?" (scatter-3, rf-2026.18; plan §4.12,
 * final scatter §3.3–§3.6, §4.3, §4.6): the strip beside the chart chooses who
 * is named ("Primele după" Risc | Valoare, "Semnal" with the number of
 * profiles that have each of the risk score's criteria), the chart puts each
 * profile at its risk score (10–100, the bands' lines at 40 and 68; under 10 in
 * the strip below, owner's variant 1, 15 November 2026) and its value, the
 * group stays the whole cloud (green cells, more is darker) and the chosen
 * signal colours its points or cells orange; "Unde e o instituție?" finds a profile in the group, a point, a row or
 * a hit opens its card, and the list below names the first 50 in the strip's
 * order, each with its score. A change of order or signal is a short new query
 * (AskPanel.applyStripChange), never a reload. The signals' shares and records
 * come after the answer (part=profile), so it never waits for the acquisitions
 * of the largest profiles. The score is not a probability of corruption;
 * signals are leads, not proof; values are recorded, not payments. A stored
 * scatter-2 (a watch's, a capture's) draws as it did: one band per number of
 * criteria, the index beside it.
 */

export interface ScatterAnswerProps {
  data: ScatterData;
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
  /** scatter-3: the risk score (0–100). A stored scatter-2: the index. */
  score?: number;
  cri?: number;
  county: string | null;
  flags: string[];
  kind?: string | null;
  employees?: number | null;
  employeesYear?: number | null;
  /** Its place in the list of the strip's order, or why it has none. */
  place?: string;
  /** Where it was picked: a point of the chart or a hit of the search (a row of the list opens its page). */
  from: "chart" | "find";
}

/** The facts of the profiles on screen, asked once the answer is drawn and as more are shown (part=profile). */
function useProfileFacts(spec: AskSpec, wanted: readonly string[], ask: boolean): { facts: ReadonlyMap<string, ScatterFlagFact[]> } {
  // One store per question (scatter-answer.ts): the CSV export reads and completes the same one.
  const key = useMemo(() => scatterFactsKey(spec), [spec]);
  const [store, setStore] = useState<{ key: string; facts: ReadonlyMap<string, ScatterFlagFact[]> }>(() => ({ key, facts: keptScatterFacts(spec) ?? EMPTY_FACTS }));
  const facts = store.key === key ? store.facts : keptScatterFacts(spec) ?? EMPTY_FACTS;
  // The ids asked for this question: another question starts again, an answer for an older one is dropped.
  const asked = useRef({ key, ids: new Set<string>() });
  if (asked.current.key !== key) asked.current = { key, ids: new Set() };
  const need = ask ? wanted.filter((id) => !facts.has(id) && !asked.current.ids.has(id)).slice(0, SCATTER_LIST_MAX) : [];
  const needKey = need.join(",");
  useEffect(() => {
    if (!need.length) return;
    const mine = asked.current;
    need.forEach((id) => mine.ids.add(id));
    void fetchScatterFacts(spec, need).then((next) => {
      if (asked.current !== mine) return;
      if (!next) { need.forEach((id) => mine.ids.delete(id)); return; }
      setStore({ key, facts: next });
    });
  }, [needKey, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `need` is its key
  return { facts };
}
const EMPTY_FACTS: ReadonlyMap<string, ScatterFlagFact[]> = new Map();

/**
 * A chosen signal the new group does not have (final §4.4), or one an older link carries that no longer counts
 * (rf-2026.18, „Finalizare rapidă”): the answer goes back to „Tot grupul” and says so. Kept outside the component, for
 * the question without its signal, so the note survives the strip's new answer.
 */
let droppedSignal: { flag: string; key: string; why: string } | null = null;
const WHY_ABSENT = "nu apare în noul grup";
const WHY_RETIRED = "nu mai intră în risc";

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
  <span>Cât de des apare fiecare tipar al riscului în grup. Un tipar pe care îl are jumătate din grup nu iese din tipar. Ales, păstrează în listă doar profilurile cu el; norul rămâne tot grupul.</span>
  <ul className="sc-tip-list">{scatterFlagsOf(role).map((code) => <li key={code}><b>{flagLabel(code)}.</b> {flagEntityRule(code)}</li>)}</ul>
</>;

/** A name on the chart: without the parenthesis ("Comuna Sageata (Primaria Comunei Sageata)"), short. */
const chartName = (name: string): string => { const short = cleanName(name).replace(/\s*\(.*$/, ""); return short.length > 28 ? `${short.slice(0, 27)}…` : short; };

/** A row's risk beside its value: the score's pill and its band (scatter-3), or the index with its criteria (scatter-2). */
function RowRisk({ row, levels, parts }: { row: AnyListRow; levels: number; parts: readonly ScatterFlagFact<string>[] }) {
  if ("cri" in row) return <span className="sc-cri qb-num">{formatDecimal(row.cri, levels === 4 ? 2 : 1)} · {row.nFlags} din {levels}</span>;
  const pill = `cri-pill ${RISK_BAND_CLASS[riskBand(row.score)]}`;
  return <span className="sc-cri sc-risk">
    {/* The pill says what this row's score is made of (owner, 20 November 2026: the patterns' tags crowded the list):
        each pattern with its years or share, a link to its page for this profile. What the score is, in general, is
        said once at the legend. A resting mouse draws the outline, a tap opens it (M-01). */}
    {parts.length > 0
      ? <Term tip hold="box" title="Din ce e format scorul" className={pill} text={<>{parts.map((fact) => { const detail = flagDetail(fact); return <span key={fact.code} className="sc-part">
        <Link href={`/entitati/${row.entityId}/semnale?tip=${fact.code}`} prefetch={false}>{scatterFlagLabel(fact.code)}</Link>{detail ? ` · ${detail}` : ""}
      </span>; })}</>}>{riskScoreText(row.score)}</Term>
      : <Term tip hold="box" id="scor-risc" className={pill}>{riskScoreText(row.score)}</Term>}
    <small>{scoreBandWord(row.score)}{parts.length > 0 && <> · {countWords(parts.length, "tipar", "tipare")}</>}</small>
  </span>;
}

/*
 * The cloud on its way (owner, 6 November 2026: ghost loading; AskPanel AnswerGhost): the strip's two rows, the chart's
 * box (its height is the real one, scatter.css), the legend, "Unde e …?", the list's head, its first page of rows, its
 * foot and the note, in the real classes. The controls are quiet replicas (inert); the dots are a fixed decorative
 * cloud, never data.
 */
const GHOST_DOTS = [[70, 330], [96, 312], [118, 340], [140, 296], [162, 322], [180, 270], [204, 306], [226, 284], [246, 318], [262, 252], [284, 290], [300, 236],
  [322, 274], [344, 300], [362, 228], [382, 262], [404, 210], [424, 246], [446, 282], [468, 198], [490, 236], [512, 176], [536, 222], [560, 160], [584, 204],
  [606, 142], [628, 188], [652, 120], [674, 168], [692, 96]] as const;
const GHOST_NAMES = [30, 22, 36, 18, 26, 40, 24, 32, 20, 28];
export function ScatterGhost({ spec }: { spec: AskSpec }) {
  const role = spec.dim === "supplier" ? "supplier" : "authority";
  const flag = spec.scatter?.flag ?? null;
  const lower = (code: string) => scatterFlagLabel(code).toLocaleLowerCase("ro-RO");
  // The counts beside the signals arrive with the answer: their place is kept (figure spaces), never a number.
  const room = "\u2007".repeat(7);
  return <div className="qb sc">
    <div className="g-quiet" inert><AnswerStrip rows label="Ajustează lista și semnalul">
      <StripRow label="Primele după" tip={{ title: "Primele după", text: "" }}>
        <Segmented label="Primele după" value={spec.scatter?.rankBy === "value" ? "value" : "risk"} options={[{ value: "risk", label: "Risc" }, { value: "value", label: "Valoare" }]} />
      </StripRow>
      <StripRow label="Semnal" tip={{ title: "Semnal", text: "" }}>
        <div className="sc-signal-pills">
          <Pills label="Semnal" value={flag ?? ""} options={[{ value: "", label: "Tot grupul", count: room },
            ...SCATTER_FLAGS_BY_ROLE[role].map((code): PillOption => ({ value: code, label: scatterFlagLabel(code), count: room, signal: true }))]} onChange={() => undefined} />
        </div>
        <label className="qb-field sc-signal-select"><span className="d-sr-only">Semnal</span><select value="" disabled><option value="">{flag ? scatterFlagLabel(flag) : "Tot grupul"}</option></select></label>
      </StripRow>
    </AnswerStrip></div>
    <figure className="sc-figure" aria-hidden="true">
      <svg className="sc-chart sc-chart-ghost" viewBox="0 0 720 400" preserveAspectRatio="xMidYMid meet">
        <rect className="g-svg" x="58" y="370" width="648" height="1.5" />
        <rect className="g-svg" x="58" y="24" width="1.5" height="346" />
        {GHOST_DOTS.map(([x, y], i) => <circle key={i} className="g-svg" cx={x} cy={y} r={i % 5 === 0 ? 5 : 3.5} />)}
      </svg>
      <figcaption className="sc-legend">
        <span><i className="sc-key" /> grupul</span>
        {flag && <span><i className="sc-key is-flag" /> cu „{lower(flag)}”</span>}
        <span><i className="sc-key is-list" /> în listă</span>
        <span><i className="sc-key is-ring" /> ales sau căutat</span>
        <span><i className="sc-key is-line" /> {p90Words}</span>
        <span inert>riscul, din 100 <HelpTip tip={{ id: "scor-risc" }} /></span>
      </figcaption>
    </figure>
    <div className="sc-find g-quiet" inert>
      <Locate label={role === "supplier" ? "Unde e o firmă?" : "Unde e o instituție?"} results={[]} loading={false} onSearch={() => undefined} onPick={() => undefined} />
    </div>
    <section className="sc-list-wrap" aria-hidden="true">
      <h3 className="qb-tipwrap sc-list-head">Primele {SCATTER_LIST_PAGE} din <G.Line inline w="4ch" /> <span inert><HelpTip tip={{ title: "Primele", text: "" }} /></span></h3>
      <ol className="sc-list">
        <G.Rows n={SCATTER_LIST_PAGE} className="sc-row" cells={(i) => <>
          <span className="sc-rank qb-num">{i + 1}</span>
          <span className="sc-who">
            <span className="sc-name"><G.Line inline w={`${GHOST_NAMES[i % GHOST_NAMES.length]}ch`} /></span>
            <small><G.Line w="46%" /></small>
            {/* No tag line: the patterns are on the score's pill (owner, 20 November 2026). */}
          </span>
          <span className="sc-val qb-num"><G.Line inline w="9ch" /></span>
          <span className="sc-cri sc-risk"><span className="cri-pill g-quiet"><G.Line inline w="6ch" /></span><small><G.Line inline w="7ch" /></small></span>
          <span className="qb-rec sc-rec g-quiet"><G.Line inline w="16ch" /></span>
        </>} />
      </ol>
      {/* The real foot: the entity pager (pages since 19 November 2026, not „Arată încă”), its position still a line. */}
      <div className="qb-listfoot sc-listfoot g-quiet" inert>
        <nav className="ent-pager"><button type="button" aria-disabled>‹ anterioare</button><span className="ent-pager-pos"><G.Line inline w="13ch" /></span><button type="button" aria-disabled>următoare ›</button></nav>
        <KitLink className="qb-secondary" link={{ label: flag ? "Vezi înregistrările cu semnalul" : "Vezi înregistrările celor din listă", glyph: "→", onClick: () => undefined }} />
      </div>
      <p className="sc-more"><span className="qb-link"><G.Line inline w="22ch" /></span></p>
    </section>
  </div>;
}

/**
 * The chart's names measured in their own font (.sc-label: 11.5 px, 600, the body face), so a name is placed by its real
 * width (critique 15 November 2026: an estimate a quarter short let „TERMICA DISTRIBUTIE NAV…” run out of the chart).
 * Without a canvas (the server), the estimate.
 */
let labelCanvas: CanvasRenderingContext2D | null | undefined;
const measureLabel: MeasureText = (text) => {
  if (labelCanvas === undefined) labelCanvas = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!labelCanvas) return text.length * 6.6;
  const face = getComputedStyle(document.body).getPropertyValue("--body").trim() || "IBM Plex Sans, system-ui, sans-serif";
  labelCanvas.font = `600 11.5px ${face}`;
  return Math.ceil(labelCanvas.measureText(text).width) + 2;
};

/** A mark that answers a click (a ring) or a name: in over --fast. */
const FAST = { "--cm-dur": "var(--fast)" } as CSSProperties;

export default function ScatterAnswer({ data, spec, onStrip }: ScatterAnswerProps) {
  const evidence = useAnswerEvidence();
  const [wrap, width] = useWidth();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; dot: Dot } | null>(null);
  const [found, setFound] = useState<{ results: LocateMatch[]; name: string; place: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [answered, setAnswered] = useState(data);
  // The strip's choice while its answer is on the way (a short new query): the buttons move at once.
  const [chosen, setChosen] = useState<{ rank?: string; flag?: string }>({});
  const searchSeq = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);
  // The cloud first shows with its zones and grid in place: the group (cells or points) fades in as one, the listed
  // points fade in where they are, together, and the names come last. Another order or signal re-colours the listed
  // points (a short fill transition, scatter.css) and fades in the points and cells that join (owner, 6 November 2026).
  const motion = useChartMotion();
  if (answered !== data) { setAnswered(data); setChosen({}); setPicked(null); setFound(null); }

  const { role } = data;
  // A stored scatter-2 (before rf-2026.18): its bands, index and signals, as it was drawn.
  const legacy = data.version === 2;
  const levels = data.version === 2 ? data.levels : 0;
  const words = rankWords(data);
  const codes = scatterCodes(data);
  const firm = role === "supplier";
  // The list (owner, 19 November 2026, variant B): the whole of it, 10 a page under the column filters; `rows` are the
  // page on screen, which are also the chart's listed points.
  const list = useScatterList(spec, data);
  const rows: readonly AnyListRow[] = list.rows;
  const shown = rows.length;
  const visible = rows;
  const flag = data.flag;
  /** The chosen signal when the records can be asked for it (a stored answer's retired one cannot). */
  const live = flag && isScatterFlag(flag) ? flag : null;
  const g = useMemo(() => geometry(data, width), [data, width]);
  const listed = useMemo(() => new Set(rows.map((r) => r.entityId)), [rows]);
  const all = useMemo(() => {
    const cloud = dots(data, g, listed);
    if ("points" in data.cloud) return cloud;
    // A chart of cells draws only the page's rows as points: the answer's named ones among them, the others exact.
    const have = new Set<string>(), page = cloud.filter((d) => d.listed && (have.add(d.point.id), true));
    for (const r of rows) if (!have.has(r.entityId)) page.push({ ...exactDot(data, g, {
      id: r.entityId, name: r.name, value: r.value, level: "scoreRaw" in r ? r.scoreRaw : r.nFlags, nFlags: r.nFlags, nDas: r.nDas, codes: r.flags.map((f) => f.code),
    }), listed: true });
    return page;
  }, [data, g, listed, rows]);
  /** A found profile's level: its score (LocateMatch's `cri` is the score over one), or a scatter-2's criteria. */
  const matchLevel = (m: LocateMatch) => legacy ? m.profile?.nFlags ?? 0 : Math.round((m.profile?.cri ?? 0) * 100);
  // On a chart of cells only the list's 50 are points: a profile found or picked beyond them is drawn exact (final §3.6).
  const extra = useMemo(() => {
    if ("points" in data.cloud) return [];
    const have = new Set(all.map((d) => d.point.id)), out: Dot[] = [];
    const add = (p: Parameters<typeof exactDot>[2]) => { if (!have.has(p.id)) { have.add(p.id); out.push(exactDot(data, g, p)); } };
    if (picked) add({ id: picked.id, name: picked.name, value: picked.value, level: legacy ? picked.nFlags : picked.score ?? 0, nFlags: picked.nFlags, nDas: picked.nDas, codes: picked.flags });
    for (const m of found?.results ?? []) if (m.value !== null && m.profile) add({ id: m.id, name: m.name, value: m.value, level: matchLevel(m), nFlags: m.profile.nFlags, nDas: m.n ?? 0, codes: m.profile.flags });
    return out;
  }, [data, g, all, picked, found]); // eslint-disable-line react-hooks/exhaustive-deps -- matchLevel reads `legacy`, which `data` decides
  const drawn = useMemo(() => [...all, ...extra], [all, extra]);
  // Whether a drawn point has no signal in the score: it sits on the value axis, and the legend says so.
  const axisDots = !legacy && drawn.some((d) => pointLevel(data, d.point) < 10);
  const wanted = useMemo(() => [...visible.map((r) => r.entityId), ...(picked ? [picked.id] : [])], [visible, picked]);
  // A stored scatter-2 keeps the facts it was stored with: today's facts are of today's signals.
  const { facts } = useProfileFacts(spec, wanted, !legacy);

  // "Înapoi" from a row's page (list-return.ts): as many rows as were shown, that row where it was, its link focused.
  const [back, setBack] = useState<ListReturn | null>(null);
  useEffect(() => {
    const r = readListReturn(spec);
    if (!r) return;
    // `shown` is the last row's place on the page the reader left: its page is asked again (the filters are not kept).
    list.setPage(Math.max(1, Math.ceil(r.shown / SCATTER_LIST_PAGE_SIZE)));
    setBack(r);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the answer is first drawn
  useEffect(() => {
    if (!back || list.loading) return;
    if (!rows.some((row) => row.entityId === back.id)) { forgetListReturn(); setBack(null); return; }
    // A frame after the longer list is drawn (the chart has its width by then).
    const frame = requestAnimationFrame(() => {
      const row = listRef.current?.children[rows.findIndex((r) => r.entityId === back.id)] as HTMLElement | undefined;
      if (row) {
        window.scrollBy({ top: row.getBoundingClientRect().top - back.top, behavior: "instant" });
        row.querySelector<HTMLElement>("a.sc-name")?.focus({ preventScroll: true });
        // The row Back brought back draws its outline once (M-09).
        arrive(row);
      }
      forgetListReturn();
      setBack(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [back, list.loading, rows]);
  const rank = data.rankBy;
  // The first names of the list on the chart, each where it fits; the chosen and the found points' always (chartLabels).
  const focus = useMemo(() => [...(picked ? [{ id: picked.id, text: chartName(picked.name) }] : []),
    ...(found?.results ?? []).slice(0, 3).map((m) => ({ id: m.id, text: chartName(m.name) }))], [picked, found]);
  const labels = useMemo(() => chartLabels(rows.slice(0, g.box.compact ? 3 : 6).map((row) => ({ id: row.entityId, text: chartName(row.name) })), drawn, g, data.p90, focus, measureLabel),
    [rows, drawn, g, data.p90, focus]);
  const p90At = data.p90 > 0 ? p90Label(g, data.p90, measureLabel) : null;
  // The density field and the strip (a cloud of cells), the chosen signal's cells on the same grid with their own ramp.
  const field = useMemo(() => !legacy && "bands" in data.cloud ? density(data.cloud.bands, g) : null, [data, g, legacy]);
  const flaggedField = useMemo(() => !legacy && "bands" in data.cloud && data.cloud.flagged ? density(data.cloud.flagged, g) : null, [data, g, legacy]);
  // The profiles without a signal in the score: the strip's count (cells), or the points drawn in it.
  const noneCount = field ? field.none : "points" in data.cloud ? data.cloud.points.filter((p) => pointLevel(data, p) < 10).length : 0;

  // The legend, the cloud and the list speak of the same profiles with the same classes.
  const total = listTotal(data);

  // A signal the group does not have (after a change of Cine/Unde, or a link), or a retired one an older link carries:
  // back to the whole group, with a note.
  const baseKey = useMemo(() => questionKey(withScatterChoice(spec, "flag:") as unknown as QuestionSpec), [spec]);
  const asked: unknown = spec.scatter?.flag;
  const retired = isRetiredScatterFlag(asked) ? asked : null;
  const vanished = retired ? { flag: retired, why: WHY_RETIRED }
    : flag && data.group.n > 0 && ((data.criteria as Partial<Record<string, number>>)[flag] ?? 0) === 0 ? { flag, why: WHY_ABSENT } : null;
  useEffect(() => {
    if (!vanished) return;
    droppedSignal = { flag: vanished.flag, key: baseKey, why: vanished.why };
    onStrip("flag:");
  }, [vanished?.flag, baseKey]); // eslint-disable-line react-hooks/exhaustive-deps -- once per answer that lost its signal
  const dropped = !flag && !retired && droppedSignal?.key === baseKey ? droppedSignal : null;
  const stripChange = (value: string) => { droppedSignal = null; onStrip(value); };
  const criteriaOf = (code: string) => (data.criteria as Partial<Record<string, number>>)[code] ?? 0;
  const signalOptions: PillOption[] = [{ value: "", label: "Tot grupul", count: formatInt(data.group.n) },
    ...codes.filter((code) => criteriaOf(code) > 0 || code === flag).map((code): PillOption => ({
      value: code, label: scatterFlagLabel(code), count: formatInt(criteriaOf(code)), signal: true,
      ...(criteriaOf(code) === 0 ? { disabled: "Niciun profil din grup nu are acest semnal." } : {}),
    }))];
  const chooseSignal = (value: string) => { if (value !== (chosen.flag ?? flag ?? "")) { setChosen((c) => ({ ...c, flag: value })); stripChange(`flag:${value}`); } };

  const strip = <AnswerStrip rows label="Ajustează lista și semnalul">
    {/* One listed profile has no order to choose (final: no control that changes nothing). */}
    {data.group.nList >= 2 && <StripRow label="Primele după" tip={{ title: "Primele după", text: rank === "risk"
      ? legacy ? "Semnale: cele mai multe semnale; la egalitate, valoarea mai mare întâi. În listă: cine are cel puțin 20 de achiziții directe. Semnalele apar mai des la cine cumpără mult."
        : "Risc: cel mai mare risc întâi; la egalitate, valoarea mai mare. În listă: cine are cel puțin 20 de achiziții directe. Riscul nu e o probabilitate de corupție."
      : "Valoare: cea mai mare valoare a achizițiilor directe. Linia punctată: cele mai mari 10% din grup. Contractele din proceduri nu intră." }}>
      <Segmented label="Primele după" value={chosen.rank ?? rank}
        options={[{ value: "risk", label: legacy ? "Semnale" : "Risc" }, { value: "value", label: "Valoare" }]}
        onChange={(value) => { if (value !== (chosen.rank ?? rank)) { setChosen((c) => ({ ...c, rank: value })); stripChange(`rankBy:${value}`); } }} />
    </StripRow>}
    {/* Z3-21: a signal row with „Tot grupul” alone changes nothing: none. */}
    {signalOptions.length > 1 && <StripRow label="Semnal" tip={{ title: "Semnal", text: flagHelp(role) }}>
      {/* On a phone one menu, not six full-width pills before the chart (critique 15 November 2026): the same choice. */}
      <div className="sc-signal-pills">
        <Pills label="Semnal" value={chosen.flag ?? flag ?? ""} options={signalOptions} onChange={(value) => chooseSignal(value)} />
      </div>
      <label className="qb-field sc-signal-select">
        <span className="d-sr-only">Semnal</span>
        <select value={chosen.flag ?? flag ?? ""} onChange={(event) => chooseSignal(event.currentTarget.value)}>
          {signalOptions.map((o) => <option key={o.value} value={o.value} disabled={Boolean(o.disabled)}>{o.label} · {o.count}</option>)}
        </select>
      </label>
    </StripRow>}
  </AnswerStrip>;

  const records = (scope: Parameters<NonNullable<typeof evidence>["open"]>[1], title: string, plain = false) => {
    // "All of a profile's records" is the cloud's question without its chosen signal (which would narrow the sources).
    const base = plain && spec.scatter?.flag ? withScatterChoice(spec, "flag:") : undefined;
    evidence?.open(base, { role, ...scope }, title);
  };
  const lower = (code: string) => scatterFlagLabel(code).toLocaleLowerCase("ro-RO");

  const pick = (next: Picked) => setPicked(next);
  /**
   * A row opens its entity's page (owner, 6 November 2026): the whole row is its name's link, the records button stays
   * its own. A plain click remembers the list for "Înapoi"; Ctrl/Cmd/Shift-click opens another tab.
   */
  const leaveFor = (event: React.MouseEvent<HTMLLIElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target as HTMLElement).closest("a.sc-name")) return;
    rememberListReturn(spec, { shown: list.page * SCATTER_LIST_PAGE_SIZE, id, top: event.currentTarget.getBoundingClientRect().top });
  };
  const riskOf = (row: AnyListRow): Pick<Picked, "score" | "cri"> => ("cri" in row ? { cri: row.cri } : { score: row.score });
  const rowPick = (row: AnyListRow, index: number, from: Picked["from"]): Picked => ({
    id: row.entityId, name: row.name, value: row.value, nDas: row.nDas, nFlags: row.nFlags, ...riskOf(row), county: row.county, flags: row.flags.map((f) => f.code),
    kind: row.kind ?? null, employees: row.employees ?? null, employeesYear: row.employeesYear ?? null,
    place: listPlace(index + 1, total, rank, words), from,
  });
  const pickPoint = (dot: Dot, from: Picked["from"]) => {
    const point = dot.point, at = rows.findIndex((r) => r.entityId === point.id);
    if (at >= 0) return pick(rowPick(rows[at]!, at, from));
    const own = codes.filter((code) => (point.flags & codeBit(codes, code)) !== 0);
    const floor = data.group.small ? 10 : 20;
    // Past the first 50 a point of the list still has its place: the cloud drawn point by point holds the whole group.
    const place = pointPlace(data, point.id);
    pick({
      id: point.id, name: point.name, value: point.value, nDas: point.nDas, nFlags: point.nFlags, county: point.county ?? null, flags: own, from,
      ...(legacy ? { cri: point.nFlags / levels } : { score: "score" in point ? point.score : Math.round(pointLevel(data, point)) }),
      ...(place !== null ? { place: listPlace(place, total, rank, words) } : point.nDas < floor ? { place: belowListWords(point.nDas) }
        : flag && !own.includes(flag) ? { place: `nu are semnalul „${lower(flag)}”` }
        : data.historic && point.historic !== undefined ? { place: historicPlaceWords(point.historic) } : {}),
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
    if (dot) pickPoint(dot, "chart");
  };

  // "Unde e o instituție?" (part=locate): the profiles of the group whose name holds the text, with their place in the list.
  const search = async (q: string) => {
    const seq = ++searchSeq.current;
    setQuery(q);
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
  /** Why a found profile has no place: too few acquisitions, not the chosen signal, or historic (left out in the order of risk). */
  const outWords = (m: LocateMatch, signal: string): string => m.profile?.why === "below" ? belowListWords(m.n ?? 0)
    : m.profile?.why === "historic" ? historicPlaceWords(m.profile.last ?? "") : signal;
  const matchPlace = (m: LocateMatch, totalList: number): string =>
    m.rank !== null ? placeWords(m.rank, totalList, words[rank]) : outWords(m, `nu are semnalul „${flag ? lower(flag) : ""}”`);
  const openMatch = (m: LocateMatch, totalList: number) => {
    const place = matchPlace(m, totalList);
    setFound((current) => ({ results: current?.results ?? [m], name: m.name, place }));
    pick({
      id: m.id, name: m.name, value: m.value ?? 0, nDas: m.n ?? 0, nFlags: m.profile?.nFlags ?? 0, county: m.county,
      ...(legacy ? { cri: m.profile?.cri ?? 0 } : { score: matchLevel(m) }),
      flags: m.profile?.flags ?? [], place: m.rank !== null ? listPlace(m.rank, totalList, rank, words) : place, from: "find",
    });
  };

  // In the order of risk the list leaves out the historic profiles, said under its head with the way back in (owner,
  // 15 November 2026: the pattern of "Cine conduce?"; the filter's pill takes them out again). A plain <a>, as KitLink's:
  // a client navigation to the same page would change the address and keep the answer (AskPanel reads it on load).
  // UX audit Z3-20: the line under the head says who is inactive, with the way back in. Who is in the list is the
  // head's „din N”, who is in the cloud only its (?)'s (owner, 17 November 2026: less small print).
  const sum = listSumParts(data);
  const historicLine = sum && sum.historic > 0 ? <p className="sc-hist qb-tipwrap">
    <Term hold="line" tip title="Profiluri inactive" text={historicLeftOutWords(sum.historic)}>{countWords(sum.historic, "inactiv", "inactive")}</Term>{" "}
    (<a className="qb-link" href={askLink({ ...spec, filters: { ...spec.filters, includeHistoric: true } } as unknown as QuestionSpec)}>Include-le</a>)
  </p> : null;

  // The list's head: the answer's own words on its first page, then the places on screen; under a filter, of how many.
  const first = (list.page - 1) * SCATTER_LIST_PAGE_SIZE + 1;
  const span = `${formatInt(first)}–${formatInt(first + rows.length - 1)}`;
  const headWords = list.filtered
    ? rows.length ? `${rows.length === 1 ? formatInt(first) : span} din ${formatInt(list.total)} cu filtrele alese (din ${formatInt(list.all)})` : `0 din ${formatInt(list.all)}`
    : list.page > 1 ? `Locurile ${span} din ${formatInt(list.total)}` : listHeadWords(data, shown);
  const funnel = (key: string, align: "start" | "end" = "start") => <ColumnFilter column={list.columns.find((c) => c.key === key)!} value={list.filters.state[key]}
    onChange={(value) => { list.filters.set(key, value); list.setPage(1); }} facetUrl={(term) => list.facetUrl(key, list.filters.state, term)}
    onFacet={(facet) => list.filters.learn(key, facet)} align={align} />;

  const results = (found?.results ?? []).map((m) => ({
    id: m.id, name: cleanName(m.name), detail: m.rank !== null ? `locul ${formatInt(m.rank)} din ${formatInt(total)}` : outWords(m, "nu are semnalul ales"),
    ...(m.county ? { side: m.county } : {}),
  }));

  // A stored row keeps its stored facts; a picked profile's come with the answer's facts.
  const storedFlags = (id: string) => rows.find((r) => r.entityId === id)?.flags;
  const pickedFacts = picked ? withFacts<string>(storedFlags(picked.id) ?? picked.flags.map((code) => ({ code })), legacy ? undefined : facts.get(picked.id)) : [];
  const cardLines = (): CardLine[] => pickedFacts.map((fact) => ({
    tag: flagTag(fact, role),
    ...(fact.rows !== undefined && picked && isScatterFlag(fact.code) ? {
      records: { label: countWords(fact.rows, "înregistrare", "înregistrări"),
        onClick: () => records({ entityIds: [picked.id], flag: fact.code as ScatterFlag }, `${picked.name} · ${lower(fact.code)}`) },
    } : {}),
  }));

  // The way out of a small group, an empty search: the same kind in the whole country (only the place leaves, final §4.4).
  const county = groupCounty(spec, role);
  const hasPlace = Boolean(county || spec.filters.uatSiruta);
  const plural = groupPlural(role, role === "authority" ? namedKind(spec.filters.authorityKind) : null);
  const widen = (() => {
    const next = structuredClone(spec) as AskSpec;
    delete next.filters.county; delete next.filters.seatCounty; delete next.filters.uatSiruta; delete next.filters.uatName;
    return next;
  })();
  // Another question on the same page: a plain <a> (a full load, as KitLink's), since a client navigation changed the
  // address and kept the answer on screen (AskPanel reads the address on load and on «Înapoi»; 15 November 2026).
  const widenHref = askLink(widen as unknown as QuestionSpec);
  const widenLabel = data.wider !== undefined ? `Toate ${plural} din țară · ${formatInt(data.wider)}` : "Toată țara";
  const groupIn = `${plural}${county ? ` ${countyWords(county)}` : ""}`;

  const rowRecordsLabel = (row: AnyListRow) => {
    if (!live) return countWords(row.nDas, "înregistrare", "înregistrări");
    const rowsOf = facts.get(row.entityId)?.find((f) => f.code === live)?.rows;
    return rowsOf === undefined ? "Înregistrările semnalului" : countWords(rowsOf, "înregistrare", "înregistrări");
  };
  const signalRecords = (id: string) => {
    const n = facts.get(id)?.find((f) => f.code === live)?.rows;
    return n === undefined ? "Vezi înregistrările semnalului" : `Vezi cele ${formatInt(n)} cu semnalul`;
  };
  const signalRows = live ? visible.reduce((sum, row) => sum + (facts.get(row.entityId)?.find((f) => f.code === live)?.rows ?? 0), 0) : 0;
  const signalLoaded = live ? visible.every((row) => facts.get(row.entityId)?.some((f) => f.code === live)) : false;
  const signals = signalsPageLink(data, spec);
  const pointRisk = (dot: Dot) => legacy ? `${dot.point.nFlags} din ${levels} semnale` : scoreWords("score" in dot.point ? dot.point.score : 0);

  return <div className="qb sc" ref={wrap}>
    {strip}
    {/* The strip's new answer said aloud (final §4.3): "46 cu Imediat sub plafon, după risc". */}
    <span className="d-sr-only" role="status">{stripStatusWords(data)}</span>
    {dropped && <p className="sc-small" role="note">Am scos semnalul «{scatterFlagLabel(dropped.flag)}»: {dropped.why}.</p>}

    {data.group.small ? <p className="sc-small" role="note">
      {countWords(data.group.n, "profil", "profiluri")} în grup: prea puține pentru un nor. Le arătăm ca listă.
      {hasPlace && <>{" "}<a className="qb-relax-link" href={widenHref}>{widenLabel}<span className="qb-glyph" aria-hidden="true">›</span></a></>}
    </p> : <figure className="sc-figure" {...motion.root}>
      <svg className="sc-chart" role="img" width={g.box.width} height={g.box.height} viewBox={`0 0 ${g.box.width} ${g.box.height}`}
        aria-label={legacy
          ? `Norul de risc: ${countWords(data.group.n, "profil", "profiluri")}, pe ${levels + 1} benzi după numărul de semnale și pe scara valorii achizițiilor directe. Lista de mai jos are aceleași profiluri, cu cele numite.`
          : `Norul de risc: ${countWords(data.group.n, "profil", "profiluri")}, după riscul din 100 și pe scara valorii achizițiilor directe; ${formatInt(noneCount)} fără semnal în scor${field ? ", nedesenate" : ", pe axă"}. Lista de mai jos are aceleași profiluri, cu cele numite.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick}>
        {legacy ? Array.from({ length: levels + 1 }, (_, k) => {
          const label = bandIndex(k, levels);
          return <g key={k} className="sc-band">
            <rect x={g.pad.l} y={g.yAt(k) - g.bandH / 2} width={g.plotW} height={g.bandH} className={k % 2 ? "sc-stripe" : "sc-stripe is-alt"} />
            <text x={g.pad.l - 8} y={g.yAt(k) - 1} textAnchor="end" className="sc-idx">{label.index}</text>
            <text x={g.pad.l - 8} y={g.yAt(k) + 11} textAnchor="end" className="sc-ratio">{label.ratio}</text>
          </g>;
        }) : <g className="sc-risk-axis">
          {/* The bands of the score, faintly tinted (slab, moderat, pronunțat), a line where each stronger one starts, and
              their words: in the margin on a desktop, beside a coloured rail; inside the plot on a phone. */}
          {RISK_ZONES.map((z) => <rect key={z.band} x={g.pad.l} y={g.yAt(z.to)} width={g.plotW} height={g.yAt(z.from) - g.yAt(z.to)}
            className={`sc-zone ${RISK_BAND_CLASS[z.band]}`} />)}
          {RISK_GRID.map((s) => <line key={s} x1={g.pad.l} x2={g.pad.l + g.plotW} y1={g.yAt(s)} y2={g.yAt(s)} className="sc-grid sc-grid-y" />)}
          {/* The value axis, right under the field (owner, 19 November 2026: no second chart under it). A listed or found
              profile without a signal in the score sits on this line. */}
          <line x1={g.pad.l} x2={g.pad.l + g.plotW} y1={g.axisY ?? g.yAt(10)} y2={g.axisY ?? g.yAt(10)} className="sc-floor" />
          {RISK_AXIS.map((s) => <text key={s} x={g.pad.l - 6} y={g.yAt(s) + 4} textAnchor="end" className="sc-idx">{s}</text>)}
          <text x={4} y={g.pad.t - 8} className="sc-axis">risc</text>
          {RISK_ZONES.map((z) => g.box.compact
            ? <text key={z.band} x={g.pad.l + 5} y={g.yAt(z.to) + 14} className={`sc-zone-word ${RISK_BAND_CLASS[z.band]}`}>{RISK_BAND_WORD[z.band]}</text>
            : <g key={z.band} className={`sc-rail ${RISK_BAND_CLASS[z.band]}`}>
              <rect x={g.pad.l + g.plotW + 8} y={g.yAt(z.to) + 1} width={3} height={g.yAt(z.from) - g.yAt(z.to) - 2} rx={1.5} />
              <text x={g.pad.l + g.plotW + 18} y={(g.yAt(z.to) + g.yAt(z.from)) / 2 - 2} className="sc-zone-word">{RISK_BAND_WORD[z.band]}</text>
              <text x={g.pad.l + g.plotW + 18} y={(g.yAt(z.to) + g.yAt(z.from)) / 2 + 13} className="sc-tick">{z.from}–{z.to === 100 ? 100 : z.to - 1}</text>
            </g>)}
        </g>}
        {g.ticks.map((t) => <g key={t.lg}>
          <line x1={t.x} x2={t.x} y1={g.pad.t} y2={g.box.height - g.pad.b} className="sc-grid" />
          <text x={t.x} y={g.box.height - g.pad.b + 16} textAnchor="middle" className="sc-tick">{t.text}{g.box.compact ? "" : " lei"}</text>
        </g>)}
        <text x={g.pad.l + g.plotW / 2} y={g.box.height - 6} textAnchor="middle" className="sc-axis">achiziții directe, lei (pas = de zece ori mai mult)</text>
        {p90At && <g className={`sc-p90${rank === "value" ? " is-on" : ""}`}>
          <line x1={g.x(data.p90)} x2={g.x(data.p90)} y1={g.pad.t - 4} y2={g.box.height - g.pad.b} />
          <text x={p90At.x} y={p90At.y} textAnchor={p90At.anchor}>{p90Words}</text>
        </g>}
        {/* Up to 2000 points or about 300 cells: each layer fades as a group, never point by point. A signal's layer is
            its own (keyed by it): another signal fades its points in. */}
        {legacy && "bands" in data.cloud && <g className={`sc-cells ${motion.enter("cm-fade")}`}>{cellRects(data.cloud.bands, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={c.o} className="sc-cell" />)}</g>}
        {legacy && "bands" in data.cloud && data.cloud.flagged && <g key={`cells:${flag ?? ""}`} ref={motion.join} className={`sc-cells is-flag ${motion.enter("cm-fade")}`}>{cellRects(data.cloud.flagged, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={Math.min(1, c.o + 0.15)} className="sc-cell" />)}</g>}
        {/* The density field (green, more is darker; one group of marks, faded in as one). */}
        {field && <g className={`sc-cells ${motion.enter("cm-fade")}`}>
          {field.cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={1.2} className={`sc-cell s${c.step}`} />)}
        </g>}
        {flaggedField && <g key={`cells:${flag ?? ""}`} ref={motion.join} className={`sc-cells is-flag ${motion.enter("cm-fade")}`}>
          {flaggedField.cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={1.2} className={`sc-cell s${c.step}`} />)}
        </g>}
        <g className={motion.enter("cm-fade")}>{all.filter((d) => !d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={3} className="sc-dot" />)}</g>
        <g key={`points:${flag ?? ""}`} ref={motion.join} className={motion.enter("cm-fade")}>{all.filter((d) => d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4} className="sc-dot is-flag" />)}</g>
        {/* The list's points (at most 50): each fades in at its place, together; one the list gains fades in. */}
        {all.filter((d) => d.listed).map((d) => <circle key={d.point.id} ref={motion.join} cx={d.x} cy={d.y} r={4.5} className={`sc-dot is-list${d.flagged ? " is-flag" : ""} cm-tw ${motion.enter("cm-pt")}`} />)}
        {extra.map((d) => <circle key={d.point.id} ref={motion.join} cx={d.x} cy={d.y} r={4} className={`sc-dot${d.flagged ? " is-flag" : ""}`} />)}
        {labels.map((l) => <text key={l.id} ref={motion.join} x={l.x} y={l.y} textAnchor={l.anchor} className={`sc-label ${motion.enter("cm-fade cm-late")}`} style={FAST}>{l.text}</text>)}
        {picked && (() => {
          const d = drawn.find((x) => x.point.id === picked.id);
          // Chosen or found alone, its ring draws once from the top in 300 ms (M-03); a new choice draws anew.
          return d ? <SelectRing key={picked.id} cx={d.x} cy={d.y} r={9} className="sc-ring" /> : null;
        })()}
        {found?.results.map((m) => { const d = drawn.find((x) => x.point.id === m.id); return d ? <circle key={m.id} cx={d.x} cy={d.y} r={8} className="sc-ring is-find cm-pt" style={FAST} /> : null; })}
      </svg>
      {hover && <div className="sc-hover tipcard" style={{ left: Math.min(hover.x + 12, g.box.width - 250), top: Math.max(hover.y - 8, 0) }} role="presentation">
        <b className="tipcard-t">{cleanName(hover.dot.point.name)}</b>
        <span>{formatRon(hover.dot.point.value)} · {pointRisk(hover.dot)}</span>
      </div>}
      <figcaption className={`sc-legend${legacy ? "" : " qb-tipwrap"}`}>
        {/* Who is left of the axis is in the (i) after the ramp (owner, 17 November 2026: less small print). */}
        {field ? <span><span className="sc-ramp" aria-hidden="true">{field.steps.map((_, i) => <i key={i} className={`s${i}`} />)}</span>
          {firm ? "firme" : "instituții"} pe pătrățel: {stepWords(field.steps).join(" · ")}
          {field.below > 0 && <>{" "}<InfoMark title="La stânga axei" text={`${countWords(field.below, firm ? "firmă" : "instituție", firm ? "firme" : "instituții")}, sub ${"bands" in data.cloud ? axisWords(10 ** data.cloud.bands.minLog) : ""} lei.`} /></>}</span>
          : <span><i className="sc-key" aria-hidden="true" /> grupul</span>}
        {flag && <span><i className="sc-key is-flag" aria-hidden="true" /> cu „{lower(flag)}”</span>}
        <span><i className="sc-key is-list" aria-hidden="true" /> în listă</span>
        <span><i className="sc-key is-ring" aria-hidden="true" /> ales sau căutat</span>
        <span><i className="sc-key is-line" aria-hidden="true" /> {p90Words}</span>
        {!legacy && <span>riscul, din 100 <HelpTip tip={{ id: "scor-risc" }} /></span>}
        {/* The profiles without a signal in the score: counted here, not drawn (owner, 19 November 2026); one that is
            listed, found or a small group's point sits on the value axis. */}
        {!legacy && noneCount > 0 && <span className="sc-none-note">{formatInt(noneCount)} fără semnal în scor: {field ? (axisDots ? "nedesenate; cele din listă, pe axă" : "nedesenate") : "pe axă"}</span>}
      </figcaption>
    </figure>}

    {/* Z3-21: under ten profiles the list shows them all; there is nothing to find. */}
    {data.group.n >= SCATTER_FEW && <div className="sc-find">
      <Locate key={`${data.flag ?? ""}|${data.rankBy}`} label={firm ? "Unde e o firmă?" : "Unde e o instituție?"} results={results} loading={searching} onSearch={(q) => void search(q)} delay={LOCATE_DEBOUNCE_MS} minChars={LOCATE_MIN_CHARS}
        emptyText={`Niciun profil „${query}” în ${groupIn}.`}
        onPick={(result) => { const m = found?.results.find((x) => x.id === result.id); if (m) openMatch(m, total); }}
        found={found && found.name ? { name: cleanName(found.name), place: found.place } : null} />
      {found && !searching && found.results.length === 0 && hasPlace
        && <a className="qb-relax-link sc-wide" href={widenHref}>Caută în toată țara<span className="qb-glyph" aria-hidden="true">›</span></a>}
    </div>}

    {picked && <DetailCard
      title={cleanName(picked.name)}
      entity={{ id: picked.id, role }}
      meta={[firm ? employeesWords(picked.employees, picked.employeesYear) : kindWords(picked.kind), picked.county, picked.place].filter(Boolean).join(" · ")}
      facts={(legacy ? cardFactsV2(picked.value, picked.cri ?? 0, picked.nFlags, levels) : cardFacts(picked.value, picked.score ?? 0)).map((f) => ({ label: f.label, value: f.value }))}
      lines={cardLines()}
      onClose={() => setPicked(null)}
      actions={[
        ...(live && picked.flags.includes(live) ? [{ label: signalRecords(picked.id), glyph: "→" as const,
          onClick: () => records({ entityIds: [picked.id], flag: live }, `${picked.name} · ${lower(live)}`) }] : []),
        { label: countWords(picked.nDas, "înregistrare", "înregistrări"), glyph: "→" as const, onClick: () => records({ entityIds: [picked.id] }, `${picked.name} · înregistrările profilului`, true) },
        { label: "Unde se situează?", glyph: "›" as const, href: askLink({ block: "distribution", measure: "value", dim: role, filters: { [`${role}Id`]: Number(picked.id), [`${role}Name`]: picked.name } } as unknown as QuestionSpec) },
      ]}
    />}

    {rows.length > 0 || list.filtered ? <section className="sc-list-wrap" aria-label="Lista profilurilor">
      <h3 className="qb-tipwrap sc-list-head" role="status">{headWords} <HelpTip tip={{ title: listHeadWords(data, shown), text: listHeadTip(data) }} /></h3>
      {historicLine}
      {/* Z3-21: a group where nobody has a score says it once, above its rows of „0 din 100”. */}
      {!legacy && !list.filtered && rows.length > 1 && rows.every((r) => "score" in r && (r.score ?? 0) === 0) && <p className="sc-hist">Niciunul nu are semnale în scor.</p>}
      {/* The whole list under its column filters (owner, 19 November 2026): the applied ones as chips, a funnel on
          each column above the rows. A stored answer or a small group has its rows alone, paged. */}
      {list.server && <FilterBand columns={list.columns} state={list.filters.state} labels={list.filters.labels} onChange={(next) => { list.filters.replace(next); list.setPage(1); }} />}
      {/* The funnels, the pages and an applied filter's chip are in both modes (owner, 20 November 2026, decision E). */}
      {list.server && <div className="sc-cols" role="group" aria-label="Filtre pe coloane">
        <span className="sc-col-who">
          <span className="th-filter">{firm ? "Firmă" : "Instituție"}{funnel("nume")}</span>
          <span className="th-filter">Județ{funnel("judet")}</span>
          <span className="th-filter">Tipare{funnel("tipare")}</span>
        </span>
        <span className="sc-col-val"><span className="th-filter">Valoare{funnel("valoare", "end")}</span></span>
        <span className="sc-col-cri"><span className="th-filter">Risc{funnel("risc", "end")}</span></span>
        <span className="sc-col-rec"><span className="th-filter">Achiziții directe{funnel("achizitii", "end")}</span></span>
      </div>}
      {rows.length === 0 && <p className="qb-empty-note sc-none" role="status">Niciun profil cu filtrele alese. <button type="button" className="qb-link sc-clear" onClick={() => { list.filters.replace({}); list.setPage(1); }}>Scoate filtrele</button></p>}
      {list.error && <p className="sc-hist" role="status">Pagina nu a putut fi încărcată. <button type="button" className="qb-link sc-clear" onClick={list.retry}>Reîncearcă</button></p>}
      <ol className={`sc-list${list.loading ? " g-stale" : ""}`} ref={listRef} aria-busy={list.loading || undefined} start={first}>
        {visible.map((row, index) => {
          const own = withFacts<string>(row.flags, legacy ? undefined : facts.get(row.entityId));
          // The row is its name's link to the entity's page (the link covers it, scatter.css); its records are the button on
          // the right. Picked in the chart, the row is marked. "Arată încă 10" focuses the first new row (data-qb-arow).
          return <li key={row.entityId} tabIndex={-1} data-qb-arow="" className={`sc-row${picked?.id === row.entityId ? " is-picked" : ""}`}
            onClickCapture={(event) => leaveFor(event, row.entityId)}>
            <span className="sc-rank qb-num">{first + index}</span>
            <span className="sc-who">
              <EntityName id={row.entityId} role={role} className="sc-name">{cleanName(row.name)}</EntityName>
              {/* Z3-22: the count of direct acquisitions is the records link's, which says it (not with a signal chosen; owner,
                  17 November 2026: on every screen). */}
              <small>{live ? rowMeta(row, role) : rowPlace(row, role)}</small>
              {/* The patterns are on the score's pill (owner, 20 November 2026); an inactive profile keeps its mark. A
                  stored scatter-2 has no pill: its rows keep their signals' tags, as they were drawn. */}
              {(row.historic !== undefined || ("cri" in row && own.length > 0)) && <span className="qb-tags">
                {row.historic !== undefined && <FactTag fact={historicFact(row.historic)} />}
                {"cri" in row && own.map((fact) => <FactTag key={fact.code} fact={flagTag(fact, role)} />)}
              </span>}
            </span>
            <span className="sc-val qb-num">{formatRon(row.value)}</span>
            <RowRisk row={row} levels={levels} parts={own} />
            <button type="button" className="qb-rec sc-rec"
              onClick={() => records({ entityIds: [row.entityId], ...(live ? { flag: live } : {}) }, `${row.name} · ${live ? lower(live) : "înregistrările profilului"}`)}>
              {rowRecordsLabel(row)}<span className="qb-glyph" aria-hidden="true">→</span></button>
          </li>;
        })}
      </ol>
      {/* Pages instead of „Arată încă 10” (owner, 19 November 2026); the records are the page's rows'. */}
      <div className="qb-listfoot sc-listfoot">
        <Pager page={list.page} pages={list.pages} busy={list.loading} label="Paginile listei"
          onPage={(n) => { list.setPage(n); listRef.current?.closest(".sc-list-wrap")?.scrollIntoView({ block: "nearest" }); }} />
        {rows.length > 0 && <KitLink className="qb-secondary" link={{ label: live ? (signalLoaded ? `Vezi cele ${countWords(signalRows, "înregistrare", "înregistrări")} cu semnalul` : "Vezi înregistrările cu semnalul") : `Vezi cele ${countWords(visible.reduce((n, r) => n + r.nDas, 0), "înregistrare", "înregistrări")}`, glyph: "→",
          onClick: () => records({ entityIds: visible.map((r) => r.entityId), ...(live ? { flag: live } : {}) }, live ? `semnalul „${lower(live)}” · profilurile din listă` : "profilurile din listă", !live) }} />}
      </div>
      <p className="sc-more"><Link className="qb-link" href={signals.href}>{signals.label}<span className="qb-glyph" aria-hidden="true">→</span></Link></p>
    </section> : data.historic ? historicLine
      : <p className="qb-empty-note sc-none">{flag ? `Niciun profil din grup cu 20 de achiziții directe nu are semnalul „${lower(flag)}”.` : "Niciun profil din grup nu are destule achiziții directe pentru listă."}</p>}

    {/* The answer's caveats are in „Cum am calculat” under the answer (owner, 19 November 2026; scatterNote, AskPanel). */}
  </div>;
}
