"use client";

import Link from "next/link";
import { useAnswerEvidence } from "./AnswerEvidence";
import type { AskSpec } from "@/lib/ask/spec";
import type { EvidenceScope } from "@/lib/ask/evidence";
import { useEffect, useRef, useState } from "react";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { readableCpvName } from "@/lib/entity-summary";
import { countWords, formatDecimal, formatShare } from "@/lib/ask/answer-text";
import { encodeSpec } from "@/lib/ask/permalink";
import type { QuestionSpec } from "@/lib/ask/question-ui";
import { askLink, leaderAlone, leaderAloneSpecs } from "@/lib/ask/source-spec";
import { deeperThread, threadHref, type Thread } from "./answer-state";
import KitLink, { recordsWords } from "./answer/KitLink";
import { FactTag, type RowFact } from "./answer/RowFacts";
import RowMenu from "./answer/RowMenu";
import { entityRowActions } from "./answer/row-actions";
import { breakdownKinds, breakdownShown, generalTag, largestTag } from "./breakdown-answer";
import HelpTip from "./builder/HelpTip";
import { PURCHASE_KIND_WORDS, type PurchaseKind } from "../../lib/ask/purchase";

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
/** A screen whose main pointer cannot hover (a phone, a tablet): no cursor tip there. */
const noHover = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches === true;
/** The tip beside the cursor, turned to its other side near the screen's right or bottom edge (its max-width is 240 px). */
const TIP_W = 248, TIP_H = 96;
function tipPlace(x: number, y: number): { left: number; top: number } {
  const w = typeof window !== "undefined" ? window.innerWidth : Infinity, h = typeof window !== "undefined" ? window.innerHeight : Infinity;
  return {
    left: x + 14 + TIP_W > w ? Math.max(8, x - 14 - TIP_W) : x + 14,
    top: y + 14 + TIP_H > h ? Math.max(8, y - 14 - TIP_H) : y + 14,
  };
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
    // A tap emulates the mouse's enter and never its leave: on a screen without hover the tip would stay over what the
    // tap opened, past the screen's edge (S4 review: a bar's card on a phone). There the tap's own result speaks.
    const move = (e: React.MouseEvent) => {
      if (noHover()) return;
      setTip({ title, v, s, x: e.clientX, y: e.clientY });
    };
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
      if (!text || noHover() || el.scrollWidth <= el.clientWidth + 1) {
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
    <div className="ask-maptip" style={tipPlace(tip.x, tip.y)}>
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
  DistributionData,
  BreakdownSlice,
  BreakdownGroup,
  ScatterPoint,
  ScatterDensity,
  EntityCardData,
  FactCheckData,
} from "@/lib/ask/compile";

/** Renderers for the risk/relationship result blocks (mockup blocks 5–13). */

function flagTitle(code: string): string {
  return FLAG_META[code]?.title ?? code;
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
  const bucketLabel = (b: { from: number; to: number }) => `${formatDecimal(b.from, 1)}–${formatDecimal(b.to, 1)}`;
  const openBucket = (b: { from: number; to: number }) =>
    evidence?.open(undefined, { riskBucket: { from: b.from, to: b.to } }, `Indice ${bucketLabel(b)} · înregistrările profilurilor`);
  return (
    <div>
      {t.el}
      <div className="ask-dist">
        {d.buckets.map((b, i) => {
          const bind = t.bind(
            `CRI ${formatDecimal(b.from, 1)}–${formatDecimal(b.to, 1)}`,
            countWords(b.n, "entitate", "entități"),
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
              <div className="cl">{formatDecimal(b.from, 1)}</div>
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
                  openBucket(b);
                }
              }}
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
      {/* The bars as a list: ten bars are 23–30 px wide on a phone, under the kit's 44 px (WCAG 2.5.8: an equivalent control). */}
      <details className="cq-calculation">
        <summary>Intervalele indicelui, ca listă</summary>
        <table className="cq-group-table">
          <thead>
            <tr>
              <th>Indice</th>
              <th>Entități</th>
              <th>Surse</th>
            </tr>
          </thead>
          <tbody>
            {d.buckets.map((b, i) => b.n > 0 && (
              <tr key={b.from}>
                <td>{bucketLabel(b)}{i === focalBucket ? ` · aici e ${cleanName(d.focal.name)}` : ""}</td>
                <td>{formatInt(b.n)}</td>
                <td>
                  {evidence ? (
                    <button className="cq-record-link" type="button" onClick={() => openBucket(b)}>
                      Înregistrări →
                    </button>
                  ) : (
                    <Link href={bucketUrl(b.from, b.to)}>Lista →</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="ask-distcap">
        <Link href={`/entitati/${d.focal.entityId}`}>
          {cleanName(d.focal.name)}
        </Link>
        {d.focal.cri !== null ? (
          <>
            {" "}
            are indice de risc <b>{formatDecimal(d.focal.cri, 2)}</b>
            {d.focal.percentile !== null && (
              <>
                {" "}
                — peste <b>{d.focal.percentile}%</b> din grupul de comparație:
                cele <b>{d.role === "authority" ? countWords(d.totalEntities, "instituție", "instituții") : countWords(d.totalEntities, "firmă", "firme")}</b> cu cel puțin
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
// so they read on both grounds. Slot 9+ folds into "alte domenii" (kit §4).
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
  base,
  spec,
  thread = null,
  onKind,
  onMeasure,
}: {
  slices: BreakdownSlice[];
  other: { value: number; count: number };
  /** F3: every group of the level, for the kinds row, the order by records and the tags (absent from older answers). */
  base?: BreakdownGroup[] | undefined;
  spec: AskSpec;
  /** The levels above this one ("fir"): a deeper level carries them, so the strip can lead back. */
  thread?: Thread | null;
  /** The kinds row (final breakdown §3.7): a kind of purchase, asked again. */
  onKind?: (kind: PurchaseKind) => void;
  /** The legend's headers (final §3.8): the order by value or by records, on the groups already fetched. */
  onMeasure?: (measure: "value" | "count") => void;
}) {
  const t = useTip();
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const byCount = spec.measure === "count" && Boolean(base);
  // slice click: while the stem can go deeper, open the same breakdown one
  // CPV level down; at a full 8-digit code, open the transactions instead.
  const canDeepen = (code: string): boolean => code.length < 8;
  const sliceUrl = (code: string, name: string): string => {
    if (!canDeepen(code)) return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify({ cpvPrefixes:[code] }))}`;
    return threadHref(spec, code, deeperThread(thread, spec, code, name));
  };

  const total = slices.reduce((a, s) => a + s.value, 0) + other.value;
  if (total <= 0) return <p className="ask-empty">Niciun rezultat.</p>;
  // The groups shown and the rest (final §3.8–§3.9): by the order chosen, from every group when the answer has them.
  const shown = breakdownShown(slices, other, base, byCount, all);
  const measureTotal = byCount ? shown.total.count : shown.total.value;
  const amount = (s: { value: number; count: number }) => byCount ? s.count : s.value;
  const kinds = !spec.filters.purchaseKind && base && onKind ? breakdownKinds(base, byCount) : null;
  const items = [
    ...shown.groups.map((s, i) => ({
      // The catalogue writes ş/ţ; the answer says ș/ț, as the sentence does (data and CSV keep the catalogue's).
      name: s.name ? readableCpvName(s.name) : `CPV ${s.code}`,
      code: s.code as string | null,
      value: s.value,
      count: s.count,
      color: SEG_COLORS[i % SEG_COLORS.length]!,
      tags: [largestTag(s, shown.total.value), generalTag(s.code, spec.filters.cpvTerm ? String(spec.filters.cpvTerm) : null)].filter((tag): tag is RowFact => tag !== null),
    })),
    ...(amount(shown.rest) > 0
      ? [
          {
            name: shown.restGroups > 0 ? `alte ${countWords(shown.restGroups, "domeniu", "domenii")}` : "alte domenii",
            code: null as string | null,
            value: shown.rest.value,
            count: shown.rest.count,
            color: SEG_OTHER,
            tags: [] as RowFact[],
          },
        ]
      : []),
  ];
  return (
    <div>
      {t.el}
      {kinds && kinds.length > 1 && <div className="qb qb-kinds qb-tipwrap" role="group" aria-label="Tipul achiziției">
        {kinds.map((kind) => <button type="button" key={kind.kind} className="qb-kind" onClick={() => onKind!(kind.kind)}>
          {PURCHASE_KIND_WORDS[kind.kind].label} <b className="qb-num">{formatShare(kind.share)}</b>
        </button>)}
        <HelpTip tip={{ id: "tip-achizitie" }} />
      </div>}
      <div className="ask-comp">
        {items.map((s) => {
          const bind = t.bind(
            s.name,
            byCount ? countWords(s.count, "înregistrare", "înregistrări") : formatRon(s.value),
            `${byCount ? formatRon(s.value) : countWords(s.count, "înregistrare", "înregistrări")} · ${formatShare(amount(s) / measureTotal)} din total${s.code ? (canDeepen(s.code) ? " · click → structura subcategoriilor" : " · click → achizițiile categoriei") : ""}`,
          );
          return s.code ? (
            <a
              key={s.name}
              className="seg"
              href={sliceUrl(s.code, s.name)}
              style={{
                width: `${(amount(s) / measureTotal) * 100}%`,
                background: s.color,
              }}
              {...bind}
            />
          ) : (
            <div
              key={s.name}
              className="seg"
              style={{
                width: `${(amount(s) / measureTotal) * 100}%`,
                background: s.color,
              }}
              {...bind}
            />
          );
        })}
      </div>
      {/* The legend orders by value or by records (final §3.8): both are on every row. */}
      {base && onMeasure && <div className="qb qb-legend-head qb-tipwrap" role="group" aria-label="Ordonează domeniile">
        <span>{countWords(base.length, "domeniu", "domenii")}</span>
        <button type="button" className="qb-sort" aria-pressed={!byCount} onClick={() => onMeasure("value")}>Valoare{!byCount && <span aria-hidden="true"> ▾</span>}</button>
        <button type="button" className="qb-sort" aria-pressed={byCount} onClick={() => onMeasure("count")}>Înreg.{byCount && <span aria-hidden="true"> ▾</span>}</button>
        <HelpTip tip={{ title: "Înregistrări", text: "Un contract cu mai mulți câștigători apare o dată pentru fiecare, mai des la lucrări." }} />
      </div>}
      <div className="ask-complegend">
        {items.map((s) => (
          <div key={s.name} className="li qb-tipwrap">
            <span className="sw" style={{ background: s.color }} />
            <span className="nm">
              {s.code ? (
                <a href={sliceUrl(s.code, s.name)}>
                  {s.name}
                </a>
              ) : (
                s.name
              )}
              {s.tags.map((tag) => <FactTag key={tag.text} fact={tag} />)}
            </span>
            <span className="vv num">
              <span>{byCount ? `${countWords(s.count, "înregistrare", "înregistrări")} · ${formatRon(s.value)}` : formatRonFull(s.value)} · {formatShare(amount(s) / measureTotal)}</span>
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
                            excludeCpvPrefixes: shown.groups.map((item) => item.code),
                          },
                      `${s.name} · înregistrările categoriei`,
                    )
                  }
                >
                  {recordsWords(s.count)} →
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {shown.more > 0 && <div className="qb qb-listfoot"><button type="button" className="qb-more-btn" onClick={() => setAll(true)}>Arată toate</button></div>}
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
        "valoare totală (scară log)",
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
          `CRI ${formatDecimal(h.p.cri, 2)} · ${formatRon(h.p.value)}`,
          `${countWords(h.p.nFlags, "semnal", "semnale")} de risc · click → pagina entității`,
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
        aria-label="Risc vs valoare — densitate"
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
          <span className="dsw top" /> top valoare
        </span>
      </div>
      <details className="cq-calculation">
        <summary>
          Valorile exacte și sursele · {countWords(points.length, "profil reprezentat", "profiluri reprezentate")}
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
                <td>{formatDecimal(p.cri, 2)}</td>
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
          ? `Norul gri = toate cele ${countWords(density.total, "entitate", "entități")} cu min. 10 achiziții; punctele = cele notabile, click deschide înregistrările profilului.`
          : "Fiecare punct = o entitate (min. 10 achiziții) — click deschide înregistrările profilului."}{" "}
        Scroll = zoom · trage = pan · dublu-click = reset.
      </p>
    </div>
  );
}

/* sankey and network: SankeyAnswer.tsx and NetworkAnswer.tsx (F4, sankey-2 and network-2). */

/* ── entity card ──────────────────────────────────────────────────────── */

export function EntityCardBlock({ card, historical = true, spec }: { card: EntityCardData; historical?: boolean; spec?: QuestionSpec }) {
  const evidence = useAnswerEvidence();
  const band = card.cri !== null ? criBand(card.cri) : null;
  // A group of one (plan §4.13): no crown, the council and two other answers about it.
  const alone = spec ? leaderAlone(spec) : null;
  if (alone && spec) {
    const { peers, total } = leaderAloneSpecs(spec, card);
    return (
      <div className="qb qb-empty ask-alone">
        <p>{alone}</p>
        <h3><Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link></h3>
        <div className="qb-relax">
          <KitLink className="qb-relax-link" link={{ label: "Unde se situează față de celelalte", glyph: "›", href: askLink(peers) }} />
          <KitLink className="qb-relax-link" link={{ label: "Cât cumpără", glyph: "›", href: askLink(total) }} />
        </div>
      </div>
    );
  }
  // P7 on place 1 by value (F4, plan §4.13): its records, "Scoate din calcul" (the next one is crowned), its page.
  const records = evidence ? () => evidence.open(undefined, { entityIds: [card.entityId], role: card.role === "supplier" ? "supplier" : "authority" },
    `${cleanName(card.name)} · ${historical ? "înregistrările profilului" : "achizițiile selectate"}`) : undefined;
  const entity = { id: card.entityId, name: cleanName(card.name) };
  const actions = !historical && spec && evidence?.exclude
    ? entityRowActions(spec as AskSpec, entity, { ...(records ? { records } : {}), exclude: () => evidence.exclude!(entity, 0) }) : [];
  return (
    <div className="ask-ecard">
      {actions.length ? <div className="ask-ecard-head" data-qb-arow="">
        <h3><Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link></h3>
        <span className="qb cq-rank-menu"><RowMenu name={entity.name} actions={actions} /></span>
      </div> : <h3>
        <Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link>
      </h3>}
      <div className="badges">
        <span className="badge">
          {card.role === "authority" ? "Autoritate" : "Furnizor"}
        </span>
        {card.county && <span className="badge">{card.county}</span>}
        {card.population !== null && card.population > 0 && (
          <span className="badge">{countWords(card.population, "locuitor", "locuitori")}</span>
        )}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="v num">{formatRon(card.value)}</div>
          <div className="l">{historical ? "valoare înregistrată în profil" : "valoarea achizițiilor selectate"}</div>
        </div>
        <div className="kpi">
          <div className="v num">{formatInt(card.count)}</div>
          <div className="l">înregistrări</div>
        </div>
        {historical && <div className="kpi">
          <div className="v num risk">
            {card.cri !== null ? formatDecimal(card.cri, 2) : "—"}
          </div>
          <div className="l">indice risc{band ? ` · ${band.label}` : ""}</div>
        </div>}
        {historical && <div className="kpi">
          <div className="v num risk">{card.nFlags}</div>
          <div className="l">semnale</div>
        </div>}
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
              `${cleanName(card.name)} · ${historical ? "înregistrările profilului" : "achizițiile selectate"}`,
            )
          }
        >
          {card.count === 1 ? "Vezi înregistrarea →" : `Vezi cele ${recordsWords(card.count)} →`}
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
      {historical && <p className="ask-methnote">
        Indicele de risc (CRI) e un semnal statistic, nu o dovadă de neregulă —{" "}
        <Link href="/metodologie">cum se calculează</Link>.
      </p>}
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
              : <b>{recordsWords(fact.count)}</b>, în total{" "}
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
