"use client";

import { useRef, useState } from "react";
import "./private.css";

/**
 * "Copiază citarea" (owner, 7 November 2026). The text is either known (the evidence sheet builds it on the server)
 * or fetched on the click (a dossier card asks the server, which reads the capture's fingerprint once). When the
 * browser refuses the clipboard, the text opens in a field to select by hand: the reader never loses it.
 */
export default function CopyCitation({ text, href, label = "Copiază citarea", className }: { text?: string; href?: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "manual" | "error">("idle");
  const [manual, setManual] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  async function load(): Promise<string> {
    if (text) return text;
    const response = await fetch(href!, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { text?: string; error?: string } | null;
    if (!response.ok || !data?.text) throw new Error(data?.error ?? "Citarea nu a putut fi pregătită.");
    return data.text;
  }
  async function copy() {
    setState("busy");
    let value = "";
    try {
      // Safari keeps the click's permission only for a write started in the click: hand it the pending text.
      if (!text && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const pending = load().then((loaded) => { value = loaded; return new Blob([loaded], { type: "text/plain" }); });
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending })]);
      } else {
        value = await load();
        await navigator.clipboard.writeText(value);
      }
      setState("done");
    } catch (failure) {
      if (!value) { try { value = await load(); } catch { setState("error"); setManual(failure instanceof Error ? failure.message : ""); return; } }
      setManual(value); setState("manual");
      requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); });
    }
  }
  return <span className={className ? `cite ${className}` : "cite"}>
    <button type="button" className="cite-button" onClick={() => void copy()} disabled={state === "busy"}>
      {state === "busy" ? "Se pregătește…" : state === "done" ? "Citarea a fost copiată" : label}
    </button>
    <span className="d-sr-only" role="status">{state === "done" ? "Citarea este în clipboard." : ""}</span>
    {state === "error" && <span className="cite-error" role="alert">{manual || "Citarea nu a putut fi pregătită. Încearcă din nou."}</span>}
    {state === "manual" && <label className="cite-manual">Selectează și copiază citarea
      <textarea ref={field} readOnly rows={6} value={manual} onFocus={(event) => event.currentTarget.select()} />
    </label>}
  </span>;
}
