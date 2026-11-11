"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Footer links only an administrator sees: unit prices, until the data is complete (owner, 11 November 2026). The
 * session is read in the browser, as in the header (HeaderUserNav), so the root layout looks nothing up; the pages
 * themselves refuse everyone else (lib/price-access.ts). Renders nothing until the session is known.
 */
export default function FooterAdminLinks() {
  const { data } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated || (data?.user as { role?: string } | undefined)?.role !== "admin") return null;
  return <li><Link href="/preturi" prefetch={false}>Prețuri pe unitate</Link></li>;
}
