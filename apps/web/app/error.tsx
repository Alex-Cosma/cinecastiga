"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

/**
 * A page that failed to build. The reader gets a plain sentence, a retry and a
 * way onward; the technical reference stays folded for a problem report. The
 * exception text itself is never shown (it can carry SQL or internal names).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="err-page" role="alert">
      <h1 className="page-title">Pagina nu <span className="nowrap">s-a putut</span> încărca</h1>
      <p className="page-sub">De obicei e trecător. Încearcă din nou.</p>
      <div className="err-acts">
        <button type="button" className="btn pri" onClick={() => startTransition(() => { router.refresh(); reset(); })}>
          Încearcă din nou
        </button>
        <Link href="/" className="btn">
          Prima pagină
        </Link>
        <Link href="/semnale" className="btn">
          Semnale
        </Link>
      </div>
      {error.digest ? (
        <details className="err-tech">
          <summary>Detalii tehnice</summary>
          <p>
            Cod de referință: <span className="mono">{error.digest}</span>. Dacă problema se repetă, trimite-ne codul
            prin butonul „Feedback”.
          </p>
        </details>
      ) : null}
    </div>
  );
}
