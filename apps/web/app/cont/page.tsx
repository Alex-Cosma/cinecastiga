import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PrivateTrail from "@/components/private/PrivateTrail";
import { auth } from "@/lib/auth";
import { localPasswordOnlyLogin } from "@/lib/local-auth";
import AccountPanel from "./AccountPanel";
import "./cont.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contul meu", robots: { index: false, follow: false } };

/** The private space's third tab (owner, 7 November 2026), next to the investigations and the follows. */
export default async function ContPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=%2Fcont");
  const user = session.user as { email: string; name?: string | null; role?: string | null; twoFactorEnabled?: boolean | null };
  const admin = user.role === "admin";

  return (
    <div className="private-shell cont-page">
      <PrivateTrail current="cont" />
      <h1 className="cont-title">Contul meu</h1>
      <AccountPanel
        name={user.name?.trim() || null}
        email={user.email}
        admin={admin}
        codeByEmail={Boolean(user.twoFactorEnabled) && !localPasswordOnlyLogin()}
      />
    </div>
  );
}
