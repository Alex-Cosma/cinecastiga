"use client";

import { useEffect, useRef, useState } from "react";
import { createWatchdog } from "../actions";
import { PasswordField, Submit, useListQuery } from "./controls";

/**
 * „Adaugă cont” (owner, 7 November 2026): a disclosure that looks like a secondary button and opens the new-account
 * form under it. A native <details>, so it opens without JavaScript too. The command's redirect mounts the page anew:
 * the form is then closed after a creation and open, with the error inside, after a failure (the page's Outcome moves
 * the focus). Should a render come without a new mount, `rev` closes it after a creation all the same.
 */
export default function CreateAccount({ error, created, rev }: { error: string | null; created: boolean; rev: string }) {
  const [open, setOpen] = useState(!!error);
  const summary = useRef<HTMLElement>(null);
  const lista = useListQuery();
  useEffect(() => { if (created) setOpen(false); }, [rev, created]);
  return <details className="people-create" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary ref={summary} className="button">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
      Adaugă cont
    </summary>
    <form className="people-create-form" action={createWatchdog}>
      <input type="hidden" name="lista" value={lista} />
      {error && <p key={rev} className="people-alert" role="alert">{error}</p>}
      <div className="people-fields">
        <div className="people-field">
          <label htmlFor="cont-nou-email">Email</label>
          <input id="cont-nou-email" type="email" name="email" required autoComplete="off" spellCheck={false} autoCapitalize="none" />
        </div>
        <div className="people-field">
          <label htmlFor="cont-nou-nume">Nume <span>opțional</span></label>
          <input id="cont-nou-nume" type="text" name="name" autoComplete="off" />
        </div>
        <PasswordField name="password" label="Parolă inițială" />
      </div>
      <div className="people-form-end">
        <p className="people-hint">Cont de watchdog. Trimite-i parola pe alt canal; la intrare primește și un cod pe email.</p>
        <button type="button" className="text-button" onClick={(e) => { e.currentTarget.form?.reset(); setOpen(false); summary.current?.focus(); }}>Renunță</button>
        <Submit className="button primary" pending="Se creează…">Creează contul</Submit>
      </div>
    </form>
  </details>;
}
