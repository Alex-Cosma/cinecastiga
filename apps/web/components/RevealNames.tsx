"use client";

import { useState } from "react";
import "./reveal-names.css";

interface Revealed { groups: { people: { name: string; roles: string[] }[]; firms: number | null }[]; registry: string | null }

const firmsWords = (n: number) => (n === 1 ? "o firmă" : n < 20 ? `${n} firme` : `${n} de firme`);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" });

/**
 * A person's name next to a signal, shown only when the reader asks (owner, 18 November 2026, legal audit): until the
 * click the page carries a blurred placeholder, never the name (the placeholder's letters are the same for everyone,
 * so they say nothing, not even the name's length). The click reads the name from the server and shows it with the
 * Trade Register's extraction date: the register is today's, not the one at the award.
 *
 *   <RevealNames src={`/api/semnale/reprezentanti?semnale=${id}`} />
 *
 * `count` only words the button's name for a screen reader („Arată numele celor 3 reprezentanți”).
 */
export default function RevealNames({ src, count = 1, what = "reprezentant" }: { src: string; count?: number; what?: "reprezentant" | "administrator" }) {
  const [data, setData] = useState<Revealed | null>(null), [state, setState] = useState<"idle" | "loading" | "error">("idle"), [error, setError] = useState("");
  const load = async () => {
    setState("loading");
    try {
      const response = await fetch(src, { cache: "no-store" }), result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Numele nu a putut fi citit acum. Reîncearcă.");
      setData(result as Revealed); setState("idle");
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "Numele nu a putut fi citit acum. Reîncearcă."); setState("error"); }
  };
  if (data) return <span className="reveal-names-shown">
    {data.groups.map((g, i) => <span key={i}>{i > 0 && " · "}
      {g.people.map((p, k) => <span key={p.name}>{k > 0 && ", "}<strong>{p.name}</strong>{p.roles.length > 0 && <span className="reveal-names-quiet"> ({p.roles.join("; ").toLowerCase()})</span>}</span>)}
      {g.firms ? ` (${firmsWords(g.firms)})` : ""}</span>)}
    <span className="reveal-names-quiet"> · Registrul Comerțului{data.registry ? `, extras la ${day(data.registry)}` : ""}</span>
  </span>;
  const label = count > 1 ? `Arată numele celor ${count} ${what === "administrator" ? "administratori" : "reprezentanți"}` : `Arată numele ${what === "administrator" ? "administratorului" : "reprezentantului"}`;
  return <>
    <button type="button" className="reveal-names" onClick={() => void load()} disabled={state === "loading"} aria-label={label} aria-busy={state === "loading"}>
      <span className="reveal-names-blur" aria-hidden="true">Nume Prenume</span>
      <span className="reveal-names-cta" aria-hidden="true">{state === "loading" ? "se încarcă…" : "arată"}</span>
    </button>
    {state === "error" && <span className="reveal-names-quiet" role="alert"> {error}</span>}
  </>;
}
