"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MonitoringCreateInput, MonitoringWatch } from "@/lib/monitoring-shared";
import { DEFAULT_MONITORING_PREFERENCES } from "@/lib/monitoring-shared";
import { questionTitle } from "@/lib/ask/filters/title";
import { trendWatchNote } from "../intreaba/trend-answer";
import Term from "@/components/Term";
import { api, ErrorNotice, Preferences, ScopeSummary } from "./shared";
export default function FollowSetup(input: MonitoringCreateInput) {
  const router = useRouter();
  const [title, setTitle] = useState(input.title ?? questionTitle(input.spec).slice(0, 200));
  const [preferences, setPreferences] = useState(DEFAULT_MONITORING_PREFERENCES);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  // A trend's group: its members are fixed at activation (plan §2.8); a group over the limit is refused with how to narrow it.
  const groupNote = input.options.members || input.options.scope?.entityIds ? null : trendWatchNote(input.spec);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ watch: MonitoringWatch }>("/api/urmariri", { method: "POST", body: JSON.stringify({ ...input, title, preferences }) }); router.push(`/urmariri/${result.watch.id}?created=1`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Urmărirea nu a putut fi creată."); setBusy(false); }
  }
  return <><Link className="mon-back" href="/urmariri">← Înapoi la urmăriri</Link><header className="mon-header"><h1>Urmărește modificările</h1><p className="mon-status">Urmărire privată</p></header><div className="mon-setup-grid"><section><h2>Ce vei urmări</h2><ScopeSummary scope={input} />{groupNote && <p className="mon-muted">{groupNote}</p>}{input.recipeVersion && <p className="mon-muted">Rețetă fixată la versiunea {input.recipeVersion}. Editările ulterioare ale rețetei nu schimbă această urmărire.</p>}<p className="mon-baseline mon-tip-line">Prima verificare stabilește reperul; achizițiile existente nu apar ca alerte. <Term id="reper-urmarire" tip /></p></section><form className="mon-form mon-setup-form" onSubmit={save}><fieldset disabled={busy}><label>Numele urmăririi<input autoFocus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><details className="mon-settings"><summary>Alege ce modificări te interesează</summary><Preferences value={preferences} onChange={setPreferences} disabled={busy} /></details><ErrorNotice error={error} /><button className="mon-primary" type="submit" disabled={busy || !title.trim()}>{busy ? "Se creează urmărirea…" : "Începe urmărirea"}</button></fieldset></form></div></>;
}
