"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Discreet auth entry in the footer. Client-side session check so the root
 * layout stays static — shows "Autentificare" until a session is known.
 */
export default function FooterAuthLink({ sessionHint = false }: { sessionHint?: boolean }) {
  const { data, isPending, error } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // As the header (SiteNav): until the check answers, and when it is refused (a 429 under load), a session cookie
  // means a signed-in reader (audit bug: the footer said "Autentificare" on /cont).
  const known = hydrated && !isPending;
  return hydrated && (known ? data || (error && sessionHint) : sessionHint) ? (
    <Link href="/cont">Contul meu</Link>
  ) : (
    <Link href="/login">Autentificare</Link>
  );
}
