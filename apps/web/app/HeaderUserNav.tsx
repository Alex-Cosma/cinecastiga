"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Right side of the site header. Anonymous visitors get a quiet
 * "Autentificare" link; logged-in watchdogs get their anchete and an avatar
 * that opens the account (admins also the admin panel). Until the session is
 * confirmed, the server's cookie hint decides what stands there, so the header
 * does not shift: no cookie draws the link at once, a cookie keeps the avatar's room.
 */
export default function HeaderUserNav({ sessionHint }: { sessionHint: boolean }) {
  const { data, isPending } = authClient.useSession();
  const path = usePathname() ?? "";
  // Another auth subscriber can resolve the session before this streamed
  // boundary hydrates. Keep its first client render identical to the server.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if ((!hydrated || isPending) && sessionHint) return <span className="user-nav user-nav-wait" aria-hidden />;
  if (!hydrated || isPending || !data) {
    return (
      <nav className="user-nav">
        <Link href="/login" className={path.startsWith("/login") ? "on" : undefined}>
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
  return (
    <nav className="user-nav">
      <Link href="/anchete" className={path.startsWith("/anchete") ? "on" : undefined}>
        🗂 anchete
      </Link>
      {user.role === "admin" && (
        <Link href="/admin" className={path.startsWith("/admin") ? "on" : undefined}>
          admin
        </Link>
      )}
      <Link href="/cont" className="avatar-link" title={user.email}>
        <span className="avatar">{initials}</span>
      </Link>
    </nav>
  );
}
