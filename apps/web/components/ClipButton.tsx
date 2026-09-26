"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Adaugă la anchetă" — mounted on entity/contract/notice pages and on ask
 * results. Guests get a sign-in link that preserves the selected source scope.
 * Popover: pick a recent anchetă or create one inline, plus
 * an optional one-line "why" — the context that keeps the clip meaningful.
 */
interface Inv {
  id: string;
  title: string;
}

export default function ClipButton({
  kind,
  refId,
  spec,
  snapshot,
  label,
}: {
  kind: "entity" | "contract" | "notice" | "person" | "query" | "flag" | "signal" | "da" | "radiografie";
  refId?: string | null;
  spec?: unknown;
  snapshot?: Record<string, unknown> | null;
  label?: string;
}) {
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Inv[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [capture, setCapture] = useState<{ id: string; status: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!done || !capture || !["queued", "running"].includes(capture.status)) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/anchete/${done}/captures/${capture.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Starea capturii nu poate fi verificată acum. Deschide ancheta pentru a reîncerca.");
        const data = await response.json();
        const current = data.capture ?? data;
        if (typeof current.status === "string") setCapture({ id: capture.id, status: current.status });
      } catch (error) {
        if (!controller.signal.aborted) setErr(error instanceof Error ? error.message : "Starea capturii nu este disponibilă.");
      }
    }, 1800);
    return () => { controller.abort(); clearInterval(timer); };
  }, [done, capture?.id, capture?.status]);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/get-session")
      .then((r) => r.json())
      .then((s) => {
        if (alive && s?.user) setAuthed(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        boxRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sourceReturn =
    typeof snapshot?.["sourceUrl"] === "string" &&
    snapshot["sourceUrl"].startsWith("/intreaba?")
      ? snapshot["sourceUrl"]
      : null;
  if (!authed)
    return (
      <div className="clipbtn" ref={boxRef}>
        <button
          type="button"
          className="clipbtn-t"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Salvează în anchetă →
        </button>
        {open && (
          <div className="clipbtn-pop">
            <strong>Păstrează ce ai descoperit.</strong>
            <p className="hint">
              Anchetele sunt dosare private, cu întrebări, surse și notele tale.
            </p>
            <a
              href={`/login?next=${encodeURIComponent(sourceReturn ?? (typeof window === "undefined" ? "/intreaba" : window.location.pathname + window.location.search))}`}
            >
              Autentifică-te pentru a salva →
            </a>
          </div>
        )}
      </div>
    );

  const openPanel = async () => {
    setOpen(true);
    setDone(null);
    setCapture(null);
    setErr(null);
    if (list === null) {
      const r = await fetch("/api/anchete")
        .then((x) => x.json())
        .catch(() => null);
      const invs: Inv[] = (r?.investigations ?? []).filter((i: Inv & { access?: { canEdit?: boolean } }) => i.access?.canEdit !== false);
      setList(invs);
      if (invs.length > 0) setSel(invs[0]!.id);
    }
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      let invId = sel;
      if (!invId) {
        const title = newTitle.trim() || label?.slice(0, 120) || "Anchetă nouă";
        const created = await fetch("/api/anchete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }).then((r) => r.json());
        if (!created?.id) {
          setErr("Nu am putut crea ancheta.");
          return;
        }
        invId = created.id;
        setList((l) => [{ id: invId, title }, ...(l ?? [])]);
        setSel(invId);
      }
      const res = await fetch(`/api/anchete/${invId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          refId: refId ?? null,
          spec: spec ?? null,
          note: note.trim() || null,
          snapshot: snapshot ?? null,
        }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(out?.error ?? "Eroare la salvare.");
        return;
      }
      setDone(invId);
      if (out.capture?.id) setCapture(out.capture);
      setNote("");
    } catch {
      setErr(
        "Nu am putut salva proba. Conținutul este păstrat; încearcă din nou.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clipbtn" ref={boxRef}>
      <button
        type="button"
        className="clipbtn-t"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : void openPanel())}
      >
        Salvează în anchetă →
      </button>
      {open && (
        <div className="clipbtn-pop">
          {done ? (
            <div className="clipbtn-done" role="status">
              <strong>{capture?.status === "failed" ? "Captura nu s-a încheiat." : capture && ["queued", "running"].includes(capture.status) ? "Păstrăm înregistrările și sursele…" : "Versiune păstrată în anchetă."}</strong>
              {capture && ["queued", "running"].includes(capture.status) && <p className="hint">Poți continua explorarea. Captura va apărea în dosar când este completă.</p>}
              {capture?.status === "failed" && <p className="hint">Nu am marcat o selecție incompletă drept probă. Deschide dosarul pentru detalii și reîncercare.</p>}
              {err && <p className="auth-err">{err}</p>}
              <a href={`/anchete/${done}`} target="_blank" rel="noopener">
                Deschide ancheta ↗
              </a>
            </div>
          ) : (
            <>
              {list === null ? (
                <div className="hint">se încarcă…</div>
              ) : (
                <>
                  <label className="clipbtn-l">
                    Ancheta
                    <select
                      value={sel}
                      onChange={(e) => setSel(e.target.value)}
                    >
                      {list.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.title}
                        </option>
                      ))}
                      <option value="">+ anchetă nouă</option>
                    </select>
                  </label>
                  <p className="hint">Păstrăm selecția și valorile verificate pe server. Actualizările ulterioare ale datelor nu modifică această versiune.</p>
                  {!sel && (
                    <label className="clipbtn-l">
                      Titlul anchetei noi
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={
                          label?.slice(0, 60) ?? "ex.: Lemne de foc Topalu"
                        }
                      />
                    </label>
                  )}
                  <label className="clipbtn-l">
                    De ce e relevant?{" "}
                    <span className="hint">
                      (o propoziție — te salvează peste o lună)
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                  </label>
                  {err && <div className="auth-err">{err}</div>}
                  <button
                    type="button"
                    className="clipbtn-save"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {busy
                      ? "Pregătim captura…"
                      : sel
                        ? "Păstrează această versiune"
                        : "Creează ancheta și păstrează versiunea"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
