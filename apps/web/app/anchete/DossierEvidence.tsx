import Link from "next/link";
import type { ClipRow } from "@/lib/anchete";
import type { CaptureSummary } from "@/lib/evidence-captures-shared";
import { encodeSpec } from "@/lib/ask/permalink";
import { cleanName, formatRon, formatExactDecimal } from "@/lib/format";
import { FLAG_META } from "@/lib/flags";
import { removeClip, saveClipNote, toggleClipPin } from "./actions";
import CaptureStatus from "./CaptureStatus";
import PeerEvidenceSummary from "./PeerEvidenceSummary";

export const clipKindLabel: Record<string, string> = { document_quote: "Pasaj din document", entity: "Entitate", contract: "Contract", notice: "Anunț", person: "Persoană", query: "Întrebare salvată", flag: "Semnal", note: "Notă", da: "Achiziție directă", signal: "Semnal", radiografie: "Radiografie", monitoring: "Modificare urmărită" };
export function clipTitle(c: ClipRow): string {
  const s = c.snapshot ?? {};
  if (c.kind === "monitoring" && typeof s.watchTitle === "string") return `Actualizare · ${s.watchTitle}`;
  if (typeof s.title === "string" && s.title.trim()) return s.title;
  if (typeof s.name === "string") return cleanName(s.name);
  if (Array.isArray(s.pills)) return s.pills.join(" · ");
  if (s.code && FLAG_META[String(s.code)]) return `${FLAG_META[String(s.code)]!.title}${s.entityName ? ` · ${cleanName(String(s.entityName))}` : ""}`;
  if (s.noticeNo) return `Anunț ${s.noticeNo}`;
  if (c.kind === "note") return c.note?.split("\n")[0]?.slice(0, 100) || "Notă salvată";
  return `${clipKindLabel[c.kind] ?? "Dovadă"}${c.refId ? ` · ${c.refId}` : ""}`;
}
function queryHref(c: ClipRow): string | null {
  if (!c.spec) return null;
  const s = c.snapshot ?? {};
  // A bare question permalink has no stable identity/checkpoint receipt.
  if (s.connection || s.peer) return null;
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(c.spec))}&drill=1${s.evidenceScope ? `&evidence=${encodeURIComponent(JSON.stringify(s.evidenceScope))}` : ""}${s.evidenceOptions ? `&sourceFilters=${encodeURIComponent(JSON.stringify(s.evidenceOptions))}` : ""}`;
}
function href(c: ClipRow): string | null {
  switch (String(c.kind)) {
    case "document_quote": return c.snapshot?.contractId && c.refId ? `/contracte/${c.snapshot.contractId}?document=${c.refId}&page=${c.snapshot.page}` : null;
    case "entity": return c.refId ? `/entitati/${c.refId}` : null;
    case "contract": return c.refId ? `/contracte/${c.refId}` : null;
    case "notice": return c.refId ? `/anunturi/${c.refId}` : null;
    case "query": return queryHref(c);
    case "person": return c.refId ? `/intreaba?spec=${encodeURIComponent(encodeSpec({ block: "table", measure: "value", dim: "supplier", filters: { adminPersonKey: c.refId } }))}` : null;
    case "flag": return c.refId ? `/entitati/${c.refId}` : null;
    case "signal": return c.refId ? `/semnale/${c.refId}` : null;
    default: return null;
  }
}
export default function DossierEvidence({ id, clips, canEdit }: { id: string; clips: ClipRow[]; canEdit: boolean }) {
  if (!clips.length) return <div className="iw-empty"><h3>Păstrează prima dovadă</h3><p>Folosește „Salvează în anchetă” de lângă o întrebare, un contract sau o entitate. Vei regăsi aici selecția, sursele și momentul salvării.</p><Link href="/intreaba">Deschide o întrebare →</Link></div>;
  return <div className="iw-evidence-list">{clips.map(clip => {
    const s = clip.snapshot ?? {}, link = href(clip);
    const captureClip = clip as ClipRow & { capture?: CaptureSummary | null; captures?: CaptureSummary[] };
    return <article id={`clip-${clip.id}`} className="iw-evidence" tabIndex={-1} key={clip.id}>
      <div className="iw-entry-meta"><span>{s.peer ? s.peerContext&&typeof s.peerContext==="object"&&"selectionKind"in s.peerContext&&s.peerContext.selectionKind==="member"?"Sursele unui membru":"Comparație documentată" : s.connection ? "Legătură documentată" : clipKindLabel[clip.kind] ?? clip.kind}{clip.pinned ? " · Fixată" : ""}</span><time dateTime={clip.createdAt}>{new Date(clip.createdAt).toLocaleDateString("ro-RO")}</time></div>
      <h3>{link ? <Link href={link}>{clipTitle(clip)}</Link> : clipTitle(clip)}</h3>
      {clip.kind === "monitoring" && <div className="iw-evidence-summary"><p>Variația totalului selecției: <strong>{typeof s.totalDifferenceExact === "string" ? `${formatExactDecimal(s.totalDifferenceExact)} lei` : "necunoscută"}</strong>.</p><p className="iw-muted">Sursele de mai jos conțin înregistrările afectate de actualizare. Suma unei singure versiuni nu este valoarea modificării și nu dovedește o plată.</p></div>}
      {clip.kind !== "note" && clip.kind !== "monitoring" && !s.peer && <div className="iw-evidence-summary">{typeof s.headline === "string" ? s.headline : s.valueRon != null ? formatRon(String(s.valueRon)) : s.totalRon != null ? formatRon(String(s.totalRon)) : ""}</div>}
      {s.connectionContext != null && typeof s.connectionContext === "object" && "description" in s.connectionContext && typeof s.connectionContext.description === "string" && <p className="iw-muted">{s.connectionContext.description}</p>}
      <PeerEvidenceSummary context={s.peerContext}/>
      {clip.kind === "document_quote" && <div className="iw-evidence-summary"><blockquote className="iw-prose">{String(s.quote ?? "")}</blockquote><p className="iw-muted">Pagina {String(s.page)} · {s.method === "ocr" ? "Text OCR — verifică în original" : "Text extras din PDF"}</p><p><a href={`/api/documents/${clip.refId}/file?kind=pdf#page=${s.page}`} target="_blank" rel="noopener noreferrer">Verifică pagina originală ↗</a>{" · "}<a href={`/api/documents/${clip.refId}/file`}>Descarcă originalul</a>{" · "}<a href={String(s.sourceUrl)} target="_blank" rel="noopener noreferrer">Anunțul SEAP ↗</a></p><details><summary>Versiunea păstrată</summary><p style={{overflowWrap:"anywhere"}}>SHA-256: {String(s.originalHash)}</p></details></div>}
      {clip.note && <p className="iw-prose">{clip.note}</p>}
      {clip.drift?.length ? <p className="iw-caution">Datele curente diferă de salvare: {clip.drift.join(", ")}. Verifică versiunea păstrată înainte de a cita.</p> : null}
      {clip.kind !== "note" && clip.kind !== "document_quote" && <CaptureStatus investigationId={id} clipId={clip.id} capture={captureClip.capture ?? null} versions={captureClip.captures ?? []} canEdit={canEdit} />}
      {clip.kind === "query" && queryHref(clip) && <Link className="iw-live-source" href={queryHref(clip)!}>Compară cu înregistrările disponibile acum →</Link>}
      {canEdit && <div className="iw-entry-actions">
        <details><summary>Motiv / notă</summary><form className="iw-clip-note-form" action={saveClipNote}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><label>Observație<textarea name="note" rows={3} maxLength={4000} defaultValue={clip.note ?? ""} /></label><button type="submit">Salvează nota</button></form></details>
        <form action={toggleClipPin}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><input type="hidden" name="pinned" value={String(!clip.pinned)} /><button type="submit">{clip.pinned ? "Desprinde din începutul listei" : "Fixează la început"}</button></form>
        <details><summary>Scoate din dosar</summary><p>Se elimină dovada și legăturile ei cu întrebările din acest dosar.</p><form action={removeClip}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><button className="iw-danger" type="submit">Confirmă eliminarea dovezii</button></form></details>
      </div>}
    </article>;
  })}</div>;
}
