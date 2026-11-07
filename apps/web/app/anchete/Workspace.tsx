"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EntryKind, InvestigationWorkspace, WorkspaceEntry } from "@/lib/investigation-workspace";
import type { SourceEvent } from "@/lib/anchete";
import { formatExactDecimal } from "@/lib/format";
import { privateDay, privateMoment } from "@/lib/private-format";
import { clipKindGroup } from "@/lib/evidence-clip";
import Term from "@/components/Term";
import RegistryFacts from "./RegistryFacts";

export interface WorkspaceClip {
  id: string; title: string; kind: string; createdAt: string; refId: string | null;
  /** The item's own exact value and what it is, for the link pickers. */
  valueExact: string | null; valueUnit: string; valueLabel: string | null; date: string | null;
  /** An institution or firm: its card offers "Din registre". */
  registry: boolean;
}
export interface WorkspaceEvidence { id: string; head: ReactNode; body: ReactNode }
export type WorkspaceTab = "questions" | "evidence" | "timeline" | "tasks";
const tabs: { id: WorkspaceTab; label: string }[] = [{ id: "questions", label: "Întrebări" }, { id: "evidence", label: "Dovezi" }, { id: "timeline", label: "Cronologie" }, { id: "tasks", label: "De verificat" }];
const stanceLabels = { supports: "Susține", contradicts: "Contrazice", check: "De verificat" } as const;
const stanceOptions = { supports: "Susține ipoteza", contradicts: "Contrazice ipoteza", check: "De verificat" } as const;
const kindLabels = { question: "întrebare", note: "notă", task: "verificare", event: "eveniment" };
const blank = (kind: EntryKind) => ({ kind, title: "", body: "", alternative: "", status: "open" as const, occurredOn: null });
/** A picker option names the item with its exact value and date, never a bare title (owner, 7 November 2026). */
const clipOption = (clip: WorkspaceClip) => [clip.title.length > 90 ? `${clip.title.slice(0, 88)}…` : clip.title, clip.valueExact ? `${formatExactDecimal(clip.valueExact)} ${clip.valueUnit}` : null, clip.date ? privateDay(clip.date) : null].filter(Boolean).join(" · ");

export default function Workspace({ investigationId, initial, clips, evidence, sourceEvents, initialTab = "questions" }: {
  investigationId: string; initial: InvestigationWorkspace; clips: WorkspaceClip[]; evidence: WorkspaceEvidence[]; sourceEvents: SourceEvent[]; initialTab?: WorkspaceTab;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [editing, setEditing] = useState<WorkspaceEntry | EntryKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setWorkspace(initial), [initial]);
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
      setWorkspace(await fresh.json()); setNotice(done); return true;
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
  const timeline = [...events.map(event => ({ key: event.id, date: event.occurredOn ?? "", event, source: null as SourceEvent | null })),
    ...sourceEvents.map((source, i) => ({ key: `source-${i}`, date: source.date, event: null as WorkspaceEntry | null, source }))]
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
          {revision.content.deleted === true && <p>Eliminată din lista de lucru; istoricul se păstrează.</p>}
        </li>)}
      </ul></details>
      {canEdit && <details><summary>Elimină din listă</summary><p>Textul rămâne în istoricul dosarului.</p><button type="button" className="iw-danger" disabled={busy} onClick={() => void mutate({ action: "archive", entryId: entry.id, revision: entry.revision })}>Confirmă eliminarea</button></details>}
    </div>;
  }
  function linkedEvidence(question: WorkspaceEntry) {
    const links = workspace.links.filter(link => link.questionId === question.id);
    const free = clips.filter(clip => !links.some(link => link.clipId === clip.id));
    return <div className="iw-question-evidence">
      <h4>Dovezi legate {links.length > 0 && <span className="iw-count">{links.length}</span>}</h4>
      {links.length > 0 ? <ul>{links.map(link => { const clip = clipById.get(link.clipId); return <li key={link.clipId}>
        <span className={`iw-stance iw-stance-${link.stance}`}>{stanceLabels[link.stance]}</span>
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
  /** The questions an item supports or contradicts, on its card; it can be linked from there too. */
  function clipQuestions(clipId: string) {
    const links = workspace.links.filter(link => link.clipId === clipId);
    const free = questions.filter(question => !links.some(link => link.questionId === question.id));
    if (!links.length && !canEdit) return null;
    return <div className="iw-clip-questions">
      {links.length > 0 && <ul aria-label="Întrebările legate">{links.map(link => { const question = questions.find(q => q.id === link.questionId); return question ? <li key={link.questionId}>
        <button type="button" className={`iw-stance-chip iw-stance-${link.stance}`} onClick={() => openQuestion(link.questionId)}><span className="iw-stance">{stanceLabels[link.stance]}</span> {question.title}</button>
      </li> : null; })}</ul>}
      {canEdit && (questions.length === 0 ? <button type="button" className="iw-text-button" onClick={() => { changeTab("questions"); setEditing("question"); }}>Formulează o întrebare pentru această dovadă</button>
        : free.length > 0 && <details className="iw-connect"><summary>{links.length ? "Leagă și de altă întrebare" : "Leagă de o întrebare"}</summary>
          <LinkForm busy={busy} onSave={async (choice, stance, note) => mutate({ action: "link", questionId: choice, clipId, stance, note }, "Dovada a fost legată de întrebare.")}
            label="Întrebarea" options={[{ group: null, items: free.map(question => ({ value: question.id, label: question.title })) }]} />
        </details>)}
    </div>;
  }
  const addNote = (title: string, body: string) => mutate({ action: "create", entry: { kind: "note", title, body, alternative: "", status: "open", occurredOn: null } }, "Nota a fost adăugată în Dovezi.");
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
        <div className="iw-section-head"><h2>Întrebări</h2>{canEdit && <button className="iw-primary" type="button" onClick={() => setEditing("question")}>Adaugă întrebare</button>}</div>
        {questions.length === 0 ? <div className="iw-empty"><h3>Ce vrei să afli?</h3><p>Formulează o întrebare verificabilă. De exemplu: „De ce revine aceeași firmă în achizițiile acestei instituții?”</p><p>Leagă apoi dovezi pro și contra. O întrebare documentată nu este automat o concluzie.</p></div> : questions.map((question, index) => <article className="iw-question" id={`question-${question.id}`} tabIndex={-1} key={question.id}>
          <div className="iw-entry-meta"><span>Întrebarea {index + 1}</span><span>{question.status === "done" ? "Documentată" : question.status === "checking" ? "În verificare" : "Deschisă"}</span></div>
          <h3>{question.title}</h3>{question.body && <p className="iw-prose">{question.body}</p>}
          {question.alternative && <div className="iw-alternative"><h4>O altă explicație posibilă</h4><p>{question.alternative}</p></div>}
          {linkedEvidence(question)}{entryActions(question)}
        </article>)}
      </>}
      {tab === "evidence" && <>
        <div className="iw-section-head"><h2>Dovezi</h2>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("note")}>Adaugă notă</button>}</div>
        {notes.map(note => <article className="iw-editorial-note" key={note.id}><div className="iw-entry-meta"><span>Notă editorială</span><span>{privateDay(note.updatedAt)}</span></div><h3>{note.title}</h3>{note.body && <p className="iw-prose">{note.body}</p>}{note.alternative && <div className="iw-alternative"><h4>Explicație alternativă</h4><p>{note.alternative}</p></div>}{entryActions(note)}</article>)}
        {evidence.length === 0 && notes.length === 0 ? <div className="iw-empty"><h3>Păstrează prima dovadă</h3><p>Folosește „Salvează în anchetă” pe pagina unei instituții, a unei firme, a unui contract sau lângă o întrebare. Vei regăsi aici selecția, sursele și momentul salvării.</p><Link href="/intreaba">Deschide o întrebare →</Link></div>
          : <div className="iw-evidence-list">{evidence.map(part => { const clip = clipById.get(part.id); return <article id={`clip-${part.id}`} className="iw-evidence" tabIndex={-1} key={part.id}>
            {part.head}
            {clipQuestions(part.id)}
            {clip?.registry && clip.refId && <RegistryFacts investigationId={investigationId} entityId={clip.refId} name={clip.title} canEdit={canEdit} busy={busy} onAddNote={addNote} />}
            {part.body}
          </article>; })}</div>}
      </>}
      {tab === "timeline" && <>
        <div className="iw-section-head"><h2>Cronologie</h2>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("event")}>Adaugă eveniment</button>}</div>
        <p className="iw-legend"><span className="iw-legend-source">Din surse</span> datele contractelor și achizițiilor salvate · <span className="iw-legend-people">Scris în dosar</span> evenimentele adăugate de echipă <Term id="cronologie-redactie" tip /></p>
        {timeline.length === 0 && <div className="iw-empty"><h3>Construiește firul evenimentelor</h3><p>Datele contractelor și achizițiilor salvate apar aici singure. Adaugă un răspuns primit sau o verificare, cu sursa datei în notă.</p></div>}
        <ul className="iw-timeline">{timeline.map(item => item.source ? <li key={item.key} className="iw-timeline-source">
          <time dateTime={item.date}>{privateDay(item.date)}</time>
          <div><p className="iw-timeline-tag">Din surse · {item.source.label}</p><h3><Link href={item.source.href}>{item.source.title}</Link></h3>
            <p className="iw-timeline-line">{item.source.valueExact ? `${formatExactDecimal(item.source.valueExact)} ${item.source.unit} · ` : ""}<button type="button" className="iw-text-button" onClick={() => openEvidence(item.source!.clipId)}>Dovada din dosar</button>{item.source.sourceUrl && <> · <a href={item.source.sourceUrl} target="_blank" rel="noopener noreferrer">SEAP<span aria-hidden="true"> ↗</span><span className="sr-only"> (filă nouă)</span></a></>}</p></div>
        </li> : <li key={item.key}>
          <time dateTime={item.event!.occurredOn ?? undefined}>{item.event!.occurredOn ? privateDay(item.event!.occurredOn) : "Dată necunoscută"}</time>
          <div><p className="iw-timeline-tag">Scris în dosar{item.event!.author ? ` · ${item.event!.author}` : ""}</p><h3>{item.event!.title}</h3>{item.event!.body && <p className="iw-prose">{item.event!.body}</p>}{entryActions(item.event!)}</div>
        </li>)}</ul>
        <details className="iw-journal"><summary>Jurnalul dosarului · salvări și revizii</summary><p className="iw-muted">Ordinea salvării în aplicație, nu data faptelor. Cele mai recente 200 de revizii.</p><ul>
          {[...workspace.revisions.map(revision => ({ id: `${revision.entryId}-${revision.revision}`, at: revision.createdAt, text: `${String(revision.content.title ?? "Notă")} · versiunea ${revision.revision}${revision.content.deleted === true ? " · eliminată din listă" : ""}` })), ...clips.map(clip => ({ id: clip.id, at: clip.createdAt, text: `Dovadă salvată: ${clip.title}` }))].sort((a, b) => b.at.localeCompare(a.at)).map(event => <li key={event.id}><time dateTime={event.at}>{privateMoment(event.at)}</time><span>{event.text}</span></li>)}
        </ul></details>
      </>}
      {tab === "tasks" && <>
        <div className="iw-section-head"><h2>De verificat</h2>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("task")}>Adaugă verificare</button>}</div>
        {tasks.length === 0 && <div className="iw-empty"><h3>Nicio verificare deschisă încă</h3><p>Transformă incertitudinile în pași concreți, cu o notă despre ce ar clarifica răspunsul.</p></div>}
        <div className="iw-tasks">{tasks.map(task => <article key={task.id} className={task.status === "done" ? "iw-task iw-task-done" : "iw-task"}>
          <label className="iw-task-check"><input type="checkbox" checked={task.status === "done"} disabled={!canEdit || busy} onChange={() => void mutate({ action: "update", entryId: task.id, revision: task.revision, entry: { ...task, status: task.status === "done" ? "open" : "done" } })} /><span className="d-sr-only">Marchează „{task.title}” ca {task.status === "done" ? "nefinalizată" : "finalizată"}</span></label>
          <div><div className="iw-entry-meta"><span>{task.status === "done" ? "Verificată" : task.status === "checking" ? "În lucru" : "De verificat"}{task.occurredOn ? ` · până la ${privateDay(task.occurredOn)}` : ""}</span></div><h3>{task.title}</h3>{task.body && <p className="iw-prose">{task.body}</p>}{entryActions(task)}</div>
        </article>)}</div>
      </>}
    </section>
  </div>;
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
    <h3>{kind === "note" ? (entry ? "Schimbă nota" : "Adaugă notă") : `${entry ? "Editează" : "Adaugă"} ${kindLabels[kind]}`}</h3><fieldset disabled={busy}>
      <label>{kind === "question" ? "Întrebarea de lucru" : "Titlu"}<input name="title" required maxLength={300} defaultValue={value.title} placeholder={kind === "question" ? "Ce ar trebui să verificăm?" : "Un titlu clar, ușor de regăsit"} /></label>
      <label>{kind === "event" ? "Ce s-a întâmplat și de unde știm" : "Context și observații"}<textarea name="body" rows={3} maxLength={12000} defaultValue={value.body} /></label>
      {(kind === "question" || kind === "note") && <label>Explicații alternative<textarea name="alternative" rows={2} maxLength={12000} defaultValue={value.alternative} placeholder="Ce explicație legitimă ar putea exista? Ce informație ne-ar schimba concluzia?" /></label>}
      <div className="iw-form-row">{(kind === "question" || kind === "task") && <label>Stare<select name="status" defaultValue={value.status}><option value="open">{kind === "task" ? "De verificat" : "Deschisă"}</option><option value="checking">În verificare</option><option value="done">{kind === "task" ? "Verificată" : "Documentată"}</option></select></label>}
        {(kind === "event" || kind === "task") && <label>{kind === "event" ? "Data evenimentului" : "Termen opțional"}<input type="date" name="occurredOn" required={kind === "event"} defaultValue={value.occurredOn ?? ""} /></label>}</div>
      <div className="iw-form-actions"><button className="iw-primary" type="submit">{busy ? "Se salvează…" : kind === "note" ? "Salvează nota" : "Salvează"}</button><button type="button" onClick={onCancel}>Renunță</button></div>
    </fieldset>
  </form>;
}
