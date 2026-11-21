import Link from "next/link";
import { G } from "@/components/ghost/Ghost";
import { tidyName } from "../../../lib/tidy-name";
import "./crumb.css";

export type Analysis = "Semnale" | "Radiografie" | "Legături" | "Comparații";

/**
 * The way back on an entity's analysis pages, one model on all of them (UX audit Z5-08, 16 November 2026):
 * „← Municipiul Cluj-Napoca · Radiografie”, the name a link to the profile, then the page (and, on a source page, what it
 * shows); at the row's right the sister analyses as small links, the current one marked. `?rol=` only for an entity
 * that both buys and sells.
 */
export default function EntityCrumb({ id, name, role, bothRoles = false, current, currentHref, sub, children }: {
  id: string; name: string; role: "authority" | "supplier"; bothRoles?: boolean | undefined;
  current: Analysis;
  /** On a source page, the analysis is itself a link back. */
  currentHref?: string | undefined;
  sub?: string | undefined;
  /** Anything the page keeps on the crumb's line (its role and county, a score). */
  children?: React.ReactNode;
}) {
  const rol = bothRoles ? `?rol=${role === "authority" ? "autoritate" : "furnizor"}` : "";
  const sisters: { label: Analysis; href: string }[] = [
    { label: "Semnale", href: `/entitati/${id}/semnale${rol}` },
    ...(role === "authority" ? [{ label: "Radiografie" as const, href: `/entitati/${id}/radiografie` }] : []),
    { label: "Legături", href: `/entitati/${id}/legaturi${rol}` },
    { label: "Comparații", href: `/entitati/${id}/comparatii${rol}` },
  ];
  return (
    <nav className="ent-crumb" aria-label="Locul în aplicație">
      <p className="ent-crumb-trail">
        <Link prefetch={false} href={`/entitati/${id}${rol}`} className="ent-crumb-name" title={tidyName(name)}>← {tidyName(name)}</Link>
        <span className="sep" aria-hidden="true">·</span>
        {currentHref ? <Link prefetch={false} href={currentHref}>{current}</Link> : <span aria-current="page">{current}</span>}
        {sub && <><span className="sep" aria-hidden="true">·</span><span aria-current="page">{sub}</span></>}
        {children}
      </p>
      {/* Esențial (owner, 18 November 2026): Radiografie, Legături and Comparații belong to Complet, and „Semnale” alone is
          no menu, so the row goes; on those pages (inside CompletOnly's data-whole) it stays. */}
      <p className="ent-crumb-sisters" data-only="complet">
        {sisters.map((s, i) => <span key={s.label}>{i > 0 && <span aria-hidden="true"> · </span>}
          {s.label === current && !sub ? <b aria-current="page">{s.label}</b> : <Link prefetch={false} href={s.href}>{s.label}</Link>}</span>)}
      </p>
    </nav>
  );
}

/** The crumb in a route's ghost: the name a line, the page's own words real. */
export function CrumbGhost({ current, sub, authority = true }: { current: Analysis; sub?: string; authority?: boolean }) {
  return (
    <div className="ent-crumb" aria-hidden="true">
      <p className="ent-crumb-trail"><span className="ent-crumb-name"><G.Line inline w="26ch" /></span><span className="sep">·</span><span>{current}</span>
        {sub && <><span className="sep">·</span><span>{sub}</span></>}</p>
      <p className="ent-crumb-sisters" data-only="complet">{["Semnale", ...(authority ? ["Radiografie"] : []), "Legături", "Comparații"].join(" · ")}</p>
    </div>
  );
}
