"use client";
import { useEffect, useRef, useState } from "react";
import type { RecipeSummary, RecipeVersion } from "@/lib/recipes";
import { validateSpec } from "@/lib/ask/spec";
import { cloneQuestion, describeQuestion, type QuestionSpec } from "@/lib/ask/question-ui";
import FollowButton from "@/components/FollowButton";
import type { AskSpec } from "@/lib/ask/spec";
import { encodeSpec } from "@/lib/ask/permalink";
import "./query-recipes.css";

export default function RecipeShelf({ spec, onOpen, disabled }: { spec:QuestionSpec; onOpen:(spec:QuestionSpec)=>void; disabled:boolean }) {
  const [open, setOpen] = useState(false), [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [active, setActive] = useState<RecipeVersion | null>(null);
  const [title, setTitle] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [login, setLogin] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function request(path:string, body?:unknown) {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { ...(body === undefined ? {} : { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(body) }), signal:current.signal, cache:"no-store" });
      const data = await response.json().catch(() => ({ error:"Rețetele nu sunt disponibile. Încearcă din nou." }));
      if (current.signal.aborted) return null;
      setLogin(response.status === 401);
      if (response.status === 401) { setRecipes([]); setActive(null); setTitle(""); setNote(""); }
      if (!response.ok) throw new Error(data.error || "Rețetele nu sunt disponibile. Încearcă din nou.");
      return data;
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : "Cererea nu a reușit."); return null; }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  async function load() { const data = await request("/api/recipes"); if (data) setRecipes(data.recipes); }
  async function openVersion(id:string, version?:number) {
    const data = await request(`/api/recipes/${id}${version ? `?version=${version}` : ""}`);
    if (!data) return;
    const recipe = data.recipe as RecipeVersion, validated = validateSpec(recipe.spec);
    if ("error" in validated) { setError(`Această versiune nu se poate rula: ${validated.error}`); return; }
    setActive(recipe); setTitle(recipe.title); setNote("");
    onOpen(cloneQuestion(validated as QuestionSpec)); setMessage(`Versiunea ${recipe.version} este în constructor. Aplică întrebarea pentru datele disponibile acum.`);
  }
  async function save(asNew:boolean) {
    const validated = validateSpec(spec);
    if ("error" in validated) { setError(validated.error); return; }
    if (!title.trim()) { setError("Dă un nume rețetei înainte de salvare."); return; }
    const current = active;
    const data = await request(!asNew && current ? `/api/recipes/${current.id}` : "/api/recipes", { title, note, spec:validated, ...(!asNew && current ? { expectedVersion:current.currentVersion } : {}) });
    if (!data) return;
    setMessage(`Salvat privat · versiunea ${data.version}.`);
    // Fetch metadata without replacing an in-flight edited draft with the saved version.
    const saved = await request(`/api/recipes/${data.id}`);
    if (saved) { setActive(saved.recipe); setTitle(saved.recipe.title); setNote(""); setMessage(`Salvat privat · versiunea ${data.version}.`); setRecipes(previous => [{ id:data.id, title:saved.recipe.title, currentVersion:saved.recipe.currentVersion, updatedAt:saved.recipe.updatedAt }, ...previous.filter(r => r.id !== data.id)]); }
  }
  const valid = !("error" in validateSpec(spec));
  const next = `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&mode=builder`;
  return <section className="qr-shelf" aria-label="Rețete private"><div className="qr-bar"><p>Repetă verificarea, păstrează întrebarea.</p><button type="button" aria-expanded={open} disabled={disabled} onClick={() => { setOpen(!open); if (!open) { setTitle(active?.title ?? describeQuestion(spec).slice(0,160)); void load(); } }}>{open ? "Închide rețetele" : "Rețetele mele"}</button></div>{open && <div className="qr-content" aria-busy={busy}><div className="qr-library"><h3>Întrebări reutilizabile</h3><p>Private, vizibile doar în contul tău. Fiecare versiune păstrează condițiile; rezultatele se recalculează când rulezi întrebarea.</p>{!login && <><button type="button" disabled={busy || disabled} onClick={() => { setActive(null); setTitle(describeQuestion(spec).slice(0,160)); setNote(""); setMessage("Întrebarea curentă va fi salvată separat."); }}>Rețetă nouă din întrebare</button><div className="qr-list">{recipes.map(recipe => <button type="button" disabled={busy || disabled} key={recipe.id} aria-pressed={active?.id === recipe.id} onClick={() => void openVersion(recipe.id)}><strong>{recipe.title}</strong><small>Versiunea {recipe.currentVersion} · {new Date(recipe.updatedAt).toLocaleDateString("ro-RO")}</small></button>)}{!busy && !recipes.length && <p>Salvează prima întrebare pentru a o regăsi aici.</p>}</div></>}</div><div className="qr-save"><h3>{active ? `Versiunea ${active.version} din „${active.title}”` : "Salvează întrebarea din constructor"}</h3>{active && <label>Deschide o versiune anterioară<select disabled={busy || disabled} value={active.version} onChange={e => void openVersion(active.id, Number(e.target.value))}>{active.revisions.map(revision => <option key={revision.version} value={revision.version}>v{revision.version} · {new Date(revision.createdAt).toLocaleDateString("ro-RO")}{revision.note ? ` · ${revision.note}` : ""}</option>)}</select></label>}<label>Numele rețetei<input value={title} maxLength={160} disabled={busy || disabled} onChange={e => setTitle(e.target.value)} /></label><label>Nota versiunii <span>(opțional)</span><textarea rows={2} maxLength={1000} value={note} disabled={busy || disabled} onChange={e => setNote(e.target.value)} placeholder="Ce urmărești sau ce ai schimbat?" /></label><div className="qr-save-actions"><button type="button" className="qb-primary" disabled={busy || disabled || login || !valid || !title.trim()} onClick={() => void save(false)}>{busy ? "Se încarcă…" : active ? "Salvează o versiune nouă" : "Salvează privat"}</button>{active && <button type="button" disabled={busy || disabled || login || !valid || !title.trim()} onClick={() => void save(true)}>Salvează separat</button>}</div>{!valid && <p>Completează condițiile întrebării înainte de salvare.</p>}{active && <FollowButton spec={active.spec as AskSpec} recipeId={active.id} recipeVersion={active.version} title={active.title} label={`Urmărește versiunea ${active.version}`} />}<p className="qp-note">Rețeta nu este o captură a dovezilor. Pentru a păstra și înregistrările de acum, folosește salvarea din lista de surse.</p></div>{error && <div className="qr-status" role="alert"><p>{error}</p>{login ? <a href={`/login?next=${encodeURIComponent(next)}`}>Autentifică-te și revino la întrebare</a> : <button type="button" disabled={busy} onClick={() => void load()}>Reîncarcă rețetele</button>}</div>}{message && <p className="qr-status" role="status">{message}</p>}</div>}</section>;
}
