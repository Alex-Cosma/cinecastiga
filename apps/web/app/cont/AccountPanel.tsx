"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

interface SessionRow {
  token: string;
  createdAt: Date | string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export default function AccountPanel() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  async function loadSessions() {
    const res = await authClient.listSessions();
    if (!res.error) setSessions(res.data as SessionRow[]);
  }
  useEffect(() => {
    void loadSessions();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (error) {
        setErr(
          error.status === 400
            ? "Parola actuală e greșită sau cea nouă e prea scurtă (minim 10 caractere)."
            : "Nu am putut schimba parola. Reîncearcă.",
        );
        return;
      }
      setMsg("Parolă schimbată. Celelalte sesiuni au fost deconectate.");
      setCurrent("");
      setNext("");
      void loadSessions();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <section className="section">
        <h2>Schimbă parola</h2>
        <form className="auth-form auth-form-row" onSubmit={changePassword}>
          <label>
            Parola actuală
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label>
            Parola nouă
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Se salvează…" : "Schimbă parola"}
          </button>
        </form>
        {msg && <p className="auth-info">{msg}</p>}
        {err && <p className="auth-err">{err}</p>}
      </section>

      <section className="section">
        <h2>Sesiuni active</h2>
        {sessions === null ? (
          <p className="hint">Se încarcă…</p>
        ) : (
          <ul className="prose">
            {sessions.map((s) => (
              <li key={s.token}>
                {new Date(s.createdAt).toLocaleString("ro-RO")} ·{" "}
                {s.ipAddress || "IP necunoscut"} ·{" "}
                {(s.userAgent || "dispozitiv necunoscut").slice(0, 80)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <button type="button" className="auth-signout" onClick={() => void signOut()}>
          Deconectează-te
        </button>
      </section>
    </>
  );
}
