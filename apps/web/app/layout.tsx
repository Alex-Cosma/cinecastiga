import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import FooterAuthLink from "./FooterAuthLink";
import HeaderUserNav from "./HeaderUserNav";

// Header nav + search box are parked in app/_legacy/HeaderNav.tsx while the
// home page is search-only.

export const metadata: Metadata = {
  title: "SEAP Transparent — achiziții publice deschise",
  description:
    "O vedere critică asupra achizițiilor publice din România (e-licitatie.ro / SICAP): statistici, clasamente și profiluri de entități.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              SEAP <span>Transparent</span>
            </Link>
            <HeaderUserNav />
          </div>
        </header>
        <div className="coverage-line">
          <div className="wrap">
            <span className="dot" /> Date: achiziții directe 2018–2026 · contracte &amp; atribuiri
            2018–2026 · TED (supra-prag) 2018–2026 · colectarea live e în reluare
          </div>
        </div>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="wrap">
            Sursă: e-licitatie.ro (SICAP), date publice. Cifrele reprezintă valori
            contractate, nu neapărat plăți efectuate. Atribuirea către consorții este
            estimată (împărțire egală în lipsa datelor pe membru). Proiect deschis,
            necomercial. · <FooterAuthLink />
          </div>
        </footer>
      </body>
    </html>
  );
}
