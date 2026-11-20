import { evidenceLinks } from "./ask/evidence";
import { flagLabel } from "./flags";
import { cleanName } from "./format";
import { leiRounded } from "./lei";
import type { RecordRow } from "./record-rows";
import type { CaseRecord } from "./signal-case";

const lei = (v: string | number | null | undefined) => (v == null ? "necunoscută" : leiRounded(v) ?? "necunoscută");

/**
 * The side a case's rows name (UX audit Z6-07): the other party of each acquisition, when the list has more than one
 * (December's acquisitions, a firm's first month, a capacity year); a list with one partner names it in its title.
 */
export function caseCounterparty(records: readonly Pick<CaseRecord, "authorityId" | "authority" | "supplierId" | "supplier">[], role: "authority" | "supplier"): "authority" | "supplier" | undefined {
  const side = role === "authority" ? "supplier" : "authority";
  const keys = new Set(records.map((r) => (side === "supplier" ? r.supplierId ?? r.supplier : r.authorityId ?? r.authority) ?? ""));
  return keys.size > 1 ? side : undefined;
}

/**
 * A case's records as the record list's rows. `counterparty`: the side each row names (the set-aside acquisitions are
 * with other partners). `code`: the page's pattern, left out of each row's „și la …” list.
 */
export function caseRecordRows(records: readonly CaseRecord[], alsoIn: Record<string, string[]>, code: string,
  counterparty?: "authority" | "supplier"): RecordRow[] {
  return records.map((r, i) => {
    const links = evidenceLinks(r);
    const party = counterparty === "authority" ? { id: r.authorityId, name: r.authority } : counterparty === "supplier" ? { id: r.supplierId, name: r.supplier } : null;
    return {
      key: `${r.src}:${r.refId}:${i}`, code: r.daCode ?? r.refId ?? "", date: r.date ?? null,
      title: r.title ?? r.cpvName ?? (r.src === "contracts" ? "Contract" : "Achiziție directă"),
      href: `/${r.src === "contracts" ? "contracte" : "achizitii"}/${r.refId}`,
      value: r.originalValueExact === null ? null : Number(r.valueExact),
      valueText: r.originalValueExact === null ? "valoare nepublicată" : lei(r.valueExact),
      valueExact: r.originalValueExact === null || r.valueExact == null ? null : String(r.valueExact),
      seap: links.seap, ted: links.ted,
      also: (r.refId ? alsoIn[r.refId] ?? [] : []).filter((c) => c !== code).map((c) => flagLabel(c)),
      party: party && counterparty ? { id: party.id ?? null, name: cleanName(party.name) || "—", role: counterparty } : null,
    };
  });
}
