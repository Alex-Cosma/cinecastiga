"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceMembers } from "@/lib/investigation-workspace";
import { Ghost } from "@/components/ghost/Ghost";
import { privateDay } from "@/lib/private-format";

/** "Colaboratori": who has access, the open invitations and the form to invite (the dossier head's panel, Z8-27). */
export default function WorkspaceAccess({ id, initial = null }: { id: string; initial?: WorkspaceMembers | null }) {
  const [data, setData] = useState<WorkspaceMembers | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The link just created (Z8-28): it replaces the form in place, so it cannot be missed.
  const [invite, setInvite] = useState<{ url: string; email: string; expiresAt: string | null } | null>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (invite) copyButton.current?.focus(); }, [invite]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const base = `/api/anchete/${id}`;
  const router = useRouter();
  async function reload() {
    const response = await fetch(`${base}/members`, { cache: "no-store" }); const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Nu am putut încărca accesul."); setData(result);
  }
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Nu am putut modifica accesul.");
      await reload(); setNotice("Accesul a fost actualizat."); router.refresh(); return result;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Încearcă din nou."); return null; }
    finally { setBusy(false); }
  }
  async function invitePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const result = await act(`${base}/members`, "POST", { email, role: form.get("role") });
    if (result?.path) { setInvite({ url: new URL(result.path, location.origin).href, email, expiresAt: typeof result.expiresAt === "string" ? result.expiresAt : null }); setCopied(false); setNotice(""); }
  }
  const shareForm = (waiting: boolean) => <form className="iw-share-form" onSubmit={invitePerson} aria-hidden={waiting || undefined}><fieldset disabled={busy || waiting}><h3>Invită un coleg</h3>
          <div className="iw-form-row"><label>Adresa contului<input name="email" type="email" required maxLength={254} placeholder="coleg@redactie.ro" autoComplete="off" /></label>
            <label>Acces<select name="role" defaultValue="viewer"><option value="viewer">Cititor · consultă și exportă</option><option value="editor">Editor · poate modifica dosarul</option></select></label></div>
          <button type="submit" className="iw-primary">{busy ? "Se creează…" : "Creează link de invitație"}</button><p className="iw-muted">Valabil 7 zile. Trimite tu linkul; nu trimitem e-mail.</p>
        </fieldset></form>;
  useEffect(() => { if (!data) void reload().catch(failure => setError(String(failure.message))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="iw-access">
    <div className="iw-access-content"><p>Dosarul este privat. Invitația funcționează doar pentru contul cu adresa aleasă și confirmată; simpla posesie a linkului nu oferă acces.</p>
      {error && <p className="iw-error" role="alert">{error}</p>}<p role="status">{notice}</p>
      {/* While the access list loads (owner, 6 November 2026: "ghost data loading"), the invitation form is already in
          place, inert, so the panel does not grow when the list arrives; collaborators (usually none) come above it. */}
      {!data && !error && <Ghost name="iw-access" wait="client" label="Se încarcă accesul…">{shareForm(true)}</Ghost>}
      {data && <>
        {data.members.length > 0 && <ul className="iw-members">{data.members.map(member => <li key={member.id}>
          <div><strong>{member.name}</strong><span>{member.email}</span></div>
          <form onSubmit={event => { event.preventDefault(); void act(`${base}/members/${member.id}`, "PATCH", { role: new FormData(event.currentTarget).get("role") }); }}>
            <label className="d-sr-only" htmlFor={`role-${member.id}`}>Rolul lui {member.name}</label><select id={`role-${member.id}`} name="role" defaultValue={member.role} disabled={busy}><option value="editor">Editor</option><option value="viewer">Cititor</option></select><button disabled={busy}>Salvează rolul</button>
          </form>
          <details><summary>Retrage accesul</summary><p>{member.name} nu va mai putea deschide dosarul. Copiile deja exportate rămân la destinatar.</p><button type="button" className="iw-danger" disabled={busy} onClick={() => { void act(`${base}/members/${member.id}`, "DELETE"); setInvite(null); }}>Confirmă retragerea</button></details>
        </li>)}</ul>}
        {invite ? <div className="iw-invite-copy" role="status"><p className="iw-invite-once">Link creat pentru {invite.email}{invite.expiresAt ? ` · valabil până la ${privateDay(invite.expiresAt)}` : ""}. Apare o singură dată: copiază-l acum și trimite-l colegului.</p>
          <label>Linkul invitației<input readOnly value={invite.url} onFocus={event => event.currentTarget.select()} /></label>
          <button ref={copyButton} type="button" className="iw-primary" onClick={() => void navigator.clipboard.writeText(invite.url).then(() => setCopied(true)).catch(() => setError("Selectează și copiază linkul din câmp."))}>{copied ? "Link copiat" : "Copiază linkul"}</button>
          <button type="button" className="iw-text-button" onClick={() => { setInvite(null); setCopied(false); }}>Invită pe altcineva</button></div>
          : shareForm(false)}
        {data.invites.length > 0 && <><h3>Invitații în așteptare</h3><ul className="iw-pending-invites">{data.invites.map(item => <li key={item.id}><span>{item.email} · {item.role === "editor" ? "editor" : "cititor"}<small>Expiră la {privateDay(item.expiresAt)}</small></span><button type="button" disabled={busy} onClick={() => { void act(`${base}/invites/${item.id}`, "DELETE"); setInvite(null); }}>Revocă invitația</button></li>)}</ul></>}
      </>}
    </div>
  </div>;
}
