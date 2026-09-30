import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcquisitionDetail } from "@/lib/acquisition-detail";
import { daUrl } from "@/lib/elicitatie";
import { formatExactDecimal, formatCalendarDate, cleanName } from "@/lib/format";
import ClipButton from "@/components/ClipButton";
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
      <div><h1>{title}</h1>
        {!d.title && <p className="ad-note">{d.cpvName ? "Denumirea categoriei CPV; titlul original nu este disponibil în arhivă." : "Titlul și denumirea categoriei nu sunt disponibile în arhivă."}</p>}
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
        <div><dt>Valoare de închidere</dt><dd>{amount(d.value)}</dd></div>
        <div><dt>Valoare estimată</dt><dd>{amount(d.estimate)}</dd></div>
        <div><dt>Publicată</dt><dd>{formatCalendarDate(d.publishedAt, true)}</dd></div>
        <div><dt>Finalizată</dt><dd>{formatCalendarDate(d.finalizedAt, true)}</dd></div>
        <div><dt>Domeniu CPV</dt><dd>{d.cpvName ?? "Categorie neprecizată"}{d.cpvCode && <span className="ad-code">{d.cpvCode}</span>}</dd></div>
        <div><dt>Tipul achiziției</dt><dd>{d.acquisitionType ?? "Neprecizat în datele disponibile"}</dd></div>
      </dl>
      <p className="ad-note">Datele și orele sunt afișate în ora României. Valoarea de închidere este cea înregistrată în SEAP, nu o plată verificată.</p>
    </section>
    <section className="ad-section" aria-labelledby="ad-parties">
      <h2 id="ad-parties">Instituție și furnizor</h2>
      <dl className="ad-facts">
        <div><dt>Instituție</dt><dd>{d.authorityId ? <Link href={`/entitati/${d.authorityId}`}>{cleanName(d.authority)}</Link> : d.authority ?? "Instituție neprecizată"}</dd></div>
        <div><dt>Furnizor</dt><dd>{d.supplierId ? <Link href={`/entitati/${d.supplierId}`}>{cleanName(d.supplier)}</Link> : d.supplier ?? "Furnizor neprecizat"}</dd></div>
      </dl>
    </section>
    <section className="ad-section" aria-labelledby="ad-source">
      <h2 id="ad-source">Fișiere</h2>
      <p>Preluarea fișierelor pentru achiziții directe nu este încă disponibilă. Documentele publicate pot fi consultate în înregistrarea oficială.</p>
    </section>
  </article>;
}
