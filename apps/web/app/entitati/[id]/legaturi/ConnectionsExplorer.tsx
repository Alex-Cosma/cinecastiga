"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import ClipButton from "@/components/ClipButton";
import Term from "@/components/Term";
import EntityName from "@/components/EntityName";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import PeriodPicker, { EMPTY_RANGE, periodRangeError, type PeriodRangeValue } from "@/app/intreaba/builder/PeriodPicker";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import "@/app/intreaba/builder/filters-kit.css";
import { countWords } from "@/lib/ask/answer-text";
import { cleanName, countyLabel } from "@/lib/format";
import { formatEvidenceAmount, sumDecimalStrings } from "@/lib/ask/evidence";
import type { Dataset } from "@/lib/ask/spec";
import type { ConnectionEntity, ConnectionPartner, ConnectionRole, ConnectionsResponse } from "@/lib/connections-shared";
import { connectionEvidenceSpec, type ConnectionEvidenceSelection, type ConnectionEvidencePair } from "@/lib/connection-evidence-shared";

/*
 * "Cum sunt legate?" (owner, 6 November 2026, "Fluxul banilor"): the money drawn as flow, from the entity to its
 * partners and from the chosen partner to that partner's other partners, each band as wide as its value; the dock
 * under it holds the chosen path, its records and its saving; the complete lists, with search and pages, sit under
 * the stage (and are the page on a phone). The data, the pinned identities and the copied-link restore are unchanged.
 */

type Scope = { dataset: Dataset; yearFrom?: number; yearTo?: number };
type Picked = { root: ConnectionEntity; partner: ConnectionPartner; checkpointId: string };
type Sources = { selection: ConnectionEvidenceSelection; title: string };
const number = (value: number) => value.toLocaleString("ro-RO");
const name = (entity: ConnectionEntity) => cleanName(entity.name);
const records = (item: ConnectionPartner) => item.daRows + item.contractRows;
const recordLabel = (n: number) => countWords(n, "înregistrare", "înregistrări");
const sourceLabel = (n: number) => n === 1 ? "Vezi sursa" : `Vezi cele ${countWords(n, "sursă", "surse")}`;
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "dată necunoscută";
const year = (value: string | null) => value ? value.slice(0, 4) : null;
const profileUrl = (entity: Pick<ConnectionEntity, "id" | "role">) => `/entitati/${entity.id}?rol=${entity.role === "authority" ? "autoritate" : "furnizor"}`;
const DATASETS: { value: Dataset; label: string }[] = [{ value: "all", label: "Toate" }, { value: "da", label: "Directe" }, { value: "contracts", label: "Proceduri" }];
const FIRST_YEAR = 2018;

/** A value for the drawing's labels: „2,94 mld.”, „883 mil.”, „45,3 mii”; the exact sums stay in the dock and sources. */
function short(value: number): string {
  const fmt = (n: number, d: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const scaled = (n: number) => fmt(n, n >= 100 ? 0 : n >= 10 ? 1 : 2);
  if (value >= 1e9) return `${scaled(value / 1e9)} mld.`;
  if (value >= 1e6) return `${scaled(value / 1e6)} mil.`;
  if (value >= 1e3) return `${scaled(value / 1e3)} mii`;
  return fmt(value, 0);
}
const pct = (share: number) => share >= 0.001 ? `${(share * 100).toLocaleString("ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "sub 0,1%";
const amount = (item: { totalExact: string }) => Number(item.totalExact);

function pair(a: ConnectionEntity, b: ConnectionEntity): ConnectionEvidencePair {
  const authority = a.role === "authority" ? a : b, supplier = a.role === "supplier" ? a : b;
  return { authority: { id: authority.id, identity: authority.identity }, supplier: { id: supplier.id, identity: supplier.identity } };
}
function query(values: Record<string, string | number | undefined>) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();
}
function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 250); return () => clearTimeout(timer); }, [value]);
  return debounced;
}
function useConnections(parameters: string | null) {
  const [state, setState] = useState<{ key: string; data: ConnectionsResponse | null; error: string; status: number }>({ key: "", data: null, error: "", status: 0 });
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!parameters) return;
    const controller = new AbortController();
    setPending(true);
    void (async () => {
      try {
        const response = await fetch(`/api/connections?${parameters}`, { signal: controller.signal });
        const body = await response.json();
        if (!controller.signal.aborted) setState({ key: parameters, data: response.ok ? body as ConnectionsResponse : null,
          error: response.ok ? "" : body.error ?? "Legăturile nu au putut fi încărcate.", status: response.status });
      } catch {
        if (!controller.signal.aborted) setState({ key: parameters, data: null, error: "Conexiunea a fost întreruptă. Reîncearcă încărcarea.", status: 0 });
      } finally { if (!controller.signal.aborted) setPending(false); }
    })();
    return () => controller.abort();
  }, [parameters, retry]);
  const busy = !!parameters && (pending || state.key !== parameters);
  return { data: parameters && state.key === parameters ? state.data : null, busy,
    error: parameters && state.key === parameters ? state.error : "", status: state.status, retry: () => setRetry(value => value + 1) };
}
/**
 * The last answer of one family (the same entity or partner, role and scope): while another page or search of that
 * list loads, it stays on screen (dimmed by the caller), so nothing collapses. A new family starts empty: a ghost.
 */
function useKept<T>(value: T | null, family: string | null): T | null {
  const kept = useRef<{ family: string; value: T } | null>(null);
  if (value !== null && family !== null) kept.current = { family, value };
  return value ?? (family !== null && kept.current?.family === family ? kept.current.value : null);
}

/* ---------------- the flow ---------------- */

/** Bands drawn per column: the largest four (the lede's „primele patru”) and the chosen one, then one band for the rest. */
const DRAWN = 4, DRAWN_RIGHT = 5;
const H = 440, GAP = 12;
const X_ROOT = 12, X_MID = 470, X_MID_W = 8, X_RIGHT = 800, X_RIGHT_W = 6;

type Node<T> = { key: string; item: T | null; value: number; share: number; y: number; h: number; label: string; rest?: number };

/** Stacks nodes top to bottom with a gap, every node at least 3 units tall, the column filling H. */
function stack<T>(nodes: { key: string; item: T | null; value: number; label: string; rest?: number }[], total: number): Node<T>[] {
  const space = H - GAP * Math.max(0, nodes.length - 1);
  const raw = nodes.map((n) => Math.max(3, (n.value / Math.max(1, total)) * space));
  const scale = space / raw.reduce((a, b) => a + b, 0);
  let y = 0;
  return nodes.map((n, i) => { const h = raw[i]! * scale; const node = { ...n, share: n.value / Math.max(1, total), y, h }; y += h + GAP; return node; });
}
/** Label tops: at their node's middle, pushed down so that two never overlap. */
function spread(nodes: { y: number; h: number }[], min = 44): number[] {
  const out: number[] = [];
  for (const n of nodes) { const want = n.y + n.h / 2 - 15; out.push(Math.max(want, (out[out.length - 1] ?? -Infinity) + min)); }
  const over = (out[out.length - 1] ?? 0) + 30 - H;
  return over > 0 ? out.map((t) => t - over) : out;
}
const band = (x1: number, a0: number, a1: number, x2: number, b0: number, b1: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1} ${a0}C${m} ${a0} ${m} ${b0} ${x2} ${b0}L${x2} ${b1}C${m} ${b1} ${m} ${a1} ${x1} ${a1}Z`;
};
const SHADES = ["c0", "c1", "c2", "c3", "c4", "c4", "c4"];
/** The largest few, and the chosen one when it ranks lower, in value order. */
function drawnOf(items: ConnectionPartner[], n: number, chosen: ConnectionPartner | null): ConnectionPartner[] {
  const top = items.slice(0, n);
  return chosen && !top.some((i) => i.entity.id === chosen.entity.id) ? [...top, chosen] : top;
}

/*
 * Charts in motion (owner, 6 November 2026). The first drawing: the root's bar is there, the bands are revealed from left
 * to right as one group (the money flows from the entity to its partners), the partners' nodes and names come after.
 * Choosing a partner fans its own partners out of its node (.cx-band2). Another period or kind of purchases redraws the
 * flow with a short fade: ribbons interpolated between two answers would read as chaos.
 */
function Flow({ root, rootRole, items, total, count, picked, second, secondTotal, peer, waiting, onPick, onPeer, onRest, onSecondRest, enter }: {
  root: ConnectionEntity; rootRole: ConnectionRole; items: ConnectionPartner[]; total: number; count: number;
  picked: ConnectionPartner | null; second: ConnectionsResponse | null; secondTotal: number; peer: ConnectionPartner | null;
  /** the chosen partner's own partners are loading (or the partner is being chosen): the right column is a ghost */
  waiting: boolean;
  onPick: (item: ConnectionPartner) => void; onPeer: (item: ConnectionPartner) => void; onRest: () => void; onSecondRest: () => void;
  /** the page's first flow, or one redrawn for another scope; fixed when the flow mounts */
  enter: "first" | "update";
}) {
  const isAuthority = rootRole === "authority";
  const [hover, setHover] = useState<string | null>(null);
  const [first] = useState(enter === "first");
  const drawn = drawnOf(items, DRAWN, picked);
  const restValue = Math.max(0, total - drawn.reduce((a, i) => a + amount(i), 0));
  const mid = stack<ConnectionPartner>([
    ...drawn.map((i) => ({ key: i.entity.id, item: i, value: amount(i), label: name(i.entity) })),
    ...(count > drawn.length ? [{ key: "rest", item: null, value: restValue, label: `alte ${countWords(count - drawn.length, isAuthority ? "furnizor" : "instituție", isAuthority ? "furnizori" : "instituții")}`, rest: count - drawn.length }] : []),
  ], total);
  // At the root the bands lie together, without gaps; they open out towards the partners.
  const rootAt0: number[] = [];
  mid.reduce((y, n) => { rootAt0.push(y); return y + n.share * H; }, 0);
  const midLabels = spread(mid);
  const sel = picked ? mid.find((n) => n.item?.entity.id === picked.entity.id) ?? null : null;

  // The chosen partner's other partners, the root placed among them by value (it is left out of the second list).
  const rootValue = picked ? amount(picked) : 0;
  const others = (second?.items ?? []).slice(0, DRAWN_RIGHT);
  const rightRaw: { key: string; item: ConnectionPartner | null; value: number; label: string; rest?: number }[] =
    others.map((i) => ({ key: i.entity.id, item: i, value: amount(i), label: name(i.entity) }));
  const rootAt = rightRaw.findIndex((r) => r.value < rootValue);
  if (picked) rightRaw.splice(rootAt < 0 ? rightRaw.length : rootAt, 0, { key: "root", item: null, value: rootValue, label: name(root) });
  const secondCount = second?.pagination.totalPartners ?? 0;
  const shownOthers = others.length;
  if (second && secondCount > shownOthers) rightRaw.push({ key: "rest", item: null, value: Math.max(0, secondTotal - rootValue - others.reduce((a, i) => a + amount(i), 0)), label: `alte ${countWords(secondCount - shownOthers, isAuthority ? "instituție" : "firmă", isAuthority ? "instituții" : "firme")}`, rest: secondCount - shownOthers });
  const right = second && picked ? stack<ConnectionPartner>(rightRaw, secondTotal) : [];
  const rightLabels = spread(right, 62);
  let fan = sel?.y ?? 0;
  const heads = { root: isAuthority ? "Instituția" : "Firma", mid: isAuthority ? "De la cine cumpără" : "Cine cumpără de la ea",
    right: picked ? (isAuthority ? `Cui mai vinde ${name(picked.entity)}` : `Cine mai vinde la ${name(picked.entity)}`) : "" };

  return (
    <div className="cx-flow" role="group" aria-label="Fluxul banilor" data-chart="">
      <div className="cx-flow-heads" aria-hidden="true" style={{ gridTemplateColumns: `${X_MID / 10}% ${(X_RIGHT - X_MID) / 10}% 1fr` }}>
        <span>{heads.root}</span><span>{heads.mid}</span><span className="r">{heads.right || (waiting && <><G.Line w="92%" /><G.Line w="56%" /></>)}</span>
      </div>
      <div className={first ? "cx-flow-stage" : "cx-flow-stage cm-in"}>
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect className="cx-root-bar" x="0" y="0" width={X_ROOT} height={H} rx="2" />
          <g className={first ? "cm-x" : undefined}>{mid.map((n, i) => (
            <path key={n.key} className={`cx-band ${n.item ? SHADES[i] : "rest"}${sel && n === sel ? " on" : ""}${sel && n !== sel ? " dim" : ""}${hover === n.key ? " hov" : ""}`}
              d={band(X_ROOT, rootAt0[i]!, rootAt0[i]! + n.share * H, X_MID, n.y, n.y + n.h)}
              onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}
              onClick={() => (n.item ? onPick(n.item) : onRest())} />
          ))}</g>
          <g className={first ? "cm-fade cx-after" : undefined}>{mid.map((n, i) => <rect key={n.key} className={`cx-node ${n.item ? SHADES[i] : "rest"}${sel && n === sel ? " on" : ""}`} x={X_MID} y={n.y} width={X_MID_W} height={n.h} />)}</g>
          {sel && right.map((n) => {
            const slice = sel.h * n.share, a0 = fan; fan += slice;
            return <path key={`${picked!.entity.id}:${n.key}`} className={`cx-band2${n.key === "root" ? " root" : n.item ? "" : " rest"}${peer && n.item?.entity.id === peer.entity.id ? " on" : ""}${peer && n.item?.entity.id !== peer.entity.id ? " dim" : ""}${hover === `r:${n.key}` ? " hov" : ""}`}
              d={band(X_MID + X_MID_W, a0, a0 + slice, X_RIGHT, n.y, n.y + n.h)} onMouseEnter={() => setHover(`r:${n.key}`)} onMouseLeave={() => setHover(null)}
              onClick={() => (n.item ? onPeer(n.item) : n.rest ? onSecondRest() : undefined)} />;
          })}
          {sel && right.map((n) => <rect key={n.key} className={`cx-node2${n.key === "root" ? " root" : n.item ? "" : " rest"}`} x={X_RIGHT} y={n.y} width={X_RIGHT_W} height={n.h} />)}
        </svg>
        <div className={first ? "cx-flow-labels cm-fade cx-after" : "cx-flow-labels"}>{mid.map((n, i) => (
          <button key={n.key} type="button" className={`cx-label${n.item ? "" : " rest"}${sel && n === sel ? " on" : ""}${hover === n.key ? " hov" : ""}`} style={{ left: `calc(${(X_MID + X_MID_W) / 10}% + 10px)`, top: `${(midLabels[i]! / H) * 100}%` }}
            onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}
            aria-pressed={n.item ? !!sel && n === sel : undefined} onClick={() => (n.item ? onPick(n.item) : onRest())}>
            <b>{n.label}</b><span>{short(n.value)} · {pct(n.share)}</span>
          </button>
        ))}</div>
        {sel && second && right.map((n, i) => n.key === "root"
          ? <p key={n.key} className="cx-label right root" style={{ left: `calc(${(X_RIGHT + X_RIGHT_W) / 10}% + 10px)`, top: `${(rightLabels[i]! / H) * 100}%` }}>
              <b>{n.label}</b><span>{short(n.value)} · {pct(n.share)}</span></p>
          : <button key={n.key} type="button" className={`cx-label right${n.item ? "" : " rest"}${peer && n.item?.entity.id === peer.entity.id ? " on" : ""}${hover === `r:${n.key}` ? " hov" : ""}`} style={{ left: `calc(${(X_RIGHT + X_RIGHT_W) / 10}% + 10px)`, top: `${(rightLabels[i]! / H) * 100}%` }}
              onMouseEnter={() => setHover(`r:${n.key}`)} onMouseLeave={() => setHover(null)}
              aria-pressed={n.item ? peer?.entity.id === n.item.entity.id : undefined} onClick={() => (n.item ? onPeer(n.item) : onSecondRest())}>
              <b>{n.label}</b><span>{short(n.value)} · {pct(n.share)}</span></button>)}
        {waiting ? <FlowSide label={isAuthority ? "Se încarcă clienții furnizorului…" : "Se încarcă ceilalți furnizori…"} />
          : !picked && <p className="cx-flow-wait" style={{ left: `${X_RIGHT / 10}%` }}>Alege {isAuthority ? "un furnizor" : "o instituție"} ca să vezi {isAuthority ? "cui mai vinde" : "cine mai vinde acolo"}.</p>}
      </div>
    </div>
  );
}

/**
 * The flow on a phone: each column as one bar of shares, the largest first, the rest as one grey part; a part opens
 * what its band opens. The chosen partner's bar marks the root in orange.
 */
function Strips({ root, rootRole, items, total, count, picked, second, secondTotal, peer, waiting, onPick, onPeer }: {
  root: ConnectionEntity; rootRole: ConnectionRole; items: ConnectionPartner[]; total: number; count: number;
  picked: ConnectionPartner | null; second: ConnectionsResponse | null; secondTotal: number; peer: ConnectionPartner | null;
  waiting: boolean;
  onPick: (item: ConnectionPartner) => void; onPeer: (item: ConnectionPartner) => void;
}) {
  const isAuthority = rootRole === "authority";
  const drawn = drawnOf(items, DRAWN, picked);
  const rest = Math.max(0, total - drawn.reduce((a, i) => a + amount(i), 0));
  const others = (second?.items ?? []).slice(0, DRAWN_RIGHT);
  const rootValue = picked ? amount(picked) : 0;
  const rest2 = Math.max(0, secondTotal - rootValue - others.reduce((a, i) => a + amount(i), 0));
  const seg = (key: string, value: number, of: number, cls: string, label: string, on: boolean, act?: () => void) =>
    act ? <button key={key} type="button" className={`cx-strip-seg cm-tw ${cls}${on ? " on" : ""}`} style={{ flexGrow: Math.max(value / Math.max(1, of), 0.012) }} aria-pressed={on} aria-label={`${label}: ${short(value)} lei, ${pct(value / Math.max(1, of))}`} onClick={act} />
      : <span key={key} className={`cx-strip-seg cm-tw ${cls}`} style={{ flexGrow: Math.max(value / Math.max(1, of), 0.012) }} aria-label={`${label}: ${pct(value / Math.max(1, of))}`} role="img" />;
  // Each strip grows as one, left to right, when it first appears (the chosen partner's when its answer arrives); a pick
  // then tweens the parts that stay (.cm-tw on flex-grow).
  return <div className="cx-strips" data-chart="">
    <p className="cx-strip-h">{isAuthority ? "De la cine cumpără" : "Cine cumpără de la ea"}</p>
    <div className="cx-strip cm-x">{drawn.map((i, k) => seg(i.entity.id, amount(i), total, SHADES[k]!, name(i.entity), picked?.entity.id === i.entity.id, () => onPick(i)))}
      {count > drawn.length && seg("rest", rest, total, "rest", `alte ${count - drawn.length}`, false)}</div>
    {picked && second && <>
      <p className="cx-strip-h">{isAuthority ? `Cui mai vinde ${name(picked.entity)}` : `Cine mai vinde la ${name(picked.entity)}`}</p>
      <div className="cx-strip cm-x">{[...others.map((i) => ({ key: i.entity.id, i, v: amount(i) })), { key: "root", i: null, v: rootValue }].sort((a, b) => b.v - a.v)
        .map(({ key, i, v }) => i ? seg(key, v, secondTotal, "c2", name(i.entity), peer?.entity.id === i.entity.id, () => onPeer(i)) : seg(key, v, secondTotal, "root", name(root), false))}
        {(second.pagination.totalPartners ?? 0) > others.length && seg("rest", rest2, secondTotal, "rest", "ceilalți", false)}</div>
    </>}
    {waiting && <>
      <p className="cx-strip-h">{picked ? (isAuthority ? `Cui mai vinde ${name(picked.entity)}` : `Cine mai vinde la ${name(picked.entity)}`) : <><G.Line w="92%" /><G.Line w="48%" /></>}</p>
      <StripGhost name="cx-strip-side" profile={GHOST_RIGHT} />
    </>}
  </div>;
}

/* ---------------- the ghosts (owner, 6 November 2026: "ghost data loading") ---------------- */

/** A fixed decorative profile of the flow, never data: four partners and the rest; on the right, the partner's own. */
const GHOST_MID = [0.31, 0.17, 0.12, 0.08, 0.32];
const GHOST_RIGHT = [0.11, 0.07, 0.05, 0.04, 0.03, 0.1, 0.6];
const GHOST_NAME: readonly string[] = ["22ch", "17ch", "25ch", "14ch", "12ch", "19ch", "11ch"];
/** The lists' page size (lib/connections.ts, CONNECTION_PAGE_SIZE). */
const LIST_PAGE = 20;

function StripGhost({ name, profile }: { name: string; profile: readonly number[] }) {
  return <Ghost as="div" className="cx-strip" name={name} wait="client">
    {profile.map((share, i) => <span key={i} aria-hidden="true" className="g-block cx-strip-g" style={{ flexGrow: share }} />)}
  </Ghost>;
}

/** The right column while the chosen partner's own partners load: its nodes and labels, in the decorative profile. */
function FlowSide({ label }: { label?: string }) {
  const nodes = stack(GHOST_RIGHT.map((value, i) => ({ key: String(i), item: null, value, label: "" })), 1);
  const tops = spread(nodes, 62);
  return <Ghost name="cx-flow-side" wait="client" className="cx-flow-g" label={label}>
    <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {nodes.map((n) => <rect key={n.key} className="g-svg" x={X_RIGHT} y={n.y} width={X_RIGHT_W} height={n.h} />)}
    </svg>
    {nodes.map((n, i) => <span key={n.key} aria-hidden="true" className="cx-label right" style={{ left: `calc(${(X_RIGHT + X_RIGHT_W) / 10}% + 10px)`, top: `${(tops[i]! / H) * 100}%` }}>
      <b><G.Line w={GHOST_NAME[(i + 2) % GHOST_NAME.length] ?? "16ch"} /></b><span><G.Line w="11ch" /></span></span>)}
  </Ghost>;
}

/** The stage before the first answer: the flow (a phone's strips) and the dock, at their loaded size. */
function StageGhost({ isAuthority }: { isAuthority: boolean }) {
  const mid = stack(GHOST_MID.map((value, i) => ({ key: String(i), item: null, value, label: "" })), 1);
  const labels = spread(mid);
  let at = 0;
  return <Ghost as="section" className="cx-stage" name="cx-stage" wait="client" label="Se încarcă legăturile…">
    <div className="cx-flow">
      <div className="cx-flow-heads" aria-hidden="true" style={{ gridTemplateColumns: `${X_MID / 10}% ${(X_RIGHT - X_MID) / 10}% 1fr` }}>
        <span>{isAuthority ? "Instituția" : "Firma"}</span><span>{isAuthority ? "De la cine cumpără" : "Cine cumpără de la ea"}</span>
        <span className="r"><G.Line w="92%" /><G.Line w="56%" /></span>
      </div>
      <div className="cx-flow-stage">
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <rect className="g-svg" x="0" y="0" width={X_ROOT} height={H} rx="2" />
          <g opacity=".45">{mid.map((n) => { const a0 = at; at += n.share * H; return <path key={n.key} className="g-svg" d={band(X_ROOT, a0, at, X_MID, n.y, n.y + n.h)} />; })}</g>
          {mid.map((n) => <rect key={n.key} className="g-svg" x={X_MID} y={n.y} width={X_MID_W} height={n.h} />)}
        </svg>
        {mid.map((n, i) => <span key={n.key} aria-hidden="true" className="cx-label" style={{ left: `calc(${(X_MID + X_MID_W) / 10}% + 10px)`, top: `${(labels[i]! / H) * 100}%` }}>
          <b><G.Line w={GHOST_NAME[i] ?? "16ch"} /></b><span><G.Line w="14ch" /></span></span>)}
        <FlowSide />
      </div>
    </div>
    <div className="cx-strips" aria-hidden="true">
      <p className="cx-strip-h">{isAuthority ? "De la cine cumpără" : "Cine cumpără de la ea"}</p>
      <StripGhost name="cx-strip" profile={GHOST_MID} />
      <p className="cx-strip-h"><G.Line w="92%" /><G.Line w="48%" /></p>
      <StripGhost name="cx-strip-side" profile={GHOST_RIGHT} />
    </div>
    <div className="cx-dock"><DockGhost /><p className="cx-dock-fine">Valori înregistrate, nu plăți.</p></div>
  </Ghost>;
}

/** The dock's rank line, while the chosen partner's own ranking loads. */
function RankGhost() {
  return <Ghost as="span" className="rank" name="cx-rank" wait="client"><G.Line w="62%" /><G.Line w="92%" only="phone" /><G.Line w="36%" only="phone" /></Ghost>;
}

/** The dock with a chosen partner: the path, its value and records, where the entity ranks, the sources button. */
function DockGhost() {
  return <div className="cx-dock-one" aria-hidden="true">
    <div className="cx-dock-text">
      <div className="cx-dock-path"><G.Line w="64%" /><G.Line w="58%" only="phone" /></div>
      <div className="cx-dock-facts"><span className="amt"><G.Line inline w="15ch" /></span><span><G.Line inline w="25ch" /></span><RankGhost /></div>
    </div>
    <div className="cx-dock-acts"><G.Block w="11em" h="38px" /></div>
  </div>;
}

/** A list's page: its rows (name, facts, value, bar) and its pager. On a phone some names take two lines. */
function ListGhost() {
  return <Ghost name="cx-list" wait="client">
    <ul className="cx-rows">
      <G.Rows n={LIST_PAGE} className="cx-row" cells={(i) => <>
        <span className="t"><b><G.Line w={rankWidth(i, 72, 5, 36)} />{i % 3 === 0 && <G.Line w="38%" only="phone" />}</b><small><G.Line w="54%" /></small></span>
        <span className="v"><G.Line inline w="7ch" /><em><G.Line inline w="4ch" /></em></span>
        <span className="bar"><G.Block w={`${Math.max(4, 70 - i * 6)}%`} h="100%" r="3px" /></span>
      </>} />
    </ul>
    <div className="cx-pager" aria-hidden="true"><G.Block w="8.2em" h="36px" /><span><G.Line inline w="12ch" /></span><G.Block w="8.6em" h="36px" /></div>
  </Ghost>;
}

/* ---------------- the lists ---------------- */

/**
 * A list's rows: the whole row chooses the partner, its name opens the partner's page (owner rule: every name links to
 * its entity). The bars share one scale on every page and search: the largest partner overall is the full bar.
 */
function ListRows({ data, total, largest, pickedId, onPick, label }: { data: ConnectionsResponse; total: number; largest: number; pickedId?: string | undefined; onPick: (item: ConnectionPartner) => void; label: string }) {
  const max = Math.max(1, largest, ...data.items.map(amount));
  // The answer the list was first drawn with: its bars grow top to bottom; a later page or search grows its new rows at
  // once, over --fast (charts in motion, owner 6 November 2026).
  const [firstData] = useState(data);
  return <ul className="cx-rows" aria-label={label} data-chart="">
    {data.items.map((item, i) => <ListRow key={item.entity.id} item={item} total={total} max={max} on={pickedId === item.entity.id} onPick={onPick} enter={data === firstData ? i : -1} />)}
  </ul>;
}
function ListRow({ item, total, max, on, onPick, enter }: { item: ConnectionPartner; total: number; max: number; on: boolean; onPick: (item: ConnectionPartner) => void; enter: number }) {
  const [born] = useState(enter);
  return <li className={`cx-row${on ? " on" : ""}`}>
    <button type="button" className="cx-row-hit" aria-pressed={on} aria-label={`Alege ${name(item.entity)}`} onClick={() => onPick(item)} />
    <span className="t"><b><EntityName id={item.entity.id} role={item.entity.role}>{name(item.entity)}</EntityName></b><small>{item.entity.cui ? `CUI ${item.entity.cui}` : "CUI nepublicat"}{countyLabel(item.entity.county) ? ` · ${countyLabel(item.entity.county)}` : ""} · {recordLabel(records(item))}</small></span>
    <span className="v">{short(amount(item))} <em>{pct(amount(item) / Math.max(1, total))}</em></span>
    <span className="bar" aria-hidden="true"><i className="cm-tw cm-x" style={{ width: `${(amount(item) / max) * 100}%`, ...(born >= 0 ? { "--i": born } : { "--cm-dur": "var(--fast)" }) } as CSSProperties} /></span>
  </li>;
}
function Pager({ data, busy, onPage }: { data: ConnectionsResponse; busy: boolean; onPage: (page: number) => void }) {
  if (data.pagination.totalPages < 2 && data.pagination.page === 1) return null;
  return <nav className="cx-pager" aria-label="Paginile listei">
    <button type="button" disabled={busy || data.pagination.page <= 1} onClick={() => onPage(data.pagination.page - 1)}>← Anterioara</button>
    <span>Pagina {number(data.pagination.page)} din {number(Math.max(1, data.pagination.totalPages))}</span>
    <button type="button" disabled={busy || !data.pagination.hasNext} onClick={() => onPage(data.pagination.page + 1)}>Următoarea →</button>
  </nav>;
}

/**
 * The period as one button (owner, 6 November 2026), opening the site's period picker (Întreabă's component 12):
 * presets that say their years, and the free range of years under them. Applies to the whole path.
 */
function PeriodButton({ scope, onApply }: { scope: Scope; onApply: (years: { yearFrom?: number; yearTo?: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const now = new Date().getFullYear();
  const asRange = (): PeriodRangeValue => ({ ...EMPTY_RANGE, yearFrom: scope.yearFrom ? String(scope.yearFrom) : "", yearTo: scope.yearTo ? String(scope.yearTo) : "" });
  const [range, setRange] = useState<PeriodRangeValue>(asRange);
  const [error, setError] = useState<string | null>(null);
  const presets = [
    { value: "all", label: "Toți anii", detail: `${FIRST_YEAR}–${now}` },
    { value: "3y", label: "Ultimii trei ani", detail: `${now - 2}–${now}` },
    { value: String(now - 1), label: String(now - 1) },
    { value: String(now), label: String(now), detail: "anul în curs" },
  ];
  const { yearFrom: from, yearTo: to } = scope;
  const current = !from && !to ? "all" : from === now - 2 && to === now ? "3y" : from && from === to && (from === now - 1 || from === now) ? String(from) : null;
  const text = !from && !to ? "Toți anii" : from && to ? (from === to ? String(from) : `${from}–${to}`) : from ? `din ${from}` : `până în ${to}`;
  const years = Array.from({ length: now - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i));
  const close = () => { setOpen(false); setCustom(false); setError(null); };
  const pick = (value: string) => {
    onApply(value === "all" ? {} : value === "3y" ? { yearFrom: now - 2, yearTo: now } : { yearFrom: Number(value), yearTo: Number(value) });
    close();
  };
  const use = () => {
    const problem = periodRangeError(range);
    if (problem) { setError(problem); return; }
    onApply({ ...(range.yearFrom ? { yearFrom: Number(range.yearFrom) } : {}), ...(range.yearTo ? { yearTo: Number(range.yearTo) } : {}) });
    close();
  };
  return <>
    <button ref={button} type="button" className="cx-period" aria-expanded={open} aria-haspopup="dialog" onClick={() => { if (open) close(); else { setRange(asRange()); setCustom(current === null); setOpen(true); } }}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
      <span>Perioada</span><b>{text}</b>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <Popover open={open} anchor={button.current} onClose={close} title="În ce perioadă?"
      foot={custom ? <><span /><button type="button" className="qb-primary" onClick={use}>Folosește</button></> : undefined}>
      <PeriodPicker label="Perioada" presets={presets} value={custom ? null : current} onPreset={(value, source) => { if (source === "activate") pick(value); }}
        custom={{ open: custom, onOpen: () => setCustom((c) => !c), label: "Alege anii…", value: range, onChange: (next) => { setRange(next); setError(null); }, years, months: false, error }} />
    </Popover>
  </>;
}

/* ---------------- the page ---------------- */

/** What the page draws: the live answer, or, while a new period or kind loads, the previous one kept in place. */
type View = { scope: Scope; base: ConnectionsResponse | null; top: ConnectionsResponse | null; picked: Picked | null; peer: ConnectionPartner | null;
  second: ConnectionsResponse | null; secondTop: ConnectionsResponse | null };

export default function ConnectionsExplorer({ entityId, entityName, county = null, role, initial }: {
  entityId: string; entityName: string; county?: string | null; role: ConnectionRole; initial: Record<string, string>;
}) {
  const startingScope: Scope = { dataset: (initial.dataset ?? "all") as Dataset,
    ...(initial.yearFrom ? { yearFrom: Number(initial.yearFrom) } : {}), ...(initial.yearTo ? { yearTo: Number(initial.yearTo) } : {}) };
  const [scope, setScope] = useState<Scope>(startingScope);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [peer, setPeer] = useState<ConnectionPartner | null>(null);
  const [peerSearch, setPeerSearch] = useState("");
  const [peerPage, setPeerPage] = useState(1);
  const [sources, setSources] = useState<Sources | null>(null);
  const [linkError, setLinkError] = useState("");
  /** On a phone one list at a time: the entity's partners, or the chosen partner's. */
  const [phoneList, setPhoneList] = useState<"root" | "second">("root");
  /** A copied path is being reopened: its partner is not chosen yet. */
  const [restoring, setRestoring] = useState(Boolean(initial.partner));
  /** A new period or kind loads: the previous answer stays on screen, dimmed (owner, 6 November 2026). */
  const [held, setHeld] = useState<View | null>(null);
  /** The scope was changed on this page: a flow drawn after that is a redrawing (a fade), not the first entrance. */
  const [rescoped, setRescoped] = useState(false);
  /** On a phone, a list shown again draws its bars finished (its entrance played on its first showing). */
  const [listAgain, setListAgain] = useState(false);
  const listsShown = useRef(new Set(["root"]));
  useEffect(() => { if (!listAgain) return; const timer = setTimeout(() => setListAgain(false), 900); return () => clearTimeout(timer); }, [listAgain]);
  function showList(which: "root" | "second") { if (which !== phoneList && listsShown.current.has(which)) setListAgain(true); listsShown.current.add(which); setPhoneList(which); }
  const restored = useRef(false);
  const auto = useRef(false);
  /** The address carried a path: it opens that one, until the scope changes. */
  const fromLink = useRef(Boolean(initial.partner));
  const restoreController = useRef<AbortController | null>(null);
  const dock = useRef<HTMLElement>(null);
  const rootList = useRef<HTMLInputElement>(null);
  const secondList = useRef<HTMLInputElement>(null);
  const rootSearch = useDebounced(search), secondSearch = useDebounced(peerSearch);
  const pinned = useRef({ identity: initial.identity, checkpointId: initial.checkpointId });
  const baseQuery = useMemo(() => query({ entityId, role, ...scope, page, search: rootSearch, ...pinned.current }), [entityId, role, scope, page, rootSearch]);
  const base = useConnections(baseQuery);
  // The drawing reads the first page, unsearched: the largest partners whatever the list below shows.
  const topQuery = useMemo(() => query({ entityId, role, ...scope, page: 1, ...pinned.current }), [entityId, role, scope]);
  const top = useConnections(topQuery === baseQuery ? null : topQuery);
  if (base.data) pinned.current = { identity: pinned.current.identity ?? base.data.entity.identity, checkpointId: pinned.current.checkpointId ?? base.data.checkpoint.id };
  const secondQuery = picked ? query({ entityId: picked.partner.entity.id, role: picked.partner.entity.role, ...scope,
    page: peerPage, search: secondSearch, identity: picked.partner.entity.identity, checkpointId: picked.checkpointId, excludeEntityId: entityId }) : null;
  const second = useConnections(secondQuery);
  const secondTopQuery = picked ? query({ entityId: picked.partner.entity.id, role: picked.partner.entity.role, ...scope,
    page: 1, identity: picked.partner.entity.identity, checkpointId: picked.checkpointId, excludeEntityId: entityId }) : null;
  const secondTop = useConnections(secondTopQuery === secondQuery ? null : secondTopQuery);
  // Another page or search of a list keeps its family's previous answer on screen (dimmed below) instead of collapsing.
  const scopeKey = query({ ...scope });
  const family = `${entityId}|${role}|${scopeKey}`;
  const secondFamily = picked ? `${picked.partner.entity.id}|${picked.partner.entity.identity}|${picked.checkpointId}|${scopeKey}` : null;
  const baseShown = useKept(base.data, family);
  const topData = useKept(topQuery === baseQuery ? base.data : top.data, family);
  const secondShown = useKept(second.data, secondFamily);
  const secondTopData = useKept(secondTopQuery === secondQuery ? second.data : secondTop.data, secondFamily);
  const live: View = { scope, base: baseShown, top: topData, picked, peer, second: secondShown, secondTop: secondTopData };
  const v = held ?? live;
  const isAuthority = role === "authority";
  const entity = v.base?.entity ?? v.top?.entity ?? v.picked?.root;
  const currentName = entity ? name(entity) : entityName;
  const total = v.top ? Number(v.top.summary.totalExact) : 0;
  const secondTotal = v.secondTop && v.picked ? Number(v.secondTop.summary.totalExact) + amount(v.picked.partner) : 0;

  function remember(selection: Picked | null, last: ConnectionPartner | null, applied = scope) {
    const params = query({ rol: isAuthority ? "autoritate" : "furnizor", ...applied,
      identity: pinned.current.identity, checkpointId: pinned.current.checkpointId,
      partner: selection?.partner.entity.id, partnerIdentity: selection?.partner.entity.identity,
      peer: last?.entity.id, peerIdentity: last?.entity.identity });
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }
  const narrow = () => window.matchMedia("(max-width: 760px)").matches;
  function choose(item: ConnectionPartner, quiet = false) {
    const data = baseShown ?? topData;
    if (!data) return;
    restoreController.current?.abort();
    const next = { root: data.entity, partner: item, checkpointId: data.checkpoint.id };
    setPicked(next); setPeer(null); setPeerSearch(""); setPeerPage(1); setLinkError(""); setRestoring(false); if (!quiet) { listsShown.current.add("second"); setPhoneList("second"); }
    if (!quiet) { remember(next, null); if (narrow()) requestAnimationFrame(() => dock.current?.scrollIntoView({ block: "start" })); }
  }
  function choosePeer(item: ConnectionPartner) {
    setPeer(item); remember(picked, item);
    if (narrow()) requestAnimationFrame(() => dock.current?.scrollIntoView({ block: "start" }));
  }
  function resetSelection() { restoreController.current?.abort(); setRestoring(false); setPicked(null); setPeer(null); remember(null, null); }
  function applyScope(next: Scope) {
    restoreController.current?.abort();
    if (!held && live.top) setHeld(live);
    setRescoped(true);
    setScope(next); setPicked(null); setPeer(null); setPage(1); setSearch(""); setSources(null); setRestoring(false); auto.current = false; fromLink.current = false; remember(null, null, next);
  }
  const restart = <a className="cx-button" href={`/entitati/${entityId}/legaturi?rol=${isAuthority ? "autoritate" : "furnizor"}`}>Reia explorarea pe datele disponibile</a>;

  // A copied URL restores exact partners even when they are beyond the first page.
  useEffect(() => {
    if (restored.current || !base.data || base.busy) return;
    restored.current = true;
    if (!initial.partner) return;
    const controller = new AbortController(), root = base.data.entity, checkpointId = base.data.checkpoint.id;
    restoreController.current = controller;
    void (async () => {
      try {
        if (!initial.partnerIdentity || initial.peer && !initial.peerIdentity) throw new Error("Linkul nu conține identitățile complete. Alege din nou partenerul.");
        async function findPair(id: string, identity: string, target: ConnectionEntity) {
          const response = await fetch(`/api/connections?${query({ entityId: id, role: target.role === "authority" ? "supplier" : "authority", identity, checkpointId, ...scope, partnerId: target.id, page: 1 })}`, { signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Legătura nu mai este disponibilă.");
          const data = result as ConnectionsResponse;
          const match = data.items.find(item => item.entity.id === target.id && item.entity.identity === target.identity);
          if (!match) throw new Error("Legătura nu a fost găsită în această selecție. Alege din nou partenerul.");
          return { ...match, entity: data.entity };
        }
        const partner = await findPair(initial.partner!, initial.partnerIdentity!, root);
        const selection = { root, partner, checkpointId };
        const last = initial.peer ? await findPair(initial.peer, initial.peerIdentity!, partner.entity) : null;
        if (!controller.signal.aborted) { setPicked(selection); setPeer(last); setRestoring(false); }
      } catch (error) { if (!controller.signal.aborted) { setLinkError(error instanceof Error ? error.message : "Linkul nu poate fi redeschis."); setRestoring(false); } }
    })();
    return () => controller.abort();
  }, [base.data, base.busy]); // eslint-disable-line react-hooks/exhaustive-deps -- once, on the first answer

  // Without a copied path, the largest partner is shown chosen, so the flow opens on its second step (not written to the address).
  useEffect(() => {
    if (auto.current || picked || fromLink.current || !topData?.items[0]) return;
    auto.current = true;
    choose(topData.items[0], true);
  }, [topData, picked]); // eslint-disable-line react-hooks/exhaustive-deps -- once per scope

  // The kept answer gives way once the new one is whole: its flow, its chosen partner and that partner's own partners.
  const settled = !base.busy && (!!base.error || (!!topData && (topData.items.length === 0 || !!linkError || (!!picked && (!!secondTopData || !!second.error)))));
  useEffect(() => { if (held && settled) setHeld(null); }, [held, settled]);

  function selectionFor(items: ConnectionEvidencePair[]): ConnectionEvidenceSelection {
    return { version: "connection-evidence-1", checkpointId: v.picked!.checkpointId, ...v.scope, pairs: items };
  }
  const pairs = v.picked ? [pair(v.picked.root, v.picked.partner.entity), ...(v.peer ? [pair(v.picked.partner.entity, v.peer.entity)] : [])] : [];
  const selection = v.picked ? selectionFor(pairs) : null;
  const legTitle = (a: ConnectionEntity, b: ConnectionEntity) => `${name(a)} — ${name(b)}`;
  const title = v.picked ? [name(v.picked.root), name(v.picked.partner.entity), ...(v.peer ? [name(v.peer.entity)] : [])].join(" — ") : "";
  const listPending = base.busy || search !== rootSearch;
  const secondPending = second.busy || peerSearch !== secondSearch;
  // The largest partner is being chosen (one frame) or a copied path reopened: the dock and the second list are ghosts.
  const pickPending = !held && !picked && !linkError && !!topData?.items.length && (restoring || (!fromLink.current && !auto.current));
  const waitingSecond = !!v.picked && !v.secondTop && !second.error;
  const waiting = waitingSecond || pickPending;
  // Same-shape refreshes: the old rows stay, dimmed and inert, and a status floats under the header.
  const rootStale = !held && !!v.base && listPending;
  const secondStale = !held && !!v.second && secondPending;
  const fetching = !!held || (base.busy && !!v.base && v.base !== base.data) || (second.busy && !!v.second && v.second !== second.data);

  // The lede: the total, the partners, the years, and how much the largest four carry.
  const top4 = v.top ? v.top.items.slice(0, 4).reduce((a, i) => a + amount(i), 0) / Math.max(1, total) : 0;
  const count = v.top?.pagination.totalPartners ?? 0;
  const years = v.top ? [year(v.top.summary.firstDate), year(v.top.summary.lastDate)].filter(Boolean) : [];
  // Where the root stands among the chosen partner's partners (the second list leaves the root out).
  const vp = v.picked;
  const rank = vp && v.secondTop ? 1 + v.secondTop.items.filter((i) => amount(i) > amount(vp.partner)).length : null;
  const rankWords = vp && rank !== null && secondTotal > 0 && rank <= v.secondTop!.items.length
    ? `${name(vp.root)} e ${rank === 1 ? "cel mai mare" : `al ${rank}-lea`} ${isAuthority ? "client" : "furnizor"} al ${isAuthority ? "firmei" : "instituției"} ${name(vp.partner.entity)}, cu ${pct(amount(vp.partner) / secondTotal)}.`
    : null;
  const stale = held ? " g-stale" : "";
  const secondHead = vp ? (isAuthority ? `Cui mai vinde ${name(vp.partner.entity)}` : `Cine mai vinde la ${name(vp.partner.entity)}`) : "";

  return <div className="cx-shell">
    <p className="cx-crumb"><Link href={profileUrl({ id: entityId, role })}>← {currentName}</Link> · {isAuthority ? "instituție" : "firmă"}{countyLabel(entity ? entity.county : county) ? `, ${countyLabel(entity ? entity.county : county)}` : ""}</p>
    <header className="cx-head">
      <div>
        <h1>Cum sunt legate?</h1>
        {v.top
          ? <p className={`cx-lede${stale}`}>{short(total)} lei {isAuthority ? "către" : "de la"} <b>{countWords(count, isAuthority ? "furnizor" : "instituție", isAuthority ? "furnizori" : "instituții")}</b>{years.length ? `, ${years[0]}${years[1] && years[1] !== years[0] ? `–${years[1]}` : ""}` : ""}.{count > 4 && <> {isAuthority ? "Primii patru iau" : "Primele patru aduc"} <b>{pct(top4)}</b>.</>}</p>
          : <Ghost as="p" className="cx-lede" name="cx-lede" wait="client"><G.Line w="31em" /><G.Line w="11em" only="phone" /></Ghost>}
      </div>
      <div className="cx-scope" role="group" aria-label="Ce achiziții și ce ani">
        <div className="cx-seg">{DATASETS.map((d) => <button key={d.value} type="button" aria-pressed={scope.dataset === d.value} onClick={() => applyScope({ ...scope, dataset: d.value })}>{d.label}</button>)}</div>
        <PeriodButton scope={scope} onApply={(years) => applyScope({ dataset: scope.dataset, ...years })} />
      </div>
    </header>

    {linkError && <div className="cx-error" role="alert"><p>{linkError}</p><button type="button" onClick={() => { setLinkError(""); resetSelection(); }}>Alege din listă</button> {restart}</div>}
    {base.error && !held ? <div className="cx-error" role="alert"><p>{base.error}</p><button type="button" onClick={base.retry}>Reîncearcă</button> {restart}</div> : <>
      {!v.top ? <StageGhost isAuthority={isAuthority} /> : <section className={`cx-stage${stale}`} aria-label="Fluxul banilor" aria-busy={held ? true : undefined} inert={held ? true : undefined}>
        {entity && v.top.items.length > 0
          ? <Flow key={query({ ...v.scope })} enter={rescoped ? "update" : "first"} root={entity} rootRole={role} items={v.top.items} total={total} count={count} picked={v.picked?.partner ?? null}
              second={v.secondTop} secondTotal={secondTotal} peer={v.peer} waiting={waiting}
              onPick={(i) => choose(i)} onPeer={choosePeer}
              onRest={() => rootList.current?.focus()} onSecondRest={() => secondList.current?.focus()} />
          : <div className="cx-empty"><h2>Nicio legătură în această selecție</h2><p>Poți extinde perioada sau include ambele tipuri de achiziții. Lipsa înregistrărilor nu dovedește lipsa unei relații.</p></div>}

        {entity && v.top.items.length > 0 && <Strips root={entity} rootRole={role} items={v.top.items} total={total} count={count}
          picked={v.picked?.partner ?? null} second={v.secondTop} secondTotal={secondTotal} peer={v.peer} waiting={waiting} onPick={(i) => choose(i)} onPeer={choosePeer} />}
        {/* The chosen path, its records and its saving. */}
        <section className="cx-dock" ref={dock} aria-label="Legătura aleasă" tabIndex={-1}>
          {!vp ? (pickPending ? <DockGhost /> : <p className="cx-dock-hint">Alege {isAuthority ? "un furnizor" : "o instituție"} din flux sau din listă.</p>) : !v.peer ? <div className="cx-dock-one"><div className="cx-dock-text">
            <div className="cx-dock-path"><b>{name(vp.root)}</b><span>{isAuthority ? "a cumpărat de la" : "a vândut către"}</span><b><EntityName id={vp.partner.entity.id} role={vp.partner.entity.role}>{name(vp.partner.entity)}</EntityName></b></div>
            <div className="cx-dock-facts"><span className="amt">{formatEvidenceAmount(vp.partner.totalExact)}</span>
              <span>{recordLabel(records(vp.partner))} · {vp.partner.firstDate ? `${date(vp.partner.firstDate)} – ${date(vp.partner.lastDate)}` : "fără date"}</span>
              {rankWords ? <span className="rank">{rankWords}</span> : waitingSecond && <RankGhost />}</div></div>
            <div className="cx-dock-acts"><button type="button" className="cx-primary" onClick={() => setSources({ selection: selection!, title })}>{sourceLabel(records(vp.partner))}</button>
              <ClipButton key={JSON.stringify(selection)} kind="query" spec={connectionEvidenceSpec(selection!)} label={title} snapshot={{ connection: selection }} /></div>
          </div> : <>
            <div className="cx-dock-path"><b>{name(vp.root)}</b><span>și</span><b><EntityName id={v.peer.entity.id} role={v.peer.entity.role}>{name(v.peer.entity)}</EntityName></b>
              <span>{isAuthority ? "cumpără de la" : "vând către"}</span><b><EntityName id={vp.partner.entity.id} role={vp.partner.entity.role}>{name(vp.partner.entity)}</EntityName></b></div>
            <div className="cx-legs">{[{ item: vp.partner, a: vp.root }, { item: v.peer, a: v.peer.entity }].map(({ item, a }, index) => (
              <div className="cx-leg" key={index}><h3>{legTitle(a, vp.partner.entity)}</h3><p className="amt">{formatEvidenceAmount(item.totalExact)}</p>
                <p>{recordLabel(records(item))} · {item.firstDate ? `${date(item.firstDate)} – ${date(item.lastDate)}` : "fără date"}</p>
                <button type="button" onClick={() => setSources({ selection: selectionFor([pairs[index]!]), title: legTitle(a, vp.partner.entity) })}>{sourceLabel(records(item))}</button></div>))}</div>
            <p className="cx-dock-note">{isAuthority ? "Un furnizor comun" : "O instituție comună"} nu dovedește o relație între {isAuthority ? "instituții" : "firme"}, proprietate comună sau o neregulă. Împreună: {recordLabel(records(vp.partner) + records(v.peer))} · {formatEvidenceAmount(sumDecimalStrings([vp.partner.totalExact, v.peer.totalExact]))} <Term tip id="consortiu" /></p>
            <div className="cx-dock-acts"><button type="button" className="cx-primary" onClick={() => setSources({ selection: selection!, title })}>Sursele ambelor legături</button>
              <ClipButton key={JSON.stringify(selection)} kind="query" spec={connectionEvidenceSpec(selection!)} label={title} snapshot={{ connection: selection }} />
              <button type="button" className="cx-link" onClick={() => { setPeer(null); remember(picked, null); }}>← Doar {name(vp.root)} și {name(vp.partner.entity)}</button></div>
          </>}
          <p className="cx-dock-fine">Valori înregistrate, nu plăți.</p>
        </section>
      </section>}

      {/* The complete lists: any partner, by name or CUI, page by page (on a phone, the page itself). */}
      {vp || pickPending ? <div className={`cx-list-switch${stale}`} role="tablist" aria-label="Listele" inert={held ? true : undefined}>
        <button type="button" role="tab" aria-selected={phoneList === "root"} onClick={() => showList("root")}>{isAuthority ? "Furnizorii" : "Instituțiile"} · {number(count)}</button>
        <button type="button" role="tab" aria-selected={phoneList === "second"} onClick={() => showList("second")}>{isAuthority ? `Cui mai vinde` : "Cine mai vinde acolo"}{v.second ? ` · ${number(v.second.pagination.totalPartners)}` : <> · <Ghost as="span" name="cx-switch-count" wait="client"><G.Line inline w="4ch" /></Ghost></>}</button>
      </div> : !v.top && <div className="cx-list-switch" aria-hidden="true" data-ghost="client" data-g="cx-list-switch">
        <span>{isAuthority ? "Furnizorii" : "Instituțiile"} · <G.Line inline w="3ch" /></span><span>{isAuthority ? `Cui mai vinde` : "Cine mai vinde acolo"} · <G.Line inline w="4ch" /></span>
      </div>}
      <div className={`cx-lists show-${vp ? phoneList : "root"}${stale}`} aria-busy={held ? true : undefined} inert={held ? true : undefined} data-motion={listAgain ? "settled" : undefined}>
        <section className="cx-list root" aria-labelledby="cx-list-1">
          <div className="cx-list-head"><h2 id="cx-list-1">{isAuthority ? "Toți furnizorii" : "Toate instituțiile"}</h2><span>{v.base ? `${number(v.base.pagination.totalPartners)}${rootSearch ? " găsite" : ""} · după valoare` : <Ghost as="span" name="cx-count" wait="client"><G.Line w="9em" /></Ghost>}</span></div>
          <input ref={rootList} type="search" className="cx-search" maxLength={150} placeholder="Caută după nume sau CUI" aria-label={isAuthority ? "Caută un furnizor" : "Caută o instituție"} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div aria-busy={listPending} className={rootStale ? "g-stale" : undefined} inert={rootStale || undefined}>
            {!v.base ? <ListGhost />
              : v.base.items.length ? <ListRows data={v.base} total={total} largest={v.top?.items[0] ? amount(v.top.items[0]) : 0} pickedId={vp?.partner.entity.id} onPick={(i) => choose(i)} label={isAuthority ? "Furnizorii" : "Instituțiile"} />
              : <p className="cx-empty-line">{rootSearch ? "Nicio potrivire. Încearcă o parte din nume sau codul fiscal." : "Nicio legătură în această selecție."}{search && <> <button type="button" className="cx-link" onClick={() => { setSearch(""); setPage(1); }}>Șterge căutarea</button></>}</p>}
          </div>
          {v.base && <Pager data={v.base} busy={listPending} onPage={setPage} />}
        </section>
        {vp ? <section className="cx-list second" aria-labelledby="cx-list-2">
          <div className="cx-list-head"><h2 id="cx-list-2" title={secondHead}>{secondHead}</h2><span>{v.second ? `${number(v.second.pagination.totalPartners)}${peerSearch ? " găsite" : ""} · după valoare` : <Ghost as="span" name="cx-count-2" wait="client"><G.Line w="9em" /></Ghost>}</span></div>
          <input ref={secondList} type="search" className="cx-search" maxLength={150} placeholder="Caută după nume sau CUI" aria-label={isAuthority ? "Caută între celelalte instituții" : "Caută între ceilalți furnizori"} value={peerSearch} onChange={(e) => { setPeerSearch(e.target.value); setPeerPage(1); }} />
          {second.error && !held ? <div className="cx-error" role="alert"><p>{second.error}</p><button type="button" onClick={second.retry}>Reîncearcă</button> {restart}</div> : <div aria-busy={secondPending} className={secondStale ? "g-stale" : undefined} inert={secondStale || undefined}>
            {!v.second ? <ListGhost />
              : v.second.items.length ? <ListRows data={v.second} total={secondTotal} largest={v.secondTop?.items[0] ? amount(v.secondTop.items[0]) : 0} pickedId={v.peer?.entity.id} onPick={choosePeer} label="Ceilalți parteneri" />
              : <p className="cx-empty-line">{peerSearch ? "Nicio potrivire. Încearcă alt nume sau șterge căutarea." : "Nu apar alți parteneri identificați în selecția aplicată."}</p>}
          </div>}
          {v.second && <Pager data={v.second} busy={secondPending} onPage={setPeerPage} />}
        </section> : (pickPending || !v.top) && <section className="cx-list second" aria-hidden="true">
          <div className="cx-list-head"><h2><Ghost as="span" name="cx-list-2-head" wait="client"><G.Line w="72%" /></Ghost></h2><span><Ghost as="span" name="cx-count-2" wait="client"><G.Line w="9em" /></Ghost></span></div>
          <span className="cx-search g-quiet" />
          <ListGhost />
        </section>}
      </div>
    </>}

    <details className="cx-method"><summary>Ce arată aceste legături și ce date includem?</summary><p>Legăturile descriu achiziții înregistrate între o autoritate și un furnizor. Un partener comun este un punct de pornire pentru documentare; nu dovedește o relație de proprietate sau o neregulă.</p><p>Includem achiziții directe cu valoare pozitivă de cel mult 2.000.000 lei și cote de contract cu valoare pozitivă, conform selecției standard a aplicației. Pragul de 2.000.000 lei este o regulă de filtrare a valorilor suspecte, nu un prag legal. Înregistrările fără valoare eligibilă nu intră în acest ecran.</p><p>Contractele se numără separat de cotele atribuite furnizorilor. Când valorile pe membri lipsesc, aplicația împarte valoarea contractului între câștigători. TED completează sursele, fără a adăuga din nou valoarea contractului.</p><p>Perioada se aplică datei de finalizare. Fără limite de an includem și înregistrările fără dată; cu limite, acestea nu pot fi încadrate și sunt excluse. În flux, lățimea fiecărei benzi e valoarea ei; ponderile din dreapta sunt din tot ce înregistrează partenerul ales.</p>
      {!!v.base?.excluded.rowCount && <p>{number(v.base.excluded.rowCount)} înregistrări eligibile, în valoare de {formatEvidenceAmount(v.base.excluded.totalExact)}, au un partener neidentificat sau aceeași identitate la ambele capete și nu apar în listă.</p>}
      {!!v.second?.excluded.rowCount && <p>Pentru partenerul selectat, încă {number(v.second.excluded.rowCount)} înregistrări eligibile au un partener neidentificat sau aceeași identitate la ambele capete.</p>}
      <p>{v.base?.checkpoint.validatedAt ? `Versiunea consultată a fost verificată tehnic la ${new Date(v.base.checkpoint.validatedAt).toLocaleDateString("ro-RO")}. Aceasta nu este data colectării achizițiilor.` : "Legăturile se încarcă doar dintr-o versiune verificată a datelor."} <Link href="/metodologie#acoperire">Surse, acoperire și limite</Link></p>
    </details>
    {fetching && <FloatStatus>{held ? "Se încarcă legăturile…" : "Se încarcă lista…"}</FloatStatus>}
    {sources && <EvidenceDrawer spec={connectionEvidenceSpec(sources.selection)} connection={sources.selection} title={sources.title} onClose={() => setSources(null)} />}
  </div>;
}
