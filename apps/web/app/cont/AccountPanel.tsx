"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { G, Ghost } from "@/components/ghost/Ghost";
import { authClient } from "@/lib/auth-client";
import { privateMoment } from "@/lib/private-format";
import { describeDevice } from "./device";

interface SessionRow {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}
interface AuthError { status?: number | undefined; code?: string | undefined }
type PassField = "current" | "next";
interface Problem { text: string; field?: PassField; login?: boolean }

/** The minimum of `emailAndPassword.minPasswordLength` in lib/auth.ts. */
const MIN_PASSWORD = 10;
const TOO_MANY = "Prea multe încercări. Așteaptă un minut și reîncearcă.";

function passwordProblem(error: AuthError): Problem {
  if (error.status === 429) return { text: TOO_MANY };
  if (error.status === 401) return { text: "Sesiunea a expirat.", login: true };
  switch (error.code) {
    case "INVALID_PASSWORD": return { text: "Parola actuală nu e corectă.", field: "current" };
    case "PASSWORD_TOO_SHORT": return { text: `Parola nouă e prea scurtă: minim ${MIN_PASSWORD} caractere.`, field: "next" };
    case "PASSWORD_TOO_LONG": return { text: "Parola nouă e prea lungă.", field: "next" };
    default: return { text: "Nu am putut schimba parola. Reîncearcă." };
  }
}

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : 0);

export default function AccountPanel({ name, email, admin, codeByEmail }: {
  name: string | null;
  email: string;
  admin: boolean;
  codeByEmail: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sessionsProblem, setSessionsProblem] = useState<string | null>(null);
  const [sessionsDone, setSessionsDone] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const loadSessions = useCallback(async () => {
    const [list, mine] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    if (list.error) {
      setSessionsProblem(list.error.code === "SESSION_NOT_FRESH"
        ? "Lista sesiunilor cere o autentificare recentă: deconectează-te și intră din nou."
        : "Nu am putut încărca sesiunile. Reîncarcă pagina.");
      return;
    }
    setSessionsProblem(null);
    const id = mine.data?.session.id ?? null;
    setCurrentId(id);
    // This device first, then the most recently used.
    setSessions([...(list.data as SessionRow[])].sort((a, b) =>
      Number(b.id === id) - Number(a.id === id) || time(b.updatedAt ?? b.createdAt) - time(a.updatedAt ?? a.createdAt)));
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setDone(null);
    if (!current) return setProblem({ text: "Scrie parola actuală.", field: "current" });
    if (next.length < MIN_PASSWORD) return setProblem({ text: `Parola nouă e prea scurtă: minim ${MIN_PASSWORD} caractere.`, field: "next" });
    if (next === current) return setProblem({ text: "Parola nouă e la fel ca cea actuală.", field: "next" });
    setBusy(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (error) return setProblem(passwordProblem(error));
      setDone("Parolă schimbată. Celelalte dispozitive au fost deconectate.");
      setCurrent("");
      setNext("");
      setShow(false);
      void loadSessions();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: SessionRow, device: string) {
    setSessionsDone(null);
    setSessionsProblem(null);
    setRevoking(row.id);
    try {
      const { error } = await authClient.revokeSession({ token: row.token });
      if (error) {
        setSessionsProblem("Nu am putut deconecta sesiunea. Reîncearcă.");
        return;
      }
      setSessionsDone(`${device}: deconectat.`);
      await loadSessions();
    } finally {
      setRevoking(null);
    }
  }

  async function signOut() {
    setLeaving(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  const errId = `${ids}-err`, ruleId = `${ids}-rule`, noteId = `${ids}-note`, nextId = `${ids}-next`;
  const invalid = (field: PassField) => problem?.field === field;
  const describe = (field: PassField, ...own: string[]) => [...own, invalid(field) ? errId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <section className="cont-identity" aria-label="Datele contului">
        <dl className="cont-facts">
          {name && <div><dt>Nume</dt><dd>{name}</dd></div>}
          <div><dt>E-mail</dt><dd>{email}</dd></div>
          <div>
            <dt>Rol</dt>
            <dd>{admin ? <>Administrator · <Link href="/admin">Administrare</Link></> : "Utilizator"}</dd>
          </div>
          {codeByEmail && <div><dt>Autentificare</dt><dd>Cod pe e-mail la fiecare autentificare</dd></div>}
        </dl>
        <button type="button" className="cont-button" disabled={leaving} onClick={() => void signOut()}>
          {leaving ? "Se deconectează…" : "Deconectează-te"}
        </button>
      </section>

      <section className="cont-section" aria-labelledby={`${ids}-pass`}>
        <h2 id={`${ids}-pass`}>Schimbă parola</h2>
        <form className="cont-form" onSubmit={changePassword} noValidate>
          <label className="cont-field">
            Parola actuală
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
              required aria-invalid={invalid("current") || undefined} aria-describedby={describe("current")} />
          </label>
          <div className="cont-field">
            <label htmlFor={nextId}>Parola nouă</label>
            <div className="cont-pass">
              <input id={nextId} type={show ? "text" : "password"} autoComplete="new-password" value={next}
                onChange={(e) => setNext(e.target.value)} required aria-invalid={invalid("next") || undefined}
                aria-describedby={describe("next", ruleId)} />
              <button type="button" className="cont-show" aria-controls={nextId} aria-label={show ? "Ascunde parola nouă" : "Arată parola nouă"}
                onClick={() => setShow((v) => !v)}>
                {show ? "Ascunde" : "Arată"}
              </button>
            </div>
            <p className="cont-rule" id={ruleId}>Minim {MIN_PASSWORD} caractere</p>
          </div>
          <div id={errId} className="cont-alert" role="alert">
            {problem && <p>{problem.text}{problem.login && <> <Link href="/login?next=%2Fcont">Autentifică-te din nou</Link>.</>}</p>}
          </div>
          <p className="cont-note" id={noteId}>Celelalte dispozitive vor fi deconectate.</p>
          <div className="cont-actions">
            <button type="submit" className="cont-primary" disabled={busy} aria-describedby={noteId}>
              {busy ? "Se salvează…" : "Schimbă parola"}
            </button>
          </div>
          <p className="cont-done" role="status">{done}</p>
        </form>
      </section>

      <section className="cont-section" aria-labelledby={`${ids}-sessions`}>
        <h2 id={`${ids}-sessions`}>Sesiuni active</h2>
        <div className="cont-sessions-wrap">
          {sessions === null && !sessionsProblem ? (
            <Ghost as="ul" className="cont-sessions" name="sessions" label="Se încarcă sesiunile…" wait="client">
              <G.Rows n={1} className="cont-session" cells={() => (
                <div>
                  <p className="cont-device"><G.Line w="10em" /></p>
                  <p className="cont-meta"><G.Line w="17em" /></p>
                </div>
              )} />
            </Ghost>
          ) : sessions && (
            <ul className="cont-sessions">
              {sessions.map((s) => {
                const device = describeDevice(s.userAgent), mine = s.id === currentId, at = privateMoment(s.createdAt, "dată necunoscută");
                return (
                  <li key={s.id} className="cont-session">
                    <div>
                      <p className="cont-device">{device}{mine && <span className="cont-this">acest dispozitiv</span>}</p>
                      <p className="cont-meta">Autentificare: {at}{s.ipAddress ? ` · IP ${s.ipAddress}` : ""}</p>
                    </div>
                    {!mine && currentId !== null && (
                      <button type="button" className="cont-button" disabled={revoking !== null} aria-label={`Deconectează ${device}, ${at}`}
                        onClick={() => void revoke(s, device)}>
                        {revoking === s.id ? "Se deconectează…" : "Deconectează"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="cont-alert" role="alert">{sessionsProblem && <p>{sessionsProblem}</p>}</div>
          <p className="cont-done" role="status">{sessionsDone}</p>
        </div>
      </section>
    </>
  );
}
