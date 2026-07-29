"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

/**
 * Discreet auth entry in the footer. Client-side session check so the root
 * layout stays static — shows "Autentificare" until a session is known.
 */
export default function FooterAuthLink() {
  const { data } = authClient.useSession();
  return data ? (
    <Link href="/cont">Contul meu</Link>
  ) : (
    <Link href="/login">Autentificare</Link>
  );
}
