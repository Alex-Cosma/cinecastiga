"use client";
import { useProgress } from "../../components/motion/Done";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MonitoringCreateInput, MonitoringWatch } from "@/lib/monitoring-shared";
import { DEFAULT_MONITORING_PREFERENCES } from "@/lib/monitoring-shared";
import { questionTitle } from "@/lib/ask/filters/title";
import { trendWatchNote } from "../intreaba/trend-answer";
import { networkWatchNote } from "../intreaba/network-answer";
import Term from "@/components/Term";
import { cleanName } from "@/lib/format";
import { humanTitle } from "@/lib/private-format";
import { api, ErrorNotice, Preferences, ScopeSummary } from "./shared";
export default function FollowSetup({ back, ...input }: MonitoringCreateInput & { back?: { href: string; label: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState(input.title ?? humanTitle(cleanName(questionTitle(input.spec))).slice(0, 200));
  // The name field takes the focus on a wide screen only: on a phone the keyboard would cover what is followed.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (window.matchMedia("(min-width: 701px)").matches) field.current?.focus({ preventScroll: true }); }, []);
  const [preferences, setPreferences] = useState(DEFAULT_MONITORING_PREFERENCES);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  // On a phone the name and the button come first; what is followed folds under them (audit Z8-31).
  const [what, setWhat] = useState(false);
  // A trend's or a network's group: its members are fixed at activation (plan §2.8); a group over the limit is refused with how to narrow it.
  const groupNote = input.options.members || input.options.scope?.entityIds ? null : trendWatchNote(input.spec) ?? networkWatchNote(input.spec);
  // A creation that takes a while turns a piece of outline round its button (M-08); it closes when the watch exists.
  const work = useProgress<HTMLButtonElement>();
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); work.start();
    try { const result = await api<{ watch: MonitoringWatch }>("/api/urmariri", { method: "POST", body: JSON.stringify({ ...input, title, preferences }) }); work.done(true); router.push(`/urmariri/${result.watch.id}?created=1`); }
    catch (failure) { work.done(false); setError(failure instanceof Error ? failure.message : "Urmărirea nu a putut fi creată."); setBusy(false); }
  }
  return <><Link className="mon-back" href={back?.href ?? "/urmariri"}>← Înapoi la {back?.label ?? "urmăriri"}</Link><header className="mon-header"><h1>Urmărește modificările</h1><p className="mon-status">Urmărire privată</p></header><div className="mon-setup-grid"><section className="mon-what" data-open={what}><h2>Ce vei urmări</h2>
    <button type="button" className="mon-what-toggle" aria-expanded={what} onClick={() => setWhat(open => !open)}>Ce vei urmări <span aria-hidden="true">{what ? "▾" : "›"}</span></button>
    <div className="mon-what-body"><ScopeSummary scope={input} />{groupNote && <p className="mon-muted">{groupNote}</p>}{input.recipeVersion && <p className="mon-muted">Rețetă fixată la versiunea {input.recipeVersion}. Editările ulterioare ale rețetei nu schimbă această urmărire.</p>}<p className="mon-baseline mon-tip-line">Prima verificare stabilește reperul; achizițiile existente nu apar ca alerte. <Term id="reper-urmarire" tip /></p></div></section><form className="mon-form mon-setup-form" onSubmit={save}><fieldset disabled={busy}><label>Numele urmăririi<input ref={field} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><details className="mon-settings"><summary>Alege ce modificări te interesează</summary><Preferences value={preferences} onChange={setPreferences} disabled={busy} /></details><ErrorNotice error={error} /><button className="mon-primary" type="submit" ref={work.ref} disabled={busy || !title.trim()}>{busy ? "Se creează urmărirea…" : "Începe urmărirea"}</button></fieldset></form></div></>;
}
