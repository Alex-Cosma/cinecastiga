"use client";

import { DoneCheck, useFlag } from "../motion/Done";
import { useRef, useState } from "react";
import "./private.css";

/** The citation's text from the server (a dossier card asks it, which reads the capture's fingerprint once). */
export async function loadCitation(href: string): Promise<string> {
  const response = await fetch(href, { cache: "no-store" });
  const data = await response.json().catch(() => null) as { text?: string; error?: string } | null;
  if (!response.ok || !data?.text) throw new Error(data?.error ?? "Citarea nu a putut fi pregătită.");
  return data.text;
}

/**
 * Copies a citation, called from the click itself: Safari keeps the click's permission only for a write started in
 * the click, so a text still to be fetched is handed over as a pending item. When the browser refuses the clipboard
 * the text comes back to be shown in a field (`manual`); when it cannot be prepared, the reason (`error`).
 */
export async function copyCitation(load: () => Promise<string>, text?: string): Promise<{ done: true } | { manual: string } | { error: string }> {
  let value = text ?? "";
  try {
    if (!text && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const pending = load().then((loaded) => { value = loaded; return new Blob([loaded], { type: "text/plain" }); });
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending })]);
    } else {
      value = text ?? await load();
      await navigator.clipboard.writeText(value);
    }
    return { done: true };
  } catch (failure) {
    if (!value) { try { value = await load(); } catch { return { error: failure instanceof Error && failure.message ? failure.message : "Citarea nu a putut fi pregătită. Încearcă din nou." }; } }
    return { manual: value };
  }
}

/**
 * "Copiază citarea" (owner, 7 November 2026). The text is either known (the evidence sheet builds it on the server)
 * or fetched on the click. When the browser refuses the clipboard, the text opens in a field to select by hand: the
 * reader never loses it.
 */
export default function CopyCitation({ text, href, label = "Copiază citarea", className }: { text?: string; href?: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "manual" | "error">("idle");
  const [manual, setManual] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  // „Copiat” on the button for 1.6 s with its check (M-08); the live region keeps saying it is in the clipboard.
  const [copied, raiseCopied] = useFlag();
  async function copy() {
    setState("busy");
    const result = await copyCitation(() => loadCitation(href!), text);
    if ("done" in result) { setState("done"); raiseCopied(); }
    else if ("error" in result) { setManual(result.error); setState("error"); }
    else { setManual(result.manual); setState("manual"); requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); }); }
  }
  return <span className={className ? `cite ${className}` : "cite"}>
    <button type="button" className="cite-button" onClick={() => void copy()} disabled={state === "busy"}>
      {state === "busy" ? "Se pregătește…" : state === "done" && copied ? <><DoneCheck />Copiat</> : label}
    </button>
    <span className="d-sr-only" role="status">{state === "done" ? "Citarea este în clipboard." : ""}</span>
    {state === "error" && <span className="cite-error" role="alert">{manual || "Citarea nu a putut fi pregătită. Încearcă din nou."}</span>}
    {state === "manual" && <label className="cite-manual">Selectează și copiază citarea
      <textarea ref={field} readOnly rows={6} value={manual} onFocus={(event) => event.currentTarget.select()} />
    </label>}
  </span>;
}
