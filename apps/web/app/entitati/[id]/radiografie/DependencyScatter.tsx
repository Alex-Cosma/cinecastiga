"use client";

import { useEffect, useRef, useState } from "react";
import type { DepRow } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { useRxTip, fmtM, pct } from "./RxTip";

const W = 2320,
  H = 1200,
  M = { l: 110, r: 60, t: 60, b: 110 };
const XMIN = Math.log10(0.0007),
  XMAX = Math.log10(0.1);
const X = (v: number) => M.l + ((Math.log10(Math.max(v, 0.0007)) - XMIN) / (XMAX - XMIN)) * (W - M.l - M.r);
const Y = (v: number) => M.t + ((1.04 - v) / 1.08) * (H - M.t - M.b);
const R = (v: number) => 6 + Math.sqrt(v / 1e6) * 3.2;
// Theme colours read from the CSS tokens at draw time so the canvas follows
// light/dark like the rest of the page.
const C = { red: "#c0311c", gold: "#a86f12", slate: "#6d7a90", ink: "#11161f", muted: "#5d6879", grid: "#dfe3ea", surface: "#ffffff", accent: "#11161f" };
function syncTheme() {
  if (typeof window === "undefined") return;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  C.red = v("--risk", C.red); C.gold = v("--amber", C.gold); C.slate = v("--slate", C.slate);
  C.ink = v("--ink", C.ink); C.muted = v("--muted", C.muted); C.grid = v("--line", C.grid);
  C.surface = v("--surface", C.surface); C.accent = v("--ink", C.accent);
}

function colorOf(p: DepRow): string | null {
  if (p.ratio == null) return null;
  return p.ratio > 2 ? C.red : p.ratio >= 0.7 ? C.gold : C.slate;
}

/**
 * "Cine trăiește din primărie?" — every supplier over the floor as a bubble:
 * x = share of the authority's contract spend (log), y = share of the firm's
 * whole SEAP life, size = lei here, colour = contracted ÷ invoiced over the
 * years the contracts cover.
 */
export default function DependencyScatter({ rows, win, authorityName }: { rows: DepRow[]; win: { from: number; to: number }; authorityName: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const tip = useRxTip();
  useEffect(() => {
    const on = () => setThemeTick((t) => t + 1);
    window.addEventListener("themechange", on);
    return () => window.removeEventListener("themechange", on);
  }, []);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<{ go: string; supplierId?: string }>).detail;
      if (d.go === "dep" && d.supplierId) setHl(d.supplierId);
    };
    window.addEventListener("rx-focus", onFocus);
    return () => window.removeEventListener("rx-focus", onFocus);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    syncTheme();
    ctx.clearRect(0, 0, W, H);
    const font = "IBM Plex Sans, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 2;
    ctx.fillStyle = C.muted;
    ctx.font = `22px ${font}`;
    ctx.textAlign = "center";
    for (const v of [0.001, 0.003, 0.01, 0.03, 0.1]) {
      const x = X(v);
      ctx.beginPath();
      ctx.moveTo(x, M.t);
      ctx.lineTo(x, H - M.b);
      ctx.stroke();
      ctx.fillText(pct(v), x, H - M.b + 34);
    }
    ctx.textAlign = "right";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(M.l, y);
      ctx.lineTo(W - M.r, y);
      ctx.stroke();
      ctx.fillText(pct(v), M.l - 14, y + 8);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = C.ink;
    ctx.font = `600 22px ${font}`;
    ctx.fillText("din tot ce a cheltuit autoritatea →", (M.l + W - M.r) / 2, H - M.b + 78);
    ctx.save();
    ctx.translate(34, (M.t + H - M.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("din tot ce a câștigat firma pe SEAP →", 0, 0);
    ctx.restore();
    ctx.font = `italic 20px ${font}`;
    ctx.fillStyle = C.muted;
    ctx.globalAlpha = 0.6;
    ctx.textAlign = "left";
    ctx.fillText("trăiesc din această autoritate", M.l + 16, M.t + 30);
    ctx.textAlign = "right";
    ctx.fillText("capturați reciproc", W - M.r - 16, M.t + 30);
    ctx.fillText("furnizori mari, clienți mulți", W - M.r - 16, H - M.b - 16);
    ctx.textAlign = "left";
    ctx.fillText("ocazionali", M.l + 16, H - M.b - 16);
    ctx.globalAlpha = 1;

    const order = [...rows].sort((a, b) => b.here - a.here);
    for (const p of order) {
      const x = X(p.shareHere),
        y = Y(p.shareLife),
        r = R(p.here),
        c = colorOf(p);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (c) {
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.82;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = C.surface;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = C.slate;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (hl === p.id) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }
    // labels: top five by value, the highly dependent, the highlighted; no collisions
    ctx.font = `600 19px ${font}`;
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    const top5 = order.slice(0, 5);
    const cand = rows
      .filter((p) => top5.includes(p) || (p.shareLife > 0.75 && p.here > 30e6) || hl === p.id)
      .sort((a, b) => Number(hl === b.id) - Number(hl === a.id) || b.here - a.here);
    const placed: { x: number; y: number; w: number }[] = [];
    for (const p of cand) {
      const n = shortName(p.name).slice(0, 24);
      const w = ctx.measureText(n).width;
      let x = X(p.shareHere) + R(p.here) + 6;
      const y = Y(p.shareLife) + 6;
      if (x + w > W - 12) x = X(p.shareHere) - R(p.here) - 6 - w;
      if (hl !== p.id && placed.some((q) => Math.abs(q.y - y) < 26 && x < q.x + q.w + 10 && x + w > q.x - 10)) continue;
      placed.push({ x, y, w });
      ctx.strokeStyle = C.surface;
      ctx.lineWidth = 6;
      ctx.strokeText(n, x, y);
      ctx.fillText(n, x, y);
    }
  }, [rows, hl, themeTick]);

  const locate = (e: React.MouseEvent): DepRow | null => {
    const cv = ref.current;
    if (!cv) return null;
    const b = cv.getBoundingClientRect();
    const mx = ((e.clientX - b.left) * W) / b.width,
      my = ((e.clientY - b.top) * H) / b.height;
    let best: DepRow | null = null,
      bd = 1e9;
    for (const p of rows) {
      const d = Math.hypot(X(p.shareHere) - mx, Y(p.shareLife) - my) - R(p.here);
      if (d < bd && d < 12) {
        bd = d;
        best = p;
      }
    }
    return best;
  };

  const card = (p: DepRow) => {
    const cls = p.ratio == null ? "s" : p.ratio > 2 ? "r" : p.ratio >= 0.7 ? "g" : "s";
    const c = p.cFrame + p.cPlain;
    const mx = Math.max(c, p.turnWin ?? 0) || 1;
    const y0 = p.yrs[0],
      y1 = p.yrs[p.yrs.length - 1];
    return (
      <>
        <div className="hd">
          <b>{shortName(p.name)}</b>
          <small>
            {p.county ?? ""}
            {p.foreign ? " · străin" : ""}
          </small>
        </div>
        <div className="two">
          <div className="g">
            <div className="l">
              <span>din cheltuiala autorității</span>
              <b>{pct(p.shareHere)}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, (p.shareHere * 100) / 0.1)}%` }} />
            </div>
          </div>
          <div className="g">
            <div className="l">
              <span>din tot ce a câștigat pe SEAP</span>
              <b>{pct(p.shareLife)}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.round(p.shareLife * 100)}%` }} />
            </div>
          </div>
        </div>
        <div className="foot num">
          {fmtM(p.here)} lei de aici · {p.n} contracte · {p.nAuth} {p.nAuth === 1 ? "client" : "clienți"} în total
        </div>
        <div className="sep" />
        <div className="cap">
          <div className="l" style={{ opacity: 0.75 }}>
            <span>
              contracte semnate {win.from}–{win.to}
            </span>
            <span />
            <span className="num">{c ? fmtM(c) : "—"}</span>
          </div>
          <div className="l">
            <span>valoare contractată</span>
            <div className="bar">
              <i style={{ width: `${Math.round((c / mx) * 100)}%` }} />
            </div>
            <b className="num">{c ? fmtM(c) : "—"}</b>
          </div>
          <div className="l">
            <span>încasat {y0 != null ? `${y0}–${y1}` : ""}</span>
            <div className="bar">
              <i style={{ width: `${Math.round(((p.turnWin ?? 0) / mx) * 100)}%`, opacity: 0.45 }} />
            </div>
            <b className="num">{p.turnWin ? fmtM(p.turnWin) : "—"}</b>
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {p.ratio != null ? (
              <>
                contractează <b>{p.ratio.toFixed(1).replace(".", ",")}×</b> cât încasează
                <span className={`chip ${cls}`}>{p.ratio > 2 ? "peste 2×" : p.ratio >= 0.7 ? "0,7–2×" : "sub 0,7×"}</span>
              </>
            ) : c > 0 ? (
              "fără bilanț pe anii acoperiți"
            ) : (
              `fără contracte semnate în ${win.from}–${win.to}`
            )}
          </div>
          {c > 0 && (
            <div style={{ fontSize: 10.5, opacity: 0.65, marginTop: 3 }}>
              {p.cFrame
                ? p.cPlain
                  ? `din care acorduri-cadru ${fmtM(p.cFrame)}, plafon pe până la 4 ani`
                  : "toate acorduri-cadru: valoarea e un plafon pe până la 4 ani, comparat cu încasările din acei ani"
                : "contracte simple, comparate cu încasările din anul semnării"}
              {p.nyWin < p.yrs.length ? ` · bilanț pe ${p.nyWin} din ${p.yrs.length} ani` : ""}
            </div>
          )}
        </div>
        <div className="sep" />
        <div className="foot num">
          ofertant unic: {p.nk ? `${p.ns} din ${p.nk} cunoscute` : "—"}
          {p.n - p.nk ? ` · ${p.n - p.nk} nepublicate` : ""}
        </div>
        <div className="act">click → profil</div>
      </>
    );
  };

  return (
    <div className="rx-panel" id="rx-dep">
      <canvas
        ref={ref}
        width={W}
        height={H}
        className="rx-canvas"
        aria-label={`Furnizorii ${authorityName}: dependență reciprocă`}
        onMouseMove={(e) => {
          const p = locate(e);
          (e.currentTarget as HTMLCanvasElement).style.cursor = p ? "pointer" : "default";
          if (p) tip.show(card(p), e, true);
          else tip.hide();
        }}
        onMouseLeave={tip.hide}
        onClick={(e) => {
          const p = locate(e);
          if (p) window.open(`/entitati/${p.id}`, "_blank");
        }}
      />
      <div className="rx-legend">
        <span>
          <i className="sw" style={{ background: C.red }} /> contractează peste 2× cât încasează
        </span>
        <span>
          <i className="sw" style={{ background: C.gold }} /> 0,7–2×
        </span>
        <span>
          <i className="sw" style={{ background: C.slate }} /> sub 0,7×
        </span>
        <span>
          <i className="sw" style={{ borderColor: C.slate }} /> fără bilanț sau fără contracte {win.from}–{win.to}
        </span>
        <span>mărime = lei de aici · click → profil</span>
      </div>
      {tip.el}
    </div>
  );
}
