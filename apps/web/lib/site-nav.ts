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
  /** At least one editorial story is public. */
  storiesPublished: boolean;
  /** Viewer is a confirmed admin (client session). */
  admin: boolean;
  /** Viewer is signed in, or the request carried a session cookie before the client confirmed it. */
  signedIn: boolean;
}

/**
 * "Descoperă" is the home page and everything a reader browses from it: the
 * results page (its breadcrumb reads „Descoperă / Caută”), the perspectives
 * linked from the home page and the record pages they lead to. Only the
 * question builder itself is "Întreabă".
 */
const DISCOVER_PREFIXES = ["/cauta", "/semnale", "/harta", "/domenii", "/supra-prag", "/entitati", "/contracte", "/achizitii", "/anunturi"];
/** The guide and the full methodology are one place: how to read the data. */
const GUIDE_PREFIXES = ["/ghid", "/metodologie"];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export const GUIDE_HREF = "/ghid";
/** The guide has one name everywhere it is linked (navigation, footer). */
export const GUIDE_LABEL = "Ghid";

export function navItems({ pathname, storiesPublished, admin, signedIn }: NavContext): NavItem[] {
  const path = pathname || "/";
  const items: (NavItem | null)[] = [
    { href: "/", label: "Descoperă", active: path === "/" || DISCOVER_PREFIXES.some(prefix => under(path, prefix)) },
    { href: "/intreaba", label: "Întreabă", active: under(path, "/intreaba") },
    // Until a story is published, "Ce bate la ochi" is listed only for admins.
    // The pages enforce the same rule on the server; this only hides the link.
    storiesPublished || admin ? { href: "/ce-bate-la-ochi", label: "Ce bate la ochi", active: under(path, "/ce-bate-la-ochi") } : null,
    // Investigations are private and invitation-only: an anonymous visitor
    // would only reach a login wall, so the item (and its dot) is hidden.
    signedIn ? { href: "/anchete", label: "Anchete", dot: true, active: under(path, "/anchete") || under(path, "/urmariri") } : null,
    { href: GUIDE_HREF, label: GUIDE_LABEL, active: GUIDE_PREFIXES.some(prefix => under(path, prefix)) },
  ];
  return items.filter((item): item is NavItem => item !== null);
}
