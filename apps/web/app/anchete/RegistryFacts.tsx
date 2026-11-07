"use client";

import { useState } from "react";
import type { RegistryFacts as Facts } from "@/lib/dossier-registry";
import { formatExactDecimal } from "@/lib/format";
import { privateDay, yearRuns as years } from "@/lib/private-format";
import { countWords } from "@/lib/ask/answer-text";
import { G } from "@/components/ghost/Ghost";

const employeesWords = (n: number) => countWords(n, "angajat", "angajați");

/**
 * "Din registre" on an institution's or a firm's card (owner, 7 November 2026): the MF balance sheets by year, the ONRC
 * administrators and the signals the profile carries today, each with its source and year, read when opened. "Adaugă
 * ca notă" writes the fact into the dossier as an editorial note that names its source. Today's registries, not the
 * frozen capture: the card says so.
 */
export default function RegistryFacts({ investigationId, entityId, name, canEdit, busy, onAddNote }: {
  investigationId: string; entityId: string; name: string; canEdit: boolean; busy: boolean; onAddNote: (title: string, body: string) => Promise<boolean>;
}) {
  const [facts, setFacts] = useState<Facts | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function load() {
    if (facts || loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/anchete/${investigationId}/registre/${entityId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Registrele nu au putut fi citite.");
      setFacts(data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Registrele nu au putut fi citite."); }
    finally { setLoading(false); }
  }
  const today = privateDay(new Date());
  const add = (title: string, body: string) => canEdit ? <button type="button" className="iw-text-button" disabled={busy} onClick={() => void onAddNote(title, `${body} Preluat din registre la ${today}.`)}>Adaugă ca notă</button> : null;
  const empty = facts && !facts.financials.length && !facts.administrators.people.length && !facts.signals.length;
  return <details className="iw-registry" onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>Din registre</summary>
    <div className="iw-registry-body">
      {loading && <div className="g-ghost" role="status" aria-label="Se citesc registrele…"><p><G.Line w="60%" /></p><p><G.Line w="45%" /></p><p><G.Line w="52%" /></p></div>}
      {error && <p className="iw-error" role="alert">{error} <button type="button" className="iw-text-button" onClick={() => void load()}>Încearcă din nou</button></p>}
      {empty && <p className="iw-muted">Nicio informație în bilanțurile MF, la ONRC sau în semnale pentru această entitate.</p>}
      {facts && facts.financials.length > 0 && <section aria-label="Bilanț MF"><h4>Bilanț MF <span>angajați și cifra de afaceri netă</span></h4><ul>
        {facts.financials.slice(0, 6).map(row => { const parts = [row.employees !== null ? employeesWords(row.employees) : null, row.turnoverExact !== null ? `${formatExactDecimal(row.turnoverExact)} lei cifră de afaceri` : null].filter(Boolean).join(" · ");
          return <li key={row.year}><span className="iw-registry-year">{row.year}</span><span>{parts}</span>{add(`${name}: ${parts} în ${row.year}`, `Sursa: bilanțul depus la Ministerul Finanțelor pentru anul ${row.year}${facts.cui ? ` (CUI ${facts.cui})` : ""}.`)}</li>; })}
      </ul>{facts.financials.length > 6 && <p className="iw-muted">Încă {facts.financials.length - 6} ani pe pagina entității.</p>}</section>}
      {facts && facts.administrators.people.length > 0 && <section aria-label="Administratori ONRC"><h4>Administratori ONRC <span>{facts.administrators.snapshotDate ? `registrul din ${privateDay(facts.administrators.snapshotDate)}` : "registrul comerțului"}</span></h4><ul>
        {facts.administrators.people.map((person, i) => <li key={i}><span>{person.name}{person.role ? <span className="iw-muted"> · {person.role}</span> : null}</span>{add(`${name}: ${person.role ?? "reprezentant"} ${person.name}`, `Sursa: Registrul Comerțului (ONRC)${facts.administrators.snapshotDate ? `, extrasul din ${privateDay(facts.administrators.snapshotDate)}` : ""}${facts.cui ? `, CUI ${facts.cui}` : ""}.`)}</li>)}
      </ul></section>}
      {facts && facts.signals.length > 0 && <section aria-label="Semnale"><h4>Semnale <span>piste de verificat, nu dovezi</span></h4><ul>
        {facts.signals.map(signal => <li key={signal.code}><span>{signal.label}{signal.years.length ? <span className="iw-muted"> · {years(signal.years)}</span> : null}</span>{add(`${name}: semnalul „${signal.label}”`, `Sursa: semnalele cinecâștigă, calculate din datele SEAP${signal.years.length ? `, anii ${years(signal.years)}` : ""}. Un semnal este o pistă de verificare, nu o dovadă.`)}</li>)}
      </ul></section>}
      {facts && !empty && <p className="iw-muted">Datele de azi din registre, nu din versiunea păstrată.</p>}
    </div>
  </details>;
}
