"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cloneQuestion, describeQuestion, questionKey, type QuestionSpec } from "@/lib/ask/question-ui";
import { encodeSpec } from "@/lib/ask/permalink";
import { validateSpec } from "@/lib/ask/spec";
import { useViewer } from "@/lib/use-viewer";
import { localQuestionStorage, LocalQuestionError, saveLocalQuestion, suggestLocalCopyTitle } from "@/lib/ask/local-questions";
import type { SavedQuestion } from "./SavedQuestions";

type Props = { spec: QuestionSpec; disabled: boolean; active: SavedQuestion | null; onSaved: (question: SavedQuestion) => void };
export default function SaveQuestionButton(props:Props) {
  const viewer = useViewer();
  const local = !viewer.userId;
  const active = props.active && (local ? props.active.storage === "local" : props.active.ownerId === viewer.userId) ? props.active : null;
  return <SaveQuestionForm key={viewer.userId ?? "device"} {...props} active={active} userId={viewer.userId} disabled={props.disabled || !viewer.ready || !!viewer.error} />;
}
function SaveQuestionForm({ spec, disabled, active, onSaved, userId }: Props & { userId:string | undefined }) {
  const local = !userId;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const [snapshot, setSnapshot] = useState(spec);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [copyMode, setCopyMode] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [titleTaken, setTitleTaken] = useState(false);
  const [snapshotActive, setSnapshotActive] = useState(active);
  const saved = !!active && questionKey(active.spec) === questionKey(spec);
  useEffect(() => () => controller.current?.abort(), []);

  function open() {
    setSnapshot(cloneQuestion(spec));
    setSnapshotActive(active);
    setCopyMode(false); setTitleTaken(false);
    setTitle(active?.title ?? describeQuestion(spec).slice(0, 160));
    setError("");
    setLogin(false);
    dialog.current?.showModal();
  }

  function close() {
    if (pending.current) return;
    dialog.current?.close();
    trigger.current?.focus();
  }

  async function prepareCopy() {
    if (pending.current || !title.trim()) return;
    pending.current = true; setBusy(true); setPreparing(true); setError(""); setTitleTaken(false);
    const current = new AbortController(); controller.current = current;
    try {
      if (local) {
        setTitle(suggestLocalCopyTitle(localQuestionStorage(), title.trim())); setCopyMode(true);
        requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>("input")?.focus());
        return;
      }
      const response = await fetch(`/api/recipes?copyTitle=${encodeURIComponent(title.trim())}`, { cache:"no-store", signal:current.signal });
      if (response.status === 401) { setLogin(true); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nu am putut propune un nume. Încearcă din nou.");
      if (current.signal.aborted) return;
      setTitle(data.title); setCopyMode(true);
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>("input")?.focus());
    } catch (e) { if (!current.signal.aborted) setError((e as Error).message); }
    finally { pending.current = false; if (!current.signal.aborted) { setBusy(false); setPreparing(false); } }
  }

  async function save(event: React.SyntheticEvent) {
    event.preventDefault();
    if (pending.current || saved || !title.trim()) return;
    const validated = validateSpec(snapshot);
    if ("error" in validated) { setError(validated.error); return; }
    const revising = !copyMode && snapshotActive;
    pending.current = true;
    setBusy(true);
    setError("");
    const current = new AbortController();
    controller.current = current;
    try {
      if (local) {
        const question = await saveLocalQuestion({ title:title.trim(), spec:validated, ...(revising ? { expectedVersion:revising.version } : {}) }, revising ? revising.id : undefined);
        if (current.signal.aborted) return;
        onSaved(question); dialog.current?.close(); trigger.current?.focus(); return;
      }
      const response = await fetch(revising ? `/api/recipes/${revising.id}` : "/api/recipes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), spec: validated, ...(revising ? { expectedVersion: revising.version } : {}) }), signal: current.signal,
      });
      if (response.status === 401) { setLogin(true); return; }
      const data = await response.json();
      if (response.status === 409 && data.code === "title_taken") {
        setTitleTaken(true);
        throw new Error(data.error);
      }
      if (response.status === 409) throw new Error("Întrebarea a fost modificată între timp. Salvează o copie pentru a păstra modificările tale sau redeschide întrebarea din „Salvate”.");
      if (!response.ok) throw new Error(data.error || "Nu am putut salva întrebarea. Încearcă din nou.");
      if (current.signal.aborted) return;
      onSaved({ id: data.id, title: data.title ?? title.trim(), version: data.version, spec: cloneQuestion(snapshot), ownerId:userId });
      dialog.current?.close();
      trigger.current?.focus();
    } catch (e) {
      if (e instanceof LocalQuestionError && e.code === "title_taken") setTitleTaken(true);
      if (!current.signal.aborted) setError(e instanceof Error ? e.message : "Nu am putut salva întrebarea. Încearcă din nou.");
    } finally {
      pending.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  }

  const next = `/intreaba?spec=${encodeURIComponent(encodeSpec(snapshot))}&mode=builder`;
  return <>
    <button ref={trigger} type="button" className="cq-save-question" disabled={disabled} aria-disabled={saved || undefined} aria-haspopup="dialog" onClick={() => { if (!saved) open(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {saved ? <path d="m5 12 4 4L19 6" /> : <path d="M6 4h12v16l-6-4-6 4V4Z" />}
      </svg>
      <span aria-live="polite">{saved ? "Întrebare salvată" : active ? "Salvează modificările" : "Salvează întrebarea"}</span>
    </button>
    <dialog ref={dialog} className="cq-save-dialog" aria-labelledby={headingId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <form onSubmit={event => void save(event)} aria-busy={busy}>
        <h2 id={headingId}>{copyMode ? "Salvează o copie" : snapshotActive ? "Salvează modificările" : "Salvează întrebarea"}</h2>
        <p id={descriptionId}>{local ? "Păstrezi întrebarea și filtrele pe acest dispozitiv, în acest browser. Se pierd dacă ștergi datele site-ului și pot fi văzute de oricine folosește același profil de browser." : "Păstrezi întrebarea și filtrele, privat în contul tău."} Rezultatele nu sunt salvate.</p>
        {login ? <div role="status" className="cq-save-login"><p>Autentifică-te pentru a salva. Întrebarea și filtrele te așteaptă la întoarcere.</p><a href={`/login?next=${encodeURIComponent(next)}`}>Autentifică-te și revino</a></div> : <label>Numele întrebării<input autoFocus required maxLength={160} value={title} disabled={busy} aria-invalid={titleTaken || undefined} onChange={event => { setTitle(event.target.value); setTitleTaken(false); setError(""); }} onFocus={event => event.currentTarget.select()} /></label>}
        {copyMode && !login && <p className="cq-copy-note">Nume propus pentru copie. Îl poți modifica înainte de salvare.</p>}
        {error && <p role="alert" className="cq-save-error">{error}</p>}
        <div className="cq-save-dialog-actions"><button type="button" disabled={busy} onClick={close}>{login ? "Închide" : "Renunță"}</button>{!login && snapshotActive && !copyMode && <button type="button" onClick={() => void prepareCopy()} disabled={busy || !title.trim()}>Salvează o copie</button>}{!login && <button type="submit" className="cq-save-confirm" disabled={busy || !title.trim()}>{preparing ? "Pregătesc copia…" : busy ? "Se salvează…" : copyMode ? "Salvează copia" : snapshotActive ? "Actualizează întrebarea" : "Salvează"}</button>}</div>
      </form>
    </dialog>
  </>;
}
