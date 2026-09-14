import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./approved.css";
import FooterAuthLink from "./FooterAuthLink";
import HeaderUserNav from "./HeaderUserNav";
import SiteNav from "./SiteNav";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import Reveal from "./Reveal";
import { DATA_AS_OF, DATA_MODE, SITE_DESCRIPTION, SITE_NAME, formatAsOf, pageTitle } from "@/lib/site";

const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], weight: ["500", "700", "800"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: pageTitle(), template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  icons: { icon: "/icon.svg" },
};

// Stamp the saved theme before first paint so there is no flash; "system"
// leaves the attribute off and lets prefers-color-scheme decide.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <a className="d-skip-link" href="#main-content">Mergi la conținut</a>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label={SITE_NAME}>
              cine<em>câștigă</em><b>?</b>
            </Link>
            <SiteNav />
            <div className="hdr-right">
              <Link href="/metodologie" className="d-method-link">Cum funcționează</Link>
              <GlobalSearch />
              <ThemeToggle />
              <HeaderUserNav />
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="wrap">
            <div>
              <h4 className="d-footer-brand">{SITE_NAME}</h4>
              <p>
                Sursă: e-licitatie.ro (SEAP / SICAP), date publice. Cifrele reprezintă valori înregistrate, nu neapărat plăți
                efectuate. Atribuirea către consorții este estimată (împărțire egală în lipsa datelor pe membru). Proiect
                deschis, necomercial.
              </p>
            </div>
            <div>
              <h4>Date</h4>
              <ul>
                <li>achiziții directe 2018–2026</li>
                <li>contracte &amp; atribuiri 2018–2026</li>
                <li>TED (supra-prag) 2018–2026</li>
                <li>bilanțuri MF 2018–2025 · ONRC</li>
                <li>{DATA_MODE === "live" ? "colectare zilnică" : "colectarea live e în reluare"} · date până la {formatAsOf(DATA_AS_OF)}</li>
              </ul>
            </div>
            <div>
              <h4>Proiect</h4>
              <ul>
                <li>
                  <Link href="/metodologie">Metodologie</Link>
                </li>
                <li><Link href="/semnale">Semnale de risc</Link></li>
                <li><Link href="/harta">Harta achizițiilor</Link></li>
                <li>
                  <Link href="/metodologie#citare">Cum citez</Link>
                </li>
                <li>
                  <FooterAuthLink />
                </li>
              </ul>
            </div>
          </div>
        </footer>
        <Reveal />
      </body>
    </html>
  );
}
