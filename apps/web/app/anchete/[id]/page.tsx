import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { getDosar } from "@/lib/anchete";
import { getInvestigationWorkspace } from "@/lib/investigation-workspace";
import { cleanName, formatRon, formatInt } from "@/lib/format";
import { deleteAncheta, saveAnchetaMeta } from "../actions";
import Workspace, { type WorkspaceTab } from "../Workspace";
import WorkspaceAccess from "../WorkspaceAccess";
import DossierEvidence, { clipTitle } from "../DossierEvidence";
import "../workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Dosar de investigație", robots: { index: false, follow: false } };
const statuses = { activa: "În lucru", publicata: "Publicată editorial", inchisa: "Închisă" };
export default async function DosarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sectiune?: string; tip?: string }> }) {
  const user = await sessionUserId(), { id } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/anchete/${id}`)}`);
  const workspace = await getInvestigationWorkspace(user, id); if (!workspace) notFound();
  const dosar = await getDosar(user, id); if (!dosar) notFound();
  const inv = dosar.investigation, { sectiune, tip } = await searchParams;
  const tab: WorkspaceTab = ["questions", "evidence", "timeline", "tasks"].includes(sectiune ?? "") ? sectiune as WorkspaceTab : tip ? "evidence" : "questions";
  const nameOf = (ref: string) => cleanName(dosar.cast.members.find(member => member.refId === ref)?.name ?? ref);
  return <div className="iw-shell">
    <Link className="iw-back" href="/anchete">← Anchetele mele și cele partajate</Link>
    <header className="iw-header"><div><h1>{inv.title}</h1>{inv.description && <p className="iw-description">{inv.description}</p>}
      <div className="iw-header-meta"><span className="iw-private">Dosar privat</span><span>{statuses[inv.status] ?? inv.status}</span><span>{workspace.access.role === "owner" ? "Proprietar" : workspace.access.role === "editor" ? "Editor" : "Cititor · doar consultare"}</span></div>
    </div><a className="iw-export" href={`/api/anchete/${id}/export?format=zip`}>Exportă dosarul</a></header>
    <div className="iw-top-tools">
      {workspace.access.canManage && <WorkspaceAccess id={id} />}
      {workspace.access.canEdit && <details className="iw-settings"><summary>Detaliile dosarului</summary><form action={saveAnchetaMeta}><input type="hidden" name="id" value={id} />
        <label>Titlu<input name="title" required maxLength={200} defaultValue={inv.title} /></label><label>Descriere<textarea name="description" rows={3} maxLength={4000} defaultValue={inv.description ?? ""} /></label>
        <label>Stare editorială<select name="status" defaultValue={inv.status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="iw-muted">Starea „Publicată editorial” nu face dosarul public. Accesul rămâne limitat la colaboratorii invitați.</p><button type="submit">Salvează detaliile</button>
      </form>{workspace.access.canManage && <details className="iw-delete"><summary>Șterge dosarul</summary><p>Se elimină dosarul, notele, capturile și accesul colaboratorilor. Acțiunea este definitivă.</p><form action={deleteAncheta}><input type="hidden" name="id" value={id} /><button type="submit" className="iw-danger">Confirmă ștergerea definitivă</button></form></details>}</details>}
    </div>
    {!workspace.access.canEdit && <p className="iw-readonly">Ai acces de cititor: poți consulta sursele și exporta dosarul. Pentru modificări, cere proprietarului acces de editor.</p>}
    <Workspace investigationId={id} initial={workspace} initialTab={tab} clips={dosar.clips.map(clip => ({ id: clip.id, title: clipTitle(clip), kind: clip.kind, createdAt: clip.createdAt }))}
      evidence={<DossierEvidence id={id} clips={dosar.clips} canEdit={workspace.access.canEdit} />} />
    {dosar.cast.members.length > 0 && <details className="iw-cast"><summary>Actorii și relațiile cunoscute în date · {dosar.cast.members.length}</summary><div>
      <p className="iw-muted">Context recalculat din datele curente. O relație comercială sau un administrator comun nu dovedește o neregulă.</p>
      <ul className="iw-cast-members">{dosar.cast.members.map(member => <li key={`${member.kind}-${member.refId}`}>{member.kind === "entity" ? <Link href={`/entitati/${member.refId}`}>{cleanName(member.name)}</Link> : cleanName(member.name)}</li>)}</ul>
      {dosar.cast.relations.length ? <ul className="iw-cast-relations">{dosar.cast.relations.map((relation, index) => <li key={index}><strong>{nameOf(relation.a)}</strong> și <strong>{nameOf(relation.b)}</strong>: {relation.label}{relation.valueRon !== undefined ? ` · ${formatRon(relation.valueRon)} în ${formatInt(relation.count ?? 0)} înregistrări` : ""}</li>)}</ul> : <p>Nu am identificat o relație directă între actorii salvați.</p>}
    </div></details>}
  </div>;
}
