import Link from "next/link";
import SearchBox from "../SearchBox";

/**
 * Legacy header nav + header search box, parked here while the home page is
 * search-only. Restore by rendering <HeaderNav /> next to the brand link in
 * app/layout.tsx.
 */
export function HeaderNav() {
  return (
    <>
      <nav className="nav">
        <Link href="/">Acasă</Link>
        <Link href="/cauta">Caută</Link>
        <Link href="/intreaba">Întreabă</Link>
        <Link href="/semnale">Semnale</Link>
        <Link href="/supra-prag">Publicate în TED</Link>
        <Link href="/domenii">Domenii</Link>
        <Link href="/harta">Hartă</Link>
      </nav>
      <SearchBox />
    </>
  );
}
