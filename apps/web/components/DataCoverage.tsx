import Link from "next/link";
import { coverageDate, getCoverage, type Dataset } from "@/lib/coverage";
import { formatInt } from "@/lib/format";

const LABELS: Record<Dataset, string> = { da: "Achiziții directe", contracts: "Contracte prin proceduri", ted: "Publicații TED" };
const COLLECTION_LABELS: Record<string, string> = {
  "elicitatie:das": "SEAP · achiziții directe", "elicitatie:awards": "SEAP · atribuiri",
  "ted:can-standard": "TED · eForms", "ted:fforms": "TED · formulare istorice",
};
const STATUS: Record<string, string> = { completed: "finalizată", failed: "eșuată", running: "în curs" };
const n = (value: string | undefined) => value === undefined ? "necunoscut" : formatInt(Number(value));

export async function CoverageSummary() {
  const coverage = await getCoverage();
  return <div className="coverage-summary">
    <Link href="/metodologie#acoperire">Surse, acoperire și actualizare ↗</Link>
    {coverage?.observations.length ? <span>Inventar recalculat la {coverageDate(coverage.observations[0]?.calculated_at)} · completitudinea surselor nu este confirmată</span> : <span>Inventarul datelor nu a fost încă recalculat.</span>}
  </div>;
}

export default async function DataCoverage() {
  const data = await getCoverage();
  if (!data?.observations.length) return <p className="note">Inventarul datelor nu a fost încă recalculat. Nu putem confirma perioada sau completitudinea surselor din acest instantaneu.</p>;
  const years = [...new Set(data.years.map(row => row.year))].sort((a, b) => b - a);
  return <div className="coverage-data">
    <p>Inventarul de mai jos descrie înregistrările disponibile în aplicație. Capetele intervalului arată cele mai vechi și cele mai recente date observate; ele nu confirmă că fiecare zi sau fiecare autoritate este acoperită.</p>
    <div className="coverage-grid">
      {data.observations.map(({ dataset, observation: o, calculated_at }) => <article key={dataset} className="coverage-source">
        <h3>{LABELS[dataset]}</h3>
        <p className="coverage-number">{n(o.available)} <span>{dataset === "ted" ? "publicații" : "înregistrări sursă"}</span></p>
        <dl>
          <div><dt>Interval observat</dt><dd>{coverageDate(o.date_from)} — {coverageDate(o.date_to)}</dd></div>
          {o.included !== undefined && <div><dt>{dataset === "da" ? "Incluse în totaluri" : "Contracte distincte incluse"}</dt><dd>{n(o.included)}</dd></div>}
          {o.allocations !== undefined && <div><dt>Rânduri contract–furnizor</dt><dd>{n(o.allocations)}</dd></div>}
          <div><dt>Fără dată</dt><dd>{n(o.missing_date)}</dd></div>
          <div><dt>{dataset === "contracts" ? "CPV necompletat în înregistrarea contractului" : "Fără CPV"}</dt><dd>{n(o.missing_cpv)}</dd></div>
          {o.missing_raw !== undefined && <div><dt>Fără document brut arhivat</dt><dd>{n(o.missing_raw)}</dd></div>}
          {o.missing_currency !== undefined && <div><dt>Înregistrări sursă fără monedă</dt><dd>{n(o.missing_currency)}</dd></div>}
          {o.results !== undefined && <div><dt>Rezultate de lot</dt><dd>{n(o.results)}</dd></div>}
          {o.unknown_competition !== undefined && <div><dt>Rezultate fără număr de oferte</dt><dd>{n(o.unknown_competition)}</dd></div>}
          {o.unverified !== undefined && <div><dt>Publicații cu interpretare de reverificat</dt><dd>{n(o.unverified)}</dd></div>}
        </dl>
        {dataset === "contracts" && <p className="note">Pentru căutări și gruparea pe domenii folosim CPV-ul anunțului de atribuire, când este disponibil.</p>}
        <p className="note">Inventar recalculat: {coverageDate(calculated_at)}</p>
      </article>)}
    </div>
    <details className="data-context">
      <summary>Verifică distribuția înregistrărilor pe ani</summary>
      <p>Număr de înregistrări sursă, înaintea excluderilor din totaluri. „—” înseamnă că nu avem înregistrări datate pentru acel an, nu că nu au existat achiziții.</p>
      <div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">An</th>{Object.values(LABELS).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {years.map(year => <tr key={year}><th scope="row">{year}</th>{(Object.keys(LABELS) as Dataset[]).map(src => <td key={src} className="num">{data.years.find(row => row.src === src && row.year === year)?.n ? n(data.years.find(row => row.src === src && row.year === year)!.n) : "—"}</td>)}</tr>)}
      </tbody></table></div>
    </details>
    <details className="data-context">
      <summary>Când au fost colectate și prelucrate datele?</summary>
      <p>O colectare reușită poate acoperi doar o fereastră sau un lot de autorități. Data ei nu dovedește că întregul istoric este complet sau că înregistrările au ajuns deja în totalurile afișate.</p>
      {data.collections.length ? data.collections.map(c => <div className="coverage-run" key={c.source}>
        <h4>{COLLECTION_LABELS[c.source] ?? c.source}</h4>
        <p>Ultima colectare reușită: <strong>{coverageDate(c.last_success)}</strong>. Cea mai recentă încercare: {coverageDate(c.latest_started)}, {STATUS[c.latest_status] ?? "stare necunoscută"}.</p>
        <p className="note">Fereastra ultimei încercări: {coverageDate(c.window_from)} — {coverageDate(c.window_to)}. Înregistrări preluate: {formatInt(c.fetched)}; raportate de sursă: {c.reported === null ? "necunoscut" : formatInt(c.reported)}. {c.deviation === null ? "Diferența nu a putut fi verificată." : `Diferență raportate − preluate: ${formatInt(c.deviation)}.`}</p>
      </div>) : <p>Nu există un jurnal de colectare pentru sursele din acest instantaneu.</p>}
      {data.normalized.length > 0 && <details><summary>Jurnalul prelucrării surselor</summary><ul>{data.normalized.map(row => <li key={row.transform}>{row.transform}: {coverageDate(row.updated_at)}</li>)}</ul></details>}
    </details>
    <p className="note">Bilanțurile MF oferă context pe anul raportării. Datele ONRC descriu reprezentanții din registrul importat, fără a reconstrui istoricul conducerii. Un câmp necunoscut rămâne necunoscut; nu este tratat ca zero sau ca absență a unui risc.</p>
  </div>;
}
