import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { getCapturedRows } from "@/lib/evidence-captures";
import { formatExactDecimal, formatInt } from "@/lib/format";
import PeerEvidenceSummary from "../../../PeerEvidenceSummary";
import "../../../workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Surse păstrate în dosar", robots: { index: false, follow: false } };
export default async function SavedSourcesPage({ params, searchParams }: { params: Promise<{ id: string; captureId: string }>; searchParams: Promise<{ after?: string }> }) {
  const { id, captureId } = await params, query = await searchParams; const user = await sessionUserId();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/anchete/${id}/dovezi/${captureId}`)}`);
  const candidate = Number(query.after ?? 0), cursor = Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  const result = await getCapturedRows(user, id, captureId, cursor); if (!result) notFound();
  const { capture, rows, nextCursor } = result;
  const warnings = Array.isArray(capture.summary?.warnings) ? capture.summary.warnings.filter((warning): warning is string => typeof warning === "string") : [];
  const connection = capture.summary?.connectionContext && typeof capture.summary.connectionContext === "object" ? capture.summary.connectionContext as Record<string, unknown> : null;
  const peer = capture.summary?.peerContext && typeof capture.summary.peerContext === "object" ? capture.summary.peerContext as Record<string, unknown> : null;
  return <div className="iw-shell"><Link className="iw-back" href={`/anchete/${id}?sectiune=evidence`}>← Înapoi la dovezile dosarului</Link>
    <header className="iw-header"><div><h1>{capture.summary?.monitoringSide === "before" ? "Sursele înainte de modificare" : capture.summary?.monitoringSide === "after" ? "Sursele după modificare" : "Sursele păstrate"}</h1><p className="iw-description">Versiunea {capture.version} · {new Date(capture.completedAt ?? capture.createdAt).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })} · ora Bucureștiului</p></div><a className="iw-export" href={`/api/anchete/${id}/export?format=zip`}>Descarcă dosarul cu toate versiunile</a></header>
    {capture.status !== "complete" ? <p className="iw-caution">Captura nu este finalizată. Revino în dosar pentru a verifica starea; nu există o listă parțială prezentată drept completă.</p> : <>
      {connection && <div className="iw-evidence-summary">{typeof connection.title === "string" && <h2>{connection.title}</h2>}{typeof connection.description === "string" && <p>{connection.description}</p>}</div>}
      {peer && <div className="iw-evidence-summary">{typeof peer.title === "string" && <h2>{peer.title}</h2>}<PeerEvidenceSummary context={peer}/></div>}
      {typeof capture.summary?.capturedAt === "string" && capture.scope.kind === "monitoring" && <p className="iw-muted">Observația originală: {new Date(capture.summary.capturedAt).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}. Copierea în dosar nu a recalculat datele.</p>}<p className="iw-source-total"><strong>{formatInt(capture.rowCount)} înregistrări</strong> · {capture.totalExact === null ? "total necunoscut" : `${formatExactDecimal(capture.totalExact)} lei`}</p>
      {warnings.length > 0 && <div className="iw-caution"><strong>Limitele acestei capturi</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      <p className="iw-muted">Aceste rânduri au fost păstrate la capturare. Linkurile SEAP și TED deschid sursele externe, care se pot modifica ulterior. Valorile contract–furnizor sunt cote alocate, nu dovada plății.</p>
      <div className="iw-source-table" role="region" aria-label="Înregistrările păstrate" tabIndex={0}><table className="rank"><thead><tr><th>Sursa</th><th>Autoritate / furnizor</th><th>Data</th><th>CPV</th><th className="num">Valoare păstrată · lei</th></tr></thead><tbody>{rows.map(row => <tr key={row.cursor}>
        <td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.daCode ?? `${row.src === "da" ? "DA" : "Contract"} ${row.refId ?? ""}`} ↗</a> : row.daCode ?? row.refId ?? "Sursă fără identificator"}{row.tedUrl && <div><a href={row.tedUrl} target="_blank" rel="noreferrer">Publicația TED ↗</a></div>}</td>
        <td>{row.authority ?? "Autoritate necunoscută"}<div className="iw-muted">{row.supplier ?? "Furnizor necunoscut"}</div></td><td className="iw-source-date">{row.date ?? "Necunoscută"}</td><td>{row.cpvCode ?? "Necunoscut"}<div className="iw-muted">{row.cpvName}</div></td><td className="num">{row.valueExact === null ? "Valoare lipsă" : formatExactDecimal(row.valueExact)}</td>
      </tr>)}</tbody></table></div>
      {!rows.length && <p className="iw-muted">Nu există înregistrări pe această pagină.</p>}
      <nav className="iw-source-pager" aria-label="Paginarea surselor păstrate">{cursor > 0 && <Link href={`/anchete/${id}/dovezi/${captureId}`}>Înapoi la prima pagină</Link>}{nextCursor !== null && nextCursor !== undefined && Number(nextCursor) < (capture.rowCount ?? 0) && <Link href={`/anchete/${id}/dovezi/${captureId}?after=${nextCursor}`}>Următoarele înregistrări →</Link>}</nav>
    </>}
    <details className="iw-journal"><summary>Selecția și metodologia păstrate</summary><p className="iw-muted">Parametrii exacți folosiți la această captură.</p><pre>{JSON.stringify({ selection: capture.scope, methodology: capture.methodology, summary: capture.summary }, null, 2)}</pre></details>
  </div>;
}
