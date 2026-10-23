"use client";

/**
 * Last-resort boundary for a failure in the root layout itself, where the site
 * header, fonts and stylesheets are not available: a self-contained page with
 * the same message as app/error.tsx and no exception text.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ro">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#f7f8f2", color: "#243a30" }}>
        <main role="alert" style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 30, margin: "0 0 12px" }}>Pagina nu <span style={{ whiteSpace: "nowrap" }}>s-a putut</span> încărca</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 22px" }}>
            Ceva nu a mers când am pregătit această pagină. De obicei e o problemă trecătoare: încearcă din nou peste câteva momente.
          </p>
          <p style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", margin: 0 }}>
            <button type="button" onClick={() => reset()} style={{ font: "inherit", padding: "10px 16px", borderRadius: 8, border: "1px solid #204c3c", background: "#204c3c", color: "#fffefa", cursor: "pointer" }}>
              Încearcă din nou
            </button>
            {/* A full navigation: the root layout must be rebuilt, not reused. */}
            <a href="/" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #cbd4c3", color: "#204c3c", textDecoration: "none" }}>
              Prima pagină
            </a>
          </p>
          {error.digest ? (
            <details style={{ marginTop: 28, fontSize: 13, color: "#5d6658" }}>
              <summary style={{ cursor: "pointer" }}>Detalii tehnice</summary>
              <p>Cod de referință: <code>{error.digest}</code></p>
            </details>
          ) : null}
        </main>
      </body>
    </html>
  );
}
