import type { ClipRow } from "@/lib/anchete";
import { cleanName, formatExactDecimal } from "@/lib/format";
import { clipDate, clipHref, clipKindGroup, clipKindLabel, clipQueryHref, clipTitle, clipValue } from "@/lib/evidence-clip";
import { privateDay } from "@/lib/private-format";
import EntityName from "@/components/EntityName";
import PeerEvidenceSummary from "./PeerEvidenceSummary";
import type { EvidenceItem } from "./EvidenceCard";

export { clipKindLabel, clipTitle };

/** An update of a watch on a trend's group (its options carry the fixed members): the total is the group's. */
const groupWatch = (snapshot: Record<string, unknown>): boolean => {
  const monitoring = snapshot.monitoring as { options?: { members?: unknown } } | undefined;
  return Boolean(monitoring?.options?.members);
};

/**
 * The dossier's evidence cards (owner, 7 November 2026; compact since the UX audit, Z8-05): the kind, the state of
 * the kept version and the day it was saved; the item's name; one line with who bought from whom and its own exact
 * value (never a rounded headline over an exact capture) or, for a selection, its records and their exact total; the
 * note. The card itself (EvidenceCard) adds the questions it is linked to, "Fișa de probă →" and the "⋯" menu.
 */
export function dossierEvidenceParts({ clips }: { clips: ClipRow[] }): EvidenceItem[] {
  return clips.map(clip => {
    const s = clip.snapshot ?? {}, value = clipValue(clip), date = clipDate(clip);
    const kindLabel = s.peer ? s.peerContext && typeof s.peerContext === "object" && "selectionKind" in s.peerContext && s.peerContext.selectionKind === "member" ? "Sursele unui membru" : "Comparație documentată"
      : s.connection ? "Legătură documentată" : clipKindLabel[clip.kind] ?? clip.kind;
    const parties = clip.parties ?? null;
    const suppliers = parties?.suppliers.length ? parties.suppliers : clip.kind === "contract" && Array.isArray(s.suppliers) ? s.suppliers as { id: string | null; name: string | null }[] : [];
    const authority = parties?.authority ?? (typeof s.authority === "string" ? s.authority : null);
    const ownValue = value && (clip.kind === "contract" || clip.kind === "da" || clip.kind === "notice") ? value : null;
    const partiesLine = (clip.kind === "contract" || clip.kind === "da") && authority ? <span className="iw-evidence-parties">
      <EntityName id={parties?.authorityId ?? null} role="authority">{cleanName(authority)}</EntityName><span className="iw-quiet" aria-hidden="true"> → </span><span className="d-sr-only"> a contractat cu </span>
      {suppliers.length ? suppliers.map((sup, i) => <span key={i}>{i > 0 && ", "}<EntityName id={sup.id} role="supplier">{cleanName(sup.name) || "Furnizor necunoscut"}</EntityName></span>)
        : typeof s.supplier === "string" ? cleanName(s.supplier) : "Furnizor necunoscut"}
    </span> : null;
    const valueLine = ownValue ? <span className="iw-evidence-value"><strong>{formatExactDecimal(ownValue.exact)} {ownValue.unit}</strong> <span>{ownValue.label}{date ? ` · ${privateDay(date)}` : ""}</span></span> : null;
    const line = partiesLine || valueLine ? <>{partiesLine}{partiesLine && valueLine && <span className="iw-quiet" aria-hidden="true"> · </span>}{valueLine}</> : null;
    const extra = <>
      {clip.kind === "monitoring" && <div className="iw-evidence-summary"><p>Variația totalului {groupWatch(s) ? "grupei" : "selecției"}: <strong>{typeof s.totalDifferenceExact === "string" ? `${formatExactDecimal(s.totalDifferenceExact)} lei` : "necunoscută"}</strong>.</p><p className="iw-muted">Sumele unei singure versiuni nu sunt valoarea modificării și nu dovedesc o plată.</p></div>}
      {s.connectionContext != null && typeof s.connectionContext === "object" && "description" in s.connectionContext && typeof s.connectionContext.description === "string" && <p className="iw-muted">{s.connectionContext.description}</p>}
      <PeerEvidenceSummary context={s.peerContext} />
      {clip.kind === "document_quote" && <div className="iw-evidence-summary"><blockquote className="iw-prose">{String(s.quote ?? "")}</blockquote><p className="iw-muted">Pagina {String(s.page)} · {s.method === "ocr" ? "Text OCR — verifică în original" : "Text extras din PDF"}</p><p><a href={`/api/documents/${clip.refId}/file?kind=pdf#page=${s.page}`} target="_blank" rel="noopener noreferrer">Verifică pagina originală ↗</a>{" · "}<a href={`/api/documents/${clip.refId}/file`}>Descarcă originalul</a>{" · "}<a href={String(s.sourceUrl)} target="_blank" rel="noopener noreferrer">Anunțul SEAP ↗</a></p><details><summary>Versiunea păstrată</summary><p className="iw-hash">SHA-256: {String(s.originalHash)}</p></details></div>}
      {clip.methodologyChanged ? <p className="iw-muted">Metodologie modificată: riscul salvat folosea vechiul indice, deci nu îl comparăm cu cel de acum.</p> : null}
    </>;
    return { id: clip.id, kind: clip.kind, kindLabel, group: clipKindGroup[clip.kind] ?? "Alte dovezi", title: clipTitle(clip), href: clipHref(clip),
      savedAt: clip.createdAt, pinned: clip.pinned, note: clip.note, refId: clip.refId,
      capture: clip.capture ?? null, versions: clip.captures ?? [], ownValue: ownValue?.exact ?? null,
      queryHref: clip.kind === "query" ? clipQueryHref(clip) : null, registry: clip.kind === "entity" && Boolean(clip.refId),
      captured: clip.kind !== "note" && clip.kind !== "document_quote", line, extra };
  });
}
