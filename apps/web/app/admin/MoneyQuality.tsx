import Link from 'next/link';
import type { MoneyQuality as Report } from '@seap/db';

const number = (v: number) => new Intl.NumberFormat('ro-RO').format(v);
const labels: Record<string, string> = {
  ron: 'Valoare în lei verificată în sursă', converted: 'Conversie în lei verificată',
  legacy_ron: 'Istoric declarat în lei, nereverificat în arhivă', legacy_unknown: 'Istoric cu unitate neverificată',
  missing_value: 'Lipsește valoarea originală', missing_currency: 'Lipsește moneda',
  missing_conversion: 'Conversie incompletă', inconsistent: 'Sume sau monede neconcordante',
  source_mismatch: 'Valoarea normalizată nu corespunde arhivei',
  invalid: 'Valoare nevalidă', stale: 'Sursa s-a schimbat; necesită reverificare',
};
export default function MoneyQuality({ report }: { report: Report | null }) {
  if (!report) return <details className="processing-decisions"><summary>Valori și monede</summary><p>Inventarul va fi disponibil după prima procesare cu verificarea monedelor. Lipsa raportului nu înseamnă că datele sunt verificate.</p></details>;
  const excluded = report.counts.filter(r => !['ron', 'converted', 'legacy_ron'].includes(r.status)).reduce((n, r) => n + r.count, 0);
  const errors = report.structuralErrors + (report.sourceErrors ?? 0);
  return <details className="processing-decisions"><summary>Valori și monede · {number(excluded)} de clarificat{errors ? ' · publicare blocată' : ''}</summary>
    <p>Verificat la {new Date(report.checkedAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}. Sumele neclare sunt excluse din totalurile în lei. Istoricul declarat în RON rămâne separat de valorile confruntate cu arhiva.</p>
    {errors > 0 && <p role="alert">{number(report.structuralErrors)} erori de structură și {number(report.sourceErrors ?? 0)} neconcordanțe cu arhiva. Publicarea este blocată.</p>}
    <dl className="processing-stage-times">{report.counts.map(row => <div key={row.status}><dt>{labels[row.status] ?? row.status}</dt><dd>{number(row.count)}</dd></div>)}</dl>
    <p>{report.newIssues === null ? 'Primul inventar; nu există încă o comparație cu rularea anterioară.' : `${number(report.newIssues)} cazuri de clarificat din surse noi față de inventarul anterior.`}</p>
    {report.examples.length > 0 && <><h3>Exemple de verificat</h3><ol>{report.examples.map(row => <li key={row.id}><Link href={`/contracte/${row.id}`} target="_blank" rel="noopener noreferrer">{row.title || `Contract ${row.id}`} · {row.id}</Link><p>{labels[row.status] ?? row.status}</p></li>)}</ol></>}
  </details>;
}
