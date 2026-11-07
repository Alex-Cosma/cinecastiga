import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { readInviteForOwner, readWorkspaceInvite } from "@/lib/investigation-workspace";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay } from "@/lib/private-format";
import PrivateTrail from "@/components/private/PrivateTrail";
import AcceptInvite from "./AcceptInvite";
import ConfirmEmail from "./ConfirmEmail";
import "../../workspace.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitație privată", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const roleWords = (role: string) => role === "editor" ? "editor" : "cititor";
const ownerStates = { pending: "Încă neacceptată", accepted: "Acceptată", revoked: "Revocată", expired: "Expirată" } as const;

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/anchete/invitatie/${token}`)}`);
  const shell = (children: React.ReactNode) => <div className="private-shell iw-shell"><PrivateTrail current="anchete" /><div className="iw-invitation">{children}</div></div>;
  if (!session.user.emailVerified) return shell(<>
    <h1>Confirmă adresa de e-mail</h1>
    <ConfirmEmail email={session.user.email} />
  </>);
  const invite = await readWorkspaceInvite(session.user.id, token);
  if (invite) return shell(<>
    <h1>{invite.inviterName ? `${invite.inviterName} te invită într-un dosar` : "O invitație într-un dosar privat"}</h1>
    <h2>{invite.title}</h2>
    <dl className="iw-invite-facts">
      <div><dt>Acces</dt><dd>{roleWords(invite.role)} · {invite.role === "editor" ? "poți adăuga dovezi, întrebări și note" : "consulți și exporți, fără să modifici"}</dd></div>
      <div><dt>În dosar</dt><dd>{countWords(invite.nClips, "dovadă salvată", "dovezi salvate")} · {countWords(invite.nQuestions, "întrebare", "întrebări")}</dd></div>
      <div><dt>Expiră</dt><dd>{privateDay(invite.expiresAt)}</dd></div>
    </dl>
    <p className="iw-muted">Proprietarul poate retrage accesul oricând.</p>
    <AcceptInvite token={token} />
  </>);
  // The owner opening their own link: whom it is for, not "unavailable" (owner, 7 November 2026).
  const own = await readInviteForOwner(session.user.id, token);
  if (own) return shell(<>
    <h1>Această invitație e pentru <span className="iw-invite-email">{own.email}</span></h1>
    <p>Ai creat-o pentru dosarul <Link href={`/anchete/${own.investigationId}`}>{own.title}</Link>, cu acces de {roleWords(own.role)}. {ownerStates[own.state]}{own.state === "pending" ? `; expiră la ${privateDay(own.expiresAt)}` : ""}.</p>
    <p className="iw-muted">Trimite linkul persoanei invitate. Doar contul cu adresa {own.email}, confirmată, îl poate folosi.</p>
    <Link className="iw-primary" href={`/anchete/${own.investigationId}`}>Deschide dosarul</Link>
  </>);
  return shell(<>
    <h1>Invitația nu este disponibilă</h1>
    <p>Linkul a expirat, a fost folosit sau revocat, ori invitația a fost adresată altui cont. Ești autentificat cu {session.user.email}. Verifică adresa și cere proprietarului un link nou.</p>
    <Link href="/anchete">Anchetele mele →</Link>
  </>);
}
