"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CaptureSummary } from "@/lib/evidence-captures-shared";
import { formatExactDecimal } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay } from "@/lib/private-format";
import CopyCitation from "@/components/private/CopyCitation";

const records = (n: number | null) => n === null ? "Înregistrări" : countWords(n, "înregistrare", "înregistrări");

/**
 * The kept version of a saved item: its state (a failed or pending capture never reads as kept), its records and
 * exact total — said once: a contract's or acquisition's own value above already gives the total when they agree —
 * the sheet, the citation and the other versions.
 */
export default function CaptureStatus({ investigationId, clipId, capture, versions, canEdit, headValue = null }: {
  investigationId: string; clipId: string; capture: CaptureSummary | null; versions: CaptureSummary[]; canEdit: boolean; headValue?: string | null;
}) {
  const [current, setCurrent] = useState(capture), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => setCurrent(capture), [capture]);
  useEffect(() => {
    if (!current || !["queued", "running"].includes(current.status)) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const response = await fetch(`/api/anchete/${investigationId}/captures/${current!.id}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) { setError("Nu putem verifica starea capturii. Reîncarcă dosarul."); return; }
        const result = await response.json(); if (result.capture) setCurrent(result.capture);
      } catch { if (!controller.signal.aborted) setError("Conexiunea s-a întrerupt. Reîncarcă dosarul pentru a verifica starea capturii."); }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 1500); return () => { controller.abort(); clearTimeout(timer); };
  }, [current?.id, current?.status, investigationId]);
  async function request(newVersion: boolean) {
    setBusy(true); setError("");
    try { const path = newVersion ? `/api/anchete/${investigationId}/clips/${clipId}/captures` : `/api/anchete/${investigationId}/captures/${current!.id}`;
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Captura nu a putut fi pornită.");
      if (result.capture) setCurrent(result.capture);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Încearcă din nou."); } finally { setBusy(false); }
  }
  const all = [...new Map([...versions, ...(current ? [current] : [])].map(item => [item.id, item])).values()].sort((a, b) => b.version - a.version);
  const sheet = (item: CaptureSummary) => `/anchete/${investigationId}/dovezi/${item.id}`;
  if (current?.scope.kind === "monitoring") return <div className="iw-capture"><div className="iw-capture-status"><strong>Ambele versiuni sunt păstrate</strong></div><p className="iw-muted">Înregistrările afectate și explicația modificării rămân exact cum au fost observate.</p><div className="iw-capture-actions">{[...all].sort((a, b) => a.version - b.version).map(item => <Link key={item.id} className="iw-frozen-source" href={sheet(item)}>{item.summary?.monitoringSide === "before" ? "Sursele înainte" : item.summary?.monitoringSide === "after" ? "Sursele după" : `Versiunea ${item.version}`} · {records(item.rowCount)} →</Link>)}</div></div>;
  const total = current?.totalExact === null ? "total necunoscut" : current && current.totalExact !== headValue ? `${formatExactDecimal(current.totalExact)} lei` : null;
  return <div className="iw-capture">
    {!current ? <p className="iw-caution">Salvare veche, fără captură verificată: selecția poate fi incompletă.</p> : <>
      <div className="iw-capture-status" role="status"><strong>{current.status === "complete" ? "Surse păstrate" : current.status === "failed" ? "Captură nefinalizată" : current.status === "running" ? "Se păstrează sursele…" : "Captură în așteptare"}</strong><span>Versiunea {current.version}{current.status === "complete" && current.completedAt ? ` · ${privateDay(current.completedAt)}` : ""}</span></div>
      {current.status === "complete" ? <p className="iw-capture-line"><span>{records(current.rowCount)}{total ? ` · ${total}` : ""}</span><Link className="iw-frozen-source" href={sheet(current)}>Fișa de probă →</Link></p>
        : current.status === "failed" ? <p className="iw-caution">{current.error ?? "Capturarea nu s-a încheiat. Nu este prezentată ca dovadă completă."}</p>
          : <p className="iw-muted">Poți continua lucrul. Versiunea apare după verificare.</p>}
    </>}
    {error && <p className="iw-error" role="alert">{error}</p>}
    <div className="iw-capture-actions">
      {current?.status === "complete" && <CopyCitation href={`/api/anchete/${investigationId}/captures/${current.id}/citare`} />}
      {canEdit && (!current || current.status === "complete") && <button type="button" disabled={busy} onClick={() => void request(true)}>{busy ? "Se pregătește…" : current ? "Păstrează o versiune nouă" : "Capturează sursele disponibile acum"}</button>}
      {canEdit && current && (current.status === "failed" || current.status === "queued" || current.status === "running" && current.startedAt !== null && Date.now() - new Date(current.startedAt).getTime() >= 5 * 60 * 1000) && <button type="button" disabled={busy} onClick={() => void request(false)}>{busy ? "Se pregătește…" : "Reia capturarea"}</button>}
      {all.length > 1 && <details><summary>Toate versiunile ({all.length})</summary><ul>{all.map(item => <li key={item.id}>{item.status === "complete" ? <Link href={sheet(item)}>Versiunea {item.version} · {privateDay(item.completedAt ?? item.createdAt)} · {records(item.rowCount)}</Link> : <span>Versiunea {item.version} · {item.status === "failed" ? "nefinalizată" : "în pregătire"}</span>}</li>)}</ul></details>}
    </div>
  </div>;
}
