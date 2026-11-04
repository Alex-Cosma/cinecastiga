"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { countWords, formatDecimal } from "../../lib/ask/answer-text";
import type { LocateMatch, LocateResult } from "../../lib/ask/facet-parts";
import { LOCATE_DEBOUNCE_MS, LOCATE_MIN_CHARS } from "../../lib/ask/facet-parts";
import { askLink } from "../../lib/ask/source-spec";
import { countyWords, questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import {
  SCATTER_LIST_MAX, SCATTER_LIST_PAGE, belowListWords, codeBit, groupPlural, isRetiredScatterFlag, isScatterFlag, listPlace, scatterCodes, scatterFlagLabel, scatterFlagsOf,
  withScatterChoice, type ScatterData, type ScatterFlag, type ScatterFlagFact,
} from "../../lib/ask/scatter-shared";
import { namedKind, type AskSpec } from "../../lib/ask/spec";
import { flagEntityRule, flagLabel } from "../../lib/flags";
import { RISK_BAND_CLASS, riskBand, riskScoreText } from "../../lib/risk-score";
import { cleanName, formatInt, formatRon } from "../../lib/format";
import EntityName from "../../components/EntityName";
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
  RISK_AXIS, RISK_GRID, RISK_ZONES, bandIndex, cardFacts, cardFactsV2, cellRects, chartLabels, dots, employeesWords, exactDot, fetchScatterFacts, flagTag, geometry, groupCounty,
  keptScatterFacts, kindWords, listHeadTip, listHeadWords, nearest, p90Label, p90Words, pointLevel, pointPlace, rankWords, rowMeta, scatterFactsKey, scoreBandWord, scoreWords,
  signalsPageLink, stripStatusWords, withFacts, type AnyListRow, type Dot,
} from "./scatter-answer";
import "./scatter.css";

/*
 * "Ce instituții / firme ies din tipar?" (scatter-3, rf-2026.18; plan §4.12,
 * final scatter §3.3–§3.6, §4.3, §4.6): the strip beside the chart chooses who
 * is named ("Primele după" Risc | Valoare, "Semnal" with the number of
 * profiles that have each of the risk score's criteria), the chart puts each
 * profile at its risk score (0–100%, the bands' lines at 20, 40 and 68) and its
 * value, the group stays the whole cloud and the chosen signal colours its
 * points; "Unde e o instituție?" finds a profile in the group, a point, a row or
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
  /** Where it was picked, so the focus goes back there on closing. */
  from: "chart" | "list" | "find";
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
function RowRisk({ row, levels }: { row: AnyListRow; levels: number }) {
  if ("cri" in row) return <span className="sc-cri qb-num">{formatDecimal(row.cri, levels === 4 ? 2 : 1)} · {row.nFlags} din {levels}</span>;
  return <span className="sc-cri sc-risk">
    <span className={`cri-pill ${RISK_BAND_CLASS[riskBand(row.score)]}`}>{riskScoreText(row.score)}</span>
    <small>{scoreBandWord(row.score)}</small>
  </span>;
}

export default function ScatterAnswer({ data, spec, onStrip }: ScatterAnswerProps) {
  const evidence = useAnswerEvidence();
  const [wrap, width] = useWidth();
  const [more, setMore] = useState(SCATTER_LIST_PAGE);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; dot: Dot } | null>(null);
  const [found, setFound] = useState<{ results: LocateMatch[]; name: string; place: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [answered, setAnswered] = useState(data);
  // The strip's choice while its answer is on the way (a short new query): the buttons move at once.
  const [chosen, setChosen] = useState<{ rank?: string; flag?: string }>({});
  const searchSeq = useRef(0);
  const listRef = useRef<HTMLOListElement>(null), returnTo = useRef<HTMLElement | null>(null);
  if (answered !== data) { setAnswered(data); setChosen({}); setMore(SCATTER_LIST_PAGE); setPicked(null); setFound(null); }

  const { role } = data;
  // A stored scatter-2 (before rf-2026.18): its bands, index and signals, as it was drawn.
  const legacy = data.version === 2;
  const levels = data.version === 2 ? data.levels : 0;
  const words = rankWords(data);
  const codes = scatterCodes(data);
  const firm = role === "supplier";
  const rows: readonly AnyListRow[] = data.list;
  const shown = Math.min(more, rows.length);
  const visible = rows.slice(0, shown);
  const flag = data.flag;
  /** The chosen signal when the records can be asked for it (a stored answer's retired one cannot). */
  const live = flag && isScatterFlag(flag) ? flag : null;
  const g = useMemo(() => geometry(data, width), [data, width]);
  const listed = useMemo(() => new Set(rows.map((r) => r.entityId)), [rows]);
  const all = useMemo(() => dots(data, g, listed), [data, g, listed]);
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
  const wanted = useMemo(() => [...visible.map((r) => r.entityId), ...(picked ? [picked.id] : [])], [visible, picked]);
  // A stored scatter-2 keeps the facts it was stored with: today's facts are of today's signals.
  const { facts } = useProfileFacts(spec, wanted, !legacy);
  const rank = data.rankBy;
  // The first names of the list on the chart, each where it fits; the chosen and the found points' always (chartLabels).
  const focus = useMemo(() => [...(picked ? [{ id: picked.id, text: chartName(picked.name) }] : []),
    ...(found?.results ?? []).slice(0, 3).map((m) => ({ id: m.id, text: chartName(m.name) }))], [picked, found]);
  const labels = useMemo(() => chartLabels(rows.slice(0, g.box.compact ? 3 : 6).map((row) => ({ id: row.entityId, text: chartName(row.name) })), drawn, g, data.p90, focus),
    [rows, drawn, g, data.p90, focus]);
  const p90At = data.p90 > 0 ? p90Label(g, data.p90) : null;

  // The legend, the cloud and the list speak of the same profiles with the same classes.
  const total = data.chosen ? data.chosen.nList : data.group.nList;

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
    <StripRow label="Semnal" tip={{ title: "Semnal", text: flagHelp(role) }}>
      <Pills label="Semnal" value={chosen.flag ?? flag ?? ""}
        options={[{ value: "", label: "Tot grupul", count: formatInt(data.group.n) } as PillOption,
          ...codes.filter((code) => criteriaOf(code) > 0 || code === flag).map((code): PillOption => ({
            value: code, label: scatterFlagLabel(code), count: formatInt(criteriaOf(code)), signal: true,
            ...(criteriaOf(code) === 0 ? { disabled: "Niciun profil din grup nu are acest semnal." } : {}),
          }))]}
        onChange={(value) => { if (value !== (chosen.flag ?? flag ?? "")) { setChosen((c) => ({ ...c, flag: value })); stripChange(`flag:${value}`); } }} />
    </StripRow>
  </AnswerStrip>;

  const records = (scope: Parameters<NonNullable<typeof evidence>["open"]>[1], title: string, plain = false) => {
    // "All of a profile's records" is the cloud's question without its chosen signal (which would narrow the sources).
    const base = plain && spec.scatter?.flag ? withScatterChoice(spec, "flag:") : undefined;
    evidence?.open(base, { role, ...scope }, title);
  };
  const lower = (code: string) => scatterFlagLabel(code).toLocaleLowerCase("ro-RO");

  const pick = (next: Picked) => setPicked(next);
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
        : flag && !own.includes(flag) ? { place: `nu are semnalul „${lower(flag)}”` } : {}),
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
  const matchPlace = (m: LocateMatch, totalList: number): string =>
    m.rank !== null ? placeWords(m.rank, totalList, words[rank])
      : m.profile?.why === "below" ? belowListWords(m.n ?? 0) : `nu are semnalul „${flag ? lower(flag) : ""}”`;
  const openMatch = (m: LocateMatch, totalList: number) => {
    const place = matchPlace(m, totalList);
    setFound((current) => ({ results: current?.results ?? [m], name: m.name, place }));
    pick({
      id: m.id, name: m.name, value: m.value ?? 0, nDas: m.n ?? 0, nFlags: m.profile?.nFlags ?? 0, county: m.county,
      ...(legacy ? { cri: m.profile?.cri ?? 0 } : { score: matchLevel(m) }),
      flags: m.profile?.flags ?? [], place: m.rank !== null ? listPlace(m.rank, totalList, rank, words) : place, from: "find",
    });
  };

  const results = (found?.results ?? []).map((m) => ({
    id: m.id, name: cleanName(m.name), detail: m.rank !== null ? `locul ${formatInt(m.rank)} din ${formatInt(total)}` : m.profile?.why === "below" ? belowListWords(m.n ?? 0) : "nu are semnalul ales",
    ...(m.county ? { side: m.county } : {}),
  }));

  // A stored row keeps its stored facts; a picked profile's come with the answer's facts.
  const storedFlags = (id: string) => rows.find((r) => r.entityId === id)?.flags;
  const pickedFacts = picked ? withFacts<string>(storedFlags(picked.id) ?? picked.flags.map((code) => ({ code })), legacy ? undefined : facts.get(picked.id)) : [];
  const cardLines = (): CardLine[] => pickedFacts.map((fact) => ({
    tag: flagTag(fact),
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
    {/* The strip's new answer said aloud (final §4.3): "46 cu Chiar sub plafon, după risc". */}
    <span className="d-sr-only" role="status">{stripStatusWords(data)}</span>
    {dropped && <p className="sc-small" role="note">Am scos semnalul «{scatterFlagLabel(dropped.flag)}»: {dropped.why}.</p>}

    {data.group.small ? <p className="sc-small" role="note">
      {countWords(data.group.n, "profil", "profiluri")} în grup: prea puține pentru un nor. Le arătăm ca listă.
      {hasPlace && <>{" "}<Link className="qb-relax-link" href={widenHref}>{widenLabel}<span className="qb-glyph" aria-hidden="true">›</span></Link></>}
    </p> : <figure className="sc-figure">
      <svg className="sc-chart" role="img" width={g.box.width} height={g.box.height} viewBox={`0 0 ${g.box.width} ${g.box.height}`}
        aria-label={legacy
          ? `Norul de risc: ${countWords(data.group.n, "profil", "profiluri")}, pe ${levels + 1} benzi după numărul de semnale și pe scara valorii achizițiilor directe. Lista de mai jos are aceleași profiluri, cu cele numite.`
          : `Norul de risc: ${countWords(data.group.n, "profil", "profiluri")}, după risc, de la 0 la 100%, și pe scara valorii achizițiilor directe. Lista de mai jos are aceleași profiluri, cu cele numite.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick}>
        {legacy ? Array.from({ length: levels + 1 }, (_, k) => {
          const label = bandIndex(k, levels);
          return <g key={k} className="sc-band">
            <rect x={g.pad.l} y={g.yAt(k) - g.bandH / 2} width={g.plotW} height={g.bandH} className={k % 2 ? "sc-stripe" : "sc-stripe is-alt"} />
            <text x={g.pad.l - 8} y={g.yAt(k) - 1} textAnchor="end" className="sc-idx">{label.index}</text>
            <text x={g.pad.l - 8} y={g.yAt(k) + 11} textAnchor="end" className="sc-ratio">{label.ratio}</text>
          </g>;
        }) : <g className="sc-risk-axis">
          {/* The bands of the score, tinted (slab, moderat, puternic), with a line where each starts. */}
          {RISK_ZONES.map((z) => <rect key={z.band} x={g.pad.l} y={g.yAt(z.to)} width={g.plotW} height={g.yAt(z.from) - g.yAt(z.to)}
            className={`sc-zone ${RISK_BAND_CLASS[z.band]}`} />)}
          {RISK_GRID.map((s) => <line key={s} x1={g.pad.l} x2={g.pad.l + g.plotW} y1={g.yAt(s)} y2={g.yAt(s)} className="sc-grid sc-grid-y" />)}
          {RISK_AXIS.map((s) => <text key={s} x={g.pad.l - 6} y={g.yAt(s) + 4} textAnchor="end" className="sc-idx">{s}</text>)}
          <text x={4} y={g.pad.t - 8} className="sc-axis">risc</text>
        </g>}
        {g.ticks.map((t) => <g key={t.lg}>
          <line x1={t.x} x2={t.x} y1={g.pad.t} y2={g.box.height - g.pad.b} className="sc-grid" />
          <text x={t.x} y={g.box.height - g.pad.b + 16} textAnchor="middle" className="sc-tick">{t.text}{g.box.compact ? "" : " lei"}</text>
        </g>)}
        <text x={g.pad.l + g.plotW / 2} y={g.box.height - 6} textAnchor="middle" className="sc-axis">achiziții directe (scară logaritmică)</text>
        {p90At && <g className={`sc-p90${rank === "value" ? " is-on" : ""}`}>
          <line x1={g.x(data.p90)} x2={g.x(data.p90)} y1={g.pad.t - 4} y2={g.box.height - g.pad.b} />
          <text x={p90At.x} y={p90At.y} textAnchor={p90At.anchor}>{p90Words}</text>
        </g>}
        {"bands" in data.cloud && <g className="sc-cells">{cellRects(data.cloud.bands, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={c.o} className="sc-cell" />)}</g>}
        {"bands" in data.cloud && data.cloud.flagged && <g className="sc-cells is-flag">{cellRects(data.cloud.flagged, g).map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} opacity={Math.min(1, c.o + 0.15)} className="sc-cell" />)}</g>}
        {all.filter((d) => !d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={3} className="sc-dot" />)}
        {all.filter((d) => d.flagged && !d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4} className="sc-dot is-flag" />)}
        {all.filter((d) => d.listed).map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4.5} className={`sc-dot is-list${d.flagged ? " is-flag" : ""}`} />)}
        {extra.map((d) => <circle key={d.point.id} cx={d.x} cy={d.y} r={4} className={`sc-dot${d.flagged ? " is-flag" : ""}`} />)}
        {labels.map((l) => <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className="sc-name">{l.text}</text>)}
        {picked && (() => {
          const d = drawn.find((x) => x.point.id === picked.id);
          return d ? <circle cx={d.x} cy={d.y} r={9} className="sc-ring" /> : null;
        })()}
        {found?.results.map((m) => { const d = drawn.find((x) => x.point.id === m.id); return d ? <circle key={m.id} cx={d.x} cy={d.y} r={8} className="sc-ring is-find" /> : null; })}
      </svg>
      {hover && <div className="sc-hover" style={{ left: Math.min(hover.x + 12, g.box.width - 190), top: Math.max(hover.y - 8, 0) }} role="presentation">
        <b>{cleanName(hover.dot.point.name)}</b>
        <span>{formatRon(hover.dot.point.value)} · {pointRisk(hover.dot)}</span>
      </div>}
      <figcaption className={`sc-legend${legacy ? "" : " qb-tipwrap"}`}>
        <span><i className="sc-key" aria-hidden="true" /> grupul</span>
        {flag && <span><i className="sc-key is-flag" aria-hidden="true" /> cu „{lower(flag)}”</span>}
        <span><i className="sc-key is-list" aria-hidden="true" /> în listă</span>
        <span><i className="sc-key is-ring" aria-hidden="true" /> ales sau căutat</span>
        <span><i className="sc-key is-line" aria-hidden="true" /> {p90Words}</span>
        {!legacy && <span>riscul, din 100 <HelpTip tip={{ id: "scor-risc" }} /></span>}
      </figcaption>
    </figure>}

    <div className="sc-find">
      <Locate key={`${data.flag ?? ""}|${data.rankBy}`} label={firm ? "Unde e o firmă?" : "Unde e o instituție?"} results={results} loading={searching} onSearch={(q) => void search(q)} delay={LOCATE_DEBOUNCE_MS} minChars={LOCATE_MIN_CHARS}
        emptyText={`Niciun profil „${query}” în ${groupIn}.`}
        onPick={(result) => { const m = found?.results.find((x) => x.id === result.id); if (m) openMatch(m, total); }}
        found={found && found.name ? { name: cleanName(found.name), place: found.place } : null} />
      {found && !searching && found.results.length === 0 && hasPlace
        && <Link className="qb-relax-link sc-wide" href={widenHref}>Caută în toată țara<span className="qb-glyph" aria-hidden="true">›</span></Link>}
    </div>

    {picked && <DetailCard
      title={cleanName(picked.name)}
      entity={{ id: picked.id, role }}
      meta={[firm ? employeesWords(picked.employees, picked.employeesYear) : kindWords(picked.kind), picked.county, picked.place].filter(Boolean).join(" · ")}
      facts={(legacy ? cardFactsV2(picked.value, picked.cri ?? 0, picked.nFlags, levels) : cardFacts(picked.value, picked.score ?? 0, picked.nFlags)).map((f) => ({ label: f.label, value: f.value }))}
      lines={cardLines()}
      returnTo={returnTo.current}
      onClose={() => setPicked(null)}
      actions={[
        ...(live && picked.flags.includes(live) ? [{ label: signalRecords(picked.id), glyph: "→" as const,
          onClick: () => records({ entityIds: [picked.id], flag: live }, `${picked.name} · ${lower(live)}`) }] : []),
        { label: "Vezi înregistrările", glyph: "→" as const, onClick: () => records({ entityIds: [picked.id] }, `${picked.name} · înregistrările profilului`, true) },
        { label: "Unde se situează?", glyph: "›" as const, href: askLink({ block: "distribution", measure: "value", dim: role, filters: { [`${role}Id`]: Number(picked.id), [`${role}Name`]: picked.name } } as unknown as QuestionSpec) },
      ]}
    />}

    {rows.length > 0 ? <section className="sc-list-wrap" aria-label="Lista profilurilor">
      <h3 className="qb-tipwrap sc-list-head">{listHeadWords(data, shown)} <HelpTip tip={{ title: listHeadWords(data, shown), text: listHeadTip(data) }} /></h3>
      <ol className="sc-list" ref={listRef}>
        {visible.map((row, index) => {
          const own = withFacts<string>(row.flags, legacy ? undefined : facts.get(row.entityId));
          // The row shows its profile in the chart; its name opens the entity's page, its records are the button on the right.
          return <li key={row.entityId} className={`sc-row${picked?.id === row.entityId ? " is-picked" : ""}`}
            onClick={(event) => { if ((event.target as HTMLElement).closest("a,button")) return; returnTo.current = event.currentTarget.querySelector<HTMLElement>(".sc-pick"); pick(rowPick(row, index, "list")); }}>
            <button type="button" data-qb-arow="" className="sc-rank sc-pick qb-num" aria-label={`Arată în grafic: ${cleanName(row.name)}`}
              onClick={(event) => { returnTo.current = event.currentTarget; pick(rowPick(row, index, "list")); }}>{index + 1}</button>
            <span className="sc-who">
              <EntityName id={row.entityId} role={role} className="sc-name">{cleanName(row.name)}</EntityName>
              <small>{rowMeta(row, role)}</small>
              {own.length > 0 && <span className="qb-tags">{own.map((fact) => <FactTag key={fact.code} fact={flagTag(fact)} />)}</span>}
            </span>
            <span className="sc-val qb-num">{formatRon(row.value)}</span>
            <RowRisk row={row} levels={levels} />
            <button type="button" className="qb-rec sc-rec"
              onClick={() => records({ entityIds: [row.entityId], ...(live ? { flag: live } : {}) }, `${row.name} · ${live ? lower(live) : "înregistrările profilului"}`)}>
              {rowRecordsLabel(row)}<span className="qb-glyph" aria-hidden="true">→</span></button>
          </li>;
        })}
      </ol>
      <ListFoot shown={shown} total={rows.length} noun={["profil", "profiluri", "n"]} list={listRef} onMore={() => setMore((m) => Math.min(m + SCATTER_LIST_PAGE, rows.length))}
        records={{ label: live ? (signalLoaded ? `Vezi cele ${countWords(signalRows, "înregistrare", "înregistrări")} cu semnalul` : "Vezi înregistrările cu semnalul") : "Vezi înregistrările celor din listă", glyph: "→",
          onClick: () => records({ entityIds: visible.map((r) => r.entityId), ...(live ? { flag: live } : {}) }, live ? `semnalul „${lower(live)}” · profilurile din listă` : "profilurile din listă", !live) }} />
      <p className="sc-more"><Link className="qb-link" href={signals.href}>{signals.label}<span className="qb-glyph" aria-hidden="true">↗</span></Link></p>
    </section> : <p className="qb-empty-note sc-none">{flag ? `Niciun profil din grup cu 20 de achiziții directe nu are semnalul „${lower(flag)}”.` : "Niciun profil din grup nu are destule achiziții directe pentru listă."}</p>}

    <p className="sc-foot qb-tipwrap">{legacy ? "Semnalele" : "Tiparele"} sunt piste, nu dovezi. Valori înregistrate, nu plăți.{" "}
      <HelpTip tip={{ title: "Valori înregistrate", text: "Suma achizițiilor directe acceptate, fiecare de cel mult 2 mil. lei. Contractele din proceduri nu intră în profil." }} /></p>
  </div>;
}
