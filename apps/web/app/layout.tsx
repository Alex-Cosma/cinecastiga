import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import "./fonts.css";
import "./globals.css";
import "./approved.css";
import "./guide.css";
import ReportProblem from "@/components/feedback/ReportProblem";
import FooterAuthLink from "./FooterAuthLink";
import HeaderUserNav from "./HeaderUserNav";
import SiteNav from "./SiteNav";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import Reveal from "./Reveal";
import { CoverageSummary } from "@/components/DataCoverage";
import { SITE_DESCRIPTION, SITE_NAME, pageTitle } from "@/lib/site";
import { publishedStories } from "@/lib/stories/published";
import { GUIDE_HREF, GUIDE_LABEL } from "@/lib/site-nav";

// Coverage and account state are runtime data; builds have no database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: pageTitle(), template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  icons: { icon: "/icon.svg" },
};

// Stamp the saved theme before first paint so there is no flash; "system"
// leaves the attribute off and lets prefers-color-scheme decide.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Only whether a session cookie was sent: no lookup, no identity, no token
  // reaches the client. The navigation confirms the session after hydration.
  const sessionHint = getSessionCookie(await headers()) !== null;
  return (
    <html lang="ro" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <a className="d-skip-link" href="#main-content">Mergi la conținut</a>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label={SITE_NAME}>
              cine<em>câștigă</em><b>?</b>
            </Link>
            <SiteNav storiesPublished={publishedStories.length > 0} sessionHint={sessionHint} />
            <div className="hdr-right">
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
              <p className="d-footer-motto">Date publice. Surse la vedere. Curiozitatea e suficientă.</p>
              <p>
                Sursă: e-licitatie.ro (SEAP / SICAP), date publice. Cifrele reprezintă valori înregistrate, nu neapărat plăți
                efectuate. Atribuirea către consorții este estimată (împărțire egală în lipsa datelor pe membru). Proiect
                deschis, necomercial.
              </p>
            </div>
            <div>
              <h4>Date</h4>
              <p>SEAP / SICAP · TED · bilanțuri MF · registrul ONRC · hartă&nbsp;GADM</p>
              <CoverageSummary />
            </div>
            <div>
              <h4>Proiect</h4>
              <ul>
                <li><Link href={GUIDE_HREF}>{GUIDE_LABEL}</Link></li>
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
        <ReportProblem />
        <Reveal />
      </body>
    </html>
  );
}
