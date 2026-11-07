import Link from "next/link";
import "./private.css";

/**
 * The private space's own tabs (owner, 7 November 2026): the investigations, the follows and the account are three
 * tabs of one place, at one width (`.private-shell`). The current tab is a link too, so a nested page leads back to
 * its list.
 */
export type PrivateTab = "anchete" | "urmariri" | "cont";

const TABS: { id: PrivateTab; href: string; label: string }[] = [
  { id: "anchete", href: "/anchete", label: "Anchetele mele" },
  { id: "urmariri", href: "/urmariri", label: "Urmăriri" },
  { id: "cont", href: "/cont", label: "Contul meu" },
];

export default function PrivateTrail({ current }: { current: PrivateTab }) {
  return (
    <nav className="monitoring-trail private-trail" aria-label="Spațiu privat">
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>{tab.label}</Link>
      ))}
    </nav>
  );
}
