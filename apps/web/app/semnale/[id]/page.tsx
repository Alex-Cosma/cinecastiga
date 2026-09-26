import Link from "next/link";
import { notFound } from "next/navigation";
import { getSignalSources } from "@/lib/signal-sources";
import { FLAG_META } from "@/lib/flags";
import { daUrl } from "@/lib/elicitatie";
import { coverageDate } from "@/lib/coverage";
import { formatInt, formatExactDecimal } from "@/lib/format";
import { createDb } from "@seap/db";
import { readSignalEvidence } from "@/lib/signal-evidence";
import SourceEvidenceView from "@/components/SourceEvidenceView";
import ClipButton from "@/components/ClipButton";

export const dynamic = "force-dynamic";
// Keep every source decimal; display formatting must not round the evidence.
const exact = (value: string | null) => value === null ? "necunoscută" : formatExactDecimal(value);

export default async function SignalSourcesPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }>;
}) {
  const [{ id }, { p }] = await Promise.all([params, searchParams]);
  const finding = await getSignalSources(id, Number(p ?? 0));
  if (!finding) notFound();
  const meta = FLAG_META[finding.code];
  const evidence = finding.evidence;
  const purchaseType = evidence.type === "da_ceiling_works" ? "lucrări" : evidence.type === "da_ceiling_goods_services" ? "produse / servicii" : "necunoscut";
  const recordedCount = Number(evidence.count ?? 0);
  const recordedTotal = finding.recordedTotalExact;
  if (!["da_split", "award_single_bid"].includes(finding.code)) {
    const { sql } = createDb();
    const source = await sql.begin("isolation level repeatable read read only", async tx => {
      await tx`set local statement_timeout = '30s'`;
      return readSignalEvidence(tx as unknown as typeof sql, id);
    }).finally(() => sql.end());
    if (!source) notFound();
    return <><Link href={`/semnale?tip=${encodeURIComponent(finding.code)}`} className="back">← Înapoi la semnale</Link>
      <h1 className="page-title">Sursele semnalului</h1>
      <SourceEvidenceView evidence={source} href={`/semnale/${id}`} page={Number(p ?? 0)} kind="signal" refId={id} />
      <Link href={`/metodologie#${finding.code}`}>Criterii și limitele semnalului →</Link></>;
  }
  return <>
    <Link href={`/semnale?tip=${encodeURIComponent(finding.code)}`} className="back">← Înapoi la semnale</Link>
    <h1 className="page-title">Sursele semnalului</h1>
    <p className="page-sub">{meta?.title ?? finding.code}{finding.period && finding.period !== "all" ? ` · ${finding.period}` : ""}</p>
    <p>Metodologie: {finding.methodology}. Acesta este un semnal calculat din date, care trebuie verificat în documentele sursă.</p>
    <ClipButton kind="signal" refId={id} label={meta?.title ?? finding.code} />
    <p><a href={`/api/evidence/sources?kind=signal&id=${id}`} download>Descarcă înregistrările disponibile · CSV ↓</a></p>
    {finding.sourceIds.length > 0 && <section className="section">
      <h2>Achizițiile care au declanșat acest semnal</h2>
      <p><strong>{formatInt(finding.sourceIds.length)} achiziții identificate în calcul</strong> · CPV {String(evidence.cpv_class ?? "necunoscut")} · tip: {purchaseType}.</p>
      <p>Semnalul înregistrează {formatInt(recordedCount)} achiziții, în valoare de <strong>{exact(recordedTotal)} lei</strong>.
        Înregistrările sursă disponibile acum: {formatInt(finding.found)}, total <strong>{exact(finding.totalExact)} lei</strong>.</p>
      {!finding.reconciled && <p className="note">Lista actuală nu reconciliază numărul sau totalul înregistrat în semnal. Pot exista corecții ale sursei sau o recalculare incompletă; comparați documentele înainte de a cita rezultatul.</p>}
      <p className="note">Plafon de referință: {exact(finding.ceilingExact)} lei, fără TVA.
        Publicarea aproximează data inițierii; în lipsa ei, calculul folosește finalizarea. Pragul fiecărei achiziții și tipul sunt cele aplicabile la acea dată.
        {` Data finalizării a fost folosită pentru ${Number(evidence.date_fallback_count ?? 0)} achiziții; clasificarea CPV a înlocuit tipul lipsă pentru ${Number(evidence.type_inferred_count ?? 0)}.`}</p>
      <div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">Achiziție / sursă</th><th scope="col">Finalizare</th><th scope="col">CPV</th><th scope="col" className="num">Valoare înregistrată · lei</th></tr></thead><tbody>
        {finding.records.map(row => <tr key={row.id}><td><a href={daUrl(row.id)} target="_blank" rel="noreferrer">{row.code ?? `SEAP ${row.id}`} ↗</a>{!row.available && <div className="note">Înregistrare indisponibilă în datele curente</div>}</td><td>{coverageDate(row.date)}</td><td>{row.cpv ?? "necunoscut"}</td><td className="num">{exact(row.value)}</td></tr>)}
      </tbody></table></div>
      <p className="note">Pagina {finding.page + 1} din {Math.max(1, Math.ceil(finding.sourceIds.length / 50))} · maximum 50 de înregistrări pe pagină.</p>
      <nav className="pager" aria-label="Paginarea surselor">{finding.page > 0 && <Link href={`/semnale/${id}?p=${finding.page - 1}`}>← Anterioara</Link>}{(finding.page + 1) * 50 < finding.sourceIds.length && <Link href={`/semnale/${id}?p=${finding.page + 1}`}>Următoarea →</Link>}</nav>
    </section>}
    {finding.contracts.length > 0 && <section className="section">
      <h2>Contractele și loturile folosite în semnal</h2>
      {!finding.contractMembershipValid && <p className="note">Lista înregistrată conține referințe incomplete sau nevalide. Sursele de mai jos reprezintă numai partea care poate fi verificată.</p>}
      <p>Calculul a identificat o singură ofertă la aceste contracte și loturi. Nu presupune că toate loturile anunțului au avut o singură ofertă.</p>
      <div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">Contract SEAP</th><th scope="col">Lot și publicație TED</th><th scope="col">Oferte raportate</th><th scope="col" className="num">Valoare contract</th></tr></thead><tbody>
        {finding.contracts.map(row => <tr key={row.id}><td><Link href={`/contracte/${row.id}`}>Contract {row.id} →</Link>{(!row.available || !row.linked || row.tenders !== 1) && <div className="note">Datele sau asocierea s-au schimbat; semnalul necesită recalculare.</div>}</td><td>{row.tedPublication ? <a href={`https://ted.europa.eu/ro/notice/-/detail/${row.tedPublication}`} target="_blank" rel="noreferrer">{row.tedPublication} · {row.lot} ↗</a> : "Asociere indisponibilă"}</td><td>{row.tenders ?? "necunoscut"}</td><td className="num">{exact(row.value)} {row.currency ?? "monedă nespecificată"}</td></tr>)}
      </tbody></table></div>
    </section>}
    {!finding.sourceIds.length && !finding.contracts.length && <p className="note">Această versiune a semnalului nu conține o listă exactă de surse. Este necesară recalcularea lui; o listă mai largă de achiziții nu ar verifica același rezultat.</p>}
    <p className="note">Semnalele sunt recalculate când se actualizează datele. Lista arată sursele calculului curent și poate deveni indisponibilă după o reconstrucție.</p>
    <Link href={`/metodologie#${finding.code}`}>Criterii și limitele semnalului →</Link>
  </>;
}
