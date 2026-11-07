"use client";

import { useEffect } from "react";

/*
 * The theme tokens of app/approved.css (light, and dark from the system or the reader's saved choice), copied because
 * the site's stylesheets are not loaded here.
 */
const CSS = `
:root{color-scheme:light;--paper:#f7f8f2;--surface:#fffefa;--ink:#243a30;--ink2:#3f5043;--muted:#6c746b;--line2:#cbd4c3;--accent:#204c3c;--on-accent:#fffefa;--orange:#c7522d}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--paper:#111d18;--surface:#18271f;--ink:#e7eddf;--ink2:#ccd8c4;--muted:#a5b39e;--line2:#456047;--accent:#c0d8ad;--on-accent:#18271f;--orange:#ec9672}}
:root[data-theme=dark]{color-scheme:dark;--paper:#111d18;--surface:#18271f;--ink:#e7eddf;--ink2:#ccd8c4;--muted:#a5b39e;--line2:#456047;--accent:#c0d8ad;--on-accent:#18271f;--orange:#ec9672}
body{margin:0;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink)}
.ge{max-width:560px;margin:64px auto;padding:0 16px;text-align:center}
.ge h1{font-size:30px;line-height:1.2;letter-spacing:-.02em;margin:0 0 12px}
.ge-lead{font-size:16px;line-height:1.6;margin:0 0 22px;color:var(--ink2)}
.ge-acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:0}
.ge-btn{display:inline-flex;align-items:center;box-sizing:border-box;min-height:44px;padding:10px 16px;border-radius:8px;border:1px solid var(--line2);background:var(--surface);color:var(--accent);font:inherit;font-size:15px;text-decoration:none;cursor:pointer}
.ge-btn.pri{border-color:var(--accent);background:var(--accent);color:var(--on-accent);font-weight:600}
.ge :focus-visible{outline:3px solid var(--orange);outline-offset:4px}
.ge details{margin-top:28px;font-size:13px;color:var(--muted)}
.ge summary{cursor:pointer}
`;

/**
 * Last-resort boundary for a failure in the root layout itself, where the site
 * header, fonts and stylesheets are not available: a self-contained page with
 * the same message as app/error.tsx and no exception text.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The reader's saved theme (ThemeToggle); without it the system's scheme decides.
  useEffect(() => {
    try {
      const theme = localStorage.getItem("theme");
      if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
    } catch { /* storage unavailable: the system's scheme stays */ }
  }, []);
  return (
    <html lang="ro">
      <body>
        <style>{CSS}</style>
        <main className="ge">
          <div role="alert">
            <h1>Pagina nu <span style={{ whiteSpace: "nowrap" }}>s-a putut</span> încărca</h1>
            <p className="ge-lead">De obicei e trecător. Încearcă din nou.</p>
          </div>
          <p className="ge-acts">
            <button type="button" className="ge-btn pri" onClick={() => reset()}>
              Încearcă din nou
            </button>
            {/* A full navigation: the root layout must be rebuilt, not reused. */}
            <a href="/" className="ge-btn">
              Prima pagină
            </a>
          </p>
          {error.digest ? (
            <details>
              <summary>Detalii tehnice</summary>
              <p>Cod de referință: <code>{error.digest}</code></p>
            </details>
          ) : null}
        </main>
      </body>
    </html>
  );
}
