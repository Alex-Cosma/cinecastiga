import { notFound, redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import type { Metadata } from "next";
import { getDosar, getOwnedInvestigation } from "@/lib/anchete";
import { getInvestigationWorkspace, getWorkspaceMembers } from "@/lib/investigation-workspace";
import { clipDate, clipTitle, clipValue } from "@/lib/evidence-clip";
import PrivateTrail from "@/components/private/PrivateTrail";
import Workspace, { type WorkspaceTab } from "../Workspace";
import DossierHead from "../DossierHead";
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
  // Nothing to export or to share yet (audit Z8-08): the export and the owner's role come back with the first item.
  const empty = dosar.clips.length === 0 && workspace.entries.length === 0;
  // The owner's head says how many invitations wait or who has access (Z8-27); the panel starts from the same read.
  const access = workspace.access.canManage ? await getWorkspaceMembers(user, id).catch(() => null) : null;
  return <div className="private-shell iw-shell iw-dossier">
    <PrivateTrail current="anchete" />
    <DossierHead id={id} title={inv.title} description={inv.description} status={inv.status} canEdit={workspace.access.canEdit} canManage={workspace.access.canManage} empty={empty} access={access}
      meta={<p className="iw-header-meta"><span className="iw-private">Dosar privat</span><span>{statuses[inv.status] ?? inv.status}</span>{!(empty && workspace.access.role === "owner") && <span>{role}</span>}</p>} />
    {!workspace.access.canEdit && <p className="iw-readonly">Doar consultare. Pentru modificări, cere acces de editor.</p>}
    <DossierBrief id={id} dosar={dosar} entries={workspace.entries} />
    <Workspace investigationId={id} initial={workspace} initialTab={tab} sourceEvents={dosar.sourceEvents}
      clips={dosar.clips.map(clip => { const value = clipValue(clip); return { id: clip.id, title: clipTitle(clip), kind: clip.kind, createdAt: clip.createdAt, refId: clip.refId,
        valueExact: value?.exact ?? null, valueUnit: value?.unit ?? "lei", valueLabel: value?.label ?? null, date: clipDate(clip), registry: clip.kind === "entity" }; })}
      evidence={dossierEvidenceParts({ clips: dosar.clips })} />
  </div>;
}
