"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import OptionList from "@/app/intreaba/builder/pickers/OptionList";
import type { KitOption } from "@/app/intreaba/builder/kit-types";
import "@/app/intreaba/builder/filters-kit.css";
import Term from "@/components/Term";
import UatPanel from "./UatPanel";
import type { MapArea, MapDataset, MapOptions, MapResponse } from "@/lib/map-capita-shared";

/*
 * "Hartă" (owner, 6 November 2026, "Harta și clasamentul"): lei per inhabitant of the local administrations on the
 * map and in the ranking beside it, lit together. A click on a county glides the map into it (the SVG viewBox eases to
 * the county's box) and both sides become its UATs; the breadcrumb or Escape steps back. Intensity is one continuous
 * scale, directly proportional to lei per inhabitant from 0 to the level's maximum (owner). Filters apply at once.
 */

type CountyShape = { key: string; name: string; d: string; box: string | number[]; label: string | number[] };
type Geo = { width: number; height: number; counties: CountyShape[] };
type UatShape = { siruta: string | number; name: string; kind: string; d: string };
type CountyGeo = { key: string; name: string; box: string | number[]; uats: UatShape[] };
type Years = "all" | string[];
type View = [number, number, number, number];

const DATASETS: { value: MapDataset; label: string; url: string | null }[] = [
  { value: "all", label: "Toate", url: null }, { value: "da", label: "Directe", url: "directe" }, { value: "contracts", label: "Proceduri", url: "proceduri" },
];
/** Kinds the map will count later (owner: a visible filter now, more kinds later). */
const LATER: KitOption[] = [{ value: "spitale", label: "Spitale", disabled: "în curând" }, { value: "scoli", label: "Școli", disabled: "în curând" }];

const int = (n: number) => Math.round(n).toLocaleString("ro-RO");
const box = (raw: string | number[]): number[] => (typeof raw === "string" ? JSON.parse(raw) as number[] : raw);
function short(value: number): string {
  const f = (n: number, d: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (value >= 1e9) return `${f(value / 1e9, 1)} mld.`;
  if (value >= 1e6) return `${f(value / 1e6, value >= 1e8 ? 0 : 1)} mil.`;
  if (value >= 1e3) return `${f(value / 1e3, 0)} mii`;
  return f(value, 0);
}
/** "2025", "2023–2025", "2019, 2021 și 2024" (years ascending). */
function yearsWords(years: Years, all: string[]): string {
  if (years === "all") return all.length ? `${all[0]}–${all[all.length - 1]}` : "toată perioada";
  if (years.length === 1) return years[0]!;
  const run = years.every((y, i) => i === 0 || Number(y) === Number(years[i - 1]) + 1);
  return run ? `${years[0]}–${years[years.length - 1]}` : `${years.slice(0, -1).join(", ")} și ${years[years.length - 1]}`;
}
/** Toggle one value of a multiple choice whose empty state means "all". */
function toggle(current: Years, value: string): Years {
  if (value === "all") return "all";
  const set = new Set(current === "all" ? [] : current);
  if (set.has(value)) set.delete(value); else set.add(value);
  return set.size ? [...set].sort() : "all";
}
const Arrow = ({ back = false }: { back?: boolean }) => <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" className="mx-arrow">
  <path d={back ? "M10 6H2.5M5.5 3 2.5 6l3 3" : "M2 6h7.5M6.5 3l3 3-3 3"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
/** "e primul", "e al 14-lea" (the ranking's header names the hovered area's place). */
const place = (n: number) => (n === 1 ? "e primul" : `e al ${n}-lea`);
const withDe = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${int(n)}${n % 100 === 0 || n % 100 >= 20 ? " de" : ""} ${many}`);

function Pick({ label, text, title, children, wide = false }: { label: string; text: string; title: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={button} type="button" className="mx-pick" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
      <span>{label}</span><b>{text}</b>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <Popover open={open} anchor={button.current} onClose={() => setOpen(false)} title={title} wide={wide}
      foot={<><span /><button type="button" className="qb-primary" onClick={() => setOpen(false)}>Gata</button></>}>
      <div className="mx-pop-list">{children}</div>
    </Popover>
  </>;
}

export default function MapExplorer({ initial }: { initial: { ani?: string | undefined; cpv?: string | undefined; canal?: string | undefined; judet?: string | undefined; uat?: string | undefined } }) {
  const parse = (raw: string | undefined, valid: RegExp): Years => {
    const items = (raw ?? "").split(",").map((s) => s.trim()).filter((s) => valid.test(s));
    return items.length ? [...new Set(items)].sort() : "all";
  };
  const [years, setYears] = useState<Years>(() => parse(initial.ani, /^20\d\d$/));
  const [cpv, setCpv] = useState<Years>(() => parse(initial.cpv, /^\d\d$/));
  const [dataset, setDataset] = useState<MapDataset>(() => DATASETS.find((d) => d.url === initial.canal)?.value ?? "all");
  const [county, setCounty] = useState<string | null>(initial.judet && /^[a-z-]{2,20}$/.test(initial.judet) ? initial.judet : null);
  // The UAT whose panel is open (owner, 6 November 2026): its SIRUTA, inside the open county.
  const [uat, setUat] = useState<string | null>(initial.judet && initial.uat && /^\d{1,7}$/.test(initial.uat) ? initial.uat : null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [countyGeo, setCountyGeo] = useState<Record<string, CountyGeo>>({});
  const [options, setOptions] = useState<MapOptions | null>(null);
  const [national, setNational] = useState<{ key: string; data: MapResponse } | null>(null);
  const [local, setLocal] = useState<{ key: string; data: MapResponse } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  // Phones show the first 15 of the ranking (owner: no long phone lists); a county change folds it again.
  const [unfolded, setUnfolded] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Where the hover came from: only the map's scrolls the ranking (a row under the pointer must never move away).
  const fromMap = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const selection = useMemo(() => {
    const p = new URLSearchParams({ years: years === "all" ? "all" : years.join(","), cpv: cpv === "all" ? "all" : cpv.join(","), dataset, kind: "local_admin" });
    return p.toString();
  }, [years, cpv, dataset]);
  const nationalKey = `level=county&${selection}`;
  const localKey = county ? `level=uat&county=${county}&${selection}` : null;

  // The country's shapes and the filter options, once.
  useEffect(() => {
    void fetch("/geo/romania.json").then((r) => r.json()).then((g: Geo) => setGeo(g)).catch(() => setError("Harta nu s-a putut încărca. Reîncearcă."));
    void fetch("/api/map/options").then((r) => r.json()).then((o: MapOptions) => setOptions(o)).catch(() => undefined);
  }, []);
  // The chosen county's UATs, once per county.
  useEffect(() => {
    if (!county || countyGeo[county]) return;
    void fetch(`/geo/judete/${county}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((g: CountyGeo) => setCountyGeo((all) => ({ ...all, [county]: g })))
      .catch(() => setCounty(null));
  }, [county, countyGeo]);
  // The numbers: the country always (it frames the county), the county's UATs when one is open.
  useEffect(() => {
    const controller = new AbortController();
    const load = async (key: string, set: (v: { key: string; data: MapResponse }) => void) => {
      const response = await fetch(`/api/map?${key}`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Harta nu s-a putut încărca.");
      set({ key, data: body as MapResponse });
    };
    setError("");
    void Promise.all([
      national?.key === nationalKey ? null : load(nationalKey, setNational),
      localKey && local?.key !== localKey ? load(localKey, setLocal) : null,
    ]).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Harta nu s-a putut încărca."); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nationalKey, localKey, retry]);
  // Back closes a county opened by a click (its own history entry); the breadcrumb and Escape do the same.
  const fromPop = useRef(false);
  const shownCounty = useRef<string | null>(county);
  const shownUat = useRef<string | null>(uat);
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search), j = p.get("judet"), u = p.get("uat");
      fromPop.current = true; setCounty(j && /^[a-z-]{2,20}$/.test(j) ? j : null); setUat(j && u && /^\d{1,7}$/.test(u) ? u : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // The address keeps the view: a copied link reopens it.
  useEffect(() => {
    const p = new URLSearchParams();
    if (years !== "all") p.set("ani", years.join(","));
    if (cpv !== "all") p.set("cpv", cpv.join(","));
    const canal = DATASETS.find((d) => d.value === dataset)?.url;
    if (canal) p.set("canal", canal);
    if (county) p.set("judet", county);
    if (county && uat) p.set("uat", uat);
    const q = p.toString(), url = `${window.location.pathname}${q ? `?${q}` : ""}`;
    // Opening a county or a UAT's panel is a history entry: Back closes it.
    const opened = !fromPop.current && ((county !== null && county !== shownCounty.current) || (uat !== null && uat !== shownUat.current));
    if (opened) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
    shownCounty.current = county; shownUat.current = uat; fromPop.current = false;
  }, [years, cpv, dataset, county, uat]);
  // Escape steps back to the country.
  useEffect(() => {
    if (!county) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (uat) setUat(null); else setCounty(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [county, uat]);

  // The glide: the viewBox eases from where it is to the county's box (or back to the country).
  const shape = geo && county ? geo.counties.find((c) => c.key === county) : undefined;
  const target: View | null = useMemo(() => {
    if (!geo) return null;
    if (!shape) return [0, 0, geo.width, geo.height];
    const [x0, y0, x1, y1] = box(shape.box) as [number, number, number, number];
    const w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.08;
    return [x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad];
  }, [geo, shape]);
  useEffect(() => {
    if (!target) return;
    const from = viewRef.current;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!from || reduced) { viewRef.current = target; setView(target); return; }
    let raf = 0;
    const t0 = performance.now(), D = 560;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      const next = from.map((f, i) => f + (target[i]! - f) * e) as View;
      viewRef.current = next; setView(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const nat = national?.data;
  const loc = county && local?.key === localKey ? local.data : null;
  const level: MapResponse | null | undefined = county ? loc : nat;
  const areas = useMemo(() => level?.areas ?? [], [level]);
  const byKey = useMemo(() => new Map(areas.map((a) => [a.key, a])), [areas]);
  const max = Math.max(1, ...areas.map((a) => a.perCapita ?? 0));
  const ranked = useMemo(() => [...areas].sort((a, b) => (b.perCapita ?? -1) - (a.perCapita ?? -1) || a.name.localeCompare(b.name, "ro")), [areas]);
  const countyArea = county ? nat?.areas.find((a) => a.key === county) : undefined;
  const countyName = shape?.name ?? countyArea?.name ?? countyGeo[county ?? ""]?.name ?? "";
  const average = (() => {
    if (county) return countyArea?.perCapita ?? null;
    const known = (nat?.areas ?? []).filter((a) => a.perCapita !== null && a.value !== null && a.denominator);
    const pop = known.reduce((s, a) => s + (a.denominator ?? 0), 0);
    return pop ? known.reduce((s, a) => s + (a.value ?? 0), 0) / pop : null;
  })();
  const allYears = (options?.years ?? []).map((y) => y.year);
  const kindLabel = options?.kinds[0]?.label ?? "Primării și consilii județene";
  const cpvWords = cpv === "all" ? "toate domeniile" : cpv.length === 1 ? (options?.cpv.find((c) => c.code === cpv[0])?.name ?? `CPV ${cpv[0]}`).toLowerCase() : `${cpv.length} domenii CPV`;
  const channelWords = dataset === "da" ? ", prin achiziții directe" : dataset === "contracts" ? ", prin proceduri" : "";
  const fill = (a: MapArea | undefined): CSSProperties | undefined => (a && a.perCapita !== null ? { fillOpacity: 0.07 + 0.93 * (a.perCapita / max) } : undefined);
  const shown = hover ? byKey.get(hover) ?? (loc?.city?.key === hover ? loc.city : undefined) : undefined;
  const busy = !level || (county !== null && !countyGeo[county]);
  const uatGeo = county ? countyGeo[county] : undefined;
  const chosen = uat && uatGeo ? uatGeo.uats.find((u) => String(u.siruta) === uat)?.d ?? null : null;
  const outline = !hover || !geo ? null : county ? uatGeo?.uats.find((u) => String(u.siruta) === hover)?.d ?? null : geo.counties.find((c) => c.key === hover)?.d ?? null;
  const hoverPlace = hover ? ranked.findIndex((a) => a.key === hover && a.perCapita !== null) + 1 : 0;
  const [atEnd, setAtEnd] = useState(false);
  // A list that fits (or is scrolled to its end) carries no fade: measured whenever its rows change.
  useEffect(() => {
    const el = listRef.current;
    if (el) setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }, [ranked, unfolded, county]);

  // The hovered row stays in view inside the ranking's own scroll (never the page's).
  useEffect(() => {
    const list = listRef.current;
    const row = hover && fromMap.current ? list?.querySelector<HTMLElement>(`[data-key="${hover}"]`) : null;
    if (!list || !row) return;
    // Measured against the list itself (offsetTop counts from the page's positioned ancestor, which hid the top rows);
    // the bottom keeps clear of the fade.
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop, bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (bottom > list.scrollTop + list.clientHeight - 44) list.scrollTop = bottom - list.clientHeight + 48;
  }, [hover]);

  function track(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
  const openCounty = (key: string) => { setHover(null); setUat(null); setCounty(key); };
  const openUat = (key: string) => { setHover(key); setUat(key); };

  const yearOptions: KitOption[] = [{ value: "all", label: "Toată perioada", detail: `${yearsWords("all", allYears)}, cu înregistrările fără dată` },
    ...(options?.years ?? []).map((y) => ({ value: y.year, label: y.year, count: `${short(y.value)} lei`, ...(Number(y.year) >= new Date().getFullYear() ? { detail: "an în curs, incomplet" } : {}) }))];
  const top = Math.max(1, ...(options?.cpv ?? []).map((c) => c.value));
  const q = search.trim().toLowerCase();
  const cpvOptions: KitOption[] = [...(q ? [] : [{ value: "all", label: "Toate domeniile", detail: "cu înregistrările fără cod CPV" }]),
    ...(options?.cpv ?? []).filter((c) => !q || `${c.code} ${c.name} ${c.official ?? ""}`.toLowerCase().includes(q))
      .map((c) => ({ value: c.code, label: `${c.code} · ${c.name}`, count: `${short(c.value)} lei`, share: c.value / top, ...(c.official && c.official !== c.name ? { detail: c.official } : {}) }))];

  return <div className="mx">
    <header className="mx-head">
      <h1>{county ? `Lei pe locuitor în ${countyName || "județ"}` : "Lei pe locuitor, pe județe"}</h1>
      <p className="mx-lede">Ce au contractat primăriile și consiliile județene, {yearsWords(years, allYears)}, {cpvWords}{channelWords}.
        {average !== null && <> {county ? (county === "bucuresti" ? "București, cu primăria municipiului" : `${countyName}, cu consiliul județean`) : "Media țării"}: <b>{int(average)} lei</b> pe locuitor.</>}</p>
    </header>

    <div className="mx-filters" role="group" aria-label="Ce arată harta">
      <Pick label="Instituții" text="Primării și CJ" title="Ce instituții?">
        <OptionList label="Instituții" multiple values={["local_admin"]} options={[{ value: "local_admin", label: kindLabel, detail: "primăria fiecărui UAT; la județ, și consiliul județean" }, ...LATER]} onChange={() => undefined} />
      </Pick>
      <Pick label="Perioada" text={years === "all" ? "Toată perioada" : yearsWords(years, allYears)} title="Ce ani?">
        <OptionList label="Perioada" multiple values={years === "all" ? ["all"] : years} options={yearOptions} onChange={(v, source) => { if (source === "activate") setYears((y) => toggle(y, v)); }} />
      </Pick>
      <Pick label="Domenii CPV" text={cpv === "all" ? "Toate" : cpv.length === 1 ? cpvWords : `${cpv.length} domenii`} title="Ce domenii CPV?" wide>
        <input className="mx-search" type="search" placeholder="Caută un domeniu sau un cod" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută un domeniu CPV" />
        {cpvOptions.length ? <OptionList label="Domenii CPV" multiple values={cpv === "all" ? ["all"] : cpv} options={cpvOptions} onChange={(v, source) => { if (source === "activate") setCpv((c) => toggle(c, v)); }} />
          : <p className="qb-pop-note">Niciun domeniu nu se potrivește.</p>}
      </Pick>
      <div className="mx-seg" role="group" aria-label="Achiziții">{DATASETS.map((d) => <button key={d.value} type="button" aria-pressed={dataset === d.value} onClick={() => setDataset(d.value)}>{d.label}</button>)}</div>
    </div>

    {error ? <div className="mx-error" role="alert"><p>{error}</p><button type="button" className="mx-btn" onClick={() => setRetry((r) => r + 1)}>Reîncearcă</button></div> : <div className={`mx-body${county && uat ? " has-panel" : ""}`}>
      <section className={`mx-stage${busy ? " is-busy" : ""}`} aria-label={county ? `Harta județului ${countyName}` : "Harta României pe județe"}>
        {county && <p className="mx-crumb"><button type="button" onClick={() => { setUat(null); setCounty(null); }}><Arrow back /> România</button><span>· {countyName}</span></p>}
        <div className="mx-map" ref={stageRef} onPointerMove={track} onPointerLeave={() => { setHover(null); setPointer(null); }}>
          {geo && view && <svg viewBox={view.join(" ")} preserveAspectRatio="xMidYMid meet" role="img"
            aria-label={`${county ? countyName : "România"}: lei pe locuitor${average !== null ? `, în medie ${int(average)}` : ""}. Clasamentul de alături are aceleași cifre.`}>
            <defs><pattern id="mx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) scale(${view[2] / geo.width})`}><rect width="6" height="6" className="mx-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="mx-hatch-line" /></pattern></defs>
            <g className={county ? "mx-counties is-back" : "mx-counties"}>
              {geo.counties.map((c) => {
                const a = nat?.areas.find((x) => x.key === c.key);
                const gap = !a || a.perCapita === null;
                return <path key={c.key} d={c.d} fillRule="evenodd" vectorEffect="non-scaling-stroke"
                  className={`mx-area${gap ? " is-gap" : ""}${!county && hover === c.key ? " is-hover" : ""}${county === c.key ? " is-open" : ""}`}
                  style={county ? undefined : fill(a)}
                  onPointerEnter={county ? undefined : () => { fromMap.current = true; setHover(c.key); }} onClick={() => (county === c.key ? undefined : openCounty(c.key))} />;
              })}
            </g>
            {county && uatGeo && <g className="mx-uats" key={county}>
              {uatGeo.uats.map((u) => {
                const key = String(u.siruta), a = byKey.get(key), gap = !a || a.perCapita === null;
                return <path key={key} d={u.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" className={`mx-area${gap ? " is-gap" : ""}${hover === key ? " is-hover" : ""}`}
                  style={fill(a)} onPointerEnter={() => { fromMap.current = true; setHover(key); }} onClick={() => openUat(key)} />;
              })}
            </g>}
            {/* Drawn last so their ink closes on every edge: the open county's border, the hovered area's outline. */}
            {county && shape && <path className="mx-open-edge" d={shape.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {outline && <path className="mx-outline" d={outline} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {chosen && <path className="mx-chosen" d={chosen} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </svg>}
          {shown && pointer && <div className={`mx-card${pointer.x > (stageRef.current?.clientWidth ?? 0) * 0.62 ? " r" : ""}`} style={{ left: pointer.x, top: pointer.y }} aria-hidden="true">
            <b>{shown.name}</b>
            {shown.perCapita !== null ? <span><em>{int(shown.perCapita)} lei</em> pe locuitor</span>
              : <span className="mx-card-gap">{shown.gap === "no_admin" ? "Primăria nu e identificată sigur: valoare necunoscută, nu zero." : shown.gap === "no_council" ? "Consiliul județean nu e identificat: fără cifră pe locuitor." : "Fără populație cunoscută."}</span>}
            {shown.value !== null && <span className="mx-card-sub">{short(shown.value)} lei · {withDe(shown.denominator ?? shown.population ?? 0, "locuitor", "locuitori")}{shown.coverage !== undefined && shown.coverage < 0.9 ? ` · acoperire ${Math.round(shown.coverage * 100)}%` : ""}</span>}
            {!county && <span className="mx-card-go">Apasă: UAT-urile județului <Arrow /></span>}
          </div>}
          {busy && <p className="mx-busy" role="status">Se încarcă…</p>}
        </div>
        <div className="mx-foot">
          <div className="mx-legend" aria-hidden="true"><span className="mx-legend-g"><span>0</span><i /><span>{int(max)} lei pe locuitor</span></span>
            {areas.some((a) => a.perCapita === null) && <span className="mx-legend-g"><b className="mx-legend-gap" /><span>{county ? "primărie neidentificată" : "fără cifră"}</span></span>}</div>
          <p className="mx-attr">Limite UAT: ANCPI; denumiri: INS SIRUTA (<a href="https://data.gov.ro/dataset/unitati-administrativ-teritoriale-07-03-2024" target="_blank" rel="noreferrer">data.gov.ro</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>), simplificate. Populația: INS, RPL 2021.</p>
        </div>
      </section>

      <aside className="mx-rank" aria-labelledby="mx-rank-h">
        <h2 id="mx-rank-h">{county ? (county === "bucuresti" ? "Sectoarele" : "UAT-urile") : "Județele"} <span aria-live="polite">lei pe locuitor{shown && hoverPlace > 0 ? ` · ${shown.name} ${place(hoverPlace)}` : ""}</span></h2>
        {county && loc?.city && <div className={`mx-city${hover === loc.city.key ? " is-hover" : ""}`} onPointerEnter={() => setHover(loc.city!.key)} onPointerLeave={() => setHover(null)}>
          <b>{loc.city.name}</b><span>pentru tot orașul, pe {withDe(loc.city.denominator ?? 0, "locuitor", "locuitori")}</span>
          <em>{loc.city.perCapita === null ? "—" : `${int(loc.city.perCapita)} lei`}</em>
        </div>}
        <ol className={`mx-rows${unfolded === (county ?? "") ? "" : " is-folded"}${atEnd ? " at-end" : ""}`} ref={listRef}
          onScroll={(e) => { const el = e.currentTarget; setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4); }}>
          {ranked.map((a, i) => {
            const gap = a.perCapita === null;
            return <li key={a.key} data-key={a.key}>
              <button type="button" className={`mx-row${hover === a.key ? " is-hover" : ""}${gap ? " is-gap" : ""}`} onPointerEnter={() => { fromMap.current = false; setHover(a.key); }} onPointerLeave={() => setHover(null)}
                onFocus={() => { fromMap.current = false; setHover(a.key); }} onBlur={() => setHover(null)} onClick={() => (county ? openUat(a.key) : openCounty(a.key))}
                aria-label={`${a.name}: ${gap ? "fără cifră" : `${int(a.perCapita!)} lei pe locuitor`}${county ? ". Deschide fișa UAT-ului" : ". Deschide UAT-urile județului"}`} aria-pressed={county ? uat === a.key : undefined}>
                <span className="mx-n">{gap ? "" : i + 1}</span>
                <span className="mx-name">{a.name}{a.coverage !== undefined && a.coverage < 0.9 && <small>acoperire {Math.round(a.coverage * 100)}%</small>}</span>
                <span className="mx-bar" aria-hidden="true">{!gap && <i style={{ width: `${Math.max(1.5, (a.perCapita! / max) * 100)}%`, opacity: 0.25 + 0.75 * (a.perCapita! / max) }} />}</span>
                <span className="mx-v">{gap ? "—" : int(a.perCapita!)}</span>
              </button>
            </li>;
          })}
        </ol>
        {ranked.length > 15 && unfolded !== (county ?? "") && <button type="button" className="mx-more" onClick={() => setUnfolded(county ?? "")}>Toate cele {ranked.length}</button>}
        {!busy && !ranked.length && <p className="mx-note">Nicio valoare în această selecție.</p>}
        <p className="mx-note">{county ? "Un UAT fără primărie identificată nu are cifră: nu înseamnă zero lei." : "Un județ se împarte la locuitorii UAT-urilor ale căror primării le identificăm."} Valori contractate, nu plăți, în plafoanele totalurilor <Term id="plafoane-totaluri" tip /></p>
      </aside>
      {county && uat && <UatPanel siruta={uat} query={selection} onClose={() => setUat(null)} onPick={openUat} />}
    </div>}
  </div>;
}
