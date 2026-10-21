import Link from "next/link";
import CollectionHistory from "./CollectionHistory";
import { coverageDate, getCoverage, type Dataset } from "@/lib/coverage";
import { formatExactDecimal, formatInt, formatRon } from "@/lib/format";
import {getProcessingFreshness} from '@/lib/processing-freshness';

const LABELS: Record<Dataset, string> = { da: "Achiziții directe", contracts: "Contracte prin proceduri", ted: "Publicații TED" };
const n = (value: string | undefined) => value === undefined ? "necunoscut" : formatInt(Number(value));

export async function CoverageSummary() {
  const coverage = await getCoverage();
  const excluded=coverage?.observations.find(o=>o.dataset==='contracts')?.observation.temporarily_excluded_groups;
  const freshness=await getProcessingFreshness();
  return <div className="coverage-summary">
    <Link href="/metodologie#acoperire">Surse, acoperire și actualizare ↗</Link>
    {coverage?.observations.length ? <span>Inventar recalculat la {coverageDate(coverage.observations[0]?.calculated_at)} · completitudinea surselor nu este confirmată</span> : <span>Inventarul datelor nu a fost încă recalculat.</span>}
    {excluded && Number(excluded)>0 && <Link href="/metodologie/excluderi">{n(excluded)} grupuri excluse temporar din totaluri · verifică sursele</Link>}
    {freshness?.riskAt&&<span>Semnale de risc recalculate la {coverageDate(freshness.riskAt)}.</span>}
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
          {o.implausible_date !== undefined && <div><dt>Dată sursă improbabilă (înainte de 2018), fără an atribuit</dt><dd>{n(o.implausible_date)}</dd></div>}
          {/* Contracts use the CPV of their award notice (audit F38); the contract record's own CPV field is never filled. */}
          {dataset === "contracts"
            ? o.missing_notice_cpv !== undefined && <div><dt>Fără CPV în anunțul de atribuire</dt><dd>{n(o.missing_notice_cpv)}</dd></div>
            : <div><dt>Fără CPV</dt><dd>{n(o.missing_cpv)}</dd></div>}
          {o.missing_raw !== undefined && <div><dt>Fără document brut arhivat</dt><dd>{n(o.missing_raw)}</dd></div>}
          {o.missing_currency !== undefined && <div><dt>Înregistrări sursă fără monedă</dt><dd>{n(o.missing_currency)}</dd></div>}
          {o.non_additive_amendments !== undefined && <div><dt>Publicații de acte adiționale, neadăugate în totaluri</dt><dd>{n(o.non_additive_amendments)}</dd></div>}
          {o.unverified_contract_type !== undefined && <div><dt>Tip de contract neclar, exclus din totaluri</dt><dd>{n(o.unverified_contract_type)}</dd></div>}
          {/* Audit F08: how much rests on the legacy title rule, in all and inside the totals.
              The sum covers only the rows with a verifiable value in lei; the others are counted apart. */}
          {o.title_classified !== undefined && <div><dt>Contracte fără tip SEAP arhivat, încadrate după titlu ca contract, subsecventă sau acord-cadru</dt><dd>{n(o.title_classified)}{o.title_classified_valued !== undefined && o.title_classified_value !== undefined && Number(o.title_classified_valued) > 0 ? ` · ${n(o.title_classified_valued)} cu sumă verificabilă în lei: ${formatExactDecimal(o.title_classified_value)} lei` : ""}{o.title_classified_without_ron_value !== undefined && Number(o.title_classified_without_ron_value) > 0 ? ` · ${n(o.title_classified_without_ron_value)} fără sumă verificabilă în lei` : ""}{o.title_classified_included !== undefined && Number(o.title_classified) > 0 ? ` · în totaluri: ${n(o.title_classified_included)}${o.title_classified_included_value !== undefined && Number(o.title_classified_included) > 0 ? ` · ${formatExactDecimal(o.title_classified_included_value)} lei` : ""}` : ""}</dd></div>}
          {o.framework_publications !== undefined && <div><dt>Publicații de plafoane, separate de totaluri</dt><dd>{n(o.framework_publications)}</dd></div>}
          {o.frameworks_without_identified_calloffs !== undefined && <div><dt>Publicații de plafoane fără comenzi identificate pentru același lot</dt><dd>{n(o.frameworks_without_identified_calloffs)}</dd></div>}
          {o.above_value_cap !== undefined && <div><dt>Contracte peste {o.value_cap ? formatRon(Number(o.value_cap)) : "1 mld. lei"}, altfel eligibile, separate de totaluri</dt><dd>{n(o.above_value_cap)}{o.above_value_cap_value !== undefined && Number(o.above_value_cap) > 0 ? ` · ${formatExactDecimal(o.above_value_cap_value)} lei` : ""}</dd></div>}
          {o.winner_is_authority !== undefined && <div><dt>Contracte în care singurul câștigător înregistrat este chiar autoritatea, fără furnizor cunoscut, separate de totaluri</dt><dd>{n(o.winner_is_authority)}{o.winner_is_authority_value !== undefined && Number(o.winner_is_authority) > 0 ? ` · ${formatExactDecimal(o.winner_is_authority_value)} lei` : ""}</dd></div>}
          {o.supplier_is_authority !== undefined && <div><dt>Achiziții directe în care furnizorul înregistrat este chiar autoritatea, incluse doar în totalul autorității</dt><dd>{n(o.supplier_is_authority)}{o.supplier_is_authority_value !== undefined && Number(o.supplier_is_authority) > 0 ? ` · ${formatExactDecimal(o.supplier_is_authority_value)} lei` : ""}</dd></div>}
          {o.temporarily_excluded_groups !== undefined && <div><dt><Link href="/metodologie/excluderi">Grupuri excluse temporar · motive și surse</Link></dt><dd>{n(o.temporarily_excluded_groups)}</dd></div>}
          {o.temporarily_excluded_financial_groups !== undefined && <div><dt>Dintre acestea, cu sume altfel eligibile</dt><dd>{n(o.temporarily_excluded_financial_groups)}</dd></div>}
          {o.temporarily_excluded_publications !== undefined && <div><dt>Înregistrări sursă din aceste grupuri</dt><dd>{n(o.temporarily_excluded_publications)}</dd></div>}
          {o.results !== undefined && <div><dt>Rezultate de lot</dt><dd>{n(o.results)}</dd></div>}
          {o.unknown_competition !== undefined && <div><dt>Rezultate fără număr de oferte</dt><dd>{n(o.unknown_competition)}</dd></div>}
          {o.unverified !== undefined && <div><dt>Publicații cu interpretare de reverificat</dt><dd>{n(o.unverified)}</dd></div>}
        </dl>
        {dataset === "contracts" && <p className="note">Pentru căutări, totaluri și gruparea pe domenii folosim CPV-ul anunțului de atribuire. Plafoanele nu sunt comenzi. Lipsa subsecventelor înseamnă acoperire incompletă, nu cheltuieli zero. Numărăm publicațiile sursă; categoriile de excludere se pot suprapune.</p>}
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
      <CollectionHistory collector={data.collector} collections={data.collections} />
      {data.normalized.length > 0 && <details><summary>Jurnalul prelucrării surselor</summary><ul>{data.normalized.map(row => <li key={row.transform}>{row.transform}: {coverageDate(row.updated_at)}</li>)}</ul></details>}
    </details>
    <p className="note">Bilanțurile MF oferă context pe anul raportării. Datele ONRC descriu reprezentanții din registrul importat, fără a reconstrui istoricul conducerii. Un câmp necunoscut rămâne necunoscut; nu este tratat ca zero sau ca absență a unui risc.</p>
  </div>;
}
