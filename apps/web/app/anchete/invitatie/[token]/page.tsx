import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { readWorkspaceInvite } from "@/lib/investigation-workspace";
import AcceptInvite from "./AcceptInvite";
import ConfirmEmail from "./ConfirmEmail";
import "../../workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitație privată", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/anchete/invitatie/${token}`)}`);
  if (!session.user.emailVerified) return <div className="iw-invitation">
    <Link href="/anchete">Înapoi la anchete</Link>
    <h1>Confirmă adresa de e-mail</h1>
    <ConfirmEmail email={session.user.email} />
  </div>;
  const invite = await readWorkspaceInvite(session.user.id, token);
  return <div className="iw-invitation"><Link href="/anchete">Înapoi la anchete</Link>
    <h1>{invite ? "Un dosar de verificat împreună" : "Invitația nu este disponibilă"}</h1>
    {invite ? <><h2>{invite.title}</h2><p>Primești acces de <strong>{invite.role === "editor" ? "editor" : "cititor"}</strong> la acest dosar privat.</p><p>{invite.role === "editor" ? "Vei putea adăuga dovezi, întrebări și note." : "Vei putea consulta și exporta dovezile, fără să modifici dosarul."} Proprietarul poate retrage accesul.</p><AcceptInvite token={token} /></> : <p>Linkul a expirat, a fost folosit sau revocat, ori invitația a fost adresată altui cont. Ești autentificat cu {session.user.email}. Verifică adresa și cere proprietarului un link nou.</p>}
  </div>;
}
