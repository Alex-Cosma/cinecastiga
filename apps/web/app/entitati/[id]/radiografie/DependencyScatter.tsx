"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Term from "@/components/Term";
import type { DepRow } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { formatRon, formatInt } from "@/lib/format";
import { INITIAL_ZOOM, boundZoom, zoomAt, percent, yearRange } from "@/lib/radiografie-view";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
import { pairSpec } from "@/lib/ask/site-links";
import SupplierTable from "./SupplierTable";
import { recordWords, sharePct } from "./supplier-words";

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
    const [limit, setLimit] = useState(12), [selected, setSelected] = useState(rows[0]?.id ?? ""), [picked, setPicked] = useState<DepRow | null>(null), [zoom, setZoom] = useState(INITIAL_ZOOM), [sources, setSources] = useState(false);
    const viewport = useRef<HTMLDivElement>(null), detail = useRef<HTMLElement>(null), zoomRef = useRef(zoom);
    zoomRef.current = zoom;
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
    const X = (v: number) => 62 + (v / maxX - zoom.x) * zoom.k * 613, Y = (v: number) => 68 + (1 - v - zoom.y) * zoom.k * 250, R = (v: number) => Math.min(24, 5 + Math.sqrt(Math.max(0, v) / 1e6) * .25);
    const points = shown.filter(s => X(s.shareHere) >= 61.99 && X(s.shareHere) <= 675.01 && Y(s.shareLife) >= 67.99 && Y(s.shareLife) <= 318.01);
    function magnify(factor: number) { const x = Math.max(0, Math.min(1, ((p?.shareHere ?? maxX / 2) / maxX - zoom.x) * zoom.k)), y = Math.max(0, Math.min(1, (1 - (p?.shareLife ?? .5) - zoom.y) * zoom.k)); setZoom(zoomAt(zoom, factor, x, y)); }
    useEffect(() => { const el = viewport.current; if (!el)
        return; const wheel = (event: WheelEvent) => { if (!event.ctrlKey && !event.metaKey)
        return; event.preventDefault(); const b = el.getBoundingClientRect(); setZoom(z => zoomAt(z, Math.exp(-event.deltaY * .003), Math.max(0, Math.min(1, ((event.clientX - b.left) / b.width * 700 - 62) / 613)), Math.max(0, Math.min(1, ((event.clientY - b.top) / b.height * 370 - 68) / 250)))); }; el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel); }, [shown.length]);
    function select(row: DepRow) { if (Date.now() < suppressClick.current)
        return; setSelected(row.id); if (!rows.some(s => s.id === row.id)) setPicked(row); else if (!shown.some(s => s.id === row.id)) setLimit(rows.length);
        // The details sit above the table: bring them into view when they are off screen.
        const box = detail.current?.getBoundingClientRect();
        if (box && (box.bottom < 80 || box.top > innerHeight - 80 || matchMedia("(max-width:760px)").matches)) {
            detail.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth" });
            detail.current?.focus({ preventScroll: true });
        } }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) { if (drag.current?.moved)
        suppressClick.current = Date.now() + 250; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); drag.current = null; }
    return <><div className="rv-toolbar"><label><span className="rv-label-row rv-tip">În grafic <Term tip title="Furnizorii din grafic" text="Cei mai mari 12 sau 25 de furnizori ai autorității după valoare, contracte prin proceduri și achiziții directe. Tabelul de dedesubt îi are pe toți. Datele pot avea lacune." /></span><select aria-label="Furnizori în grafic" value={limit} onChange={e => { setLimit(Number(e.target.value)); setZoom(INITIAL_ZOOM); }}><option value={12}>Primii 12 după valoare</option>{rows.length > 12 && <option value={25}>Primii {Math.min(25, rows.length)} după valoare</option>}</select></label></div>
 {!p ? <div className="rv-empty"><h2>Niciun furnizor</h2><p>Autoritatea nu are furnizori identificați în contracte sau achiziții directe. Lipsa lor nu confirmă absența unei probleme.</p></div> : <>
 <section className="rv-workspace"><div className="rv-workspace-heading rv-tip"><h2>Cât de strânsă este relația? <Term tip id="grafic-dependenta" /></h2></div><div className="rv-split"><div><div className="rv-dependency-chart">
 <div className="rv-zoom"><div><button aria-label="Micșorează graficul" disabled={zoom.k <= 1} onClick={() => magnify(1 / 1.6)}>−</button><output aria-live="polite">{zoom.k.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}×</output><button aria-label="Mărește graficul" disabled={zoom.k >= 12} onClick={() => magnify(1.6)}>+</button><button onClick={() => setZoom(INITIAL_ZOOM)}>Resetează</button></div></div>
 <div ref={viewport} className="rv-viewport" tabIndex={0} role="group" aria-label="Grafic furnizori. Plus și minus pentru zoom, săgeți pentru deplasare, zero pentru resetare." onKeyDown={e => { if (e.target !== e.currentTarget)
            return; if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            if (e.key === "0")
                setZoom(INITIAL_ZOOM);
            else if (["+", "=", "-"].includes(e.key))
                magnify(e.key === "-" ? 1 / 1.6 : 1.6);
            else
                setZoom(z => boundZoom({ ...z, x: z.x + (e.key === "ArrowRight" ? .12 : e.key === "ArrowLeft" ? -.12 : 0) / z.k, y: z.y + (e.key === "ArrowDown" ? .12 : e.key === "ArrowUp" ? -.12 : 0) / z.k }));
        } }} onPointerDown={e => { if (e.button !== 0)
            return; const b = e.currentTarget.getBoundingClientRect(); drag.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: zoom.x, y: zoom.y, w: b.width * 613 / 700, h: b.width * 250 / 700, moved: false }; }} onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId)
            return; const dx = e.clientX - d.cx, dy = e.clientY - d.cy; if (!d.moved && Math.hypot(dx, dy) < 5)
            return; d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); setZoom(boundZoom({ ...zoomRef.current, x: d.x - dx / d.w / zoomRef.current.k, y: d.y - dy / d.h / zoomRef.current.k })); }} onPointerUp={endDrag} onPointerCancel={endDrag}>
 <svg viewBox="0 0 700 370" role="group" aria-label={`Furnizorii ${authorityName}`}><defs><clipPath id="rv-supplier-clip"><rect x="37" y="43" width="663" height="300"/></clipPath></defs>
 {[0, .25, .5, .75, 1].map(t => <g key={t}><line className="rv-grid" x1={62} x2={675} y1={68 + t * 250} y2={68 + t * 250}/><text className="rv-axis" x={50} y={72 + t * 250} textAnchor="end">{percent(Math.max(0, 1 - zoom.y - t / zoom.k))}</text><text className="rv-axis" x={62 + t * 613} y={342} textAnchor="middle">{percent((zoom.x + t / zoom.k) * maxX)}</text></g>)}
 <text className="rv-chart-label" x={62} y={17}>Autoritatea în portofoliul public al firmei</text><text className="rv-axis" x={350} y={367} textAnchor="middle">Furnizorul în valoarea atribuită de autoritate</text><g clipPath="url(#rv-supplier-clip)">{points.map(s => <g key={s.id} className={`rv-point ${p.id === s.id ? "selected" : ""}`} role="button" tabIndex={0} aria-pressed={p.id === s.id} aria-label={`${s.name}, ${sharePct(s.shareHere)} din autoritate, ${sharePct(s.shareLife)} din portofoliul public`} onClick={() => select(s)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            select(s);
        } }}><circle cx={X(s.shareHere)} cy={Y(s.shareLife)} r={R(s.all)}/><title>{`${s.name} · ${sharePct(s.shareHere)} din autoritate · ${sharePct(s.shareLife)} din portofoliul public`}</title>{p.id === s.id && <text className="rv-point-label" x={Math.min(470, Math.max(62, X(s.shareHere) - 60))} y={Y(s.shareLife) > 258 ? Y(s.shareLife) - R(s.all) - 10 : Y(s.shareLife) + R(s.all) + 20}>{shortName(s.name).slice(0, 30)}</text>}</g>)}</g></svg></div>
 {points.length < shown.length && <p className="rv-small">{points.length} din {shown.length} furnizori în zona vizibilă</p>}</div></div>
 <aside ref={detail} tabIndex={-1} className="rv-selection" aria-live="polite"><p className="rv-small">Relația · {yearRange(p.y0, p.y1)}{inChart ? "" : " · în afara graficului"}</p><h3><Link href={`/entitati/${p.id}`}>{shortName(p.name)}</Link></h3><dl>
 <div><dt>Valoare alocată <Term tip id="consortiu" /></dt><dd>{formatRon(p.all)}<small>{p.here > 0 && p.daHere > 0 ? `${formatRon(p.here)} contracte · ${formatRon(p.daHere)} achiziții directe` : p.here > 0 ? "doar contracte prin proceduri" : "doar achiziții directe"}</small></dd></div>
 <div><dt>Din valoarea atribuită de autoritate</dt><dd>{sharePct(p.shareHere)}</dd></div>
 <div><dt>Autoritatea în portofoliul public al firmei</dt><dd>{sharePct(p.shareLife)}{p.daTotal != null && <small>din {formatRon(p.total)}, cu achizițiile directe ({formatRon(p.daTotal)})</small>}</dd></div>
 <div><dt>Înregistrări în relație</dt><dd>{formatInt(p.n + p.nDa)}<small>{recordWords(p)}</small></dd></div></dl><button className="rv-primary" onClick={() => setSources(true)}>Verifică relația în înregistrări</button>
 {p.n > 0 && <details className="rv-details"><summary>Context financiar și concurență</summary><p>În {win.from}–{win.to}: {formatRon(p.cFrame + p.cPlain)} valoare alocată din contracte. Cifra de afaceri cumulată pentru anii acoperiți: {p.turnWin == null ? "necunoscută" : formatRon(p.turnWin)}; bilanț disponibil în {p.nyWin} din {p.yrs.length} ani.</p><p>Contractele simple sunt comparate cu anul semnării; acordurile-cadru ({formatRon(p.cFrame)}) cu până la patru ani. Execuția și recunoașterea veniturilor pot avea alte perioade.</p><p>Ofertant unic: {p.ns} din {p.nk} contracte cu date cunoscute; {Math.max(0, p.n - p.nk)} fără date. {p.nAuth} autorități în portofoliul public observat.</p></details>}</aside></div></section>
 <SupplierTable authorityId={authorityId} suppliers={suppliers} maxValue={rows[0]?.all ?? 0} selectedId={p.id} onSelect={select}/></>}
 {sources && p && <EvidenceDrawer title={`Relația · ${p.name}`} spec={pairSpec({ id: authorityId, name: authorityName }, { id: p.id, name: p.name })} onClose={() => setSources(false)}/>}</>;
}
