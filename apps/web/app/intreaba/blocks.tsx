"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";

/**
 * House rule (docs/PRINCIPLES.md): every graph element answers on hover with an
 * instant cursor-following tooltip — never the sluggish native <title>. Usage:
 * const t = useTip(); spread {...t.bind("Titlu", "linie valoare", "linie mică")}
 * on the element; render {t.el} once per block.
 */
export interface TipBind {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}
export function useTip() {
  const [tip, setTip] = useState<{
    title: string;
    v?: string | undefined;
    s?: string | undefined;
    x: number;
    y: number;
  } | null>(null);
  const bind = (title: string, v?: string, s?: string): TipBind => {
    const move = (e: React.MouseEvent) => setTip({ title, v, s, x: e.clientX, y: e.clientY });
    return { onMouseEnter: move, onMouseMove: move, onMouseLeave: () => setTip(null) };
  };
  /** Instant full-text tooltip for ellipsized cells — fires ONLY when the
   *  element is actually truncated, so untrimmed text stays quiet. */
  const bindClip = (text: string | null | undefined): TipBind => {
    const move = (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      if (!text || el.scrollWidth <= el.clientWidth + 1) {
        setTip(null);
        return;
      }
      setTip({ title: text, x: e.clientX, y: e.clientY });
    };
    return { onMouseEnter: move, onMouseMove: move, onMouseLeave: () => setTip(null) };
  };
  const el = tip ? (
    <div className="ask-maptip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      <div className="t">{tip.title}</div>
      {tip.v && <div className="v">{tip.v}</div>}
      {tip.s && <div className="s">{tip.s}</div>}
    </div>
  ) : null;
  return { bind, bindClip, el, active: tip?.title ?? null };
}
import { FLAG_META, criBand } from "@/lib/flags";
import type {
  CompareEntity,
  DistributionData,
  BreakdownSlice,
  ScatterPoint,
  SankeyFlow,
  NetworkNode,
  EntityCardData,
  FactCheckData,
  TrendRow,
} from "@/lib/ask/compile";

/** Renderers for the risk/relationship result blocks (mockup blocks 5–13). */

function flagTitle(code: string): string {
  return FLAG_META[code]?.title ?? code;
}

/* ── compare ──────────────────────────────────────────────────────────── */

export function CompareBlock({ entities }: { entities: CompareEntity[] }) {
  return (
    <div className="ask-cmp">
      {entities.map((e) => {
        const band = e.cri !== null ? criBand(e.cri) : null;
        return (
          <div key={e.entityId} className="col">
            <h4>
              <Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link>
            </h4>
            <div className="cty">
              {e.county ?? "județ necunoscut"} · {e.role === "authority" ? "autoritate" : "furnizor"}
            </div>
            <div className="row">
              <span className="k">Cheltuială DA</span>
              <span className="num">{formatRon(e.value)}</span>
            </div>
            <div className="row">
              <span className="k">Achiziții</span>
              <span className="num">{formatInt(e.count)}</span>
            </div>
            {e.population !== null && e.population > 0 && (
              <div className="row">
                <span className="k">Lei / locuitor</span>
                <span className="num">{formatInt(Math.round(e.value / e.population))}</span>
              </div>
            )}
            <div className="row">
              <span className="k">Indice risc</span>
              <span className={e.cri !== null && e.cri >= 0.3 ? "num hi" : "num"}>
                {e.cri !== null ? `${e.cri.toFixed(2)} · ${band!.label}` : "—"}
              </span>
            </div>
            <div className="row">
              <span className="k">Semnale</span>
              <span className={e.nFlags > 0 ? "hi" : ""}>{e.nFlags}</span>
            </div>
            {e.flags.length > 0 && (
              <div className="ask-fchips">
                {e.flags.map((f) => (
                  <span key={f} className="ask-fchip" title={FLAG_META[f]?.short}>
                    {flagTitle(f)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="ask-methnote">
        Indicele de risc (CRI) e un semnal statistic, nu o dovadă de neregulă —{" "}
        <Link href="/metodologie">cum se calculează</Link>.
      </p>
    </div>
  );
}

/* ── distribution ─────────────────────────────────────────────────────── */

export function DistributionBlock({
  distribution,
  spec,
}: {
  distribution: DistributionData;
  spec?: unknown;
}) {
  const d = distribution;
  const t = useTip();
  const max = Math.max(...d.buckets.map((b) => b.n), 1);
  const focalBucket =
    d.focal.cri === null ? -1 : Math.min(9, Math.floor(d.focal.cri * 10 - 1e-9));
  // bar click → /semnale listing of the entities in that CRI band (the
  // comparison group's county filter travels along; kind/UAT riders don't)
  const county = ((spec ?? {}) as { filters?: { county?: string } }).filters?.county;
  const bucketUrl = (from: number, to: number): string => {
    const q = new URLSearchParams({
      rol: d.role,
      criMin: String(from),
      criMax: String(to),
    });
    if (county) q.set("jud", county);
    return `/semnale?${q.toString()}`;
  };
  return (
    <div>
      {t.el}
      <div className="ask-dist">
        {d.buckets.map((b, i) => {
          const bind = t.bind(
            `CRI ${b.from.toFixed(1)}–${b.to.toFixed(1)}`,
            `${formatInt(b.n)} entități`,
            (i === focalBucket ? `aici e ${cleanName(d.focal.name)} · ` : "") +
              (b.n > 0 ? "click → lista entităților" : ""),
          );
          const inner = (
            <>
              {i === focalBucket && <div className="marker">AICI</div>}
              <div
                className="bar"
                style={{ height: `${Math.max(3, (b.n / max) * 100)}%` }}
              />
              <div className="cl">{b.from.toFixed(1)}</div>
            </>
          );
          return b.n > 0 ? (
            <a
              key={b.from}
              className={i === focalBucket ? "b here" : "b"}
              href={bucketUrl(b.from, b.to)}
              target="_blank"
              rel="noopener"
              {...bind}
            >
              {inner}
            </a>
          ) : (
            <div key={b.from} className={i === focalBucket ? "b here" : "b"} {...bind}>
              {inner}
            </div>
          );
        })}
      </div>
      <p className="ask-distcap">
        <Link href={`/entitati/${d.focal.entityId}`}>{cleanName(d.focal.name)}</Link>
        {d.focal.cri !== null ? (
          <>
            {" "}
            are indice de risc <b>{d.focal.cri.toFixed(2)}</b>
            {d.focal.percentile !== null && (
              <>
                {" "}
                — peste <b>{d.focal.percentile}%</b> din grupul de comparație: cele{" "}
                <b>{formatInt(d.totalEntities)}</b>{" "}
                {d.role === "authority" ? "autorități" : "firme"} cu cel puțin 10 achiziții
                directe (filtrele de județ/tip se aplică grupului)
              </>
            )}
            .
          </>
        ) : (
          <> nu are încă un indice de risc calculat.</>
        )}{" "}
        <Link href="/metodologie">Cum se calculează CRI</Link> — semnal, nu dovadă.
      </p>
    </div>
  );
}

/* ── breakdown ────────────────────────────────────────────────────────── */

const SEG_COLORS = [
  "#9a2b1f",
  "#c06a3a",
  "#c9a24a",
  "#7a6a3a",
  "#4a5d6b",
  "#8a4a5d",
  "#5d7a4a",
  "#6b4a2b",
];
const SEG_OTHER = "#b3aca0";

export function BreakdownBlock({
  slices,
  other,
  spec,
}: {
  slices: BreakdownSlice[];
  other: { value: number; count: number };
  spec?: unknown;
}) {
  const t = useTip();
  // slice click: while the stem can go deeper, open the same breakdown one
  // CPV level down; at a full 8-digit code, open the transactions instead.
  const canDeepen = (code: string): boolean => code.length < 8;
  const sliceUrl = (code: string): string => {
    const sp = (spec ?? {}) as { dataset?: string; filters?: Record<string, unknown> };
    const deeper = canDeepen(code);
    const next: Record<string, unknown> = {
      block: deeper ? "breakdown" : "stat",
      measure: "value",
      filters: { ...(sp.filters ?? {}), cpvTerm: code },
    };
    if (sp.dataset) next["dataset"] = sp.dataset;
    return `/?spec=${encodeURIComponent(encodeSpec(next))}${deeper ? "" : "&drill=1"}`;
  };
  const total = slices.reduce((a, s) => a + s.value, 0) + other.value;
  if (total <= 0) return <p className="ask-empty">Niciun rezultat.</p>;
  const items = [
    ...slices.map((s, i) => ({
      name: s.name ?? `CPV ${s.code}`,
      code: s.code as string | null,
      value: s.value,
      count: s.count,
      color: SEG_COLORS[i % SEG_COLORS.length]!,
    })),
    ...(other.value > 0
      ? [
          {
            name: "alte categorii",
            code: null as string | null,
            value: other.value,
            count: other.count,
            color: SEG_OTHER,
          },
        ]
      : []),
  ];
  return (
    <div>
      {t.el}
      <div className="ask-comp">
        {items.map((s) => {
          const bind = t.bind(
            s.name,
            formatRon(s.value),
            `${formatInt(s.count)} achiziții · ${((s.value / total) * 100).toFixed(1)}% din total${s.code ? (canDeepen(s.code) ? " · click → structura subcategoriilor" : " · click → achizițiile categoriei") : ""}`,
          );
          return s.code ? (
            <a
              key={s.name}
              className="seg"
              href={sliceUrl(s.code)}
              target="_blank"
              rel="noopener"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              {...bind}
            />
          ) : (
            <div
              key={s.name}
              className="seg"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              {...bind}
            />
          );
        })}
      </div>
      <div className="ask-complegend">
        {items.map((s) => (
          <div key={s.name} className="li">
            <span className="sw" style={{ background: s.color }} />
            <span className="nm">
              {s.code ? (
                <a href={sliceUrl(s.code)} target="_blank" rel="noopener">
                  {s.name} ↗
                </a>
              ) : (
                s.name
              )}
            </span>
            <span className="vv num">
              {formatRon(s.value)} · {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── scatter ──────────────────────────────────────────────────────────── */

export function ScatterBlock({ points }: { points: ScatterPoint[] }) {
  const t = useTip();
  if (points.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  const W = 640;
  const H = 260;
  const PAD = { l: 42, r: 10, t: 12, b: 30 };
  const vals = points.map((p) => Math.max(p.value, 1));
  const minLog = Math.log10(Math.min(...vals));
  const maxLog = Math.log10(Math.max(...vals));
  const x = (v: number) =>
    PAD.l + ((Math.log10(Math.max(v, 1)) - minLog) / Math.max(maxLog - minLog, 0.01)) * (W - PAD.l - PAD.r);
  const y = (c: number) => H - PAD.b - c * (H - PAD.t - PAD.b);
  return (
    <div>
      {t.el}
      <svg viewBox={`0 0 ${W} ${H}`} className="ask-scatter" role="img" aria-label="Risc vs volum">
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#c2beb2" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#c2beb2" />
        <text x={6} y={PAD.t + 8} fontSize={10} fill="#6b6355">
          risc
        </text>
        <text x={W - PAD.r} y={H - 8} fontSize={10} fill="#6b6355" textAnchor="end">
          cheltuială (log) →
        </text>
        {[0.25, 0.5, 0.75, 1].map((c) => (
          <text key={c} x={PAD.l - 6} y={y(c) + 3} fontSize={9} fill="#9a938a" textAnchor="end">
            {c}
          </text>
        ))}
        {points.map((p) => (
          <a
            key={p.entityId}
            href={`/entitati/${p.entityId}`}
            target="_blank"
            rel="noopener"
          >
            <circle
              cx={x(p.value)}
              cy={y(p.cri)}
              r={3.5}
              fill={p.cri >= 0.5 ? "#9a2b1f" : p.cri >= 0.3 ? "#c9a24a" : "#c2beb2"}
              fillOpacity={0.55}
              className="dot"
              {...t.bind(
                `${cleanName(p.name)}${p.county ? ` (${p.county})` : ""}`,
                `CRI ${p.cri.toFixed(2)} · ${formatRon(p.value)}`,
                `${p.nFlags} semnale de risc · click → pagina entității`,
              )}
            />
          </a>
        ))}
      </svg>
      <p className="ask-fine">
        Fiecare punct = o entitate (min. 10 achiziții) — click deschide pagina ei.
      </p>
    </div>
  );
}

/* ── sankey ───────────────────────────────────────────────────────────── */

export function SankeyBlock({
  flows,
  focal,
  spec,
}: {
  flows: SankeyFlow[];
  focal: { entityId: string; name: string; role: string };
  spec?: unknown;
}) {
  const t = useTip();
  // click-throughs: node/ribbon -> search drill with exactly those rows.
  // Partner gets the opposite role of the focal entity; ribbons add the CPV.
  const drillUrl = (extra: Record<string, unknown>): string => {
    const sp = (spec ?? {}) as { dataset?: string; filters?: Record<string, unknown> };
    const next: Record<string, unknown> = {
      block: "stat",
      measure: "value",
      filters: { ...(sp.filters ?? {}), ...extra },
    };
    if (sp.dataset) next["dataset"] = sp.dataset;
    return `/?spec=${encodeURIComponent(encodeSpec(next))}&drill=1`;
  };
  const partnerExtra = (id: string, name: string): Record<string, unknown> =>
    focal.role === "authority"
      ? { supplierName: cleanName(name), supplierId: Number(id) }
      : { authorityName: cleanName(name), authorityId: Number(id) };
  if (flows.length === 0) return <p className="ask-empty">Niciun flux.</p>;
  const W = 640;
  const NODE_W = 8;
  const GAP = 8;
  const total = flows.reduce((a, f) => a + f.value, 0);

  const partners = new Map<string, { name: string; value: number }>();
  const cats = new Map<string, { name: string; value: number }>();
  for (const f of flows) {
    const p = partners.get(f.partnerId) ?? { name: f.partner, value: 0 };
    p.value += f.value;
    partners.set(f.partnerId, p);
    const c = cats.get(f.categoryCode) ?? { name: f.category ?? f.categoryCode, value: 0 };
    c.value += f.value;
    cats.set(f.categoryCode, c);
  }
  const H = Math.max(220, Math.max(partners.size, cats.size) * 34 + 20);
  const usable = H - GAP * Math.max(partners.size, cats.size);
  const scale = usable / total;

  let py = 10;
  const pPos = new Map<string, { y0: number; h: number; name: string; used: number }>();
  for (const [id, p] of [...partners.entries()].sort((a, b) => b[1].value - a[1].value)) {
    const h = Math.max(4, p.value * scale);
    pPos.set(id, { y0: py, h, name: p.name, used: 0 });
    py += h + GAP;
  }
  let cy = 10;
  const cPos = new Map<string, { y0: number; h: number; name: string; used: number }>();
  for (const [id, c] of [...cats.entries()].sort((a, b) => b[1].value - a[1].value)) {
    const h = Math.max(4, c.value * scale);
    cPos.set(id, { y0: cy, h, name: c.name, used: 0 });
    cy += h + GAP;
  }

  const LX = 170;
  const RX = W - 180;
  return (
    <div>
      <p className="ask-fine" style={{ marginBottom: 8 }}>
        Banii lui <Link href={`/entitati/${focal.entityId}`}>{cleanName(focal.name)}</Link>:{" "}
        {focal.role === "authority" ? "furnizori" : "autorități"} (stânga) → categorii de achiziții
        (dreapta) · lățimea benzii = valoarea
      </p>
      <svg viewBox={`0 0 ${W} ${Math.max(py, cy) + 6}`} className="ask-sankey" role="img">
        {flows.map((f, i) => {
          const p = pPos.get(f.partnerId)!;
          const c = cPos.get(f.categoryCode)!;
          const h = Math.max(1.5, f.value * scale);
          const y0 = p.y0 + p.used + h / 2;
          const y1 = c.y0 + c.used + h / 2;
          p.used += h;
          c.used += h;
          const mx = (LX + NODE_W + RX) / 2;
          const linkable = f.partnerId !== "_alt" && f.categoryCode !== "_alt";
          const ribbon = (
              <path
                d={`M ${LX + NODE_W} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${RX} ${y1}`}
                stroke={f.value / total > 0.12 ? "#c9a24a" : "#e0d4b0"}
                strokeWidth={h}
                fill="none"
                strokeOpacity={0.75}
                {...t.bind(
                  `${cleanName(f.partner)} → ${f.category ?? "?"}`,
                  formatRon(f.value),
                  `${((f.value / total) * 100).toFixed(1)}% din fluxul afișat${linkable ? " · click → achizițiile acestui flux" : ""}`,
                )}
              />
          );
          return linkable ? (
            <a
              key={i}
              href={drillUrl({ ...partnerExtra(f.partnerId, f.partner), cpvTerm: f.categoryCode })}
              target="_blank"
              rel="noopener"
            >
              {ribbon}
            </a>
          ) : (
            <g key={i}>{ribbon}</g>
          );
        })}
        {[...pPos.entries()].map(([id, p]) => {
          const node = (
            <g
              {...t.bind(
                cleanName(p.name),
                formatRon(partners.get(id)?.value ?? 0),
                id !== "_alt" ? "click → toate achizițiile cu acest partener" : undefined,
              )}
            >
              <rect x={LX} y={p.y0} width={NODE_W} height={p.h} fill="#9a2b1f" rx={2} />
              <text x={LX - 6} y={p.y0 + p.h / 2 + 3} fontSize={10} fill="#16130d" textAnchor="end">
                {cleanName(p.name).slice(0, 26)}
              </text>
            </g>
          );
          return id !== "_alt" ? (
            <a key={id} href={drillUrl(partnerExtra(id, p.name))} target="_blank" rel="noopener">
              {node}
            </a>
          ) : (
            <g key={id}>{node}</g>
          );
        })}
        {[...cPos.entries()].map(([id, c]) => {
          const node = (
            <g
              {...t.bind(
                c.name ?? "?",
                formatRon(cats.get(id)?.value ?? 0),
                id !== "_alt" ? "click → achizițiile focalului în această categorie" : undefined,
              )}
            >
              <rect x={RX} y={c.y0} width={NODE_W} height={c.h} fill="#c06a3a" rx={2} />
              <text x={RX + NODE_W + 6} y={c.y0 + c.h / 2 + 3} fontSize={10} fill="#16130d">
                {(c.name ?? "?").slice(0, 26)}
              </text>
            </g>
          );
          return id !== "_alt" ? (
            <a key={id} href={drillUrl({ cpvTerm: id })} target="_blank" rel="noopener">
              {node}
            </a>
          ) : (
            <g key={id}>{node}</g>
          );
        })}
      </svg>
      {t.el}
    </div>
  );
}

/* ── network ──────────────────────────────────────────────────────────── */

export function NetworkBlock({
  nodes,
  focal,
}: {
  nodes: NetworkNode[];
  focal: { entityId: string; name: string; role: string };
}) {
  const [tip, setTip] = useState<{
    name: string;
    value: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);
  if (nodes.length === 0) return <p className="ask-empty">Niciun partener.</p>;
  const W = 640;
  const H = 380;
  const cx = W / 2;
  const cyc = H / 2;
  const R = Math.min(W, H) / 2 - 70;
  const maxV = Math.max(...nodes.map((n) => n.value), 1);
  const totalV = nodes.reduce((s, n) => s + n.value, 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ask-network" role="img">
        {nodes.map((n, i) => {
          const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const nx = cx + Math.cos(a) * R;
          const ny = cyc + Math.sin(a) * R;
          const r = 6 + Math.sqrt(n.value / maxV) * 16;
          const anchor = Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
          const hovered = tip?.name === cleanName(n.name);
          const move = (e: React.MouseEvent) =>
            setTip({
              name: cleanName(n.name),
              value: n.value,
              count: n.count,
              x: e.clientX,
              y: e.clientY,
            });
          return (
            <g
              key={n.entityId}
              onMouseEnter={move}
              onMouseMove={move}
              onMouseLeave={() => setTip(null)}
            >
              <line
                x1={cx}
                y1={cyc}
                x2={nx}
                y2={ny}
                stroke="#c9a24a"
                strokeWidth={Math.max(1, (n.value / maxV) * 8)}
                strokeOpacity={hovered ? 0.9 : 0.55}
              />
              <a href={`/entitati/${n.entityId}`}>
                <circle
                  cx={nx}
                  cy={ny}
                  r={hovered ? r + 2 : r}
                  fill="#c06a3a"
                  fillOpacity={hovered ? 1 : 0.85}
                  stroke={hovered ? "#16130d" : "none"}
                  strokeWidth={hovered ? 1.4 : 0}
                />
                <text
                  x={nx + (anchor === "start" ? r + 4 : anchor === "end" ? -r - 4 : 0)}
                  y={ny + (anchor === "middle" ? (Math.sin(a) > 0 ? r + 12 : -r - 6) : 4)}
                  fontSize={10}
                  fill="#16130d"
                  fontWeight={hovered ? 700 : 400}
                  textAnchor={anchor}
                >
                  {cleanName(n.name).slice(0, 24)}
                </text>
              </a>
            </g>
          );
        })}
        <circle cx={cx} cy={cyc} r={26} fill="#9a2b1f" />
        <text x={cx} y={cyc + 3} fontSize={9.5} fill="#fff" textAnchor="middle">
          {cleanName(focal.name).slice(0, 14)}
        </text>
      </svg>
      {tip && (
        <div className="ask-maptip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          <div className="t">{tip.name}</div>
          <div className="v">{formatRon(tip.value)}</div>
          <div className="s">
            {formatInt(tip.count)} achiziții
            {totalV > 0 && ` · ${((tip.value / totalV) * 100).toFixed(1)}% din top-parteneri`}
          </div>
        </div>
      )}
      <p className="ask-fine">
        Top {nodes.length} parteneri ai{" "}
        <Link href={`/entitati/${focal.entityId}`}>{cleanName(focal.name)}</Link> · mărimea nodului
        și grosimea liniei = valoarea · click pe nod → profil
      </p>
    </div>
  );
}

/* ── entity card ──────────────────────────────────────────────────────── */

export function EntityCardBlock({ card }: { card: EntityCardData }) {
  const band = card.cri !== null ? criBand(card.cri) : null;
  return (
    <div className="ask-ecard">
      <h3>
        <Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link>
      </h3>
      <div className="badges">
        <span className="badge">{card.role === "authority" ? "Autoritate" : "Furnizor"}</span>
        {card.county && <span className="badge">{card.county}</span>}
        {card.population !== null && card.population > 0 && (
          <span className="badge">{formatInt(card.population)} locuitori</span>
        )}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="v num">{formatRon(card.value)}</div>
          <div className="l">cheltuială DA</div>
        </div>
        <div className="kpi">
          <div className="v num">{formatInt(card.count)}</div>
          <div className="l">achiziții</div>
        </div>
        <div className="kpi">
          <div className="v num risk">{card.cri !== null ? card.cri.toFixed(2) : "—"}</div>
          <div className="l">indice risc{band ? ` · ${band.label}` : ""}</div>
        </div>
        <div className="kpi">
          <div className="v num risk">{card.nFlags}</div>
          <div className="l">semnale</div>
        </div>
      </div>
      {card.flags.length > 0 && (
        <div className="ask-fchips">
          {card.flags.map((f) => (
            <span key={f} className="ask-fchip" title={FLAG_META[f]?.short}>
              {flagTitle(f)}
            </span>
          ))}
        </div>
      )}
      <p className="ask-methnote">
        Indicele de risc (CRI) e un semnal statistic, nu o dovadă de neregulă —{" "}
        <Link href="/metodologie">cum se calculează</Link>.
      </p>
    </div>
  );
}

/* ── fact check ───────────────────────────────────────────────────────── */

export function FactCheckBlock({ fact }: { fact: FactCheckData }) {
  return (
    <div>
      <div className="ask-fact">
        <div className="verdict">{fact.verdict ? "DA" : "NU"}</div>
        <div className="sub">
          {fact.verdict ? (
            <>
              <Link href={`/entitati/${fact.authority.entityId}`}>
                {cleanName(fact.authority.name)}
              </Link>{" "}
              a cumpărat de la{" "}
              <Link href={`/entitati/${fact.supplier.entityId}`}>
                {cleanName(fact.supplier.name)}
              </Link>
              : <b>{formatInt(fact.count)}</b> achiziții directe, în total{" "}
              <b>{formatRonFull(fact.value)}</b>
              {fact.yearFirst && (
                <>
                  , între {fact.yearFirst} și {fact.yearLast}
                </>
              )}
              .
            </>
          ) : (
            <>
              Nu am găsit nicio achiziție directă între{" "}
              <Link href={`/entitati/${fact.authority.entityId}`}>
                {cleanName(fact.authority.name)}
              </Link>{" "}
              și{" "}
              <Link href={`/entitati/${fact.supplier.entityId}`}>
                {cleanName(fact.supplier.name)}
              </Link>{" "}
              în datele filtrate. (Pot exista contracte pe proceduri competitive, necuprinse aici.)
            </>
          )}
        </div>
      </div>
      {fact.samples.length > 0 && (
        <table className="ask-table">
          <thead>
            <tr>
              <th>Cod</th>
              <th>Dată</th>
              <th>Ce s-a cumpărat</th>
              <th className="num">Valoare</th>
            </tr>
          </thead>
          <tbody>
            {fact.samples.map((s2, i) => (
              <tr key={i}>
                <td>{s2.daCode ?? "—"}</td>
                <td>{s2.date ?? "—"}</td>
                <td>{s2.cpvName ?? "—"}</td>
                <td className="num">{formatRonFull(s2.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── trend ────────────────────────────────────────────────────────────── */

export function TrendBlock({
  rows,
  yearA,
  yearB,
}: {
  rows: TrendRow[];
  yearA: number;
  yearB: number;
}) {
  if (rows.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  return (
    <div>
      <div className="ask-trend">
        <div className="tr head">
          <span />
          <span className="yv">{yearA}</span>
          <span className="arrow" />
          <span className="yv">{yearB}</span>
          <span className="delta">Δ</span>
        </div>
        {rows.map((r) => {
          const delta = r.valueB - r.valueA;
          const pct = r.valueA > 0 ? (delta / r.valueA) * 100 : null;
          const up = delta > 0;
          return (
            <div key={r.entityId ?? r.name} className="tr">
              <span className="nm">
                {r.entityId ? (
                  <Link href={`/entitati/${r.entityId}`}>{cleanName(r.name)}</Link>
                ) : (
                  r.name
                )}
                {r.county ? ` (${r.county})` : ""}
              </span>
              <span className="yv num">{formatRon(r.valueA)}</span>
              <span className="arrow">→</span>
              <span className="yv num">{formatRon(r.valueB)}</span>
              <span className={up ? "delta num up" : "delta num down"}>
                {pct === null ? "nou" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="ask-fine">
        Ordonate după schimbarea absolută (creșteri și scăderi). „nou” = fără activitate în {yearA}.
      </p>
    </div>
  );
}
