"use client";

import Link from "next/link";
import { G } from "@/components/ghost/Ghost";
import { cancelNavPending } from "@/components/ghost/client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import EntityName from "@/components/EntityName";
import { entityHref } from "@/lib/entity-href";
import type { MapUatResponse } from "@/lib/map-capita-shared";
import { useTip } from "../intreaba/use-tip";
import { useEntrance } from "./motion";

/** The phone's sheet (UX audit Z4-02): the map's own phone breakpoint, and the header's height once the page is scrolled (SiteNav). */
const SHEET = "(max-width: 640px)";
const PHONE_HEADER = 53;

/** The panel's hover tip (lib house rule: an instant tip on every mark, never the native title). */
type Tip = ReturnType<typeof useTip>["bind"];

/*
 * The UAT's panel on /harta (owner, 6 November 2026, "Povestea în trei întrebări"): a sentence with the verdict, then
 * "Cât?" (its years against the county's), "Pe ce?" (its CPV divisions) and "Cui?" (its largest suppliers), each with
 * its conclusion written out, and its neighbours in the county underneath. Every firm's name and the UAT's own name
 * link to their pages (owner: the commune's name opens its town hall). Values are contracted, not payments. Every mark
 * answers on hover (owner, 7 November 2026); a year opens the town hall's records of that year (Years).
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
/** A share as the rows write it: „<1%” for a part that rounds to nothing (UX audit Z4-24: 50 mii lei of 49,7 mil. read „0%”). */
const share = (part: number, whole: number) => (whole > 0 && part > 0 && part / whole < 0.005 ? "<1%" : `${pct(part, whole)}%`);
/** „UAT-uri” with a hyphen that does not break the line (UX audit Z4-23). */
const NB = (text: string) => text.replace(/-/g, "\u2011");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const ordinal = (n: number) => (n === 1 ? "primul" : `al ${n}-lea`);
const withDe = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${int(n)}${n % 100 === 0 || n % 100 >= 20 ? " de" : ""} ${many}`);
/**
 * What a UAT is set against (owner, 16 November 2026, UX audit Z4-09): the average of the county's town halls, without
 * the county council, and the words say so; București's sectors against the sectors' average.
 */
export const averageWords = (county: string) => (county === "bucuresti" ? "media primăriilor de sector" : "media primăriilor din județ");
/** "de 2,8 ori media primăriilor din județ", "cu 20% peste …", "la 60% din …", "aproape de …". */
export function versus(value: number, average: number | null, words: string): string | null {
  if (average === null || average <= 0) return null;
  const r = value / average;
  if (r >= 1.5) return `de ${r.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ori ${words}`;
  if (r >= 1.1) return `cu ${Math.round((r - 1) * 100)}% peste ${words}`;
  if (r <= 0.9) return `la ${Math.round(r * 100)}% din ${words}`;
  return `aproape de ${words}`;
}

/** The years' chart as drawn, and how much larger than drawn it gets before it grows wider instead (harta.css keeps the ghost's height by the same figure). */
const YEAR_W = 260, YEAR_ZOOM = 1.3;

/** The year's tip under its column, inside the chart's width. */
function tipLeft(index: number, count: number, width: number, tipWidth: number): number {
  const center = ((index + 0.5) / count) * width;
  return Math.min(Math.max(0, center - tipWidth / 2), Math.max(0, width - tipWidth));
}

/*
 * A year leads to its records (owner, 7 November 2026), as on an entity's own year chart (EntityYears): hovering or
 * focusing a year shows its figures under the chart; a click or Enter opens the town hall's page with its records table
 * filtered to that year (and to the map's channel); a tap first shows the tip, whose link does the same. The years are
 * one tab stop; the arrows, Home and End move between them. The chart is drawn by the SVG; the years' hit areas are
 * HTML columns behind it, a whole column tall, so a short bar is as easy to reach as a tall one.
 */
function Years({ years, href, allDomains, words }: { years: MapUatResponse["years"]; href: ((year: string) => string) | null; allDomains: boolean; words: string }) {
  const avgOf = (y: MapUatResponse["years"][number]) => y.hallsPerCapita ?? null;
  const max = Math.max(1, ...years.flatMap((y) => [y.perCapita ?? 0, avgOf(y) ?? 0]));
  const peak = years.reduce((a, y) => ((y.perCapita ?? 0) > (a?.perCapita ?? 0) ? y : a), years[0]);
  const now = new Date().getFullYear();
  const motion = useEntrance("", years.map((y) => y.year));
  const n = years.length;
  const [active, setActive] = useState<number | null>(null);
  const [focusable, setFocusable] = useState(n - 1);
  const [left, setLeft] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLElement | null)[]>([]);
  const pointer = useRef("");
  // Whether this year's tip was open when the tap began: a tap's own hover and focus open it before its click.
  const opened = useRef(false);
  // The chart takes its section's width (owner, 17 November 2026: no sentence beside it). Drawn 260 wide, it grows with
  // the section up to YEAR_ZOOM; past that the columns get wider, not taller, and the years keep their size.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const W = Math.max(YEAR_W, Math.round(width / YEAR_ZOOM)), H = 96, bw = W / Math.max(1, years.length);

  useLayoutEffect(() => {
    if (active === null || !box.current || !tip.current) return;
    setLeft(tipLeft(active, n, box.current.clientWidth, tip.current.offsetWidth));
  }, [active, n]);
  // A tap elsewhere or Escape closes it.
  useEffect(() => {
    if (active === null) return;
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setActive(null); };
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [active]);
  const move = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const to = e.key === "ArrowRight" ? Math.min(n - 1, i + 1) : e.key === "ArrowLeft" ? Math.max(0, i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    setFocusable(to);
    cols.current[to]?.focus();
  };
  const perInhabitant = (y: MapUatResponse["years"][number]) => (y.perCapita === null ? "fără cifră pe locuitor" : `${int(y.perCapita)} lei pe locuitor`);
  const shown = active === null ? null : years[active]!;

  return <div className="mx-p-yrs" ref={box} onMouseLeave={() => setActive(null)}>
    <svg className="mx-p-years" viewBox={`0 0 ${W} ${H + 16}`} aria-hidden="true" data-chart="" onAnimationEnd={motion.onAnimationEnd}>
      {years.map((y, i) => {
        const h = ((y.perCapita ?? 0) / max) * (H - 4), x = i * bw + bw * 0.16, cy = avgOf(y) === null ? null : H - (avgOf(y)! / max) * (H - 4);
        const cls = `${y === peak && (y.perCapita ?? 0) > 0 ? " is-peak" : ""}${y.selected ? "" : " is-out"}${Number(y.year) >= now ? " is-current" : ""}`;
        return <g key={y.year}>
          <rect className={`mx-p-bar${cls} ${motion.mark(y.year, "cm-y")}`} style={{ "--i": i } as CSSProperties} x={x} y={H - h} width={bw * 0.68} height={Math.max(h, 0)} rx="1.5" />
          {/* At its height by a transform, so another filter moves it with the bars. */}
          {cy !== null && <line className={`mx-p-avg cm-tw ${motion.mark(y.year, "cm-fade")}`} style={{ transform: `translateY(${cy}px)`, "--i": i } as CSSProperties} x1={i * bw + 1} x2={(i + 1) * bw - 1} y1={0} y2={0} />}
          <text className={`mx-p-tick${active === i ? " is-active" : ""}`} x={x + bw * 0.34} y={H + 12} textAnchor="middle">{y.year.slice(2)}</text>
        </g>;
      })}
    </svg>
    <div className="mx-p-yr-cols" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {years.map((y, i) => {
        const label = `${y.year}: ${perInhabitant(y)}${avgOf(y) === null ? "" : `, ${words} ${int(avgOf(y)!)}`}, ${short(y.value)} lei contractați.`;
        const common = {
          ref: (el: HTMLElement | null) => { cols.current[i] = el; },
          tabIndex: i === focusable ? 0 : -1,
          className: `mx-p-yr${active === i ? " is-active" : ""}`,
          onPointerDown: (e: React.PointerEvent) => { pointer.current = e.pointerType; opened.current = active === i; },
          onMouseEnter: () => setActive(i),
          onFocus: () => { setFocusable(i); setActive(i); },
          onBlur: (e: React.FocusEvent) => { if (!box.current?.contains(e.relatedTarget as Node | null)) setActive(null); },
          onKeyDown: (e: KeyboardEvent<HTMLElement>) => move(e, i),
        };
        return href
          ? <Link key={y.year} {...common} href={href(y.year)} prefetch={false} aria-label={`${label} Vezi înregistrările anului.`}
              onClick={(e) => {
                // A tap shows the tip first (its link opens the records); a click or Enter opens them.
                // The click keeps the reader here: „Se deschide…” (NavPending, which counted the link) goes.
                if (pointer.current === "touch" && !opened.current) { e.preventDefault(); cancelNavPending(); setActive(i); }
                pointer.current = "";
              }} />
          : <span key={y.year} {...common} role="img" aria-label={label} />;
      })}
    </div>
    {shown && active !== null && <div ref={tip} className="mx-p-yr-tip" style={{ left }} aria-hidden="true">
      <b>{shown.year}</b>
      <span className="mx-p-yr-main">{perInhabitant(shown)}</span>
      {avgOf(shown) !== null && <span>{capitalize(words)}: {int(avgOf(shown)!)} lei pe locuitor</span>}
      <span>{short(shown.value)} lei contractați · {withDe(shown.records, "înregistrare", "înregistrări")}</span>
      {href && <Link tabIndex={-1} className="mx-p-yr-go" href={href(shown.year)} prefetch={false}>Vezi înregistrările din {shown.year} →</Link>}
      {href && allDomains && <small>Tabelul arată toate domeniile.</small>}
    </div>}
  </div>;
}

/*
 * „Printre vecini”: every UAT of the county with a figure on one axis, this one an orange ring, the town halls' average
 * a dashed rule. Drawn in the panel's own pixels (measured), so its words stay 12 px and its dots big enough to point at
 * on a phone (UX audit Z4-12); under it on phones, the UATs nearest in the county's ranking as rows to touch.
 */
function Neighbours({ data, onPick, tip }: { data: MapUatResponse; onPick: (key: string) => void; tip: Tip }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const list = data.neighbours.filter((n) => n.perCapita !== null);
  const max = Math.max(1, ...list.map((n) => n.perCapita!));
  const phone = width > 0 && width < 480;
  // Dots stack where they meet; a tall stack is squeezed into the band under the average's label.
  const W = width || 560, H = phone ? 84 : 78, TOP = 18, r = phone ? 5.5 : 4.2, step = 2 * r + 2.4, cols = new Map<number, number>();
  const raw = [...list].sort((a, b) => a.perCapita! - b.perCapita!).map((n) => {
    const x = 10 + (n.perCapita! / max) * (W - 20), c = Math.round(x / (step + 0.6)), k = cols.get(c) ?? 0;
    cols.set(c, k + 1);
    return { n, x, off: k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? -1 : 1) };
  });
  const half = (H - TOP) / 2 - r - 2, widest = Math.max(1, ...raw.map((d) => Math.abs(d.off))), squeeze = widest > half ? half / widest : 1;
  const dots = raw.map((d) => ({ ...d, y: TOP + (H - TOP) / 2 + d.off * squeeze }));
  const average = data.county.hallsPerCapita ?? null;
  const avg = average === null ? null : 10 + (average / max) * (W - 20);
  const motion = useEntrance("", list.map((n) => n.key));
  // Drawn in a fixed order (by SIRUTA), so another filter moves each dot instead of re-inserting it; this UAT's ring
  // last, on top. They appear where they are, all together (the order of a strip says nothing), the ring after them.
  const me = dots.find((d) => d.n.key === data.uat.key);
  const others = dots.filter((d) => d !== me).sort((a, b) => (a.n.key < b.n.key ? -1 : a.n.key > b.n.key ? 1 : 0));
  // The rows: three above and three under it in the county's ranking (fewer at an end).
  const ranked = [...list].sort((a, b) => b.perCapita! - a.perCapita!);
  const at = data.place ? data.place - 1 : -1;
  const from = Math.max(0, at - 3);
  const near = at < 0 ? [] : ranked.slice(from, at + 4);
  const avgLabel = data.county.key === "bucuresti" ? "media sectoarelor" : "media primăriilor";
  const labelRight = avg !== null && avg > W - 150;
  return <>
    <div className="mx-p-near-box" ref={box}>
      {width > 0 && <svg className="mx-p-near" viewBox={`0 0 ${W} ${H + 18}`} width={W} height={H + 18} role="img"
        aria-label={`Lei pe locuitor în cele ${data.ranked} ${NB("UAT-uri")} din ${data.county.name}; ${data.uat.name} ${data.place ? `e ${ordinal(data.place)}` : "nu are cifră"}.`}
        data-chart="" onAnimationEnd={motion.onAnimationEnd}>
        {avg !== null && <><line className="mx-p-avg" x1={avg} x2={avg} y1={TOP - 4} y2={H} /><text className="mx-p-tick" x={labelRight ? avg - 6 : avg + 6} y={11} textAnchor={labelRight ? "end" : "start"}>{avgLabel}</text></>}
        {others.map(({ n, x, y }) => <circle key={n.key} className={`mx-p-dot ${motion.mark(n.key, "cm-pt")}`} cx={x} cy={y} r={r} onClick={() => onPick(n.key)}
          {...tip(n.name, `${int(n.perCapita!)} lei pe locuitor`, `Apasă: fișa ${NB("UAT-ului")}`)} />)}
        {me && <circle key={me.n.key} className={`mx-p-me ${motion.mark(me.n.key, "cm-pt cm-late")}`} cx={me.x} cy={me.y} r={r + 2.8} vectorEffect="non-scaling-stroke"
          {...tip(me.n.name, `${int(me.n.perCapita!)} lei pe locuitor`, data.place ? `${ordinal(data.place)} din ${int(data.ranked)} în județ` : undefined)} />}
        <text className="mx-p-tick" x={10} y={H + 16}>0</text>
        <text className="mx-p-tick" x={W - 10} y={H + 16} textAnchor="end">{int(max)} lei pe locuitor</text>
      </svg>}
    </div>
    {near.length > 1 && <ol className="mx-p-nrows" aria-label={`Cele mai apropiate în clasamentul județului ${data.county.name}`}>
      {near.map((n, i) => {
        const place = from + i + 1, mine = n.key === data.uat.key;
        return <li key={n.key}>{mine
          ? <span className="mx-p-nrow is-me" aria-current="true"><span>{place}</span><b>{n.name}</b><em>{int(n.perCapita!)} lei</em></span>
          : <button type="button" className="mx-p-nrow" onClick={() => onPick(n.key)}><span>{place}</span><b>{n.name}</b><em>{int(n.perCapita!)} lei</em></button>}</li>;
      })}
    </ol>}
  </>;
}

/** "Pe ce?" and "Cui?": a row per CPV division or supplier, its bar measured against the first row's; the whole row answers on hover. */
function Rows({ rows, tip }: { rows: { key: string; name: ReactNode; bar: number; value: ReactNode; tip: [string, string, string?] }[]; tip: Tip }) {
  const motion = useEntrance("", rows.map((r) => r.key));
  // The bar exists only in Complet (owner, 18 November 2026): it repeats the share beside it; the row closes up.
  return <ul className="mx-p-rows" data-chart="" onAnimationEnd={motion.onAnimationEnd}>{rows.map((r, i) => <li key={r.key} {...tip(...r.tip)}><span>{r.name}</span>
    <i className={`cm-tw ${motion.mark(r.key, "cm-x")}`} style={{ width: `${Math.max(2, r.bar)}%`, "--i": i } as CSSProperties} data-only="complet" /><b>{r.value}</b></li>)}</ul>;
}

/*
 * While a UAT loads (owner, 6 November 2026: "ghost data loading"), the panel keeps the shape of its content: the UAT's
 * name (known from the map), the three questions, and quiet blocks where the sentence, bars, rows and neighbours will be,
 * so switching UATs does not collapse the panel and grow it back. A UAT the map shows hatched gets the short shape.
 * In Esențial it has that mode's shape: the same blocks are marked as in the panel below.
 */
const YEAR_GHOST = [20, 34, 40, 48, 36, 26, 66, 44, 24];
function Ghost({ name, county, gap }: { name: string | undefined; county: string | undefined; gap: boolean }) {
  // "phone": a line only phones wrap to; "wide": a line only the three-column layout wraps to.
  const line = (width: string, only?: "phone" | "wide") => <G.Line w={width} only={only} />;
  return <>
    <p className="mx-p-kick" aria-hidden="true">{line("44%")}{line("30%", "phone")}</p>
    <h2 id="mx-p-h">{name ?? <G.Line w="36%" />}</h2>
    <p className="mx-p-lead" aria-hidden="true">{line("94%")}{gap ? line("58%") : <>{line("97%")}<span data-only="complet">{line("42%")}</span>{line("30%", "phone")}</>}</p>
    {!gap && <p className="mx-p-acts" aria-hidden="true"><G.Block w="15em" h="36px" /><span data-only="complet"><G.Block w="17em" h="36px" /></span></p>}
    {!gap && <div className="mx-p-cols" aria-hidden="true">
      {(["Cât?", "Pe ce?", "Cui?"] as const).map((title, i) => <div className="mx-p-sec" key={title} data-only={i === 0 ? "complet" : undefined}><h3>{title}</h3>
        {i === 0
          ? <svg className="mx-p-years" viewBox="0 0 260 112" preserveAspectRatio="none">{YEAR_GHOST.map((h, j) => <rect key={j} className="g-svg" x={j * (260 / 9) + 4.6} y={96 - h} width={19.6} height={h} rx="1.5" />)}</svg>
          : <ul className="mx-p-rows">{[100, 74, 52, 38, 26].map((w, j) => <li key={j}><span>{line(`${78 - j * 7}%`)}</span><i style={{ width: `${w}%` }} data-only="complet" /><b>{line("100%")}</b></li>)}</ul>}
      </div>)}
    </div>}
    <div className="mx-p-sec mx-p-wide" aria-hidden="true" data-only="complet"><h3>Printre vecini</h3>
      <svg className="mx-p-near" viewBox="0 0 560 96"><rect className="g-svg" x="10" y="42" width="540" height="14" rx="7" /></svg></div>
    <p className="mx-p-wait g-sr" role="status">Se încarcă UAT-ul…</p>
  </>;
}

export default function UatPanel({ siruta, query, hint, onClose, onPick, leaving = false }: {
  siruta: string; query: string; hint: { name: string; county: string | undefined; gap: boolean } | undefined; onClose: () => void; onPick: (key: string) => void;
  /** A phone's sheet playing its exit (UX audit M-06): drawn, but takes no clicks or focus. */
  leaving?: boolean;
}) {
  const [state, setState] = useState<{ key: string; data: MapUatResponse | null; error: string }>({ key: "", data: null, error: "" });
  const t = useTip();
  const self = useRef<HTMLElement>(null);
  // Phones (owner, 16 November 2026, UX audit Z4-02, „Foaia de jos”): the panel is a sheet rising from the bottom, the
  // map moved up under the header above it, so another touch changes the UAT; „Toată fișa ↑”, a tap or a drag up on
  // the grip open it whole; a drag down lowers it, then closes it; Back and × close it before the page.
  const [full, setFull] = useState(false);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const el = self.current, root = el?.closest<HTMLElement>(".mx");
    if (!el || !root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.matchMedia(SHEET).matches) {
      const stage = root.querySelector<HTMLElement>(".mx-stage"), map = root.querySelector<HTMLElement>(".mx-map");
      if (stage && map) {
        // The stage under the header (PHONE_HEADER once the page is scrolled), the sheet over the rest of the screen.
        const top = Math.max(0, stage.getBoundingClientRect().top + window.scrollY - PHONE_HEADER - 8);
        const mapBottom = map.getBoundingClientRect().bottom + window.scrollY - top;
        root.style.setProperty("--mx-peek", `${Math.max(Math.round(window.innerHeight * 0.4), Math.round(window.innerHeight - mapBottom - 6))}px`);
        window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
      }
    } else if (window.matchMedia("(max-width: 980px)").matches) {
      // Under the stage (980 px and less, owner 6 November 2026): brought into view, so the touch has a visible answer.
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } else return;
    el.focus({ preventScroll: true });
    return () => { root.style.removeProperty("--mx-peek"); };
  }, []);
  const lower = () => { setFull(false); if (self.current) self.current.scrollTop = 0; };
  // The town hall's records with the map's period and channel, as its table counts them (/api/entity-tx's total).
  const [count, setCount] = useState<{ key: string; total: number | null }>({ key: "", total: null });
  const key = `siruta=${siruta}&${query}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/map/uat?${key}`, { signal: controller.signal }).then(async (r) => {
      const body = await r.json();
      setState({ key, data: r.ok ? body as MapUatResponse : null, error: r.ok ? "" : body.error ?? "Datele UAT\u2011ului nu au putut fi încărcate." });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, data: null, error: "Datele UAT\u2011ului nu au putut fi încărcate. Reîncearcă." }); });
    return () => controller.abort();
  }, [key]);
  const data = state.key === key ? state.data : null;
  const loading = state.key !== key;
  const d = data ?? (state.data && state.data.uat.key === siruta ? state.data : null);
  const hallId = d && d.uat.gap !== "no_admin" ? d.townHalls[0]?.id ?? null : null;
  const tableQuery = d && hallId ? `id=${encodeURIComponent(hallId)}&rol=autoritate${d.selection.years === "all" ? "" : `&an=${d.selection.years.join(",")}`}${d.selection.dataset === "da" ? "&tip=directe" : d.selection.dataset === "contracts" ? "&tip=contracte" : ""}` : null;
  useEffect(() => {
    if (!tableQuery) return;
    const controller = new AbortController();
    void fetch(`/api/entity-tx?${tableQuery}&page=1`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null))
      .then((b: { ok?: boolean; total?: number } | null) => { if (b?.ok && typeof b.total === "number") setCount({ key: tableQuery, total: b.total }); }).catch(() => undefined);
    return () => controller.abort();
  }, [tableQuery]);

  const head = d && <>
    <p className="mx-p-kick">{d.uat.kind} · {d.county.name}{d.uat.population ? ` · ${withDe(d.uat.population, "locuitor", "locuitori")}` : ""}
      {d.townHalls.map((t) => <span key={t.id}> · <EntityName id={t.id} role="authority">{t.name}</EntityName></span>)}</p>
    <h2 id="mx-p-h">{d.townHalls[0] ? <Link href={entityHref(d.townHalls[0].id, "authority")}>{d.uat.name}</Link> : d.uat.name}</h2>
  </>;

  // The panel slides in once; another UAT only replays its content's cascade (the body's key).
  const failed = !d && Boolean(state.error) && !loading;
  return <section ref={self} tabIndex={-1} className={`mx-panel${loading ? " is-loading" : ""}${full ? " is-full" : ""}`} aria-labelledby="mx-p-h"
    data-leaving={leaving ? "" : undefined} inert={leaving} aria-hidden={leaving || undefined}>
    <div className="mx-p-grip" aria-hidden="true"
      onPointerDown={(e) => { drag.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}
      onPointerUp={(e) => {
        const from = drag.current; drag.current = null;
        if (from === null) return;
        const dy = e.clientY - from;
        if (dy < -24 || (Math.abs(dy) < 8 && !full)) setFull(true);
        else if (dy > 48 || Math.abs(dy) < 8) { if (full) lower(); else if (dy > 48) onClose(); }
      }} />
    <div className={`mx-p-body${!d && !failed ? " is-ghost" : ""}`} aria-busy={!d && !failed ? true : undefined} key={d?.uat.key ?? (failed ? "error" : "wait")}>
    <button type="button" className="mx-p-close" onClick={onClose} aria-label="Închide panoul">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
    {!d ? (failed ? <p className="mx-p-error" role="alert">{state.error}</p> : <Ghost name={hint?.name} county={hint?.county} gap={hint?.gap ?? false} />)
      : d.uat.gap === "no_admin" ? <>
        {head}
        <p className="mx-p-lead">Primăria lui {d.uat.name} nu e identificată sigur în date, deci nu avem cifra lui: valoarea e necunoscută, nu zero.</p>
        <div className="mx-p-sec mx-p-wide" data-only="complet"><h3>Printre vecini</h3><Neighbours data={d} onPick={onPick} tip={t.bind} /></div>
      </> : <>
        {head}
        {(() => {
          const value = d.uat.value ?? 0, pc = d.uat.perCapita ?? 0, total = d.cpv.reduce((a, c) => a + c.value, 0);
          const words = averageWords(d.county.key);
          const vs = versus(pc, d.county.hallsPerCapita ?? null, words);
          const peak = d.years.reduce((a, y) => ((y.perCapita ?? 0) > (a?.perCapita ?? 0) ? y : a), d.years[0]);
          const top = d.suppliers[0];
          // A year opens the town hall's records of that year, in the map's channel (its largest town hall when the
          // UAT has more than one: the one its name opens). The table filters CPV codes, not divisions: all domains.
          const hall = d.townHalls[0];
          const channel = d.selection.dataset === "da" ? "&tip=directe" : d.selection.dataset === "contracts" ? "&tip=contracte" : "";
          const yearHref = hall ? (year: string) => `${entityHref(hall.id, "authority")}&an=${year}${channel}#achizitii` : null;
          // The town hall's records with the map's period and channel (UX audit Z4-10), counted as its table counts
          // them; and its comparison with the town halls of its size, for the same period (Z4-39).
          const years = d.selection.years;
          const recordsHref = hall ? `${entityHref(hall.id, "authority")}${years === "all" ? "" : `&an=${years.join(",")}`}${channel}#achizitii` : null;
          const compareHref = hall ? `/entitati/${encodeURIComponent(hall.id)}/comparatii?rol=autoritate&year=${years !== "all" && years.length === 1 ? years[0] : "all"}&cpv=all&dataset=${d.selection.dataset}` : null;
          // Esențial (owner, 18 November 2026): the sentence ends at the figure per inhabitant; the comparison with the
          // county's average and the place in the county exist only in Complet. Both forms are in the page: the tail is
          // marked, the full stop is common. Complet-only too: the comparison link (Comparații), „Cât?”, the
          // institutions' part, „Printre vecini” and the rows' bars.
          return <>
            <p className="mx-p-lead">{d.uat.name} a contractat{d.selection.withInstitutions ? ", cu instituțiile primăriei," : ""} {short(value)} lei: <em>{int(pc)} lei pe locuitor</em><span data-only="complet">{vs ? `, ${vs}` : ""}
              {d.place ? `, ${ordinal(d.place)} din cele ${withDe(d.ranked, "UAT", NB("UAT-uri"))} ale ${d.county.key === "bucuresti" ? "Bucureștiului" : `județului ${d.county.name}`}` : ""}</span>.</p>
            {hall && <p className="mx-p-acts">
              {recordsHref && <Link className="mx-p-act is-main" href={recordsHref} prefetch={false}>{count.key === tableQuery && count.total !== null ? `${withDe(count.total, "înregistrare", "înregistrări")} ale primăriei` : "Înregistrările primăriei"}{d.selection.cpv !== "all" ? ", toate domeniile" : ""} →</Link>}
              {compareHref && <Link className="mx-p-act" href={compareHref} prefetch={false} data-only="complet">Compară cu primării de mărimea ei →</Link>}
            </p>}
            <div className="mx-p-cols">
              {/* The chart's two marks named beside the question (owner, 17 November 2026): the orange column and the dashed line. */}
              <div className="mx-p-sec" data-only="complet"><h3>Cât?{peak && (peak.perCapita ?? 0) > 0 && <small className="mx-p-key">
                <span><i className="is-peak" />anul de vârf</span>
                {d.years.some((y) => y.hallsPerCapita != null) && <span><i className="is-avg" />{words}</span>}</small>}</h3>
                {/* No sentence under a question (owner, 17 November 2026: the figures are in the chart and the rows); only an empty selection says so. */}
                {!(peak && (peak.perCapita ?? 0) > 0) && <p>Fără achiziții pe ani în această selecție.</p>}
                <Years years={d.years} href={yearHref} allDomains={d.selection.cpv !== "all"} words={words} />
              </div>
              <div className="mx-p-sec"><h3>Pe ce?</h3>
                {!d.cpv[0] && <p>Fără domenii în această selecție.</p>}
                <Rows tip={t.bind} rows={d.cpv.slice(0, 5).map((c) => ({ key: c.code ?? "none", name: c.name, bar: pct(c.value, d.cpv[0]!.value), value: share(c.value, total),
                  tip: [c.code ? `${c.name} · CPV ${c.code}` : c.name, `${int(c.value)} lei · ${share(c.value, total)}`, withDe(c.records, "înregistrare", "înregistrări")] }))} />
              </div>
              <div className="mx-p-sec"><h3>Cui?</h3>
                {!top && <p>Fără furnizori în această selecție.</p>}
                <Rows tip={t.bind} rows={d.suppliers.map((s) => ({ key: String(s.id), name: <EntityName id={s.id} role="supplier">{s.name}</EntityName>, bar: pct(s.value, top!.value),
                  value: share(s.value, value), tip: [s.name, `${int(s.value)} lei · ${share(s.value, value)} din total`, withDe(s.records, "înregistrare", "înregistrări")] }))} />
              </div>
            </div>
            {/* With the institutions (owner, 8 November 2026): which of the town hall's, and how much of the total. */}
            {d.institutions.length > 0 && (() => {
              const subTotal = d.institutions.reduce((a, x) => a + x.value, 0), first = d.institutions[0]!.value;
              return <div className="mx-p-sec mx-p-wide" data-only="complet"><h3>Instituțiile primăriei <small>{short(subTotal)} lei</small></h3>
                <Rows tip={t.bind} rows={d.institutions.slice(0, 8).map((x) => ({ key: x.id, name: <EntityName id={x.id} role="authority">{x.name}</EntityName>, bar: pct(x.value, first),
                  value: share(x.value, value), tip: [x.name, `${int(x.value)} lei · ${share(x.value, value)} din total`] }))} />
                {d.institutions.length > 8 && <p className="mx-p-more">Și încă {withDe(d.institutions.length - 8, "instituție", "instituții")}, cu {short(d.institutions.slice(8).reduce((a, x) => a + x.value, 0))} lei.</p>}
              </div>;
            })()}
            <div className="mx-p-sec mx-p-wide" data-only="complet"><h3>Printre vecini</h3><Neighbours data={d} onPick={onPick} tip={t.bind} /></div>
          </>;
        })()}
      </>}
  </div>
    {!full && <div className="mx-sheet-more"><button type="button" onClick={() => setFull(true)}>Toată fișa ↑</button></div>}
    {t.el}</section>;
}
