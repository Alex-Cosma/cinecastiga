"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitoringPage, MonitoringRun, MonitoringWatch } from "@/lib/monitoring-shared";
import { Ghost, G, rankWidth } from "@/components/ghost/Ghost";
import { FloatStatus } from "@/components/ghost/client";
import { countWords } from "@/lib/ask/answer-text";
import { api, ErrorNotice, moment, RefreshGhost, RefreshNotice, type RefreshState, RunCard, RunCardGhost } from "./shared";
/** A followed question's card while the list loads (its title and dates are private: lines only). */
function WatchCardGhost({ i }: { i: number }) {
  return <article className="mon-watch" aria-hidden="true"><div className="mon-row"><div className="mon-g-fill"><div className="mon-meta"><span className="mon-tag"><G.Line inline w="4.5em" /></span></div>
    <h2><G.Line w={rankWidth(i, 60, 12, 40)} /><G.Line w="36%" only="phone" /></h2><p className="mon-muted">Ultima verificare reușită: <G.Line inline w="9em" /></p></div>
    <span className="mon-button g-quiet">Deschide urmărirea →</span></div></article>;
}
function WatchCard({ item, compact = false }: { item: MonitoringWatch; compact?: boolean }) {
  return <article className={`mon-watch${compact ? " mon-watch-compact" : ""}`}><div className="mon-row"><div><div className="mon-meta"><span className="mon-tag">{item.paused ? "Pe pauză" : item.lastError ? "Necesită atenție" : item.lastSuccessAt ? "Activă" : "Prima verificare în așteptare"}</span>{item.unreadCount > 0 && <span>{countWords(item.unreadCount, "actualizare de verificat", "actualizări de verificat")}</span>}</div>{compact ? <h3><Link href={`/urmariri/${item.id}`}>{item.title}</Link></h3> : <h2><Link href={`/urmariri/${item.id}`}>{item.title}</Link></h2>}<p className="mon-muted">Ultima verificare reușită: {moment(item.lastSuccessAt)}</p>{item.lastError && <p className="mon-caution">{item.lastError}</p>}</div><Link className="mon-button" href={`/urmariri/${item.id}`}>Deschide urmărirea →</Link></div></article>;
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
  useEffect(() => {
    if (view !== "updates" || !loaded || items.length || watches) return;
    const request = new AbortController();
    void api<MonitoringPage<MonitoringWatch>>("/api/urmariri", { signal: request.signal }).then(page => { if (!request.signal.aborted) setWatches(page.items); }).catch(() => {});
    return () => request.abort();
  }, [view, loaded, items.length, watches]);
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
  return <><header className="mon-header"><div className="mon-heading"><h1>Ce s-a schimbat?</h1><Link className="mon-button" href="/intreaba?mode=builder">+ Urmărește o întrebare</Link></div></header>{refresh ? <RefreshNotice refresh={refresh} /> : !loaded && busy && <RefreshGhost />}{health && (health.failed > 0 || health.pending > 0) && <div className="mon-caution"><strong>{health.failed > 0 ? health.failed === 1 ? "Ultima verificare a unei urmăriri a eșuat." : `Ultima verificare a eșuat pentru ${health.failed} urmăriri.` : health.pending === 1 ? "O urmărire așteaptă verificarea datelor disponibile." : `${health.pending} urmăriri așteaptă verificarea datelor disponibile.`}</strong><p>Lista de actualizări include doar verificările încheiate. <Link href="/urmariri?view=watches">Vezi starea urmăririlor →</Link></p></div>}<nav className="mon-tabs" aria-label="Tip de listă"><Link href="/urmariri" aria-current={view === "updates" ? "page" : undefined}>Actualizări</Link><Link href="/urmariri?view=watches" aria-current={view === "watches" ? "page" : undefined}>Urmăririle mele</Link></nav>{view === "updates" && <div className="mon-list-controls"><label className="mon-check"><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />Doar cele de verificat</label><button type="button" disabled={busy} onClick={() => void load()}>Reîncarcă lista</button></div>}<ErrorNotice error={error} retry={() => void load()} /><section className={`mon-list${loaded && busy && !more ? " g-stale" : ""}`} aria-busy={busy} aria-label={view === "updates" ? "Actualizările urmăririlor" : "Urmăririle mele"}>{!loaded && busy && <Ghost name="mon-list" wait="client" label={view === "updates" ? "Se încarcă actualizările…" : "Se încarcă urmăririle…"}>{cardsGhost(view, 3)}</Ghost>}{loaded && !items.length && view === "updates" && watches && watches.length > 0 ? <div className="mon-empty mon-empty-watches"><h2>{unread ? "Nicio actualizare de verificat." : "Încă nu au apărut modificări."}</h2><p>Actualizările apar după schimbări în datele validate. {watches.length === 1 ? "Urmărirea ta:" : `Cele ${countWords(watches.length, "urmărire", "urmăriri")} ale tale:`}</p>{watches.map(item => <WatchCard key={item.id} item={item} compact />)}</div> : loaded && !items.length && <div className="mon-empty"><h2>{view === "watches" ? "Un subiect merită urmărit în timp." : unread ? "Nicio actualizare de verificat." : "Încă nu au apărut modificări."}</h2><p>{view === "watches" ? "Pornește de la o instituție, o firmă sau o întrebare. Alege „Urmărește modificările” lângă rezultatul care te interesează." : "Prima verificare stabilește situația de referință. Actualizările apar după schimbări în datele validate; starea fiecărei verificări este în lista urmăririlor."}</p><Link className="mon-button" href={view === "watches" ? "/intreaba?mode=builder" : "/urmariri?view=watches"}>{view === "watches" ? "Construiește o întrebare" : "Vezi starea urmăririlor"} →</Link></div>}{items.map(item => "watchId" in item ? <RunCard key={item.id} run={item} /> : <WatchCard key={item.id} item={item} />)}{loaded && busy && more && <Ghost name="mon-more" wait="client" label="Se încarcă mai multe…">{cardsGhost(view, 2)}</Ghost>}</section>{loaded && busy && !more && <FloatStatus>Se reîncarcă lista…</FloatStatus>}{cursor && <button className="mon-more" type="button" disabled={busy} onClick={() => void load(cursor)}>{busy ? "Se încarcă…" : "Arată mai multe"}</button>}<p className="mon-footnote">Actualizările sunt indicii de verificat. Valorile înregistrate nu reprezintă automat plăți, iar un semnal statistic nu dovedește o neregulă.</p></>;
}
