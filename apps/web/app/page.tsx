import Link from "next/link";
import { redirect } from "next/navigation";
import { getDiscoverySummary } from "@/lib/discovery";
import { formatRon, formatInt } from "@/lib/format";
import { encodeSpec } from "@/lib/ask/permalink";
import type { AskSpec } from "@/lib/ask/spec";
import DiscoverySearch from "./DiscoverySearch";
import DiscoveryMap from "./DiscoveryMap";
import DiscoveryIcon from "./DiscoveryIcon";

export const dynamic = "force-dynamic";
const questionHref = (spec: AskSpec) => `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}`;
const QUESTIONS = [
  { title: "Cine repară drumurile?", description: "Urmărește firmele din spatele lucrărilor și achizițiile care le aduc împreună.", kind: "road", label: "DRUMURI ȘI CONSTRUCȚII", action: "Vezi firmele și achizițiile", spec: { block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } } },
  { title: "Ce cumpără spitalele?", description: "De la medicamente la echipamente. Vezi pe ce se duc banii și cine furnizează.", kind: "hospital", label: "SĂNĂTATE", action: "Explorează achizițiile", spec: { block: "breakdown", dataset: "all", measure: "value", filters: { authorityKind: "spital" } } },
  { title: "Cine primește contractele?", description: "Pornește de la un clasament. Ajungi la firme, instituții și fiecare sursă.", kind: "network", label: "FIRME ȘI CONTRACTE", action: "Urmărește contractele", spec: { block: "table", dataset: "contracts", dim: "supplier", measure: "value", topN: 10, filters: {} } },
] satisfies { title: string; description: string; kind: string; label: string; action: string; spec: AskSpec }[];

function QuestionArt({ kind }: { kind: string }) {
  return <svg className={`d-question-art d-art-${kind}`} viewBox="0 0 310 105" aria-hidden="true">
    {kind === "road" ? <><path className="d-art-land" d="M0 78c43-43 93-21 139-43s114-20 171 2v67H0Z" /><path className="d-art-road" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64" /><path className="d-art-road-line" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64" /><path className="d-art-stroke" d="M57 30v23m-8-15 8-10 8 10M251 63v22m-8-14 8-10 8 10" /><circle className="d-art-highlight" cx="205" cy="87" r="7" /></> : kind === "hospital" ? <><rect className="d-art-land" x="51" y="62" width="207" height="42" rx="4" /><path className="d-art-building" d="M116 103V28h80v75M73 103V58h43m80 0h42v45" /><path className="d-art-stroke" d="M138 100V81h36v19M131 63h9m31 0h9M88 75h9m-9 13h9m113-13h9m-9 13h9" /><path className="d-art-highlight-stroke" d="M156 36v19m-10-10h20" /><path className="d-art-stroke" d="M44 103h224" /></> : <><path className="d-art-connections" d="M72 32 152 65 234 29M73 89l79-24 83 24M152 65V14" /><circle className="d-art-land" cx="152" cy="65" r="23" /><circle className="d-art-node" cx="72" cy="32" r="14" /><circle className="d-art-node" cx="73" cy="89" r="10" /><circle className="d-art-node" cx="234" cy="29" r="16" /><circle className="d-art-highlight" cx="235" cy="89" r="12" /><circle className="d-art-node" cx="152" cy="14" r="8" /><path className="d-art-stroke" d="M143 72V56h18v16m-21 0h24m-16-12h8m-8 5h8" /></>}
  </svg>;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Preserve existing entity/chart/investigation permalinks as exploration moves.
  if (params.spec || params.q) {
    const forwarded = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) forwarded.append(key, item);
    redirect(`/intreaba?${forwarded.toString()}`);
  }
  const headline = await getDiscoverySummary();
  const coverage = headline.yearFrom && headline.yearTo ? headline.yearFrom === headline.yearTo ? headline.yearFrom : `${headline.yearFrom}–${headline.yearTo}` : "arhiva importată";
  return <div className="discovery-page">
    <section className="d-hero" aria-labelledby="d-hero-title">
      <div className="d-hero-copy">
        <p className="eyebrow d-hero-eyebrow"><span /> BANII PUBLICI, PE ÎNȚELESUL TĂU</p>
        <h1 id="d-hero-title">Sunt banii tăi.<br /><span>Vezi unde ajung.</span></h1>
        <p className="d-hero-description">De la strada ta la marile contracte. Urmărește cine cumpără, cine câștigă și ce întrebări merită puse.</p>
        <DiscoverySearch hero />
        <div className="d-quick-links"><span>Încearcă:</span><Link href="/cauta?q=Cluj"><DiscoveryIcon name="pin" />Cluj</Link><Link href={questionHref(QUESTIONS[0]!.spec)}>Drumuri</Link><Link href={questionHref(QUESTIONS[1]!.spec)}>Spitale</Link></div>
        <p className="d-reassurance"><DiscoveryIcon name="shield" /> Date publice. Surse la vedere. Curiozitatea e suficientă.</p>
      </div>
      <DiscoveryMap counties={headline.counties} />
    </section>

    <section className="d-national-strip" aria-label="Datele din arhiva publică">
      <div className="d-national-label"><span><DiscoveryIcon name="database" /></span><div><b>O arhivă de urmărit.</b><small>Înregistrări din {coverage}</small></div></div>
      <Link href={questionHref({ block: "stat", dataset: "da", measure: "value", filters: {} })}><strong>{formatInt(headline.directRecords)}</strong><small>achiziții directe acceptate</small></Link>
      <Link href={questionHref({ block: "stat", dataset: "contracts", measure: "value", filters: {} })}><strong>{formatInt(headline.contractRecords)}</strong><small>înregistrări contract–furnizor</small></Link>
      <Link href={questionHref({ block: "stat", dataset: "all", measure: "value", filters: {} })}><strong>{formatRon(headline.totalRon)}</strong><small>valoare înregistrată · nu plăți</small></Link>
    </section>

    <section className="d-starts" aria-labelledby="d-starts-title">
      <div className="d-section-heading"><div><h2 id="d-starts-title">O întrebare bună e un început.</h2><p>Nu trebuie să știi de unde să începi. Doar ce te interesează.</p></div><Link className="d-text-link" href="/intreaba">Construiește întrebarea ta <DiscoveryIcon name="arrow" /></Link></div>
      <div className="d-question-grid">{QUESTIONS.map((question, index) => <Link className="d-question-card" href={questionHref(question.spec)} key={question.kind}>
        <div className="d-question-top"><span>{question.label}</span><span>0{index + 1}</span></div><QuestionArt kind={question.kind} /><h3>{question.title}</h3><p>{question.description}</p><div className="d-question-bottom"><span>{question.action}</span><span><DiscoveryIcon name="arrow" /></span></div>
      </Link>)}</div>
    </section>

    <section className="d-investigation-invite" aria-labelledby="d-investigation-title"><div className="d-folder-art" aria-hidden="true"><div className="d-folder-back" /><div className="d-folder-paper"><i /><i /><i /></div><div className="d-folder-front"><span>+</span></div></div><div><p className="eyebrow">DE LA CURIOZITATE LA ANCHETĂ</p><h2 id="d-investigation-title">Ai găsit un fir? Urmărește-l.</h2><p>Strânge contracte, surse și notițe într-un dosar privat. Revino la ele când apare următoarea întrebare.</p></div><Link href="/anchete" className="d-button d-button-primary">Începe o anchetă <DiscoveryIcon name="arrow" /></Link></section>

    <section className="d-deeper" aria-labelledby="d-deeper-title"><div><p className="eyebrow">PRIVEȘTE MAI DE APROAPE</p><h2 id="d-deeper-title">Mai multe feluri<br />de a urmări banii.</h2><p>Fiecare perspectivă te ajută să pui întrebări mai precise.</p></div><div className="d-deeper-links">{[
      { href: "/semnale", icon: "shield" as const, title: "Semnale care merită verificate", description: "Indicatori explicați, cu metodologia și sursele lor. Un semnal invită la verificare." },
      { href: "/domenii", icon: "layers" as const, title: "Ce cumpără instituțiile", description: "Domenii de achiziții, de la materiale și echipamente la servicii și lucrări." },
      { href: "/supra-prag", icon: "chart" as const, title: "Contractele mari, în detaliu", description: "Atribuiri publicate și în TED. O perspectivă separată, fără dublarea sumelor." },
    ].map((item) => <Link href={item.href} key={item.href}><span className="d-deeper-symbol"><DiscoveryIcon name={item.icon} /></span><span><b>{item.title}</b><small>{item.description}</small></span><DiscoveryIcon name="arrow" /></Link>)}</div></section>

    <div className="d-data-note"><DiscoveryIcon name="database" /><p>Totalul național cuprinde {formatInt(headline.totalRecords)} de înregistrări pentru {coverage}, din arhiva importată. Fiecare legătură păstrează condițiile cifrei afișate. Sunt incluse achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, și contracte din proceduri. Un contract cu mai mulți furnizori apare pe câte un rând pentru fiecare furnizor, cu valoarea împărțită între ei. Atribuirile TED sunt o perspectivă separată și nu se adaugă încă o dată la total. Valorile nu confirmă plăți efectuate. <Link href="/metodologie">Cum sunt calculate și ce acoperă datele <span aria-hidden>↗</span></Link><span className="d-map-credit">Geometria hărții: GADM, utilizare necomercială.</span></p></div>
  </div>;
}
