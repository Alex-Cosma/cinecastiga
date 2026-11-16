"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CaptureSummary } from "@/lib/evidence-captures-shared";
import { formatExactDecimal } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay } from "@/lib/private-format";
import { copyCitation, loadCitation } from "@/components/private/CopyCitation";
import { removeClip, saveClipNote, toggleClipPin } from "./actions";
import CardMenu, { type CardAction } from "./CardMenu";

/** One saved item of a dossier, as the server reads it (DossierEvidence) and the card draws it. */
export interface EvidenceItem {
  id: string; kind: string; kindLabel: string;
  /** An acquisition's or a notice's SEAP code, beside the kind (the name is the title: Z8-35). */
  code: string | null;
  /** Its group in the kind filter ("Contracte", "Instituții și firme"…). */
  group: string;
  title: string; href: string | null; savedAt: string; pinned: boolean; note: string | null; refId: string | null;
  capture: CaptureSummary | null; versions: CaptureSummary[];
  /** The item's own exact value, on its line (a contract, an acquisition, a notice): the capture's total is not repeated. */
  ownValue: string | null;
  queryHref: string | null; registry: boolean;
  /** Saved items with a kept version (not a note or a document quote). */
  captured: boolean;
  /** Who bought from whom and the item's own value, server-drawn. */
  line: ReactNode;
  /** What some kinds add under the line (a watched change, a comparison, a quote). */
  extra: ReactNode;
}

type Panel = "link" | "note" | "registry" | "remove" | "versions" | "cite" | null;
const records = (n: number | null) => n === null ? "Înregistrări" : countWords(n, "înregistrare", "înregistrări");
const stale = (capture: CaptureSummary) => capture.status === "running" && capture.startedAt !== null && Date.now() - new Date(capture.startedAt).getTime() >= 5 * 60 * 1000;

/** The state of the kept version, said as a small pill beside the kind (a failed or pending capture never reads as kept). */
export function capturePill(capture: CaptureSummary | null, captured: boolean): { text: string; tone: "kept" | "amber" | "quiet" } | null {
  if (!captured) return null;
  if (!capture) return { text: "salvare veche, fără surse păstrate", tone: "amber" };
  if (capture.status === "complete") return { text: "Surse păstrate", tone: "kept" };
  if (capture.status === "failed") return { text: "fără surse păstrate", tone: "amber" };
  return { text: "Se păstrează sursele…", tone: "quiet" };
}

/**
 * A dossier card (owner, 7 November 2026; compact since the UX audit, Z8-05/06, owner 16 November 2026): the kind,
 * the state of its kept version and the day it was saved, with "⋯"; its name; one line (parties and value, or records
 * and total); the note on at most two lines; the questions it is linked to; "Fișa de probă →". Everything rarer is in
 * "⋯" — "Copiază citarea" included (owner) — and opens in place under the card.
 */
export default function EvidenceCard({ item, capture, canEdit, busy, investigationId, questions, linkForm, registry, onCapture, onAskQuestion }: {
  item: EvidenceItem; capture: CaptureSummary | null; canEdit: boolean; busy: boolean; investigationId: string;
  /** The questions it supports or contradicts (chips), or null. */
  questions: ReactNode;
  /** "Leagă de o întrebare": the link form, or null when there is no question left to link. */
  linkForm: ReactNode | null;
  /** "Din registre" (an institution or a firm), opened. */
  registry: ReactNode | null;
  onCapture: (clipId: string, newVersion: boolean) => Promise<void>;
  /** No question yet: the menu offers to write one for this evidence. */
  onAskQuestion: (() => void) | null;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    // The opened panel takes the focus (its first field, else itself) and comes into view without jumping.
    const target = area.current?.querySelector<HTMLElement>("textarea:not([readonly]),select,input:not([type=hidden]),summary,button") ?? area.current;
    target?.focus({ preventScroll: true }); area.current?.scrollIntoView({ block: "nearest" });
    if (panel === "cite") area.current?.querySelector<HTMLTextAreaElement>("textarea")?.select();
  }, [panel]);

  const all = [...new Map([...item.versions, ...(capture ? [capture] : [])].map(v => [v.id, v])).values()].sort((a, b) => b.version - a.version);
  const sheet = (v: CaptureSummary) => `/anchete/${investigationId}/dovezi/${v.id}`;
  const pill = capturePill(capture, item.captured);
  const complete = capture?.status === "complete" ? capture : null;
  const toggle = (next: Panel) => setPanel(current => current === next ? null : next);
  const run = async (task: () => Promise<unknown>, done: string) => {
    setPending(true); setStatus("");
    try { await task(); setStatus(done); setPanel(null); } catch { setStatus("Nu am putut salva. Încearcă din nou."); } finally { setPending(false); }
  };
  const form = (extra: Record<string, string>) => { const data = new FormData(); data.set("id", investigationId); data.set("clipId", item.id); for (const [k, v] of Object.entries(extra)) data.set(k, v); return data; };

  const actions: CardAction[] = [];
  if (complete) actions.push({ id: "cite", label: "Copiază citarea", onSelect: () => { setStatus("Se pregătește citarea…"); void copyCitation(() => loadCitation(`/api/anchete/${investigationId}/captures/${complete.id}/citare`)).then(result => {
    if ("done" in result) { setStatus("Citarea a fost copiată."); return; }
    if ("error" in result) { setStatus(result.error); return; }
    setStatus(""); setManual(result.manual); setPanel("cite");
  }); } });
  if (canEdit && item.captured && capture && (capture.status === "failed" || capture.status === "queued" || stale(capture)))
    actions.push({ id: "retry", label: "Reia capturarea", onSelect: () => void onCapture(item.id, false) });
  if (canEdit && item.captured && (!capture || capture.status === "complete"))
    actions.push({ id: "version", label: capture ? "Păstrează o versiune nouă" : "Capturează sursele disponibile acum", onSelect: () => void onCapture(item.id, true) });
  if (item.queryHref) actions.push({ id: "compare", label: "Compară cu înregistrările de azi", href: item.queryHref });
  if (canEdit && linkForm) actions.push({ id: "link", label: "Leagă de o întrebare", onSelect: () => toggle("link") });
  else if (canEdit && onAskQuestion) actions.push({ id: "ask", label: "Formulează o întrebare pentru ea", onSelect: onAskQuestion });
  if (registry) actions.push({ id: "registry", label: "Din registre (MF, ONRC, semnale)", onSelect: () => toggle("registry") });
  if (canEdit) actions.push({ id: "note", label: item.note ? "Schimbă nota" : "Adaugă notă", onSelect: () => toggle("note") });
  if (all.length > 1) actions.push({ id: "versions", label: `Toate versiunile (${all.length})`, onSelect: () => toggle("versions") });
  if (canEdit) actions.push({ id: "pin", label: item.pinned ? "Desprinde din începutul listei" : "Fixează la început",
    onSelect: () => void run(() => toggleClipPin(form({ pinned: String(!item.pinned) })), item.pinned ? "Dovada nu mai e fixată la început." : "Dovada e fixată la începutul listei.") });
  if (canEdit) actions.push({ id: "remove", label: "Scoate din dosar", danger: true, onSelect: () => toggle("remove") });

  const total = complete && complete.totalExact !== item.ownValue ? complete.totalExact === null ? "total necunoscut" : `${formatExactDecimal(complete.totalExact)} lei` : null;
  return <>
    <div className="iw-card-top">
      <div className="iw-entry-meta"><span className="iw-card-kind">{item.kindLabel}{item.code && <span className="iw-code"> · {item.code}</span>}</span>
        {item.pinned && <span className="iw-pill iw-pill-pin">Fixată</span>}
        {pill && <span className={`iw-pill iw-pill-${pill.tone}`}>{pill.text}</span>}
        <span className="iw-card-saved">Salvată la <time dateTime={item.savedAt}>{privateDay(item.savedAt)}</time></span></div>
      <CardMenu name={item.title} actions={actions} />
    </div>
    <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
    {(item.line || (!item.ownValue && complete)) && <p className="iw-evidence-line">{item.line ?? <span>{records(complete!.rowCount)}{total ? ` · ${total}` : ""}</span>}</p>}
    {item.extra}
    {item.note && <p className="iw-card-note" title={item.note}>{item.note}</p>}
    {questions}
    {complete && <p className="iw-card-sheet"><Link className="iw-frozen-source" href={sheet(complete)}>Fișa de probă →</Link></p>}
    {capture && (capture.status === "queued" || capture.status === "running") && <p className="iw-muted">Poți continua lucrul. Versiunea apare după verificare.</p>}
    <p className="iw-card-status" role="status">{status}</p>
    <div ref={area} className={panel ? "iw-card-panel" : undefined} tabIndex={-1} hidden={!panel}>
      {panel === "link" && linkForm}
      {panel === "registry" && registry}
      {panel === "note" && <form className="iw-clip-note-form" action={data => run(() => saveClipNote(data), "Nota a fost salvată.")}>
        <input type="hidden" name="id" value={investigationId} /><input type="hidden" name="clipId" value={item.id} />
        <label>De ce contează<textarea name="note" rows={3} maxLength={4000} defaultValue={item.note ?? ""} /></label>
        <div className="iw-form-actions"><button type="submit" className="iw-primary" disabled={pending || busy}>{pending ? "Se salvează…" : "Salvează nota"}</button><button type="button" onClick={() => setPanel(null)}>Renunță</button></div>
      </form>}
      {panel === "remove" && <form action={data => run(() => removeClip(data), "Dovada a fost scoasă din dosar.")}>
        <input type="hidden" name="id" value={investigationId} /><input type="hidden" name="clipId" value={item.id} />
        <p>Se scoate dovada și legăturile ei cu întrebările din acest dosar.</p>
        <div className="iw-form-actions"><button type="submit" className="iw-danger" disabled={pending || busy}>Confirmă: scoate din dosar</button><button type="button" onClick={() => setPanel(null)}>Renunță</button></div>
      </form>}
      {panel === "versions" && <ul className="iw-versions">{all.map(v => <li key={v.id}>{v.status === "complete"
        ? <Link href={sheet(v)}>Versiunea {v.version} · {privateDay(v.completedAt ?? v.createdAt)} · {records(v.rowCount)}</Link>
        : <span>Versiunea {v.version} · {v.status === "failed" ? "nefinalizată" : "în pregătire"}</span>}</li>)}</ul>}
      {panel === "cite" && <label className="cite-manual">Selectează și copiază citarea<textarea readOnly rows={6} value={manual} onFocus={event => event.currentTarget.select()} /></label>}
    </div>
  </>;
}
