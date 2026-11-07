import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { cleanName, countyLabel, formatExactDecimal, formatInt } from "@/lib/format";
import type { FirmCardData } from "@/lib/signal-page";
import { Facts, RecordSection } from "./Record";

/*
 * A firm's own registers beside a signal about it (owner, 7 November 2026): its balance sheets at the Ministry of Finance
 * (average employees and net turnover, year by year, the signal's years marked) and its legal representatives in the
 * Trade Register (ONRC). Each figure says where and which year it comes from; a missing one is said, never zero.
 */

const YEARS_SHOWN = 8;

export default function FirmCard({ firm, years = [], title = "Firma" }: { firm: FirmCardData; years?: readonly number[]; title?: string }) {
  const sheets = firm.financials.slice(-YEARS_SHOWN);
  const marked = new Set(years);
  const reps = firm.reps;
  return <RecordSection id="firma" title={title}>
    <Facts facts={[
      { label: "Numele", value: <><EntityName id={firm.id} role="supplier">{cleanName(firm.name)}</EntityName>{(firm.cui || firm.county) && <small>{[firm.cui && `CUI ${firm.cui}`, countyLabel(firm.county)].filter(Boolean).join(" · ")}</small>}</> },
      { label: <Term tip id="conducere-onrc">Conducere (ONRC)</Term>, value: reps.length
        ? <ul className="record-reps">{reps.slice(0, 6).map((r, i) => <li key={`${r.personName}:${i}`}>{cleanName(r.personName)}{r.calitate && <span className="record-quiet"> · {r.calitate.toLowerCase()}</span>}</li>)}
          {reps.length > 6 && <li className="record-quiet">și încă {formatInt(reps.length - 6)}, pe pagina firmei</li>}</ul>
        : <span className="record-quiet">{firm.cui ? "Nicio persoană în registrul disponibil" : "CUI neconfirmat: fără date ONRC"}</span> },
    ]} />
    {sheets.length > 0
      ? <table className="record-years">
        <caption>Bilanțurile depuse la Ministerul Finanțelor{marked.size > 1 ? "; îngroșat, anii semnalului" : marked.size ? "; îngroșat, anul semnalului" : ""}. Cifra de afaceri nu e venitul din contracte publice.</caption>
        <thead><tr><th scope="col">Anul</th><th scope="col" className="record-num">Angajați, în medie</th><th scope="col" className="record-num">Cifra de afaceri · lei</th></tr></thead>
        <tbody>{sheets.map((s) => <tr key={s.year} className={marked.has(s.year) ? "on" : undefined}>
          <td>{s.year}</td>
          <td className="record-num" data-label="Angajați, în medie">{s.employees == null ? "nepublicat" : formatInt(s.employees)}</td>
          <td className="record-num" data-label="Cifra de afaceri · lei">{s.turnover == null ? "nepublicată" : formatExactDecimal(s.turnover)}</td>
        </tr>)}</tbody>
      </table>
      : <p className="record-missing">{firm.cui ? "Niciun bilanț MF pentru această firmă în datele disponibile." : "Fără bilanț MF: CUI-ul firmei nu e confirmat în registru."}</p>}
  </RecordSection>;
}
