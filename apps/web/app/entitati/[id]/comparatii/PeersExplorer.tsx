"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import OptionList from "@/app/intreaba/builder/pickers/OptionList";
import type { KitOption } from "@/app/intreaba/builder/kit-types";
import "@/app/intreaba/builder/filters-kit.css";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { countWords } from "@/lib/ask/answer-text";
import { formatEvidenceAmount } from "@/lib/ask/evidence";
import type { ConnectionRole } from "@/lib/connections-shared";
import { entityHref } from "@/lib/entity-href";
import { cleanName, countyLabel } from "@/lib/format";
import { peerEvidenceSpec, type PeerEvidenceSelection } from "@/lib/peers-evidence-shared";
import { peerDomainLabel, peerPeriodLabel } from "@/lib/peers-shared";
import type { PeerMember, PeerMethod, PeerPoint, PeerSelectionMember, PeersResponse } from "@/lib/peers-shared";

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
type Row = { id: string; name: string; value: number; exact: string; records: number; focal: boolean; rank: number | null; extra?: string | undefined };
type Axis = { lo: number; hi: number };

const LIST_PAGE = 20;
const count = (value: number) => value.toLocaleString("ro-RO");
const query = (values: Record<string, string | number | PeerSelectionMember[] | undefined>) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])).toString();
function initialMembers(value?: string): PeerSelectionMember[] | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as PeerSelectionMember[]; } catch { return undefined; }
}
const kinds: Record<string, string> = { comuna: "comune", oras_municipiu: "orașe / municipii", consiliu_judetean: "consilii județene", spital: "spitale", scoala: "școli", universitate: "universități", minister: "ministere" };
const DATASETS = [{ value: "all", label: "Toate" }, { value: "da", label: "Directe" }, { value: "contracts", label: "Proceduri" }] as const;
/** Romanian "de" after a number: 19 înregistrări, 20 de înregistrări, 101 înregistrări, 120 de înregistrări. */
const de = (n: number) => { const last = Math.abs(Math.trunc(n)) % 100; return n !== 0 && (last === 0 || last >= 20) ? " de" : ""; };
const recordsWords = (n: number) => countWords(n, "înregistrare", "înregistrări");
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "1,89 mld." · "1,5 mil." · "23 mii": an amount at the size of the eye, the exact one stays on hover. */
function short(value: number): string {
  const f = (n: number, d: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });
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
  label: string; text: string; title: string; options: KitOption[]; value: string; onPick: (value: string) => void; disabled: boolean;
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

/** One ranked row: place, name (its page) with one line of facts, its position on the axis, the short amount (exact on hover), its sources. */
function RankRow({ row, axis, median, role, busy, opening, onSources }: {
  row: Row; axis: Axis | null; median: number | null; role: ConnectionRole; busy: boolean; opening: string | null; onSources: (row: Row) => void;
}) {
  return <li className={row.focal ? "pxs-row is-focal" : "pxs-row"}>
    <span className="pxs-n">{row.rank === null ? "" : count(row.rank)}</span>
    <span className="pxs-name">{row.focal ? <b>{row.name}</b> : <EntityName id={row.id} role={role}>{cleanName(row.name) || "—"}</EntityName>}
      <small>{row.records > 0 ? recordsWords(row.records) : "fără înregistrări în selecție"}{row.extra ? ` · ${row.extra}` : ""}</small></span>
    <span className="pxs-track" aria-hidden="true">{median !== null && median > 0 && <b style={{ left: `${along(axis, median) * 100}%` }} />}{row.records > 0 && <i style={{ left: `${along(axis, row.value) * 100}%` }} />}</span>
    <span className="pxs-v" title={row.records > 0 ? formatEvidenceAmount(row.exact, true) : undefined}>{row.records > 0 ? `${short(row.value)} lei` : "—"}</span>
    <button type="button" className="pxs-src" disabled={busy || opening !== null || row.records === 0} aria-label={`Vezi sursele: ${row.focal ? row.name : cleanName(row.name)}`}
      onClick={() => onSources(row)}>{opening === row.id ? "…" : "Surse"}</button>
  </li>;
}

/**
 * The swarm: every member with records as a dot on a logarithmic value axis, stacked where they meet; the middle
 * half as a band, the median as a dashed rule, the entity as an orange ring that lets a neighbour show through. The
 * nearest dot answers the pointer with its name, place and exact value and opens its page; the lists under the
 * stage hold the same members for the keyboard. Switching the measure slides every dot to its new place.
 */
function Swarm({ points, focal, median, metric, role, rank, total, axis, rankOf }: {
  points: readonly PeerPoint[]; focal: { name: string; value: number }; median: number | null; metric: Metric; role: ConnectionRole;
  rank: number; total: number; axis: Axis; rankOf: ReadonlyMap<string, number>;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const phone = width > 0 && width < 640;
  const H = phone ? 220 : 290, TOP = 40, AXIS = 30;
  const mid = TOP + (H - TOP - AXIS) / 2;
  const layout = useMemo(() => {
    if (width === 0) return null;
    const value = (p: PeerPoint) => (metric === "total" ? p.total : p.mean);
    const pad = 12;
    const x = (v: number) => pad + along(axis, Math.max(v, 10 ** axis.lo)) * (width - 2 * pad);
    // Dots as big as the group allows: a small group (population, a hand-picked one) gets dots to point at, a
    // middling one fills the stage's height, only the largest groups go down to the smallest dot.
    const n = points.length;
    const r = n <= 60 ? (phone ? 4.5 : 5.5) : n <= 800 ? (phone ? 3 : 4.2) : phone ? 2.4 : 3, step = 2 * r + 1, half = (H - TOP - AXIS) / 2 - r - 2;
    const sorted = [...points].sort((a, b) => value(a) - value(b));
    const cols = new Map<number, number>();
    const raw = sorted.map((p) => {
      const col = Math.round(x(value(p)) / step), k = cols.get(col) ?? 0;
      cols.set(col, k + 1);
      return { p, x: col * step, off: k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? -1 : 1) };
    });
    const widest = Math.max(1, ...raw.map((d) => Math.abs(d.off)));
    const squeeze = widest > half ? half / widest : 1;
    const dots = raw.map((d) => ({ ...d, y: mid + d.off * squeeze, v: value(d.p) }));
    const values = sorted.map(value);
    const ticks = Array.from({ length: axis.hi - axis.lo + 1 }, (_, i) => 10 ** (axis.lo + i));
    return { x, r, dots, q1: quantile(values, 0.25), q3: quantile(values, 0.75), ticks };
  }, [points, metric, width, phone, H, mid, axis]);

  function nearest(event: ReactPointerEvent<SVGSVGElement>) {
    if (!layout) return;
    const rect = event.currentTarget.getBoundingClientRect(), px = event.clientX - rect.left, py = event.clientY - rect.top;
    let best = -1, distance = 22 * 22;
    layout.dots.forEach((d, i) => { const dd = (d.x - px) ** 2 + (d.y - py) ** 2; if (dd < distance) { distance = dd; best = i; } });
    setHover(best < 0 ? null : best);
  }
  const shown = hover === null || !layout ? null : layout.dots[hover];
  const fx = layout ? layout.x(focal.value) : 0;
  const right = width > 0 && fx > width * 0.6;
  // The two labels share the line above the dots; when the entity's would run into the median's, it climbs one line.
  const focalWords = `${phone ? "" : `${focal.name} · `}${short(focal.value)} · locul ${count(rank)}`;
  const medianWords = median !== null && median > 0 ? `mediana ${short(median)}` : "";
  const glyph = 6.8, focalSpan = right ? [fx + 4 - focalWords.length * glyph, fx + 4] : [fx - 4, fx - 4 + focalWords.length * glyph];
  const mx = layout && medianWords ? layout.x(median!) + 6 : -1;
  const clash = mx >= 0 && focalSpan[0]! < mx + medianWords.length * glyph + 8 && focalSpan[1]! > mx - 8;
  const unit = metric === "total" ? "lei" : "lei pe înregistrare";
  const ring = layout ? layout.r + (phone ? 4 : 5) : 8;
  return <div className="pxs-swarm" ref={box} style={{ height: H }}>
    {layout && <svg width={width} height={H} role="img" aria-label={`${focal.name}: locul ${count(rank)} din ${count(total)}, ${short(focal.value)} ${unit}${median ? `; mediana grupului ${short(median)}` : ""}.`}
      onPointerMove={nearest} onPointerLeave={() => setHover(null)} onClick={() => { if (shown) router.push(entityHref(shown.p.id, role)); }} className={shown ? "is-pointing" : undefined}>
      {layout.dots.length >= 4 && <rect className="pxs-band" x={layout.x(layout.q1)} y={TOP - 6} width={Math.max(2, layout.x(layout.q3) - layout.x(layout.q1))} height={H - TOP - AXIS + 6} />}
      <line className="pxs-axis" x1={0} x2={width} y1={H - AXIS + 2} y2={H - AXIS + 2} />
      {layout.ticks.map((t, i) => {
        const tx = layout.x(t), skip = phone && i % 2 === 1 && i !== layout.ticks.length - 1;
        return <g key={t}><line className="pxs-axis" x1={tx} x2={tx} y1={H - AXIS + 2} y2={H - AXIS + 7} />
          {!skip && <text className="pxs-tick" x={tx} y={H - 8} textAnchor={i === 0 ? "start" : i === layout.ticks.length - 1 ? "end" : "middle"}>{tick(t)}{i === 0 ? " lei" : ""}</text>}</g>;
      })}
      {median !== null && median > 0 && <g className="pxs-median"><line x1={layout.x(median)} x2={layout.x(median)} y1={TOP - 22} y2={H - AXIS} />
        <text x={layout.x(median) + 6} y={TOP - 12}>{medianWords}</text></g>}
      {layout.dots.map((d, i) => <circle key={d.p.id} className={i === hover ? "pxs-dot on" : "pxs-dot"} cx={d.x} cy={d.y} r={i === hover ? layout.r + 2 : layout.r} />)}
      {/* The entity's words sit above the dots, on the median's line, tied to its ring by a short rule; a phone drops the name (the title says it). */}
      <line className="pxs-focal-rule" x1={fx} x2={fx} y1={clash ? TOP - 22 : TOP - 6} y2={mid - ring - 1} />
      <circle className="pxs-focal" cx={fx} cy={mid} r={ring} />
      <text className="pxs-focal-t" x={right ? fx + 4 : fx - 4} y={clash ? TOP - 28 : TOP - 12} textAnchor={right ? "end" : "start"}>{focalWords}</text>
    </svg>}
    {shown && <div className={`pxs-tip${shown.x > width * 0.7 ? " r" : shown.x < width * 0.3 ? " l" : ""}`} style={{ left: shown.x, top: shown.y }} aria-hidden="true">
      <b>{cleanName(shown.p.name) || "—"}</b>
      <span className="pxs-tip-v">{formatEvidenceAmount(metric === "total" ? shown.p.totalExact : shown.p.meanExact, true)}{metric === "mean" ? " pe înregistrare" : ""}</span>
      <span>{rankOf.has(shown.p.id) ? `locul ${count(rankOf.get(shown.p.id)!)} · ` : ""}{recordsWords(shown.p.records)}</span>
    </div>}
  </div>;
}

export default function PeersExplorer({ entityId, entityName, role, initial }: {
  entityId: string; entityName: string; role: ConnectionRole; initial: Record<string, string>;
}) {
  const first: Criteria = { dataset: initial.dataset ?? "all", year: initial.year ?? "", cpv: initial.cpv ?? "", county: initial.county ?? "" };
  const [request, setRequest] = useState<Request>({ ...first, page: Number(initial.page ?? 1), ...(initial.identity ? { identity: initial.identity } : {}), ...(initial.checkpointId ? { checkpointId: initial.checkpointId } : {}), ...(initial.method ? { method: initial.method as PeerMethod } : {}), ...(initial.populationVersion ? { populationVersion: initial.populationVersion } : {}), ...(initial.members ? { members: initialMembers(initial.members) } : {}) });
  const [state, setState] = useState<{ key: string; data: PeersResponse | null; error: string; status: number }>({ key: "", data: null, error: "", status: 0 });
  const [pending, setPending] = useState(true), [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<Metric>("total");
  const [sources, setSources] = useState<Source | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [listOpen, setListOpen] = useState(Number(initial.page ?? 1) > 1);
  const [listPage, setListPage] = useState(0);
  const pinned = useRef({ identity: initial.identity, checkpointId: initial.checkpointId });
  const listHeading = useRef<HTMLHeadingElement>(null);
  const key = query({ entityId, role, ...request });
  const data = state.data;
  const busy = pending || state.key !== key;
  const error = state.key === key ? state.error : "";
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
        window.history.replaceState(null, "", `${window.location.pathname}?${query({ rol, ...next.filters, year: next.filters.year ?? undefined, cpv: next.filters.cpv ?? undefined, ...pinned.current })}`);
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
      else setCopied(body.error ?? `Nu am putut deschide sursele: ${cleanName(name)}.`);
    } catch { setCopied(`Nu am putut deschide sursele: ${cleanName(name)}. Reîncearcă.`); }
    finally { setOpening(null); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Link copiat. Păstrează criteriile și versiunea datelor."); }
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
      const d = p.differencePercent === null || p.differencePercent === undefined ? 0 : Math.round(p.differencePercent);
      return `${countWords(p.value, "locuitor", "locuitori")}${d !== 0 ? ` (${d > 0 ? "+" : "−"}${count(Math.abs(d))}%)` : ""}`;
    };
    const rows: Row[] = points.map((p) => ({ id: p.id, name: p.name, value: metric === "total" ? p.total : p.mean, exact: metric === "total" ? p.totalExact : p.meanExact, records: p.records, focal: false, rank: null, extra: populationWords(byId.get(p.id)) }));
    rows.push({ id: entityId, name: currentName, value: focalValue, exact: metric === "total" ? focal.totalExact : focal.meanRounded, records: focal.recordCount, focal: true, rank: null,
      extra: focal.population && method !== "activity" ? countWords(focal.population.value, "locuitor", "locuitori") : undefined });
    rows.sort((a, b) => b.value - a.value || (a.focal ? -1 : b.focal ? 1 : 0));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const silent = (data?.members ?? []).filter((m) => m.recordCount === 0 && !points.some((p) => p.id === m.entity.id));
    return [...rows, ...silent.map((m) => ({ id: m.entity.id, name: m.entity.name, value: 0, exact: "0", records: 0, focal: false, rank: null, extra: populationWords(m) }))];
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
  const focalPage = at < 0 ? 0 : Math.floor(at / LIST_PAGE);
  useEffect(() => { setListPage(focalPage); }, [focalPage, key]);

  const division = data?.options.divisions.find((item) => item.code === data.filters.cpv);
  const versus = focal ? versusMedian(focalValue, median) : null;
  const domain = data ? data.filters.cpv === "all" ? "toate domeniile" : `${division?.label ?? peerDomainLabel(data.filters.cpv)} (CPV ${data.filters.cpv})` : "";
  const period = data ? data.filters.year === "all" ? "toți anii" : String(data.filters.year ?? "") : "";
  const channel = data?.filters.dataset === "da" ? "achiziții directe" : data?.filters.dataset === "contracts" ? "proceduri" : "";
  const band = data ? `${count(data.cohort.minimumRecords)}–${count(data.cohort.maximumRecords)}${de(data.cohort.maximumRecords)} înregistrări` : "";

  const yearOptions: KitOption[] = [{ value: "all", label: "Toți anii", detail: "cumulat, cu înregistrările fără dată" }, ...(options?.years ?? []).map((y) => ({ value: String(y), label: String(y), ...(y >= new Date().getFullYear() ? { detail: "an în curs, incomplet" } : {}) }))];
  const divisionTotal = (options?.divisions ?? []).reduce((a, d) => a + Number(d.totalExact), 0) || 1;
  const cpvOptions: KitOption[] = [{ value: "all", label: "Toate domeniile", detail: "cu înregistrările fără cod CPV" }, ...(options?.divisions ?? []).map((d) => ({ value: d.code, label: `${d.code} · ${d.label}`, count: `${short(Number(d.totalExact))} lei`, share: Number(d.totalExact) / divisionTotal }))];
  const countyOptions: KitOption[] = [{ value: "", label: "Toată țara" }, ...(options?.counties ?? []).map((c) => ({ value: c, label: countyLabel(c) ?? c }))];
  const rowSources = (row: Row) => (row.focal ? showSources(focal!) : void showPointSources(row.id, row.name));
  function openList() { setListOpen(true); setListPage(focalPage); requestAnimationFrame(() => listHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }

  return <div className="pxs">
    <p className="pxs-crumb"><Link href={entityHref(entityId, role)}>← {currentName}</Link> · {role === "authority" ? "instituție" : "firmă"}{data && countyLabel(data.entity.county) ? `, ${countyLabel(data.entity.county)}` : ""} · Comparații</p>
    <header className="pxs-head">
      <h1>{focal && comparisonAvailable ? <>Unde stă {currentName} între {countWords(total, noun[0], noun[1])}</> : <>Cu cine se compară {currentName}</>}</h1>
      {data && focal && comparisonAvailable && <p className="pxs-lede">
        {capital(domain)}, {period}{channel ? `, ${channel}` : ""}.{" "}
        {method === "population" ? <>Administrațiile cu populația cea mai apropiată{data.filters.county ? `, din județul ${data.filters.county}` : ""}.</> : method === "manual" ? <>Grupul ales de tine.</> : <>{role === "supplier" ? "Firmele" : `Instituțiile de același tip (${kinds[data.cohort.authorityKind ?? ""] ?? "nestabilit"})`} cu {band}, ca ea.</>}{" "}
        E pe locul <b>{count(rank)}</b>{versus ? <>: <b>{versus}</b></> : ""}{metric === "mean" ? ", după valoarea pe înregistrare" : ""}.
      </p>}
    </header>

    <div className="pxs-filters" role="group" aria-label="Ce se compară">
      <Choice label="Perioada" text={data ? peerPeriodLabel(data.filters.year) : request.year || "…"} title="Ce an?" options={yearOptions} value={data ? String(data.filters.year ?? "") : request.year} onPick={(year) => change({ year })} disabled={!options} />
      <Choice label="Domeniul" text={data ? data.filters.cpv === "all" ? "Toate" : `CPV ${data.filters.cpv}${division ? ` · ${division.label}` : ""}` : "…"} title="Ce domeniu CPV?" options={cpvOptions} value={data?.filters.cpv ?? request.cpv} onPick={(cpv) => change({ cpv })} disabled={!options} />
      <div className="pxs-seg" role="group" aria-label="Achizițiile comparate">{DATASETS.map((d) => <button key={d.value} type="button" aria-pressed={(data?.filters.dataset ?? request.dataset) === d.value} disabled={!data} onClick={() => change({ dataset: d.value })}>{d.label}</button>)}</div>
      {method !== "manual" && countyOptions.length > 1 && <Choice label="Județul" text={data?.filters.county ? countyLabel(data.filters.county) ?? data.filters.county : "Toată țara"} title="Membrii din ce județ?" options={countyOptions} value={data?.filters.county ?? ""} onPick={(county) => change({ county })} disabled={!options} />}
    </div>
    {data && (data.suggested.year || data.suggested.cpv) && <p className="pxs-note">Sugerat: {data.suggested.year ? "ultimul an încheiat" : "anul ales"} și {data.suggested.cpv ? "domeniul cu cea mai mare valoare" : "domeniul ales"}.</p>}
    {data && typeof data.filters.year === "number" && data.filters.year >= new Date().getFullYear() && <p className="px-notice">Anul ales e în curs: valorile nu acoperă un an întreg.</p>}

    {busy && !data ? <div className="px-loading" role="status"><p>Se construiește grupul și se verifică sursele…</p>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" />)}</div>
      : error ? <div className="px-error" role="alert"><h2>Comparația nu este disponibilă.</h2><p>{error}</p>{(state.status === 400 || state.status === 409) ? <a className="pxs-btn" href={`/entitati/${entityId}/comparatii?rol=${rol}`}>Reia comparația pe datele actuale</a> : <button className="pxs-btn" onClick={() => setRetry((value) => value + 1)}>Reîncearcă</button>}</div>
      : data && <>
        {busy && <p className="px-updating" role="status">Se actualizează comparația…</p>}
        {!focal ? <section className="px-empty"><h2>Nu avem înregistrări eligibile în această selecție.</h2><p>Schimbă perioada, domeniul sau canalul. {data.filters.year !== "all" && " Înregistrările fără an utilizabil sunt excluse."}{data.filters.cpv !== "all" && " Înregistrările fără cod CPV utilizabil sunt excluse."}</p></section> : <>
          {comparisonAvailable && observedCount > 0 && axis ? <section className="pxs-stage" aria-label="Locul în grup">
            <div className="pxs-stage-top">
              <p className="pxs-key"><span>Fiecare punct e {noun[0] === "firmă" ? "o firmă" : noun[0] === "administrație" ? "o administrație" : "o instituție"} din grup, după {metric === "total" ? "valoarea înregistrată" : "valoarea pe înregistrare"}, pe o scară logaritmică{data.pointsSampled ? ` (un eșantion de ${count(points.length)} din ${count(observedCount)})` : ""}.</span>
                <span className="pxs-legend" aria-hidden="true"><span><i className="sw band" />jumătatea din mijloc</span><span><i className="sw med" />mediana</span><span><i className="sw me" />{currentName}</span></span></p>
              <div className="pxs-seg" role="group" aria-label="Măsura"><button type="button" aria-pressed={metric === "total"} onClick={() => setMetric("total")}>Total</button><button type="button" aria-pressed={metric === "mean"} onClick={() => setMetric("mean")}>Pe înregistrare</button></div></div>
            <Swarm points={points} focal={{ name: currentName, value: focalValue }} median={median} metric={metric} role={role} rank={rank} total={total} axis={axis} rankOf={rankOf} />
            {metric === "mean" && <p className="pxs-note">Valoarea totală împărțită la numărul de înregistrări. Nu e un preț unitar: un domeniu CPV adună achiziții foarte diferite.</p>}
          </section> : <section className="px-empty"><h2>{data.cohort.status === "unknown_authority_type" ? "Nu putem stabili tipul acestei instituții." : "Grupul nu are încă membri cu înregistrări."}</h2>
            <p>{data.cohort.status === "unknown_authority_type" ? <>Fără tip nu există un grup automat. <Term tip id="tip-institutie" /></> : data.filters.county ? "Încearcă toată țara, alt an sau alt domeniu." : method === "manual" ? "Grupul ales e gol: revino la grupul automat." : "Încearcă alt an sau alt domeniu."}</p></section>}

          <div className="pxs-cols">
            {comparisonAvailable && observedCount > 0 && <section className="pxs-near" aria-labelledby="pxs-near-h"><h2 id="pxs-near-h">În jurul ei</h2>
              <ol className="pxs-rows">{neighbours.map((r) => <RankRow key={r.id} row={r} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={rowSources} />)}</ol>
              {data.cohort.count > 5 && <button type="button" className="pxs-more" aria-expanded={listOpen} aria-controls="peer-members" onClick={openList}>Tot clasamentul · {countWords(total, noun[0], noun[1])}
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
            </section>}
            <section className="pxs-who" aria-labelledby="pxs-who-h"><h2 id="pxs-who-h">Cine e în grup{method === "activity" && data.cohort.status !== "unknown_authority_type" ? <> <Term tip id="grup-activitate" /></> : method === "population" ? <> <Term tip id="grup-populatie" /></> : null}</h2>
              {method === "population" ? <p>{focal.population ? <>Cele {count(data.cohort.count)} administrații cu populația cea mai apropiată de a ei ({countWords(focal.population.value, "locuitor", "locuitori")}, recensământ {focal.population.referenceDate.slice(0, 4)}, <a href={focal.population.sourceUrl} target="_blank" rel="noreferrer">sursa INS</a>). Achizițiile nu contează la alegere.</> : "Nu am putut identifica sigur populația acestei administrații, deci nici grupul după populație."}</p>
                : method === "manual" ? <p>Grupul ales de tine: {countWords(data.cohort.count, noun[0], noun[1])}, din orice județ (cel mult 50). Rămâne când schimbi anul sau domeniul.</p>
                : data.cohort.status === "unknown_authority_type" ? <p>Nu putem stabili tipul instituției, deci nici un grup automat.</p>
                : <p>{role === "supplier" ? "Firmele" : "Instituțiile de același tip"} care au {role === "supplier" ? "vândut" : "cumpărat"} în {domain}, {period}, cu activitate asemănătoare: între jumătate și dublul celor {recordsWords(focal.recordCount)} ale ei. Un reper, nu o listă de concurenți.</p>}
              <dl className="pxs-facts">
                <div><dt>{method === "manual" ? "alese de tine" : `alte ${noun[1]}`}</dt><dd>{count(data.cohort.count)}</dd></div>
                {method === "activity" ? <div><dt>înregistrări fiecare</dt><dd>{count(data.cohort.minimumRecords)}–{count(data.cohort.maximumRecords)}</dd></div>
                  : focal.population ? <div><dt>locuitori, la recensământ</dt><dd>{short(focal.population.value)}</dd></div> : <div><dt>cu înregistrări</dt><dd>{count(observedCount)}</dd></div>}
                <div><dt>{metric === "total" ? "mediana valorii" : "mediana pe înregistrare"}</dt><dd>{median === null ? "—" : short(median)}</dd></div>
              </dl>
              {observedCount < data.cohort.count && <p className="pxs-note">{countWords(data.cohort.count - observedCount, "membru fără înregistrări rămâne", "membri fără înregistrări rămân")} în grup, dar nu în desen și nici în mediană: lipsa înregistrărilor nu înseamnă zero lei.</p>}
              {median === null && comparisonAvailable && <p className="pxs-note">Mediana cere cel puțin 5 alți membri cu înregistrări.</p>}
              {/* One row, one size (owner, 6 November 2026: the buttons looked thrown at random): her sources first, the
                  whole comparison's sources, then keeping it (investigation, link); a copied hand-picked group adds the way back. */}
              <div className="pxs-acts">
                <button type="button" className="pxs-btn p" disabled={busy} onClick={() => showSources(focal)}>Sursele ei · {count(focal.recordCount)}</button>
                {canCapture && <button type="button" className="pxs-btn" disabled={busy} onClick={() => showSources()}>Sursele comparației</button>}
                {comparison && !busy && <ClipButton kind="query" spec={peerEvidenceSpec(comparison)} label={`Comparație în context · ${currentName}`} snapshot={{ peer: comparison, sourceUrl: typeof window === "undefined" ? "" : window.location.pathname + window.location.search }} />}
                <button type="button" className="pxs-btn" onClick={() => void copyLink()}>Copiază linkul</button>
                {method === "manual" && <button type="button" className="pxs-btn" disabled={busy} onClick={resetGroup}>Revino la grupul automat</button>}
              </div>
              {!canCapture && comparisonAvailable && <p className="pxs-note">Grupul are peste 499 de membri: restrânge județul ca să salvezi întreaga comparație. Sursele fiecărui membru rămân la un clic.</p>}
              {copied && <p className="pxs-note" role="status">{copied}</p>}
            </section>
          </div>
          <p className="pxs-caveat">Valori înregistrate, nu plăți. O diferență față de mediană e o pistă, nu o dovadă.</p>

          {listOpen && data.cohort.count > 0 && <section id="peer-members" className="pxs-list">
            <div className="pxs-list-h"><h2 ref={listHeading} tabIndex={-1}>Tot clasamentul{metric === "mean" ? ", după valoarea pe înregistrare" : ""}</h2><span>{countWords(ranked.length, noun[0], noun[1])}, inclusiv ea</span></div>
            {data.pointsSampled ? <>
              {/* Over 3.000 members the swarm is a sample, so the list stays the server's: pages of 20 by value. */}
              <ol className="pxs-rows">{data.members.map((m) => <RankRow key={m.entity.id} row={{ id: m.entity.id, name: m.entity.name, value: Number(m.totalExact), exact: m.totalExact, records: m.recordCount, focal: false, rank: null }} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={() => showSources(m)} />)}</ol>
              {data.pagination.totalPages > 1 && <nav className="pxs-pager" aria-label="Paginile grupului"><button type="button" className="pxs-btn" disabled={busy || data.pagination.page <= 1} onClick={() => turnPage(data.pagination.page - 1)}>← Înapoi</button><span>{count(data.pagination.page)} / {count(data.pagination.totalPages)}</span><button type="button" className="pxs-btn" disabled={busy || !data.pagination.hasNext} onClick={() => turnPage(data.pagination.page + 1)}>Înainte →</button></nav>}
            </> : <>
              <ol className="pxs-rows">{ranked.slice(listPage * LIST_PAGE, listPage * LIST_PAGE + LIST_PAGE).map((r) => <RankRow key={r.id} row={r} axis={axis} median={median} role={role} busy={busy} opening={opening} onSources={rowSources} />)}</ol>
              {pages > 1 && <nav className="pxs-pager" aria-label="Paginile grupului"><button type="button" className="pxs-btn" disabled={listPage <= 0} onClick={() => { setListPage((p) => p - 1); requestAnimationFrame(() => listHeading.current?.focus()); }}>← Înapoi</button>
                <span>{count(listPage + 1)} / {count(pages)}{listPage !== focalPage && <> · <button type="button" className="pxs-link" onClick={() => setListPage(focalPage)}>la locul ei</button></>}</span>
                <button type="button" className="pxs-btn" disabled={listPage >= pages - 1} onClick={() => { setListPage((p) => p + 1); requestAnimationFrame(() => listHeading.current?.focus()); }}>Înainte →</button></nav>}
            </>}
          </section>}
        </>}
        <details className="pxs-method"><summary><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M4.5 3 7.5 6 4.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>Cum e construit grupul și ce limite are</summary>{data.methodology.descriptions.map((text) => <p key={text}>{text}</p>)}
          {(data.filters.year === "all" || data.filters.cpv === "all") && <p>{data.filters.year === "all" && "Valorile cumulează toți anii disponibili. "}Intră și înregistrările {data.filters.year === "all" && data.filters.cpv === "all" ? "fără dată sau fără cod CPV" : data.filters.year === "all" ? "fără dată" : "fără cod CPV"} care respectă celelalte filtre.</p>}
          <p>În sursele entității: {recordsWords(data.coverage.focalUndatedRows)} fără an utilizabil; {recordsWords(data.coverage.focalYearMissingCpvRows)} fără CPV utilizabil în perioada aleasă. {recordsWords(data.coverage.unresolvedEntityRows)} din populația selectată nu au identități rezolvate.</p>
          {(data.cohort.excludedUnknownType > 0 || data.cohort.excludedUnknownCounty > 0) && <p>Excluderi din grup: {countWords(data.cohort.excludedUnknownType, "entitate", "entități")} cu tip necunoscut sau ambiguu; {countWords(data.cohort.excludedUnknownCounty, "entitate", "entități")} fără județ cunoscut atunci când restrângi geografia.</p>}
          <p>Versiunea datelor: {data.checkpoint.version}. Validarea acestei versiuni nu reprezintă data colectării surselor. Un an încheiat nu garantează colectare completă.</p>
        </details>
      </>}
    {sources && <EvidenceDrawer spec={peerEvidenceSpec(sources.receipt)} peer={sources.receipt} title={sources.title} onClose={() => setSources(null)} />}
  </div>;
}
