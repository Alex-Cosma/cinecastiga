"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { domainSourceQuery, normalizeDomainCode, type DomainDataset, type DomainNode } from "@/lib/domains-shared";
import { formatEvidenceAmount } from "@/lib/ask/evidence";
import { encodeSpec } from "@/lib/ask/permalink";
import type { AskSpec } from "@/lib/ask/spec";
import EvidenceDrawer from "../intreaba/EvidenceDrawer";
import DomainAtlas from "./DomainAtlas";
import "./domains.css";

const number = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });
const compact = (value: number) => value >= 1e9 ? `${decimal.format(value / 1e9)} mld.` : value >= 1e6 ? `${decimal.format(value / 1e6)} mil.` : number.format(value);
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ţ/g, "t").replace(/ş/g, "s").toLowerCase().trim();
const percentage = (value: number, total: number) => value > 0 && total > 0 && value / total < .001 ? "<0,1" : (total ? value / total * 100 : 0).toLocaleString("ro-RO", { maximumFractionDigits: 1 });
const aliases: Record<string, string> = {
  "45":"Construcții", "33":"Medical & farmaceutice", "34":"Echipamente de transport", "90":"Deșeuri, apă & mediu", "09":"Energie & combustibili", "71":"Arhitectură & inginerie", "79":"Servicii pentru organizații", "50":"Reparații & întreținere", "other":"Celelalte domenii",
  "03":"Agricultură & produse conexe", "14":"Materii prime & minerit", "15":"Alimente & băuturi", "16":"Utilaje agricole", "18":"Îmbrăcăminte & încălțăminte", "19":"Piele, textile & materiale", "22":"Cărți & imprimate", "24":"Produse chimice", "30":"Calculatoare & echipamente de birou", "31":"Echipamente electrice", "32":"Radio & telecomunicații", "35":"Securitate & apărare", "37":"Sport, jocuri & artă", "38":"Laboratoare & instrumente", "39":"Mobilier & produse pentru clădiri", "41":"Apă", "42":"Echipamente industriale", "43":"Utilaje de construcții", "44":"Materiale de construcții", "48":"Software", "51":"Servicii de instalare", "55":"Servicii hoteliere & restaurante", "60":"Servicii de transport", "63":"Servicii conexe transportului", "64":"Poștă & telecomunicații", "65":"Utilități publice", "66":"Finanțe & asigurări", "70":"Servicii imobiliare", "72":"Servicii IT", "73":"Cercetare & dezvoltare", "75":"Administrație & apărare", "76":"Servicii pentru petrol & gaze", "77":"Agricultură & spații verzi", "80":"Învățământ & formare", "85":"Sănătate & asistență socială", "92":"Cultură, recreere & sport", "98":"Servicii comunitare",
  "4523":"Drumuri, rețele & infrastructură", "4521":"Clădiri", "4531":"Instalații electrice", "4532":"Izolații", "4545":"Alte lucrări de finisare", "4500":"Construcții — cod general", "4525":"Construcții industriale", "4520":"Lucrări publice — cod general", "4511":"Demolări & terasamente", "4544":"Vopsitorie & geamuri", "4526":"Acoperișuri & lucrări speciale", "4522":"Inginerie & construcții", "4524":"Lucrări hidraulice", "4533":"Instalații de apă", "4550":"Utilaje cu operator — cod general", "4542":"Tâmplărie & dulgherie", "4534":"Garduri & dispozitive de siguranță", "4543":"Pardoseli & pereți", "4530":"Instalații — cod general", "4541":"Tencuieli", "4540":"Finisaje — cod general", "4552":"Închiriere utilaje de terasament", "4535":"Instalații mecanice", "4551":"Închiriere macarale", "4510":"Pregătire șantier — cod general", "4512":"Sondaje & foraje",
};
const colors: Record<string, string> = { "45":"#204c3c", "33":"#809665", "34":"#bc956e", "90":"#668f82", "09":"#bfc89e", "71":"#a0b596", "79":"#84928b", "50":"#c8cbb9", "other":"#dce3cf" };
const palette = ["#557b5d", "#8aa17a", "#b4c49f", "#809a82", "#b3a583"];
const label = (node: DomainNode) => node.nodeKind === "remainder" ? "Celelalte domenii" : aliases[node.code] || node.name;
const paths: Record<string, string> = {
  arrow:"M5 12h14m-5-5 5 5-5 5", up:"M7 17 17 7M7 7h10v10", search:"m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", close:"m6 6 12 12M6 18 18 6", chevron:"m9 5 7 7-7 7", back:"m14 6-6 6 6 6", globe:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c4 4 4 14 0 18-4-4-4-14 0-18", calendar:"M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2", cursor:"m5 3 14 9-7 2-3 7-4-18", grid:"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", spark:"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3", building:"M4 21V9l8-6 8 6v12M2 21h20M9 21v-7h6v7M8 9h1m6 0h1", medical:"M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3", truck:"M2 6h12v11H2zM14 10h4l4 4v3h-8M8 17a2 2 0 1 1-4 0m16 0a2 2 0 1 1-4 0", leaf:"M20 3c0 12-3 17-10 17a7 7 0 0 1-7-7C3 6 8 3 20 3M5 19 15 9", bolt:"m13 2-9 12h7l-1 8 10-12h-7l1-8", ruler:"m3 17 14-14 4 4L7 21l-4-4M14 6l3 3m-6 0 3 3m-6 0 3 3", briefcase:"M8 6V3h8v3M3 7h18v14H3V7m0 7c6 3 12 3 18 0M10 12h4", wrench:"M20 4a6 6 0 0 1-8 8l-8 8-3-3 8-8a6 6 0 0 1 8-8l-4 4 3 3 4-4", chart:"M4 3v18h17M8 16v-5m5 5V7m5 9V4", users:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-4a4 4 0 0 1 0 8m1 4a4 4 0 0 1 4 4v2",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.grid} /></svg>; }
const categoryIcon = (code: string) => ({ "45":"building", "33":"medical", "34":"truck", "90":"leaf", "09":"bolt", "71":"ruler", "79":"briefcase", "50":"wrench" }[code.slice(0, 2)] || "grid");

interface Route { code: string; view: "browse" | "details"; query: string; sort: "value" | "name"; all: boolean; from: string }
interface ReturnScope { route: Route; scrollY: number; year: number }
interface Position { kind: "atlas" | "heading" | "restore" | "none"; canvasTop?: number; scrollY?: number }
const emptyRoute = (): Route => ({ code: "", view: "browse", query: "", sort: "value", all: false, from: "" });
function indexDataset(data: DomainDataset) {
  const nodes = new Map<string, DomainNode>(), parents = new Map<string, string>(), nodeColors = new Map<string, string>();
  function visit(items: DomainNode[], parent = "") { items.forEach((node, i) => { nodes.set(node.code, node); parents.set(node.code, parent); nodeColors.set(node.code, colors[node.code] || palette[i % palette.length]!); visit(node.children ?? [], node.code); }); }
  visit(data.categories);
  return { nodes, parents, colors: nodeColors, divisions: data.categories.flatMap(node => node.nodeKind === "remainder" ? node.children ?? [] : [node]) };
}
function resolveCode(raw: string, nodes: Map<string, DomainNode>) {
  const code = normalizeDomainCode(raw);
  if (nodes.has(code)) return code;
  const full = /^\d{8}-\d$/.test(raw) ? raw.slice(0, 8) : "";
  return full && nodes.has(full) ? full : "";
}
function normalizeRoute(route: Route, index: ReturnType<typeof indexDataset>): Route {
  const code = resolveCode(route.code, index.nodes), node = index.nodes.get(code);
  return { ...route, code, view: code && (route.view === "details" || node?.isLeaf) ? "details" : "browse", from: resolveCode(route.from, index.nodes) };
}
function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  return { code: params.get("code") ?? "", view: params.get("view") === "details" ? "details" : "browse", query: (params.get("q") ?? "").slice(0, 200), sort: params.get("sort") === "name" ? "name" : "value", all: params.get("all") === "1", from: params.get("from") ?? "" };
}
function routeUrl(route: Route, year: number) {
  const url = new URL(window.location.href);
  for (const key of ["code", "view", "q", "sort", "all", "from"]) url.searchParams.delete(key);
  url.searchParams.set("year", String(year));
  if (route.code) url.searchParams.set("code", route.code);
  if (route.code && route.view === "details") { url.searchParams.set("view", "details"); if (route.from) url.searchParams.set("from", route.from); }
  if (route.query) url.searchParams.set("q", route.query);
  if (route.sort === "name") url.searchParams.set("sort", "name");
  if (route.all) url.searchParams.set("all", "1");
  return url;
}
function disjoint(nodes: DomainNode[], parents: Map<string, string>) {
  const codes = new Set(nodes.map(node => node.code));
  return nodes.filter(node => { let parent = parents.get(node.code); while (parent) { if (codes.has(parent)) return false; parent = parents.get(parent); } return true; });
}
function searchNodes(index: ReturnType<typeof indexDataset>, current: DomainNode | undefined, query: string, all: boolean) {
  if (!query.trim()) return current ? [...current.children ?? []] : [...all ? index.divisions : index.divisions.length <= 8 ? index.divisions : [...index.nodes.values()].filter(node => !index.parents.get(node.code))];
  const available: DomainNode[] = [];
  function descend(nodes: DomainNode[]) { for (const node of nodes) { if (node.nodeKind !== "remainder") available.push(node); descend(node.children ?? []); } }
  descend(current?.children ?? index.divisions);
  const term = fold(query), numeric = /^(\d{2,8})(?:-\d)?$/.exec(term);
  if (numeric) {
    const code = numeric[1]!, exact = available.filter(node => node.code === code);
    if (exact.length) return exact;
    const descendants = available.filter(node => node.code.startsWith(code));
    if (descendants.length) return disjoint(descendants, index.parents);
    return available.filter(node => code.startsWith(node.code)).sort((a, b) => b.code.length - a.code.length).slice(0, 1);
  }
  const words = term.split(/\s+/).filter(Boolean);
  const matches = (text: string) => {
    const normalized = fold(text), tokens = new Set(normalized.split(/[^\p{L}\p{N}-]+/u).filter(Boolean));
    return words.every(word => word.length <= 2 ? tokens.has(word) : normalized.includes(word));
  };
  // A broad navigation alias must not hide precise catalogue matches below it.
  // For example, “spații verzi” has its own maintenance and landscaping codes.
  const official = available.filter(node => matches(`${node.name} ${node.officialName} ${node.code}`));
  // Deep numeric groups borrow a catalogue label from a reference code.
  // Prefer that recorded code over an artificial 5–7 digit grouping; retain
  // the four-digit entry groups used to navigate the atlas.
  const catalogue = official.filter(node => node.nodeKind !== "prefix" || node.code.length === 4);
  return disjoint(catalogue.length ? catalogue : official.length ? official : available.filter(node => matches(label(node))), index.parents);
}

export default function DomainExplorer({ initialData, initialCode = "", initialView = "browse" }: { initialData: DomainDataset; initialCode?: string; initialView?: string }) {
  const [data, setData] = useState(initialData);
  const index = useMemo(() => indexDataset(data), [data]);
  const [route, setRoute] = useState<Route>(() => normalizeRoute({ ...emptyRoute(), code: initialCode, view: initialView === "details" ? "details" : "browse" }, indexDataset(initialData)));
  const [requestedYear, setRequestedYear] = useState(initialData.year), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState<(ReturnType<typeof domainSourceQuery> & { title: string }) | null>(null);
  const latest = useRef({ data, route, index }); latest.current = { data, route, index };
  const request = useRef<AbortController | null>(null), lastBrowse = useRef<ReturnScope | null>(null), position = useRef<Position | null>(null);
  const search = useRef<HTMLInputElement>(null), canvas = useRef<HTMLDivElement>(null), method = useRef<HTMLDetailsElement>(null);
  const loadRef = useRef<(year: number, restore?: boolean, target?: Route, scrollY?: number) => void>(() => {});
  const failedLoad = useRef<{ year: number; restore: boolean; target: Route; scrollY: number } | null>(null);
  const selected = index.nodes.get(route.code), details = route.view === "details" && !!selected, blocked = loading || !!error;
  const nodes = useMemo(() => searchNodes(index, selected, route.query, route.all).sort(route.sort === "name" ? (a, b) => label(a).localeCompare(label(b), "ro") : (a, b) => Number(a.nodeKind === "remainder") - Number(b.nodeKind === "remainder") || b.value - a.value), [index, selected, route.query, route.all, route.sort]);
  const shownTotal = route.query.trim() ? nodes.reduce((sum, node) => sum + node.value, 0) : selected?.value ?? data.total;
  const ancestors: DomainNode[] = [];
  let ancestor = selected;
  while (ancestor && ancestors.length < 16) { ancestors.unshift(ancestor); ancestor = index.nodes.get(index.parents.get(ancestor.code) ?? ""); }

  function writeHistory(next: Route, year: number, replace = false) {
    // Next copies its own router markers. Passing them ourselves would skip
    // its URL synchronization for native pushState/replaceState navigation.
    if (!replace) window.history.replaceState({ domains: { scrollY: window.scrollY, returnTo: lastBrowse.current } }, "");
    const state = { domains: { scrollY: replace ? window.scrollY : 0, returnTo: lastBrowse.current } };
    window.history[replace ? "replaceState" : "pushState"](state, "", routeUrl(next, year));
  }
  function navigate(patch: Partial<Route>, focus: Position["kind"] = "atlas", restoreY?: number) {
    if (blocked) return;
    const next = normalizeRoute({ ...route, ...patch }, index);
    position.current = { kind: focus, ...(focus === "atlas" && !details && canvas.current ? { canvasTop: canvas.current.getBoundingClientRect().top } : {}), ...(restoreY !== undefined ? { scrollY: restoreY } : {}) };
    setEvidence(null); setNotice(""); writeHistory(next, data.year); setRoute(next);
  }
  function browse(code: string) { const node = index.nodes.get(code); if (node?.isLeaf) { openDetails(code); return; } navigate({ code, view: "browse", query: "", all: false }); }
  function openDetails(code: string) {
    if (blocked || !index.nodes.has(code)) return;
    if (!details) lastBrowse.current = { route: { ...route }, scrollY: window.scrollY, year: data.year };
    else lastBrowse.current = { route: { ...route, view: "browse", query: "" }, scrollY: window.scrollY, year: data.year };
    navigate({ code, view: "details", from: route.code, query: "", all: false }, "heading");
  }
  function returnToAtlas() {
    const previous = lastBrowse.current;
    if (previous && previous.year === data.year) navigate({ ...previous.route, view: "browse" }, "restore", previous.scrollY);
    else browse(route.from || index.parents.get(route.code) || "");
  }
  function updateSearch(query: string) {
    const next = { ...route, query: query.slice(0, 200) }; setRoute(next); writeHistory(next, data.year, true);
  }
  function quickSearch(query: string) {
    const next = { ...emptyRoute(), query, sort: route.sort }; setRoute(next); writeHistory(next, data.year, true); search.current?.focus({ preventScroll: true });
  }
  function sources(node?: DomainNode) { if (!blocked) setEvidence({ ...domainSourceQuery(data.year, node), title: `${node ? label(node) : "Toate domeniile"} · ${data.year}` }); }
  function viewSources() {
    if (blocked) return;
    if (!route.query.trim()) { sources(selected); return; }
    if (nodes.length > 100) return;
    const source = domainSourceQuery(data.year);
    setEvidence({ ...source, scope: { cpvPrefixes: nodes.map(node => node.code) }, title: `Rezultate pentru „${route.query}” · ${data.year}` });
  }
  function showMethod() { if (method.current) { method.current.open = true; method.current.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } }

  async function loadYear(year: number, restore = false, target = latest.current.route, scrollY = 0) {
    request.current?.abort(); failedLoad.current = null; setEvidence(null); setRequestedYear(year); setError(""); setNotice("");
    if (year === latest.current.data.year) {
      setLoading(false); const next = normalizeRoute(target, latest.current.index);
      if (restore) {
        position.current = { kind: "restore", scrollY };
        window.history.replaceState({ domains: { scrollY, returnTo: lastBrowse.current } }, "", routeUrl(next, year));
        setRoute(next);
      }
      return;
    }
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const response = await fetch(`/api/domains?year=${year}`, { signal: controller.signal });
      const result = await response.json() as DomainDataset & { error?: string };
      if (!response.ok || result.error || !Array.isArray(result.categories) || result.year !== year) throw new Error(result.error || "Nu am putut încărca domeniile pentru anul ales.");
      if (controller.signal.aborted) return;
      const nextIndex = indexDataset(result), next = normalizeRoute(target, nextIndex);
      if (target.code && !next.code) setNotice(`Domeniul ales nu are înregistrări în ${year}. Sunt afișate toate domeniile acestui an.`);
      position.current = restore ? { kind: "restore", scrollY } : { kind: "atlas", ...(canvas.current ? { canvasTop: canvas.current.getBoundingClientRect().top } : {}) };
      if (!restore) writeHistory(next, year);
      else window.history.replaceState({ domains: { scrollY, returnTo: lastBrowse.current } }, "", routeUrl(next, year));
      setData(result); setRoute(next); setLoading(false);
    } catch (e) { if (!controller.signal.aborted) { failedLoad.current = { year, restore, target, scrollY }; setError(e instanceof Error ? e.message : "Datele nu sunt disponibile momentan."); setLoading(false); } }
  }
  loadRef.current = (year, restore, target, scrollY) => { void loadYear(year, restore, target, scrollY); };
  useEffect(() => {
    const previousScroll = window.history.scrollRestoration; window.history.scrollRestoration = "manual";
    const restore = () => {
      const current = latest.current, params = new URLSearchParams(window.location.search), candidate = Number(params.get("year"));
      const year = current.data.years.includes(candidate) ? candidate : current.data.year;
      const saved = window.history.state?.domains;
      lastBrowse.current = saved?.returnTo ?? null;
      loadRef.current(year, true, readRoute(), typeof saved?.scrollY === "number" ? saved.scrollY : 0);
    };
    const saved = window.history.state?.domains;
    lastBrowse.current = saved?.returnTo ?? null;
    const rawRoute = readRoute(), requested = Number(new URLSearchParams(window.location.search).get("year"));
    const year = latest.current.data.years.includes(requested) ? requested : initialData.year;
    const scrollY = typeof saved?.scrollY === "number" ? saved.scrollY : window.scrollY;
    // Cached server props can belong to a previous year on browser Back.
    // Keep the raw code until the requested year's hierarchy is available.
    loadRef.current(year, true, rawRoute, scrollY);
    window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("popstate", restore); window.history.scrollRestoration = previousScroll; request.current?.abort(); };
  }, []);
  useLayoutEffect(() => {
    const pending = position.current; if (!pending) return; position.current = null;
    if (pending.kind === "restore") window.scrollTo({ top: pending.scrollY ?? 0, behavior: "instant" });
    else if (pending.kind === "heading") { document.getElementById("domain-detail-title")?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }
    else if (pending.kind === "atlas") {
      if (pending.canvasTop !== undefined && canvas.current) window.scrollBy({ top: canvas.current.getBoundingClientRect().top - pending.canvasTop, behavior: "instant" });
      else canvas.current?.scrollIntoView({ block: "center", behavior: "instant" });
      document.getElementById("domain-atlas-heading")?.focus({ preventScroll: true });
    }
  }, [route, data]);

  const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Bucharest" }).format(new Date()));
  const scopeChips = <div className="dm-scope-chips"><span className="dm-scope-chip"><Icon name="globe" size={15} />Toată România</span><label className="dm-scope-chip"><Icon name="calendar" size={15} /><span className="dm-sr-only">Anul achizițiilor</span><select value={requestedYear} onChange={event => { void loadYear(Number(event.target.value)); }} aria-label="Anul achizițiilor">{data.years.map(year => <option key={year} value={year}>{year}{year === currentYear ? " · în curs" : ""}</option>)}</select></label></div>;
  const atlasNodes = useMemo(() => nodes.map(node => ({ ...node, name: label(node), color: index.colors.get(node.code)!, isOther: node.nodeKind === "remainder" })), [nodes, index.colors]);
  const selectedParent = selected ? index.nodes.get(index.parents.get(selected.code) ?? "") : undefined;
  const contextual = selected?.code.length === 2 && selected.nodeKind !== "remainder" ? (block: "table" | "timeseries", dim?: "supplier" | "authority") => {
    const spec: AskSpec = { block, dataset: "all", measure: "value", ...(dim ? { dim, topN: 10 } : {}), filters: { cpvTerm: selected.code, yearFrom: data.year, yearTo: data.year } };
    return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}`;
  } : null;

  return <div className="domains-page">
    <span className="dm-sr-only" role="status">{loading ? `Încărcăm domeniile pentru ${requestedYear}.` : `${selected ? label(selected) : "Toate domeniile"}, ${data.year}. ${number.format(nodes.length)} categorii în această vedere.`}</span>
    {details && selected ? <>
      <nav className="dm-breadcrumbs" aria-label="Poziția în domenii"><button type="button" className="dm-atlas-return" onClick={returnToAtlas} disabled={blocked}><Icon name="back" size={12} />Înapoi la atlas</button><button type="button" onClick={() => browse("")} disabled={blocked}>Toate domeniile</button>{ancestors.map((node, i) => <span className="dm-crumb" key={node.code}><Icon name="chevron" size={10} />{i === ancestors.length - 1 ? <span aria-current="page">{label(node)}</span> : <button type="button" disabled={blocked} onClick={() => browse(node.code)}>{label(node)}</button>}</span>)}</nav>
      <section className="dm-detail-hero"><div><div className="dm-detail-title-line"><span className="dm-detail-icon" style={{ "--category-color": index.colors.get(selected.code) } as CSSProperties}><Icon name={categoryIcon(selected.code)} size={29} /></span><div><p className="dm-eyebrow">{selected.nodeKind === "remainder" ? "DOMENII GRUPATE" : `CPV ${selected.cpvFullCode || selected.code}`} · {data.year}</p><h1 id="domain-detail-title" tabIndex={-1}>{label(selected)}</h1></div></div><p className="dm-official-name">{selected.nodeKind === "remainder" ? `${selected.children?.length ?? 0} diviziuni CPV, păstrate integral în total. Alege una pentru a continua.` : selected.officialName}</p></div><div className="dm-detail-actions"><button type="button" className="dm-button" disabled={blocked} onClick={() => sources(selected)}>Vezi înregistrările <Icon name="arrow" size={15} /></button></div></section>
      <div className="dm-detail-period">{scopeChips}<span>Schimbă anul și păstrează domeniul ales.</span></div>
      <div className="dm-stats-row"><div className="dm-stat"><span className="dm-stat-label">Valoare înregistrată</span><strong className="dm-stat-value" title={formatEvidenceAmount(selected.valueExact)}>{compact(selected.value)} lei</strong><span className="dm-stat-foot">{formatEvidenceAmount(selected.valueExact)}</span></div><div className="dm-stat"><span className="dm-stat-label">Înregistrări în selecție</span><strong className="dm-stat-value">{number.format(selected.count)}</strong><span className="dm-stat-foot">Achiziții directe + atribuiri pe câștigător</span></div><div className="dm-stat"><span className="dm-stat-label">Pondere în {selectedParent ? label(selectedParent).toLocaleLowerCase("ro") : "totalul național"}</span><strong className="dm-stat-value">{percentage(selected.value, selectedParent?.value ?? data.total)}%</strong><span className="dm-stat-foot">{data.year} · înregistrări cu cod CPV</span></div></div>
    </> : <>
      <section className="dm-hero"><div><p className="dm-eyebrow"><span className="dm-dash" />EXPLOREAZĂ / DOMENII</p><h1>Ce cumpără<br /><em>instituțiile publice?</em></h1><p className="dm-intro">De la drumuri la medicamente. Alege un domeniu și urmărește banii până la înregistrările din SEAP.</p></div><aside className="dm-hero-context"><p className="dm-eyebrow">VALOARE ÎNREGISTRATĂ · {data.year}</p><div className="dm-national-value" title={formatEvidenceAmount(data.totalExact)}>{compact(data.total)} <span>lei</span></div><p className="dm-context-note"><strong>{number.format(data.count)} înregistrări</strong> cu cod CPV<br />Achiziții directe și contracte atribuite</p><button type="button" className="dm-tiny-link" disabled={blocked} onClick={() => sources()}>Vezi înregistrările <Icon name="up" size={12} /></button></aside></section>
      <div className="dm-search-row"><label className="dm-search-box"><Icon name="search" /><input ref={search} type="search" value={route.query} disabled={blocked} maxLength={200} placeholder={selected ? `Caută în ${label(selected)}…` : "Caută un domeniu sau un cod CPV…"} aria-label="Caută un domeniu sau cod CPV" autoComplete="off" onChange={event => updateSearch(event.target.value)} />{route.query && <button type="button" className="dm-clear-search" aria-label="Șterge căutarea" disabled={blocked} onClick={() => { updateSearch(""); search.current?.focus(); }}><Icon name="close" size={15} /></button>}</label>{scopeChips}</div>
      <div className="dm-quick-search"><span>Încearcă</span>{["Construcții", "Medical", "Servicii IT", "Spații verzi"].map(query => <button key={query} type="button" disabled={blocked} onClick={() => quickSearch(query)}>{query}</button>)}</div>
    </>}
    {notice && <p className="dm-notice" role="status">{notice}</p>}
    <section className="dm-listing" aria-label="Atlasul domeniilor" aria-busy={loading}>
      <div className="dm-atlas-scope"><div className="dm-atlas-path"><nav aria-label="Traseul din atlas"><button type="button" disabled={blocked} onClick={() => browse("")}>Toate domeniile</button>{ancestors.map((node, i) => <span className="dm-crumb" key={node.code}><Icon name="chevron" size={11} />{i === ancestors.length - 1 ? <span aria-current="page">{label(node)}</span> : <button type="button" disabled={blocked} onClick={() => browse(node.code)}>{label(node)}</button>}</span>)}</nav>{selected ? <button type="button" className="dm-atlas-back" disabled={blocked} onClick={() => browse(index.parents.get(selected.code) || "")}><Icon name="back" size={13} />Un nivel înapoi</button> : <span className="dm-path-hint">Plimbă cursorul peste orice zonă pentru informații.</span>}</div><div className="dm-atlas-summary"><div><h2 id="domain-atlas-heading" tabIndex={-1}>{route.query ? `Rezultate pentru „${route.query}”` : selected ? label(selected) : "Toate domeniile"}</h2><p>{compact(shownTotal)} lei <span>·</span>{number.format(route.query ? nodes.reduce((sum, node) => sum + node.count, 0) : selected?.count ?? data.count)} înregistrări</p></div>{route.query.trim() && nodes.length > 100 ? <span className="dm-source-hint">Surse pe fiecare categorie: deschide detaliile cu ↗.</span> : selected && !details && !route.query.trim() ? <button type="button" className="dm-button dm-secondary" disabled={blocked} onClick={() => openDetails(selected.code)}>Detalii despre domeniu <Icon name="up" size={15} /></button> : <button type="button" className="dm-text-link" disabled={blocked} onClick={viewSources}>Vezi înregistrările <Icon name="up" size={14} /></button>}</div></div>
      <div className="dm-section-heading"><div className="dm-section-title"><h2>{route.query ? "Categorii fără suprapunere" : selected ? selected.isLeaf ? "Ultimul nivel al clasificării" : "Intră într-un subdomeniu" : "O imagine de ansamblu. Multe puncte de pornire."}</h2><span className="dm-count">{nodes.length}</span></div>{!selected?.isLeaf && <label className="dm-sort-control"><span>Ordonează</span><select aria-label="Ordonează domeniile" disabled={blocked} value={route.sort} onChange={event => { const next = { ...route, sort: event.target.value as Route["sort"] }; setRoute(next); writeHistory(next, data.year, true); }}><option value="value">După valoare</option><option value="name">Alfabetic</option></select></label>}</div>
      <div className="dm-content-frame">
        <div className="dm-frame-content" inert={blocked} aria-hidden={blocked || undefined}>
          {selected?.isLeaf && details ? <div className="dm-leaf-note"><div><p className="dm-eyebrow">MAI APROAPE DE DATE</p><h3>Aici începe verificarea.</h3><p>Fiecare rând păstrează legătura cu sursa SEAP. Consultă lista completă, exportă datele sau salvează selecția într-o anchetă.</p></div><button type="button" className="dm-button dm-secondary" onClick={() => sources(selected)}>Deschide sursele <Icon name="up" size={15} /></button></div> : <div className="dm-atlas-layout" ref={canvas}><div className="dm-atlas-stage"><DomainAtlas nodes={atlasNodes} onExplore={browse} onDetails={openDetails} shareLabel={route.query ? "din rezultatele căutării" : "din selecție"} />{!nodes.length && <div className="dm-empty"><h3>Niciun domeniu găsit</h3><p>Încearcă un cuvânt mai simplu sau un cod CPV.</p>{route.query && <button type="button" className="dm-button dm-secondary" onClick={() => updateSearch("")}>Resetează căutarea</button>}</div>}</div><aside className="dm-atlas-side"><p className="dm-eyebrow">DOMENIILE DIN ACEASTĂ VEDERE</p><div className="dm-atlas-list">{nodes.map(node => <div className="dm-atlas-list-row" key={node.code}><button type="button" onClick={() => browse(node.code)} aria-label={`${node.isLeaf ? "Vezi detaliile" : "Explorează subdomeniile"}: ${label(node)}`}><i style={{ background: index.colors.get(node.code) }} /><span className="dm-list-name">{label(node)}</span><span className="dm-list-percent">{percentage(node.value, shownTotal)}%</span></button><button type="button" className="dm-list-details" onClick={() => openDetails(node.code)} aria-label={`Vezi detaliile: ${label(node)}`}><Icon name="up" size={15} /></button></div>)}</div><div className="dm-atlas-help"><Icon name="cursor" /><p><strong>Click pe zonă: intri în subdomenii.</strong><br />Săgeata ↗ deschide direct detaliile.<br />La ultimul nivel, și zona deschide detaliile.</p></div></aside></div>}
        </div>
        {blocked && <div className="dm-loading-cover" role={error ? "alert" : "status"}>{error ? <><Icon name="search" size={28} /><h3>Datele pentru {requestedYear} nu au putut fi încărcate.</h3><p>{error}</p><button type="button" className="dm-button" onClick={() => { const retry = failedLoad.current; if (retry) void loadYear(retry.year, retry.restore, retry.target, retry.scrollY); else void loadYear(requestedYear); }}>Încearcă din nou <Icon name="arrow" size={15} /></button><button type="button" className="dm-text-link" onClick={() => { request.current?.abort(); setError(""); setRequestedYear(data.year); writeHistory(route, data.year, true); }}>Revino la {data.year}</button></> : <><span className="dm-spinner" aria-hidden="true" /><h3>Pregătim atlasul pentru {requestedYear}.</h3><p>Adunăm aceleași înregistrări, domeniu cu domeniu.</p></>}</div>}
      </div>
      {!selected?.isLeaf && <div className="dm-caption"><span>{route.query ? "Ponderi calculate între rezultatele căutării. Un domeniu și copiii lui nu sunt numărați împreună." : selected ? "Codurile generale au înregistrările lor, separate de subdomenii. Fiecare rând este numărat o singură dată." : !route.all && data.categoryCount > 8 ? `Cele mai mari 8 domenii + celelalte ${data.categoryCount - 8}, grupate. Fiecare înregistrare este numărată o singură dată.` : "Ponderi din valoarea totală a selecției. Denumirile CPV oficiale sunt disponibile în detalii."}</span>{!selected && !route.all && !route.query && data.categoryCount > 8 ? <button type="button" disabled={blocked} onClick={() => navigate({ all: true }, "atlas")}>Toate cele {data.categoryCount} <Icon name="arrow" size={11} /></button> : <button type="button" onClick={showMethod}>Despre date</button>}</div>}
    </section>
    {details && contextual && <section className="dm-question-strip"><p><strong>Următoarea întrebare?</strong> Domeniul și anul {data.year} sunt deja alese.</p><Link href={contextual("table", "supplier")}><Icon name="users" size={17} />Cine câștigă? <Icon name="up" size={14} /></Link><Link href={contextual("table", "authority")}><Icon name="building" size={17} />Cine cumpără? <Icon name="up" size={14} /></Link><Link href={contextual("timeseries")}><Icon name="chart" size={17} />Valoarea în timp <Icon name="up" size={14} /></Link></section>}
    <aside className="dm-next-step"><span className="dm-next-step-icon"><Icon name="spark" size={23} /></span><div><h3>Un domeniu e doar începutul.</h3><p>Compară firme, urmărește instituții și păstrează descoperirile într-o anchetă.</p></div><Link href={contextual ? contextual("table", "supplier") : "/intreaba"}>Construiește o întrebare <Icon name="arrow" size={18} /></Link></aside>
    <details className="dm-method" ref={method}><summary>Despre datele și clasificarea din acest atlas</summary><p>{data.scopeNote}</p><p>{data.hierarchyNote}</p><p>Denumirile scurte sunt etichete de navigare; denumirile CPV din catalog apar în informațiile fiecărei zone și în detalii. Valorile reprezintă înregistrări, nu plăți confirmate.</p>{data.year === currentYear && <p>Anul {data.year} este în curs. Datele acoperă înregistrările disponibile, nu un an calendaristic încheiat.</p>}<p>Agregare generată la {new Date(data.generatedAt).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}, ora României.</p><Link href="/metodologie">Citește metodologia <Icon name="up" size={13} /></Link></details>
    {evidence && <EvidenceDrawer key={JSON.stringify({ spec: evidence.spec, scope: evidence.scope })} spec={evidence.spec} scope={evidence.scope} title={evidence.title} onClose={() => setEvidence(null)} />}
  </div>;
}
