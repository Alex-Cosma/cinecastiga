"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EntryKind, InvestigationWorkspace, WorkspaceEntry, WorkspaceLink } from "@/lib/investigation-workspace";

export interface WorkspaceClip { id: string; title: string; kind: string; createdAt: string }
export type WorkspaceTab = "questions" | "evidence" | "timeline" | "tasks";
const tabs: { id: WorkspaceTab; label: string }[] = [{ id: "questions", label: "Întrebări" }, { id: "evidence", label: "Dovezi" }, { id: "timeline", label: "Cronologie" }, { id: "tasks", label: "De verificat" }];
const stanceLabels = { supports: "Susține ipoteza", contradicts: "Contrazice ipoteza", check: "De verificat" };
const kindLabels = { question: "întrebare", note: "notă", task: "verificare", event: "eveniment" };
const date = (value: string) => new Date(value).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
const blank = (kind: EntryKind) => ({ kind, title: "", body: "", alternative: "", status: "open" as const, occurredOn: null });

export default function Workspace({ investigationId, initial, clips, evidence, initialTab = "questions" }: {
  investigationId: string; initial: InvestigationWorkspace; clips: WorkspaceClip[]; evidence: ReactNode; initialTab?: WorkspaceTab;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [editing, setEditing] = useState<WorkspaceEntry | EntryKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [focusClip, setFocusClip] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setWorkspace(initial), [initial]);
  useEffect(() => {
    if (tab === "evidence" && focusClip) {
      const element = document.getElementById(`clip-${focusClip}`);
      element?.scrollIntoView({ block: "center", behavior: "instant" }); element?.focus({ preventScroll: true }); setFocusClip(null);
    }
  }, [tab, focusClip]);
  async function mutate(body: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/anchete/${investigationId}/workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Modificarea nu a fost salvată.");
      const fresh = await fetch(`/api/anchete/${investigationId}/workspace`, { cache: "no-store" });
      if (!fresh.ok) throw new Error("Modificarea a fost salvată, dar dosarul nu s-a reîncărcat. Reîncarcă pagina.");
      setWorkspace(await fresh.json()); setNotice("Modificarea a fost salvată."); return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Nu am putut salva. Încearcă din nou."); return false; }
    finally { setBusy(false); }
  }
  const changeTab = (next: WorkspaceTab) => {
    setTab(next); setNotice(""); setError("");
    const url = new URL(location.href); url.searchParams.set("sectiune", next); history.replaceState(history.state, "", url);
  };
  const questions = workspace.entries.filter(entry => entry.kind === "question");
  const notes = workspace.entries.filter(entry => entry.kind === "note");
  const tasks = workspace.entries.filter(entry => entry.kind === "task");
  const events = workspace.entries.filter(entry => entry.kind === "event").sort((a, b) => (a.occurredOn ?? "").localeCompare(b.occurredOn ?? "") || a.id.localeCompare(b.id));
  const canEdit = workspace.access.canEdit;
  function entryActions(entry: WorkspaceEntry) {
    return <div className="iw-entry-actions">
      {canEdit && <button type="button" disabled={busy} onClick={() => setEditing(entry)}>Editează</button>}
      <details><summary>Istoric · v{entry.revision}</summary><ol className="iw-revisions">
        {workspace.revisions.filter(revision => revision.entryId === entry.id).map(revision => <li key={revision.revision}>
          <span>Versiunea {revision.revision} · {date(revision.createdAt)}{revision.author ? ` · ${revision.author}` : ""}</span>
          <strong>{String(revision.content.title ?? "")}</strong>
          {revision.content.body ? <p>{String(revision.content.body)}</p> : null}
          {revision.content.alternative ? <p>Explicație alternativă: {String(revision.content.alternative)}</p> : null}
          {revision.content.deleted === true && <p>Eliminată din lista de lucru; istoricul se păstrează.</p>}
        </li>)}
      </ol><p className="iw-muted">Istoricul afișează cele mai recente 200 de revizii din dosar.</p></details>
      {canEdit && <details><summary>Elimină din listă</summary><p>Textul rămâne în istoricul dosarului.</p><button type="button" className="iw-danger" disabled={busy} onClick={() => void mutate({ action: "archive", entryId: entry.id, revision: entry.revision })}>Confirmă eliminarea</button></details>}
    </div>;
  }
  function openEvidence(id: string) { changeTab("evidence"); setFocusClip(id); }
  function linkedEvidence(question: WorkspaceEntry) {
    const links = workspace.links.filter(link => link.questionId === question.id);
    return <div className="iw-question-evidence">
      {links.length > 0 ? <ul>{links.map(link => <li key={link.clipId}>
        <span className={`iw-stance iw-stance-${link.stance}`}>{stanceLabels[link.stance]}</span>
        <button className="iw-evidence-link" type="button" onClick={() => openEvidence(link.clipId)}>{clips.find(clip => clip.id === link.clipId)?.title ?? "Dovadă salvată"}</button>
        {link.note && <p>{link.note}</p>}
        {canEdit && <button className="iw-unlink" type="button" disabled={busy} onClick={() => void mutate({ action: "unlink", questionId: question.id, clipId: link.clipId })}>Desprinde de întrebare</button>}
      </li>)}</ul> : <p className="iw-muted">Leagă documentele care susțin sau contrazic această ipoteză. Păstrează și lucrurile încă neclare.</p>}
      {canEdit && clips.length > 0 && <details className="iw-connect"><summary>Leagă o dovadă</summary>
        <EvidenceLinkForm questionId={question.id} clips={clips} busy={busy} onSave={mutate} />
      </details>}
      {canEdit && clips.length === 0 && <p className="iw-muted">Salvează întâi un rezultat, un contract sau o entitate în acest dosar.</p>}
    </div>;
  }

  return <div className="iw-workspace">
    <div className="iw-tabs" role="tablist" aria-label="Secțiunile dosarului">{tabs.map((item, index) => <button key={item.id} id={`iw-tab-${item.id}`} type="button" role="tab" aria-controls="iw-panel" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
      ref={element => { tabRefs.current[index] = element; }} onClick={() => changeTab(item.id)}
      onKeyDown={event => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); changeTab(tabs[next]!.id); tabRefs.current[next]?.focus(); } }}>
      {item.label}<span>{item.id === "questions" ? questions.length : item.id === "evidence" ? clips.length + notes.length : item.id === "tasks" ? tasks.filter(task => task.status !== "done").length : events.length}</span>
    </button>)}</div>
    <div className="iw-feedback" aria-live="polite">{notice && <p>{notice}</p>}{error && <p role="alert" className="iw-error">{error}</p>}</div>
    {editing && <EntryEditor key={typeof editing === "string" ? editing : `${editing.id}-${editing.revision}`} entry={typeof editing === "string" ? null : editing} kind={typeof editing === "string" ? editing : editing.kind} busy={busy}
      onCancel={() => setEditing(null)} onSave={async body => { if (await mutate(body)) setEditing(null); }} />}
    <section id="iw-panel" role="tabpanel" aria-labelledby={`iw-tab-${tab}`} tabIndex={0}>
      {tab === "questions" && <>
        <div className="iw-section-head"><div><h2>De la întrebare la fapte</h2><p>O ipoteză de lucru, dovezile ei și explicațiile care merită testate.</p></div>{canEdit && <button className="iw-primary" type="button" onClick={() => setEditing("question")}>Adaugă întrebare</button>}</div>
        {questions.length === 0 ? <div className="iw-empty"><h3>Ce vrei să afli?</h3><p>Formulează o întrebare verificabilă. De exemplu: „De ce revine aceeași firmă în achizițiile acestei autorități?”</p><p>Asociază apoi dovezi pro și contra. O întrebare documentată nu este automat o concluzie.</p></div> : questions.map((question, index) => <article className="iw-question" key={question.id}>
          <div className="iw-entry-meta"><span>Întrebarea {index + 1}</span><span>{question.status === "done" ? "Documentată" : question.status === "checking" ? "În verificare" : "Deschisă"}</span></div>
          <h3>{question.title}</h3>{question.body && <p className="iw-prose">{question.body}</p>}
          {question.alternative && <div className="iw-alternative"><h4>O altă explicație posibilă</h4><p>{question.alternative}</p></div>}
          {linkedEvidence(question)}{entryActions(question)}
        </article>)}
      </>}
      {tab === "evidence" && <>
        <div className="iw-section-head"><div><h2>Ce ai păstrat în dosar</h2><p>Surse, rezultate salvate și observațiile redacției.</p></div>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("note")}>Adaugă notă</button>}</div>
        {notes.map(note => <article className="iw-editorial-note" key={note.id}><div className="iw-entry-meta">Notă editorială · {date(note.updatedAt)}</div><h3>{note.title}</h3><p className="iw-prose">{note.body}</p>{note.alternative && <div className="iw-alternative"><h4>Explicație alternativă</h4><p>{note.alternative}</p></div>}{entryActions(note)}</article>)}
        {evidence}
      </>}
      {tab === "timeline" && <>
        <div className="iw-section-head"><div><h2>Pune faptele în ordine</h2><p>Datele evenimentelor sunt introduse de redacție. Salvarea unei dovezi are propriul jurnal.</p></div>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("event")}>Adaugă eveniment</button>}</div>
        {events.length === 0 && <div className="iw-empty"><h3>Construiește firul evenimentelor</h3><p>Adaugă data unei atribuiri, a unui răspuns primit sau a unei verificări. Explică sursa datei în notă.</p></div>}
        <ol className="iw-timeline">{events.map(event => <li key={event.id}><time dateTime={event.occurredOn ?? undefined}>{event.occurredOn ? date(`${event.occurredOn}T12:00:00`) : "Dată necunoscută"}</time><div><h3>{event.title}</h3><p className="iw-prose">{event.body}</p>{entryActions(event)}</div></li>)}</ol>
        <details className="iw-journal"><summary>Jurnalul dosarului · salvări și revizii</summary><p className="iw-muted">Ordinea salvării în aplicație, nu data faptelor investigate. Cele mai recente 200 de revizii.</p><ol>
          {[...workspace.revisions.map(revision => ({ id: `${revision.entryId}-${revision.revision}`, at: revision.createdAt, text: `${String(revision.content.title ?? "Notă")} · versiunea ${revision.revision}${revision.content.deleted === true ? " · eliminată din listă" : ""}` })), ...clips.map(clip => ({ id: clip.id, at: clip.createdAt, text: `Dovadă salvată: ${clip.title}` }))].sort((a, b) => b.at.localeCompare(a.at)).map(event => <li key={event.id}><time>{date(event.at)}</time><span>{event.text}</span></li>)}
        </ol></details>
      </>}
      {tab === "tasks" && <>
        <div className="iw-section-head"><div><h2>Ce mai trebuie verificat</h2><p>Cere un punct de vedere, verifică o sumă, caută documentul lipsă.</p></div>{canEdit && <button type="button" className="iw-primary" onClick={() => setEditing("task")}>Adaugă verificare</button>}</div>
        {tasks.length === 0 && <div className="iw-empty"><h3>Nicio verificare deschisă încă</h3><p>Transformă incertitudinile în pași concreți, cu o notă despre ce ar clarifica răspunsul.</p></div>}
        <div className="iw-tasks">{tasks.map(task => <article key={task.id} className={task.status === "done" ? "iw-task iw-task-done" : "iw-task"}>
          <label className="iw-task-check"><input type="checkbox" checked={task.status === "done"} disabled={!canEdit || busy} onChange={() => void mutate({ action: "update", entryId: task.id, revision: task.revision, entry: { ...task, status: task.status === "done" ? "open" : "done" } })} /><span className="d-sr-only">Marchează „{task.title}” ca {task.status === "done" ? "nefinalizată" : "finalizată"}</span></label>
          <div><div className="iw-entry-meta">{task.status === "done" ? "Verificată" : task.status === "checking" ? "În lucru" : "De verificat"}{task.occurredOn ? ` · până la ${date(`${task.occurredOn}T12:00:00`)}` : ""}</div><h3>{task.title}</h3>{task.body && <p className="iw-prose">{task.body}</p>}{entryActions(task)}</div>
        </article>)}</div>
      </>}
    </section>
  </div>;
}

function EntryEditor({ entry, kind, busy, onCancel, onSave }: { entry: WorkspaceEntry | null; kind: EntryKind; busy: boolean; onCancel: () => void; onSave: (body: unknown) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); }, []);
  const value = entry ?? blank(kind);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await onSave({ action: entry ? "update" : "create", ...(entry ? { entryId: entry.id, revision: entry.revision } : {}), entry: {
      kind, title: String(data.get("title") ?? ""), body: String(data.get("body") ?? ""), alternative: String(data.get("alternative") ?? ""), status: String(data.get("status") ?? "open"), occurredOn: String(data.get("occurredOn") ?? "") || null,
    } });
  }
  return <form ref={form} className="iw-editor" onSubmit={submit} aria-busy={busy}>
    <h3>{entry ? "Editează" : "Adaugă"} {kindLabels[kind]}</h3><fieldset disabled={busy}>
      <label>{kind === "question" ? "Întrebarea de lucru" : "Titlu"}<input name="title" required maxLength={300} defaultValue={value.title} placeholder={kind === "question" ? "Ce ar trebui să verificăm?" : "Un titlu clar, ușor de regăsit"} /></label>
      <label>{kind === "event" ? "Ce s-a întâmplat și de unde știm" : "Context și observații"}<textarea name="body" rows={3} maxLength={12000} defaultValue={value.body} /></label>
      {(kind === "question" || kind === "note") && <label>Explicații alternative<textarea name="alternative" rows={2} maxLength={12000} defaultValue={value.alternative} placeholder="Ce explicație legitimă ar putea exista? Ce informație ne-ar schimba concluzia?" /></label>}
      <div className="iw-form-row">{(kind === "question" || kind === "task") && <label>Stare<select name="status" defaultValue={value.status}><option value="open">{kind === "task" ? "De verificat" : "Deschisă"}</option><option value="checking">În verificare</option><option value="done">{kind === "task" ? "Verificată" : "Documentată"}</option></select></label>}
        {(kind === "event" || kind === "task") && <label>{kind === "event" ? "Data evenimentului" : "Termen opțional"}<input type="date" name="occurredOn" required={kind === "event"} defaultValue={value.occurredOn ?? ""} /></label>}</div>
      <div className="iw-form-actions"><button className="iw-primary" type="submit">{busy ? "Se salvează…" : "Salvează"}</button><button type="button" onClick={onCancel}>Renunță</button></div>
    </fieldset>
  </form>;
}
function EvidenceLinkForm({ questionId, clips, busy, onSave }: { questionId: string; clips: WorkspaceClip[]; busy: boolean; onSave: (body: unknown) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    if (await onSave({ action: "link", questionId, clipId: data.get("clipId"), stance: data.get("stance"), note: data.get("note") })) form.reset();
  }
  return <form className="iw-link-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>Dovada salvată<select name="clipId" required>{clips.map(clip => <option key={clip.id} value={clip.id}>{clip.title}</option>)}</select></label>
    <label>Relația cu ipoteza<select name="stance" defaultValue="check">{Object.entries(stanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>De ce contează<textarea name="note" maxLength={4000} rows={2} /></label><button type="submit">Leagă dovada</button>
  </fieldset></form>;
}
