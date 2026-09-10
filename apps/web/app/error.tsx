"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="err-page">
      <p className="eyebrow">eroare</p>
      <h1 className="page-title">Ceva nu a mers</h1>
      <p className="page-sub">
        Pagina nu a putut fi construită. De obicei e o interogare prea grea sau o problemă temporară cu baza de date.
        {error.digest ? <span className="mono"> · {error.digest}</span> : null}
      </p>
      <div className="err-acts">
        <button type="button" className="btn pri" onClick={() => reset()}>
          Încearcă din nou
        </button>
        <Link href="/" className="btn">
          Acasă
        </Link>
      </div>
    </div>
  );
}
