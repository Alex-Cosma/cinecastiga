"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { revokeSessions, setUserPassword, toggleBan } from "../actions";
import { PasswordField, Submit, useListQuery } from "./controls";

type Mode = "ban" | "revoke" | "password";

/**
 * A row's account commands (owner, 7 November 2026, „Confirmare la ambele”): „Dezactivează” and „Deconectează” each
 * ask in the row first, like a message's deletion; „Parolă nouă” opens its form there; „Reactivează” runs at once.
 * Each trigger is a native <details> holding the same form, so without JavaScript it opens in place and still asks;
 * with JavaScript the row's buttons give way to the question or the form. A command's redirect mounts the page anew
 * and the page's Outcome gives the focus back to the row; a render without a new mount (a new `rev`) closes it too.
 */
export default function AccountActions({ userId, email, banned, rev }: { userId: string; email: string; banned: boolean; rev: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const lista = useListQuery();
  const row = useRef<HTMLDivElement>(null), back = useRef<Mode | null>(null);
  const question = useId();

  useEffect(() => { setMode(null); }, [rev]);
  // Closed by „Păstrează”, „Renunță” or Escape: the focus goes back to the trigger that opened it.
  useEffect(() => {
    if (mode !== null || !back.current) return;
    row.current?.querySelector<HTMLElement>(`[data-mode="${back.current}"]`)?.focus();
    back.current = null;
  }, [mode]);

  const open = (next: Mode) => (e: MouseEvent) => { e.preventDefault(); setMode(next); };
  const close = (from: Mode) => { back.current = from; setMode(null); };
  const escape = (from: Mode) => (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(from); } };
  const ids = <><input type="hidden" name="userId" value={userId} /><input type="hidden" name="lista" value={lista} /></>;

  const banForm = <form action={toggleBan}>
    {ids}<input type="hidden" name="banned" value="false" />
    <Submit className="button people-danger" pending="Se dezactivează…">Dezactivează</Submit>
  </form>;
  const revokeForm = <form action={revokeSessions}>
    {ids}<Submit className="button primary" pending="Se deconectează…">Deconectează</Submit>
  </form>;
  const passwordForm = (inRow: boolean) => <form className="people-password-form" action={setUserPassword}>
    {ids}
    <PasswordField name="newPassword" label={`Parolă nouă pentru ${email}`} hint="Minimum 10 caractere. Sesiunile lui se închid." autoFocus={inRow} />
    <div className="people-panel-buttons">
      {inRow && <button type="button" className="button" onClick={() => close("password")}>Renunță</button>}
      <Submit className="button primary" pending="Se salvează…">Setează parola</Submit>
    </div>
  </form>;

  if (mode === "ban" || mode === "revoke") {
    return <div ref={row} className="people-panel" role="group" aria-labelledby={question} onKeyDown={escape(mode)}>
      <p id={question}>{mode === "ban"
        ? <>Dezactivezi contul <b>{email}</b>? Sesiunile lui se închid.</>
        : <>Deconectezi <b>{email}</b> de pe toate dispozitivele?</>}</p>
      <div className="people-panel-buttons">
        <button type="button" className="button" autoFocus onClick={() => close(mode)}>Păstrează</button>
        {mode === "ban" ? banForm : revokeForm}
      </div>
    </div>;
  }
  if (mode === "password") {
    return <div ref={row} className="people-panel" onKeyDown={escape("password")}>{passwordForm(true)}</div>;
  }
  return <div ref={row} className="people-actions">
    {banned
      ? <form action={toggleBan}>
        {ids}<input type="hidden" name="banned" value="true" />
        <Submit className="button" pending="Se reactivează…">Reactivează</Submit>
      </form>
      : <details className="people-ask">
        <summary className="button" data-mode="ban" onClick={open("ban")}>Dezactivează</summary>
        <div className="people-panel"><p>Dezactivezi contul <b>{email}</b>? Sesiunile lui se închid.</p>{banForm}</div>
      </details>}
    <details className="people-ask">
      <summary className="button" data-mode="revoke" onClick={open("revoke")}>Deconectează</summary>
      <div className="people-panel"><p>Deconectezi <b>{email}</b> de pe toate dispozitivele?</p>{revokeForm}</div>
    </details>
    <details className="people-ask">
      <summary className="button" data-mode="password" onClick={open("password")}>Parolă nouă</summary>
      <div className="people-panel">{passwordForm(false)}</div>
    </details>
  </div>;
}
