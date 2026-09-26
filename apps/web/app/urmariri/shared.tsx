"use client";
import Link from "next/link";
import ScopeConditions from "./ScopeConditions";
import RefreshCoverage from "./RefreshCoverage";
import { useEffect, useState } from "react";
import type { MonitoringCheckpoint } from "@seap/db";
import type { MonitoringPreferences, MonitoringRun, MonitoringScope } from "@/lib/monitoring-shared";
import { MONITORING_CHANGE_TYPES } from "@/lib/monitoring-shared";
import { encodeSpec } from "@/lib/ask/permalink";
import { describeQuestion, periodLabel, type QuestionSpec } from "@/lib/ask/question-ui";
import { formatExactDecimal, formatInt } from "@/lib/format";
export const moment = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", dateStyle: "medium", timeStyle: "short" }) : "Încă neverificată";
export const money = (value: string | null | undefined) => value == null ? "Valoare necunoscută" : `${formatExactDecimal(value)} lei`;
export const updateHref = (run: MonitoringRun) => `/urmariri/${run.watchId}/actualizari/${run.id}`;
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => ({ error: "Răspunsul nu a putut fi citit. Încearcă din nou." }));
  if (!response.ok) throw new Error(response.status === 401 ? "Sesiunea a expirat. Autentifică-te din nou, apoi reîncarcă pagina." : data.error ?? "Cererea nu a reușit. Încearcă din nou.");
  return data;
}
export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="mon-error" role="alert"><p>{error}</p>{retry && <button type="button" onClick={retry}>Încearcă din nou</button>}{error.startsWith("Sesiunea") && <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/urmariri" : window.location.pathname + window.location.search)}`}>Autentifică-te →</Link>}</div> : null;
}
export type RefreshState = { current: MonitoringCheckpoint | null; lastReady: MonitoringCheckpoint | null; available: boolean };
export function RefreshNotice({ refresh }: { refresh?: RefreshState | undefined }) {
  if (!refresh) return null;
  return <div className={`mon-freshness ${refresh.available ? "" : "mon-caution"}`}><strong>{refresh.available ? "Verificări pe date validate" : refresh.current?.status === "running" ? "Actualizarea datelor este în curs" : refresh.current?.status === "failed" ? "Ultima actualizare a datelor nu s-a încheiat" : "Așteptăm prima actualizare validată"}</strong><p>{refresh.available ? `Date validate la ${moment(refresh.current?.completedAt)}. Aceasta este data verificării tehnice; sursele pot fi mai vechi.` : "Urmăririle și versiunile păstrate rămân disponibile. O verificare nereușită nu înseamnă că nu există modificări."}</p>{refresh.lastReady && !refresh.available && <p>Ultima validare reușită: {moment(refresh.lastReady.completedAt)}.</p>}{refresh.lastReady && <details className="mon-small-details"><summary>Cât de recente sunt sursele?</summary><RefreshCoverage checkpoint={{ ...refresh.lastReady }} /></details>}</div>;
}
export function selectionHref({ spec, options }: MonitoringScope) { return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1${options.scope ? `&evidence=${encodeURIComponent(JSON.stringify(options.scope))}` : ""}&sourceFilters=${encodeURIComponent(JSON.stringify(options))}`; }
export function ScopeSummary({ scope, notes = [] }: { scope: MonitoringScope; notes?: string[] }) {
  // The receipt below states the base period and every additional rule separately.
  // Do not turn grouped OR date predicates into a single inferred date range.
  const question = describeQuestion(scope.spec as QuestionSpec).replace(` · ${periodLabel(scope.spec as QuestionSpec)}`, "");
  return <div className="mon-scope"><p><strong>Întrebarea de pornire: </strong>{question}</p><ScopeConditions scope={scope} />{notes.map((note, i) => <p className="mon-muted" key={i}>{note}</p>)}<Link href={selectionHref(scope)}>Deschide întrebarea și sursele →</Link><details><summary>Detalii tehnice ale selecției</summary><pre>{JSON.stringify(scope, null, 2)}</pre></details></div>;
}
export const changeNames = { added: "Înregistrări intrate în selecție", changed: "Corecții în datele sursă", removed: "Înregistrări ieșite din selecție", recalculated: "Rezultate recalculate", methodology: "Metodologie modificată" };
export interface DigestStatus { available: boolean; reason: string | null; optedInWatches: number; latest: { period: string; status: string; updateCount: number; sentAt: string | null; error: string | null } | null }
export function Preferences({ value, onChange, disabled = false }: { value: MonitoringPreferences; onChange: (value: MonitoringPreferences) => void; disabled?: boolean }) {
  const [digest, setDigest] = useState<DigestStatus | null>(null);
  useEffect(() => { const controller = new AbortController(); void api<DigestStatus>("/api/urmariri/digest", { signal: controller.signal }).then(setDigest).catch(() => {}); return () => controller.abort(); }, []);
  return <fieldset className="mon-preferences" disabled={disabled}><legend>Ce modificări te interesează?</legend>{MONITORING_CHANGE_TYPES.map(type => <label className="mon-check" key={type}><input type="checkbox" checked={value.types.includes(type)} onChange={event => onChange({ ...value, types: event.target.checked ? [...value.types, type] : value.types.filter(t => t !== type) })} />{changeNames[type]}</label>)}<label>Valoarea minimă a unei înregistrări · lei<input type="text" inputMode="decimal" value={value.minimumValueExact} onChange={e => onChange({ ...value, minimumValueExact: e.target.value.replace(",", ".") })} /></label><p className="mon-muted">0 include toate valorile. La corecții folosim valoarea mai mare dintre cele două versiuni. Schimbările de metodologie rămân separate.</p><label className="mon-check"><input type="checkbox" checked={value.digest} disabled={!digest?.available && !value.digest} onChange={e => onChange({ ...value, digest: e.target.checked })} />Trimite-mi un rezumat zilnic prin e-mail</label><p className="mon-muted">{digest?.available ? "Doar când există actualizări relevante. Poți opri e-mailurile oricând de aici." : digest?.reason?.startsWith("Confirmă") ? digest.reason : "Rezumatele prin e-mail nu sunt încă disponibile aici. Urmăririle continuă în aplicație."}</p>{digest?.latest && ["failed", "uncertain"].includes(digest.latest.status) && <p className="mon-caution">{digest.latest.error ?? "Ultimul rezumat nu are livrarea confirmată. Verifică actualizările din cont."}</p>}</fieldset>;
}
export function RunCard({ run }: { run: MonitoringRun }) {
  const c = run.counts;
  return <article className={`mon-update${run.reviewedAt ? " mon-reviewed" : ""}`}><div className="mon-meta"><span className="mon-tag">{run.kind === "baseline" ? "Situația de referință" : run.kind === "unchanged" ? "Fără modificări" : c.changed ? "Date modificate" : c.added || c.removed ? "Selecție modificată" : run.methodologyChanged ? "Metodologie modificată" : "Rezultat recalculat"}</span><time dateTime={run.checkedAt}>{moment(run.checkedAt)}</time>{run.reviewedAt && <span>Verificat ✓</span>}</div><div className="mon-row"><div><h2><Link href={updateHref(run)}>{run.watchTitle}</Link></h2><div className="mon-facts">{c.added > 0 && <span><b>{formatInt(c.added)}</b> intrate în selecție</span>}{c.changed > 0 && <span><b>{formatInt(c.changed)}</b> modificate</span>}{c.removed > 0 && <span><b>{formatInt(c.removed)}</b> ieșite din selecție</span>}{run.kind === "baseline" && <span>{formatInt(run.rowCount)} înregistrări păstrate ca reper</span>}{run.kind === "unchanged" && <span>Selecția, rezultatul și metodologia sunt neschimbate.</span>}{run.kind === "update" && c.added + c.removed + c.changed === 0 && <span>Înregistrările sursă sunt neschimbate. Verifică diferențele de rezultat sau metodologie.</span>}</div></div><Link className="mon-button" href={updateHref(run)}>{run.kind === "baseline" ? "Vezi sursele" : "Vezi modificările"} →</Link></div></article>;
}
