"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DepRow } from "@/lib/radiografie";
import { shortName } from "@/lib/radiografie-fmt";
import { formatRon, formatInt } from "@/lib/format";
import { INITIAL_ZOOM, boundZoom, zoomAt, fold, percent } from "@/lib/radiografie-view";
import EvidenceDrawer from "@/app/intreaba/EvidenceDrawer";
export default function DependencyScatter({ rows, win, authorityName, authorityId, floor }: {
    rows: DepRow[];
    win: {
        from: number;
        to: number;
    };
    authorityName: string;
    authorityId: string;
    floor: number;
}) {
    const [query, setQuery] = useState(""), [limit, setLimit] = useState(12), [selected, setSelected] = useState(rows[0]?.id ?? ""), [zoom, setZoom] = useState(INITIAL_ZOOM), [sources, setSources] = useState(false), [tablePage, setTablePage] = useState(0);
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
    const shown = useMemo(() => rows.filter(s => fold(s.name).includes(fold(query))).slice(0, limit), [rows, query, limit]);
    const p = shown.find(s => s.id === selected) ?? shown[0], maxX = Math.max(.02, ...shown.map(s => s.shareHere)) * 1.14;
    const X = (v: number) => 62 + (v / maxX - zoom.x) * zoom.k * 613, Y = (v: number) => 68 + (1 - v - zoom.y) * zoom.k * 250, R = (v: number) => Math.min(24, 5 + Math.sqrt(Math.max(0, v) / 1e6) * .25);
    const points = shown.filter(s => X(s.shareHere) >= 61.99 && X(s.shareHere) <= 675.01 && Y(s.shareLife) >= 67.99 && Y(s.shareLife) <= 318.01);
    function magnify(factor: number) { const x = Math.max(0, Math.min(1, ((p?.shareHere ?? maxX / 2) / maxX - zoom.x) * zoom.k)), y = Math.max(0, Math.min(1, (1 - (p?.shareLife ?? .5) - zoom.y) * zoom.k)); setZoom(zoomAt(zoom, factor, x, y)); }
    useEffect(() => { const el = viewport.current; if (!el)
        return; const wheel = (event: WheelEvent) => { if (!event.ctrlKey && !event.metaKey)
        return; event.preventDefault(); const b = el.getBoundingClientRect(); setZoom(z => zoomAt(z, Math.exp(-event.deltaY * .003), Math.max(0, Math.min(1, ((event.clientX - b.left) / b.width * 700 - 62) / 613)), Math.max(0, Math.min(1, ((event.clientY - b.top) / b.height * 370 - 68) / 250)))); }; el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel); }, [shown.length]);
    function select(id: string) { if (Date.now() < suppressClick.current)
        return; setSelected(id); if (matchMedia("(max-width:760px)").matches) {
        detail.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth" });
        detail.current?.focus({ preventScroll: true });
    } }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) { if (drag.current?.moved)
        suppressClick.current = Date.now() + 250; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); drag.current = null; }
    const page = Math.min(tablePage, Math.max(0, Math.ceil(shown.length / 10) - 1));
    return <><div className="rv-toolbar"><label>Caută un furnizor<input type="search" value={query} placeholder="Nume de firmă…" onChange={e => { setQuery(e.target.value); setZoom(INITIAL_ZOOM); setTablePage(0); }}/></label><label>Furnizori afișați<select value={limit} onChange={e => { setLimit(Number(e.target.value)); setZoom(INITIAL_ZOOM); setTablePage(0); }}><option value={12}>Primii 12 după valoare</option><option value={25}>Primii 25 după valoare</option><option value={150}>Toți cei {rows.length} din selecție</option></select></label></div>
 {!p ? <div className="rv-empty"><h2>{rows.length ? "Niciun furnizor găsit" : "Niciun furnizor peste pragul de afișare"}</h2><p>Prag: {formatRon(floor)}. Lipsa din selecție nu confirmă absența unei probleme.</p>{query && <button onClick={() => setQuery("")}>Șterge căutarea</button>}</div> : <>
 <section className="rv-workspace"><div className="rv-workspace-heading"><h2>Cât de strânsă este relația?</h2><p>Selectează un furnizor. Valorile și sursele rămân alături de grafic.</p></div><div className="rv-split"><div><div className="rv-dependency-chart">
 <div className="rv-zoom"><span>Explorează graficul</span><div><button aria-label="Micșorează graficul" disabled={zoom.k <= 1} onClick={() => magnify(1 / 1.6)}>−</button><output aria-live="polite">{zoom.k.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}×</output><button aria-label="Mărește graficul" disabled={zoom.k >= 12} onClick={() => magnify(1.6)}>+</button><button onClick={() => setZoom(INITIAL_ZOOM)}>Resetează</button></div></div>
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
 <text className="rv-chart-label" x={62} y={17}>Autoritatea în contractele publice ale firmei</text><text className="rv-axis" x={350} y={367} textAnchor="middle">Furnizorul în valoarea contractelor autorității</text><g clipPath="url(#rv-supplier-clip)">{points.map(s => <g key={s.id} className={`rv-point ${p.id === s.id ? "selected" : ""}`} role="button" tabIndex={0} aria-pressed={p.id === s.id} aria-label={`${s.name}, ${percent(s.shareLife)} din portofoliul public`} onClick={() => select(s.id)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            select(s.id);
        } }}><circle cx={X(s.shareHere)} cy={Y(s.shareLife)} r={R(s.here)}/><title>{`${s.name} · ${percent(s.shareHere)} din autoritate · ${percent(s.shareLife)} din portofoliul public`}</title>{p.id === s.id && <text className="rv-point-label" x={Math.min(470, Math.max(62, X(s.shareHere) - 60))} y={Y(s.shareLife) > 258 ? Y(s.shareLife) - R(s.here) - 10 : Y(s.shareLife) + R(s.here) + 20}>{shortName(s.name).slice(0, 30)}</text>}</g>)}</g></svg></div>
 <p className="rv-small">Ctrl / ⌘ + scroll pentru zoom · trage pentru deplasare · click pentru detalii</p><p className="rv-small">{points.length} din {shown.length} furnizori în zona vizibilă. Mărimea cercului indică valoarea alocată.</p><p className="rv-note">Axa verticală privește contractele publice observate. Un procent mare nu înseamnă că firma nu are clienți privați.</p></div>
 <div className="rv-supplier-mobile"><p className="rv-small">Procentul arată ponderea acestei autorități în contractele publice ale firmei.</p>{shown.map(s => <button key={s.id} aria-pressed={p.id === s.id} onClick={() => select(s.id)}><span>{shortName(s.name)}<small>{formatRon(s.here)} alocați</small></span><strong>{percent(s.shareLife)}</strong></button>)}</div></div>
 <aside ref={detail} tabIndex={-1} className="rv-selection" aria-live="polite"><p className="rv-small">Contracte în relație · {p.y0}–{p.y1}</p><h3><Link href={`/entitati/${p.id}`} target="_blank" rel="noopener">{shortName(p.name)}</Link></h3><dl><div><dt>Valoare alocată din contracte</dt><dd>{formatRon(p.here)}</dd></div><div><dt>Din valoarea contractelor autorității</dt><dd>{percent(p.shareHere)}</dd></div><div><dt>Autoritatea în portofoliul public al firmei</dt><dd>{percent(p.shareLife)}</dd></div><div><dt>Contracte în relație</dt><dd>{formatInt(p.n)}</dd></div></dl><p className="rv-small">Cotele asocierilor sunt estimate prin împărțire egală când participația reală nu este cunoscută. Valorile nu sunt plăți.</p><button className="rv-primary" onClick={() => setSources(true)}>Verifică relația în contracte</button>
 <details className="rv-details"><summary>Context financiar și concurență</summary><p>În {win.from}–{win.to}: {formatRon(p.cFrame + p.cPlain)} valoare alocată. Cifra de afaceri cumulată pentru anii acoperiți: {p.turnWin == null ? "necunoscută" : formatRon(p.turnWin)}; bilanț disponibil în {p.nyWin} din {p.yrs.length} ani.</p><p>Contractele simple sunt comparate cu anul semnării; acordurile-cadru ({formatRon(p.cFrame)}) cu până la patru ani. Execuția și recunoașterea veniturilor pot avea alte perioade.</p><p>Ofertant unic: {p.ns} din {p.nk} contracte cu date cunoscute; {Math.max(0, p.n - p.nk)} fără date. {p.nAuth} autorități în portofoliul public observat.</p></details></aside></div></section>
 <div className="rv-ranking"><h2>Aceeași relație, în cifre</h2><div className="rv-table-scroll" tabIndex={0} role="region" aria-label="Indicatorii furnizorilor"><table><thead><tr><th>Furnizor</th><th>Valoare alocată</th><th>Din autoritate</th><th>Autoritatea în portofoliul public</th></tr></thead><tbody>{shown.slice(page * 10, page * 10 + 10).map(s => <tr key={s.id} className={p.id === s.id ? "selected" : ""}><td><button onClick={() => select(s.id)}>{shortName(s.name)}</button></td><td>{formatRon(s.here)}</td><td>{percent(s.shareHere)}</td><td>{percent(s.shareLife)}</td></tr>)}</tbody></table></div><nav className="rv-pager" aria-label="Paginarea furnizorilor"><button disabled={page === 0} onClick={() => setTablePage(page - 1)}>Anterior</button><span>Pagina {page + 1} din {Math.max(1, Math.ceil(shown.length / 10))}</span><button disabled={(page + 1) * 10 >= shown.length} onClick={() => setTablePage(page + 1)}>Următor</button></nav></div></>}
 <p className="rv-note">Selecția include cel mult 150 de furnizori cu valoare alocată de cel puțin {formatRon(floor)}. Întregul istoric disponibil; datele pot avea lacune.</p>
 {sources && p && <EvidenceDrawer title={`Contractele relației · ${p.name}`} spec={{ block: "fact_check", dataset: "contracts", measure: "value", filters: { authorityId: Number(authorityId), supplierId: Number(p.id) } }} onClose={() => setSources(false)}/>}</>;
}
