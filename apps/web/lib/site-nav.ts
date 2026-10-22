/**
 * Main navigation items and their active state, kept free of React so the
 * rules can be unit tested. SiteNav renders exactly what this returns.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Extra class; "d-nav-guide" is shown only where the header's guide link is hidden. */
  className?: string;
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

const ASK_PREFIXES = ["/intreaba", "/cauta", "/entitati", "/achizitii", "/contracte", "/anunturi", "/semnale", "/harta", "/domenii", "/supra-prag"];
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export const GUIDE_HREF = "/ghid";

export function navItems({ pathname, storiesPublished, admin, signedIn }: NavContext): NavItem[] {
  const path = pathname || "/";
  const items: (NavItem | null)[] = [
    { href: "/", label: "Descoperă", active: path === "/" },
    { href: "/intreaba", label: "Întreabă", active: ASK_PREFIXES.some(prefix => path.startsWith(prefix)) },
    // Until a story is published, "Ce bate la ochi" is listed only for admins.
    // The pages enforce the same rule on the server; this only hides the link.
    storiesPublished || admin ? { href: "/ce-bate-la-ochi", label: "Ce bate la ochi", active: under(path, "/ce-bate-la-ochi") } : null,
    // Investigations are private and invitation-only: an anonymous visitor
    // would only reach a login wall, so the item (and its dot) is hidden.
    signedIn ? { href: "/anchete", label: "Anchete", dot: true, active: path.startsWith("/anchete") || path.startsWith("/urmariri") } : null,
    { href: GUIDE_HREF, label: "Ghid", className: "d-nav-guide", active: under(path, GUIDE_HREF) },
  ];
  return items.filter((item): item is NavItem => item !== null);
}
