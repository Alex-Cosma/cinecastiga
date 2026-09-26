"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Existing sessions may predate email verification. Keep their invitation in
 * place and ask for the same emailed code already familiar from signing in. */
export default function ConfirmEmail({ email }: { email: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function send() {
    setBusy(true); setError(""); setInfo("");
    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) { setError("Codul nu a putut fi trimis. Încearcă din nou în câteva secunde."); return; }
      setSent(true); setCode("");
      setInfo(`Am trimis un cod de 6 cifre la ${email}. Codul expiră în 3 minute.`);
    } catch {
      setError("Verifică conexiunea și încearcă din nou.");
    } finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authClient.twoFactor.verifyOtp({ code: code.trim() });
      if (result.error) { setError(result.error.status === 429
        ? "Prea multe încercări. Așteaptă un minut și cere un cod nou."
        : "Cod greșit sau expirat. Verifică cele 6 cifre sau cere un cod nou."); return; }
      const session = await authClient.getSession();
      if (!session.data?.user.emailVerified) { setError("Adresa contului s-a schimbat sau codul nu mai este valabil. Cere un cod nou."); return; }
      router.refresh();
    } catch {
      setError("Verifică conexiunea și încearcă din nou.");
    } finally { setBusy(false); }
  }

  return <div className="auth-form" style={{ maxWidth:"26rem",overflowWrap:"anywhere" }}>
    <p>Pentru a primi acces la dosar, confirmă că adresa <strong>{email}</strong> îți aparține.</p>
    {info && <p className="auth-info" role="status">{info}</p>}
    {error && <p className="auth-err" role="alert">{error}</p>}
    {sent ? <form className="auth-form" onSubmit={verify}>
      <label>Codul din e-mail
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          required autoFocus value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
      </label>
      <button className="iw-primary" type="submit" disabled={busy}>{busy ? "Se verifică…" : "Confirmă și continuă"}</button>
      <button type="button" className="auth-link" disabled={busy} onClick={() => void send()}>Trimite un cod nou</button>
    </form> : <button className="iw-primary" type="button" disabled={busy} onClick={() => void send()}>{busy ? "Se trimite codul…" : "Trimite codul de confirmare"}</button>}
  </div>;
}
