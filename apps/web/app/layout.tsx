import type { Metadata } from "next";
import Link from "next/link";
import SearchBox from "./SearchBox";
import "./globals.css";

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
            <nav className="nav">
              <Link href="/">Acasă</Link>
              <Link href="/domenii">Domenii</Link>
              <Link href="/harta">Hartă</Link>
            </nav>
            <SearchBox />
          </div>
        </header>
        <div className="snapshot-banner">
          <div className="wrap">
            Date istorice — instantaneu SICAP 2020 (set de validare). Datele live vor
            înlocui acest instantaneu după reluarea colectării.
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
            necomercial.
          </div>
        </footer>
      </body>
    </html>
  );
}
