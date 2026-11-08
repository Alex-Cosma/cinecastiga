"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import OptionList from "@/app/intreaba/builder/pickers/OptionList";
import type { KitOption } from "@/app/intreaba/builder/kit-types";
import "@/app/intreaba/builder/filters-kit.css";
import Term from "@/components/Term";
import { G, Ghost } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import { useRouter } from "next/navigation";
import EntityName from "@/components/EntityName";
import { writeAddress } from "@/lib/address";
import { entityHref } from "@/lib/entity-href";
import HospitalLayer from "./HospitalLayer";
import UatPanel from "./UatPanel";
import { useEntrance, useFillIn, useGlide } from "./motion";
import { BEDS_YEAR, figure, KIND_URL, mapMetric, type MapArea, type MapDataset, type MapKind, type MapMetric, type MapOptions, type MapResponse } from "@/lib/map-capita-shared";

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
/** The kinds of institution (owner: hospitals since 8 November 2026, schools later). */
const KINDS: KitOption[] = [
  { value: "local_admin", label: "Primării și consilii județene", detail: "primăria fiecărui UAT; la județ, și consiliul județean" },
  { value: "hospitals", label: "Spitale publice", detail: "lista CNAS, cu paturile; lei pe pat doar pentru 2025" },
  { value: "scoli", label: "Școli", disabled: "în curând" },
];
/** What a figure is called, after its number. */
const UNIT: Record<MapMetric, string> = { perCapita: "pe locuitor", perBed: "pe pat", value: "contractați" };

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
/** How long the pointer rests on an area of the map before the ranking scrolls to its row (owner, 7 November 2026). */
const FOLLOW_DELAY = 250;
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

type Initial = { ani?: string | undefined; cpv?: string | undefined; canal?: string | undefined; judet?: string | undefined; uat?: string | undefined; inst?: string | undefined };

export default function MapExplorer({ initial }: { initial: Initial }) {
  // The address is the view. Back from a page opened here (a year of a UAT's panel) remounts the map from the
  // router's cache, whose props are the first visit's (often a bare /harta), while the address already holds the
  // county and the UAT that were open: the browser reads the address, the server its own copy of it.
  const [start] = useState<Initial>(() => {
    if (typeof window === "undefined") return initial;
    const p = new URLSearchParams(window.location.search);
    const one = (key: string) => { const all = p.getAll(key); return all.length === 1 ? all[0] : undefined; };
    return { ani: one("ani"), cpv: one("cpv"), canal: one("canal"), judet: one("judet"), uat: one("uat"), inst: one("inst") };
  });
  const parse = (raw: string | undefined, valid: RegExp): Years => {
    const items = (raw ?? "").split(",").map((s) => s.trim()).filter((s) => valid.test(s));
    return items.length ? [...new Set(items)].sort() : "all";
  };
  const [years, setYears] = useState<Years>(() => parse(start.ani, /^20\d\d$/));
  const [cpv, setCpv] = useState<Years>(() => parse(start.cpv, /^\d\d$/));
  const [dataset, setDataset] = useState<MapDataset>(() => DATASETS.find((d) => d.url === start.canal)?.value ?? "all");
  // The kind of institution (owner, 8 November 2026): the local administrations, or the public hospitals (`?inst=spitale`).
  const [kind, setKind] = useState<MapKind>(() => (start.inst === KIND_URL.hospitals ? "hospitals" : "local_admin"));
  const hospitals = kind === "hospitals";
  const router = useRouter();
  const [county, setCounty] = useState<string | null>(start.judet && /^[a-z-]{2,20}$/.test(start.judet) ? start.judet : null);
  // The UAT whose panel is open (owner, 6 November 2026): its SIRUTA, inside the open county.
  const [uat, setUat] = useState<string | null>(start.judet && start.uat && /^\d{1,7}$/.test(start.uat) ? start.uat : null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [countyGeo, setCountyGeo] = useState<Record<string, CountyGeo>>({});
  const [options, setOptions] = useState<MapOptions | null>(null);
  const [national, setNational] = useState<{ key: string; data: MapResponse } | null>(null);
  // The county's numbers remember their county: another filter keeps them on screen, dimmed, until the new ones arrive.
  const [local, setLocal] = useState<{ key: string; county: string; data: MapResponse } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  // Phones show the first 15 of the ranking (owner: no long phone lists); a county change folds it again.
  const [unfolded, setUnfolded] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Where the hover came from: only the map's scrolls the ranking (a row under the pointer must never move away).
  const fromMap = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const selection = useMemo(() => {
    const p = new URLSearchParams({ years: years === "all" ? "all" : years.join(","), cpv: cpv === "all" ? "all" : cpv.join(","), dataset, kind });
    return p.toString();
  }, [years, cpv, dataset, kind]);
  const nationalKey = `level=county&${selection}`;
  const localKey = county ? `level=uat&county=${county}&${selection}` : null;

  // The country's shapes, once; the filter options, once per kind.
  useEffect(() => {
    void fetch("/geo/romania.json").then((r) => r.json()).then((g: Geo) => setGeo(g)).catch(() => setError("Harta nu s-a putut încărca. Reîncearcă."));
  }, []);
  useEffect(() => {
    let live = true;
    void fetch(`/api/map/options?kind=${kind}`).then((r) => r.json()).then((o: MapOptions) => { if (live) setOptions(o); }).catch(() => undefined);
    return () => { live = false; };
  }, [kind]);
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
      localKey && county && local?.key !== localKey ? load(localKey, (v) => setLocal({ ...v, county })) : null,
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
    const inst = KIND_URL[kind];
    if (inst) p.set("inst", inst);
    if (years !== "all") p.set("ani", years.join(","));
    if (cpv !== "all") p.set("cpv", cpv.join(","));
    const canal = DATASETS.find((d) => d.value === dataset)?.url;
    if (canal) p.set("canal", canal);
    if (county) p.set("judet", county);
    if (county && uat) p.set("uat", uat);
    const q = p.toString(), url = `${window.location.pathname}${q ? `?${q}` : ""}`;
    // Opening a county or a UAT's panel is a history entry: Back closes it.
    const opened = !fromPop.current && ((county !== null && county !== shownCounty.current) || (uat !== null && uat !== shownUat.current));
    writeAddress(url, opened ? "push" : "replace");
    shownCounty.current = county; shownUat.current = uat; fromPop.current = false;
  }, [years, cpv, dataset, county, uat, kind]);
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

  // The glide (the camera, motion.ts): the viewBox eases from where it is to the county's box (or back to the country).
  const shape = geo && county ? geo.counties.find((c) => c.key === county) : undefined;
  const target: View | null = useMemo(() => {
    if (!geo) return null;
    if (!shape) return [0, 0, geo.width, geo.height];
    const [x0, y0, x1, y1] = box(shape.box) as [number, number, number, number];
    const w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.08;
    return [x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad];
  }, [geo, shape]);
  const view = useGlide(target);

  // Same areas, new numbers (a filter): the old ones stay, dimmed, with a floating status. Another level (a county
  // opened, the first load) has no numbers to dim: its ranking is a ghost of its rows (owner, 6 November 2026).
  const nat = national?.data;
  const natStale = national !== null && national.key !== nationalKey;
  const loc = county && local?.county === county ? local.data : null;
  const level: MapResponse | null | undefined = county ? loc : nat;
  const stale = level ? (county ? local!.key !== localKey : natStale) : false;
  const areas = useMemo(() => level?.areas ?? [], [level]);
  const byKey = useMemo(() => new Map(areas.map((a) => [a.key, a])), [areas]);
  // What each figure is: the numbers on screen say (a stale level keeps its own), else the selection.
  const metric: MapMetric = level?.metric ?? mapMetric({ kind, years });
  const fig = (a: MapArea | null | undefined): number | null => (a ? figure(a, metric) : null);
  const max = Math.max(1, ...areas.map((a) => fig(a) ?? 0));
  const ranked = useMemo(() => [...areas].sort((a, b) => (figure(b, metric) ?? -1) - (figure(a, metric) ?? -1) || a.name.localeCompare(b.name, "ro")), [areas, metric]);
  const countyArea = county ? nat?.areas.find((a) => a.key === county) : undefined;
  const countyName = shape?.name ?? countyArea?.name ?? countyGeo[county ?? ""]?.name ?? "";
  const average = (() => {
    if (county) return fig(countyArea);
    const known = (nat?.areas ?? []).filter((a) => fig(a) !== null && a.value !== null);
    if (metric === "value") return nat ? known.reduce((s, a) => s + (a.value ?? 0), 0) : null;
    if (metric === "perBed") {
      const beds = known.reduce((s, a) => s + (a.beds ?? 0), 0);
      return beds ? known.reduce((s, a) => s + (a.perBed ?? 0) * (a.beds ?? 0), 0) / beds : null;
    }
    const pop = known.filter((a) => a.denominator).reduce((s, a) => s + (a.denominator ?? 0), 0);
    return pop ? known.reduce((s, a) => s + (a.value ?? 0), 0) / pop : null;
  })();
  /** A figure as the page writes it: lei per inhabitant or per bed in full, totals short ("1,6 mld."). */
  const say = (n: number) => (metric === "value" ? short(n) : int(n));
  const allYears = (options?.years ?? []).map((y) => y.year);
  const cpvWords = cpv === "all" ? "toate domeniile" : cpv.length === 1 ? (options?.cpv.find((c) => c.code === cpv[0])?.name ?? `CPV ${cpv[0]}`).toLowerCase() : `${cpv.length} domenii CPV`;
  const channelWords = dataset === "da" ? ", prin achiziții directe" : dataset === "contracts" ? ", prin proceduri" : "";
  const tint = (a: MapArea): number | null => { const f = figure(a, metric); return f === null ? null : BASE.fillOpacity + (1 - BASE.fillOpacity) * (f / max); };
  const fill = (a: MapArea | undefined): CSSProperties | undefined => { const t = a ? tint(a) : null; return t === null ? undefined : { fillOpacity: t }; };
  // The counties fill in together once their numbers are in (motion.ts); until then they wait at the base tint.
  const natFilled = useFillIn(Boolean(geo && view && nat));
  const shown = hover ? byKey.get(hover) ?? (loc?.city?.key === hover ? loc.city : undefined) : undefined;
  const busy = !level || (county !== null && !countyGeo[county]);
  const uatGeo = county ? countyGeo[county] : undefined;
  const chosen = uat && uatGeo && !hospitals ? uatGeo.uats.find((u) => String(u.siruta) === uat)?.d ?? null : null;
  const outline = !hover || !geo ? null : county ? uatGeo?.uats.find((u) => String(u.siruta) === hover)?.d ?? null : geo.counties.find((c) => c.key === hover)?.d ?? null;
  const hoverPlace = hover ? ranked.findIndex((a) => a.key === hover && fig(a) !== null) + 1 : 0;
  // The open county's hospitals (owner, 8 November 2026): the map's units per pixel at the county's view, so a circle keeps its size.
  const [stageWidth, setStageWidth] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setStageWidth(el.clientWidth));
    observer.observe(el); setStageWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [geo]);
  const unit = target && stageWidth ? Math.max(target[2] / stageWidth, target[3] / Math.max(1, (stageRef.current?.clientHeight ?? stageWidth))) : 0;
  const cityCentre = useMemo((): [number, number] | null => {
    const b = geo?.counties.find((c) => c.key === "bucuresti")?.box;
    if (!b) return null;
    const [x0, y0, x1, y1] = box(b) as [number, number, number, number];
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  }, [geo]);
  const openHospital = (a: MapArea) => { if (a.entityId) router.push(entityHref(a.entityId)); };
  // The ranking's bars grow (the first ten, top down) when a level's rows first appear; a filter then tweens their
  // widths in place, and the rows take their new order at once (no sliding).
  const rankLevel = county ?? "";
  const rankKeys = useMemo(() => ranked.map((a) => a.key), [ranked]);
  const rankMotion = useEntrance(rankLevel, rankKeys);
  const [atEnd, setAtEnd] = useState(false);
  // A list that fits (or is scrolled to its end) carries no fade: measured whenever its rows change.
  useEffect(() => {
    const el = listRef.current;
    if (el) setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }, [ranked, unfolded, county]);

  // The hovered row stays in view inside the ranking's own scroll (never the page's). Owner, 7 November 2026: the list
  // follows only once the pointer rests on an area (FOLLOW_DELAY; crossing the map moves nothing) and then glides to
  // the row instead of jumping. The row's highlight, the outline and the card stay instant.
  useEffect(() => {
    if (!hover || !fromMap.current) return;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>(`[data-key="${hover}"]`);
      if (!list || !row) return;
      // Measured against the list itself (offsetTop counts from the page's positioned ancestor, which hid the top rows);
      // the bottom keeps clear of the fade.
      const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop, bottom = top + row.offsetHeight;
      const to = top < list.scrollTop ? top - 8 : bottom > list.scrollTop + list.clientHeight - 44 ? bottom - list.clientHeight + 48 : null;
      if (to === null) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({ top: Math.max(0, to), behavior: reduce ? "auto" : "smooth" });
    }, FOLLOW_DELAY);
    return () => window.clearTimeout(timer);
  }, [hover]);

  function track(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
  const openCounty = (key: string) => { setHover(null); setUat(null); setCounty(key); };
  const openUat = (key: string) => { setHover(key); setUat(key); };

  // Hospitals: only 2025 alone has lei per bed (owner, 8 November 2026), and the year's choice says so.
  const yearDetail = (year: string) => Number(year) >= new Date().getFullYear() ? "an în curs, incomplet" : hospitals && year === BEDS_YEAR ? "singur: și lei pe pat de spital" : null;
  const yearOptions: KitOption[] = [{ value: "all", label: "Toată perioada", detail: `${yearsWords("all", allYears)}, cu înregistrările fără dată` },
    ...(options?.years ?? []).map((y) => { const detail = yearDetail(y.year); return { value: y.year, label: y.year, count: `${short(y.value)} lei`, ...(detail ? { detail } : {}) }; })];
  const top = Math.max(1, ...(options?.cpv ?? []).map((c) => c.value));
  const q = search.trim().toLowerCase();
  const cpvOptions: KitOption[] = [...(q ? [] : [{ value: "all", label: "Toate domeniile", detail: "cu înregistrările fără cod CPV" }]),
    ...(options?.cpv ?? []).filter((c) => !q || `${c.code} ${c.name} ${c.official ?? ""}`.toLowerCase().includes(q))
      .map((c) => ({ value: c.code, label: `${c.code} · ${c.name}`, count: `${short(c.value)} lei`, share: c.value / top, ...(c.official && c.official !== c.name ? { detail: c.official } : {}) }))];

  return <div className="mx">
    <header className="mx-head">
      {hospitals
        ? <h1>{county ? `Spitalele din ${countyName || "județ"}` : metric === "perBed" ? "Lei pe pat de spital, pe județe" : "Spitalele, pe județe"}</h1>
        : <h1>{county ? `Lei pe locuitor în ${countyName || "județ"}` : "Lei pe locuitor, pe județe"}</h1>}
      <p className="mx-lede">{hospitals ? "Ce au contractat spitalele publice" : "Ce au contractat primăriile și consiliile județene"}, {yearsWords(years, allYears)}, {cpvWords}{channelWords}.
        {(average !== null || !nat) && <> <span className={natStale ? "g-stale" : undefined}>{hospitals
          ? (county ? countyName : metric === "perBed" ? "Media țării" : "În total")
          : county ? (county === "bucuresti" ? "București, cu primăria municipiului" : `${countyName}, cu consiliul județean`) : "Media țării"}: <b>{average !== null ? `${say(average)} lei` : <G.Line inline w="4.6em" />}</b>{metric === "value" ? "" : ` ${UNIT[metric]}`}.</span></>}</p>
    </header>

    <div className="mx-filters" role="group" aria-label="Ce arată harta">
      <Pick label="Instituții" text={hospitals ? "Spitale" : "Primării și CJ"} title="Ce instituții?">
        <OptionList label="Instituții" value={kind} options={KINDS}
          onChange={(v) => { if (v === "local_admin" || v === "hospitals") { setKind(v); setUat(null); setHover(null); } }} />
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

    {error ? <div className="mx-error" role="alert"><p>{error}</p><button type="button" className="mx-btn" onClick={() => setRetry((r) => r + 1)}>Reîncearcă</button></div> : <div className={`mx-body${county && uat && !hospitals ? " has-panel" : ""}`}>
      <section className={`mx-stage${busy ? " is-busy" : ""}`} aria-label={county ? `Harta județului ${countyName}` : "Harta României pe județe"}>
        {county && <p className="mx-crumb"><button type="button" onClick={() => { setUat(null); setCounty(null); }}><Arrow back /> România</button><span>· {countyName}</span></p>}
        <div className="mx-map" ref={stageRef} onPointerMove={track} onPointerLeave={() => { setHover(null); setPointer(null); }}>
          {geo && view && <svg viewBox={view.join(" ")} preserveAspectRatio="xMidYMid meet" role="img" className={stale ? "g-stale" : undefined}
            aria-label={`${county ? countyName : "România"}: lei ${UNIT[metric]}${average !== null ? `, ${metric === "value" ? "în total" : "în medie"} ${say(average)}` : ""}. ${county && hospitals ? "Lista de alături are aceleași spitale." : "Clasamentul de alături are aceleași cifre."}`}>
            <defs><pattern id="mx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) scale(${view[2] / geo.width})`}><rect width="6" height="6" className="mx-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="mx-hatch-line" /></pattern></defs>
            <g className={county ? "mx-counties is-back" : "mx-counties"}>
              {geo.counties.map((c) => {
                const a = nat?.areas.find((x) => x.key === c.key);
                const gap = natFilled && (!a || fig(a) === null);
                return <path key={c.key} d={c.d} fillRule="evenodd" vectorEffect="non-scaling-stroke"
                  className={`mx-area${gap ? " is-gap" : ""}${!county && hover === c.key ? " is-hover" : ""}${county === c.key ? " is-open" : ""}`}
                  style={county ? undefined : natFilled ? fill(a) : BASE}
                  onPointerEnter={county ? undefined : () => { fromMap.current = true; setHover(c.key); }} onClick={() => (county === c.key ? undefined : openCounty(c.key))} />;
              })}
            </g>
            {county && uatGeo && !hospitals && <UatLayer key={county} uats={uatGeo.uats} ready={loc !== null} byKey={byKey} hover={hover} fill={fill}
              onHover={(key) => { fromMap.current = true; setHover(key); }} onOpen={openUat} />}
            {county && uatGeo && hospitals && <g className="mx-uats is-plain" key={`${county}:plain`}>
              {uatGeo.uats.map((u) => <path key={u.siruta} d={u.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" className="mx-area" onPointerEnter={() => setHover(null)} />)}
            </g>}
            {/* Drawn last so their ink closes on every edge: the open county's border, the hovered area's outline. */}
            {county && shape && <path className="mx-open-edge" d={shape.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {outline && <path className="mx-outline" d={outline} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {chosen && <path className="mx-chosen" d={chosen} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {county && uatGeo && hospitals && unit > 0 && <HospitalLayer key={county} uats={uatGeo.uats} hospitals={loc?.areas ?? []} city={cityCentre} unit={unit}
              // A circle never fades into the backdrop: its ramp starts at 22% (the counties' at 7%).
              ready={loc !== null} hover={hover} tint={(a) => { const f = fig(a); return metric === "value" ? 0.55 : f === null ? null : 0.22 + 0.78 * (f / max); }}
              onHover={(key) => { fromMap.current = true; setHover(key); }} onOpen={openHospital} />}
          </svg>}
          {shown && pointer && <div className={`mx-card${pointer.x > (stageRef.current?.clientWidth ?? 0) * 0.62 ? " r" : ""}`} style={{ left: pointer.x, top: pointer.y }} aria-hidden="true">
            <b>{shown.name}</b>
            {hospitals ? <HospitalCard a={shown} metric={metric} county={!county} />
              : <>{shown.perCapita !== null ? <span><em>{int(shown.perCapita)} lei</em> pe locuitor</span>
              : <span className="mx-card-gap">{shown.gap === "no_admin" ? "Primăria nu e identificată sigur: valoare necunoscută, nu zero." : shown.gap === "no_council" ? "Consiliul județean nu e identificat: fără cifră pe locuitor." : "Fără populație cunoscută."}</span>}
            {shown.value !== null && <span className="mx-card-sub">{short(shown.value)} lei · {withDe(shown.denominator ?? shown.population ?? 0, "locuitor", "locuitori")}{shown.coverage !== undefined && shown.coverage < 0.9 ? ` · acoperire ${Math.round(shown.coverage * 100)}%` : ""}</span>}</>}
            {!county && <span className="mx-card-go">Apasă: {hospitals ? "spitalele" : "UAT-urile"} județului <Arrow /></span>}
            {county && hospitals && shown.entityId && <span className="mx-card-go">Apasă: pagina spitalului <Arrow /></span>}
          </div>}
          {busy && <p className="mx-busy g-float" role="status">Se încarcă…</p>}
        </div>
        <div className="mx-foot">
          <div className="mx-legend" aria-hidden="true">
            {(!hospitals || !county || metric !== "value") && <span className="mx-legend-g"><span>0</span><i /><span>{level ? say(max) : <G.Line inline w="3.4em" />} lei{metric === "value" ? "" : ` ${UNIT[metric]}`}</span></span>}
            {county && hospitals && <span className="mx-legend-g"><b className="mx-legend-dots"><s /><s /><s /></b><span>cercul: paturile spitalului</span></span>}
            {areas.some((a) => fig(a) === null) && <span className="mx-legend-g">{county && hospitals ? <b className="mx-legend-ring" /> : <b className="mx-legend-gap" />}<span>{hospitals ? "fără paturi în lista CNAS" : county ? "primărie neidentificată" : "fără cifră"}</span></span>}</div>
          <p className="mx-attr">Limite UAT: ANCPI; denumiri: INS SIRUTA (<a href="https://data.gov.ro/dataset/unitati-administrativ-teritoriale-07-03-2024" target="_blank" rel="noreferrer">data.gov.ro</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>), simplificate. {hospitals ? <>Paturi: <a href="https://cnas.ro/spitale" target="_blank" rel="noreferrer">CNAS</a>, structura aprobată la 31.12.2025.</> : "Populația: INS, RPL 2021."}</p>
        </div>
      </section>

      <aside className="mx-rank" aria-labelledby="mx-rank-h" aria-busy={!level || stale || undefined}>
        <h2 id="mx-rank-h">{county ? (hospitals ? "Spitalele" : county === "bucuresti" ? "Sectoarele" : "UAT-urile") : "Județele"} <span aria-live="polite">lei {UNIT[metric]}{metric === "perBed" ? ` · ${BEDS_YEAR}` : ""}{shown && hoverPlace > 0 ? ` · ${shown.name} ${place(hoverPlace)}` : ""}</span></h2>
        {!level ? <RankGhost names={county ? (hospitals ? null : uatGeo?.uats.map((u) => u.name) ?? null) : geo?.counties.map((c) => c.name) ?? null} rows={county ? null : 42}
          city={county === "bucuresti"} folded={unfolded !== (county ?? "")} key={county ?? ""} /> : <>
        {county && loc?.city && <div className={`mx-city${hover === loc.city.key ? " is-hover" : ""}${stale ? " g-stale" : ""}`} onPointerEnter={() => setHover(loc.city!.key)} onPointerLeave={() => setHover(null)}>
          <b>{loc.city.name}</b><span>pentru tot orașul, pe {withDe(loc.city.denominator ?? 0, "locuitor", "locuitori")}</span>
          <em>{loc.city.perCapita === null ? "—" : `${int(loc.city.perCapita)} lei`}</em>
        </div>}
        <ol className={`mx-rows${unfolded === (county ?? "") ? "" : " is-folded"}${atEnd ? " at-end" : ""}${stale ? " g-stale" : ""}${metric === "perBed" ? " has-total" : metric === "value" ? " is-lei" : ""}`} ref={listRef} key={rankLevel}
          data-chart="" onAnimationEnd={rankMotion.onAnimationEnd} onScroll={(e) => { const el = e.currentTarget; setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4); }}>
          {ranked.map((a, i) => {
            const f = fig(a), gap = f === null;
            const bar = <span className="mx-bar" aria-hidden="true">{!gap && <i className={`cm-tw ${rankMotion.mark(a.key, i < 10 ? "cm-x" : "")}`}
              style={{ width: `${Math.max(1.5, (f / max) * 100)}%`, opacity: 0.25 + 0.75 * (f / max), "--i": i } as CSSProperties} />}</span>;
            const total = metric === "perBed" ? <span className="mx-v2" title="total contractat">{a.value === null ? "—" : short(a.value)}</span> : null;
            // A county's hospital (owner, 8 November 2026): its name is the link to its page; the row lights its circle.
            if (county && hospitals) return <li key={a.key} data-key={a.key}>
              <div className={`mx-row${hover === a.key ? " is-hover" : ""}${gap ? " is-gap" : ""}`} onPointerEnter={() => { fromMap.current = false; setHover(a.key); }} onPointerLeave={() => setHover(null)}
                onFocus={() => { fromMap.current = false; setHover(a.key); }} onBlur={() => setHover(null)}>
                <span className="mx-n">{gap ? "" : i + 1}</span>
                <span className="mx-name"><EntityName id={a.entityId} className="mx-clamp" title={a.name}>{a.name}</EntityName><small>{a.beds ? withDe(a.beds, "pat", "paturi") : "fără paturi în lista CNAS"}</small></span>
                {bar}
                <span className="mx-v">{gap ? "—" : say(f)}</span>{total}
              </div>
            </li>;
            return <li key={a.key} data-key={a.key}>
              <button type="button" className={`mx-row${hover === a.key ? " is-hover" : ""}${gap ? " is-gap" : ""}`} onPointerEnter={() => { fromMap.current = false; setHover(a.key); }} onPointerLeave={() => setHover(null)}
                onFocus={() => { fromMap.current = false; setHover(a.key); }} onBlur={() => setHover(null)} onClick={() => (county ? openUat(a.key) : openCounty(a.key))}
                aria-label={`${a.name}: ${gap ? "fără cifră" : `${say(f)} lei ${UNIT[metric]}`}${total && a.value !== null ? `, ${short(a.value)} lei în total` : ""}${county ? ". Deschide fișa UAT-ului" : hospitals ? ". Deschide spitalele județului" : ". Deschide UAT-urile județului"}`} aria-pressed={county ? uat === a.key : undefined}>
                <span className="mx-n">{gap ? "" : i + 1}</span>
                <span className="mx-name">{a.name}{hospitals ? (a.institutions ? <small>{withDe(a.institutions, "spital", "spitale")}</small> : null) : a.coverage !== undefined && a.coverage < 0.9 && <small>acoperire {Math.round(a.coverage * 100)}%</small>}</span>
                {bar}
                <span className="mx-v">{gap ? "—" : say(f)}</span>{total}
              </button>
            </li>;
          })}
        </ol>
        {ranked.length > 15 && unfolded !== (county ?? "") && <button type="button" className="mx-more" onClick={() => setUnfolded(county ?? "")}>Toate cele {ranked.length}</button>}
        {!busy && !ranked.length && <p className="mx-note">Nicio valoare în această selecție.</p>}
        </>}
        <p className="mx-note">{hospitals
          ? (county ? "Fiecare spital e desenat în orașul lui, nu la adresă." : metric === "perBed" ? "Lei pe pat: valoarea din 2025 a spitalelor cu paturi, la paturile lor aprobate." : `Lei pe pat apare doar cu ${BEDS_YEAR} ales singur.`)
          : county ? "Un UAT fără primărie identificată nu are cifră: nu înseamnă zero lei." : "Un județ se împarte la locuitorii UAT-urilor ale căror primării le identificăm."} Valori contractate, nu plăți, în plafoanele totalurilor <Term id="plafoane-totaluri" tip /></p>
      </aside>
      {county && uat && !hospitals && <UatPanel siruta={uat} query={selection} hint={byKey.get(uat) && { name: byKey.get(uat)!.name, county: countyArea?.name, gap: byKey.get(uat)!.perCapita === null }}
        onClose={() => setUat(null)} onPick={openUat} />}
    </div>}
    {stale && <FloatStatus>Se încarcă…</FloatStatus>}
  </div>;
}

/** The hover card of a hospital or of a county's hospitals: lei per bed (2025 alone) or the total, then beds and count. */
function HospitalCard({ a, metric, county }: { a: MapArea; metric: MapMetric; county: boolean }) {
  const beds = a.beds ? withDe(a.beds, "pat", "paturi") : null;
  const count = county ? withDe(a.institutions, "spital", "spitale") : null;
  if (metric === "perBed") return <>
    {a.perBed != null ? <span><em>{int(a.perBed)} lei</em> pe pat</span> : <span className="mx-card-gap">Fără paturi în lista CNAS: fără cifră pe pat.</span>}
    <span className="mx-card-sub">{[a.value !== null ? `${short(a.value)} lei` : null, beds, count].filter(Boolean).join(" · ")}</span>
  </>;
  return <>
    <span><em>{short(a.value ?? 0)} lei</em> contractați</span>
    <span className="mx-card-sub">{[beds ?? (county ? null : "fără paturi în lista CNAS"), count].filter(Boolean).join(" · ")}</span>
  </>;
}

/** The ramp's base tint: an area at zero lei, and every area of a layer whose numbers are not in yet. */
const BASE = { fillOpacity: 0.07 } as const;

/** The open county's UATs: a layer of their own (keyed by county), so each opening fills in anew (motion.ts). */
function UatLayer({ uats, ready, byKey, hover, fill, onHover, onOpen }: {
  uats: UatShape[]; ready: boolean; byKey: Map<string, MapArea>; hover: string | null;
  fill: (a: MapArea | undefined) => CSSProperties | undefined; onHover: (key: string) => void; onOpen: (key: string) => void;
}) {
  const filled = useFillIn(ready);
  return <g className="mx-uats">
    {uats.map((u) => {
      const key = String(u.siruta), a = byKey.get(key), gap = filled && (!a || a.perCapita === null);
      return <path key={key} d={u.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" className={`mx-area${gap ? " is-gap" : ""}${hover === key ? " is-hover" : ""}`}
        style={filled ? fill(a) : BASE} onPointerEnter={() => onHover(key)} onClick={() => onOpen(key)} />;
    })}
  </g>;
}

/*
 * The ranking while a level loads (owner, 6 November 2026: "ghost data loading"): its rows, as many as the level has
 * and with their real names once the shapes are in (counties, or the county's UATs), the rank, bar and value pulsing.
 * The names are in the map's order, not ranked yet; the list keeps its height (15 rows and "Toate cele N" on phones).
 */
function RankGhost({ names, rows, city, folded }: { names: string[] | null; rows: number | null; city: boolean; folded: boolean }) {
  const n = names?.length ?? rows ?? 15;
  return <Ghost className="mx-rank-ghost" name="mx-rank" wait="client">
    {city && <div className="mx-city" aria-hidden="true"><b>Primăria Municipiului București</b><span><G.Line w="70%" /></span><em><G.Line w="4.5em" /></em></div>}
    <ol className={`mx-rows${folded ? " is-folded" : ""}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <li key={i}><div className="mx-row">
        <span className="mx-n" /><span className="mx-name">{names?.[i] ?? <G.Line w={`${58 - (i % 4) * 9}%`} />}</span>
        <span className="mx-bar" /><span className="mx-v"><G.Line w="100%" /></span>
      </div></li>)}
    </ol>
    {n > 15 && folded && <p className="mx-more" aria-hidden="true">Toate cele {n}</p>}
  </Ghost>;
}
