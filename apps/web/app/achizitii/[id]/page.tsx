import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcquisitionDetail } from "@/lib/acquisition-detail";
import { daUrl } from "@/lib/elicitatie";
import { formatExactDecimal, formatCalendarDate, cleanName } from "@/lib/format";
import ClipButton from "@/components/ClipButton";
import Term from "@/components/Term";
import "./detail.css";

export const dynamic = "force-dynamic";

export default async function Acquisition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getAcquisitionDetail(id);
  if (!d) notFound();
  const title = d.title ?? d.cpvName ?? d.code ?? "Achiziție directă";
  const amount = (value: string | null) => value == null ? "Valoare neprecizată" : `${formatExactDecimal(value)} lei`;

  return <article className="acquisition-detail">
    <nav className="ad-context" aria-label="Contextul achiziției">
      {d.authorityId && <><Link href={`/entitati/${d.authorityId}`}>{cleanName(d.authority)}</Link><span aria-hidden="true"> / </span></>}
      <span>Achiziție directă</span>
    </nav>
    <header className="profile-head ad-head">
      <div><h1 className="ad-tip">{title}{!d.title && d.cpvName && <> <Term tip id="titlu-cpv" /></>}</h1>
        {!d.title && !d.cpvName && <p className="ad-note">Titlul și denumirea categoriei nu sunt disponibile în arhivă.</p>}
        <p className="ad-identity"><strong>{d.code ?? `ID SEAP ${id}`}</strong><span>{d.state ?? "Stare neprecizată"}</span></p>
      </div>
      <div className="ad-actions">
        <a className="ad-source" href={daUrl(id)} target="_blank" rel="noopener noreferrer">Verifică în SEAP ↗</a>
        <ClipButton kind="da" refId={id} label={title} />
      </div>
    </header>
    <section className="ad-section" aria-labelledby="ad-data">
      <h2 id="ad-data">Datele achiziției</h2>
      <dl className="ad-facts">
        <div className="ad-tip"><dt><Term tip id="valoare-inregistrata">Valoare de închidere</Term></dt><dd>{amount(d.value)}</dd></div>
        <div><dt>Valoare estimată</dt><dd>{amount(d.estimate)}</dd></div>
        <div><dt>Publicată (ora României)</dt><dd>{formatCalendarDate(d.publishedAt, true)}</dd></div>
        <div><dt>Finalizată</dt><dd>{formatCalendarDate(d.finalizedAt, true)}</dd></div>
        <div><dt>Domeniu CPV</dt><dd>{d.cpvName ?? "Categorie neprecizată"}{d.cpvCode && <span className="ad-code">{d.cpvCode}</span>}</dd></div>
        <div><dt>Tipul achiziției</dt><dd>{d.acquisitionType ?? "Neprecizat în datele disponibile"}</dd></div>
      </dl>
    </section>
    <section className="ad-section" aria-labelledby="ad-parties">
      <h2 id="ad-parties">Instituție și furnizor</h2>
      <dl className="ad-facts">
        <div><dt>Instituție</dt><dd>{d.authorityId ? <Link href={`/entitati/${d.authorityId}`}>{cleanName(d.authority)}</Link> : d.authority ?? "Instituție neprecizată"}</dd></div>
        <div><dt>Furnizor</dt><dd>{d.supplierId ? <Link href={`/entitati/${d.supplierId}`}>{cleanName(d.supplier)}</Link> : d.supplier ?? "Furnizor neprecizat"}</dd></div>
      </dl>
      {d.supplierId && d.supplierId === d.authorityId && <p className="ad-note"><b>Furnizorul înregistrat este chiar instituția:</b> neconcordanță
        în sursă. Rămâne în totalul instituției, nu la furnizori. Verifică în SEAP · <Link href="/metodologie#totaluri">Cum se formează totalurile</Link>.</p>}
    </section>
  </article>;
}
