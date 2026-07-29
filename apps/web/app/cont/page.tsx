import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AccountPanel from "./AccountPanel";

export const dynamic = "force-dynamic";

export default async function ContPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = session.user as { email: string; name: string; role?: string };

  return (
    <>
      <h1 className="page-title">Contul meu</h1>
      <p className="page-sub">
        {user.name} · {user.email}
        {user.role === "admin" && (
          <>
            {" "}
            · <Link href="/admin">administrare conturi →</Link>
          </>
        )}
      </p>
      <AccountPanel />
    </>
  );
}
