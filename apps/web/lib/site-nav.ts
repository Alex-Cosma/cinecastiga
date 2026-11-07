/**
 * Main navigation items and their active state, kept free of React so the
 * rules can be unit tested. SiteNav renders exactly what this returns.
 */
export interface NavItem {
  href: string;
  label: string;
  /** The red dot marks the private investigations workspace. */
  dot?: boolean;
  active: boolean;
}

export interface NavContext {
  pathname: string;
  /** Viewer is signed in, or the request carried a session cookie before the client confirmed it. */
  signedIn: boolean;
}

/**
 * "Descoperă" is the home page and everything a reader browses from it: the
 * results page (its breadcrumb reads „Descoperă / Caută”), the perspectives
 * linked from the home page and the record pages they lead to. Only the
 * question builder itself is "Întreabă".
 */
const DISCOVER_PREFIXES = ["/cauta", "/semnale", "/domenii", "/supra-prag", "/entitati", "/contracte", "/achizitii", "/anunturi"];
/** The guide is the methodology page (its "Pe scurt" lane) since 5 November 2026; /ghid redirects there. */
const GUIDE_PREFIXES = ["/metodologie"];
/** The private space's three tabs (components/private/PrivateTrail.tsx). */
const PRIVATE_PREFIXES = ["/anchete", "/urmariri", "/cont"];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export const GUIDE_HREF = "/metodologie";
/** The guide has one name everywhere it is linked (navigation, footer). */
export const GUIDE_LABEL = "Ghid";

export function navItems({ pathname, signedIn }: NavContext): NavItem[] {
  const path = pathname || "/";
  const items: (NavItem | null)[] = [
    { href: "/", label: "Descoperă", active: path === "/" || DISCOVER_PREFIXES.some(prefix => under(path, prefix)) },
    { href: "/intreaba", label: "Întreabă", active: under(path, "/intreaba") },
    // The map of the value contracted per inhabitant (owner, 6 November 2026): it took the place of the stories.
    { href: "/harta", label: "Hartă", active: under(path, "/harta") },
    // Investigations are private and invitation-only: an anonymous visitor
    // would only reach a login wall, so the item (and its dot) is hidden. It is
    // the private space: its tabs are the investigations, the follows and the
    // account (owner, 7 November 2026).
    signedIn ? { href: "/anchete", label: "Anchete", dot: true, active: PRIVATE_PREFIXES.some(prefix => under(path, prefix)) } : null,
    { href: GUIDE_HREF, label: GUIDE_LABEL, active: GUIDE_PREFIXES.some(prefix => under(path, prefix)) },
  ];
  return items.filter((item): item is NavItem => item !== null);
}
