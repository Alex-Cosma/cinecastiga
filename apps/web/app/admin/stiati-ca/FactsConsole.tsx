"use client";
import { useCallback, useEffect, useState } from "react";
import { FACT_KIND_LABEL } from "@/lib/fact-words";
import type { AdminFact, FactAction, FactChange } from "@/lib/facts";

const FAILED = "Lista faptelor nu poate fi citită acum.";
const day = (s: string | null) => (s ? s.split("-").reverse().join(".") : "");
type Tab = "proposed" | "scheduled" | "published" | "out";
const TABS: { key: Tab; label: string }[] = [
  { key: "proposed", label: "De ales" }, { key: "scheduled", label: "Programate" }, { key: "published", label: "Publicate" }, { key: "out", label: "Respinse și retrase" },
];
const tabOf = (f: AdminFact): Tab => f.status === "proposed" ? "proposed" : f.status === "approved" ? (f.published ? "published" : "scheduled") : "out";

/**
 * Admin → Știați că (owner, 26 November 2026): the proposals of the processing runs, each with its check, and the
 * choice for each one: publish today, schedule a day, reject, withdraw, correct the words. A proposal nobody touches
 * stays unpublished.
 */
export default function FactsConsole() {
  const [facts, setFacts] = useState<AdminFact[] | null>(null), [today, setToday] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("proposed"), [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState<FactChange>({});
  const [when, setWhen] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/facts", { cache: "no-store" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || FAILED);
      setFacts(result.facts); setToday(result.today); setError("");
    } catch (e) { setError(e instanceof Error && e.message ? e.message : FAILED); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, action: FactAction, change: FactChange = {}) => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/facts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action, ...change }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Alegerea nu a fost salvată. Reîncearcă.");
      setEditing(null); setDraft({}); await load();
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "Alegerea nu a fost salvată. Reîncearcă."); }
    finally { setBusy(false); }
  };
  const all = facts ?? [];
  const counts = (key: Tab) => all.filter((f) => tabOf(f) === key).length;
  const shown = all.filter((f) => tabOf(f) === tab);
  const field = (key: keyof FactChange, label: string, f: AdminFact, wide = false) => (
    <label className={wide ? "fc-wide" : undefined}>{label}
      <input value={draft[key] ?? (f[key as "figure" | "unit" | "statement" | "context"] ?? "")} maxLength={320} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
    </label>);
  return <section className="facts-console">
    <header>
      <p>Procesarea propune fapte; aici alegi ce apare pe <a href="/stiati-ca" target="_blank" rel="noopener noreferrer">pagina publică</a>. Ce nu atingi rămâne nepublicat.</p>
    </header>
    <div className="fc-tabs" role="tablist" aria-label="Starea faptelor">
      {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : undefined} onClick={() => setTab(t.key)}>{t.label} <b>{facts ? counts(t.key) : "…"}</b></button>)}
    </div>
    {error && <p role="alert" className="fc-error">{error} <button type="button" className="text-button" onClick={() => void load()}>Reîncearcă</button></p>}
    {facts && shown.length === 0 && <p className="fc-empty">{tab === "proposed" ? "Nicio propunere de ales. Următoarea procesare aduce altele." : "Nimic aici."}</p>}
    <ol className="fc-list">
      {shown.map((f) => <li key={f.id} className="fc-item">
        <div className="fc-card">
          <p className="fc-fig">{f.figure}{f.unit && <small> {f.unit}</small>}</p>
          <p className="fc-say">{f.statement}</p>
          {f.context && <p className="fc-ctx">{f.context}</p>}
          {f.linkHref && <p className="fc-link"><a href={f.linkHref} target="_blank" rel="noopener noreferrer">{f.linkLabel ?? "Vezi înregistrările"} ›</a></p>}
        </div>
        <div className="fc-side">
          <p className="fc-meta">
            <span className="fc-chip">{FACT_KIND_LABEL[f.kind] ?? f.kind}</span>
            <span className={`fc-chip ${f.checkStatus === "look" ? "is-look" : "is-ok"}`}>{f.checkStatus === "look" ? "de văzut" : "în regulă"}</span>
            {f.status === "approved" && <span className="fc-chip is-on">{f.published ? `publicat ${day(f.publishOn)}` : `programat ${day(f.publishOn)}`}</span>}
            {f.status === "rejected" && <span className="fc-chip is-out">respins</span>}
            {f.status === "withdrawn" && <span className="fc-chip is-out">retras</span>}
            {f.edited && <span className="fc-chip">text corectat</span>}
          </p>
          {f.checkNote && <p className="fc-note">{f.checkNote}</p>}
          {f.repeats && <p className="fc-note">Aceeași instituție sau firmă apare într-un alt fapt aprobat, la mai puțin de 30 de zile.</p>}
          {editing === f.id
            ? <form className="fc-edit" onSubmit={(e) => { e.preventDefault(); void act(f.id, "edit", draft); }}>
                {field("figure", "Cifra", f)}{field("unit", "După cifră", f)}{field("statement", "Propoziția", f, true)}{field("context", "Contextul", f, true)}
                <p><button type="submit" className="text-button" disabled={busy}>Salvează textul</button>{" "}<button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(null); setDraft({}); }}>Renunță</button></p>
              </form>
            : <p className="fc-actions">
                {f.status === "proposed" && <>
                  <button type="button" className="text-button" disabled={busy} onClick={() => void act(f.id, "publish")}>Publică acum</button>
                  <span className="fc-when"><input type="date" aria-label="Ziua publicării" min={today} value={when[f.id] ?? ""} onChange={(e) => setWhen((w) => ({ ...w, [f.id]: e.target.value }))} />
                    <button type="button" className="text-button" disabled={busy || !when[f.id]} onClick={() => void act(f.id, "schedule", { publishOn: when[f.id]! })}>Programează</button></span>
                  <button type="button" className="text-button" disabled={busy} onClick={() => void act(f.id, "reject")}>Respinge</button>
                </>}
                {f.status === "approved" && !f.published && <button type="button" className="text-button" disabled={busy} onClick={() => void act(f.id, "publish")}>Publică acum</button>}
                {f.status === "approved" && <button type="button" className="text-button" disabled={busy} onClick={() => void act(f.id, "withdraw")}>{f.published ? "Retrage" : "Scoate din program"}</button>}
                {(f.status === "rejected" || f.status === "withdrawn") && <button type="button" className="text-button" disabled={busy} onClick={() => void act(f.id, "restore")}>Repune între propuneri</button>}
                {f.status !== "rejected" && f.status !== "withdrawn" && <button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(f.id); setDraft({}); }}>Corectează textul</button>}
              </p>}
        </div>
      </li>)}
    </ol>
  </section>;
}
