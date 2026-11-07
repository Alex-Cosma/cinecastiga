"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { CODE_VALID_MINUTES, CONTACT_EMAIL, RESEND_COOLDOWN_SECONDS, codeDigits, contactHref, safeReturnPath } from "./login-context";

type Field = "email" | "password" | "code";
/** What went wrong, the fields it concerns and whether the contact address helps. */
interface Problem { text: string; fields?: Field[]; contact?: boolean }
interface AuthError { status?: number | undefined; code?: string | undefined }

const TOO_MANY = "Prea multe încercări. Așteaptă un minut și reîncearcă.";
const clock = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function credsProblem(error: AuthError): Problem {
  if (error.status === 429) return { text: TOO_MANY };
  if (error.status === 403) return { text: "Cont dezactivat. Scrie la", contact: true };
  return { text: "Email sau parolă greșite.", fields: ["email", "password"] };
}

function codeProblem(error: AuthError): Problem {
  if (error.status === 429) return { text: TOO_MANY };
  switch (error.code) {
    case "OTP_HAS_EXPIRED": return { text: "Codul a expirat. Cere unul nou.", fields: ["code"] };
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE": return { text: "Prea multe încercări cu acest cod. Cere unul nou.", fields: ["code"] };
    case "ACCOUNT_TEMPORARILY_LOCKED": return { text: "Prea multe coduri greșite. Încearcă din nou mai târziu sau scrie la", contact: true };
    default: return { text: "Cod greșit.", fields: ["code"] };
  }
}

export default function LoginForm({ twoFactorRequired, context }: { twoFactorRequired: boolean; context: string | null }) {
  const router = useRouter();
  const ids = useId();
  const errId = `${ids}-err`, sentId = `${ids}-sent`;
  const [step, setStep] = useState<"creds" | "otp">("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  /** When a new code was asked for from the code step (the first one is announced by the step itself). */
  const [resentAt, setResentAt] = useState<Date | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const invalid = (field: Field) => Boolean(problem?.fields?.includes(field));
  const fieldProps = (field: Field, describedBy?: string) => ({
    "aria-invalid": invalid(field) || undefined,
    "aria-describedby": [describedBy, invalid(field) ? errId : null].filter(Boolean).join(" ") || undefined,
  });

  async function afterLogin() {
    const s = await authClient.getSession();
    const role = (s.data?.user as { role?: string } | undefined)?.role;
    const returnPath = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
    router.push(returnPath ?? (role === "admin" ? "/admin" : "/cont"));
    router.refresh();
  }

  async function sendCode(): Promise<boolean> {
    const sent = await authClient.twoFactor.sendOtp();
    if (sent.error) {
      if (sent.error.code === "INVALID_TWO_FACTOR_COOKIE") {
        // The password step is too old to send codes for: start again from it.
        backToCreds();
        setProblem({ text: "A trecut prea mult timp. Intră din nou cu e-mailul și parola." });
      } else setProblem({ text: sent.error.status === 429 ? TOO_MANY : "Nu am putut trimite codul. Reîncearcă în câteva secunde." });
      return false;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function submitCreds(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (!email.trim()) return setProblem({ text: "Scrie adresa de e-mail.", fields: ["email"] });
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) return setProblem({ text: "Adresa de e-mail nu pare completă.", fields: ["email"] });
    if (!password) return setProblem({ text: "Scrie parola.", fields: ["password"] });
    setBusy(true);
    try {
      const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error) return setProblem(credsProblem(error));
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        if (await sendCode()) {
          setResentAt(null);
          setStep("otp");
        }
      } else {
        await afterLogin();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (code.length !== 6) return setProblem({ text: "Codul are 6 cifre.", fields: ["code"] });
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.verifyOtp({ code });
      if (error) return setProblem(codeProblem(error));
      await afterLogin();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setProblem(null);
    setBusy(true);
    try {
      if (await sendCode()) {
        setResentAt(new Date());
        setCode("");
        // The resend button is disabled now: the reader continues in the code field.
        codeRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  function backToCreds() {
    setStep("creds");
    setCode("");
    setPassword("");
    setProblem(null);
    setResentAt(null);
    setCooldown(0);
  }

  const alert = (
    <div id={errId} className="login-alert" role="alert">
      {problem && (
        <p>
          {problem.text}
          {problem.contact && <> <a href={contactHref()}>{CONTACT_EMAIL}</a>.</>}
        </p>
      )}
    </div>
  );

  return (
    <div className="auth-card card login-card">
      <h1 className="page-title">{step === "creds" ? "Autentificare" : "Codul din e-mail"}</h1>
      {(twoFactorRequired || step === "otp") && <p className="login-step">{step === "creds" ? "Pasul 1 din 2" : "Pasul 2 din 2"}</p>}
      {step === "creds" ? (
        <>
          {context && <p className="login-context">{context}</p>}
          <form className="login-form" onSubmit={submitCreds} noValidate>
            <label className="login-field">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoFocus {...fieldProps("email")} />
            </label>
            <label className="login-field">
              Parolă
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                required {...fieldProps("password")} />
            </label>
            {alert}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? "Se verifică…" : twoFactorRequired ? "Continuă" : "Autentifică-te"}
            </button>
          </form>
          <p className="login-help">
            Ai uitat parola sau vrei acces? Scrie la <a href={contactHref()}>{CONTACT_EMAIL}</a>
          </p>
        </>
      ) : (
        <form className="login-form" onSubmit={submitOtp} noValidate>
          <p className="login-sent" id={sentId}>
            Am trimis un cod la <b>{email.trim()}</b>. E valabil {CODE_VALID_MINUTES}{"\u00a0"}minute.
          </p>
          <label className="login-field">
            Cod de verificare
            <input ref={codeRef} className="login-code" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(codeDigits(e.target.value))} required autoFocus {...fieldProps("code", sentId)} />
          </label>
          {alert}
          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? "Se verifică…" : "Autentifică-te"}
          </button>
          <p className="login-status" role="status">
            {resentAt ? `Cod nou trimis la ${clock.format(resentAt)}.` : null}
          </p>
          <div className="login-links">
            <button type="button" className="login-link" disabled={busy || cooldown > 0} onClick={() => void resend()}>
              {cooldown > 0 ? `Retrimite codul în ${cooldown} s` : "Retrimite codul"}
            </button>
            <button type="button" className="login-link" disabled={busy} onClick={backToCreds}>
              Altă adresă
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
