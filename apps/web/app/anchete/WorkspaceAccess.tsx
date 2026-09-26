"use client";
import { useState, type FormEvent } from "react";
import type { WorkspaceMembers } from "@/lib/investigation-workspace";

export default function WorkspaceAccess({ id }: { id: string }) {
  const [data, setData] = useState<WorkspaceMembers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const base = `/api/anchete/${id}`;
  async function reload() {
    const response = await fetch(`${base}/members`, { cache: "no-store" }); const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Nu am putut încărca accesul."); setData(result);
  }
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Nu am putut modifica accesul.");
      await reload(); setNotice("Accesul a fost actualizat."); return result;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Încearcă din nou."); return null; }
    finally { setBusy(false); }
  }
  async function invitePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await act(`${base}/members`, "POST", { email: form.get("email"), role: form.get("role") });
    if (result?.path) { setInvite(new URL(result.path, location.origin).href); setCopied(false); }
  }
  return <details className="iw-access" onToggle={event => { if (event.currentTarget.open && !data) void reload().catch(failure => setError(String(failure.message))); }}>
    <summary>Acces privat și colaboratori</summary>
    <div className="iw-access-content"><p>Dosarul este privat. Invitația funcționează doar pentru contul cu adresa aleasă și confirmată; simpla posesie a linkului nu oferă acces.</p>
      <p className="iw-muted">Editorii pot organiza dosarul și adăuga dovezi. Cititorii pot consulta și exporta. Numai tu administrezi accesul.</p>
      {error && <p className="iw-error" role="alert">{error}</p>}<p role="status">{notice}</p>
      {!data && !error && <p>Se încarcă accesul…</p>}
      {data && <>
        {data.members.length > 0 && <ul className="iw-members">{data.members.map(member => <li key={member.id}>
          <div><strong>{member.name}</strong><span>{member.email}</span></div>
          <form onSubmit={event => { event.preventDefault(); void act(`${base}/members/${member.id}`, "PATCH", { role: new FormData(event.currentTarget).get("role") }); }}>
            <label className="d-sr-only" htmlFor={`role-${member.id}`}>Rolul lui {member.name}</label><select id={`role-${member.id}`} name="role" defaultValue={member.role} disabled={busy}><option value="editor">Editor</option><option value="viewer">Cititor</option></select><button disabled={busy}>Salvează rolul</button>
          </form>
          <details><summary>Retrage accesul</summary><p>{member.name} nu va mai putea deschide dosarul. Copiile deja exportate rămân la destinatar.</p><button type="button" className="iw-danger" disabled={busy} onClick={() => { void act(`${base}/members/${member.id}`, "DELETE"); setInvite(""); }}>Confirmă retragerea</button></details>
        </li>)}</ul>}
        <form className="iw-share-form" onSubmit={invitePerson}><fieldset disabled={busy}><h3>Invită un coleg</h3>
          <div className="iw-form-row"><label>Adresa contului<input name="email" type="email" required maxLength={254} placeholder="coleg@redactie.ro" autoComplete="off" /></label>
            <label>Acces<select name="role" defaultValue="viewer"><option value="viewer">Cititor · consultă și exportă</option><option value="editor">Editor · poate modifica dosarul</option></select></label></div>
          <button type="submit" className="iw-primary">{busy ? "Se creează…" : "Creează link de invitație"}</button><p className="iw-muted">Valabil 7 zile. Trimite tu linkul colegului; aplicația nu expediază un e-mail. Este necesar un cont cu adresa de e-mail confirmată.</p>
        </fieldset></form>
        {invite && <div className="iw-invite-copy"><label>Linkul creat<input readOnly value={invite} onFocus={event => event.currentTarget.select()} /></label><button type="button" onClick={() => void navigator.clipboard.writeText(invite).then(() => setCopied(true)).catch(() => setError("Selectează și copiază linkul din câmp."))}>{copied ? "Link copiat" : "Copiază linkul"}</button></div>}
        {data.invites.length > 0 && <><h3>Invitații în așteptare</h3><ul className="iw-pending-invites">{data.invites.map(item => <li key={item.id}><span>{item.email} · {item.role === "editor" ? "editor" : "cititor"}<small>Expiră la {new Date(item.expiresAt).toLocaleDateString("ro-RO")}</small></span><button type="button" disabled={busy} onClick={() => { void act(`${base}/invites/${item.id}`, "DELETE"); setInvite(""); }}>Revocă invitația</button></li>)}</ul></>}
      </>}
    </div>
  </details>;
}
