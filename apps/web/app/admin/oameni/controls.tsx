"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { writeAddress } from "@/lib/address";

/*
 * The small client pieces of Oameni (owner, 7 November 2026): a form's submit button with its pending text, a password
 * field with a show/hide toggle, the floating outcome line and the list address the account commands return to.
 */

/** A form's submit button; while the action runs it says so and ignores further clicks (it keeps the focus). */
export function Submit({ children, pending: busy, className }: { children: ReactNode; pending: string; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} aria-disabled={pending || undefined}
    onClick={(e) => { if (pending) e.preventDefault(); }}>{pending ? busy : children}</button>;
}

/** A password input with a visible (or, in a table row, screen-reader) label and an „Arată” toggle (aria-pressed). */
export function PasswordField({ name, label, hint = "Minimum 10 caractere.", hideLabel, autoFocus }: {
  name: string; label: string; hint?: string; hideLabel?: boolean; autoFocus?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  // A form reset after a submission hides the next password again.
  useEffect(() => {
    const form = input.current?.form;
    const hide = () => setShown(false);
    form?.addEventListener("reset", hide);
    return () => form?.removeEventListener("reset", hide);
  }, []);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  return <div className="people-field">
    <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>{label}</label>
    <div className="people-password">
      <input ref={input} id={id} name={name} type={shown ? "text" : "password"} minLength={10} maxLength={128} required
        autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby={`${id}-hint`} />
      <button type="button" className="people-reveal" aria-pressed={shown} aria-label="Arată parola" onClick={() => setShown((s) => !s)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
        Arată
      </button>
    </div>
    <p id={`${id}-hint`} className="people-hint">{hint}</p>
  </div>;
}

/**
 * The outcome of a command, floating under the tabs like the rest of the administration's (.admin-flash); it goes
 * after six seconds. A command's redirect mounts the page anew, so on a client render the status region is drawn
 * empty first and the text follows a moment later, which screen readers announce; the server's HTML (a reload, no
 * JavaScript) carries the text at once. `rev` is new on every render, so the same outcome twice shows twice.
 */
const never = () => () => {};
export function Flash({ text, rev }: { text: string | null; rev: string | number }) {
  const client = useSyncExternalStore(never, () => true, () => false);
  const [shown, setShown] = useState(client ? null : text);
  useEffect(() => {
    if (!text) { setShown(null); return; }
    const show = setTimeout(() => setShown(text), client ? 100 : 0);
    const hide = setTimeout(() => setShown(null), 6000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [text, rev]); // eslint-disable-line react-hooks/exhaustive-deps -- `client` only picks the first delay
  return <div role="status" className="people-flash">{shown && <p className="admin-flash">{shown}</p>}</div>;
}

/** The outcome's parameters: the code (?ok= / ?err=) and the account a row command was about (?la=). */
const OUTCOME = ["ok", "err", "la"];

/** The address of the list the admin is on, without a previous outcome: what a command returns to. */
export function useListQuery(): string {
  const params = useSearchParams();
  const kept = new URLSearchParams(params.toString());
  for (const key of OUTCOME) kept.delete(key);
  return kept.toString();
}

/**
 * After a command (the page is mounted anew): the focus goes where the admin was (the row's first command, „Adaugă
 * cont”, the new account's email when it failed, or the list's heading when the row left the list), and the outcome
 * leaves the address, so a reload or the next filter does not show it again (the text stays until the next render).
 */
export function Outcome({ rev, focus }: { rev: string; focus: string | null }) {
  useEffect(() => {
    if (focus) document.querySelector<HTMLElement>(focus)?.focus();
    const url = new URL(window.location.href);
    if (!OUTCOME.some((key) => url.searchParams.has(key))) return;
    for (const key of OUTCOME) url.searchParams.delete(key);
    writeAddress(`${url.pathname}${url.search}${url.hash}`);
  }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps -- once per server render
  return null;
}
