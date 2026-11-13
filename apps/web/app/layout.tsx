import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import "./fonts.css";
import "./globals.css";
import "./approved.css";
import "./guide.css";
import "@/components/ghost/ghost.css";
import "@/components/motion/chart-motion.css";
import "@/components/motion/page-transition.css";
import "@/components/themed-select/themed-select.css";
import ThemedSelect from "@/components/themed-select/ThemedSelect";
import TourGate from "@/components/tour/TourGate";
import { Suspense } from "react";
import { G } from "@/components/ghost/Ghost";
import { NavPending } from "@/components/ghost/client";
import ReportProblem from "@/components/feedback/ReportProblem";
import FooterAdminLinks from "./FooterAdminLinks";
import FooterAuthLink from "./FooterAuthLink";
import HeaderUserNav from "./HeaderUserNav";
import SiteNav from "./SiteNav";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import Reveal from "./Reveal";
import { CoverageSummary } from "@/components/DataCoverage";
import Term from "@/components/Term";
import { SITE_DESCRIPTION, SITE_NAME, pageTitle } from "@/lib/site";

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
        <header className="site-header" style={{ viewTransitionName: "site-header" }}>
          <div className="wrap">
            <Link href="/" className="brand" aria-label={SITE_NAME}>
              cine<em>câștigă</em><b>?</b>
            </Link>
            <SiteNav sessionHint={sessionHint} />
            <div className="hdr-right">
              <GlobalSearch />
              <ThemeToggle />
              <HeaderUserNav sessionHint={sessionHint} />
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
              <p className="d-footer-note">
                Sursă: e-licitatie.ro (SEAP/SICAP). Proiect deschis, necomercial. Valori înregistrate, nu plăți.
                Consorții: cote egale <Term id="consortiu" tip />
              </p>
            </div>
            <div>
              <h4>Date</h4>
              <p>SEAP / SICAP · TED · bilanțuri MF · registrul ONRC · hărți GADM și ANCPI / INS&nbsp;SIRUTA</p>
              <Suspense fallback={<div className="coverage-summary"><Link href="/metodologie#acoperire">Surse, acoperire și actualizare →</Link><span><G.Line inline w="16em" /></span></div>}>
                <CoverageSummary />
              </Suspense>
            </div>
            <div>
              <h4>Proiect</h4>
              <ul>
                {/* Ghid, Metodologie (the same page) and Hartă are in the header (owner, 13 November 2026). */}
                <li><Link href="/?tur=1" prefetch={false}>Turul de bun venit</Link></li>
                <li><Link href="/semnale">Semnale de risc</Link></li>
                <FooterAdminLinks />
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
        <ThemedSelect />
        <Suspense><TourGate sessionHint={sessionHint} /></Suspense>
        <Suspense><Reveal /></Suspense>
        <Suspense><NavPending /></Suspense>
      </body>
    </html>
  );
}
