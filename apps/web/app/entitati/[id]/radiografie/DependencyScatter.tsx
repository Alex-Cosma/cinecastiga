"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import { chartPace } from "@/components/motion/pace";
import type { DepRow } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { formatRon, formatInt } from "@/lib/format";
import { INITIAL_ZOOM, boundZoom, zoomAt, percent, yearRange, type Zoom } from "@/lib/radiografie-view";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import { pairSpec } from "@/lib/ask/site-links";
import SupplierTable from "./SupplierTable";
import { G } from "@/components/ghost/Ghost";
import { recordWords, sharePct } from "./supplier-words";

/** A fixed decorative scatter (never data): [share of the authority, share of the firm, size]. */
const GHOST_POINTS: readonly [number, number, number][] = [[.18, .94, 12], [.24, .9, 10], [.31, .95, 12], [.36, .95, 12], [.54, .95, 15], [.8, .95, 16],
    [.2, .52, 10], [.21, .36, 10], [.29, .24, 12], [.33, .2, 11], [.37, .14, 12]];

/**
 * The panel as the route's ghost draws it (owner, 6 November 2026: "ghost data loading"): its heading, the controls as
 * quiet inert replicas, the chart's grid and axes with a decorative scatter, and the chosen supplier's card.
 */
export function DependencyScatterGhost() {
    return <section className="rv-workspace" aria-hidden="true">
 <div className="rv-workspace-heading"><h2>Cât de strânsă este relația?</h2></div>
 <div className="rv-split"><div><div className="rv-dependency-chart">
 <div className="rv-zoom g-quiet" inert><span className="rv-limit"><select tabIndex={-1} defaultValue={12}><option value={12}>Primii 12 după valoare</option></select></span>
 <div><button type="button" tabIndex={-1} disabled>−</button><output>1×</output><button type="button" tabIndex={-1}>+</button><button type="button" tabIndex={-1}>Resetează</button></div></div>
 <div className="rv-viewport"><svg viewBox="0 0 700 370">
 {[0, .25, .5, .75, 1].map(t => <g key={t}><line className="rv-grid" x1={62} x2={675} y1={68 + t * 250} y2={68 + t * 250}/><text className="rv-axis" x={50} y={72 + t * 250} textAnchor="end">{percent(1 - t)}</text>
 <rect className="g-svg" x={62 + t * 613 - 14} y={333} width={28} height={10} rx={3}/></g>)}
 <text className="rv-chart-label" x={62} y={17}>Cât din câștigurile publice ale firmei vin de aici</text><text className="rv-axis" x={350} y={367} textAnchor="middle">Furnizorul în valoarea atribuită de autoritate</text>
 {GHOST_POINTS.map(([x, y, r], i) => <circle key={i} className="g-svg" cx={62 + x * 613} cy={68 + (1 - y) * 250} r={r}/>)}</svg></div></div></div>
 <aside className="rv-selection"><p className="rv-small"><G.Line w="42%"/></p><h3><G.Line w="76%"/></h3><dl>
 <div><dt>Valoare alocată <span className="term term-tip"><span className="term-trigger"><span className="term-mark">?</span></span></span></dt><dd><G.Line w="7ch"/><small><G.Line w="70%"/><G.Line w="40%" only="phone"/></small></dd></div>
 <div><dt>Din valoarea atribuită de autoritate</dt><dd><G.Line w="4ch"/></dd></div>
 <div><dt>Cât din câștigurile publice ale firmei vin de aici</dt><dd><G.Line w="4ch"/><small><G.Line w="84%"/><G.Line w="44%" only="phone"/></small></dd></div>
 <div><dt>Înregistrări în relație</dt><dd><G.Line w="3ch"/><small><G.Line w="36%"/></small></dd></div></dl>
 <button type="button" className="rv-primary g-quiet" tabIndex={-1} inert>Verifică relația în înregistrări</button>
 <div className="rv-details"><span className="rv-details-g">Context financiar și concurență</span></div></aside></div>
 </section>;
}

/** The site's --ease, cubic-bezier(.2,.7,.2,1), for the zoom tween: progress at time t (both 0..1). */
function ease(t: number): number {
    const bx = (u: number) => 3 * .2 * u * (1 - u) ** 2 + 3 * .2 * u * u * (1 - u) + u ** 3, by = (u: number) => 3 * .7 * u * (1 - u) ** 2 + 3 * u * u * (1 - u) + u ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (bx(mid) < t) lo = mid; else hi = mid; }
    return by((lo + hi) / 2);
}
/** --med: the zoom buttons' tween, at pace 1 (--chart-pace, components/motion/pace.ts). */
const GLIDE_MS = 260;

/**
 * One supplier's dot (charts in motion, owner 6 November 2026). Its entrance is fixed when it mounts: the chart's first
 * drawing fades the dots in place in the table's order, largest first ("cm-pt", staggered); the dots the 25-supplier
 * view adds fade in alone ("cm-in"); a dot that comes back into view while zooming or panning appears at once.
 */
function SupplierDot({ born, i, selected, cx, cy, r, label, onSelect, aria, title }: {
    born: "cm-pt" | "cm-in" | ""; i: number; selected: boolean; cx: number; cy: number; r: number; label: ReactNode;
    onSelect: () => void; aria: string; title: string;
}) {
    const [enter] = useState(born);
    return <g className={`rv-point ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-pressed={selected} aria-label={aria} onClick={onSelect} onKeyDown={(e: KeyboardEvent) => { if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            onSelect();
        } }}><circle className={enter || undefined} style={enter === "cm-pt" ? { "--i": i } as CSSProperties : undefined} cx={cx} cy={cy} r={r}/><title>{title}</title>{label}</g>;
}
/** The chosen supplier's name: at the first drawing it comes last, after the dots; a later choice shows it at once. */
function DotLabel({ first, x, y, children }: { first: boolean; x: number; y: number; children: ReactNode }) {
    const [enter] = useState(first);
    return <text className={enter ? "rv-point-label cm-fade cm-late" : "rv-point-label"} x={x} y={y}>{children}</text>;
}

/**
 * „Cât de strânsă este relația?” (owner, 2 November 2026): every supplier of the authority over both channels,
 * procedure contracts and direct acquisitions, with no threshold. The chart draws the 12 or 25 largest; the table
 * under it (SupplierTable) holds every one, and a row selects its supplier here, in the chart when it is drawn.
 */
export default function DependencyScatter({ rows, win, authorityName, authorityId, suppliers }: {
    rows: DepRow[];
    win: {
        from: number;
        to: number;
    };
    authorityName: string;
    authorityId: string;
    /** every supplier of the authority */
    suppliers: number;
}) {
    const [limit, setLimit] = useState(12), [selected, setSelected] = useState(rows[0]?.id ?? ""), [picked, setPicked] = useState<DepRow | null>(null), [sources, setSources] = useState(false);
    // `zoom` is where the view is going (the axis labels, the "×", the buttons and the count read it); `view` is where the
    // dots are drawn: the same, or on its way there while a button's or a key's zoom tweens (owner, 6 November 2026).
    const [zoom, setZoom] = useState(INITIAL_ZOOM), [view, setView] = useState(INITIAL_ZOOM);
    // The chart's first drawing is done: dots mounted later never replay the entrance. `fresh`: dots a larger view adds.
    const [drawn, setDrawn] = useState(false), [fresh, setFresh] = useState<ReadonlySet<string> | null>(null);
    const viewport = useRef<HTMLDivElement>(null), detail = useRef<HTMLElement>(null), zoomRef = useRef(zoom), viewRef = useRef(view), glideFrame = useRef(0);
    zoomRef.current = zoom;
    viewRef.current = view;
    useEffect(() => { setDrawn(true); return () => cancelAnimationFrame(glideFrame.current); }, []);
    useEffect(() => { if (fresh) setFresh(null); }, [fresh]);
    /** Wheel and drag: the dots follow the hand at once. */
    function jump(z: Zoom) { cancelAnimationFrame(glideFrame.current); zoomRef.current = viewRef.current = z; setZoom(z); setView(z); }
    /** Buttons and keys: the dots travel to the new zoom over --med (reduced motion: at once). The visible window's
     *  edges move in a straight line, so the point zoomed on stays where it is. */
    function glide(z: Zoom) {
        cancelAnimationFrame(glideFrame.current);
        zoomRef.current = z;
        setZoom(z);
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) { viewRef.current = z; setView(z); return; }
        const from = viewRef.current, start = performance.now(), length = GLIDE_MS * chartPace();
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / length), e = ease(t), w = 1 / from.k + (1 / z.k - 1 / from.k) * e;
            const at = t >= 1 ? z : { k: 1 / w, x: from.x + (z.x - from.x) * e, y: from.y + (z.y - from.y) * e };
            viewRef.current = at;
            setView(at);
            if (t < 1) glideFrame.current = requestAnimationFrame(step);
        };
        glideFrame.current = requestAnimationFrame(step);
    }
    /** The chart draws `n` suppliers; the ones it adds fade in where they are, the others stay put. */
    function showTop(n: number) { const before = new Set(rows.slice(0, limit).map(s => s.id)); setFresh(new Set(rows.slice(0, n).filter(s => !before.has(s.id)).map(s => s.id))); setLimit(n); }
    const drag = useRef<{
        id: number;
        cx: number;
        cy: number;
        x: number;
        y: number;
        w: number;
        h: number;
        moved: boolean;
    } | null>(null), suppressClick = useRef(0);
    const shown = useMemo(() => rows.slice(0, limit), [rows, limit]);
    // The selected supplier: one of the chart's, or one the table picked beyond them.
    const p = shown.find(s => s.id === selected) ?? (picked?.id === selected ? picked : null) ?? shown[0], inChart = !!p && shown.some(s => s.id === p.id);
    const maxX = Math.max(.02, ...shown.map(s => s.shareHere)) * 1.14;
    const at = (z: Zoom) => ({ X: (v: number) => 62 + (v / maxX - z.x) * z.k * 613, Y: (v: number) => 68 + (1 - v - z.y) * z.k * 250 });
    const inside = (z: Zoom) => { const { X, Y } = at(z); return shown.filter(s => X(s.shareHere) >= 61.99 && X(s.shareHere) <= 675.01 && Y(s.shareLife) >= 67.99 && Y(s.shareLife) <= 318.01); };
    const { X, Y } = at(view), R = (v: number) => Math.min(24, 5 + Math.sqrt(Math.max(0, v) / 1e6) * .25);
    // The dots drawn now (`view`); the count under the chart is the destination's (`zoom`), so no number runs through a tween.
    const points = inside(view), visible = view === zoom ? points.length : inside(zoom).length;
    function magnify(factor: number) { const z = zoomRef.current, x = Math.max(0, Math.min(1, ((p?.shareHere ?? maxX / 2) / maxX - z.x) * z.k)), y = Math.max(0, Math.min(1, (1 - (p?.shareLife ?? .5) - z.y) * z.k)); glide(zoomAt(z, factor, x, y)); }
    useEffect(() => { const el = viewport.current; if (!el)
        return; const wheel = (event: WheelEvent) => { if (!event.ctrlKey && !event.metaKey)
        return; event.preventDefault(); const b = el.getBoundingClientRect(); jump(zoomAt(viewRef.current, Math.exp(-event.deltaY * .003), Math.max(0, Math.min(1, ((event.clientX - b.left) / b.width * 700 - 62) / 613)), Math.max(0, Math.min(1, ((event.clientY - b.top) / b.height * 370 - 68) / 250)))); }; el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel); }, [shown.length]); // eslint-disable-line react-hooks/exhaustive-deps -- jump reads refs and setters only
    function select(row: DepRow) { if (Date.now() < suppressClick.current)
        return; setSelected(row.id); if (!rows.some(s => s.id === row.id)) setPicked(row); else if (!shown.some(s => s.id === row.id)) showTop(rows.length);
        // The details sit above the table: bring them into view when they are off screen.
        const box = detail.current?.getBoundingClientRect();
        if (box && (box.bottom < 80 || box.top > innerHeight - 80 || matchMedia("(max-width:760px)").matches)) {
            detail.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth" });
            detail.current?.focus({ preventScroll: true });
        } }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) { if (drag.current?.moved)
        suppressClick.current = Date.now() + 250; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); drag.current = null; }
    return <>
 {!p ? <div className="rv-empty"><h2>Niciun furnizor</h2><p>Autoritatea nu are furnizori identificați în contracte sau achiziții directe. Lipsa lor nu confirmă absența unei probleme.</p></div> : <>
 <section className="rv-workspace"><div className="rv-workspace-heading rv-tip"><h2>Cât de strânsă este relația? <Term tip id="grafic-dependenta" /></h2></div><div className="rv-split"><div><div className="rv-dependency-chart">
 <div className="rv-zoom">{/* Which suppliers the chart draws, in its own corner beside the zoom (owner, 4 November 2026). */}
 <span className="rv-limit rv-tip"><select aria-label="Furnizori în grafic" value={limit} onChange={e => { showTop(Number(e.target.value)); jump(INITIAL_ZOOM); }}><option value={12}>Primii 12 după valoare</option>{rows.length > 12 && <option value={25}>Primii {Math.min(25, rows.length)} după valoare</option>}</select><Term tip title="Furnizorii din grafic" text="Cei mai mari 12 sau 25 de furnizori ai autorității după valoare, contracte prin proceduri și achiziții directe. Tabelul de dedesubt îi are pe toți. Datele pot avea lacune." /></span>
 <div><button aria-label="Micșorează graficul" disabled={zoom.k <= 1} onClick={() => magnify(1 / 1.6)}>−</button><output aria-live="polite">{zoom.k.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}×</output><button aria-label="Mărește graficul" disabled={zoom.k >= 12} onClick={() => magnify(1.6)}>+</button><button onClick={() => glide(INITIAL_ZOOM)}>Resetează</button></div></div>
 <div ref={viewport} className="rv-viewport" data-chart="" tabIndex={0} role="group" aria-label="Grafic furnizori. Plus și minus pentru zoom, săgeți pentru deplasare, zero pentru resetare." onKeyDown={e => { if (e.target !== e.currentTarget)
            return; if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            const z = zoomRef.current;
            if (e.key === "0")
                glide(INITIAL_ZOOM);
            else if (["+", "=", "-"].includes(e.key))
                magnify(e.key === "-" ? 1 / 1.6 : 1.6);
            else
                glide(boundZoom({ ...z, x: z.x + (e.key === "ArrowRight" ? .12 : e.key === "ArrowLeft" ? -.12 : 0) / z.k, y: z.y + (e.key === "ArrowDown" ? .12 : e.key === "ArrowUp" ? -.12 : 0) / z.k }));
        } }} onPointerDown={e => { if (e.button !== 0)
            return; const b = e.currentTarget.getBoundingClientRect(); drag.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: viewRef.current.x, y: viewRef.current.y, w: b.width * 613 / 700, h: b.width * 250 / 700, moved: false }; }} onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId)
            return; const dx = e.clientX - d.cx, dy = e.clientY - d.cy; if (!d.moved && Math.hypot(dx, dy) < 5)
            return; d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); const v = viewRef.current; jump(boundZoom({ ...v, x: d.x - dx / d.w / v.k, y: d.y - dy / d.h / v.k })); }} onPointerUp={endDrag} onPointerCancel={endDrag}>
 <svg viewBox="0 0 700 370" role="group" aria-label={`Furnizorii ${authorityName}`}><defs><clipPath id="rv-supplier-clip"><rect x="37" y="43" width="663" height="300"/></clipPath></defs>
 {[0, .25, .5, .75, 1].map(t => <g key={t}><line className="rv-grid" x1={62} x2={675} y1={68 + t * 250} y2={68 + t * 250}/><text className="rv-axis" x={50} y={72 + t * 250} textAnchor="end">{percent(Math.max(0, 1 - zoom.y - t / zoom.k))}</text><text className="rv-axis" x={62 + t * 613} y={342} textAnchor="middle">{percent((zoom.x + t / zoom.k) * maxX)}</text></g>)}
 <text className="rv-chart-label" x={62} y={17}>Cât din câștigurile publice ale firmei vin de aici</text><text className="rv-axis" x={350} y={367} textAnchor="middle">Furnizorul în valoarea atribuită de autoritate</text><g clipPath="url(#rv-supplier-clip)">{points.map(s => <SupplierDot key={s.id} born={!drawn ? "cm-pt" : fresh?.has(s.id) ? "cm-in" : ""} i={shown.indexOf(s)} selected={p.id === s.id} cx={X(s.shareHere)} cy={Y(s.shareLife)} r={R(s.all)}
            aria={`${s.name}, ${sharePct(s.shareHere)} din autoritate, ${sharePct(s.shareLife)} din câștigurile publice ale firmei`} title={`${s.name} · ${sharePct(s.shareHere)} din autoritate · ${sharePct(s.shareLife)} din câștigurile publice ale firmei`} onSelect={() => select(s)}
            label={p.id === s.id && <DotLabel first={!drawn} x={Math.min(470, Math.max(62, X(s.shareHere) - 60))} y={Y(s.shareLife) > 258 ? Y(s.shareLife) - R(s.all) - 10 : Y(s.shareLife) + R(s.all) + 20}>{shortName(s.name).slice(0, 30)}</DotLabel>}/>)}</g></svg></div>
 {visible < shown.length && <p className="rv-small">{visible} din {shown.length} furnizori în zona vizibilă</p>}</div></div>
 <aside ref={detail} tabIndex={-1} className="rv-selection" aria-live="polite"><p className="rv-small">Relația · {yearRange(p.y0, p.y1)}{inChart ? "" : " · în afara graficului"}</p><h3><Link href={`/entitati/${p.id}`}>{shortName(p.name)}</Link></h3><dl>
 <div><dt>Valoare alocată <Term tip id="consortiu" /></dt><dd>{formatRon(p.all)}<small>{p.here > 0 && p.daHere > 0 ? `${formatRon(p.here)} contracte · ${formatRon(p.daHere)} achiziții directe` : p.here > 0 ? "doar contracte prin proceduri" : "doar achiziții directe"}</small></dd></div>
 <div><dt>Din valoarea atribuită de autoritate</dt><dd>{sharePct(p.shareHere)}</dd></div>
 <div><dt>Cât din câștigurile publice ale firmei vin de aici</dt><dd>{sharePct(p.shareLife)}{p.daTotal != null && <small>din {formatRon(p.total)}, cu achizițiile directe ({formatRon(p.daTotal)})</small>}</dd></div>
 <div><dt>Înregistrări în relație</dt><dd>{formatInt(p.n + p.nDa)}<small>{recordWords(p)}</small></dd></div></dl><button className="rv-primary" onClick={() => setSources(true)}>Verifică relația în înregistrări</button>
 {p.n > 0 && <details className="rv-details"><summary>Context financiar și concurență</summary><p>În {win.from}–{win.to}: {formatRon(p.cFrame + p.cPlain)} valoare alocată din contracte. Cifra de afaceri cumulată pentru anii acoperiți: {p.turnWin == null ? "necunoscută" : formatRon(p.turnWin)}; bilanț disponibil în {p.nyWin} din {p.yrs.length} ani.</p><p>Contractele simple sunt comparate cu anul semnării; acordurile-cadru ({formatRon(p.cFrame)}) cu până la patru ani. Execuția și recunoașterea veniturilor pot avea alte perioade.</p><p>Ofertant unic: {p.ns} din {p.nk} contracte cu date cunoscute; {Math.max(0, p.n - p.nk)} fără date. Câștiguri publice de la {p.nAuth} autorități.</p></details>}</aside></div></section>
 <SupplierTable authorityId={authorityId} suppliers={suppliers} maxValue={rows[0]?.all ?? 0} selectedId={p.id} onSelect={select}/></>}
 {sources && p && <EvidenceDrawer title={`Relația · ${p.name}`} spec={pairSpec({ id: authorityId, name: authorityName }, { id: p.id, name: p.name })} onClose={() => setSources(false)}/>}</>;
}
