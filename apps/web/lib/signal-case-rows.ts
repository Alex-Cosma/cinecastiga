import { evidenceLinks } from "./ask/evidence";
import { flagLabel } from "./flags";
import { cleanName, formatExactDecimal } from "./format";
import type { RecordRow } from "./record-rows";
import type { CaseRecord } from "./signal-case";

const lei = (v: string | number | null | undefined) => (v == null ? "necunoscută" : `${formatExactDecimal(String(v))} lei`);

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
      seap: links.seap, ted: links.ted,
      also: (r.refId ? alsoIn[r.refId] ?? [] : []).filter((c) => c !== code).map((c) => flagLabel(c)),
      party: party && counterparty ? { id: party.id ?? null, name: cleanName(party.name) || "—", role: counterparty } : null,
    };
  });
}
