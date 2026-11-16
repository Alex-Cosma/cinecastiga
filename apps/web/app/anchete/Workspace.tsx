"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import type { EntryKind, InvestigationWorkspace, WorkspaceEntry } from "@/lib/investigation-workspace";
import type { SourceEvent } from "@/lib/anchete";
import { captureFailureWords, type CaptureSummary } from "@/lib/evidence-captures-shared";
import { countWords } from "@/lib/ask/answer-text";
import { formatExactDecimal } from "@/lib/format";
import { privateDay, privateMoment } from "@/lib/private-format";
import { clipKindGroup, mergeSourceEvents, type MergedSourceEvent } from "@/lib/evidence-clip";
import Term from "@/components/Term";
import RegistryFacts from "./RegistryFacts";
import EvidenceCard, { type EvidenceItem } from "./EvidenceCard";
import CardMenu from "./CardMenu";
import DiscoveryIcon from "@/app/DiscoveryIcon";

export interface WorkspaceClip {
  id: string; title: string; kind: string; createdAt: string; refId: string | null;
  /** The item's own exact value and what it is, for the link pickers. */
  valueExact: string | null; valueUnit: string; valueLabel: string | null; date: string | null;
  /** An institution or firm: its card offers "Din registre". */
  registry: boolean;
}
/** The kind filter's groups, in the order a reader scans them (Z8-06); the editorial notes are "Note". */
const FILTER_ORDER = ["Note", "Întrebări salvate", "Semnale", "Contracte", "Anunțuri", "Achiziții directe", "Instituții și firme", "Persoane", "Radiografii", "Modificări urmărite", "Pasaje din documente", "Alte dovezi"];
const filterName: Record<string, string> = { "Întrebări salvate": "Întrebări" };
export type WorkspaceTab = "questions" | "evidence" | "timeline" | "tasks";
const tabs: { id: WorkspaceTab; label: string }[] = [{ id: "questions", label: "Întrebări" }, { id: "evidence", label: "Dovezi" }, { id: "timeline", label: "Cronologie" }, { id: "tasks", label: "Verificări" }];
const stanceLabels = { supports: "Susține", contradicts: "Contrazice", check: "De verificat" } as const;
const stanceOptions = { supports: "Susține ipoteza", contradicts: "Contrazice ipoteza", check: "De verificat" } as const;
/** What a stance says about the link, in its pill's explanation (M-01). */
const stanceTips = { supports: "Dovada e legată de întrebare ca sprijin pentru ipoteza ei.", contradicts: "Dovada e legată de întrebare ca argument împotriva ipotezei ei.", check: "Legătura dintre dovadă și ipoteză nu e încă stabilită." } as const;
const kindLabels = { question: "întrebare", note: "notă", task: "verificare", event: "eveniment" };
/** The header's search ("Caută", "/"); a page without it goes to /cauta. */
function openSearch() {
  const button = document.querySelector<HTMLButtonElement>(".d-global-search");
  if (button) button.click(); else location.assign("/cauta");
}
const blank = (kind: EntryKind) => ({ kind, title: "", body: "", alternative: "", status: "open" as const, occurredOn: null });
/** A picker option names the item with its exact value and date, never a bare title (owner, 7 November 2026). */
const clipOption = (clip: WorkspaceClip) => [clip.title.length > 90 ? `${clip.title.slice(0, 88)}…` : clip.title, clip.valueExact ? `${formatExactDecimal(clip.valueExact)} ${clip.valueUnit}` : null, clip.date ? privateDay(clip.date) : null].filter(Boolean).join(" · ");

export default function Workspace({ investigationId, initial, clips, evidence, sourceEvents, initialTab = "questions" }: {
  investigationId: string; initial: InvestigationWorkspace; clips: WorkspaceClip[]; evidence: EvidenceItem[]; sourceEvents: SourceEvent[]; initialTab?: WorkspaceTab;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const router = useRouter();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [editing, setEditing] = useState<WorkspaceEntry | EntryKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [show, setShow] = useState("all");
  const [captures, setCaptures] = useState<Record<string, CaptureSummary | null>>(() => Object.fromEntries(evidence.map(item => [item.id, item.capture])));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setWorkspace(initial), [initial]);
  useEffect(() => setCaptures(Object.fromEntries(evidence.map(item => [item.id, item.capture]))), [evidence]);
  // A kept version in preparation is polled until it ends (every card at once, one request each).
  const pendingKey = Object.entries(captures).filter(([, capture]) => capture && ["queued", "running"].includes(capture.status)).map(([clip, capture]) => `${clip}:${capture!.id}`).join(",");
  useEffect(() => {
    if (!pendingKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      for (const pair of pendingKey.split(",")) {
        const [clip, id] = pair.split(":");
        try {
          const response = await fetch(`/api/anchete/${investigationId}/captures/${id}`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) { setError("Nu putem verifica starea capturii. Reîncarcă dosarul."); continue; }
          const result = await response.json(); if (result.capture) setCaptures(current => ({ ...current, [clip!]: result.capture }));
        } catch { if (!controller.signal.aborted) setError("Conexiunea s-a întrerupt. Reîncarcă dosarul pentru a verifica starea capturii."); }
      }
    }, 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pendingKey, investigationId]);
  const [retrying, setRetrying] = useState(false);
  async function retryAll() {
    setRetrying(true);
    try { for (const item of evidence) if (captures[item.id]?.status === "failed") await capture(item.id, false); } finally { setRetrying(false); }
  }
  async function capture(clipId: string, newVersion: boolean) {
    const current = captures[clipId];
    setError("");
    try {
      const path = newVersion || !current ? `/api/anchete/${investigationId}/clips/${clipId}/captures` : `/api/anchete/${investigationId}/captures/${current.id}`;
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Captura nu a putut fi pornită.");
      if (result.capture) setCaptures(state => ({ ...state, [clipId]: result.capture }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Încearcă din nou."); }
  }
  useEffect(() => {
    if (!focus) return;
    const element = document.getElementById(focus);
    element?.scrollIntoView({ block: "center", behavior: "instant" }); element?.focus({ preventScroll: true }); setFocus(null);
  }, [tab, focus]);
  async function mutate(body: unknown, done = "Modificarea a fost salvată.") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/anchete/${investigationId}/workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Modificarea nu a fost salvată.");
      const fresh = await fetch(`/api/anchete/${investigationId}/workspace`, { cache: "no-store" });
      if (!fresh.ok) throw new Error("Modificarea a fost salvată, dar dosarul nu s-a reîncărcat. Reîncarcă pagina.");
      // The server's parts of the page ("Pe scurt", the counts) read the same change (bug: they kept the old state).
      setWorkspace(await fresh.json()); setNotice(done); router.refresh(); return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Nu am putut salva. Încearcă din nou."); return false; }
    finally { setBusy(false); }
  }
  const changeTab = (next: WorkspaceTab) => {
    setTab(next); setNotice(""); setError("");
    const url = new URL(location.href); url.searchParams.set("sectiune", next); url.hash = ""; history.replaceState(history.state, "", url);
  };
  const questions = workspace.entries.filter(entry => entry.kind === "question");
  const notes = workspace.entries.filter(entry => entry.kind === "note");
  const tasks = workspace.entries.filter(entry => entry.kind === "task");
  const events = workspace.entries.filter(entry => entry.kind === "event");
  const timeline = [...events.map(event => ({ key: event.id, date: event.occurredOn ?? "", event, source: null as MergedSourceEvent | null })),
    ...mergeSourceEvents(sourceEvents).map((source, i) => ({ key: `source-${i}`, date: source.date, event: null as WorkspaceEntry | null, source }))]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.source ? -1 : 1));
  const canEdit = workspace.access.canEdit;
  const clipById = new Map(clips.map(clip => [clip.id, clip]));
  function openEvidence(id: string) { changeTab("evidence"); setFocus(`clip-${id}`); }
  function openQuestion(id: string) { changeTab("questions"); setFocus(`question-${id}`); }
  function entryActions(entry: WorkspaceEntry) {
    return <div className="iw-entry-actions">
      {canEdit && <button type="button" disabled={busy} onClick={() => setEditing(entry)}>{entry.kind === "note" ? "Schimbă nota" : "Editează"}</button>}
      <details><summary>Istoric · v{entry.revision}</summary><ul className="iw-revisions">
        {workspace.revisions.filter(revision => revision.entryId === entry.id).map(revision => <li key={revision.revision}>
          <span>Versiunea {revision.revision} · {privateMoment(revision.createdAt)}{revision.author ? ` · ${revision.author}` : ""}</span>
          <strong>{String(revision.content.title ?? "")}</strong>
          {revision.content.body ? <p>{String(revision.content.body)}</p> : null}
          {revision.content.alternative ? <p>Explicație alternativă: {String(revision.content.alternative)}</p> : null}
          {revision.content.deleted === true && <p>Scoasă din dosar; istoricul se păstrează.</p>}
        </li>)}
      </ul></details>
      {canEdit && <details><summary>Scoate din dosar</summary><p>Textul rămâne în istoricul dosarului.</p><button type="button" className="iw-danger" disabled={busy} onClick={() => void mutate({ action: "archive", entryId: entry.id, revision: entry.revision }, "Scos din dosar; istoricul rămâne.")}>Confirmă: scoate din dosar</button></details>}
    </div>;
  }
  function linkedEvidence(question: WorkspaceEntry) {
    const links = workspace.links.filter(link => link.questionId === question.id);
    const free = clips.filter(clip => !links.some(link => link.clipId === clip.id));
    return <div className="iw-question-evidence">
      <h4>Dovezi legate {links.length > 0 && <span className="iw-count">{links.length}</span>}</h4>
      {links.length > 0 ? <ul>{links.map(link => { const clip = clipById.get(link.clipId); return <li key={link.clipId}>
        <Term tip hold="box" className={`iw-stance iw-stance-${link.stance}`} title={stanceOptions[link.stance]} text={stanceTips[link.stance]}>{stanceLabels[link.stance]}</Term>
        <button className="iw-evidence-link" type="button" onClick={() => openEvidence(link.clipId)}>{clip ? clipOption(clip) : "Dovadă salvată"}</button>
        {link.note && <p>{link.note}</p>}
        {canEdit && <button className="iw-unlink" type="button" disabled={busy} onClick={() => void mutate({ action: "unlink", questionId: question.id, clipId: link.clipId }, "Dovada a fost desprinsă de întrebare.")}>Desprinde</button>}
      </li>; })}</ul> : <p className="iw-muted">Nicio dovadă legată. Leagă ce susține sau contrazice ipoteza.</p>}
      {canEdit && free.length > 0 && <details className="iw-connect"><summary>Leagă o dovadă</summary>
        <LinkForm busy={busy} onSave={async (choice, stance, note) => mutate({ action: "link", questionId: question.id, clipId: choice, stance, note }, "Dovada a fost legată de întrebare.")}
          label="Dovada salvată" options={groupClips(free)} />
      </details>}
      {canEdit && clips.length === 0 && <p className="iw-muted">Salvează întâi un contract, o achiziție sau o entitate în acest dosar.</p>}
    </div>;
  }
  /** The questions an item supports or contradicts, as chips on its card. */
  function clipChips(clipId: string) {
    const links = workspace.links.filter(link => link.clipId === clipId);
    if (!links.length) return null;
    return <div className="iw-clip-questions"><ul aria-label="Întrebările legate">{links.map(link => { const question = questions.find(q => q.id === link.questionId); return question ? <li key={link.questionId}>
      <button type="button" className={`iw-stance-chip iw-stance-${link.stance}`} onClick={() => openQuestion(link.questionId)}><span className="iw-stance">{stanceLabels[link.stance]}</span> {question.title}</button>
    </li> : null; })}</ul></div>;
  }
  /** "Leagă de o întrebare" from the card's "⋯": the questions it is not linked to yet. */
  function clipLinkForm(clipId: string) {
    const links = workspace.links.filter(link => link.clipId === clipId);
    const free = questions.filter(question => !links.some(link => link.questionId === question.id));
    if (!canEdit || !free.length) return null;
    return <LinkForm busy={busy} onSave={async (choice, stance, note) => mutate({ action: "link", questionId: choice, clipId, stance, note }, "Dovada a fost legată de întrebare.")}
      label="Întrebarea" options={[{ group: null, items: free.map(question => ({ value: question.id, label: question.title })) }]} />;
  }
  const addNote = (title: string, body: string) => mutate({ action: "create", entry: { kind: "note", title, body, alternative: "", status: "open", occurredOn: null } }, "Nota a fost adăugată în Dovezi.");
  const failed = evidence.filter(item => item.captured && captures[item.id]?.status === "failed");
  const reasons = [...new Set(failed.map(item => captureFailureWords(captures[item.id]?.error).reason))];
  const failedReason = reasons.length === 1 ? reasons[0] : "capturile nu s-au încheiat";
  const groups = FILTER_ORDER.map(name => ({ name, label: filterName[name] ?? name, n: name === "Note" ? notes.length : evidence.filter(item => item.group === name).length })).filter(group => group.n > 0);
  const counts: Record<WorkspaceTab, number> = { questions: questions.length, evidence: clips.length + notes.length, timeline: timeline.length, tasks: tasks.filter(task => task.status !== "done").length };

  return <div className="iw-workspace">
    <div className="iw-tabs" role="tablist" aria-label="Secțiunile dosarului">{tabs.map((item, index) => <button key={item.id} id={`iw-tab-${item.id}`} type="button" role="tab" aria-controls="iw-panel" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
      ref={element => { tabRefs.current[index] = element; }} onClick={() => changeTab(item.id)}
      onKeyDown={event => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); changeTab(tabs[next]!.id); tabRefs.current[next]?.focus(); } }}>
      {item.label}<span className="iw-count">{counts[item.id]}</span>
    </button>)}</div>
    <div className="iw-feedback" aria-live="polite">{notice && <p>{notice}</p>}{error && <p role="alert" className="iw-error">{error}</p>}</div>
    {editing && <EntryEditor key={typeof editing === "string" ? editing : `${editing.id}-${editing.revision}`} entry={typeof editing === "string" ? null : editing} kind={typeof editing === "string" ? editing : editing.kind} busy={busy}
      onCancel={() => setEditing(null)} onSave={async body => { if (await mutate(body)) setEditing(null); }} />}
    <section id="iw-panel" role="tabpanel" aria-labelledby={`iw-tab-${tab}`} tabIndex={0}>
      {tab === "questions" && <>
        <div className="iw-section-head"><h2 className="d-sr-only">Întrebări</h2>{canEdit && <button className="iw-primary" type="button" onClick={() => setEditing("question")}>Adaugă întrebare</button>}</div>
        {questions.length === 0 ? <div className="iw-empty"><h3>Ce vrei să afli?</h3><p>Formulează o întrebare verificabilă. De exemplu: „De ce revine aceeași firmă în achizițiile acestei instituții?”</p><p>Leagă apoi dovezi pro și contra. O întrebare documentată nu este automat o concluzie.</p></div> : questions.map((question, index) => <article className="iw-question" id={`question-${question.id}`} tabIndex={-1} key={question.id}>
          <div className="iw-entry-meta"><span>Întrebarea {index + 1}</span><span>{question.status === "done" ? "Documentată" : question.status === "checking" ? "În verificare" : "Deschisă"}</span></div>
          <h3>{question.title}</h3>{question.body && <p className="iw-prose">{question.body}</p>}
          {question.alternative && <div className="iw-alternative"><h4>O altă explicație posibilă</h4><p>{question.alternative}</p></div>}
          {linkedEvidence(question)}{entryActions(question)}
        </article>)}
      </>}
      {tab === "evidence" && <>
        <div className="iw-section-head"><h2 className="d-sr-only">Dovezi</h2>
          {groups.length > 1 && <div className="iw-filter">
          <div className="iw-filter-pills" role="group" aria-label="Arată dovezile">{[{ name: "all", label: "Toate", n: notes.length + evidence.length }, ...groups].map(group => <button key={group.name} type="button" aria-pressed={show === group.name} onClick={() => setShow(group.name)}>{group.label}<span className="iw-count">{group.n}</span></button>)}</div>
          <label className="iw-filter-select">Arată<select value={show} onChange={event => setShow(event.target.value)}>{[{ name: "all", label: "Toate", n: notes.length + evidence.length }, ...groups].map(group => <option key={group.name} value={group.name}>{group.label} ({group.n})</option>)}</select></label>
        </div>}
          {canEdit && (evidence.length > 0 || notes.length > 0) && <button type="button" className="iw-primary" onClick={() => setEditing("note")}>Adaugă notă</button>}</div>
        {/* Captures that did not keep the sources, said once over the list (Z8-02); each card keeps its pill. */}
        {failed.length > 0 && <p className="iw-failed-line"><span>{countWords(failed.length, "dovadă", "dovezi")} fără surse păstrate: {failedReason}. <Term tip title="Fără surse păstrate" text="Dovezile sunt în dosar, cu numele și nota lor. Sursele (înregistrările și totalul exact) se păstrează doar dintr-o actualizare validată a datelor; până atunci nu le prezentăm ca dovadă completă." /></span>
          {canEdit && <button type="button" disabled={retrying} onClick={() => void retryAll()}>{retrying ? "Se reia…" : "Reîncearcă toate"}</button>}</p>}
        {(show === "all" || show === "Note") && notes.map(note => <article className="iw-editorial-note" key={note.id}>
          <NoteCard note={note} revisions={workspace.revisions.filter(revision => revision.entryId === note.id)} canEdit={canEdit} busy={busy} onEdit={() => setEditing(note)}
            onRemove={() => mutate({ action: "archive", entryId: note.id, revision: note.revision }, "Nota a fost scoasă din dosar; istoricul rămâne.")} />
        </article>)}
        {evidence.length === 0 && notes.length === 0 ? <div className="iw-empty"><h3>Păstrează prima dovadă</h3><p>Deschide pagina unei instituții, a unei firme sau a unui contract și apasă „Salvează în anchetă”. Vei regăsi aici selecția, sursele și momentul salvării.</p>
            {/* The way to a first piece of evidence is the empty dossier's main action (audit Z8-08). */}
            <div className="iw-empty-actions"><button type="button" className="iw-primary" onClick={openSearch}><DiscoveryIcon name="search" width={16} height={16} />Caută o instituție sau o firmă</button>
              <Link className="iw-secondary" href="/intreaba">Pune o întrebare</Link>{canEdit && <button type="button" onClick={() => setEditing("note")}>Adaugă notă</button>}</div></div>
          : <div className="iw-evidence-list">{evidence.filter(item => show === "all" || item.group === show).map((item, index, shown) => { const clip = clipById.get(item.id);
            // Pinned items come first (the server's order); the group is named, and its end marked (Z8-30).
            const label = item.pinned && index === 0 ? "Fixate la început" : !item.pinned && index > 0 && shown[index - 1]!.pinned ? "Celelalte dovezi" : null;
            return <Fragment key={item.id}>{label && <p className="iw-group-label">{label}</p>}<article id={`clip-${item.id}`} className={item.pinned ? "iw-evidence iw-pinned" : "iw-evidence"} tabIndex={-1}>
            <EvidenceCard item={item} capture={captures[item.id] ?? null} canEdit={canEdit} busy={busy} investigationId={investigationId}
              questions={clipChips(item.id)} linkForm={clipLinkForm(item.id)} onCapture={capture}
              onAskQuestion={canEdit && questions.length === 0 ? () => { changeTab("questions"); setEditing("question"); } : null}
              registry={clip?.registry && clip.refId ? <RegistryFacts open investigationId={investigationId} entityId={clip.refId} name={clip.title} canEdit={canEdit} busy={busy} onAddNote={addNote} /> : null} />
          </article></Fragment>; })}</div>}
      </>}
      {tab === "timeline" && <>
        <div className="iw-section-head"><h2 className="d-sr-only">Cronologie</h2>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("event")}>Adaugă eveniment</button>}</div>
        <p className="iw-legend"><span className="iw-legend-source">Din surse</span> datele contractelor și achizițiilor salvate · <span className="iw-legend-people">Scris în dosar</span> evenimentele adăugate de echipă <Term id="cronologie-redactie" tip /></p>
        {timeline.length === 0 && <div className="iw-empty"><h3>Construiește firul evenimentelor</h3><p>Datele contractelor și achizițiilor salvate apar aici singure. Adaugă un răspuns primit sau o verificare, cu sursa datei în notă.</p></div>}
        <ul className="iw-timeline">{timeline.map(item => item.source ? <li key={item.key} className="iw-timeline-source">
          <time dateTime={item.date}>{privateDay(item.date)}</time>
          <div><p className="iw-timeline-tag">Din surse · {item.source.label}{item.source.noticeNo && item.source.label === "Contract semnat" ? ` · anunț ${item.source.noticeNo}` : ""}</p><h3><Link href={item.source.href}>{item.source.kind === "da" ? clipById.get(item.source.clips[0]!.clipId)?.title ?? item.source.title : item.source.title}</Link></h3>
            <p className="iw-timeline-line">{item.source.valueExact ? `${formatExactDecimal(item.source.valueExact)} ${item.source.unit} · ` : ""}{item.source.clips.length === 1
              ? <button type="button" className="iw-text-button" onClick={() => openEvidence(item.source!.clips[0]!.clipId)}>Dovada din dosar</button>
              : <>Dovezile din dosar: {item.source.clips.map((c, i) => <Fragment key={c.clipId}>{i > 0 && ", "}<button type="button" className="iw-text-button" onClick={() => openEvidence(c.clipId)}>{c.kind === "notice" ? "anunțul" : c.kind === "da" ? "achiziția" : "contractul"}</button></Fragment>)}</>}
              {item.source.sourceUrl && <> · <a href={item.source.sourceUrl} target="_blank" rel="noopener noreferrer">SEAP<span aria-hidden="true"> ↗</span><span className="sr-only"> (filă nouă)</span></a></>}</p></div>
        </li> : <li key={item.key}>
          <time dateTime={item.event!.occurredOn ?? undefined}>{item.event!.occurredOn ? privateDay(item.event!.occurredOn) : "Dată necunoscută"}</time>
          <div><p className="iw-timeline-tag">Scris în dosar{item.event!.author ? ` · ${item.event!.author}` : ""}</p><h3>{item.event!.title}</h3>{item.event!.body && <p className="iw-prose">{item.event!.body}</p>}{entryActions(item.event!)}</div>
        </li>)}</ul>
        <details className="iw-journal"><summary>Jurnalul dosarului · salvări și revizii</summary><p className="iw-muted">Ordinea salvării în aplicație, nu data faptelor. Cele mai recente 200 de revizii.</p><ul>
          {[...workspace.revisions.map(revision => ({ id: `${revision.entryId}-${revision.revision}`, at: revision.createdAt, text: `${String(revision.content.title ?? "Notă")} · versiunea ${revision.revision}${revision.content.deleted === true ? " · scoasă din dosar" : ""}` })), ...clips.map(clip => ({ id: clip.id, at: clip.createdAt, text: `Dovadă salvată: ${clip.title}` }))].sort((a, b) => b.at.localeCompare(a.at)).map(event => <li key={event.id}><time dateTime={event.at}>{privateMoment(event.at)}</time><span>{event.text}</span></li>)}
        </ul></details>
      </>}
      {tab === "tasks" && <>
        <div className="iw-section-head"><h2 className="d-sr-only">Verificări</h2>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("task")}>Adaugă verificare</button>}</div>
        {tasks.length === 0 && <div className="iw-empty"><h3>Nicio verificare deschisă încă</h3><p>Transformă incertitudinile în pași concreți, cu o notă despre ce ar clarifica răspunsul.</p></div>}
        <div className="iw-tasks">{tasks.map(task => <article key={task.id} className={task.status === "done" ? "iw-task iw-task-done" : "iw-task"}>
          <label className="iw-task-check"><input type="checkbox" checked={task.status === "done"} disabled={!canEdit || busy} onChange={() => void mutate({ action: "update", entryId: task.id, revision: task.revision, entry: { ...task, status: task.status === "done" ? "open" : "done" } })} /><span className="d-sr-only">Marchează „{task.title}” ca {task.status === "done" ? "nefinalizată" : "finalizată"}</span></label>
          <div><div className="iw-entry-meta"><span>{task.status === "done" ? "Verificată" : task.status === "checking" ? "În lucru" : "De verificat"}{task.occurredOn ? ` · până la ${privateDay(task.occurredOn)}` : ""}</span></div><h3>{task.title}</h3>{task.body && <p className="iw-prose">{task.body}</p>}{entryActions(task)}</div>
        </article>)}</div>
      </>}
    </section>
  </div>;
}

/** An editorial note in Dovezi: its title and text, with "⋯" (Schimbă nota, Istoricul, Scoate din dosar) like the evidence cards. */
function NoteCard({ note, revisions, canEdit, busy, onEdit, onRemove }: {
  note: WorkspaceEntry; revisions: InvestigationWorkspace["revisions"]; canEdit: boolean; busy: boolean; onEdit: () => void; onRemove: () => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<"history" | "remove" | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panel) { (area.current?.querySelector<HTMLElement>("button") ?? area.current)?.focus({ preventScroll: true }); area.current?.scrollIntoView({ block: "nearest" }); } }, [panel]);
  return <>
    <div className="iw-card-top"><div className="iw-entry-meta"><span className="iw-card-kind">Notă editorială</span><span className="iw-card-saved">{privateDay(note.updatedAt)}</span></div>
      <CardMenu name={note.title} actions={[...(canEdit ? [{ id: "edit", label: "Schimbă nota", onSelect: onEdit }] : []), { id: "history", label: `Istoricul · v${note.revision}`, onSelect: () => setPanel(p => p === "history" ? null : "history") },
        ...(canEdit ? [{ id: "remove", label: "Scoate din dosar", danger: true, onSelect: () => setPanel(p => p === "remove" ? null : "remove") }] : [])]} /></div>
    <h3>{note.title}</h3>{note.body && <p className="iw-prose">{note.body}</p>}{note.alternative && <div className="iw-alternative"><h4>Explicație alternativă</h4><p>{note.alternative}</p></div>}
    <div ref={area} className={panel ? "iw-card-panel" : undefined} tabIndex={-1} hidden={!panel}>
      {panel === "history" && <ul className="iw-revisions">{revisions.map(revision => <li key={revision.revision}>
        <span>Versiunea {revision.revision} · {privateMoment(revision.createdAt)}{revision.author ? ` · ${revision.author}` : ""}</span>
        <strong>{String(revision.content.title ?? "")}</strong>{revision.content.body ? <p>{String(revision.content.body)}</p> : null}
        {revision.content.alternative ? <p>Explicație alternativă: {String(revision.content.alternative)}</p> : null}
      </li>)}</ul>}
      {panel === "remove" && <><p>Nota iese din dosar; textul rămâne în istoricul dosarului.</p><div className="iw-form-actions"><button type="button" className="iw-danger" disabled={busy} onClick={() => void onRemove()}>Confirmă: scoate din dosar</button><button type="button" onClick={() => setPanel(null)}>Renunță</button></div></>}
    </div>
  </>;
}

type OptionGroup = { group: string | null; items: { value: string; label: string }[] };
/** The saved items by kind (contracts, acquisitions, institutions and firms…), each with its value and date. */
function groupClips(clips: WorkspaceClip[]): OptionGroup[] {
  const groups = new Map<string, OptionGroup>();
  for (const clip of clips) {
    const name = clipKindGroup[clip.kind] ?? "Alte dovezi";
    if (!groups.has(name)) groups.set(name, { group: name, items: [] });
    groups.get(name)!.items.push({ value: clip.id, label: clipOption(clip) });
  }
  return [...groups.values()];
}

function LinkForm({ label, options, busy, onSave }: { label: string; options: OptionGroup[]; busy: boolean; onSave: (choice: string, stance: string, note: string) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    if (await onSave(String(data.get("choice") ?? ""), String(data.get("stance") ?? "check"), String(data.get("note") ?? ""))) form.reset();
  }
  return <form className="iw-link-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>{label}<select name="choice" required>{options.map(group => group.group
      ? <optgroup key={group.group} label={group.group}>{group.items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
      : group.items.map(item => <option key={item.value} value={item.value}>{item.label}</option>))}</select></label>
    <label>Relația cu ipoteza<select name="stance" defaultValue="check">{Object.entries(stanceOptions).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    <label><span>De ce contează <span className="iw-muted">Opțional</span></span><textarea name="note" maxLength={4000} rows={2} /></label><button type="submit">Leagă</button>
  </fieldset></form>;
}

function EntryEditor({ entry, kind, busy, onCancel, onSave }: { entry: WorkspaceEntry | null; kind: EntryKind; busy: boolean; onCancel: () => void; onSave: (body: unknown) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { const field = form.current?.querySelector<HTMLInputElement>('input[name="title"]'); field?.focus({ preventScroll: true }); form.current?.scrollIntoView({ block: "nearest" }); }, []);
  const value = entry ?? blank(kind);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await onSave({ action: entry ? "update" : "create", ...(entry ? { entryId: entry.id, revision: entry.revision } : {}), entry: {
      kind, title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), alternative: String(data.get("alternative") ?? ""), status: String(data.get("status") ?? "open"), occurredOn: String(data.get("occurredOn") ?? "") || null,
    } });
  }
  return <form ref={form} className="iw-editor" onSubmit={submit} aria-busy={busy} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <h3>{kind === "note" ? (entry ? "Schimbă nota" : "Notă editorială") : `${entry ? "Editează" : "Adaugă"} ${kindLabels[kind]}`}</h3><fieldset disabled={busy}>
      <label>{kind === "question" ? "Întrebarea de lucru" : "Titlu"}<input name="title" required maxLength={300} defaultValue={value.title} placeholder={kind === "question" ? "Ce ar trebui să verificăm?" : "Un titlu clar, ușor de regăsit"} /></label>
      <label>{kind === "event" ? "Ce s-a întâmplat și de unde știm" : "Context și observații"}<textarea name="body" rows={3} maxLength={12000} defaultValue={value.body} /></label>
      {(kind === "question" || kind === "note") && <label>Explicații alternative<textarea name="alternative" rows={2} maxLength={12000} defaultValue={value.alternative} placeholder="Ce explicație legitimă ar putea exista? Ce informație ne-ar schimba concluzia?" /></label>}
      <div className="iw-form-row">{(kind === "question" || kind === "task") && <label>Stare<select name="status" defaultValue={value.status}><option value="open">{kind === "task" ? "De verificat" : "Deschisă"}</option><option value="checking">În verificare</option><option value="done">{kind === "task" ? "Verificată" : "Documentată"}</option></select></label>}
        {(kind === "event" || kind === "task") && <label>{kind === "event" ? "Data evenimentului" : "Termen opțional"}<input type="date" name="occurredOn" required={kind === "event"} defaultValue={value.occurredOn ?? ""} /></label>}</div>
      <div className="iw-form-actions"><button className="iw-primary" type="submit">{busy ? "Se salvează…" : kind === "note" ? "Salvează nota" : "Salvează"}</button><button type="button" onClick={onCancel}>Renunță</button></div>
    </fieldset>
  </form>;
}
