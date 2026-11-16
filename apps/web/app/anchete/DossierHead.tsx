"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkspaceMembers } from "@/lib/investigation-workspace";
import { countWords } from "@/lib/ask/answer-text";
import { deleteAncheta, saveAnchetaMeta } from "./actions";
import WorkspaceAccess from "./WorkspaceAccess";

const statuses = { activa: "În lucru", publicata: "Publicată editorial", inchisa: "Închisă" };

/**
 * The dossier's head (audit Z8-27): the title, its description and meta on the left; "Editează", "Colaboratori ·
 * 1 invitație" and "Exportă · ZIP" beside it. A tool's panel opens under the head in one framed place, so the buttons
 * never move; saving the details closes the panel and says so. "Șterge dosarul" stays apart, at the panel's end.
 */
export default function DossierHead({ id, title, description, status, meta, canEdit, canManage, empty, access }: {
  id: string; title: string; description: string | null; status: string; meta: ReactNode;
  canEdit: boolean; canManage: boolean; empty: boolean; access: WorkspaceMembers | null;
}) {
  const [panel, setPanel] = useState<"edit" | "access" | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panel) { (area.current?.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select,button") ?? area.current)?.focus({ preventScroll: true }); area.current?.scrollIntoView({ block: "nearest" }); } }, [panel]);
  const toggle = (next: "edit" | "access") => { setSaved(false); setPanel(current => current === next ? null : next); };
  const invites = access?.invites.length ?? 0, members = access?.members.length ?? 0;
  const accessNote = invites ? countWords(invites, "invitație", "invitații") : members ? countWords(members, "colaborator", "colaboratori") : null;
  return <>
    <header className="iw-header iw-dossier-head">
      <div><h1>{title}</h1>{description && <p className="iw-description">{description}</p>}{meta}</div>
      {(canEdit || canManage || !empty) && <div className="iw-head-tools">
        {canEdit && <button type="button" aria-expanded={panel === "edit"} aria-controls="iw-head-panel" onClick={() => toggle("edit")}>Editează</button>}
        {canManage && <button type="button" aria-expanded={panel === "access"} aria-controls="iw-head-panel" onClick={() => toggle("access")}>Colaboratori{accessNote && <span className="iw-head-note">· {accessNote}</span>}</button>}
        {!empty && <a className="iw-head-tool" href={`/api/anchete/${id}/export?format=zip`} download>Exportă · ZIP</a>}
      </div>}
    </header>
    {saved && <p className="iw-saved" role="status">Dosarul a fost actualizat.</p>}
    <div id="iw-head-panel" ref={area} tabIndex={-1} className={panel ? "iw-head-panel" : undefined} hidden={!panel}>
      {panel === "edit" && <>
        <form className="iw-settings-form" action={async data => { setPending(true); try { await saveAnchetaMeta(data); setPanel(null); setSaved(true); } finally { setPending(false); } }}>
          <input type="hidden" name="id" value={id} />
          <label>Titlu<input name="title" required maxLength={200} defaultValue={title} /></label>
          <label>Descriere<textarea name="description" rows={3} maxLength={4000} defaultValue={description ?? ""} /></label>
          <label>Stare editorială<select name="status" defaultValue={status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <p className="iw-muted">„Publicată editorial” nu face dosarul public: accesul rămâne la colaboratorii invitați.</p>
          <div className="iw-form-actions"><button type="submit" className="iw-primary" disabled={pending}>{pending ? "Se salvează…" : "Salvează"}</button><button type="button" onClick={() => setPanel(null)}>Renunță</button></div>
        </form>
        {canManage && <details className="iw-delete"><summary>Șterge dosarul</summary><p>Se elimină dosarul, notele, capturile și accesul colaboratorilor. Acțiunea este definitivă.</p><form action={deleteAncheta}><input type="hidden" name="id" value={id} /><button type="submit" className="iw-danger">Confirmă ștergerea definitivă</button></form></details>}
      </>}
      {panel === "access" && <WorkspaceAccess id={id} initial={access} />}
    </div>
  </>;
}
