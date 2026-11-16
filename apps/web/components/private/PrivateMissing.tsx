import Link from "next/link";
import PrivateTrail, { type PrivateTab } from "./PrivateTrail";

/**
 * A private page whose dossier, sheet, watch or check does not exist or is not the reader's (audit Z8-22): said in the
 * private space, with its tabs and the way back to the list, status 404. The same words whether it never existed or
 * belongs to someone else, so the page does not tell which.
 */
export default function PrivateMissing({ tab, title, back, shell = true, hint = "Verifică adresa sau linkul primit. Dacă ți-a fost trimis de altcineva, cere-i să te invite din nou." }: { tab: PrivateTab; title: string; back: { href: string; label: string }; shell?: boolean; hint?: string }) {
  const body = <div className="private-missing">
    <h1>{title}</h1>
    <p>{hint}</p>
    <Link className="private-missing-back" href={back.href}>{back.label} →</Link>
  </div>;
  return shell ? <div className="private-shell"><PrivateTrail current={tab} />{body}</div> : body;
}
