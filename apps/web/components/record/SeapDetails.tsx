import { Facts, type Fact } from "./Record";

/**
 * Facts kept for completeness (a version's date, codes, SEAP's ids), folded at the end of a record's section so the
 * facts that matter stand out (UX audit Z7-29). Nothing is dropped: one click shows them.
 */
export default function SeapDetails({ facts }: { facts: (Fact | null | false | undefined | "" | 0)[] }) {
  const shown = facts.filter((f): f is Fact => !!f);
  if (!shown.length) return null;
  return <details className="record-seap-details">
    <summary>Detalii din SEAP</summary>
    <Facts facts={shown} />
  </details>;
}
