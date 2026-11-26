"use client";

import { DoneCheck, useFlag } from "../../../../components/motion/Done";
import { useChangedMark } from "../../../../components/motion/changed";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import OptionList from "@/app/intreaba/builder/pickers/OptionList";
import type { KitOption } from "@/app/intreaba/builder/kit-types";
import "@/app/intreaba/builder/filters-kit.css";
import ClipButton from "@/components/ClipButton";
import EntityCrumb from "../EntityCrumb";
import EntityName from "@/components/EntityName";
import InfoMark from "@/components/InfoMark";
import Term from "@/components/Term";
import "@/components/how-note.css";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import { countWords } from "@/lib/ask/answer-text";
import { takesDe } from "@/lib/ro-count";
import { glossaryEntry } from "@/lib/glossary";
import { formatEvidenceAmount } from "@/lib/ask/evidence";
import type { ConnectionRole } from "@/lib/connections-shared";
import { entityHref } from "@/lib/entity-href";
import { writeAddress } from "@/lib/address";
import { cleanName, countyLabel } from "@/lib/format";
import { titleName as tidyTitle } from "../../../../lib/tidy-name";
import { peerEvidenceSpec, type PeerEvidenceSelection } from "@/lib/peers-evidence-shared";
import { peerDomainLabel, peerPeriodLabel } from "@/lib/peers-shared";
import { domainName } from "@/lib/cpv-aliases";
import { readableCpvName } from "@/lib/entity-summary";
import { countyKey } from "@/lib/map-capita-shared";
import { askHref } from "@/lib/discovery-links";
import { domainContextSpec } from "@/lib/ask/site-links";
import type { PeerMember, PeerMethod, PeerPoint, PeerSelectionMember, PeersResponse } from "@/lib/peers-shared";
import { scrollMotion } from "../../../../components/motion/scroll";

/*
 * "Comparații" (owner, 6 November 2026, "Șirul celor 465"): the whole group on one value axis, every member a dot,
 * the entity the one orange ring, the middle half and the median marked; the entity's neighbours in the ranking and
 * who the group is under it; the whole ranking behind "Tot clasamentul", in the same rows. The filters apply at once.
 * The hand-picked group ("Tu alegi cu cine compari") was removed from the page (owner, 6 November 2026); a copied
 * link to one still opens it, with the way back to the automatic group. Every bar is a position on the swarm's own logarithmic axis, so the
 * rows and the dots read alike: each row marks its place on a track with the median's tick, never a ratio fill. The group rules, pinned identities, sources and capture are unchanged
 * (lib/peers.ts, lib/peers-legacy.ts).
 */

type Criteria = { dataset: string; year: string; cpv: string; county: string };
type Request = Criteria & { page: number; identity?: string | undefined; checkpointId?: string | undefined; method?: PeerMethod | undefined; populationVersion?: string | undefined; members?: PeerSelectionMember[] | undefined };
type Source = { receipt: PeerEvidenceSelection; title: string };
type Metric = "total" | "mean";
type Row = { id: string; name: string; value: number; exact: string; records: number; focal: boolean; rank: number | null; /** The population beside the records, „237.589 loc.” (owner, 19 November 2026: the words in full took a second line). */ people?: number | undefined };
type Axis = { lo: number; hi: number };

const LIST_PAGE = 20;
/** A group this small is drawn low and ranked whole, once (UX audit Z4-31: an 11-member group showed 17 rows). */
const SMALL_GROUP = 15;
/** The member whose page was opened from here (sessionStorage), so Back brings its row into view. */
const VISIT_KEY = "pxs-visit";
const rememberVisit = (id: string) => { try { sessionStorage.setItem(VISIT_KEY, id); } catch { /* storage off */ } };
const count = (value: number) => value.toLocaleString("ro-RO");
const query = (values: Record<string, string | number | PeerSelectionMember[] | undefined>) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])).toString();
function initialMembers(value?: string): PeerSelectionMember[] | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as PeerSelectionMember[]; } catch { return undefined; }
}
const kinds: Record<string, string> = { comuna: "comune", oras_municipiu: "orașe / municipii", consiliu_judetean: "consilii județene", spital: "spitale", scoala: "școli", universitate: "universități", minister: "ministere", companie_stat: "companii de stat și locale" };
const DATASETS = [{ value: "all", label: "Toate" }, { value: "da", label: "Directe" }, { value: "contracts", label: "Proceduri" }] as const;
/** Romanian "de" after a number: 19 înregistrări, 20 de înregistrări, 101 înregistrări, 120 de înregistrări. */
const de = (n: number) => (takesDe(n) ? " de" : "");
const recordsWords = (n: number) => countWords(n, "înregistrare", "înregistrări");
const lowerFirst = (text: string) => (text ? text.charAt(0).toLocaleLowerCase("ro-RO") + text.slice(1) : text);
/** The kind's institutions, for the group's sentence (UX audit Z4-35: „Spitalele cu activitate asemănătoare…”). */
const KIND_PLURAL: Record<string, string> = { spital: "Spitalele", scoala: "Școlile", universitate: "Universitățile", minister: "Ministerele", companie_stat: "Companiile de stat și locale", comuna: "Comunele", oras_municipiu: "Orașele și municipiile", consiliu_judetean: "Consiliile județene" };
/** A long name in the title: two lines, the whole of it on hover, focus or a tap (UX audit Z4-27). */
function Named({ name }: { name: string }) {
  const long = name.length > 70;
  // A hyphenated word („Cluj-Napoca”) never breaks at its hyphen (polish M7).
  const words = name.split(/(\S*-\S*)/).map((w, i) => (w.includes("-") ? <span key={i} className="pxs-nobreak">{w}</span> : w));
  return <span className={long ? "pxs-h1-name is-long" : "pxs-h1-name"} tabIndex={long ? 0 : undefined}>{words}</span>;
}

/**
 * An institution of no known kind (UX audit Z4-36): no automatic group, so a short answer and two ways on, instead of
 * filters that cannot build one and facts about an empty group: who buys the same in its county (Întreabă's ranking of
 * the buyers of its main domain), its page, and its sources.
 */
function UnknownType({ focal, division, county, year, pageHref, onSources, busy }: {
  focal: PeerMember | null; division: { code: string; name: string } | null; county: string | null; year: number | null; pageHref: string; onSources: (() => void) | null; busy: boolean;
}) {
  const where = countyLabel(county);
  // The domains page's ranking of the division's buyers in the year (domainContextSpec), narrowed to its county.
  const ranking = division ? domainContextSpec("table", division.code, year ?? new Date().getFullYear() - 1, "authority") : null;
  const ask = ranking ? askHref(where ? { ...ranking, filters: { ...ranking.filters, county: where } } : ranking) : null;
  return <section className="px-empty px-empty--short">
    <h2>Nu știm sigur ce fel de instituție e, deci n-o putem compara automat. <Term tip id="tip-institutie" /></h2>
    <p>Comparația pune laolaltă instituții de același tip (spitale, școli, primării).{ask ? <> Pentru ea, poți vedea cine cumpără același lucru {where ? "în județ" : "în țară"}.</> : null}</p>
    <div className="pxs-acts pxs-acts--out">
      {ask && division && <Link className="pxs-btn p" href={ask} prefetch={false}>Cine cumpără {lowerFirst(division.name)} {where ? `în județul ${where}` : "în țară"} →</Link>}
      <Link className={ask ? "pxs-btn" : "pxs-btn p"} href={pageHref}>Pagina instituției →</Link>
      {onSources && focal && <button type="button" className="pxs-btn" disabled={busy || focal.recordCount === 0} onClick={onSources}>Sursele ei · {count(focal.recordCount)}</button>}
    </div>
  </section>;
}

/** "1,89 mld." · "1,5 mil." · "23 mii": an amount at the size of the eye, the exact one stays on hover. */
function short(value: number): string {
  // no trailing zero: „97 mil.”, not „97,0 mil.” (polish L7)
  const f = (n: number, d: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: d });
  if (value >= 1e9) return `${f(value / 1e9, 2)} mld.`;
  if (value >= 1e6) return `${f(value / 1e6, value >= 1e8 ? 0 : 1)} mil.`;
  if (value >= 1e3) return `${f(value / 1e3, 0)} mii`;
  return f(value, 0);
}
/** A tick of the logarithmic axis: "10 mii", "1 mil.", "1 mld.". */
function tick(value: number): string {
  if (value >= 1e9) return `${count(value / 1e9)} mld.`;
  if (value >= 1e6) return `${count(value / 1e6)} mil.`;
  if (value >= 1e3) return `${count(value / 1e3)} mii`;
  return count(value);
}
/** The entity against the median: "de 1.264 de ori mediana", "la 40% din mediană", "aproape de mediană". */
function versusMedian(value: number, median: number | null): string | null {
  if (median === null || !(median > 0)) return null;
  const ratio = value / median;
  if (ratio >= 10) { const n = Math.round(ratio); return `de ${count(n)}${de(n)} ori mediana`; }
  if (ratio >= 1.5) return `de ${ratio.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ori mediana`;
  if (ratio <= 2 / 3) return `la ${Math.max(1, Math.round(ratio * 100))}% din mediană`;
  return "aproape de mediană";
}
function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const at = (sorted.length - 1) * q, low = Math.floor(at), high = Math.ceil(at);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}
/** The powers of ten around every value: the swarm's axis, and the scale of every bar on the page. */
function logAxis(values: readonly number[]): Axis | null {
  const all = values.filter((v) => v > 0 && Number.isFinite(v));
  if (!all.length) return null;
  let lo = Math.floor(Math.log10(Math.min(...all))), hi = Math.ceil(Math.log10(Math.max(...all)));
  if (hi - lo < 2) { lo -= 1; hi += hi - lo < 2 ? 1 : 0; }
  return { lo, hi };
}
const along = (axis: Axis | null, v: number) => (axis && v > 0 ? Math.max(0, Math.min(1, (Math.log10(v) - axis.lo) / (axis.hi - axis.lo))) : 0);

/** A filter of the comparison: one button, its choices in the site's short window, applied as soon as one is picked. */
function Choice({ label, text, title, options, value, onPick, disabled }: {
  label: string; text: ReactNode; title: string; options: KitOption[]; value: string; onPick: (value: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={button} type="button" className="pxs-pick" aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen((o) => !o)}>
      <span>{label}</span><b>{text}</b>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <Popover open={open} anchor={button.current} onClose={() => setOpen(false)} title={title}>
      <div className="pxs-pop-list"><OptionList label={label} options={options} value={value} onChange={(next, source) => { if (source === "activate") { setOpen(false); if (next !== value) onPick(next); } }} /></div>
    </Popover>
  </>;
}

/** One ranked row: place, name (its page) with one line of facts, its position on the axis, the short amount (exact on hover), its sources.
 *  Its dot (charts in motion, owner 6 November 2026) fades in at its place, top to bottom, with the rows of the first
 *  answer (`enter` = the row's index); a row an update or a page adds fades in at once (`enter` = -1); a row that
 *  stays slides its dot and the median's tick to their new places (`.cm-tw`). Rows take a new order at once, which
 *  moves them in the document; the entrance class goes once it has played, so a moved row does not replay it. */
function RankRow({ row, place = null, axis, median, role, busy, opening, onSources, enter }: {
  row: Row; place?: { name: string; county: string | null } | null; axis: Axis | null; median: number | null; role: ConnectionRole; busy: boolean; opening: string | null; onSources: (row: Row) => void; enter: number;
}) {
  const [born, setBorn] = useState(enter);
  const played = born === -2;
  return <li className={row.focal ? "pxs-row is-focal" : "pxs-row"} data-member={row.id}>
    <span className="pxs-n">{row.rank === null ? "" : count(row.rank)}</span>
    {/* A town hall by its place, as on the map, with its county (UX audit Z4-34); the link still opens its page. */}
    <span className="pxs-name">{row.focal ? <b>{place ? <>{place.name}{place.county && <span className="pxs-county"> · {place.county}</span>}</> : row.name}</b>
      : <EntityName id={row.id} role={role}>{place ? <>{place.name}{place.county && <span className="pxs-county"> · {place.county}</span>}</> : cleanName(row.name) || "—"}</EntityName>}
      <small>{row.records > 0 ? recordsWords(row.records) : "fără înregistrări în selecție"}{row.people ? <> · <span className="pxs-people">{count(row.people)} <abbr title="locuitori">loc.</abbr></span></> : null}</small></span>
    <span className="pxs-track" aria-hidden="true">{median !== null && median > 0 && <b className="cm-tw" style={{ left: `${along(axis, median) * 100}%` }} />}{row.records > 0 && <i className={played ? "cm-tw" : born >= 0 ? "cm-tw cm-pt" : "cm-tw cm-in"} onAnimationEnd={() => setBorn(-2)} style={{ left: `${along(axis, row.value) * 100}%`, ...(born >= 0 ? { "--i": born } as CSSProperties : {}) }} />}</span>
    <span className="pxs-v" title={row.records > 0 ? formatEvidenceAmount(row.exact, true) : undefined}>{row.records > 0 ? `${short(row.value)} lei` : "—"}</span>
    <button type="button" className="pxs-src" disabled={busy || opening !== null || row.records === 0} aria-label={`Vezi sursele: ${tidyTitle(row.name)}`}
      onClick={() => onSources(row)}>{opening === row.id ? "…" : "Surse"}</button>
  </li>;
}

/* ---- the first answer's ghost (owner, 6 November 2026: "ghost data loading"): the real classes, decorative shapes ---- */

/** A filter's value while the group is built. */
const PickGhost = ({ w }: { w: string }) => <Ghost as="span" name="pxs-pick" wait="client"><G.Line inline w={w} /></Ghost>;

/** A fixed bell of dots on the axis, never data: columns taller towards the middle. */
const SWARM_GHOST = Array.from({ length: 44 }, (_, i) => {
  const x = 5 + i * 2.05;
  return { x, k: Math.max(1, Math.round(5.2 * Math.exp(-(((x - 46) / 21) ** 2)))) };
});
const TICKS_GHOST = [2, 18, 34, 50, 66, 82, 97];

/** The stage, the neighbours and the group, the caveat and the method's line, at the loaded page's size. */
function PeersGhost({ name }: { name: string }) {
  return <Ghost name="pxs-answer" wait="client" label="Se construiește grupul și se verifică sursele…">
    <section className="pxs-stage">
      <div className="pxs-stage-top">
        <p className="pxs-key"><span className="pxs-scale">scară logaritmică <G.Block w="24px" h="24px" r="6px" /></span>
          <span className="pxs-legend" aria-hidden="true"><span><i className="sw band" />jumătatea din mijloc</span><span><i className="sw med" />mediana</span><span><i className="sw me" />{name}</span></span></p>
        <div className="pxs-seg pxs-seg-g g-quiet" aria-hidden="true"><span>Total</span><span>Pe înregistrare</span></div>
      </div>
      <div className="pxs-swarm" aria-hidden="true">
        <span className="pxs-g-band" />
        {SWARM_GHOST.flatMap(({ x, k }, i) => Array.from({ length: k }, (_, j) => <span key={`${i}:${j}`} className={i % 2 ? "g-block pxs-g-dot pxs-g-odd" : "g-block pxs-g-dot"}
          style={{ left: `${x}%`, top: `calc(50% + ${5 + (j === 0 ? 0 : Math.ceil(j / 2) * 10 * (j % 2 ? -1 : 1))}px)` }} />))}
        <span className="pxs-g-axis" />
        {TICKS_GHOST.map((x) => <span key={x} className="pxs-g-tick" style={{ left: `${x}%` }}><G.Line inline w="5ch" /></span>)}
      </div>
    </section>
    <div className="pxs-cols">
      <section className="pxs-near" aria-hidden="true"><h2>În jurul ei <span className="term term-tip"><span className="term-trigger"><span className="term-mark">?</span></span></span></h2>
        <ol className="pxs-rows"><G.Rows n={6} className="pxs-row" cells={(i) => <>
          <span className="pxs-n"><G.Line inline w="2ch" /></span>
          <span className="pxs-name"><b><G.Line w={rankWidth(i, 78, 9, 40)} />{i === 4 ? <G.Line w="44%" /> : i % 3 !== 2 && <G.Line w="34%" only="phone" />}</b><small><G.Line w="46%" /></small></span>
          <span className="pxs-track" />
          <span className="pxs-v"><G.Line inline w="10ch" /></span>
          <span className="pxs-src g-quiet">Surse</span>
        </>} /></ol>
        <span className="pxs-more"><G.Line inline w="24ch" /></span>
        <div className="pxs-acts pxs-acts--foot"><G.Block w="10.2em" h="36px" /><G.Block w="7.75em" h="36px" /><G.Block w="9.4em" h="36px" /></div>
      </section>
    </div>
    <p className="how-note pxs-method g-quiet" aria-hidden="true"><span className="how-ghost">Cum e construit grupul și ce limite are</span><span className="pxs-method-sep"> · </span><span className="how-ghost">Detalii tehnice</span></p>
  </Ghost>;
}

/** Above this many dots the swarm's entrance fades the dots as one group; above SWARM_TWEEN its updates crossfade the
 *  group instead of sliding every dot (performance, charts in motion §5.4). */
const SWARM_EACH = 300, SWARM_TWEEN = 400;
/** A swarm dot whose entrance is fixed when it mounts: the first drawing ("cm-pt", no stagger: order on a beeswarm means
 *  nothing), a member an update adds ("cm-in"), or none (the first drawing of a large group, which fades as a whole). */
function SwarmDot({ born, x, y, r, on }: { born: string; x: number; y: number; r: number; on: boolean }) {
  const [enter] = useState(born);
  return <circle className={`pxs-dot${on ? " on" : ""}${enter ? ` ${enter}` : ""}`} cx={x} cy={y} r={r} />;
}
/** The dots' group, its entrance class fixed when it mounts. */
function SwarmDots({ born, many, children }: { born: string; many: boolean; children: ReactNode }) {
  const [enter] = useState(born);
  return <g className={`pxs-dots${many ? " pxs-many" : ""}${enter ? ` ${enter}` : ""}`}>{children}</g>;
}

/**
 * The swarm: every member with records as a dot on a logarithmic value axis, stacked where they meet; the middle
 * half as a band, the median as a dashed rule, the entity as an orange ring that lets a neighbour show through. The
 * nearest dot answers the pointer with its name, place and exact value and opens its page; the lists under the
 * stage hold the same members for the keyboard. Switching the measure slides every dot to its new place.
 */
function Swarm({ points, focal, median, metric, role, rank, total, axis, rankOf, compact = false, nameOf = (_id, name) => tidyTitle(name) }: {
  points: readonly PeerPoint[]; focal: { name: string; value: number }; median: number | null; metric: Metric; role: ConnectionRole;
  rank: number; total: number; axis: Axis; rankOf: ReadonlyMap<string, number>;
  /** A small group (UX audit Z4-31): the drawing only as tall as its tallest column of dots. */
  compact?: boolean;
  /** A member's name in the tip (a town hall's place, as on the map). */
  nameOf?: (id: string, name: string) => string;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  // A touch (UX audit Z4-38): the first shows the nearest dot's tip with „Deschide ›”, a second on it opens its page.
  const [pinned, setPinned] = useState<number | null>(null);
  const touch = useRef(false);
  useEffect(() => {
    if (pinned === null) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setPinned(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned]);
  // Charts in motion (owner, 6 November 2026): the band and the median first, the dots next, the entity's ring last; a
  // new measure or filter slides the dots that stay (up to SWARM_TWEEN), and a larger group is redrawn as one fade.
  const [drawn, setDrawn] = useState(false);
  const [version, setVersion] = useState({ points, metric, n: 0 });
  if (version.points !== points || version.metric !== metric) setVersion({ points, metric, n: version.n + 1 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const phone = width > 0 && width < 640;
  const TOP = 40, AXIS = 30;
  const layout = useMemo(() => {
    if (width === 0) return null;
    const value = (p: PeerPoint) => (metric === "total" ? p.total : p.mean);
    const pad = 12;
    const x = (v: number) => pad + along(axis, Math.max(v, 10 ** axis.lo)) * (width - 2 * pad);
    // Dots as big as the group allows: a small group (population, a hand-picked one) gets dots to point at, a
    // middling one fills the stage's height, only the largest groups go down to the smallest dot.
    const n = points.length;
    const r = n <= 60 ? (phone ? 4.5 : 5.5) : n <= 800 ? (phone ? 3 : 4.2) : phone ? 2.4 : 3, step = 2 * r + 1;
    const sorted = [...points].sort((a, b) => value(a) - value(b));
    const cols = new Map<number, number>();
    const raw = sorted.map((p) => {
      const col = Math.round(x(value(p)) / step), k = cols.get(col) ?? 0;
      cols.set(col, k + 1);
      return { p, x: col * step, off: k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? -1 : 1) };
    });
    const widest = Math.max(1, ...raw.map((d) => Math.abs(d.off)));
    // A small group is only as tall as its tallest column needs (with room for the labels above); the others keep the stage.
    const H = compact ? Math.max(phone ? 124 : 136, Math.ceil(TOP + AXIS + 2 * (widest + r + 4))) : phone ? 220 : 290;
    const mid = TOP + (H - TOP - AXIS) / 2, half = (H - TOP - AXIS) / 2 - r - 2;
    const squeeze = widest > half ? half / widest : 1;
    const dots = raw.map((d) => ({ ...d, y: mid + d.off * squeeze, v: value(d.p) }));
    const values = sorted.map(value);
    const ticks = Array.from({ length: axis.hi - axis.lo + 1 }, (_, i) => 10 ** (axis.lo + i));
    return { x, r, dots, q1: quantile(values, 0.25), q3: quantile(values, 0.75), ticks, H, mid };
  }, [points, metric, width, phone, axis, compact]);
  const H = layout?.H ?? (compact ? (phone ? 124 : 136) : phone ? 220 : 290), mid = layout?.mid ?? TOP + (H - TOP - AXIS) / 2;

  function nearestIndex(event: { currentTarget: Element; clientX: number; clientY: number }): number | null {
    if (!layout) return null;
    const rect = event.currentTarget.getBoundingClientRect(), px = event.clientX - rect.left, py = event.clientY - rect.top;
    let best = -1, distance = 22 * 22;
    layout.dots.forEach((d, i) => { const dd = (d.x - px) ** 2 + (d.y - py) ** 2; if (dd < distance) { distance = dd; best = i; } });
    return best < 0 ? null : best;
  }
  function nearest(event: ReactPointerEvent<SVGSVGElement>) { setHover(nearestIndex(event)); }
  const at = hover ?? pinned;
  const shown = at === null || !layout ? null : layout.dots[at];
  const open = (id: string) => { rememberVisit(id); router.push(entityHref(id, role)); };
  const fx = layout ? layout.x(focal.value) : 0;
  const right = width > 0 && fx > width * 0.6;
  // The two labels share the line above the dots; when the entity's would run into the median's, it climbs one line.
  const focalWords = `${phone ? "" : `${focal.name} · `}${short(focal.value)} · locul ${count(rank)}`;
  const medianWords = median !== null && median > 0 ? `mediana ${short(median)}` : "";
  const glyph = 6.8, focalSpan = right ? [fx + 4 - focalWords.length * glyph, fx + 4] : [fx - 4, fx - 4 + focalWords.length * glyph];
  // The median's words go right of its line; when the entity's words would run into them they go left of it, and only
  // when both sides clash does the entity's label climb a line (polish M7: they touched on phones).
  const mLine = layout && medianWords ? layout.x(median!) : -1, mLen = medianWords.length * glyph;
  const hits = (a: number, b: number) => focalSpan[0]! < b + 8 && focalSpan[1]! > a - 8;
  const medianLeft = mLine >= 0 && hits(mLine + 6, mLine + 6 + mLen) && mLine - 6 - mLen >= 0 && !hits(mLine - 6 - mLen, mLine - 6);
  const clash = mLine >= 0 && !medianLeft && hits(mLine + 6, mLine + 6 + mLen);
  const unit = metric === "total" ? "lei" : "lei pe înregistrare";
  const ring = layout ? layout.r + (phone ? 4 : 5) : 8;
  useEffect(() => { if (layout && !drawn) setDrawn(true); }, [layout, drawn]);
  const n = layout?.dots.length ?? 0, crowd = n > SWARM_EACH, many = n > SWARM_TWEEN;
  // The dots in a fixed order (by member), not by value: a new measure or filter then never moves a circle in the
  // document, which would restart its entrance and drop its slide.
  const drawOrder = useMemo(() => (layout?.dots ?? []).map((d, i) => [d, i] as const).sort(([a], [b]) => (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0)), [layout]);
  // Its height comes from peers.css (290, or 220 when the stage is under 640 px wide: the same test as `phone`), so it is
  // right before the first measure and in the ghost.
  return <div className="pxs-swarm" ref={box} data-chart="" style={compact ? { height: H } : undefined}>
    {layout && <svg width={width} height={H} role="img" aria-label={`${focal.name}: locul ${count(rank)} din ${count(total)}, ${short(focal.value)} ${unit}${median ? `; mediana grupului ${short(median)}` : ""}.`}
      onPointerDown={(e) => { touch.current = e.pointerType !== "mouse"; }}
      onPointerMove={(e) => { if (!touch.current) nearest(e); }} onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        if (!touch.current) { if (shown) open(shown.p.id); return; }
        const i = nearestIndex(e);
        if (i === null) { setPinned(null); return; }
        if (pinned === i) open(layout.dots[i]!.p.id); else { setHover(null); setPinned(i); }
      }} className={shown ? "is-pointing" : undefined}>
      {layout.dots.length >= 4 && <rect className="pxs-band cm-fade" x={layout.x(layout.q1)} y={TOP - 6} width={Math.max(2, layout.x(layout.q3) - layout.x(layout.q1))} height={H - TOP - AXIS + 6} />}
      <line className="pxs-axis" x1={0} x2={width} y1={H - AXIS + 2} y2={H - AXIS + 2} />
      {layout.ticks.map((t, i) => {
        // a phone thins the ticks only when there are many: four keep every label (polish M7)
        const tx = layout.x(t), skip = phone && layout.ticks.length > 5 && i % 2 === 1 && i !== layout.ticks.length - 1;
        return <g key={t}><line className="pxs-axis" x1={tx} x2={tx} y1={H - AXIS + 2} y2={H - AXIS + 7} />
          {!skip && <text className="pxs-tick" x={tx} y={H - 8} textAnchor={i === 0 ? "start" : i === layout.ticks.length - 1 ? "end" : "middle"}>{tick(t)}{i === 0 ? " lei" : ""}</text>}</g>;
      })}
      {median !== null && median > 0 && <g className="pxs-median cm-fade"><line x1={layout.x(median)} x2={layout.x(median)} y1={TOP - 22} y2={H - AXIS} />
        <text x={layout.x(median) + (medianLeft ? -6 : 6)} y={TOP - 12} textAnchor={medianLeft ? "end" : "start"}>{medianWords}</text></g>}
      <SwarmDots key={many ? `v${version.n}` : "dots"} many={many} born={!drawn ? (crowd ? "cm-fade" : "") : many ? "cm-in" : ""}>
        {drawOrder.map(([d, i]) => many ? <circle key={d.p.id} className={i === hover ? "pxs-dot on" : "pxs-dot"} cx={d.x} cy={d.y} r={i === hover ? layout.r + 2 : layout.r} />
          : <SwarmDot key={d.p.id} born={!drawn ? (crowd ? "" : "cm-pt") : "cm-in"} x={d.x} y={d.y} r={i === hover ? layout.r + 2 : layout.r} on={i === hover} />)}
      </SwarmDots>
      {/* The entity's words sit above the dots, on the median's line, tied to its ring by a short rule; a phone drops the name (the title says it). */}
      <line className="pxs-focal-rule cm-yd cm-late" x1={fx} x2={fx} y1={clash ? TOP - 22 : TOP - 6} y2={mid - ring - 1} />
      <circle className="pxs-focal cm-pt cm-late" cx={fx} cy={mid} r={ring} />
      <text className="pxs-focal-t cm-fade cm-late" x={right ? fx + 4 : fx - 4} y={clash ? TOP - 30 : TOP - 12} textAnchor={right ? "end" : "start"}>{focalWords}</text>
    </svg>}
    {shown && <div className={`pxs-tip tipcard${shown.x > width * 0.7 ? " r" : shown.x < width * 0.3 ? " l" : ""}${hover === null && pinned !== null ? " is-pinned" : ""}`} style={{ left: shown.x, top: shown.y }} aria-hidden={hover !== null || pinned === null ? true : undefined}>
      <b className="tipcard-t">{nameOf(shown.p.id, shown.p.name) || "—"}</b>
      <span className="pxs-tip-v">{formatEvidenceAmount(metric === "total" ? shown.p.totalExact : shown.p.meanExact, true)}{metric === "mean" ? " pe înregistrare" : ""}</span>
      <span>{rankOf.has(shown.p.id) ? `locul ${count(rankOf.get(shown.p.id)!)} · ` : ""}{recordsWords(shown.p.records)}</span>
      {hover === null && pinned !== null
        ? <Link className="pxs-tip-go" href={entityHref(shown.p.id, role)} onClick={() => rememberVisit(shown.p.id)}>Deschide →</Link>
        : <span className="pxs-tip-go">Apasă: pagina ei →</span>}
    </div>}
  </div>;
}

export default function PeersExplorer({ entityId, entityName, titleName = entityName, county = null, role, bothRoles = false, initial: fromServer, place = null }: {
  entityId: string; entityName: string; /** The name as the title reads it (lib/tidy-name.ts, on the server). */ titleName?: string; county?: string | null; role: ConnectionRole; bothRoles?: boolean; initial: Record<string, string>;
  /** A town hall's place on the map (page.tsx townHallPlace), for the way there. */
  place?: { county: string; siruta: number | null } | null;
}) {
  // The address is the view (UX audit Z4-33): Back from a member's page remounts this page from the router's cache, whose
  // props are the first visit's, while the address holds the filters, the open ranking and its page: read the address.
  const [initial] = useState<Record<string, string>>(() => (typeof window === "undefined" ? fromServer
    : Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([key], i, all) => all.findIndex(([k]) => k === key) === i))));
  const first: Criteria = { dataset: initial.dataset ?? "all", year: initial.year ?? "", cpv: initial.cpv ?? "", county: initial.county ?? "" };
  const [request, setRequest] = useState<Request>({ ...first, page: Number(initial.page ?? 1), ...(initial.identity ? { identity: initial.identity } : {}), ...(initial.checkpointId ? { checkpointId: initial.checkpointId } : {}), ...(initial.method ? { method: initial.method as PeerMethod } : {}), ...(initial.populationVersion ? { populationVersion: initial.populationVersion } : {}), ...(initial.members ? { members: initialMembers(initial.members) } : {}) });
  const [state, setState] = useState<{ key: string; data: PeersResponse | null; error: string; status: number }>({ key: "", data: null, error: "", status: 0 });
  const [pending, setPending] = useState(true), [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<Metric>("total");
  const [sources, setSources] = useState<Source | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [listOpen, setListOpen] = useState(Number(initial.page ?? 1) > 1 || initial.lista === "1");
  const [listPage, setListPage] = useState(Math.max(0, Number(initial.pagina ?? 1) - 1) || 0);
  /** The ranking's page from the address, kept once over the first answer's own place. */
  const askedPage = useRef(initial.pagina ? Math.max(0, Number(initial.pagina) - 1) || 0 : null);
  /** The first answer's rows have been drawn: rows mounted after that (an update, the whole list, a page) fade in at once. */
  const [rowsDrawn, setRowsDrawn] = useState(false);
  const pinned = useRef({ identity: initial.identity, checkpointId: initial.checkpointId });
  const listHeading = useRef<HTMLHeadingElement>(null);
  const key = query({ entityId, role, ...request });
  const data = state.data;
  const busy = pending || state.key !== key;
  const error = state.key === key ? state.error : "";
  /** The first answer is loading: nothing to keep on screen, so the page is drawn as a ghost. */
  const firstLoad = busy && !state.data;
  const rol = role === "authority" ? "autoritate" : "furnizor";
  const currentName = data ? cleanName(data.entity.name) : entityName;
  const stored = useRef<PeersResponse | null>(null);
  if (data) stored.current = data;
  const options = data?.options ?? stored.current?.options;

  useEffect(() => {
    const controller = new AbortController();
    setPending(true); setCopied("");
    void (async () => {
      try {
        const response = await fetch(`/api/peers?${key}`, { signal: controller.signal });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) { setState({ key, data: null, error: body.error ?? "Comparația nu poate fi încărcată.", status: response.status }); return; }
        const next = body as PeersResponse;
        pinned.current = { identity: next.entity.identity, checkpointId: next.checkpoint.id };
        setState({ key, data: next, error: "", status: response.status });
      } catch { if (!controller.signal.aborted) setState({ key, data: null, error: "Conexiunea a fost întreruptă. Reîncearcă încărcarea.", status: 0 }); }
      finally { if (!controller.signal.aborted) setPending(false); }
    })();
    return () => controller.abort();
  }, [key, retry, rol]);

  /** The applied criteria, with one changed: the group follows at once (no "Aplică"). */
  function applied(): Criteria {
    return { dataset: data?.filters.dataset ?? request.dataset, year: data ? String(data.filters.year ?? "") : request.year, cpv: data?.filters.cpv ?? request.cpv, county: data?.filters.county ?? request.county };
  }
  function change(next: Partial<Criteria>) {
    if (busy && !data) return;
    setSources(null);
    const manual = data?.filters.method === "manual";
    setRequest({ ...applied(), ...next, ...(manual ? { county: "" } : {}), page: 1, ...pinned.current, method: data?.filters.method, populationVersion: data?.filters.populationVersion, members: data?.filters.members });
  }
  /** Only a sampled group (over 3.000 members) still pages its list from the server. */
  function turnPage(page: number) {
    if (!data) return;
    setRequest({ ...applied(), page, ...pinned.current, method: data.filters.method, populationVersion: data.filters.populationVersion, members: data.filters.members });
    requestAnimationFrame(() => listHeading.current?.focus());
  }
  function resetGroup() {
    if (!data || busy) return;
    setSources(null);
    setRequest({ ...applied(), county: "", page: 1, ...pinned.current, method: data.methodology.defaultMethod ?? (data.focal?.population ? "population" : "activity") });
  }
  function receipt(member?: { entity: { id: string; identity: string } }): PeerEvidenceSelection {
    if (!data || data.filters.year === null || data.filters.cpv === null) throw new Error("Comparația nu este pregătită.");
    return { version: "peer-evidence-2", method: data.filters.method ?? "activity", ...(data.filters.populationVersion ? { populationVersion: data.filters.populationVersion } : {}), ...(data.filters.members ? { members: data.filters.members } : {}), checkpointId: data.checkpoint.id, entityId, identity: data.entity.identity, role,
      dataset: data.filters.dataset, year: data.filters.year, cpv: data.filters.cpv, ...(data.filters.county ? { county: data.filters.county } : {}),
      selection: member ? { kind: "member", entityId: member.entity.id, identity: member.entity.identity } : { kind: "comparison" } };
  }
  function scopeWords() { return `${peerPeriodLabel(data!.filters.year)} · ${peerDomainLabel(data!.filters.cpv)}`; }
  function showSources(member?: PeerMember) {
    if (busy || !data) return;
    setSources({ receipt: receipt(member), title: member ? `${cleanName(member.entity.name)} · ${scopeWords()}` : `Comparație în context · ${currentName} · ${scopeWords()}` });
  }
  /** A member known only as a dot: the page's members when it holds it, else fetched with its identity; then its sources. */
  async function showPointSources(id: string, name: string) {
    if (busy || !data || opening) return;
    const known = data.members.find((m) => m.entity.id === id);
    if (known) { showSources(known); return; }
    setOpening(id);
    try {
      const response = await fetch(`/api/peers?${key}&member=${encodeURIComponent(id)}`);
      const body = await response.json() as PeersResponse & { error?: string };
      const member = response.ok ? body.members?.[0] : undefined;
      if (member) setSources({ receipt: receipt(member), title: `${cleanName(member.entity.name)} · ${scopeWords()}` });
      else setCopied(body.error ?? `Nu am putut deschide sursele: ${tidyTitle(name)}.`);
    } catch { setCopied(`Nu am putut deschide sursele: ${tidyTitle(name)}. Reîncearcă.`); }
    finally { setOpening(null); }
  }
  // The place and the comparison changed by a control, for the same entity, are marked once (M-05).
  const rankRef = useRef<HTMLElement>(null), versusRef = useRef<HTMLElement>(null);
  // A copy is said on its button (M-08: „Copiat” for 1.6 s, read out by a live region); a failure stays in words below.
  const [linkCopied, raiseLinkCopied] = useFlag();
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(""); raiseLinkCopied(); }
    catch { setCopied("Copiază adresa din bara browserului; ea conține criteriile comparației."); }
  }

  const focal = data?.focal;
  const method = data?.filters.method ?? request.method ?? "activity";
  const comparisonAvailable = !!focal && data?.cohort.status !== "unknown_authority_type" && data!.cohort.count > 0;
  const canCapture = comparisonAvailable && data!.cohort.count <= 499;
  const comparison = canCapture ? receipt() : null;
  const observedCount = data?.cohort.observedMemberCount ?? data?.cohort.count ?? 0;
  const focalValue = focal && focal.recordCount > 0 ? Number(metric === "total" ? focal.totalExact : focal.meanRounded) : 0;
  const medianText = data?.cohort.enoughPeers ? metric === "total" ? data.cohort.medianTotalExact : data.cohort.medianMeanRounded : null;
  const median = medianText === null || medianText === undefined ? null : Number(medianText);
  const points = useMemo(() => data?.points ?? [], [data]);
  const noun = role === "supplier" ? ["firmă", "firme"] as const : method === "population" ? ["administrație", "administrații"] as const : ["instituție", "instituții"] as const;

  // The whole ranking by the measure shown: the members with records, the entity in its place, then (population and
  // hand-picked groups) the members without records in the selection, which stay listed but out of the median.
  const ranked: Row[] = useMemo(() => {
    if (!focal) return [];
    const byId = new Map((data?.members ?? []).map((m) => [m.entity.id, m]));
    const populationWords = (m: PeerMember | undefined) => {
      const p = m?.population;
      if (!p || method === "activity") return undefined;
      // The population alone: hers is on her own row (owner, 17 November 2026; before: „(+4%)” after each).
      return p.value;
    };
    const rows: Row[] = points.map((p) => ({ id: p.id, name: p.name, value: metric === "total" ? p.total : p.mean, exact: metric === "total" ? p.totalExact : p.meanExact, records: p.records, focal: false, rank: null, people: populationWords(byId.get(p.id)) }));
    rows.push({ id: entityId, name: currentName, value: focalValue, exact: metric === "total" ? focal.totalExact : focal.meanRounded, records: focal.recordCount, focal: true, rank: null,
      people: focal.population && method !== "activity" ? focal.population.value : undefined });
    rows.sort((a, b) => b.value - a.value || (a.focal ? -1 : b.focal ? 1 : 0));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const silent = (data?.members ?? []).filter((m) => m.recordCount === 0 && !points.some((p) => p.id === m.entity.id));
    return [...rows, ...silent.map((m) => ({ id: m.entity.id, name: m.entity.name, value: 0, exact: "0", records: 0, focal: false, rank: null, people: populationWords(m) }))];
  }, [points, metric, focal, focalValue, entityId, currentName, data?.members, method]);
  const at = ranked.findIndex((r) => r.focal);
  const rank = data?.rank ? data.rank[metric] : Math.max(1, at + 1);
  const total = data?.pointsSampled ? observedCount + 1 : ranked.filter((r) => r.records > 0).length;
  const shownRows = data?.pointsSampled ? ranked.map((r) => ({ ...r, rank: r.focal ? rank : null })) : ranked;
  const start = Math.max(0, Math.min(at - 2, ranked.filter((r) => r.records > 0).length - 6));
  const neighbours = shownRows.slice(start, start + 6);
  const rankOf = useMemo(() => new Map(data?.pointsSampled ? [] : ranked.filter((r) => r.rank !== null).map((r) => [r.id, r.rank!])), [ranked, data?.pointsSampled]);
  const axis = useMemo(() => logAxis([...points.map((p) => (metric === "total" ? p.total : p.mean)), focalValue, median ?? 0]), [points, metric, focalValue, median]);
  const pages = Math.max(1, Math.ceil(ranked.length / LIST_PAGE));
  const small = ranked.length > 0 && ranked.length <= SMALL_GROUP && !data?.pointsSampled;
  const focalPage = at < 0 ? 0 : Math.floor(at / LIST_PAGE);
  useEffect(() => {
    if (askedPage.current !== null && data) { setListPage(Math.min(askedPage.current, pages - 1)); askedPage.current = null; return; }
    setListPage(focalPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focalPage, key]);
  // The address keeps the view (UX audit Z4-33), through the router (lib/address.ts), as /harta does: the applied
  // filters, the pinned identity and data version, and the open ranking with its page.
  useEffect(() => {
    if (!data) return;
    const view = query({ rol, ...data.filters, year: data.filters.year ?? undefined, cpv: data.filters.cpv ?? undefined, ...pinned.current,
      lista: listOpen && !small ? "1" : undefined, pagina: listOpen && !small && pages > 1 && !data.pointsSampled ? listPage + 1 : undefined });
    writeAddress(`${window.location.pathname}?${view}`, "replace");
  }, [data, listOpen, listPage, rol, pages, small]);
  // Back from a member's page: that member's row comes back into view, once the answer is drawn.
  useEffect(() => {
    if (!data) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem(VISIT_KEY); sessionStorage.removeItem(VISIT_KEY); } catch { /* storage off: the page opens at its top */ }
    if (!id) return;
    const frame = window.requestAnimationFrame(() => document.querySelector(`.pxs [data-member="${CSS.escape(id!)}"]`)?.scrollIntoView({ block: "center" }));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);
  useEffect(() => { if (data && !rowsDrawn) setRowsDrawn(true); }, [data, rowsDrawn]);
  const rowEnter = (i: number) => (rowsDrawn ? -1 : i);

  const division = data?.options.divisions.find((item) => item.code === data.filters.cpv);
  const versus = focal ? versusMedian(focalValue, median) : null;
  useChangedMark(rankRef, busy || !focal ? null : rank, entityId);
  useChangedMark(versusRef, busy || !focal ? null : versus, entityId);
  const cpvCode = data?.filters.cpv ?? null, yearValue = data?.filters.year ?? null;
  /** A division's name from the catalog: the group's own, else the site's short names (never „CPV 03 (CPV 03)”). */
  const domainOf = (code: string) => (division && division.code === code ? readableCpvName(division.label) : domainName(code, null));
  const domainWords = cpvCode && cpvCode !== "all" ? lowerFirst(domainOf(cpvCode)) : null;
  const periodWords = yearValue === "all" ? "în toți anii" : yearValue !== null ? `în ${yearValue}` : "";
  const channel = data?.filters.dataset === "da" ? ", prin achiziții directe" : data?.filters.dataset === "contracts" ? ", prin proceduri" : "";
  const band = data ? `${count(data.cohort.minimumRecords)}–${count(data.cohort.maximumRecords)}${de(data.cohort.maximumRecords)} înregistrări` : "";
  // Its name (UX audit Z4-27, Z4-34): a town hall's place as the map writes it („Cisnădie”), else its name without the
  // capitals of the source; the breadcrumb and its page keep the page's name.
  const shownName = focal?.population?.placeName ?? titleName;
  const unknownType = data?.cohort.status === "unknown_authority_type";
  // The group drawn and ranked: a place among members with records (UX audit Z4-37: never „locul 1 între 0”).
  const ranking = !!focal && comparisonAvailable && observedCount > 0 && focal.recordCount > 0;
  // The town hall's place on the map (UX audit Z4-26, Z4-39): from its population's SIRUTA, else from its name.
  const fromPopulation = focal?.population && focal.population.level !== "county" && focal.population.siruta ? { county: countyKey(focal.population.county), siruta: focal.population.siruta } : null;
  const onMap = role === "authority" ? fromPopulation ?? place : null;
  const mapHref = onMap ? `/harta?ani=${yearValue === null || yearValue === "all" ? "toti" : yearValue}&judet=${onMap.county}${onMap.siruta && onMap.siruta !== 179132 ? `&uat=${onMap.siruta}` : ""}&pe=locuitor` : null;
  const widen = (yearValue !== null && yearValue !== "all") || (cpvCode !== null && cpvCode !== "all");
  const widenButtons = (className: string) => <>
    {cpvCode !== null && cpvCode !== "all" && <button type="button" className={className} disabled={busy} onClick={() => change({ cpv: "all" })}>Toate domeniile</button>}
    {yearValue !== null && yearValue !== "all" && <button type="button" className={className} disabled={busy} onClick={() => change({ year: "all" })}>Toți anii</button>}
  </>;

  const yearOptions: KitOption[] = [{ value: "all", label: "Toți anii", detail: "cumulat, cu înregistrările fără dată" }, ...(options?.years ?? []).map((y) => ({ value: String(y), label: String(y), ...(y >= new Date().getFullYear() ? { detail: "an în curs, incomplet" } : {}) }))];
  const divisionTotal = (options?.divisions ?? []).reduce((a, d) => a + Number(d.totalExact), 0) || 1;
  const cpvOptions: KitOption[] = [{ value: "all", label: "Toate domeniile", detail: "cu înregistrările fără cod CPV" }, ...(options?.divisions ?? []).map((d) => ({ value: d.code, label: `${d.code} · ${d.label}`, count: `${short(Number(d.totalExact))} lei`, share: Number(d.totalExact) / divisionTotal }))];
  // Its own county first (UX audit Z4-41: „în județul meu” is the comparison most asked for).
  const ownCounty = (options?.counties ?? []).find((c) => countyLabel(c) === countyLabel(data ? data.entity.county : county));
  const countyOptions: KitOption[] = [{ value: "", label: "Toată țara" }, ...(ownCounty ? [{ value: ownCounty, label: `${countyLabel(ownCounty) ?? ownCounty} · județul ${role === "supplier" ? "firmei" : "ei"}` }] : []),
    ...(options?.counties ?? []).filter((c) => c !== ownCounty).map((c) => ({ value: c, label: countyLabel(c) ?? c }))];
  const rowSources = (row: Row) => (row.focal ? showSources(focal!) : void showPointSources(row.id, row.name));
  function openList() { setListOpen(true); setListPage(focalPage); requestAnimationFrame(() => listHeading.current?.scrollIntoView({ behavior: scrollMotion(), block: "start" })); }
  // A member's row, named as the map names a town hall's place, with its county (UX audit Z4-34).
  const membersById = useMemo(() => new Map((data?.members ?? []).map((m) => [m.entity.id, m])), [data?.members]);
  const placeOf = (id: string): { name: string; county: string | null } | null => {
    const p = id === entityId ? focal?.population : membersById.get(id)?.population;
    return p?.placeName ? { name: p.placeName, county: p.level === "sector" ? null : countyLabel(p.county) } : null;
  };
  const showFilters = !unknownType && !(error && !data);
  // „Cine e în grup”: the group's rule and its source, said in the title's (?) (owner, 17 November 2026: a paragraph before).
  const populationRule = data && focal?.population ? <>Cele {count(data.cohort.count)}{de(data.cohort.count)} administrații din țară cu populația cea mai apropiată de a ei ({countWords(focal.population.value, "locuitor", "locuitori")}, recensământ {focal.population.referenceDate.slice(0, 4)}, <a href={focal.population.sourceUrl} target="_blank" rel="noreferrer">sursa INS</a>). Achizițiile nu contează la alegere.</> : null;
  const activityRule = data && focal ? `${role === "supplier" ? "Firmele" : KIND_PLURAL[data.cohort.authorityKind ?? ""] ?? "Instituțiile de același tip"} cu activitate asemănătoare ${cpvCode === "all" ? (yearValue === "all" ? "în toți anii" : "în același an") : yearValue === "all" ? "în același domeniu, în toți anii" : "în același domeniu și an"}: între jumătate și dublul celor ${recordsWords(focal.recordCount)} ale ei. Un reper, nu o listă de concurenți.` : "";
  // The group's rule and its source, in a (?) beside the ranking's title (owner, 19 November 2026: „Cine e în grup” was a
  // panel of its own, with nothing left under its title but buttons).
  const groupTip = method === "activity" ? <> <Term tip title={glossaryEntry("grup-activitate").title} text={`${activityRule} ${glossaryEntry("grup-activitate").text}`} /></>
    : method === "population" ? <> <Term tip title={glossaryEntry("grup-populatie").title} text={populationRule ? <>{populationRule} {glossaryEntry("grup-populatie").text}</> : glossaryEntry("grup-populatie").text} /></> : null;
  const groupNote = !focal ? null : method === "population" ? !focal.population && <p className="pxs-group-note">Nu am putut identifica sigur populația acestei administrații, deci nici grupul după populație.</p>
    : method === "manual" && data ? <p className="pxs-group-note">Grupul ales de tine: {countWords(data.cohort.count, noun[0], noun[1])} <InfoMark title="Grupul ales" text="Din orice județ (cel mult 50). Rămâne când schimbi anul sau domeniul." /></p> : null;

  return <div className="pxs" onClickCapture={(e) => {
    // A member's page opened from a row: Back brings its row into view (UX audit Z4-33).
    const a = (e.target as Element).closest?.(".pxs-rows a.entity-name");
    const id = a?.getAttribute("href")?.match(/\/entitati\/(\d+)/)?.[1];
    if (id) rememberVisit(id);
  }}>
    <EntityCrumb id={entityId} name={currentName} role={role} bothRoles={bothRoles} current="Comparații" />
    <header className="pxs-head">
      <h1><span className="pxs-h1-name-wrap">{ranking ? <>Unde stă <Named name={shownName} />{domainWords ? ` la ${domainWords},` : ""} {periodWords}</>
        : firstLoad ? <>Unde stă <Named name={shownName} /> <Ghost as="span" name="pxs-h1" wait="client"><G.Line inline w="11ch" /></Ghost></> : <>Cu cine se compară <Named name={shownName} /></>}</span></h1>
      {firstLoad && <Ghost as="p" className="pxs-lede" name="pxs-lede" wait="client"><G.Line w="76%" /><G.Line w="100%" only="phone" /><G.Line w="52%" only="phone" /></Ghost>}
      {firstLoad && (!request.year || !request.cpv || request.year !== "all" || request.cpv !== "all") && <Ghost as="p" className="pxs-widen" name="pxs-widen" wait="client"><G.Line inline w="17em" /></Ghost>}
      {data && focal && ranking && <p className={busy ? "pxs-lede g-stale" : "pxs-lede"}>
        {method === "population" ? <>Între {countWords(total, noun[0], noun[1])} cu populația cea mai apropiată{data.filters.county ? `, din județul ${countyLabel(data.filters.county) ?? data.filters.county}` : ""}</>
          : method === "manual" ? <>Grupul ales de tine, {countWords(total, noun[0], noun[1])}</>
          : <>Între {countWords(total, noun[0], noun[1])} {role === "supplier" ? "" : `de același tip (${kinds[data.cohort.authorityKind ?? ""] ?? "nestabilit"}) `}cu {band}, ca ea</>}{channel}.{" "}
        E pe locul <b ref={rankRef}>{count(rank)}</b>{versus ? <>: <b ref={versusRef}>{versus}</b></> : ""}{metric === "mean" ? ", după valoarea pe înregistrare" : ""}.
      </p>}
      {/* The comparison names its domain and year in the title (UX audit Z4-32); one click widens either, at once. */}
      {data && ranking && widen && <p className="pxs-widen"><span>Lărgește:</span>{widenButtons("pxs-chip")}</p>}
    </header>

    {showFilters && <div className="pxs-filters" role="group" aria-label="Ce se compară">
      <Choice label="Perioada" text={data ? (yearValue === null ? "—" : peerPeriodLabel(yearValue)) : request.year || <PickGhost w="5ch" />} title="Ce an?" options={yearOptions} value={data ? String(data.filters.year ?? "") : request.year} onPick={(year) => change({ year })} disabled={!options} />
      {/* Two words and an "i" beside the year (owner, 17 November 2026; before: a notice over the chart). */}
      {data && !unknownType && typeof data.filters.year === "number" && data.filters.year >= new Date().getFullYear() && <span className="pxs-partial">în curs <InfoMark title="An în curs" text="Anul ales e în curs: valorile nu acoperă un an întreg." /></span>}
      <Choice label="Domenii" text={data ? cpvCode === "all" ? "Toate" : cpvCode === null ? "—" : `${cpvCode} · ${domainOf(cpvCode)}` : <PickGhost w="22ch" />} title="Ce domeniu?" options={cpvOptions} value={data?.filters.cpv ?? request.cpv} onPick={(cpv) => change({ cpv })} disabled={!options} />
      <div className="pxs-seg" role="group" aria-label="Achizițiile comparate">{DATASETS.map((d) => <button key={d.value} type="button" aria-pressed={(data?.filters.dataset ?? request.dataset) === d.value} disabled={!data} onClick={() => change({ dataset: d.value })}>{d.label}</button>)}</div>
      {method !== "manual" && (countyOptions.length > 1 || !options) && <Choice label="Județul" text={data?.filters.county ? countyLabel(data.filters.county) ?? data.filters.county : options ? "Toată țara" : <PickGhost w="9ch" />} title="Membrii din ce județ?" options={countyOptions} value={data?.filters.county ?? ""} onPick={(county) => change({ county })} disabled={!options} />}
    </div>}

    {firstLoad ? <PeersGhost name={shownName} />
      // Unavailable (UX audit Z4-26): no filters that look as if they were loading, when it comes back, and ways out.
      : error ? <div className="px-error" role="alert"><h2>Comparația nu este disponibilă acum.</h2>
        <p>{state.status === 503 ? "Comparația revine după actualizarea datelor, de obicei peste noapte." : error}</p>
        <div className="pxs-acts pxs-acts--out">
          <Link className="pxs-btn p" href={entityHref(entityId, role)}>Pagina {role === "supplier" ? "firmei" : "instituției"} →</Link>
          {mapHref && <Link className="pxs-btn" href={mapHref} prefetch={false}>Vezi-o pe hartă →</Link>}
          {(state.status === 400 || state.status === 409) ? <a className="pxs-btn" href={`/entitati/${entityId}/comparatii?rol=${rol}`}>Reia comparația pe datele actuale</a> : <button type="button" className="pxs-btn" onClick={() => setRetry((value) => value + 1)}>Reîncearcă</button>}
        </div></div>
      : data && <>
        {/* Another period, domain or channel: the answer stays in place, dimmed, and the status floats (DESIGN.md). */}
        {busy && <FloatStatus>Se actualizează comparația…</FloatStatus>}
        <div className={busy ? "g-stale" : undefined} aria-busy={busy || undefined}>
        {unknownType ? <UnknownType focal={focal ?? null} division={cpvCode && cpvCode !== "all" ? { code: cpvCode, name: domainName(cpvCode, division?.label) } : null} county={data.entity.county} year={typeof yearValue === "number" ? yearValue : null}
            pageHref={entityHref(entityId, role)} onSources={focal ? () => showSources(focal) : null} busy={busy} />
        : !focal ? <section className="px-empty"><h2>Nu avem înregistrări eligibile în această selecție.</h2><p>Schimbă perioada, domeniul sau canalul.{(data.filters.year !== "all" || data.filters.cpv !== "all") && <> <InfoMark title="Ce e exclus" text={[data.filters.year !== "all" && "Înregistrările fără an utilizabil sunt excluse.", data.filters.cpv !== "all" && "Înregistrările fără cod CPV utilizabil sunt excluse."].filter(Boolean).join(" ")} /></>}</p>
            {widen && <div className="pxs-acts pxs-acts--out">{widenButtons("pxs-btn")}</div>}</section> : <>
          {ranking && axis ? <section className="pxs-stage" aria-label="Locul în grup">
            <div className="pxs-stage-top">
              {/* Two words and an "i" (owner, 17 November 2026; before: the whole sentence over the chart). */}
              <p className="pxs-key"><span className="pxs-scale">scară logaritmică <InfoMark title="Cum citești graficul" text={`Fiecare punct e ${noun[0] === "firmă" ? "o firmă" : noun[0] === "administrație" ? "o administrație" : "o instituție"} din grup, după ${metric === "total" ? "valoarea înregistrată" : "valoarea pe înregistrare"}, pe o scară logaritmică${data.pointsSampled ? ` (un eșantion de ${count(points.length)} din ${count(observedCount)})` : ""}.${metric === "mean" ? " Valoarea totală împărțită la numărul de înregistrări. Nu e un preț unitar: un domeniu CPV adună achiziții foarte diferite." : ""}${observedCount < data.cohort.count ? ` ${countWords(data.cohort.count - observedCount, "membru fără înregistrări rămâne", "membri fără înregistrări rămân")} în grup, dar nu în desen și nici în mediană: lipsa înregistrărilor nu înseamnă zero lei.` : ""}${median === null ? " Mediana cere cel puțin 5 alți membri cu înregistrări." : ""}`} /></span>
                <span className="pxs-legend" aria-hidden="true"><span><i className="sw band" />jumătatea din mijloc</span><span><i className="sw med" />mediana</span><span className="pxs-legend-me"><i className="sw me" />{shownName}</span></span></p>
              <div className="pxs-seg" role="group" aria-label="Măsura"><button type="button" aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total</button><button type="button" aria-pressed={metric === "mean"} onClick={() => setMetric("mean")}>Pe înregistrare</button></div></div>
            <Swarm points={points} focal={{ name: shownName, value: focalValue }} median={median} metric={metric} role={role} rank={rank} total={total} axis={axis} rankOf={rankOf}
              compact={small} nameOf={(id: string, name: string) => placeOf(id)?.name ?? tidyTitle(name)} />
          </section> : <section className="px-empty px-empty--short"><h2>{comparisonAvailable && focal.recordCount === 0 ? "Nu are înregistrări în această selecție." : "Grupul nu are încă membri cu înregistrări."}</h2>
            <p>{data.filters.county ? "Încearcă toată țara, alt an sau alt domeniu." : method === "manual" ? "Grupul ales e gol: revino la grupul automat." : widen ? "Lărgește selecția:" : "Încearcă alt canal."}</p>
            {widen && <div className="pxs-acts pxs-acts--out">{widenButtons("pxs-btn")}</div>}</section>}

          <div className="pxs-cols">
            {ranking && (small
              // A small group (UX audit Z4-31): its whole ranking once, with her row marked, in place of „În jurul ei”.
              ? <section className="pxs-near" aria-labelledby="pxs-near-h"><h2 id="pxs-near-h">Clasamentul{groupTip}</h2>
                {groupNote}
                <ol className="pxs-rows" data-chart="">{shownRows.map((r, i) => <RankRow key={r.id} row={r} place={placeOf(r.id)} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={rowSources} enter={rowEnter(i)} />)}</ol></section>
              : <section className="pxs-near" aria-labelledby="pxs-near-h"><h2 id="pxs-near-h">În jurul ei{groupTip}</h2>
                {groupNote}
                <ol className="pxs-rows" data-chart="">{neighbours.map((r, i) => <RankRow key={r.id} row={r} place={placeOf(r.id)} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={rowSources} enter={rowEnter(i)} />)}</ol>
                {data.cohort.count > 5 && <button type="button" className="pxs-more" aria-expanded={listOpen} aria-controls="peer-members" onClick={openList}>Tot clasamentul · {countWords(total, noun[0], noun[1])}
                  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
              </section>)}
          </div>

          {listOpen && !small && data.cohort.count > 0 && <section id="peer-members" className="pxs-list">
            <div className="pxs-list-h"><h2 ref={listHeading} tabIndex={-1}>Tot clasamentul{metric === "mean" ? ", după valoarea pe înregistrare" : ""}</h2><span>{countWords(ranked.length, noun[0], noun[1])}, inclusiv ea</span></div>
            {data.pointsSampled ? <>
              {/* Over 3.000 members the swarm is a sample, so the list stays the server's: pages of 20 by value. */}
              <ol className="pxs-rows" data-chart="">{data.members.map((m, i) => <RankRow key={m.entity.id} row={{ id: m.entity.id, name: m.entity.name, value: Number(m.totalExact), exact: m.totalExact, records: m.recordCount, focal: false, rank: null }} place={placeOf(m.entity.id)} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={() => showSources(m)} enter={rowEnter(i)} />)}</ol>
              {data.pagination.totalPages > 1 && <nav className="pxs-pager" aria-label="Paginile grupului"><button type="button" className="pxs-btn" disabled={busy || data.pagination.page <= 1} onClick={() => turnPage(data.pagination.page - 1)}>← Înapoi</button><span>{count(data.pagination.page)} / {count(data.pagination.totalPages)}</span><button type="button" className="pxs-btn" disabled={busy || !data.pagination.hasNext} onClick={() => turnPage(data.pagination.page + 1)}>Înainte →</button></nav>}
            </> : <>
              <ol className="pxs-rows" data-chart="">{ranked.slice(listPage * LIST_PAGE, listPage * LIST_PAGE + LIST_PAGE).map((r, i) => <RankRow key={r.id} row={r} place={placeOf(r.id)} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={rowSources} enter={rowEnter(i)} />)}</ol>
              {pages > 1 && <nav className="pxs-pager" aria-label="Paginile grupului"><button type="button" className="pxs-btn" disabled={listPage <= 0} onClick={() => { setListPage((p) => p - 1); requestAnimationFrame(() => listHeading.current?.focus()); }}>← Înapoi</button>
                <span>{count(listPage + 1)} / {count(pages)}{listPage !== focalPage && <> · <button type="button" className="pxs-link" onClick={() => setListPage(focalPage)}>la locul ei</button></>}</span>
                <button type="button" className="pxs-btn" disabled={listPage >= pages - 1} onClick={() => { setListPage((p) => p + 1); requestAnimationFrame(() => listHeading.current?.focus()); }}>Înainte →</button></nav>}
            </>}
          </section>}
          {/* The comparison's own actions, one quiet row under the ranking (owner, 19 November 2026; before: a panel beside
              it, where „Sursele ei” repeated her row's „Surse”). Without a ranking her sources have no row: the button stays. */}
          <div className="pxs-acts pxs-acts--foot">
            {!ranking && <button type="button" className="pxs-btn" disabled={busy || focal.recordCount === 0} onClick={() => showSources(focal)}>Sursele ei · {count(focal.recordCount)}</button>}
            {canCapture && <button type="button" className="pxs-btn" disabled={busy} onClick={() => showSources()}>Sursele comparației</button>}
            {comparison && !busy && <ClipButton kind="query" spec={peerEvidenceSpec(comparison)} label={`Comparație în context · ${currentName}`} snapshot={{ peer: comparison, sourceUrl: typeof window === "undefined" ? "" : window.location.pathname + window.location.search }} />}
            <button type="button" className="pxs-btn" onClick={() => void copyLink()}>{linkCopied ? <><DoneCheck />Copiat</> : "Copiază linkul"}</button>
            <span className="d-sr-only" role="status">{linkCopied ? "Link copiat. Păstrează criteriile și versiunea datelor." : ""}</span>
            {mapHref && <Link className="pxs-btn" href={mapHref} prefetch={false}>Pe hartă: {onMap?.siruta && onMap.siruta !== 179132 ? shownName : countyLabel(onMap?.county) ?? "județul"} →</Link>}
            {method === "manual" && <button type="button" className="pxs-btn" disabled={busy} onClick={resetGroup}>Revino la grupul automat</button>}
            {!canCapture && comparisonAvailable && <InfoMark title="Sursele comparației" label="De ce lipsesc sursele comparației" text="Grupul are peste 499 de membri: restrânge județul ca să salvezi întreaga comparație." />}
          </div>
          {copied && <p className="pxs-note" role="status">{copied}</p>}
        </>}
        </div>
        {/* Three plain sentences first (UX audit Z4-42), the technical text behind its own words; both float over the page
            (owner, 20 November 2026; before: a fold, and a fold inside it, that pushed the page down). */}
        <p className="how-note pxs-method">
          <Term tip hold="line" title="Cum e construit grupul și ce limite are" text={<span className="how-n">{method === "population" ? "Intră administrațiile din țară cu populația cea mai apropiată (recensământul 2021), oricât au cumpărat." : method === "manual" ? "Intră administrațiile alese de tine." : `Intră ${role === "supplier" ? "firmele" : "instituțiile de același tip"} cu un număr asemănător de înregistrări în aceeași selecție.`}
            {" "}Se compară valoarea înregistrată în perioada, domeniul și canalul alese. O diferență față de mediană e o pistă de verificat, nu o neregulă; valorile nu sunt plăți.</span>}>Cum e construit grupul și ce limite are</Term>
          <span className="pxs-method-sep" aria-hidden="true"> · </span>
          <Term tip hold="line" title="Detalii tehnice" text={<>
            {data.methodology.descriptions.map((text) => <span className="how-n" key={text}>{text}</span>)}
            {(data.filters.year === "all" || data.filters.cpv === "all") && <span className="how-n">{data.filters.year === "all" && "Valorile cumulează toți anii disponibili. "}Intră și înregistrările {data.filters.year === "all" && data.filters.cpv === "all" ? "fără dată sau fără cod CPV" : data.filters.year === "all" ? "fără dată" : "fără cod CPV"} care respectă celelalte filtre.</span>}
            <span className="how-n">În sursele entității: {recordsWords(data.coverage.focalUndatedRows)} fără an utilizabil; {recordsWords(data.coverage.focalYearMissingCpvRows)} fără CPV utilizabil în perioada aleasă. {recordsWords(data.coverage.unresolvedEntityRows)} din populația selectată nu au identități rezolvate.</span>
            {(data.cohort.excludedUnknownType > 0 || data.cohort.excludedUnknownCounty > 0) && <span className="how-n">Excluderi din grup: {countWords(data.cohort.excludedUnknownType, "entitate", "entități")} cu tip necunoscut sau ambiguu; {countWords(data.cohort.excludedUnknownCounty, "entitate", "entități")} fără județ cunoscut atunci când restrângi geografia.</span>}
            <span className="how-n">Versiunea datelor: {data.checkpoint.version}. Validarea acestei versiuni nu reprezintă data colectării surselor. Un an încheiat nu garantează colectare completă.</span>
          </>}>Detalii tehnice</Term>
        </p>
      </>}
    {sources && <EvidenceDrawer spec={peerEvidenceSpec(sources.receipt)} peer={sources.receipt} title={sources.title} onClose={() => setSources(null)} />}
  </div>;
}
