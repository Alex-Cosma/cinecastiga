"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Popover from "@/app/intreaba/builder/pickers/Popover";
import OptionList from "@/app/intreaba/builder/pickers/OptionList";
import type { KitOption } from "@/app/intreaba/builder/kit-types";
import "@/app/intreaba/builder/filters-kit.css";
import Term from "@/components/Term";
import { G, Ghost } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EntityName from "@/components/EntityName";
import { writeAddress } from "@/lib/address";
import { entityHref } from "@/lib/entity-href";
import HospitalLayer from "./HospitalLayer";
import { pupilRadius } from "./dots";
import MapSearch from "./MapSearch";
import UatPanel from "./UatPanel";
import type { MapSearchInstitution, MapSearchPlace } from "@/lib/map-search";
import { useEntrance, useFillIn, useGlide } from "./motion";
import { SelectPath, useLeaving } from "../../components/motion/Selection";
import WorkLine from "../../components/motion/WorkLine";
import { EASE_CAMERA } from "../../components/motion/outline";
import { chartPace } from "../../components/motion/pace";
import { BEDS_YEAR, dotted as isDotted, figure, KIND_URL, mapMetric, PUPILS_YEAR, type MapArea, type MapDataset, type MapCounts, type MapKind, type MapMetric, type MapOptions, type MapResponse } from "@/lib/map-capita-shared";

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
/** The kinds of institution (owner: hospitals and schools since 8 November 2026). */
const KINDS: KitOption[] = [
  { value: "local_admin", label: "Primării și consilii județene", detail: "primăria fiecărui UAT; la județ, și consiliul județean" },
  { value: "hospitals", label: "Spitale publice", detail: "lista CNAS, cu paturile; lei pe pat doar pentru 2025" },
  { value: "schools", label: "Școli și grădinițe publice", detail: "rețeaua Ministerului Educației, cu elevii; lei pe elev doar pentru 2025" },
];
/** What a figure is called, after its number. */
const UNIT: Record<MapMetric, string> = { perCapita: "pe locuitor", perBed: "pe pat", perPupil: "pe elev", value: "contractați" };
/** The kind's words: its institutions (plural, articled) and its address word. */
const KIND_WORDS: Record<MapKind, { plural: string; button: string }> = {
  local_admin: { plural: "UAT\u2011urile", button: "Primării și CJ" },
  hospitals: { plural: "Spitalele", button: "Spitale" },
  schools: { plural: "Școlile și grădinițele", button: "Școli și grădinițe" },
};

const int = (n: number) => Math.round(n).toLocaleString("ro-RO");
/**
 * The year the map opens on (owner, 16 November 2026, UX audit Z4-05): the last complete year, so the first figure is
 * one a reader can set beside a yearly budget; „Toată perioada” is one click away and writes `ani=toti`. The address
 * always carries `ani`; an older link without it (made when the whole period was the default) keeps that meaning.
 */
const THIS_YEAR = new Date().getFullYear();
const LAST_FULL = String(THIS_YEAR - 1);
const roDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
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
/** How long the pointer rests on an area of the map before the ranking scrolls to its row (owner, 7 November 2026). */
const FOLLOW_DELAY = 250;
/** „UAT-ul” with a hyphen that does not break the line (UX audit Z4-23: „UAT-” / „uri” at a line's end). */
const NB = (text: string) => text.replace(/-/g, "\u2011");
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const withDe = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${int(n)}${n % 100 === 0 || n % 100 >= 20 ? " de" : ""} ${many}`);

/** Brings a ranking row into view inside the list's own scroll (never the page's), clear of the bottom fade. */
function followRow(list: HTMLElement | null, key: string, top = false) {
  const row = list?.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (!list || !row) return;
  // Measured against the list itself (offsetTop counts from the page's positioned ancestor, which hid the top rows).
  const at = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop, bottom = at + row.offsetHeight;
  const to = top || at < list.scrollTop ? at - 8 : bottom > list.scrollTop + list.clientHeight - 44 ? bottom - list.clientHeight + 48 : null;
  if (to === null) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: Math.max(0, to), behavior: reduce ? "auto" : "smooth" });
}

function Pick({ label, text, title, children, wide = false, className, onOpen }: { label: string; text: string; title: string; children: ReactNode; wide?: boolean; className?: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={button} type="button" className={className ? `mx-pick ${className}` : "mx-pick"} aria-expanded={open} aria-haspopup="dialog" onClick={() => { if (!open) onOpen?.(); setOpen((o) => !o); }}>
      <span>{label}</span><b>{text}</b>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <Popover open={open} anchor={button.current} onClose={() => setOpen(false)} title={title} wide={wide}
      foot={<><span /><button type="button" className="qb-primary" onClick={() => setOpen(false)}>Gata</button></>}>
      <div className="mx-pop-list">{children}</div>
    </Popover>
  </>;
}

type Initial = { ani?: string | undefined; cpv?: string | undefined; canal?: string | undefined; judet?: string | undefined; uat?: string | undefined; inst?: string | undefined; cu?: string | undefined };
type AddressView = { years: Years; cpv: Years; dataset: MapDataset; kind: MapKind; withInst: boolean; county: string | null; uat: string | null };
/** What the map keeps in its history entries: the view an entry was opened from. */
type HistoryView = { mxBack?: { county: string | null; uat: string | null } | null };

/** An address's parameters (a repeated one is ignored). */
function addressOf(p: URLSearchParams): Initial {
  const one = (key: string) => { const all = p.getAll(key); return all.length === 1 ? all[0] : undefined; };
  return { ani: one("ani"), cpv: one("cpv"), canal: one("canal"), judet: one("judet"), uat: one("uat"), inst: one("inst"), cu: one("cu") };
}
const listOf = (raw: string | undefined, valid: RegExp): Years => {
  const items = (raw ?? "").split(",").map((s) => s.trim()).filter((s) => valid.test(s));
  return items.length ? [...new Set(items)].sort() : "all";
};
/** The view an address holds: on a first visit, and on Back or Forward. */
function viewOf(a: Initial): AddressView {
  const picked = a.ani === "toti" ? "all" : listOf(a.ani, /^20\d\d$/);
  // No `ani`: a bare /harta opens on the last complete year; an older link that holds a view keeps the whole period.
  const years = a.ani === "toti" || picked !== "all" ? picked : [a.judet, a.uat, a.cpv, a.canal, a.inst, a.cu].some(Boolean) ? "all" : [LAST_FULL];
  const county = a.judet && /^[a-z-]{2,20}$/.test(a.judet) ? a.judet : null;
  return {
    years, cpv: listOf(a.cpv, /^\d\d$/), dataset: DATASETS.find((d) => d.url === a.canal)?.value ?? "all",
    kind: a.inst === KIND_URL.hospitals ? "hospitals" : a.inst === KIND_URL.schools ? "schools" : "local_admin",
    // The local administrations with their institutions: ticked unless `?cu=fara` (an old `?cu=institutii` still opens them).
    withInst: a.cu !== "fara", county, uat: county && a.uat && /^\d{1,7}$/.test(a.uat) ? a.uat : null,
  };
}

export default function MapExplorer({ initial }: { initial: Initial }) {
  // The address is the view. Back from a page opened here (a year of a UAT's panel) remounts the map from the
  // router's cache, whose props are the first visit's (often a bare /harta), while the address already holds the
  // county and the UAT that were open: the browser reads the address, the server its own copy of it.
  const [start] = useState<AddressView>(() => viewOf(typeof window === "undefined" ? initial : addressOf(new URLSearchParams(window.location.search))));
  const [years, setYears] = useState<Years>(start.years);
  const [cpv, setCpv] = useState<Years>(start.cpv);
  const [dataset, setDataset] = useState<MapDataset>(start.dataset);
  // The kind of institution (owner, 8 November 2026): the local administrations, the public hospitals (`?inst=spitale`)
  // or the public schools (`?inst=scoli`).
  const [kind, setKind] = useState<MapKind>(start.kind);
  const hospitals = kind === "hospitals", schools = kind === "schools";
  // Hospitals and schools: circles inside a county, each in its UAT, with their list beside the map.
  const dots = isDotted(kind);
  // The local administrations with their institutions (owner, 8 November 2026): a checkbox under "Primării și consilii
  // județene" in the kind's window, ticked by default; `?cu=fara` without them (an old `?cu=institutii` still opens them).
  const [withInst, setWithInst] = useState<boolean>(start.withInst);
  const sub = kind === "local_admin" && withInst;
  const router = useRouter();
  const [county, setCounty] = useState<string | null>(start.county);
  // The UAT whose panel is open (owner, 6 November 2026): its SIRUTA, inside the open county.
  const [uat, setUat] = useState<string | null>(start.uat);
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
  // How many each layer holds (Z4-30): read once, when the „Instituții” window first opens.
  const [counts, setCounts] = useState<MapCounts | null>(null);
  const asked = useRef(false);
  const loadCounts = () => {
    if (asked.current) return;
    asked.current = true;
    void fetch("/api/map/counts").then((r) => (r.ok ? r.json() as Promise<MapCounts> : null)).then((c) => { if (c) setCounts(c); else asked.current = false; }).catch(() => { asked.current = false; });
  };
  // The data's last day, for a current year (Z4-06): read once, only when such a year is chosen.
  const [through, setThrough] = useState<string | null>(null);
  // Phones show the first 15 of the ranking (owner: no long phone lists); a county change folds it again.
  const [unfolded, setUnfolded] = useState<string | null>(null);
  // A touch first chooses, then opens (UX audit Z4-03, as the years of a UAT's panel): the chosen county, hospital or
  // school is outlined and its figures stand in a card under the map with „Deschide ›”; a second touch or the button opens it.
  const [tapped, setTapped] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  /** A county opened from a click or a key: after it, focus that was on its row (now gone) goes to „← România” (Z4-18). */
  const opener = useRef<"county" | null>(null);
  const crumbRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // What the search chose (Z4-01): its name stays in the field while the map shows it; a hospital or a school stays lit.
  const [found, setFound] = useState<{ label: string; county: string; uat: string | null; kind: MapKind; key: string | null } | null>(null);
  // Where the hover came from: only the map's scrolls the ranking (a row under the pointer must never move away).
  const fromMap = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const selection = useMemo(() => {
    const p = new URLSearchParams({ years: years === "all" ? "all" : years.join(","), cpv: cpv === "all" ? "all" : cpv.join(","), dataset, kind });
    if (sub) p.set("sub", "1");
    return p.toString();
  }, [years, cpv, dataset, kind, sub]);
  const nationalKey = `level=county&${selection}`;
  const localKey = county ? `level=uat&county=${county}&${selection}` : null;

  // The country's shapes, once; the filter options, once per kind.
  useEffect(() => {
    void fetch("/geo/romania.json").then((r) => r.json()).then((g: Geo) => setGeo(g)).catch(() => setError("Harta nu s-a putut încărca. Reîncearcă."));
  }, []);
  useEffect(() => {
    let live = true;
    void fetch(`/api/map/options?kind=${kind}${sub ? "&sub=1" : ""}`).then((r) => r.json()).then((o: MapOptions) => { if (live) setOptions(o); }).catch(() => undefined);
    return () => { live = false; };
  }, [kind, sub]);
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
  // Back closes a county opened by a click (its own history entry); the breadcrumb and Escape do the same. Each entry
  // the map adds remembers the view it was opened from (`mxBack` in the entry's state), so closing back to exactly that
  // view goes back to that entry instead of writing a second copy of it (UX audit: X on a panel, then Back, did nothing).
  const fromPop = useRef(false);
  /** A close that went Back: the entry it lands on gives only the county and the UAT; the filters stay as they are. */
  const closing = useRef(false);
  /** The next write is a new entry even without a new county or UAT (a choice in the search). */
  const pushNext = useRef(false);
  const shownCounty = useRef<string | null>(county);
  const shownUat = useRef<string | null>(uat);
  useEffect(() => {
    const onPop = () => {
      const v = viewOf(addressOf(new URLSearchParams(window.location.search)));
      fromPop.current = true;
      setCounty(v.county); setUat(v.uat);
      if (closing.current) { closing.current = false; return; }
      // Back or Forward over an entry the search added may change the layer and its filters too.
      setKind(v.kind); setWithInst(v.withInst); setYears(v.years); setCpv(v.cpv); setDataset(v.dataset);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // The address keeps the view: a copied link reopens it.
  useEffect(() => {
    const p = new URLSearchParams();
    const inst = KIND_URL[kind];
    if (inst) p.set("inst", inst);
    if (kind === "local_admin" && !sub) p.set("cu", "fara");
    p.set("ani", years === "all" ? "toti" : years.join(","));
    if (cpv !== "all") p.set("cpv", cpv.join(","));
    const canal = DATASETS.find((d) => d.value === dataset)?.url;
    if (canal) p.set("canal", canal);
    if (county) p.set("judet", county);
    if (county && uat) p.set("uat", uat);
    const q = p.toString(), url = `${window.location.pathname}${q ? `?${q}` : ""}`;
    // Opening a county or a UAT's panel is a history entry: Back closes it.
    const opened = !fromPop.current && (pushNext.current || (county !== null && county !== shownCounty.current) || (uat !== null && uat !== shownUat.current));
    const back = opened ? { county: shownCounty.current, uat: shownUat.current } : (window.history.state as HistoryView | null)?.mxBack ?? null;
    writeAddress(url, opened ? "push" : "replace", { mxBack: back });
    shownCounty.current = county; shownUat.current = uat; fromPop.current = false; pushNext.current = false;
  }, [years, cpv, dataset, county, uat, kind, sub]);
  /** Closes the panel (to its county) or the county (to the country): Back when this entry was opened from exactly there. */
  const closeTo = (to: string | null) => {
    const back = (window.history.state as HistoryView | null)?.mxBack;
    if (back && back.county === to && back.uat === null) { closing.current = true; window.history.back(); return; }
    setUat(null); setCounty(to);
  };
  const closeRef = useRef(closeTo);
  closeRef.current = closeTo;
  // Escape steps back to the country.
  useEffect(() => {
    if (!county) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      closeRef.current(uat ? county : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [county, uat]);

  // Another level or layer drops what a touch chose.
  useEffect(() => { setTapped(null); }, [county, kind]);
  // Focus that the change of level left on the page's body (UX audit Z4-18): after a county opens, on „← România”; after
  // a panel or a county closes, on the row of what was open.
  const wasOpen = useRef<{ county: string | null; uat: string | null }>({ county, uat });
  useEffect(() => {
    const before = wasOpen.current;
    wasOpen.current = { county, uat };
    const lost = !document.activeElement || document.activeElement === document.body;
    if (opener.current === "county") { opener.current = null; if (county && lost) crumbRef.current?.focus({ preventScroll: true }); return; }
    const back = before.uat && !uat ? before.uat : before.county && !county ? before.county : null;
    if (!back || !lost) return;
    // The list may be rebuilt (the country's rows): its row once it is in.
    const frame = window.requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-key="${back}"] .mx-row`)?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
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
  // A county's schools (owner, 8 November 2026): the circles' ramp stops at the 95th percentile, so a few outliers (a
  // police school's 40,000 lei per pupil) do not pale every other school; those above it take the darkest tint. The
  // list keeps the exact figures and its bars.
  const dotTop = (() => {
    if (!county || !schools) return max;
    const v = areas.map((a) => fig(a)).filter((f): f is number => f !== null).sort((a, b) => a - b);
    return v.length ? Math.min(max, Math.max(1, v[Math.floor(0.95 * (v.length - 1))]!)) : max;
  })();
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
    if (metric === "perPupil") {
      const pupils = known.reduce((s, a) => s + (a.pupils ?? 0), 0);
      return pupils ? known.reduce((s, a) => s + (a.perPupil ?? 0) * (a.pupils ?? 0), 0) / pupils : null;
    }
    const pop = known.filter((a) => a.denominator).reduce((s, a) => s + (a.denominator ?? 0), 0);
    return pop ? known.reduce((s, a) => s + (a.value ?? 0), 0) / pop : null;
  })();
  /** A figure as the page writes it: lei per inhabitant or per bed in full, totals short ("1,6 mld."). */
  const say = (n: number) => (metric === "value" ? short(n) : int(n));
  const allYears = (options?.years ?? []).map((y) => y.year);
  const cpvWords = cpv === "all" ? "toate domeniile" : cpv.length === 1 ? (options?.cpv.find((c) => c.code === cpv[0])?.name ?? `CPV ${cpv[0]}`).toLowerCase() : `${cpv.length} domenii`;
  const channelWords = dataset === "da" ? ", prin achiziții directe" : dataset === "contracts" ? ", prin proceduri" : "";
  const tint = (a: MapArea): number | null => { const f = figure(a, metric); return f === null ? null : BASE.fillOpacity + (1 - BASE.fillOpacity) * (f / max); };
  const fill = (a: MapArea | undefined): CSSProperties | undefined => { const t = a ? tint(a) : null; return t === null ? undefined : { fillOpacity: t }; };
  // The counties fill in together once their numbers are in (motion.ts); until then they wait at the base tint.
  const natFilled = useFillIn(Boolean(geo && view && nat));
  const tappedArea = tapped ? byKey.get(tapped) ?? null : null;
  const tappedShape = tapped && !county && geo ? geo.counties.find((c) => c.key === tapped)?.d ?? null : null;
  const shown = hover ? byKey.get(hover) ?? (loc?.city?.key === hover ? loc.city : undefined) : undefined;
  const busy = !level || (county !== null && !countyGeo[county]);
  const uatGeo = county ? countyGeo[county] : undefined;
  const chosen = uat && uatGeo && !dots ? uatGeo.uats.find((u) => String(u.siruta) === uat)?.d ?? null : null;
  // A selection draws once (M-03): the county one enters while the camera moves, in the camera's time; a UAT or a tapped
  // county without the camera in 600 ms × pace; leaving („← România”, Escape) runs it back in 200 ms.
  const camAt = useRef(0);
  useEffect(() => { camAt.current = performance.now(); }, [county]);
  const drawTime = () => { const glide = 560 * chartPace(), since = performance.now() - camAt.current; return since < glide ? Math.max(300, glide - since) : 600 * chartPace(); };
  const openSel = useLeaving(useMemo(() => (county && shape ? { id: `c:${county}`, d: shape.d } : null), [county, shape]), 200);
  const pickSel = useLeaving(useMemo(() => (chosen ? { id: `u:${uat}`, d: chosen } : tappedShape ? { id: `t:${tapped}`, d: tappedShape } : null), [chosen, uat, tappedShape, tapped]), 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the time is taken when a new selection appears
  const openDur = useMemo(drawTime, [openSel.shown?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pickDur = useMemo(drawTime, [pickSel.shown?.id]);
  const outline = !hover || !geo ? null : county ? uatGeo?.uats.find((u) => String(u.siruta) === hover)?.d ?? null : geo.counties.find((c) => c.key === hover)?.d ?? null;
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
  const openHospital = (a: MapArea) => {
    if (touch && tapped !== a.key) { setTapped(a.key); return; }
    if (a.entityId) router.push(entityHref(a.entityId));
  };
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
    const timer = window.setTimeout(() => followRow(listRef.current, hover), FOLLOW_DELAY);
    return () => window.clearTimeout(timer);
  }, [hover]);
  // A UAT's panel opened (UX audit Z4-14): the ranking moves under the map in a shorter box; its row comes to the top
  // of it, whole, instead of the old scroll cutting a row in half.
  useEffect(() => {
    if (!uat || dots) return;
    const frame = window.requestAnimationFrame(() => followRow(listRef.current, uat, true));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uat, level]);
  // A hospital or a school chosen in the search: its row comes into view (unfolded on phones) once the list is in.
  const choice = found && found.county === county && found.kind === kind && (found.uat === null || found.uat === uat) ? found : null;
  const lit = choice?.key ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the time is taken when the search chooses
  const litDur = useMemo(drawTime, [lit]);
  useEffect(() => {
    if (!lit || !level) return;
    if (ranked.findIndex((a) => a.key === lit) >= 15) setUnfolded(county ?? "");
    const frame = window.requestAnimationFrame(() => followRow(listRef.current, lit, true));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit, level]);

  function track(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
  const openCounty = (key: string) => { setHover(null); setTapped(null); setUat(null); setCounty(key); opener.current = "county"; };
  const openUat = (key: string) => { setHover(key); setUat(key); };
  const pickPlace = (p: MapSearchPlace) => {
    const siruta = p.siruta === BUCHAREST_CITY ? null : String(p.siruta);
    pushNext.current = true; setHover(null); setKind("local_admin"); setCounty(p.county); setUat(siruta);
    setFound({ label: p.name, county: p.county, uat: siruta, kind: "local_admin", key: null });
  };
  const pickInstitution = (i: MapSearchInstitution) => {
    pushNext.current = true; setHover(null); setUat(null); setKind(i.kind); setCounty(i.county);
    setFound({ label: i.name, county: i.county, uat: null, kind: i.kind, key: i.key });
  };

  // Hospitals and schools: only 2025 alone has lei per bed or per pupil (owner, 8 November 2026), and the year's choice says so.
  const yearDetail = (year: string) => Number(year) >= new Date().getFullYear() ? "an în curs, incomplet"
    : hospitals && year === BEDS_YEAR ? "singur: și lei pe pat de spital" : schools && year === PUPILS_YEAR ? "singur: și lei pe elev" : null;
  const yearOptions: KitOption[] = [{ value: "all", label: "Toată perioada", detail: `${yearsWords("all", allYears)}, cu înregistrările fără dată` },
    ...(options?.years ?? []).map((y) => { const detail = yearDetail(y.year); return { value: y.year, label: y.year, count: `${short(y.value)} lei`, ...(detail ? { detail } : {}) }; })];
  const top = Math.max(1, ...(options?.cpv ?? []).map((c) => c.value));
  const q = search.trim().toLowerCase();
  const cpvOptions: KitOption[] = [...(q ? [] : [{ value: "all", label: "Toate domeniile", detail: "cu înregistrările fără cod CPV" }]),
    ...(options?.cpv ?? []).filter((c) => !q || `${c.code} ${c.name} ${c.official ?? ""}`.toLowerCase().includes(q))
      .map((c) => ({ value: c.code, label: `${c.code} · ${c.name}`, count: `${short(c.value)} lei`, share: c.value / top, ...(c.official && c.official !== c.name ? { detail: c.official } : {}) }))];

  // The current year chosen (Z4-06): the sentence and the button say it is not over, with the data's last day.
  const current = years !== "all" && years.some((y) => Number(y) >= THIS_YEAR);
  const periodWords = `${yearsWords(years, allYears)}${current ? ` (an în curs${through ? `, date până la ${roDay(through)}` : ""})` : ""}`;
  const narrowWords = `${cpv === "all" ? "" : `, doar ${cpvWords}`}${channelWords}`;
  const whoWords = hospitals ? "Ce au contractat spitalele publice" : schools ? "Ce au contractat școlile și grădinițele publice" : sub ? "Ce au contractat primăriile și consiliile județene, cu instituțiile lor" : "Ce au contractat primăriile și consiliile județene";
  useEffect(() => {
    if (!current || through) return;
    let live = true;
    void fetch("/api/data-coverage").then((r) => (r.ok ? r.json() : null)).then((c: { periods?: { da?: { to?: string | null }; contracts?: { to?: string | null } } | null } | null) => {
      const days = [c?.periods?.da?.to, c?.periods?.contracts?.to].filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10)).sort();
      if (live && days.length) setThrough(days[days.length - 1]!);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [current, through]);
  /** How many of the refining filters are on (the phone's „Filtre · 2”). */
  const narrowed = (cpv === "all" ? 0 : 1) + (dataset === "all" ? 0 : 1);
  const segment = DATASETS.map((d) => <button key={d.value} type="button" aria-pressed={dataset === d.value} onClick={() => setDataset(d.value)}>{d.label}</button>);
  const domains = <>
    <input className="mx-search" type="search" placeholder="Caută un domeniu sau un cod CPV" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Caută un domeniu" />
    {cpvOptions.length ? <OptionList label="Domenii" multiple values={cpv === "all" ? ["all"] : cpv} options={cpvOptions} onChange={(v, source) => { if (source === "activate") setCpv((c) => toggle(c, v)); }} />
      : <p className="qb-pop-note">Niciun domeniu nu se potrivește.</p>}
  </>;

  return <div className="mx">
    <header className="mx-head">
      {hospitals
        ? <h1>{county ? `Spitalele din ${countyName || "județ"}` : metric === "perBed" ? "Lei pe pat de spital, pe județe" : "Spitalele, pe județe"}</h1>
        : schools ? <h1>{county ? `Școlile și grădinițele din ${countyName || "județ"}` : metric === "perPupil" ? "Lei pe elev, pe județe" : "Școlile și grădinițele, pe județe"}</h1>
        : <h1>{county ? `Lei pe locuitor în ${countyName || "județ"}` : "Lei pe locuitor, pe județe"}</h1>}
      {/* The figure, its period and only what the buttons do not say at once (Z4-21): the domains and the channel, which
          sit behind „Filtre” on phones. The whole sentence (who, period, domains) stays in the map's label. */}
      <p className="mx-lede">{average !== null || !nat ? <span className={natStale ? "g-stale" : undefined}>{dots
          ? (county ? countyName : metric === "perBed" || metric === "perPupil" ? "Media țării" : "În total")
          : county ? (county === "bucuresti" ? "București, cu primăria municipiului" : `${countyName}, cu consiliul județean`) : "Media țării"}: <b>{average !== null ? `${say(average)} lei` : <G.Line inline w="4.6em" />}</b>{metric === "value" ? "" : ` ${UNIT[metric]}`}, {periodWords}{narrowWords}.</span>
        : <>{whoWords}, {periodWords}{narrowWords}.</>}
        {/* The comparable figure one click away (UX audit Z4-07): lei per bed or per pupil exist for 2025 alone; the period stays the reader's. */}
        {dots && metric === "value" && <> <button type="button" className="mx-lede-go" onClick={() => setYears([hospitals ? BEDS_YEAR : PUPILS_YEAR])}>{hospitals ? `Lei pe pat, ${BEDS_YEAR}` : `Lei pe elev, ${PUPILS_YEAR}`} ›</button></>}</p>
    </header>

    <div className="mx-filters" role="group" aria-label="Ce arată harta">
      <MapSearch chosen={choice?.label ?? null} onPlace={pickPlace} onInstitution={pickInstitution} />
      <Pick label="Instituții" text={sub ? "Primării și CJ, cu instituțiile lor" : KIND_WORDS[kind].button} title="Ce instituții?" className="mx-pick--kind" onOpen={loadCounts}>
        <OptionList label="Instituții" value={kind} options={KINDS.map((k) => (counts ? { ...k, count: int(counts[k.value as MapKind]) } : k))}
          onChange={(v) => { if (v === "local_admin" || v === "hospitals" || v === "schools") { setKind(v); setUat(null); setHover(null); } }}
          under={kind !== "local_admin" ? undefined : { after: "local_admin", node: <label className="mx-check">
            <input type="checkbox" checked={withInst} onChange={(e) => setWithInst(e.target.checked)} />
            <span>cu instituțiile lor</span><Term id="institutiile-lor" tip />
            {counts && <small>+{int(counts.institutions)} {counts.institutions === 1 ? "instituție" : "instituții"}, {withDe(counts.companies, "companie", "companii")}</small>}
          </label> }} />
      </Pick>
      <Pick label="Perioada" text={years === "all" ? "Toată perioada" : `${yearsWords(years, allYears)}${current ? " · în curs" : ""}`} title="Ce ani?">
        <OptionList label="Perioada" multiple values={years === "all" ? ["all"] : years} options={yearOptions} onChange={(v, source) => { if (source === "activate") setYears((y) => toggle(y, v)); }} />
      </Pick>
      <Pick label="Domenii" text={cpv === "all" ? "Toate" : cpv.length === 1 ? cpvWords : `${cpv.length} domenii`} title="Ce domenii?" wide className="mx-pick--cpv">{domains}</Pick>
      <div className="mx-seg" role="group" aria-label="Achiziții">{segment}</div>
      {/* Phones (Z4-04): the domains and the channel only refine, so they share one button and one sheet. */}
      <Pick label={narrowed ? `Filtre · ${narrowed}` : "Filtre"} text={narrowed ? [cpv === "all" ? null : cpv.length === 1 ? capital(cpvWords) : `${cpv.length} domenii`, dataset === "da" ? "directe" : dataset === "contracts" ? "proceduri" : null].filter(Boolean).join(" · ") : "Toate domeniile și achizițiile"}
        title="Filtre" wide className={`mx-pick--more${narrowed ? " is-on" : ""}`}>
        <h4 className="mx-pop-h">Achiziții</h4>
        <div className="mx-seg mx-seg--sheet" role="group" aria-label="Achiziții">{segment}</div>
        <h4 className="mx-pop-h">Domenii</h4>
        {domains}
      </Pick>
    </div>

    {error ? <div className="mx-error" role="alert"><p>{error}</p><button type="button" className="mx-btn" onClick={() => setRetry((r) => r + 1)}>Reîncearcă</button></div> : <div className={`mx-body${county && uat && !dots ? " has-panel" : ""}`}>
      <section className={`mx-stage${busy ? " is-busy" : ""}`} aria-label={county ? `Harta județului ${countyName}` : "Harta României pe județe"}>
        {county && <p className="mx-crumb"><button type="button" ref={crumbRef} onClick={() => closeTo(null)}><Arrow back /> România</button><span>· {countyName}</span></p>}
        <div className="mx-map" ref={stageRef} onPointerMove={track} onPointerLeave={() => { setHover(null); setPointer(null); }}
          onPointerDown={(e) => setTouch(e.pointerType !== "mouse")}>
          {geo && view && <svg viewBox={view.join(" ")} preserveAspectRatio="xMidYMid meet" role="img" className={stale ? "g-stale" : undefined}
            aria-label={`${county ? countyName : "România"}: lei ${UNIT[metric]}${average !== null ? `, ${metric === "value" ? "în total" : "în medie"} ${say(average)}` : ""}. ${whoWords}, ${periodWords}, ${cpvWords}${channelWords}. ${county && dots ? `Lista de alături are aceleași ${hospitals ? "spitale" : "școli și grădinițe"}.` : "Clasamentul de alături are aceleași cifre."}`}>
            <defs><pattern id="mx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) scale(${view[2] / geo.width})`}><rect width="6" height="6" className="mx-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="mx-hatch-line" /></pattern></defs>
            <g className={county ? "mx-counties is-back" : "mx-counties"}>
              {geo.counties.map((c) => {
                const a = nat?.areas.find((x) => x.key === c.key);
                const gap = natFilled && (!a || fig(a) === null);
                return <path key={c.key} d={c.d} fillRule="evenodd" vectorEffect="non-scaling-stroke"
                  className={`mx-area${gap ? " is-gap" : ""}${!county && hover === c.key ? " is-hover" : ""}${county === c.key ? " is-open" : ""}`}
                  style={county ? undefined : natFilled ? fill(a) : BASE}
                  onPointerEnter={county ? undefined : () => { fromMap.current = true; setHover(c.key); }} onClick={() => { if (county === c.key) return; if (touch && tapped !== c.key) setTapped(c.key); else openCounty(c.key); }} />;
              })}
            </g>
            {county && uatGeo && !dots && <UatLayer key={county} uats={uatGeo.uats} ready={loc !== null} byKey={byKey} hover={hover} fill={fill}
              onHover={(key) => { fromMap.current = true; setHover(key); }} onOpen={openUat} />}
            {county && uatGeo && dots && <g className="mx-uats is-plain" key={`${county}:plain`}>
              {uatGeo.uats.map((u) => <path key={u.siruta} d={u.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" className="mx-area" onPointerEnter={() => setHover(null)} />)}
            </g>}
            {/* Drawn last so their ink closes on every edge: the open county's border, the hovered area's outline. */}
            {openSel.shown && <SelectPath key={openSel.shown.id} id={openSel.shown.id} className="mx-open-edge" d={openSel.shown.d} duration={openDur} easing={EASE_CAMERA} leaving={openSel.leaving} />}
            {outline && <path className="mx-outline" d={outline} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {pickSel.shown && <SelectPath key={pickSel.shown.id} id={pickSel.shown.id} className="mx-chosen" d={pickSel.shown.d} duration={pickDur} easing={EASE_CAMERA} leaving={pickSel.leaving} />}
            {county && uatGeo && dots && unit > 0 && <HospitalLayer key={`${kind}:${county}`} uats={uatGeo.uats} hospitals={loc?.areas ?? []} city={cityCentre} unit={unit}
              radius={schools ? byPupils : undefined}
              // A circle never fades into the backdrop: its ramp starts at 22% (the counties' at 7%).
              ready={loc !== null} hover={hover ?? tapped ?? lit} chosen={lit} chosenMs={litDur} tint={(a) => { const f = fig(a); return metric === "value" ? 0.55 : f === null ? null : 0.22 + 0.78 * Math.min(1, f / dotTop); }}
              onHover={(key) => { fromMap.current = true; setHover(key); }} onOpen={openHospital} />}
          </svg>}
          {shown && pointer && !touch && <div className={`mx-card${pointer.x > (stageRef.current?.clientWidth ?? 0) * 0.62 ? " r" : ""}`} style={{ left: pointer.x, top: pointer.y }} aria-hidden="true">
            <b>{shown.name}</b>
            {dots ? <DotCard a={shown} metric={metric} county={!county} schools={schools} />
              : <>{shown.perCapita !== null ? <span><em>{int(shown.perCapita)} lei</em> pe locuitor</span>
              : <span className="mx-card-gap">{shown.gap === "no_admin" ? "Primăria nu e identificată sigur: valoare necunoscută, nu zero." : shown.gap === "no_council" ? "Consiliul județean nu e identificat: fără cifră pe locuitor." : "Fără populație cunoscută."}</span>}
            {shown.value !== null && <span className="mx-card-sub">{short(shown.value)} lei · {withDe(shown.denominator ?? shown.population ?? 0, "locuitor", "locuitori")}{shown.coverage !== undefined && shown.coverage < 0.9 ? ` · acoperire ${Math.round(shown.coverage * 100)}%` : ""}</span>}
            {sub && shown.subValue ? <span className="mx-card-sub">din care instituțiile lor: {short(shown.subValue)} lei</span> : null}</>}
            {!county && <span className="mx-card-go">Apasă: {kind === "local_admin" ? (shown.key === "bucuresti" ? "sectoarele" : `${NB("UAT-urile")} județului`) : hospitals ? "spitalele județului" : "școlile și grădinițele județului"} <Arrow /></span>}
            {county && !dots && byKey.has(shown.key) && <span className="mx-card-go">Apasă: {shown.perCapita === null ? "vecinii lui" : `fișa ${NB("UAT-ului")}`} <Arrow /></span>}
            {county && dots && shown.entityId && <span className="mx-card-go">Apasă: pagina {schools ? (/^gr[aă]din/i.test(shown.name) ? "grădiniței" : "școlii") : "spitalului"} <Arrow /></span>}
          </div>}
          {busy && <p className="mx-busy g-float" role="status">Se încarcă…</p>}
          {/* The work sign along the bottom of the map while a county or the country loads (M-15). */}
          <WorkLine busy={busy} />
          {/* The smallest area and the most looked for, one touch away on phones (Z4-03). */}
          {!county && geo && <button type="button" className="mx-chip" onClick={() => openCounty("bucuresti")}>București ›</button>}
        </div>
        {tappedArea && <div className="mx-tap" role="status">
          <div className="mx-tap-t"><b>{tappedArea.name}</b>
            {dots ? <DotCard a={tappedArea} metric={metric} county={!county} schools={schools} />
              : <>{tappedArea.perCapita !== null ? <span><em>{int(tappedArea.perCapita)} lei</em> pe locuitor</span> : <span className="mx-card-gap">Fără cifră pe locuitor.</span>}
                <span className="mx-card-sub">{tappedArea.key === "bucuresti" ? "cu primăria municipiului" : "cu consiliul județean"}</span></>}
          </div>
          {county ? (tappedArea.entityId ? <Link className="mx-tap-go" href={entityHref(tappedArea.entityId)}>Deschide ›</Link> : null)
            : <button type="button" className="mx-tap-go" onClick={() => openCounty(tappedArea.key)}>Deschide ›</button>}
        </div>}
        <div className="mx-foot">
          <div className="mx-legend" aria-hidden="true">
            {(!dots || !county || metric !== "value") && <span className="mx-legend-g"><span>0</span><i /><span>{level ? `${say(dotTop)}${dotTop < max ? "+" : ""}` : <G.Line inline w="3.4em" />} lei{metric === "value" ? "" : ` ${UNIT[metric]}`}</span></span>}
            {county && dots && <span className="mx-legend-g"><b className="mx-legend-dots"><s /><s /><s /></b><span>{schools ? "cercul: elevii" : "cercul: paturile spitalului"}</span></span>}
            {areas.some((a) => fig(a) === null) && <span className="mx-legend-g">{county && dots ? <b className="mx-legend-ring" /> : <b className="mx-legend-gap" />}<span>{hospitals ? "fără paturi în lista CNAS" : schools ? "fără elevi în lista ministerului" : county ? "primărie neidentificată" : "fără cifră"}</span></span>}</div>
          {/* The sources in one line (UX audit Z4-22): their names and the licence stay on the page, the whole attribution
              with its links in the (?). */}
          <p className="mx-attr"><Term hold="line" tip title="Surse" text={<>Limite UAT: ANCPI; denumiri: INS SIRUTA (<a href="https://data.gov.ro/dataset/unitati-administrativ-teritoriale-07-03-2024" target="_blank" rel="noreferrer">data.gov.ro</a>), simplificate. {hospitals ? <>Paturi: <a href="https://cnas.ro/spitale" target="_blank" rel="noreferrer">CNAS</a>, structura aprobată la 31.12.2025.</>
              : schools ? <>Școli, grădinițe și elevi: Ministerul Educației (<a href="https://data.gov.ro/dataset/retea-scolara-2025-2026" target="_blank" rel="noreferrer">rețeaua 2025–2026</a>, <a href="https://data.gov.ro/dataset/elevi-inmatriculati" target="_blank" rel="noreferrer">elevii 2024–2025</a>).</> : "Populația: INS, RPL 2021."} Licența: CC BY 4.0.</>}>
            Surse: ANCPI, INS{hospitals ? ", CNAS" : schools ? ", Ministerul Educației" : ""}</Term> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)</p>
        </div>
      </section>

      <aside className="mx-rank" aria-labelledby="mx-rank-h" aria-busy={!level || stale || undefined}>
        <h2 id="mx-rank-h">{county ? (dots ? KIND_WORDS[kind].plural : county === "bucuresti" ? "Sectoarele" : NB("UAT-urile")) : "Județele"} {/* The hovered area's place is not repeated here: its row is lit (owner, 8 November 2026). */}{metric === "perBed" || metric === "perPupil"
          // Two columns, two names (UX audit Z4-17): the figure per bed or pupil, then the total.
          ? <span className="mx-h-cols"><span>lei {UNIT[metric]} · {metric === "perBed" ? BEDS_YEAR : PUPILS_YEAR}</span><span>total</span></span>
          : <span>lei {UNIT[metric]}</span>}</h2>
        {!level ? <RankGhost names={county ? (dots ? null : uatGeo?.uats.map((u) => u.name) ?? null) : geo?.counties.map((c) => c.name) ?? null} rows={county ? null : 42}
          city={county === "bucuresti"} folded={unfolded !== (county ?? "")} key={county ?? ""} /> : <>
        {/* București's city hall and a county's council (UX audit Z4-11): apart from the areas, over the whole city or
            county; the whole box is the link to its page (its name, an EntityName, stretched over it). */}
        {county && loc?.city && <div className={`mx-city${loc.city.entityId ? " is-link" : ""}${hover === loc.city.key ? " is-hover" : ""}${stale ? " g-stale" : ""}`} onPointerEnter={() => setHover(loc.city!.key)} onPointerLeave={() => setHover(null)}>
          <b><EntityName id={loc.city.entityId} role="authority">{loc.city.name}</EntityName></b><span>pentru tot orașul, pe {withDe(loc.city.denominator ?? 0, "locuitor", "locuitori")}{sub && loc.city.subValue ? `; instituțiile ei: ${short(loc.city.subValue)} lei` : ""}</span>
          <em>{loc.city.perCapita === null ? "—" : `${int(loc.city.perCapita)} lei`}</em>
        </div>}
        {county && !dots && loc?.council && <div className={`mx-city${loc.council.entityId ? " is-link" : ""}${stale ? " g-stale" : ""}`}>
          <b><EntityName id={loc.council.entityId} role="authority">{loc.council.name}</EntityName></b><span>pentru tot județul, pe {withDe(loc.council.denominator ?? 0, "locuitor", "locuitori")}{sub && loc.council.subValue ? `; instituțiile lui: ${short(loc.council.subValue)} lei` : ""}</span>
          <em>{loc.council.perCapita === null ? "—" : `${int(loc.council.perCapita)} lei`}</em>
        </div>}
        <ol className={`mx-rows${unfolded === (county ?? "") ? "" : " is-folded"}${atEnd ? " at-end" : ""}${stale ? " g-stale" : ""}${metric === "perBed" || metric === "perPupil" ? " has-total" : metric === "value" ? " is-lei" : ""}`} ref={listRef} key={rankLevel}
          data-chart="" onAnimationEnd={rankMotion.onAnimationEnd} onScroll={(e) => { const el = e.currentTarget; setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4); }}>
          {ranked.map((a, i) => {
            const f = fig(a), gap = f === null;
            const bar = <span className="mx-bar" aria-hidden="true">{!gap && <i className={`cm-tw ${rankMotion.mark(a.key, i < 10 ? "cm-x" : "")}`}
              style={{ width: `${Math.max(1.5, (f / max) * 100)}%`, opacity: 0.25 + 0.75 * (f / max), "--i": i } as CSSProperties} />}</span>;
            const total = metric === "perBed" || metric === "perPupil" ? <span className="mx-v2">{a.value === null ? "—" : short(a.value)}</span> : null;
            // A county's hospital or school (owner, 8 November 2026): its name is the link to its page; the row lights its circle.
            if (county && dots) return <li key={a.key} data-key={a.key}>
              <div className={`mx-row${(hover ?? lit) === a.key ? " is-hover" : ""}${gap ? " is-gap" : ""}`} onPointerEnter={() => { fromMap.current = false; setHover(a.key); }} onPointerLeave={() => setHover(null)}
                onFocus={() => { fromMap.current = false; setHover(a.key); }} onBlur={() => setHover(null)}>
                <span className="mx-n">{gap ? "" : i + 1}</span>
                <span className="mx-name"><EntityName id={a.entityId} className="mx-clamp" title={a.name}>{a.name}</EntityName><small>{schools ? (a.pupils ? withDe(a.pupils, "elev", "elevi") : "fără elevi în lista ministerului") : a.beds ? withDe(a.beds, "pat", "paturi") : "fără paturi în lista CNAS"}</small></span>
                {bar}
                <span className="mx-v">{gap ? "—" : say(f)}</span>{total}
              </div>
            </li>;
            return <li key={a.key} data-key={a.key}>
              <button type="button" className={`mx-row${hover === a.key ? " is-hover" : ""}${gap ? " is-gap" : ""}`} onPointerEnter={() => { fromMap.current = false; setHover(a.key); }} onPointerLeave={() => setHover(null)}
                onFocus={() => { fromMap.current = false; setHover(a.key); }} onBlur={() => setHover(null)} onClick={() => (county ? openUat(a.key) : openCounty(a.key))}
                aria-label={`${a.name}: ${gap ? "fără cifră" : `${say(f)} lei ${UNIT[metric]}`}${total && a.value !== null ? `, ${short(a.value)} lei în total` : ""}${county ? ". Deschide fișa UAT-ului" : hospitals ? ". Deschide spitalele județului" : schools ? ". Deschide școlile și grădinițele județului" : ". Deschide UAT-urile județului"}`} aria-pressed={county ? uat === a.key : undefined}>
                <span className="mx-n">{gap ? "" : i + 1}</span>
                <span className="mx-name">{dots ? <>{a.name}{a.institutions ? <small>{hospitals ? withDe(a.institutions, "spital", "spitale") : withDe(a.institutions, "școală sau grădiniță", "școli și grădinițe")}</small> : null}</> : (() => {
                  // With the institutions, their part in brackets right after the name, fading in on the row's hover
                  // (owner, 8 November 2026); the coverage under 90% on the line below.
                  const cover = a.coverage !== undefined && a.coverage < 0.9 ? `acoperire ${Math.round(a.coverage * 100)}%` : null;
                  const inst = sub && a.subValue ? `(instituțiile: ${short(a.subValue)} lei)` : null;
                  return <>{inst ? <span className="mx-line"><span>{a.name}</span><span className="mx-inst">{inst}</span></span> : a.name}{cover && <small>{cover}</small>}</>;
                })()}</span>
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
          ? (county ? "Fiecare spital e desenat în orașul lui, nu la adresă." : metric === "perBed" ? "Lei pe pat: valoarea din 2025 a spitalelor cu paturi, la paturile lor aprobate." : "")
          : schools ? <>{metric === "perPupil" ? "Lei pe elev: valoarea din 2025 la elevii din 2024–2025, preșcolarii incluși. " : ""}Doar ce cumpără școala sau grădinița <Term id="scolile-harta" tip />.</>
          : county ? "Un UAT fără primărie identificată nu are cifră: nu înseamnă zero lei." : `Un județ se împarte la locuitorii ${NB("UAT-urilor")} ale căror primării le identificăm.`} Valori contractate, nu plăți, în plafoanele totalurilor <Term id="plafoane-totaluri" tip /></p>
      </aside>
      {county && uat && !dots && <UatPanel siruta={uat} query={selection} hint={byKey.get(uat) && { name: byKey.get(uat)!.name, county: countyArea?.name, gap: byKey.get(uat)!.perCapita === null }}
        onClose={() => closeTo(county)} onPick={openUat} />}
    </div>}
    {stale && <FloatStatus>Se încarcă…</FloatStatus>}
    <p className="g-sr" role="status" aria-live="polite">{county && uat && !dots && byKey.get(uat) ? `Fișa ${byKey.get(uat)!.name}, deschisă.` : ""}</p>
  </div>;
}

/** The hover card of a hospital or a school, or of a county's: lei per bed or per pupil (2025 alone) or the total, then beds or pupils and count. */
function DotCard({ a, metric, county, schools }: { a: MapArea; metric: MapMetric; county: boolean; schools: boolean }) {
  const size = schools ? (a.pupils ? withDe(a.pupils, "elev", "elevi") : null) : a.beds ? withDe(a.beds, "pat", "paturi") : null;
  const missing = schools ? "fără elevi în lista ministerului" : "fără paturi în lista CNAS";
  const count = county ? (schools ? withDe(a.institutions, "școală sau grădiniță", "școli și grădinițe") : withDe(a.institutions, "spital", "spitale")) : null;
  if (metric === "perBed" || metric === "perPupil") {
    const per = metric === "perBed" ? a.perBed : a.perPupil;
    return <>
      {per != null ? <span><em>{int(per)} lei</em> {UNIT[metric]}</span> : <span className="mx-card-gap">{schools ? "Fără elevi în lista ministerului: fără cifră pe elev." : "Fără paturi în lista CNAS: fără cifră pe pat."}</span>}
      <span className="mx-card-sub">{[a.value !== null ? `${short(a.value)} lei` : null, size, count].filter(Boolean).join(" · ")}</span>
    </>;
  }
  return <>
    <span><em>{short(a.value ?? 0)} lei</em> contractați</span>
    <span className="mx-card-sub">{[size ?? (county ? null : missing), count].filter(Boolean).join(" · ")}</span>
  </>;
}

/** A school's circle, by its pupils (one function, so the packing is not redone on every render). */
const byPupils = (a: MapArea): number => pupilRadius(a.pupils);

/** București as a whole (its city hall): no shape of its own, so the search opens the city (lib/map-capita.ts). */
const BUCHAREST_CITY = 179132;

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
