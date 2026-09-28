"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SliceRow } from "@/lib/radiografie";
import { DA_CEILING_ERAS } from "@seap/domain";
import { shortName, daysBetween } from "@/lib/radiografie-fmt";
import { formatRonFull, formatInt } from "@/lib/format";
import { sliceIncludes, rxDate } from "@/lib/radiografie-view";
import RadiografieSources from "./RadiografieSources";
export default function DaStrips({ rows, nSuppliers, authorityId }: {
    rows: SliceRow[];
    nSuppliers: number;
    authorityId: string;
}) {
    const [id, setId] = useState(rows[0]?.supplierId ?? ""), [history, setHistory] = useState(false), [sources, setSources] = useState(false), [width, setWidth] = useState(1000), [point, setPoint] = useState<SliceRow["points"][number] | null>(null), ref = useRef<HTMLDivElement>(null);
    useEffect(() => { const el = ref.current; if (!el)
        return; const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0)
        setWidth(Math.max(260, Math.round(entry.contentRect.width))); }); observer.observe(el); return () => observer.disconnect(); }, [rows.length]);
    const s = rows.find(r => r.supplierId === id) ?? rows[0];
    if (!s)
        return <div className="rv-empty"><h2>Niciun grup detectat după aceste criterii</h2><p>{formatInt(nSuppliers)} furnizori cu cel puțin trei achiziții directe. Datele necunoscute nu permit o concluzie.</p></div>;
    const members = s.points.filter(p => sliceIncludes(s, p)), pts = (history ? s.points : members).filter(p => Number.isFinite(Date.parse(p.d)) && Number.isFinite(p.v));
    const dates = pts.map(p => Date.parse(p.d)), start = Date.parse(s.d0), end = Date.parse(s.d1), day = 86400000;
    const t0 = history ? Math.min(start, ...dates) - 14 * day : start - 14 * day, t1 = history ? Math.max(end, ...dates) + 14 * day : end + 14 * day;
    const h = 220, l = 62, r = 24, t = 25, b = 45, max = Math.max(1, s.ceiling, ...pts.map(p => p.v), ...(history ? DA_CEILING_ERAS.filter(era => Date.parse(era.validFrom) < t1 && (!era.validTo || Date.parse(era.validTo) > t0)).map(era => s.purchaseType === "works" ? era.works : era.goodsServices) : [])) * 1.28;
    const X = (d: number) => l + (d - t0) / (t1 - t0) * (width - l - r), Y = (v: number) => t + (1 - v / max) * (h - t - b);
    const eras = DA_CEILING_ERAS.flatMap(era => { const a = Math.max(t0, Date.parse(era.validFrom)), z = Math.min(t1, era.validTo ? Date.parse(era.validTo) : t1); return z > a ? [{ a, z, v: s.purchaseType === "works" ? era.works : era.goodsServices }] : []; });
    const repeated = new Map<string, number>();
    return <><div className="rv-direct-toolbar"><div><h2>Achiziții apropiate în timp</h2><p>{rows.length} grupuri de verificat. Alege un furnizor și urmărește sursele.</p></div><label>Grup de achiziții<select value={s.supplierId} onChange={e => { setId(e.target.value); setHistory(false); setPoint(null); }}>{rows.map(r => <option key={r.supplierId} value={r.supplierId}>{shortName(r.supplierName)} · {r.n} achiziții</option>)}</select></label></div>
 <section className="rv-workspace rv-direct"><div className="rv-workspace-heading"><div><h2>{s.n} achiziții, {s.d0 === s.d1 ? "în aceeași zi" : `în ${daysBetween(s.d0, s.d1)} zile`}</h2><p><Link href={`/entitati/${s.supplierId}`} target="_blank" rel="noopener">{shortName(s.supplierName)}</Link> · {s.cpvName} · {rxDate(s.d0)}{s.d0 !== s.d1 && `–${rxDate(s.d1)}`}</p></div><button className="rv-quiet" onClick={() => { setHistory(!history); setPoint(null); }}>{history ? "Revino la intervalul de verificat" : "Vezi întregul istoric"}</button></div>
 <dl className="rv-direct-facts"><div><dt>Valoarea grupului în calcul</dt><dd>{s.sum.toLocaleString("ro-RO", {minimumFractionDigits:2,maximumFractionDigits:2})} lei</dd></div><div><dt>Plafon de referință</dt><dd>{formatRonFull(s.ceiling)}</dd></div><div><dt>Tip</dt><dd>{s.purchaseType === "works" ? "Lucrări" : s.purchaseType === "goods_services" ? "Produse / servicii" : "Necunoscut"}</dd></div></dl>
 <div ref={ref} className="rv-direct-chart"><svg viewBox={`0 0 ${width} ${h}`} role="group" aria-label={`Achizițiile ${s.supplierName} în timp`}><rect className="rv-band" x={X(start) - 5} y={t} width={Math.max(10, X(end) - X(start) + 10)} height={h - t - b}/>{[.25, .5, .75, 1].map(v => <g key={v}><line className="rv-grid" x1={l} x2={width - r} y1={Y(max * v)} y2={Y(max * v)}/><text className="rv-axis" x={l - 10} y={Y(max * v) + 4} textAnchor="end">{formatInt(max * v / 1000)} mii</text></g>)}
 {history ? eras.map((e, i) => <line key={i} className="rv-ceiling" x1={X(e.a)} x2={X(e.z)} y1={Y(e.v)} y2={Y(e.v)}/>) : <><line className="rv-ceiling" x1={l} x2={width - r} y1={Y(s.ceiling)} y2={Y(s.ceiling)}/><text className="rv-axis" textAnchor="end" x={width - r} y={Y(s.ceiling) - 8}>Plafon: {formatRonFull(s.ceiling)}</text></>}
 {[0, .25, .5, .75, 1].map(v => <text className="rv-axis" key={v} x={l + v * (width - l - r)} y={h - b + 25} textAnchor="middle">{history ? new Date(t0 + v * (t1 - t0)).toISOString().slice(0, 7) : rxDate(new Date(t0 + v * (t1 - t0)).toISOString()).slice(0, 5)}</text>)}
 {pts.map((p, i) => { const key = `${p.d}:${p.v}`, offset = repeated.get(key) ?? 0; repeated.set(key, offset + 1); return <circle key={p.id ?? i} className={`rv-da-point ${sliceIncludes(s, p) ? "included" : "context"}`} cx={X(Date.parse(p.d)) + offset * 7} cy={Y(p.v)} r={5} role="button" tabIndex={0} aria-label={`${rxDate(p.d)} · ${formatRonFull(p.v)} · ${sliceIncludes(s, p) ? "în grup" : "context"}`} onClick={() => setPoint(p)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        setPoint(p);
    } }}><title>{`${rxDate(p.d)} · ${formatRonFull(p.v)} · ${p.cpvName}`}</title></circle>; })}<text className="rv-axis" x={width / 2} y={h - 4} textAnchor="middle">Data finalizării</text></svg></div>
 {point && <div className="rv-point-detail" aria-live="polite"><p><strong>{formatRonFull(point.v)}</strong> · {rxDate(point.d)} · {point.cpvName}<br />{sliceIncludes(s, point) ? "Inclusă în grupul evidențiat." : "Context: nu este inclusă în suma grupului."} {point.ceiling == null ? "Plafon necunoscut." : `Plafon aplicabil: ${formatRonFull(point.ceiling)} (${point.referenceDate}).`}</p>{point.id && <Link className="rv-button" href={`/achizitii/${point.id}`} target="_blank" rel="noopener">Deschide achiziția</Link>}</div>}
 <div className="rv-source-bar"><p>Banda aurie arată intervalul detectat. Selectează un punct pentru detalii.<br /><span>Suma peste plafon este o pistă de verificare, nu o concluzie juridică.</span></p><button className="rv-primary" onClick={() => setSources(true)}>Verifică cele {s.n} surse</button></div></section>
 <details className="rv-details"><summary>Cum este construit grupul și ce limite are?</summary><p>Cel puțin trei achiziții din aceeași clasă CPV și de același tip, în cel mult 60 de zile. Fiecare este strict sub plafonul aplicabil, iar suma depășește cel mai mare plafon al grupului. Publicarea aproximează inițierea; în lipsa ei se folosește finalizarea. Graficul poziționează achizițiile după finalizare.</p><p>{s.typeInferredCount ?? 0} tipuri deduse din CPV; {s.dateFallbackCount ?? 0} date înlocuite cu finalizarea. Istoricul include și achiziții din alte clase CPV: punctele estompate sunt context. Linia punctată urmărește schimbările plafoanelor în timp. Valorile sunt fără TVA.</p><p>Legea privește necesarul estimat; aici comparăm valori de închidere. Punctele identice sunt decalate pentru selecție. Sursele reconstituie exact înregistrările actuale și semnalează diferențele față de calculul inițial.</p></details>
 {members.length !== s.n && <p role="status" className="rv-note">Graficul conține {members.length} înregistrări identificabile pentru cele {s.n} din calcul. Verifică lista surselor actuale înainte de citare.</p>}<p className="rv-note">Ceilalți {Math.max(0, nSuppliers - rows.length)} furnizori cu cel puțin trei achiziții: fără grup detectat după aceste criterii. Aceasta nu confirmă absența unei probleme.</p>
 {sources && <RadiografieSources authorityId={authorityId} supplierId={s.supplierId} onClose={() => setSources(false)}/>}</>;
}
