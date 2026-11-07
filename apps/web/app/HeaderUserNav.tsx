"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Right side of the site header. Anonymous visitors get a quiet
 * "Autentificare" link; signed-in readers an avatar that opens their account,
 * "Contul meu" (admins also the admin panel). Their investigations are in the
 * main navigation. Until the session is confirmed, the server's cookie hint
 * decides what stands there, so the header does not shift: no cookie draws the
 * link at once, a cookie keeps the avatar's room.
 */
export default function HeaderUserNav({ sessionHint }: { sessionHint: boolean }) {
  const { data, isPending, error } = authClient.useSession();
  const path = usePathname() ?? "";
  // Another auth subscriber can resolve the session before this streamed
  // boundary hydrates. Keep its first client render identical to the server.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // A refused session check (a 429 under load, a network error) is not "signed out": with the cookie hint the room stays.
  if ((!hydrated || isPending || (error && !data)) && sessionHint) return <span className="user-nav user-nav-wait" aria-hidden />;
  if (!hydrated || isPending || !data) {
    return (
      <nav className="user-nav" aria-label="Cont">
        <Link href="/login" className={path.startsWith("/login") ? "on" : undefined} aria-current={path.startsWith("/login") ? "page" : undefined}>
          Autentificare
        </Link>
      </nav>
    );
  }
  const user = data.user as { role?: string; name?: string | null; email: string };
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const onAdmin = under(path, "/admin"), onAccount = under(path, "/cont");
  const accountName = `Contul meu (${user.email})`;
  return (
    <nav className="user-nav" aria-label="Cont">
      {user.role === "admin" && (
        <Link href="/admin" className={onAdmin ? "on" : undefined} aria-current={onAdmin ? "page" : undefined}>
          admin
        </Link>
      )}
      <Link href="/cont" className={onAccount ? "avatar-link on" : "avatar-link"} aria-current={onAccount ? "page" : undefined}
        aria-label={accountName} title={accountName}>
        <span className="avatar" aria-hidden="true">{initials}</span>
      </Link>
    </nav>
  );
}
