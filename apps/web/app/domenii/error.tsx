"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import "./domains.css";

export default function DomainsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <div className="domains-page" role="alert">
    <section className="dm-hero"><div>
      <p className="dm-eyebrow"><span className="dm-dash" />Descoperă / Domenii</p>
      <h1>Domeniile nu s-au putut încărca.</h1>
      <div className="dm-error-actions">
        <button type="button" className="dm-button" onClick={() => startTransition(() => { router.refresh(); reset(); })}>Încearcă din nou</button>
        <Link href="/domenii" className="dm-button dm-secondary">Deschide anul implicit</Link>
        <Link href="/intreaba" className="dm-button dm-secondary">Construiește o întrebare →</Link>
      </div>
    </div></section>
  </div>;
}
