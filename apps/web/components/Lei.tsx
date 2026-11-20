import Term from "./Term";
import { leiExact, leiRounded } from "../lib/lei";

/**
 * A record's amount, or a sum of records, to the leu; the exact amount with bani on hover or tap, in the site's floating
 * explanation (Decision A, owner, 20 November 2026). A whole amount has nothing more to say and is plain text. Not inside
 * a link or a button (the explanation is a button): there, use `leiRounded` and the row's own link.
 */
export default function Lei({ value, empty = "—", unit = true, className }: {
  value: string | number | null | undefined; empty?: string; unit?: boolean | string; className?: string;
}) {
  const shown = leiRounded(value, unit);
  if (shown === null) return <>{empty}</>;
  const exact = leiExact(value, unit === false ? true : unit);
  if (!exact) return className ? <span className={className}>{shown}</span> : <>{shown}</>;
  return <Term tip hold="line" className={`lei-exact${className ? ` ${className}` : ""}`} title="Suma exactă" text={exact}>{shown}</Term>;
}
