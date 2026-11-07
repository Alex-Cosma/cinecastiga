import { notFound, redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import type { Metadata } from "next";
import { getDosar, getOwnedInvestigation } from "@/lib/anchete";
import { getInvestigationWorkspace } from "@/lib/investigation-workspace";
import { clipDate, clipTitle, clipValue } from "@/lib/evidence-clip";
import PrivateTrail from "@/components/private/PrivateTrail";
import { deleteAncheta, saveAnchetaMeta } from "../actions";
import Workspace, { type WorkspaceTab } from "../Workspace";
import WorkspaceAccess from "../WorkspaceAccess";
import { dossierEvidenceParts } from "../DossierEvidence";
import DossierBrief from "../DossierBrief";
import "../workspace.css";
export const dynamic = "force-dynamic";
/** The tab says which dossier (the reader's own or shared with them: the same access check as the page). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await sessionUserId(), { id } = await params;
  const investigation = user ? await getOwnedInvestigation(user, id).catch(() => null) : null;
  return { title: investigation ? `${investigation.title.slice(0, 70)} · dosar` : "Dosar", robots: { index: false, follow: false } };
}
const statuses = { activa: "În lucru", publicata: "Publicată editorial", inchisa: "Închisă" };
export default async function DosarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sectiune?: string; tip?: string }> }) {
  const user = await sessionUserId(), { id } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/anchete/${id}`)}`);
  const workspace = await getInvestigationWorkspace(user, id); if (!workspace) notFound();
  const dosar = await getDosar(user, id); if (!dosar) notFound();
  const inv = dosar.investigation, { sectiune, tip } = await searchParams;
  // Opens on what the dossier holds until a question has evidence linked to it (owner, 7 November 2026).
  const tab: WorkspaceTab = ["questions", "evidence", "timeline", "tasks"].includes(sectiune ?? "") ? sectiune as WorkspaceTab
    : tip || workspace.links.length === 0 ? "evidence" : "questions";
  const role = workspace.access.role === "owner" ? "Proprietar" : workspace.access.role === "editor" ? "Editor" : "Cititor · doar consultare";
  return <div className="private-shell iw-shell iw-dossier">
    <PrivateTrail current="anchete" />
    <header className="iw-header iw-dossier-head"><div><h1>{inv.title}</h1>{inv.description && <p className="iw-description">{inv.description}</p>}
      <p className="iw-header-meta"><span className="iw-private">Dosar privat</span><span>{statuses[inv.status] ?? inv.status}</span><span>{role}</span></p>
    </div></header>
    <div className="iw-top-tools">
      <a className="iw-tool" href={`/api/anchete/${id}/export?format=zip`} download>Exportă dosarul · ZIP</a>
      {workspace.access.canManage && <WorkspaceAccess id={id} />}
      {workspace.access.canEdit && <details className="iw-settings"><summary>Detalii</summary><form action={saveAnchetaMeta}><input type="hidden" name="id" value={id} />
        <label>Titlu<input name="title" required maxLength={200} defaultValue={inv.title} /></label><label>Descriere<textarea name="description" rows={3} maxLength={4000} defaultValue={inv.description ?? ""} /></label>
        <label>Stare editorială<select name="status" defaultValue={inv.status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="iw-muted">„Publicată editorial” nu face dosarul public: accesul rămâne la colaboratorii invitați.</p><button type="submit">Salvează detaliile</button>
      </form>{workspace.access.canManage && <details className="iw-delete"><summary>Șterge dosarul</summary><p>Se elimină dosarul, notele, capturile și accesul colaboratorilor. Acțiunea este definitivă.</p><form action={deleteAncheta}><input type="hidden" name="id" value={id} /><button type="submit" className="iw-danger">Confirmă ștergerea definitivă</button></form></details>}</details>}
    </div>
    {!workspace.access.canEdit && <p className="iw-readonly">Doar consultare. Pentru modificări, cere acces de editor.</p>}
    <DossierBrief id={id} dosar={dosar} entries={workspace.entries} />
    <Workspace investigationId={id} initial={workspace} initialTab={tab} sourceEvents={dosar.sourceEvents}
      clips={dosar.clips.map(clip => { const value = clipValue(clip); return { id: clip.id, title: clipTitle(clip), kind: clip.kind, createdAt: clip.createdAt, refId: clip.refId,
        valueExact: value?.exact ?? null, valueUnit: value?.unit ?? "lei", valueLabel: value?.label ?? null, date: clipDate(clip), registry: clip.kind === "entity" }; })}
      evidence={dossierEvidenceParts({ id, clips: dosar.clips, canEdit: workspace.access.canEdit })} />
  </div>;
}
