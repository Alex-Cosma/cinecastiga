import Link from "next/link";
import type { ReactNode } from "react";
import type { ClipRow } from "@/lib/anchete";
import { cleanName, formatExactDecimal } from "@/lib/format";
import { clipDate, clipHref, clipKindLabel, clipQueryHref, clipTitle, clipValue } from "@/lib/evidence-clip";
import { privateDay } from "@/lib/private-format";
import EntityName from "@/components/EntityName";
import { removeClip, saveClipNote, toggleClipPin } from "./actions";
import CaptureStatus from "./CaptureStatus";
import PeerEvidenceSummary from "./PeerEvidenceSummary";

export { clipKindLabel, clipTitle };

/** An update of a watch on a trend's group (its options carry the fixed members): the total is the group's. */
const groupWatch = (snapshot: Record<string, unknown>): boolean => {
  const monitoring = snapshot.monitoring as { options?: { members?: unknown } } | undefined;
  return Boolean(monitoring?.options?.members);
};

/** One saved item's card, in two parts around what the workspace adds (its questions, its registry facts). */
export interface EvidenceParts { id: string; head: ReactNode; body: ReactNode }

/**
 * The dossier's evidence cards (owner, 7 November 2026): the kind and the day it was saved, the item's name, who
 * bought from whom, its own exact value (never a rounded headline over an exact capture), then the kept version and
 * the actions. The workspace puts the questions the item supports or contradicts, and "Din registre", between them.
 */
export function dossierEvidenceParts({ id, clips, canEdit }: { id: string; clips: ClipRow[]; canEdit: boolean }): EvidenceParts[] {
  return clips.map(clip => {
    const s = clip.snapshot ?? {}, link = clipHref(clip), value = clipValue(clip), date = clipDate(clip);
    const kind = s.peer ? s.peerContext && typeof s.peerContext === "object" && "selectionKind" in s.peerContext && s.peerContext.selectionKind === "member" ? "Sursele unui membru" : "Comparație documentată"
      : s.connection ? "Legătură documentată" : clipKindLabel[clip.kind] ?? clip.kind;
    const parties = clip.parties ?? null;
    const suppliers = parties?.suppliers.length ? parties.suppliers : clip.kind === "contract" && Array.isArray(s.suppliers) ? s.suppliers as { id: string | null; name: string | null }[] : [];
    const authority = parties?.authority ?? (typeof s.authority === "string" ? s.authority : null);
    const headValue = value && (clip.kind === "contract" || clip.kind === "da" || clip.kind === "notice") ? value.exact : null;
    const head = <>
      <div className="iw-entry-meta"><span>{kind}{clip.pinned ? " · Fixată" : ""}</span><span>Salvată la <time dateTime={clip.createdAt}>{privateDay(clip.createdAt)}</time></span></div>
      <h3>{link ? <Link href={link}>{clipTitle(clip)}</Link> : clipTitle(clip)}</h3>
      {(clip.kind === "contract" || clip.kind === "da") && authority && <p className="iw-evidence-parties">
        <EntityName id={parties?.authorityId ?? null} role="authority">{cleanName(authority)}</EntityName><span className="iw-quiet"> → </span>
        {suppliers.length ? suppliers.map((sup, i) => <span key={i}>{i > 0 && ", "}<EntityName id={sup.id} role="supplier">{cleanName(sup.name) || "Furnizor necunoscut"}</EntityName></span>)
          : typeof s.supplier === "string" ? cleanName(s.supplier) : "Furnizor necunoscut"}
      </p>}
      {headValue && <p className="iw-evidence-value"><strong>{formatExactDecimal(headValue)} {value!.unit}</strong> <span>{value!.label}{date ? ` · ${privateDay(date)}` : ""}</span></p>}
      {clip.kind === "monitoring" && <div className="iw-evidence-summary"><p>Variația totalului {groupWatch(s) ? "grupei" : "selecției"}: <strong>{typeof s.totalDifferenceExact === "string" ? `${formatExactDecimal(s.totalDifferenceExact)} lei` : "necunoscută"}</strong>.</p><p className="iw-muted">Sumele unei singure versiuni nu sunt valoarea modificării și nu dovedesc o plată.</p></div>}
      {s.connectionContext != null && typeof s.connectionContext === "object" && "description" in s.connectionContext && typeof s.connectionContext.description === "string" && <p className="iw-muted">{s.connectionContext.description}</p>}
      <PeerEvidenceSummary context={s.peerContext} />
      {clip.kind === "document_quote" && <div className="iw-evidence-summary"><blockquote className="iw-prose">{String(s.quote ?? "")}</blockquote><p className="iw-muted">Pagina {String(s.page)} · {s.method === "ocr" ? "Text OCR — verifică în original" : "Text extras din PDF"}</p><p><a href={`/api/documents/${clip.refId}/file?kind=pdf#page=${s.page}`} target="_blank" rel="noopener noreferrer">Verifică pagina originală ↗</a>{" · "}<a href={`/api/documents/${clip.refId}/file`}>Descarcă originalul</a>{" · "}<a href={String(s.sourceUrl)} target="_blank" rel="noopener noreferrer">Anunțul SEAP ↗</a></p><details><summary>Versiunea păstrată</summary><p className="iw-hash">SHA-256: {String(s.originalHash)}</p></details></div>}
      {clip.note && <p className="iw-prose">{clip.note}</p>}
    </>;
    const body = <>
      {clip.methodologyChanged ? <p className="iw-muted">Metodologie modificată: riscul salvat folosea vechiul indice, deci nu îl comparăm cu cel de acum.</p> : null}
      {clip.kind !== "note" && clip.kind !== "document_quote" && <CaptureStatus investigationId={id} clipId={clip.id} capture={clip.capture ?? null} versions={clip.captures ?? []} canEdit={canEdit} headValue={headValue} />}
      {clip.kind === "query" && clipQueryHref(clip) && <Link className="iw-live-source" href={clipQueryHref(clip)!}>Compară cu înregistrările disponibile acum →</Link>}
      {canEdit && <div className="iw-entry-actions">
        <details><summary>{clip.note ? "Schimbă nota" : "Adaugă notă"}</summary><form className="iw-clip-note-form" action={saveClipNote}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><label>De ce contează<textarea name="note" rows={3} maxLength={4000} defaultValue={clip.note ?? ""} /></label><button type="submit">Salvează nota</button></form></details>
        <form action={toggleClipPin}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><input type="hidden" name="pinned" value={String(!clip.pinned)} /><button type="submit">{clip.pinned ? "Desprinde din începutul listei" : "Fixează la început"}</button></form>
        <details><summary>Scoate din dosar</summary><p>Se elimină dovada și legăturile ei cu întrebările din acest dosar.</p><form action={removeClip}><input type="hidden" name="id" value={id} /><input type="hidden" name="clipId" value={clip.id} /><button className="iw-danger" type="submit">Confirmă eliminarea dovezii</button></form></details>
      </div>}
    </>;
    return { id: clip.id, head, body };
  });
}
