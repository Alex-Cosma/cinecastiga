"use client";

import Link from "next/link";
import { useAnswerEvidence } from "./AnswerEvidence";
import type { AskSpec } from "@/lib/ask/spec";
import type { EvidenceScope } from "@/lib/ask/evidence";
import { useEffect, useRef, useState } from "react";
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
    const move = (e: React.MouseEvent) =>
      setTip({ title, v, s, x: e.clientX, y: e.clientY });
    return {
      onMouseEnter: move,
      onMouseMove: move,
      onMouseLeave: () => setTip(null),
    };
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
    return {
      onMouseEnter: move,
      onMouseMove: move,
      onMouseLeave: () => setTip(null),
    };
  };
  const el = tip ? (
    <div className="ask-maptip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      <div className="t">{tip.title}</div>
      {tip.v && <div className="v">{tip.v}</div>}
      {tip.s && <div className="s">{tip.s}</div>}
    </div>
  ) : null;
  /** Manual control for canvas-rendered blocks (no DOM element to bind). */
  const show = (
    title: string,
    v: string | undefined,
    s: string | undefined,
    x: number,
    y: number,
  ) => setTip({ title, v, s, x, y });
  const hide = () => setTip(null);
  return { bind, bindClip, show, hide, el, active: tip?.title ?? null };
}
import { FLAG_META, criBand } from "@/lib/flags";
import type {
  CompareEntity,
  DistributionData,
  BreakdownSlice,
  ScatterPoint,
  ScatterDensity,
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
  const evidence = useAnswerEvidence();
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
              {e.county ?? "județ necunoscut"} ·{" "}
              {e.role === "authority" ? "autoritate" : "furnizor"}
            </div>
            <div className="row">
              <span className="k">Valoare în profil</span>
              <span className="num">{formatRon(e.value)}</span>
            </div>
            <div className="row">
              <span className="k">Achiziții</span>
              <span className="num">{formatInt(e.count)}</span>
            </div>
            {e.population !== null && e.population > 0 && (
              <div className="row">
                <span className="k">Lei / locuitor</span>
                <span className="num">
                  {formatInt(Math.round(e.value / e.population))}
                </span>
              </div>
            )}
            <div className="row">
              <span className="k">Indice risc</span>
              <span
                className={e.cri !== null && e.cri >= 0.3 ? "num hi" : "num"}
              >
                {e.cri !== null ? `${e.cri.toFixed(2)} · ${band!.label}` : "—"}
              </span>
            </div>
            <div className="row">
              <span className="k">Semnale</span>
              <span className={e.nFlags > 0 ? "hi" : ""}>{e.nFlags}</span>
            </div>
            {evidence && (
              <button
                type="button"
                className="cq-record-link"
                onClick={() =>
                  evidence.open(
                    undefined,
                    {
                      entityIds: [e.entityId],
                      role: e.role === "supplier" ? "supplier" : "authority",
                    },
                    `${cleanName(e.name)} · înregistrările profilului`,
                  )
                }
              >
                Vezi cele {formatInt(e.count)} înregistrări →
              </button>
            )}
            {e.flags.length > 0 && (
              <div className="ask-fchips">
                {e.flags.map((f) => (
                  <span
                    key={f}
                    className="ask-fchip"
                    title={FLAG_META[f]?.short}
                  >
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
  const evidence = useAnswerEvidence();
  const d = distribution;
  const t = useTip();
  const max = Math.max(...d.buckets.map((b) => b.n), 1);
  const focalBucket =
    d.focal.cri === null
      ? -1
      : Math.min(9, Math.floor(d.focal.cri * 10 - 1e-9));
  // bar click → /semnale listing of the entities in that CRI band (the
  // comparison group's county filter travels along; kind/UAT riders don't)
  const county = ((spec ?? {}) as { filters?: { county?: string } }).filters
    ?.county;
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
              (b.n > 0 ? "click → înregistrările profilurilor" : ""),
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
              onClick={(event) => {
                if (evidence) {
                  event.preventDefault();
                  evidence.open(
                    undefined,
                    { riskBucket: { from: b.from, to: b.to } },
                    `Indice ${b.from.toFixed(1)}–${b.to.toFixed(1)} · înregistrările profilurilor`,
                  );
                }
              }}
              target="_blank"
              rel="noopener"
              {...bind}
            >
              {inner}
            </a>
          ) : (
            <div
              key={b.from}
              className={i === focalBucket ? "b here" : "b"}
              {...bind}
            >
              {inner}
            </div>
          );
        })}
      </div>
      {evidence && (
        <button
          type="button"
          className="cq-record-link"
          onClick={() =>
            evidence.open(
              undefined,
              {
                entityIds: [d.focal.entityId],
                role: d.role === "supplier" ? "supplier" : "authority",
              },
              `${cleanName(d.focal.name)} · sursele profilului`,
            )
          }
        >
          Verifică profilul ales →
        </button>
      )}
      <p className="ask-distcap">
        <Link href={`/entitati/${d.focal.entityId}`}>
          {cleanName(d.focal.name)}
        </Link>
        {d.focal.cri !== null ? (
          <>
            {" "}
            are indice de risc <b>{d.focal.cri.toFixed(2)}</b>
            {d.focal.percentile !== null && (
              <>
                {" "}
                — peste <b>{d.focal.percentile}%</b> din grupul de comparație:
                cele <b>{formatInt(d.totalEntities)}</b>{" "}
                {d.role === "authority" ? "autorități" : "firme"} cu cel puțin
                10 achiziții directe (filtrele de județ/tip se aplică grupului)
              </>
            )}
            .
          </>
        ) : (
          <> nu are încă un indice de risc calculat.</>
        )}{" "}
        <Link href="/metodologie">Cum se calculează CRI</Link> — semnal, nu
        dovadă.
      </p>
    </div>
  );
}

/* ── breakdown ────────────────────────────────────────────────────────── */

// Categorical: fixed order, never cycled; hues spaced for CVD, mid lightness
// so they read on both grounds. Slot 9+ folds into "alte categorii".
const SEG_COLORS = [
  "#285b45",
  "#708e59",
  "#aab984",
  "#547c76",
  "#b67957",
  "#9cae98",
  "#8a6a4a",
  "#c7cca7",
];
const SEG_OTHER = "#a3acba";

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
  const evidence = useAnswerEvidence();
  // slice click: while the stem can go deeper, open the same breakdown one
  // CPV level down; at a full 8-digit code, open the transactions instead.
  const canDeepen = (code: string): boolean => code.length < 8;
  const sliceUrl = (code: string): string => {
    const sp = (spec ?? {}) as {
      dataset?: string;
      filters?: Record<string, unknown>;
    };
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
              style={{
                width: `${(s.value / total) * 100}%`,
                background: s.color,
              }}
              {...bind}
            />
          ) : (
            <div
              key={s.name}
              className="seg"
              style={{
                width: `${(s.value / total) * 100}%`,
                background: s.color,
              }}
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
              {formatRonFull(s.value)} · {((s.value / total) * 100).toFixed(1)}%
              {evidence && (
                <button
                  type="button"
                  className="cq-record-link"
                  onClick={() =>
                    evidence.open(
                      undefined,
                      s.code
                        ? { cpvPrefixes: [s.code] }
                        : {
                            excludeCpvPrefixes: slices.map((item) => item.code),
                          },
                      `${s.name} · înregistrările categoriei`,
                    )
                  }
                >
                  Surse →
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── scatter ──────────────────────────────────────────────────────────── */

/**
 * Density scatter: canvas 2D histogram of the WHOLE population (grey mass)
 * with only the notable entities drawn as clickable dots on top. Wheel =
 * zoom at cursor, drag = pan, double-click = reset.
 */
export function ScatterBlock({
  points,
  density,
}: {
  points: ScatterPoint[];
  density?: ScatterDensity | undefined;
}) {
  const t = useTip();
  const evidence = useAnswerEvidence();
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef(t);
  tipRef.current = t;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vals = points.map((p) => Math.max(p.value, 1));
    const D0 = density ? density.minLog : Math.log10(Math.min(...vals));
    const D1 = Math.max(
      density ? density.maxLog : Math.log10(Math.max(...vals)),
      D0 + 0.01,
    );
    const xPad = (D1 - D0) * 0.03;
    const home = { x0: D0 - xPad, x1: D1 + xPad, y0: -0.03, y1: 1.04 };
    const view = { ...home };
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { l: 86, r: 22, t: 22, b: 62 };
    const cssVar = (v: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim() ||
      "#888";

    // notable dots: risky (CRI ≥ 0.3) plus the 40 biggest spenders
    const topSpend = new Set(
      [...points]
        .sort((a, b) => b.value - a.value)
        .slice(0, 40)
        .map((p) => p.entityId),
    );
    let hit: { x: number; y: number; p: ScatterPoint }[] = [];

    const draw = () => {
      const X = (lg: number) =>
        PAD.l + ((lg - view.x0) / (view.x1 - view.x0)) * (W - PAD.l - PAD.r);
      const Y = (c: number) =>
        H - PAD.b - ((c - view.y0) / (view.y1 - view.y0)) * (H - PAD.t - PAD.b);
      ctx.clearRect(0, 0, W, H);
      const muted = cssVar("--muted");
      const line = cssVar("--line");
      const track = cssVar("--bar-track");
      // frame
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, PAD.t);
      ctx.lineTo(PAD.l, H - PAD.b);
      ctx.lineTo(W - PAD.r, H - PAD.b);
      ctx.stroke();
      ctx.font = "17px ui-monospace, monospace";
      // y ticks
      const ySpan = view.y1 - view.y0;
      const yStep = ySpan > 0.6 ? 0.25 : ySpan > 0.25 ? 0.1 : 0.05;
      for (
        let v = Math.ceil(view.y0 / yStep) * yStep;
        v <= view.y1 + 1e-9;
        v += yStep
      ) {
        const vv = Math.round(v * 100) / 100;
        if (vv < -0.001 || vv > 1.001) continue;
        ctx.fillStyle = muted;
        ctx.textAlign = "right";
        ctx.fillText(String(vv).replace(".", ","), PAD.l - 10, Y(vv) + 6);
        ctx.strokeStyle = track;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.l, Y(vv));
        ctx.lineTo(W - PAD.r, Y(vv));
        ctx.stroke();
      }
      // x decade ticks
      const decades: [number, string][] = [
        [3, "1 mie"],
        [4, "10 mii"],
        [5, "100 mii"],
        [6, "1 mil."],
        [7, "10 mil."],
        [8, "100 mil."],
        [9, "1 mld."],
      ];
      for (const [lg, lb] of decades) {
        if (lg < view.x0 || lg > view.x1) continue;
        ctx.fillStyle = muted;
        ctx.textAlign = "center";
        ctx.fillText(`${lb} lei`, X(lg), H - PAD.b + 28);
        ctx.strokeStyle = track;
        ctx.beginPath();
        ctx.moveTo(X(lg), PAD.t);
        ctx.lineTo(X(lg), H - PAD.b);
        ctx.stroke();
      }
      ctx.fillStyle = muted;
      ctx.save();
      ctx.translate(22, (H - PAD.b + PAD.t) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("indice de risc (CRI)", 0, 0);
      ctx.restore();
      ctx.textAlign = "center";
      ctx.fillText(
        "cheltuială totală (scară log)",
        (PAD.l + W - PAD.r) / 2,
        H - 10,
      );
      // plot clip
      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, W - PAD.l - PAD.r, H - PAD.t - PAD.b);
      ctx.clip();
      // density mass
      if (density) {
        const maxN = Math.max(...density.cells.map((c) => c[2]));
        const cw = (density.maxLog - density.minLog) / density.nx;
        const ch = 1 / density.ny;
        const slate = "#6d7a90";
        for (const [bx, by, n] of density.cells) {
          const lg0 = density.minLog + (bx - 1) * cw;
          const cr0 = (by - 1) * ch;
          if (
            lg0 + cw < view.x0 ||
            lg0 > view.x1 ||
            cr0 + ch < view.y0 ||
            cr0 > view.y1
          )
            continue;
          ctx.fillStyle = slate;
          ctx.globalAlpha = 0.06 + 0.82 * Math.sqrt(n / maxN);
          const px = X(lg0);
          const py = Y(cr0 + ch);
          ctx.beginPath();
          ctx.roundRect(
            px - 0.5,
            py - 0.5,
            X(lg0 + cw) - px + 1,
            Y(cr0) - py + 1,
            2,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // notable dots
      hit = [];
      for (const p of points) {
        const hi = p.cri >= 0.5;
        const mid = p.cri >= 0.3 && p.cri < 0.5;
        const top = topSpend.has(p.entityId);
        if (!hi && !mid && !top) continue;
        const lg = Math.log10(Math.max(p.value, 1));
        if (lg < view.x0 || lg > view.x1 || p.cri < view.y0 || p.cri > view.y1)
          continue;
        const px = X(lg);
        const py = Y(p.cri);
        if (hi || mid) {
          ctx.fillStyle = hi ? "#c0311c" : "#6d7a90";
          ctx.globalAlpha = hi ? 0.95 : 0.8;
          ctx.beginPath();
          ctx.arc(px, py, hi ? 7 : 5.5, 0, 7);
          ctx.fill();
        }
        if (top) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#6d7a90";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, 7);
          ctx.stroke();
        }
        hit.push({ x: px, y: py, p });
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const clamp = () => {
      const xs = Math.max(view.x1 - view.x0, 0.15);
      const ys = Math.max(view.y1 - view.y0, 0.04);
      view.x0 = Math.max(home.x0, Math.min(view.x0, home.x1 - xs));
      view.x1 = view.x0 + Math.min(xs, home.x1 - home.x0);
      view.y0 = Math.max(home.y0, Math.min(view.y0, home.y1 - ys));
      view.y1 = view.y0 + Math.min(ys, home.y1 - home.y0);
    };
    const domPt = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = ((ev.clientX - r.left) * W) / r.width;
      const my = ((ev.clientY - r.top) * H) / r.height;
      return {
        mx,
        my,
        lg:
          view.x0 + ((mx - PAD.l) / (W - PAD.l - PAD.r)) * (view.x1 - view.x0),
        cr:
          view.y0 +
          ((H - PAD.b - my) / (H - PAD.t - PAD.b)) * (view.y1 - view.y0),
      };
    };
    const locate = (ev: MouseEvent) => {
      const { mx, my } = domPt(ev);
      let best: { x: number; y: number; p: ScatterPoint } | null = null;
      let bd = Infinity;
      for (const h of hit) {
        const dd = (h.x - mx) ** 2 + (h.y - my) ** 2;
        if (dd < bd) {
          bd = dd;
          best = h;
        }
      }
      return best && bd < 22 ** 2 ? best : null;
    };

    let dragFrom: {
      cx: number;
      cy: number;
      x0: number;
      x1: number;
      y0: number;
      y1: number;
    } | null = null;
    let dragged = false;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = domPt(ev);
      const f = Math.pow(1.0015, ev.deltaY);
      view.x0 = p.lg - (p.lg - view.x0) * f;
      view.x1 = p.lg + (view.x1 - p.lg) * f;
      view.y0 = p.cr - (p.cr - view.y0) * f;
      view.y1 = p.cr + (view.y1 - p.cr) * f;
      clamp();
      draw();
    };
    const onDown = (ev: MouseEvent) => {
      dragFrom = {
        cx: ev.clientX,
        cy: ev.clientY,
        x0: view.x0,
        x1: view.x1,
        y0: view.y0,
        y1: view.y1,
      };
      dragged = false;
    };
    const onUp = () => {
      dragFrom = null;
    };
    const onMove = (ev: MouseEvent) => {
      if (dragFrom) {
        const r = canvas.getBoundingClientRect();
        const pxW = (W - PAD.l - PAD.r) * (r.width / W);
        const pxH = (H - PAD.t - PAD.b) * (r.height / H);
        const dLg =
          (-(ev.clientX - dragFrom.cx) / pxW) * (dragFrom.x1 - dragFrom.x0);
        const dCr =
          ((ev.clientY - dragFrom.cy) / pxH) * (dragFrom.y1 - dragFrom.y0);
        if (
          Math.abs(ev.clientX - dragFrom.cx) +
            Math.abs(ev.clientY - dragFrom.cy) >
          4
        )
          dragged = true;
        view.x0 = dragFrom.x0 + dLg;
        view.x1 = dragFrom.x1 + dLg;
        view.y0 = dragFrom.y0 + dCr;
        view.y1 = dragFrom.y1 + dCr;
        clamp();
        draw();
        return;
      }
      const h = locate(ev);
      if (h) {
        tipRef.current.show(
          `${cleanName(h.p.name)}${h.p.county ? ` (${h.p.county})` : ""}`,
          `CRI ${h.p.cri.toFixed(2)} · ${formatRon(h.p.value)}`,
          `${h.p.nFlags} semnale de risc · click → pagina entității`,
          ev.clientX,
          ev.clientY,
        );
        canvas.style.cursor = "pointer";
      } else {
        tipRef.current.hide();
        canvas.style.cursor = "crosshair";
      }
    };
    const onLeave = () => {
      tipRef.current.hide();
      dragFrom = null;
    };
    const onClick = (ev: MouseEvent) => {
      if (dragged) {
        dragged = false;
        return;
      }
      const h = locate(ev);
      if (h) {
        if (evidenceRef.current)
          evidenceRef.current.open(
            undefined,
            { entityIds: [h.p.entityId] },
            `${cleanName(h.p.name)} · înregistrările profilului`,
          );
        else window.open(`/entitati/${h.p.entityId}`, "_blank", "noopener");
      }
    };
    const onDbl = () => {
      Object.assign(view, home);
      draw();
    };

    draw();
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDbl);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [points, density]);

  if (points.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  return (
    <div>
      {t.el}
      <canvas
        ref={canvasRef}
        width={1360}
        height={780}
        className="ask-scatterc"
        role="img"
        aria-label="Risc vs cheltuială — densitate"
      />
      <div className="ask-scatterleg">
        <span className="it">
          <span className="ramp" /> puține → multe entități
        </span>
        <span className="it">
          <span className="dsw hi" /> CRI ≥ 0,5
        </span>
        <span className="it">
          <span className="dsw mid" /> CRI 0,3–0,5
        </span>
        <span className="it">
          <span className="dsw top" /> top cheltuială
        </span>
      </div>
      <details className="cq-calculation">
        <summary>
          Valorile exacte și sursele · {points.length} profiluri reprezentate
          prin puncte
        </summary>
        <table className="cq-group-table">
          <thead>
            <tr>
              <th>Entitate</th>
              <th>Valoare în profil</th>
              <th>Indice</th>
              <th>Surse</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.entityId}>
                <td>
                  <Link href={`/entitati/${p.entityId}`}>
                    {cleanName(p.name)}
                  </Link>
                </td>
                <td>{formatRonFull(p.value)}</td>
                <td>{p.cri.toFixed(2)}</td>
                <td>
                  {evidence && (
                    <button
                      className="cq-record-link"
                      type="button"
                      onClick={() =>
                        evidence.open(
                          undefined,
                          { entityIds: [p.entityId] },
                          `${cleanName(p.name)} · înregistrările profilului`,
                        )
                      }
                    >
                      Înregistrări →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="ask-fine">
        {density
          ? `Norul gri = toate cele ${formatInt(density.total)} de entități cu min. 10 achiziții; punctele = cele notabile, click deschide înregistrările profilului.`
          : "Fiecare punct = o entitate (min. 10 achiziții) — click deschide înregistrările profilului."}{" "}
        Scroll = zoom · trage = pan · dublu-click = reset.
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
  const evidence = useAnswerEvidence();
  const selectedScope = (
    partner?: string,
    category?: string,
  ): EvidenceScope => ({
    ...(partner
      ? {
          role:
            focal.role === "authority"
              ? ("supplier" as const)
              : ("authority" as const),
          ...(partner === "_alt"
            ? {
                excludeEntityIds: [
                  ...new Set(
                    flows.map((f) => f.partnerId).filter((id) => id !== "_alt"),
                  ),
                ],
              }
            : { entityIds: [partner] }),
        }
      : {}),
    ...(category
      ? category === "_alt"
        ? {
            excludeCpvPrefixes: [
              ...new Set(
                flows.map((f) => f.categoryCode).filter((id) => id !== "_alt"),
              ),
            ],
          }
        : { cpvPrefixes: [category] }
      : {}),
  });
  const activate = (scope: EvidenceScope, label: string) =>
    evidence?.open(undefined, scope, label);
  const marks = (scope: EvidenceScope, label: string) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": label + " · vezi înregistrările",
    onClick: (event: React.MouseEvent) => {
      if (evidence) {
        event.preventDefault();
        event.stopPropagation();
        activate(scope, label);
      }
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (evidence && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        activate(scope, label);
      }
    },
  });
  // click-throughs: node/ribbon -> search drill with exactly those rows.
  // Partner gets the opposite role of the focal entity; ribbons add the CPV.
  const drillUrl = (extra: Record<string, unknown>): string => {
    const sp = (spec ?? {}) as {
      dataset?: string;
      filters?: Record<string, unknown>;
    };
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
    const c = cats.get(f.categoryCode) ?? {
      name: f.category ?? f.categoryCode,
      value: 0,
    };
    c.value += f.value;
    cats.set(f.categoryCode, c);
  }
  const H = Math.max(220, Math.max(partners.size, cats.size) * 34 + 20);
  const usable = H - GAP * Math.max(partners.size, cats.size);
  const scale = usable / total;

  let py = 10;
  const pPos = new Map<
    string,
    { y0: number; h: number; name: string; used: number }
  >();
  for (const [id, p] of [...partners.entries()].sort(
    (a, b) => b[1].value - a[1].value,
  )) {
    const h = Math.max(4, p.value * scale);
    pPos.set(id, { y0: py, h, name: p.name, used: 0 });
    py += h + GAP;
  }
  let cy = 10;
  const cPos = new Map<
    string,
    { y0: number; h: number; name: string; used: number }
  >();
  for (const [id, c] of [...cats.entries()].sort(
    (a, b) => b[1].value - a[1].value,
  )) {
    const h = Math.max(4, c.value * scale);
    cPos.set(id, { y0: cy, h, name: c.name, used: 0 });
    cy += h + GAP;
  }

  const LX = 170;
  const RX = W - 180;
  return (
    <div>
      <p className="ask-fine" style={{ marginBottom: 8 }}>
        Banii lui{" "}
        <Link href={`/entitati/${focal.entityId}`}>
          {cleanName(focal.name)}
        </Link>
        : {focal.role === "authority" ? "furnizori" : "autorități"} (stânga) →
        categorii de achiziții (dreapta) · lățimea benzii = valoarea
      </p>
      <svg
        viewBox={`0 0 ${W} ${Math.max(py, cy) + 6}`}
        className="ask-sankey"
        role="img"
      >
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
              stroke={f.value / total > 0.12 ? "#6d7a90" : "#ccd2dc"}
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
              {...marks(
                selectedScope(f.partnerId, f.categoryCode),
                `${cleanName(f.partner)} · ${f.category ?? f.categoryCode}`,
              )}
              href={drillUrl({
                ...partnerExtra(f.partnerId, f.partner),
                cpvTerm: f.categoryCode,
              })}
              target="_blank"
              rel="noopener"
            >
              {ribbon}
            </a>
          ) : (
            <g
              key={i}
              {...marks(
                selectedScope(f.partnerId, f.categoryCode),
                `${cleanName(f.partner)} · ${f.category ?? f.categoryCode}`,
              )}
            >
              {ribbon}
            </g>
          );
        })}
        {[...pPos.entries()].map(([id, p]) => {
          const node = (
            <g
              {...t.bind(
                cleanName(p.name),
                formatRon(partners.get(id)?.value ?? 0),
                id !== "_alt"
                  ? "click → toate achizițiile cu acest partener"
                  : undefined,
              )}
            >
              <rect
                x={LX}
                y={p.y0}
                width={NODE_W}
                height={p.h}
                fill="#c0311c"
                rx={2}
              />
              <text
                x={LX - 6}
                y={p.y0 + p.h / 2 + 3}
                fontSize={10}
                fill="currentColor"
                textAnchor="end"
              >
                {cleanName(p.name).slice(0, 26)}
              </text>
            </g>
          );
          return id !== "_alt" ? (
            <a
              key={id}
              {...marks(selectedScope(id), cleanName(p.name))}
              href={drillUrl(partnerExtra(id, p.name))}
              target="_blank"
              rel="noopener"
            >
              {node}
            </a>
          ) : (
            <g key={id} {...marks(selectedScope(id), cleanName(p.name))}>
              {node}
            </g>
          );
        })}
        {[...cPos.entries()].map(([id, c]) => {
          const node = (
            <g
              {...t.bind(
                c.name ?? "?",
                formatRon(cats.get(id)?.value ?? 0),
                id !== "_alt"
                  ? "click → achizițiile focalului în această categorie"
                  : undefined,
              )}
            >
              <rect
                x={RX}
                y={c.y0}
                width={NODE_W}
                height={c.h}
                fill="#2f4fb8"
                rx={2}
              />
              <text
                x={RX + NODE_W + 6}
                y={c.y0 + c.h / 2 + 3}
                fontSize={10}
                fill="currentColor"
              >
                {(c.name ?? "?").slice(0, 26)}
              </text>
            </g>
          );
          return id !== "_alt" ? (
            <a
              key={id}
              {...marks(selectedScope(undefined, id), c.name ?? id)}
              href={drillUrl({ cpvTerm: id })}
              target="_blank"
              rel="noopener"
            >
              {node}
            </a>
          ) : (
            <g key={id} {...marks(selectedScope(undefined, id), c.name ?? id)}>
              {node}
            </g>
          );
        })}
      </svg>
      {t.el}
      <details className="cq-calculation">
        <summary>Toate fluxurile afișate, cu valorile exacte</summary>
        <table className="cq-group-table">
          <thead>
            <tr>
              <th>Partener · domeniu</th>
              <th>Valoare</th>
              <th>Surse</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f, i) => (
              <tr key={i}>
                <td>
                  {cleanName(f.partner)}
                  <br />
                  {f.category ?? f.categoryCode}
                </td>
                <td>{formatRonFull(f.value)}</td>
                <td>
                  <button
                    type="button"
                    className="cq-record-link"
                    onClick={() =>
                      activate(
                        selectedScope(f.partnerId, f.categoryCode),
                        `${cleanName(f.partner)} · ${f.category ?? f.categoryCode}`,
                      )
                    }
                  >
                    Înregistrări →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
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
  const evidence = useAnswerEvidence();
  const sources = (n: NetworkNode) =>
    evidence?.open(
      undefined,
      {
        entityIds: [n.entityId],
        role: focal.role === "authority" ? "supplier" : "authority",
      },
      `${cleanName(n.name)} · relația cu ${cleanName(focal.name)}`,
    );
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
          const anchor =
            Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
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
                stroke="var(--accent-line)"
                strokeWidth={Math.max(1, (n.value / maxV) * 8)}
                strokeOpacity={hovered ? 0.9 : 0.55}
              />
              <a
                href={`/entitati/${n.entityId}`}
                onClick={(event) => {
                  if (evidence) {
                    event.preventDefault();
                    sources(n);
                  }
                }}
                aria-label={`${cleanName(n.name)} · ${n.count} înregistrări`}
              >
                <circle
                  cx={nx}
                  cy={ny}
                  r={hovered ? r + 2 : r}
                  fill="var(--accent)"
                  fillOpacity={hovered ? 1 : 0.85}
                  stroke={hovered ? "currentColor" : "none"}
                  strokeWidth={hovered ? 1.4 : 0}
                />
                <text
                  x={
                    nx +
                    (anchor === "start" ? r + 4 : anchor === "end" ? -r - 4 : 0)
                  }
                  y={
                    ny +
                    (anchor === "middle"
                      ? Math.sin(a) > 0
                        ? r + 12
                        : -r - 6
                      : 4)
                  }
                  fontSize={10}
                  fill="currentColor"
                  fontWeight={hovered ? 700 : 400}
                  textAnchor={anchor}
                >
                  {cleanName(n.name).slice(0, 24)}
                </text>
              </a>
            </g>
          );
        })}
        <circle cx={cx} cy={cyc} r={26} fill="var(--accent)" />
        <text x={cx} y={cyc + 3} fontSize={9.5} fill="#fff" textAnchor="middle">
          {cleanName(focal.name).slice(0, 14)}
        </text>
      </svg>
      {tip && (
        <div
          className="ask-maptip"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="t">{tip.name}</div>
          <div className="v">{formatRon(tip.value)}</div>
          <div className="s">
            {formatInt(tip.count)} achiziții
            {totalV > 0 &&
              ` · ${((tip.value / totalV) * 100).toFixed(1)}% din top-parteneri`}
          </div>
        </div>
      )}
      <p className="ask-fine">
        Top {nodes.length} parteneri ai{" "}
        <Link href={`/entitati/${focal.entityId}`}>
          {cleanName(focal.name)}
        </Link>{" "}
        · mărimea nodului și grosimea liniei = valoarea · click pe nod →
        înregistrările relației
      </p>
      <table className="cq-group-table">
        <thead>
          <tr>
            <th>Partener</th>
            <th>Valoare înregistrată</th>
            <th>Surse</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.entityId}>
              <td>
                <Link href={`/entitati/${n.entityId}`}>
                  {cleanName(n.name)}
                </Link>
              </td>
              <td>{formatRonFull(n.value)}</td>
              <td>
                <button
                  type="button"
                  className="cq-record-link"
                  onClick={() => sources(n)}
                >
                  {formatInt(n.count)} înregistrări →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ask-fine">
        Diagrama și lista arată primii {nodes.length} parteneri. Butonul
        principal de surse include întreaga selecție. O relație de achiziții nu
        dovedește o afiliere sau o legătură personală.
      </p>
    </div>
  );
}

/* ── entity card ──────────────────────────────────────────────────────── */

export function EntityCardBlock({ card }: { card: EntityCardData }) {
  const evidence = useAnswerEvidence();
  const band = card.cri !== null ? criBand(card.cri) : null;
  return (
    <div className="ask-ecard">
      <h3>
        <Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link>
      </h3>
      <div className="badges">
        <span className="badge">
          {card.role === "authority" ? "Autoritate" : "Furnizor"}
        </span>
        {card.county && <span className="badge">{card.county}</span>}
        {card.population !== null && card.population > 0 && (
          <span className="badge">{formatInt(card.population)} locuitori</span>
        )}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="v num">{formatRon(card.value)}</div>
          <div className="l">valoare înregistrată în profil</div>
        </div>
        <div className="kpi">
          <div className="v num">{formatInt(card.count)}</div>
          <div className="l">achiziții</div>
        </div>
        <div className="kpi">
          <div className="v num risk">
            {card.cri !== null ? card.cri.toFixed(2) : "—"}
          </div>
          <div className="l">indice risc{band ? ` · ${band.label}` : ""}</div>
        </div>
        <div className="kpi">
          <div className="v num risk">{card.nFlags}</div>
          <div className="l">semnale</div>
        </div>
      </div>
      {evidence && (
        <button
          type="button"
          className="cq-record-link"
          onClick={() =>
            evidence.open(
              undefined,
              {
                entityIds: [card.entityId],
                role: card.role === "supplier" ? "supplier" : "authority",
              },
              `${cleanName(card.name)} · înregistrările profilului`,
            )
          }
        >
          Verifică cele {formatInt(card.count)} înregistrări →
        </button>
      )}
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
  const evidence = useAnswerEvidence();
  return (
    <div>
      <div className="ask-fact">
        <div className="verdict">
          {fact.verdict
            ? "Am găsit înregistrări."
            : "Nu am găsit în datele selectate."}
        </div>
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
              : <b>{formatInt(fact.count)}</b> înregistrări, în total{" "}
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
              Nu am găsit nicio înregistrare între{" "}
              <Link href={`/entitati/${fact.authority.entityId}`}>
                {cleanName(fact.authority.name)}
              </Link>{" "}
              și{" "}
              <Link href={`/entitati/${fact.supplier.entityId}`}>
                {cleanName(fact.supplier.name)}
              </Link>{" "}
              în datele filtrate. Lipsa unui rezultat nu stabilește absența unei
              relații în afara selecției.
            </>
          )}
        </div>
      </div>
      {evidence && (
        <button
          type="button"
          className="cq-record-link"
          onClick={() => evidence.open()}
        >
          Vezi toate înregistrările relației →
        </button>
      )}
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
  spec,
}: {
  rows: TrendRow[];
  yearA: number;
  yearB: number;
  spec?: AskSpec;
}) {
  const evidence = useAnswerEvidence();
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
                  <Link href={`/entitati/${r.entityId}`}>
                    {cleanName(r.name)}
                  </Link>
                ) : (
                  r.name
                )}
                {r.county ? ` (${r.county})` : ""}
                {evidence && (
                  <button
                    type="button"
                    className="cq-record-link"
                    onClick={() =>
                      evidence.open(
                        undefined,
                        {
                          ...(spec?.dim === "county" ? { county: r.name } : {}),
                          ...(r.entityId
                            ? {
                                entityIds: [r.entityId],
                                role:
                                  spec?.dim === "supplier"
                                    ? "supplier"
                                    : "authority",
                              }
                            : {}),
                          years: [yearA, yearB],
                        },
                        `${cleanName(r.name)} · ${yearA} și ${yearB}`,
                      )
                    }
                  >
                    Sursele celor doi ani →
                  </button>
                )}
              </span>
              <span className="yv num">{formatRon(r.valueA)}</span>
              <span className="arrow">→</span>
              <span className="yv num">{formatRon(r.valueB)}</span>
              <span className={up ? "delta num up" : "delta num down"}>
                {pct === null
                  ? "nou"
                  : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="ask-fine">
        Ordonate după schimbarea absolută (creșteri și scăderi). „nou” = fără
        înregistrări în selecție pentru {yearA}.
      </p>
    </div>
  );
}
