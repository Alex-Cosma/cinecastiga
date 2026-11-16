"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import DiscoverNav from "@/components/discover/DiscoverNav";
import "./domains.css";

export default function DomainsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // A failure (a slow database) says so plainly, at the size of a headline, never „s-” alone at a line's end (UX audit Z6-33).
  return <div className="domains-page" role="alert">
    <DiscoverNav current="domenii" />
    <section className="dm-hero"><div>
      <h1 className="dm-error-title">Nu am putut încărca domeniile.</h1>
      <div className="dm-error-actions">
        <button type="button" className="dm-button" onClick={() => startTransition(() => { router.refresh(); reset(); })}>Încearcă din nou</button>
        <Link href="/domenii" className="dm-button dm-secondary">Deschide anul implicit</Link>
        <Link href="/intreaba" className="dm-button dm-secondary">Construiește o întrebare →</Link>
      </div>
    </div></section>
  </div>;
}
