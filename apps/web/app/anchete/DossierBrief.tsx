import Link from "next/link";
import type { Dosar } from "@/lib/anchete";
import type { WorkspaceEntry } from "@/lib/investigation-workspace";
import { cleanName, formatExactDecimal, formatInt } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { privatePeriod } from "@/lib/private-format";
import { clipTitle } from "@/lib/evidence-clip";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";

/** The drift keys of lib/anchete in words. */
const driftWords: Record<string, string> = { valueRon: "valoarea", nContracts: "numărul de contracte", nFirms: "firmele", riscul: "riscul", tiparele: "tiparele",
  "total (authority)": "totalul ca instituție", "total (supplier)": "totalul ca furnizor", "obiectul nu mai există": "nu mai există în date" };

/**
 * "Pe scurt" under the dossier's title (owner, 7 November 2026): what the saved items hold, exactly and tersely — the
 * distinct records and their exact total, who the actors are, the period, the checks still open, and how many saved
 * items read differently in today's data (a count; the cards themselves do not carry a "changed" line).
 */
export default function DossierBrief({ id, dosar, entries }: { id: string; dosar: Dosar; entries: WorkspaceEntry[] }) {
  const { records, cast, clips } = dosar;
  const open = entries.filter(e => e.kind === "task" && e.status !== "done").length;
  const changed = clips.filter(c => c.drift?.length);
  const period = privatePeriod(records.dateFrom, records.dateTo);
  const nameOf = (ref: string) => { const m = cast.members.find(x => x.refId === ref); const name = cleanName(m?.name ?? ref);
    return m?.kind === "entity" ? <EntityName id={ref}>{name}</EntityName> : <strong>{name}</strong>; };
  const actors = cast.members;
  return <section className="iw-brief" aria-labelledby="pe-scurt">
    <h2 id="pe-scurt" className="iw-brief-title">Pe scurt</h2>
    <dl className="iw-brief-facts">
      <div><dt>Înregistrări păstrate <Term tip title="Înregistrări păstrate" text="Fiecare achiziție directă sau cotă a unui furnizor dintr-un contract, o singură dată, chiar dacă apare în mai multe dovezi; din ultima versiune păstrată a fiecăreia. Valori înregistrate, nu plăți." /></dt>
        <dd>{records.capped ? <>{countWords(records.savedRows, "înregistrare salvată", "înregistrări salvate")}<small>prea multe pentru un total fără repetări aici; fiecare dovadă își are totalul</small></> : records.count ? <>{countWords(records.count, "înregistrare", "înregistrări")}{records.totalExact !== null && <> · <strong>{formatExactDecimal(records.totalExact)} lei</strong></>}{records.unknownValues > 0 && <small>{countWords(records.unknownValues, "fără valoare publicată", "fără valoare publicată")}</small>}</> : "Niciuna încă"}</dd></div>
      <div><dt>Perioada</dt><dd>{period ?? "Fără date"}</dd></div>
      <div><dt>De verificat</dt><dd>{open ? <Link href={`/anchete/${id}?sectiune=tasks`}>{countWords(open, "verificare deschisă", "verificări deschise")}</Link> : "Nimic deschis"}</dd></div>
      <div><dt>Diferă azi <Term tip title="Diferă azi" text={changed.length ? `Datele de azi diferă de salvare la: ${changed.map(c => `${clipTitle(c)} (${(c.drift ?? []).map(d => driftWords[d] ?? d).join(", ")})`).join("; ")}. Versiunile păstrate rămân neschimbate.` : "Comparăm valorile salvate ale contractelor, anunțurilor și entităților cu datele de azi. Versiunile păstrate rămân neschimbate."} /></dt>
        <dd>{changed.length ? `${formatInt(changed.length)} din ${countWords(clips.filter(c => ["entity", "contract", "notice", "person"].includes(c.kind)).length, "dovadă", "dovezi")}` : "Nicio diferență"}</dd></div>
      {actors.length > 0 && <div className="iw-brief-actors"><dt>Actori</dt><dd><ul>{actors.map(m => <li key={`${m.kind}-${m.refId}`}>{m.kind === "entity" ? <EntityName id={m.refId}>{cleanName(m.name)}</EntityName> : <span>{cleanName(m.name)}</span>}</li>)}</ul>
        {cast.relations.length > 0 ? <details className="iw-brief-relations"><summary>{countWords(cast.relations.length, "legătură în date", "legături în date")}</summary><ul>{cast.relations.map((r, i) => <li key={i}>{nameOf(r.a)} și {nameOf(r.b)}: {r.label}{r.valueExact !== undefined ? ` · ${formatExactDecimal(r.valueExact)} lei în ${countWords(r.count ?? 0, "înregistrare", "înregistrări")}` : ""}</li>)}</ul>
          <p className="iw-muted">Din datele de azi. O relație comercială sau un administrator comun nu dovedește o neregulă.</p></details>
          : actors.length > 1 && <p className="iw-muted">Nicio legătură directă în date între actorii salvați.</p>}</dd></div>}
    </dl>
  </section>;
}
