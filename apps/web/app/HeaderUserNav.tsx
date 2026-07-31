"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

/**
 * Right side of the site header. Invisible for public visitors (header stays
 * brand-only); logged-in watchdogs get one-click access to their anchete
 * and account, admins also to the admin panel.
 */
export default function HeaderUserNav() {
  const { data } = authClient.useSession();
  if (!data) return null;
  const role = (data.user as { role?: string }).role;
  return (
    <nav className="user-nav">
      <Link href="/anchete">🗂 anchete</Link>
      <Link href="/cont">cont</Link>
      {role === "admin" && <Link href="/admin">admin</Link>}
    </nav>
  );
}
