"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"creds" | "otp">("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function afterLogin() {
    const s = await authClient.getSession();
    const role = (s.data?.user as { role?: string } | undefined)?.role;
    router.push(role === "admin" ? "/admin" : "/cont");
    router.refresh();
  }

  async function sendCode(): Promise<boolean> {
    const sent = await authClient.twoFactor.sendOtp();
    if (sent.error) {
      setErr("Nu am putut trimite codul. Reîncearcă în câteva secunde.");
      return false;
    }
    setInfo(`Am trimis un cod de 6 cifre la ${email}.`);
    return true;
  }

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data, error } = await authClient.signIn.email({ email, password });
      if (error) {
        setErr(
          error.status === 429
            ? "Prea multe încercări. Așteaptă un minut și reîncearcă."
            : error.status === 403
              ? "Cont dezactivat. Contactează administratorul."
              : "Email sau parolă greșite.",
        );
        return;
      }
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        if (await sendCode()) setStep("otp");
      } else {
        await afterLogin();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.verifyOtp({ code: code.trim() });
      if (error) {
        setErr(
          error.status === 429
            ? "Prea multe încercări. Așteaptă un minut și reîncearcă."
            : "Cod greșit sau expirat.",
        );
        return;
      }
      await afterLogin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card">
      <p className="eyebrow">{step === "creds" ? "pasul 1 din 2" : "pasul 2 din 2"}</p>
      <h1 className="page-title">{step === "creds" ? "Autentificare" : "Codul din e-mail"}</h1>
      {step === "creds" ? (
        <form className="auth-form" onSubmit={submitCreds}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Parolă
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {err && <p className="auth-err">{err}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Se verifică…" : "Continuă"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submitOtp}>
          {info && <p className="auth-info">{info}</p>}
          <label>
            Cod de verificare
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </label>
          {err && <p className="auth-err">{err}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Se verifică…" : "Autentifică-te"}
          </button>
          <button
            type="button"
            className="auth-link"
            disabled={busy}
            onClick={() => void sendCode()}
          >
            Retrimite codul
          </button>
        </form>
      )}
      <p className="hint auth-hint">
        Conturile sunt create de administrator. Autentificarea cere întotdeauna un cod
        primit pe email.
      </p>
    </div>
  );
}
