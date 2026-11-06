"use client";

import Link from "next/link";
import { G } from "@/components/ghost/Ghost";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import EntityName from "@/components/EntityName";
import { entityHref } from "@/lib/entity-href";
import type { MapUatResponse } from "@/lib/map-capita-shared";
import { useEntrance } from "./motion";

/*
 * The UAT's panel on /harta (owner, 6 November 2026, "Povestea în trei întrebări"): a sentence with the verdict, then
 * "Cât?" (its years against the county's), "Pe ce?" (its CPV divisions) and "Cui?" (its largest suppliers), each with
 * its conclusion written out, and its neighbours in the county underneath. Every firm's name and the UAT's own name
 * link to their pages (owner: the commune's name opens its town hall). Values are contracted, not payments.
 *
 * Motion (DESIGN.md "Charts in motion"): each chart enters with its section (harta.css --mx-sec) — the years' bars
 * grow from the baseline left to right and the county's average follows each, the rows' bars grow to the right, the
 * neighbours appear where they are and this UAT's ring comes last; never from the ghost's shapes. Another UAT
 * re-enters (the body is keyed by UAT); another filter for the same UAT moves the marks to the new values.
 */

const int = (n: number) => Math.round(n).toLocaleString("ro-RO");
function short(value: number): string {
  const f = (n: number, d: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (value >= 1e9) return `${f(value / 1e9, 1)} mld.`;
  if (value >= 1e6) return `${f(value / 1e6, value >= 1e8 ? 0 : 1)} mil.`;
  if (value >= 1e3) return `${f(value / 1e3, 0)} mii`;
  return f(value, 0);
}
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const ordinal = (n: number) => (n === 1 ? "primul" : `al ${n}-lea`);
const withDe = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${int(n)}${n % 100 === 0 || n % 100 >= 20 ? " de" : ""} ${many}`);
/** "de 2,8 ori media județului", "cu 20% peste media județului", "la 60% din media județului", "aproape de media județului". */
function versus(value: number, county: number | null): string | null {
  if (county === null || county <= 0) return null;
  const r = value / county;
  if (r >= 1.5) return `de ${r.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ori media județului`;
  if (r >= 1.1) return `cu ${Math.round((r - 1) * 100)}% peste media județului`;
  if (r <= 0.9) return `la ${Math.round(r * 100)}% din media județului`;
  return "aproape de media județului";
}

function Years({ years }: { years: MapUatResponse["years"] }) {
  const max = Math.max(1, ...years.flatMap((y) => [y.perCapita ?? 0, y.countyPerCapita ?? 0]));
  const peak = years.reduce((a, y) => ((y.perCapita ?? 0) > (a?.perCapita ?? 0) ? y : a), years[0]);
  const W = 260, H = 96, bw = W / Math.max(1, years.length);
  const now = new Date().getFullYear();
  const motion = useEntrance("", years.map((y) => y.year));
  return <svg className="mx-p-years" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`Lei pe locuitor pe ani: ${years.map((y) => `${y.year} ${y.perCapita === null ? "fără cifră" : int(y.perCapita)}`).join(", ")}.`}
    data-chart="" onAnimationEnd={motion.onAnimationEnd}>
    {years.map((y, i) => {
      const h = ((y.perCapita ?? 0) / max) * (H - 4), x = i * bw + bw * 0.16, cy = y.countyPerCapita === null ? null : H - (y.countyPerCapita / max) * (H - 4);
      const cls = `${y === peak && (y.perCapita ?? 0) > 0 ? " is-peak" : ""}${y.selected ? "" : " is-out"}${Number(y.year) >= now ? " is-current" : ""}`;
      return <g key={y.year}>
        <rect className={`mx-p-bar${cls} ${motion.mark(y.year, "cm-y")}`} style={{ "--i": i } as CSSProperties} x={x} y={H - h} width={bw * 0.68} height={Math.max(h, 0)} rx="1.5"><title>{`${y.year}: ${y.perCapita === null ? "fără cifră" : `${int(y.perCapita)} lei pe locuitor`}${y.countyPerCapita === null ? "" : ` · județul ${int(y.countyPerCapita)}`}`}</title></rect>
        {/* At its height by a transform, so another filter moves it with the bars. */}
        {cy !== null && <line className={`mx-p-avg cm-tw ${motion.mark(y.year, "cm-fade")}`} style={{ transform: `translateY(${cy}px)`, "--i": i } as CSSProperties} x1={i * bw + 1} x2={(i + 1) * bw - 1} y1={0} y2={0} />}
        <text className="mx-p-tick" x={x + bw * 0.34} y={H + 12} textAnchor="middle">{y.year.slice(2)}</text>
      </g>;
    })}
  </svg>;
}

function Neighbours({ data, onPick }: { data: MapUatResponse; onPick: (key: string) => void }) {
  const list = data.neighbours.filter((n) => n.perCapita !== null);
  const max = Math.max(1, ...list.map((n) => n.perCapita!));
  // Drawn at the panel's own proportions (scaled uniformly), so the dots stay round and the words unstretched.
  // Dots stack where they meet; a tall stack is squeezed into the band under the median's label.
  const W = 560, H = 78, TOP = 18, cols = new Map<number, number>();
  const raw = [...list].sort((a, b) => a.perCapita! - b.perCapita!).map((n) => {
    const x = 10 + (n.perCapita! / max) * (W - 20), c = Math.round(x / 11), k = cols.get(c) ?? 0;
    cols.set(c, k + 1);
    return { n, x, off: k === 0 ? 0 : Math.ceil(k / 2) * 10 * (k % 2 ? -1 : 1) };
  });
  const half = (H - TOP) / 2 - 6, widest = Math.max(1, ...raw.map((d) => Math.abs(d.off))), squeeze = widest > half ? half / widest : 1;
  const dots = raw.map((d) => ({ ...d, y: TOP + (H - TOP) / 2 + d.off * squeeze }));
  const avg = data.county.perCapita === null ? null : 10 + (data.county.perCapita / max) * (W - 20);
  const motion = useEntrance("", list.map((n) => n.key));
  // Drawn in a fixed order (by SIRUTA), so another filter moves each dot instead of re-inserting it; this UAT's ring
  // last, on top. They appear where they are, all together (the order of a strip says nothing), the ring after them.
  const me = dots.find((d) => d.n.key === data.uat.key);
  const others = dots.filter((d) => d !== me).sort((a, b) => (a.n.key < b.n.key ? -1 : a.n.key > b.n.key ? 1 : 0));
  return <svg className="mx-p-near" viewBox={`0 0 ${W} ${H + 18}`} role="img"
    aria-label={`Lei pe locuitor în cele ${data.ranked} UAT-uri din ${data.county.name}; ${data.uat.name} ${data.place ? `e ${ordinal(data.place)}` : "nu are cifră"}.`}
    data-chart="" onAnimationEnd={motion.onAnimationEnd}>
    {avg !== null && <><line className="mx-p-avg" x1={avg} x2={avg} y1={TOP - 4} y2={H} /><text className="mx-p-tick" x={avg + 6} y={11}>media județului</text></>}
    {others.map(({ n, x, y }) => <circle key={n.key} className={`mx-p-dot ${motion.mark(n.key, "cm-pt")}`} cx={x} cy={y} r="4.2" onClick={() => onPick(n.key)}><title>{`${n.name}: ${int(n.perCapita!)} lei pe locuitor`}</title></circle>)}
    {me && <circle key={me.n.key} className={`mx-p-me ${motion.mark(me.n.key, "cm-pt cm-late")}`} cx={me.x} cy={me.y} r="7" vectorEffect="non-scaling-stroke"><title>{`${me.n.name}: ${int(me.n.perCapita!)} lei pe locuitor`}</title></circle>}
    <text className="mx-p-tick" x={10} y={H + 16}>0</text>
    <text className="mx-p-tick" x={W - 10} y={H + 16} textAnchor="end">{int(max)} lei pe locuitor</text>
  </svg>;
}

/** "Pe ce?" and "Cui?": a row per CPV division or supplier, its bar measured against the first row's. */
function Rows({ rows }: { rows: { key: string; name: ReactNode; bar: number; value: ReactNode; title?: string }[] }) {
  const motion = useEntrance("", rows.map((r) => r.key));
  return <ul className="mx-p-rows" data-chart="" onAnimationEnd={motion.onAnimationEnd}>{rows.map((r, i) => <li key={r.key}><span>{r.name}</span>
    <i className={`cm-tw ${motion.mark(r.key, "cm-x")}`} style={{ width: `${Math.max(2, r.bar)}%`, "--i": i } as CSSProperties} /><b title={r.title}>{r.value}</b></li>)}</ul>;
}

/*
 * While a UAT loads (owner, 6 November 2026: "ghost data loading"), the panel keeps the shape of its content: the UAT's
 * name (known from the map), the three questions, and quiet blocks where the sentence, bars, rows and neighbours will be,
 * so switching UATs does not collapse the panel and grow it back. A UAT the map shows hatched gets the short shape.
 */
const YEAR_GHOST = [20, 34, 40, 48, 36, 26, 66, 44, 24];
function Ghost({ name, county, gap }: { name: string | undefined; county: string | undefined; gap: boolean }) {
  // "phone": a line only phones wrap to; "wide": a line only the three-column layout wraps to.
  const line = (width: string, only?: "phone" | "wide") => <G.Line w={width} only={only} />;
  return <>
    <p className="mx-p-kick" aria-hidden="true">{line("44%")}{line("30%", "phone")}</p>
    <h2 id="mx-p-h">{name ?? <G.Line w="36%" />}</h2>
    <p className="mx-p-lead" aria-hidden="true">{line("94%")}{gap ? line("58%") : <>{line("97%")}{line("42%")}{line("30%", "phone")}</>}</p>
    {!gap && <div className="mx-p-cols" aria-hidden="true">
      {(["Cât?", "Pe ce?", "Cui?"] as const).map((title, i) => <div className="mx-p-sec" key={title}><h3>{title}</h3>
        <p>{line("94%")}{line("82%", "wide")}{line("48%")}</p>
        {i === 0
          ? <svg className="mx-p-years" viewBox="0 0 260 112">{YEAR_GHOST.map((h, j) => <rect key={j} className="g-svg" x={j * (260 / 9) + 4.6} y={96 - h} width={19.6} height={h} rx="1.5" />)}</svg>
          : <ul className="mx-p-rows">{[100, 74, 52, 38, 26].map((w, j) => <li key={j}><span>{line(`${78 - j * 7}%`)}</span><i style={{ width: `${w}%` }} /><b>{line("100%")}</b></li>)}</ul>}
      </div>)}
    </div>}
    <div className="mx-p-sec mx-p-wide" aria-hidden="true"><h3>Printre vecini {county && <small>lei pe locuitor în {county}; apasă un punct ca să deschizi UAT-ul</small>}</h3>
      <svg className="mx-p-near" viewBox="0 0 560 96"><rect className="g-svg" x="10" y="42" width="540" height="14" rx="7" /></svg></div>
    {!gap && <p className="mx-p-note" aria-hidden="true">{line("40%")}{line("24%", "phone")}</p>}
    <p className="mx-p-wait g-sr" role="status">Se încarcă UAT-ul…</p>
  </>;
}

export default function UatPanel({ siruta, query, hint, onClose, onPick }: {
  siruta: string; query: string; hint: { name: string; county: string | undefined; gap: boolean } | undefined; onClose: () => void; onPick: (key: string) => void;
}) {
  const [state, setState] = useState<{ key: string; data: MapUatResponse | null; error: string }>({ key: "", data: null, error: "" });
  const key = `siruta=${siruta}&${query}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/map/uat?${key}`, { signal: controller.signal }).then(async (r) => {
      const body = await r.json();
      setState({ key, data: r.ok ? body as MapUatResponse : null, error: r.ok ? "" : body.error ?? "Datele UAT-ului nu au putut fi încărcate." });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, data: null, error: "Datele UAT-ului nu au putut fi încărcate. Reîncearcă." }); });
    return () => controller.abort();
  }, [key]);
  const data = state.key === key ? state.data : null;
  const loading = state.key !== key;
  const d = data ?? (state.data && state.data.uat.key === siruta ? state.data : null);

  const head = d && <>
    <p className="mx-p-kick">{d.uat.kind} · {d.county.name}{d.uat.population ? ` · ${withDe(d.uat.population, "locuitor", "locuitori")}` : ""}
      {d.townHalls.map((t) => <span key={t.id}> · <EntityName id={t.id} role="authority">{t.name}</EntityName></span>)}</p>
    <h2 id="mx-p-h">{d.townHalls[0] ? <Link href={entityHref(d.townHalls[0].id, "authority")}>{d.uat.name}</Link> : d.uat.name}</h2>
  </>;

  // The panel slides in once; another UAT only replays its content's cascade (the body's key).
  const failed = !d && Boolean(state.error) && !loading;
  return <section className={`mx-panel${loading ? " is-loading" : ""}`} aria-labelledby="mx-p-h"><div className={`mx-p-body${!d && !failed ? " is-ghost" : ""}`} aria-busy={!d && !failed ? true : undefined} key={d?.uat.key ?? (failed ? "error" : "wait")}>
    <button type="button" className="mx-p-close" onClick={onClose} aria-label="Închide panoul">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
    {!d ? (failed ? <p className="mx-p-error" role="alert">{state.error}</p> : <Ghost name={hint?.name} county={hint?.county} gap={hint?.gap ?? false} />)
      : d.uat.gap === "no_admin" ? <>
        {head}
        <p className="mx-p-lead">Primăria lui {d.uat.name} nu e identificată sigur în date, deci nu avem cifra lui: valoarea e necunoscută, nu zero.</p>
        <div className="mx-p-sec mx-p-wide"><h3>Printre vecini <small>lei pe locuitor în {d.county.name}; apasă un punct ca să deschizi UAT-ul</small></h3><Neighbours data={d} onPick={onPick} /></div>
      </> : <>
        {head}
        {(() => {
          const value = d.uat.value ?? 0, pc = d.uat.perCapita ?? 0, total = d.cpv.reduce((a, c) => a + c.value, 0);
          const vs = versus(pc, d.county.perCapita);
          const counted = d.years.filter((y) => y.countyPerCapita !== null && y.perCapita !== null);
          const above = counted.filter((y) => y.perCapita! > y.countyPerCapita!).length;
          const peak = d.years.reduce((a, y) => ((y.perCapita ?? 0) > (a?.perCapita ?? 0) ? y : a), d.years[0]);
          const supTotal = d.suppliers.reduce((a, s) => a + s.value, 0);
          const top = d.suppliers[0];
          return <>
            <p className="mx-p-lead">{d.uat.name} a contractat {short(value)} lei: <em>{int(pc)} lei pe locuitor</em>{vs ? `, ${vs}` : ""}
              {d.place ? `, ${ordinal(d.place)} din cele ${withDe(d.ranked, "UAT", "UAT-uri")} ale județului ${d.county.name}` : ""}.</p>
            <div className="mx-p-cols">
              <div className="mx-p-sec"><h3>Cât?</h3>
                <p>{peak && (peak.perCapita ?? 0) > 0 ? <>Vârful în <b>{peak.year}</b>: {int(peak.perCapita!)} lei pe locuitor.</> : "Fără achiziții pe ani în această selecție."}
                  {counted.length > 0 && <> Peste media județului în {above} din {counted.length} ani.</>}</p>
                <Years years={d.years} />
              </div>
              <div className="mx-p-sec"><h3>Pe ce?</h3>
                <p>{d.cpv[0] ? <><b>{pct(d.cpv[0].value, total)}%</b> {d.cpv[0].name.toLowerCase()}{d.cpv[1] ? <>, apoi {d.cpv[1].name.toLowerCase()}{d.cpv[2] ? ` și ${d.cpv[2].name.toLowerCase()}` : ""}</> : ""}.</> : "Fără domenii în această selecție."}</p>
                <Rows rows={d.cpv.slice(0, 5).map((c) => ({ key: c.code ?? "none", name: c.name, bar: pct(c.value, d.cpv[0]!.value), value: `${pct(c.value, total)}%` }))} />
              </div>
              <div className="mx-p-sec"><h3>Cui?</h3>
                <p>{top ? (d.suppliers.length === 1 ? <>Un singur furnizor: <EntityName id={top.id} role="supplier">{top.name}</EntityName>.</>
                  : <><EntityName id={top.id} role="supplier">{top.name}</EntityName> ia <b>{pct(top.value, value)}%</b>; primii {d.suppliers.length}, {pct(supTotal, value)}%.</>) : "Fără furnizori în această selecție."}</p>
                <Rows rows={d.suppliers.map((s) => ({ key: String(s.id), name: <EntityName id={s.id} role="supplier">{s.name}</EntityName>, bar: pct(s.value, top!.value),
                  value: `${pct(s.value, value)}%`, title: `${short(s.value)} lei · ${withDe(s.records, "înregistrare", "înregistrări")}` }))} />
              </div>
            </div>
            <div className="mx-p-sec mx-p-wide"><h3>Printre vecini <small>lei pe locuitor în {d.county.name}; apasă un punct ca să deschizi UAT-ul</small></h3><Neighbours data={d} onPick={onPick} /></div>
            <p className="mx-p-note">Valori contractate, nu plăți. Prin proceduri: {pct(d.channels.contracts, d.channels.contracts + d.channels.da)}%; directe: {pct(d.channels.da, d.channels.contracts + d.channels.da)}%.</p>
          </>;
        })()}
      </>}
  </div></section>;
}
