"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useViewer } from "@/lib/use-viewer";
import { cleanName, formatExactDecimal } from "@/lib/format";
import { clipKindLabel } from "@/lib/evidence-clip";
import "./clip-button.css";

/**
 * "Salvează în anchetă": entity, contract, acquisition and notice pages, signals, Radiografie and Întreabă answers.
 * Available only to signed-in readers. One dialog everywhere (owner, 7 November 2026): it says first what it saves
 * (kind · name · value when known), lists the dossiers by their full titles, says when the chosen dossier already
 * holds the item (and offers a new version of it there instead of a silent duplicate), and keeps the focus inside
 * until it closes. On a phone (≤700px) it is a sheet at the bottom of the screen; on a wide screen it opens under its
 * button, or above it, always inside the window. Rendered at the end of the page, so no scrolling list clips it.
 */
interface Inv { id: string; title: string; access?: { canEdit?: boolean } }
interface Subject { name: string | null; valueExact: string | null; detail: string | null }
type Kind = "entity" | "contract" | "notice" | "person" | "query" | "flag" | "signal" | "da" | "radiografie";

export default function ClipButton(props: React.ComponentProps<typeof AuthenticatedClipButton>) {
  const viewer = useViewer();
  return viewer.userId ? <AuthenticatedClipButton key={viewer.userId} {...props} /> : null;
}

const PHONE = "(max-width: 700px)";
const WIDTH = 360, GAP = 8, MARGIN = 16;
const focusables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
  .filter((el) => el.getClientRects().length > 0 && !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked && root.querySelector(`input[type=radio][name="${el.name}"]:checked`)));
const bookmark = <svg className="clipbtn-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.6-4 2.6Z" /></svg>;

function AuthenticatedClipButton({ kind, refId, spec, snapshot, label, primary = false, compact = false }: {
  kind: Kind;
  refId?: string | null;
  spec?: unknown;
  snapshot?: Record<string, unknown> | null;
  label?: string;
  /** The page's main saving action: filled, with its bookmark icon (entity header, 4 November 2026). */
  primary?: boolean;
  /** One row's saving action in a table: the bookmark alone, its name on hover (owner, 6 November 2026). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [list, setList] = useState<Inv[] | null>(null);
  const [savedIn, setSavedIn] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState<Subject | null>(null);
  const [sel, setSel] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ investigationId: string; clipId: string | null; again: boolean } | null>(null);
  const [capture, setCapture] = useState<{ id: string; status: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; above: boolean; maxHeight: number | null } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null), dialog = useRef<HTMLDivElement | null>(null);
  const titleId = useId(), dialogId = useId();

  const close = useCallback((focusTrigger = true) => { setOpen(false); setPlace(null); if (focusTrigger) trigger.current?.focus(); }, []);

  // A capture runs after the answer: its state is polled until it ends, and a failure is said as one.
  useEffect(() => {
    if (!done || !capture || !["queued", "running"].includes(capture.status)) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/anchete/${done.investigationId}/captures/${capture.id}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Starea capturii nu poate fi verificată acum. Deschide dosarul pentru a reîncerca.");
        const data = await response.json();
        const current = data.capture ?? data;
        if (typeof current.status === "string") setCapture({ id: capture.id, status: current.status });
      } catch (error) {
        if (!controller.signal.aborted) setErr(error instanceof Error ? error.message : "Starea capturii nu este disponibilă.");
      }
    }, 1800);
    return () => { controller.abort(); clearInterval(timer); };
  }, [done, capture?.id, capture?.status]);

  // Where the dialog goes: a sheet on a phone; under (or above) its button on a wide screen, inside the window.
  const measure = useCallback(() => {
    const isPhone = window.matchMedia(PHONE).matches;
    setPhone(isPhone);
    if (isPhone || !trigger.current) { setPlace(null); return; }
    const rect = trigger.current.getBoundingClientRect(), height = 320;
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
    // The side with room for all of it; else all of it over the page, as near its button as the window allows (its
    // own action never hidden in an inner scroll); only a dialog taller than the window scrolls inside.
    const ceiling = Math.max(MARGIN, headerBottom + GAP);
    const roomBelow = window.innerHeight - MARGIN - (rect.bottom + GAP), roomAbove = rect.top - GAP - ceiling;
    const natural = dialog.current?.scrollHeight ?? height;
    const available = window.innerHeight - MARGIN - ceiling;
    let top: number, above = false, maxHeight: number | null = null;
    if (natural <= roomBelow) top = rect.bottom + GAP;
    else if (natural <= roomAbove) { above = true; top = rect.top - GAP - natural; }
    else if (natural <= available) top = Math.max(ceiling, Math.min(rect.bottom + GAP, window.innerHeight - MARGIN - natural));
    else { maxHeight = Math.floor(available); top = ceiling; }
    setPlace((old) => old && old.top === top && old.left === left && old.width === width && old.above === above && old.maxHeight === maxHeight ? old : { top, left, width, above, maxHeight });
  }, []);
  useLayoutEffect(() => { if (open) measure(); }, [open, measure, list, done, sel, err, subject]);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true, capture: true });
    const observer = typeof ResizeObserver !== "undefined" && dialog.current ? new ResizeObserver(update) : null;
    if (observer && dialog.current) observer.observe(dialog.current);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dialog.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    document.addEventListener("mousedown", outside);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, { capture: true }); observer?.disconnect(); document.removeEventListener("mousedown", outside); };
  }, [open, measure, close]);

  // Focus moves into the dialog once it is placed (a hidden element cannot take it), then to its first field once
  // the dossiers arrive. Escape closes it from anywhere and gives the focus back to its button.
  const ready = open && (phone || place !== null);
  useEffect(() => { if (ready && !dialog.current?.contains(document.activeElement)) dialog.current?.focus({ preventScroll: true }); }, [ready]);
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, close]);
  useEffect(() => {
    if (!ready || !list || done) return;
    if (document.activeElement === dialog.current) dialog.current?.querySelector<HTMLElement>("input:checked,input,textarea")?.focus({ preventScroll: true });
  }, [ready, list, done]);

  const openPanel = async () => {
    setPhone(window.matchMedia(PHONE).matches);
    setOpen(true); setDone(null); setCapture(null); setErr(null);
    if (list !== null) return;
    const params = new URLSearchParams({ kind, ...(refId ? { ref: refId } : {}), ...(kind === "radiografie" && spec ? { spec: JSON.stringify(spec) } : {}) });
    const r = await fetch(`/api/anchete?${params}`, { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null);
    if (!r) { setErr("Dosarele nu au putut fi încărcate. Încearcă din nou."); setList([]); return; }
    const invs: Inv[] = (r.investigations ?? []).filter((i: Inv) => i.access?.canEdit !== false);
    setList(invs); setSavedIn(r.savedIn ?? {}); setSubject(r.subject ?? null);
    setSel(invs[0]?.id ?? "");
  };

  const snap = snapshot ?? {};
  const name = cleanName(label ?? (typeof snap.title === "string" ? snap.title : null) ?? subject?.name ?? null) || null;
  const detail = subject?.valueExact ? `${formatExactDecimal(subject.valueExact)} lei` : typeof snap.headline === "string" ? snap.headline : kind === "entity" && subject?.detail ? subject.detail : null;
  const kindName = clipKindLabel[kind] ?? "Dovadă";
  const dossierHref = (d: { investigationId: string; clipId: string | null }) => `/anchete/${d.investigationId}?sectiune=evidence${d.clipId ? `#clip-${d.clipId}` : ""}`;
  const pending = capture && ["queued", "running"].includes(capture.status);
  const existing = sel ? savedIn[sel] ?? null : null;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      let invId = sel;
      if (existing) {
        // Already there: a new version of the same item, never a second copy.
        const response = await fetch(`/api/anchete/${invId}/clips/${existing}/captures`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const out = await response.json().catch(() => null);
        if (!response.ok) { setErr(out?.error ?? "Versiunea nouă nu a putut fi pornită."); return; }
        setDone({ investigationId: invId, clipId: existing, again: true });
        if (out?.capture?.id) setCapture(out.capture);
        return;
      }
      if (!invId) {
        const title = newTitle.trim() || name?.slice(0, 120) || "Dosar nou";
        const created = await fetch("/api/anchete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).then((r) => r.json()).catch(() => null);
        if (!created?.id) { setErr("Nu am putut crea dosarul."); return; }
        invId = created.id;
        setList((l) => [{ id: invId, title }, ...(l ?? [])]);
        setSel(invId);
      }
      const res = await fetch(`/api/anchete/${invId}/clips`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, refId: refId ?? null, spec: spec ?? null, note: note.trim() || null, snapshot: snapshot ?? null }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setErr(out?.error ?? "Eroare la salvare."); return; }
      setDone({ investigationId: invId, clipId: out?.id ?? null, again: false });
      if (out?.id && refId) setSavedIn((saved) => ({ ...saved, [invId]: String(out.id) }));
      if (out?.capture?.id) setCapture(out.capture);
      setNote("");
    } catch {
      setErr("Nu am putut salva dovada. Textul notei rămâne aici; încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== "Tab" || !dialog.current) return;
    // The focus stays in the dialog while it is open (Tab and Shift+Tab go round).
    const items = focusables(dialog.current);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0]!, last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last)) { event.preventDefault(); first.focus(); }
  };

  const panel = open ? <>
    {phone && <div className="save-backdrop" aria-hidden="true" onMouseDown={() => close()} />}
    <div ref={dialog} id={dialogId} role="dialog" aria-modal={phone ? "true" : undefined} aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
      className={`save-dialog${phone ? " save-sheet" : ""}${place?.above ? " save-above" : ""}`}
      style={phone ? undefined : place ? { top: place.top, left: place.left, width: place.width, ...(place.maxHeight ? { maxHeight: place.maxHeight } : {}) } : { visibility: "hidden" }}>
      <div className="save-head">
        <h2 id={titleId}>{done ? done.again ? "Versiune nouă cerută" : "Salvată în anchetă" : "Salvează în anchetă"}</h2>
        <button type="button" className="save-close" aria-label="Închide" onClick={() => close()}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
      </div>
      <p className="save-subject"><span className="save-kind">{kindName}{detail && <> · <span className="save-detail">{detail}</span></>}</span>{name && <strong title={name}>{name}</strong>}</p>
      {done ? <div className="save-done" role="status">
        <p><strong>{capture?.status === "failed" ? "Captura nu s-a încheiat." : pending ? "Păstrăm înregistrările și sursele…" : "Versiune păstrată."}</strong></p>
        {pending && <p className="save-hint">Poți continua. Versiunea apare în dosar când e completă.</p>}
        {capture?.status === "failed" && <p className="save-hint">Nu am marcat o selecție incompletă drept probă. Deschide dosarul pentru detalii și reîncercare.</p>}
        {err && <p className="save-error" role="alert">{err}</p>}
        <div className="save-actions"><a className="save-primary" href={dossierHref(done)}>Deschide dosarul</a><button type="button" className="save-secondary" onClick={() => close()}>Închide</button></div>
      </div> : list === null ? <p className="save-hint" role="status">Se încarcă dosarele…</p> : <>
        <fieldset className="save-dossiers">
          <legend>În ce dosar?</legend>
          <div className="save-options">
            {list.map((inv) => <label key={inv.id} className="save-option"><input type="radio" name={`${dialogId}-dosar`} value={inv.id} checked={sel === inv.id} onChange={() => setSel(inv.id)} />
              <span>{inv.title}{savedIn[inv.id] && <span className="save-here"> · conține deja</span>}</span></label>)}
            <label className="save-option"><input type="radio" name={`${dialogId}-dosar`} value="" checked={sel === ""} onChange={() => setSel("")} /><span>Dosar nou</span></label>
          </div>
        </fieldset>
        {!sel && <label className="save-field">Titlul dosarului nou<input type="text" value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} placeholder={name?.slice(0, 60) ?? "ex.: Lemne de foc Topalu"} /></label>}
        {existing ? <p className="save-existing">Deja în acest dosar · <a href={dossierHref({ investigationId: sel, clipId: existing })}>deschide</a></p>
          : <label className="save-field"><span>De ce contează? <span className="save-optional">Opțional</span></span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} /></label>}
        <p className="save-hint">Păstrăm o versiune verificată pe server; actualizările datelor nu o schimbă.</p>
        {err && <p className="save-error" role="alert">{err}</p>}
        <div className="save-actions">
          <button type="button" className="save-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Se pregătește…" : existing ? "Păstrează o versiune nouă" : sel ? "Păstrează în dosar" : "Creează dosarul și păstrează"}
          </button>
          <button type="button" className="save-secondary" onClick={() => close()}>Renunță</button>
        </div>
      </>}
    </div>
  </> : null;

  return (
    <div className="clipbtn">
      <button ref={trigger} type="button" className={primary ? "clipbtn-t pri" : compact ? "clipbtn-t ico" : "clipbtn-t"}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
        aria-label={compact ? "Salvează în anchetă" : undefined} title={compact ? "Salvează în anchetă" : undefined}
        onClick={() => (open ? close() : void openPanel())}>
        {bookmark}{!compact && "Salvează în anchetă"}
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
