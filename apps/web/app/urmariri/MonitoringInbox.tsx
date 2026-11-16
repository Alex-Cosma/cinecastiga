"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitoringPage, MonitoringRun, MonitoringWatch } from "@/lib/monitoring-shared";
import { Ghost, G, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import { countWords } from "@/lib/ask/answer-text";
import { api, ErrorNotice, moment, money, RefreshGhost, RefreshNotice, type RefreshState, RunCard, RunCardGhost } from "./shared";
/** A followed question's card while the list loads (its title and dates are private: lines only). */
function WatchCardGhost({ i }: { i: number }) {
  return <article className="mon-watch" aria-hidden="true"><h2><G.Line w={rankWidth(i, 60, 12, 40)} /><G.Line w="36%" only="phone" /></h2><p className="mon-now-line">Acum: <G.Line inline w="16em" /></p></article>;
}
/** A watch's state in words when it is not simply active (Z8-39: "Activă" is not repeated on every card). */
const watchState = (item: MonitoringWatch) => item.paused ? "Pe pauză" : item.lastError ? "Necesită atenție" : item.lastSuccessAt ? null : "Prima verificare în așteptare";
/**
 * A followed question's card (audit Z8-39): its title is its one link; under it what it holds now, from its last
 * complete check ("Acum: 49.691.799,63 lei · 539 de înregistrări · verificat 16.11.2026, 00:10"). The state is a tag
 * only when it is not active.
 */
function WatchCard({ item, compact = false }: { item: MonitoringWatch; compact?: boolean }) {
  const state = watchState(item), title = <Link href={`/urmariri/${item.id}`}>{item.title}</Link>;
  const now = item.lastSuccessAt ? [item.lastTotalExact != null ? money(item.lastTotalExact) : null, item.lastRowCount != null ? countWords(item.lastRowCount, "înregistrare", "înregistrări") : null, `verificat ${moment(item.lastSuccessAt)}`].filter(Boolean).join(" · ") : null;
  return <article className={`mon-watch${compact ? " mon-watch-compact" : ""}`}>
    {(state || item.unreadCount > 0) && <div className="mon-meta">{state && <span className="mon-tag">{state}</span>}{item.unreadCount > 0 && <span>{countWords(item.unreadCount, "actualizare de verificat", "actualizări de verificat")}</span>}</div>}
    {compact ? <h3>{title}</h3> : <h2>{title}</h2>}
    <p className="mon-now-line">{now ? <>Acum: {now}</> : "Încă neverificată"}</p>
    {item.lastError && <p className="mon-caution">{item.lastError}</p>}
  </article>;
}
const cardsGhost = (view: "updates" | "watches", n: number) => Array.from({ length: n }, (_, i) => view === "updates" ? <RunCardGhost key={i} i={i} /> : <WatchCardGhost key={i} i={i} />);
export default function MonitoringInbox({ view }: { view: "updates" | "watches" }) {
  const [unread, setUnread] = useState(true), [items, setItems] = useState<(MonitoringRun | MonitoringWatch)[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [refresh, setRefresh] = useState<RefreshState>();
  const [busy, setBusy] = useState(true), [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  // "Arată mai multe" keeps the cards and adds ghosts under them; "Reîncarcă lista" keeps them, dimmed.
  const [more, setMore] = useState(false);
  const [health, setHealth] = useState<{ failed: number; pending: number; paused: number }>();
  const controller = useRef<AbortController | null>(null);
  // Nothing to review but watches exist: they are shown here, so an empty list does not read as a failure.
  const [watches, setWatches] = useState<MonitoringWatch[] | null>(null);
  const [watchesMore, setWatchesMore] = useState(false);
  // The account's watches, read once: the switch's counts, the empty page (Z8-18) and, with nothing to review, the list.
  useEffect(() => {
    if (view !== "updates") return;
    const request = new AbortController();
    void api<MonitoringPage<MonitoringWatch>>("/api/urmariri", { signal: request.signal }).then(page => { if (!request.signal.aborted) { setWatches(page.items); setWatchesMore(Boolean(page.nextCursor)); } }).catch(() => {});
    return () => request.abort();
  }, [view]);
  const load = useCallback(async (after?: string) => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current; setBusy(true); setMore(Boolean(after)); setError("");
    try { const params = new URLSearchParams(); if (after) params.set("after", after); if (view === "updates" && unread) params.set("unread", "1");
      const result = await api<MonitoringPage<MonitoringRun | MonitoringWatch> & { refresh: RefreshState; health?: { failed: number; pending: number; paused: number } }>(`/api/urmariri${view === "updates" ? "/actualizari" : ""}?${params}`, { signal: current.signal });
      if (current.signal.aborted) return;
      setItems(previous => after ? [...previous, ...result.items] : result.items); setCursor(result.nextCursor); setRefresh(result.refresh); setHealth(result.health); setLoaded(true);
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : "Lista nu este disponibilă."); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }, [view, unread]);
  useEffect(() => { setLoaded(false); setItems([]); void load(); return () => controller.current?.abort(); }, [load]);
  const known = view === "watches" ? loaded ? items as MonitoringWatch[] : null : watches;
  const knownMore = view === "watches" ? Boolean(cursor) : watchesMore;
  // No watch at all (Z8-18): one way to start, none of the list's controls.
  const none = known !== null && known.length === 0 && !knownMore;
  const toReview = known?.reduce((n, item) => n + item.unreadCount, 0) ?? null;
  const count = (n: number | null, more = false) => n === null ? null : <span className="mon-seg-count">{more ? `${n}+` : n}</span>;
  return <>
    <header className="mon-header"><div className="mon-heading"><h1>Urmăriri</h1>{known !== null && !none && <Link className="mon-button" href="/intreaba?mode=builder">+ Urmărește o întrebare</Link>}</div></header>
    {refresh ? <RefreshNotice refresh={refresh} compact /> : !loaded && busy && <RefreshGhost />}
    {!none && health && (health.failed > 0 || health.pending > 0) && <div className="mon-caution"><strong>{health.failed > 0 ? health.failed === 1 ? "Ultima verificare a unei urmăriri a eșuat." : `Ultima verificare a eșuat pentru ${health.failed} urmăriri.` : health.pending === 1 ? "O urmărire așteaptă verificarea datelor disponibile." : `${health.pending} urmăriri așteaptă verificarea datelor disponibile.`}</strong><p>Lista de actualizări include doar verificările încheiate. <Link href="/urmariri?view=watches">Vezi starea urmăririlor →</Link></p></div>}
    {/* Two views of one tab (Z8-19): a segmented switch, not a second row of the private space's tabs. */}
    {!none && <nav className="mon-seg" aria-label="Ce arată lista"><Link href="/urmariri" aria-current={view === "updates" ? "page" : undefined}>Modificări{count(toReview, knownMore)}</Link><Link href="/urmariri?view=watches" aria-current={view === "watches" ? "page" : undefined}>Urmăririle mele{count(known?.length ?? null, knownMore)}</Link></nav>}
    {view === "updates" && !none && <div className="mon-list-controls"><label className="mon-check"><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />Doar cele de verificat</label><button type="button" disabled={busy} onClick={() => void load()}>Reîncarcă lista</button></div>}
    <ErrorNotice error={error} retry={() => void load()} />
    <section className={`mon-list${loaded && busy && !more ? " g-stale" : ""}`} aria-busy={busy} aria-label={view === "updates" ? "Actualizările urmăririlor" : "Urmăririle mele"}>
      {!loaded && busy && <Ghost name="mon-list" wait="client" label={view === "updates" ? "Se încarcă actualizările…" : "Se încarcă urmăririle…"}>{cardsGhost(view, 3)}</Ghost>}
      {none && loaded && !items.length ? <div className="mon-empty"><h2>Un subiect merită urmărit în timp.</h2><p>Pornește de la o instituție, o firmă sau o întrebare. Alege „Urmărește modificările” lângă rezultatul care te interesează.</p>
        <div className="mon-empty-actions"><Link className="mon-primary" href="/intreaba?mode=builder">Alege ce urmărești</Link><Link href="/">sau pornește de la o instituție →</Link></div></div>
        : loaded && !items.length && view === "updates" && watches && watches.length > 0 ? <div className="mon-empty mon-empty-watches"><h2>{unread ? "Nicio actualizare de verificat." : "Încă nu au apărut modificări."}</h2><p>Actualizările apar după schimbări în datele validate. {watches.length === 1 ? "Urmărirea ta:" : `Cele ${countWords(watches.length, "urmărire", "urmăriri")} ale tale:`}</p>{watches.map(item => <WatchCard key={item.id} item={item} compact />)}</div>
        : loaded && !items.length && view === "updates" && <div className="mon-empty"><h2>{unread ? "Nicio actualizare de verificat." : "Încă nu au apărut modificări."}</h2><p>Actualizările apar după schimbări în datele validate; starea fiecărei verificări este în lista urmăririlor.</p><Link className="mon-button" href="/urmariri?view=watches">Vezi starea urmăririlor →</Link></div>}
      {items.map(item => "watchId" in item ? <RunCard key={item.id} run={item} /> : <WatchCard key={item.id} item={item} />)}
      {loaded && busy && more && <Ghost name="mon-more" wait="client" label="Se încarcă mai multe…">{cardsGhost(view, 2)}</Ghost>}
    </section>
    {loaded && busy && !more && <FloatStatus>Se reîncarcă lista…</FloatStatus>}
    {cursor && <button className="mon-more" type="button" disabled={busy} onClick={() => void load(cursor)}>{busy ? "Se încarcă…" : "Arată mai multe"}</button>}
    <p className="mon-footnote">Actualizările sunt indicii de verificat. Valorile înregistrate nu reprezintă automat plăți, iar un semnal statistic nu dovedește o neregulă.</p>
  </>;
}
