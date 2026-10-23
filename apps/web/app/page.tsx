import Link from "next/link";
import { redirect } from "next/navigation";
import { getDiscoverySummary } from "@/lib/discovery";
import { formatRon, formatInt } from "@/lib/format";
import type { AskSpec } from "@/lib/ask/spec";
import { askHref } from "@/lib/discovery-links";
import { sessionUserId } from "@/lib/session";
import Term from "@/components/Term";
import DiscoverySearch from "./DiscoverySearch";
import DiscoveryMap from "./DiscoveryMap";
import DiscoveryIcon from "./DiscoveryIcon";
import CoverageDisclosure from "@/components/CoverageDisclosure";
import { getCoverage } from "@/lib/coverage";

// Rendered per request (runtime data and the viewer's session); never cached.
export const dynamic = "force-dynamic";
const questionHref = askHref;
const QUESTIONS = [
  { title: "Cine repară drumurile?", description: "Urmărește firmele din spatele lucrărilor și achizițiile care le aduc împreună.", kind: "road", label: "DRUMURI ȘI CONSTRUCȚII", action: "Vezi firmele și achizițiile", spec: { block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } } },
  { title: "Ce cumpără spitalele?", description: "De la medicamente la echipamente. Vezi pe ce se duc banii și cine furnizează.", kind: "hospital", label: "SĂNĂTATE", action: "Explorează achizițiile", spec: { block: "breakdown", dataset: "all", measure: "value", filters: { authorityKind: "spital" } } },
  { title: "Cine primește contractele?", description: "Pornește de la un clasament. Ajungi la firme, instituții și fiecare sursă.", kind: "network", label: "FIRME ȘI CONTRACTE", action: "Urmărește contractele", spec: { block: "table", dataset: "contracts", dim: "supplier", measure: "value", topN: 10, filters: {} } },
] satisfies { title: string; description: string; kind: string; label: string; action: string; spec: AskSpec }[];

const PATHS = [
  { href: "/semnale", kind: "signals", title: "Semnale care merită verificate", description: "Indicatori explicați, cu metodologia și sursele lor. Un semnal invită la verificare." },
  { href: "/domenii", kind: "domains", title: "Ce cumpără instituțiile", description: "Domenii de achiziții, de la materiale și echipamente la servicii și lucrări." },
  { href: "/supra-prag", kind: "ted", title: "Atribuiri publicate în TED", description: "Consultă anunțurile europene și potrivirile identificate în SEAP." },
];
// Twelve stars of the European flag, rounded so server and client agree.
const EU_RING = Array.from({ length: 12 }, (_, k) => [Math.round((104 + 36 * Math.cos(k * Math.PI / 6)) * 10) / 10, Math.round((52 + 36 * Math.sin(k * Math.PI / 6)) * 10) / 10]);

function PathArt({ kind }: { kind: string }) {
  return <svg className={`d-path-art d-question-art d-art-${kind}`} viewBox="20 0 270 105" aria-hidden="true">
    {kind === "signals" ? <><path className="d-art-stroke" d="M40 100h230" /><rect className="d-art-land" x="58" y="62" width="26" height="38" rx="3" /><rect className="d-art-land" x="98" y="44" width="26" height="56" rx="3" /><rect className="d-art-land" x="138" y="70" width="26" height="30" rx="3" /><rect className="d-art-highlight" x="178" y="28" width="26" height="72" rx="3" /><rect className="d-art-land" x="218" y="56" width="26" height="44" rx="3" /><circle className="d-art-stroke" cx="191" cy="40" r="27" /><path className="d-art-highlight-stroke" d="M211 60l22 22" /></>
      : kind === "domains" ? <><path className="d-art-stroke" d="M40 100h230" /><rect className="d-art-land" x="64" y="58" width="58" height="42" rx="3" /><rect className="d-art-building" x="122" y="34" width="70" height="66" rx="3" /><path className="d-art-stroke" d="M157 34v24m-35 0h70" /><rect className="d-art-land" x="192" y="70" width="44" height="30" rx="3" /><rect className="d-art-land" x="80" y="26" width="34" height="32" rx="3" /><path className="d-art-stroke" d="M97 26v12" /><circle className="d-art-highlight" cx="214" cy="56" r="8" /></>
      : <>{EU_RING.map(([cx, cy], k) => <circle className="d-art-node" cx={cx} cy={cy} r="4.5" key={k} />)}<rect className="d-art-building" x="88" y="34" width="32" height="38" rx="3" /><path className="d-art-stroke" d="M95 45h18m-18 8h18m-18 8h11" /><path className="d-art-stroke" d="M150 53h50" strokeDasharray="5 6" /><rect className="d-art-building" x="214" y="34" width="32" height="38" rx="3" /><path className="d-art-stroke" d="M221 45h18m-18 8h18m-18 8h11" /><circle className="d-art-highlight" cx="246" cy="34" r="9" /><path className="d-art-check" d="M242 34l3 3 5-6" /></>}
  </svg>;
}

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
  // Only a yes/no reaches the page: investigations are invitation-only, so an
  // anonymous visitor gets a neutral line instead of a login dead end.
  const [headline, inventory, signedIn] = await Promise.all([getDiscoverySummary(), getCoverage(), sessionUserId().then(id => id !== null, () => false)]);
  const contractInventory = inventory?.observations.find(o => o.dataset === "contracts")?.observation;
  const aboveCap = contractInventory?.above_value_cap === undefined ? null : Number(contractInventory.above_value_cap);
  const coverage = headline.yearFrom && headline.yearTo ? headline.yearFrom === headline.yearTo ? headline.yearFrom : `${headline.yearFrom}–${headline.yearTo}` : "arhiva importată";
  return <div className="discovery-page">
    <section className="d-hero" aria-labelledby="d-hero-title">
      <div className="d-hero-copy">
        <p className="eyebrow d-hero-eyebrow"><span /> BANII PUBLICI, PE ÎNȚELESUL TĂU</p>
        <h1 id="d-hero-title">Sunt banii tăi.<br /><span>Vezi unde ajung.</span></h1>
        <p className="d-hero-description">De la strada ta la marile contracte. Urmărește cine cumpără, cine câștigă și ce întrebări merită puse.</p>
        <DiscoverySearch hero />
        <div className="d-quick-links"><span>Încearcă:</span><Link href="/cauta?q=Cluj"><DiscoveryIcon name="pin" />Cluj</Link><Link href="/cauta?q=drumuri">Drumuri</Link><Link href="/cauta?q=iluminat">Iluminat</Link></div>
      </div>
      <DiscoveryMap counties={headline.counties} />
    </section>

    <section className="d-national-strip" aria-label="Datele din arhiva publică">
      <div className="d-national-label"><span><DiscoveryIcon name="database" /></span><div><b>O arhivă de urmărit.</b><small>Înregistrări din {coverage}</small></div></div>
      {/* The number opens its answer; the label explains the word. A Term is a
          button, so it sits next to the link instead of inside it. */}
      <div className="d-national-item"><Link href={questionHref({ block: "stat", dataset: "da", measure: "count", filters: {}, population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "value", op: "lte", value: "2000000" }] }] } })}><strong>{formatInt(headline.directRecords)}</strong></Link><small><Term id="achizitie-directa" tip>achiziții directe acceptate</Term></small></div>
      <div className="d-national-item"><Link href={questionHref({ block: "stat", dataset: "contracts", measure: "count", filters: {} })}><strong>{formatInt(headline.contractRecords)}</strong></Link><small><Term id="inregistrare-contract-furnizor" tip>înregistrări contract–furnizor</Term></small></div>
      <div className="d-national-item"><Link href={questionHref({ block: "stat", dataset: "all", measure: "value", filters: {} })}><strong>{formatRon(headline.totalRon)}</strong></Link><small><Term id="valoare-inregistrata" tip>valoare înregistrată · nu plăți</Term></small></div>
    </section>

    <section className="d-starts" aria-labelledby="d-starts-title">
      <div className="d-section-heading"><div><h2 id="d-starts-title">O întrebare bună e un început.</h2></div><Link className="d-text-link" href="/intreaba">Construiește întrebarea ta <DiscoveryIcon name="arrow" /></Link></div>
      <div className="d-question-grid">{QUESTIONS.map((question, index) => <Link className="d-question-card" href={questionHref(question.spec)} key={question.kind}>
        <div className="d-question-top"><span>{question.label}</span><span>0{index + 1}</span></div><QuestionArt kind={question.kind} /><h3>{question.title}</h3><p>{question.description}</p><div className="d-question-bottom"><span>{question.action}</span><span><DiscoveryIcon name="arrow" /></span></div>
      </Link>)}</div>
    </section>

    <section className="d-paths" aria-label="Alte direcții">{PATHS.map((item) => <Link className="d-path-card" href={item.href} key={item.href}>
      <PathArt kind={item.kind} /><div className="d-path-head"><h3>{item.title}</h3><span><DiscoveryIcon name="arrow" /></span></div><p>{item.description}</p>
    </Link>)}</section>

    {signedIn && <section className="d-investigation-invite" aria-labelledby="d-investigation-title"><div className="d-folder-art" aria-hidden="true"><div className="d-folder-back" /><div className="d-folder-paper"><i /><i /><i /></div><div className="d-folder-front"><span>+</span></div></div><div><p className="eyebrow">DE LA CURIOZITATE LA ANCHETĂ</p><h2 id="d-investigation-title">Ai găsit un fir? Urmărește-l.</h2><p>Strânge contracte, surse și notițe într-un dosar privat. Revino la ele când apare următoarea întrebare.</p></div><Link href="/anchete" className="d-button d-button-primary">Începe o anchetă <DiscoveryIcon name="arrow" /></Link></section>}

    <CoverageDisclosure>
      <p>Totalurile includ achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, și contracte din proceduri cu valoare pozitivă de cel mult 1 miliard lei.{aboveCap ? ` ${formatInt(aboveCap)} contracte peste acest plafon, în valoare de ${formatRon(Number(contractInventory?.above_value_cap_value ?? 0))}, sunt separate de totaluri și listate pe pagina fiecărei instituții.` : ""} Un contract cu mai mulți furnizori apare pe câte un rând pentru fiecare, cu valoarea împărțită între ei.</p>
      <p>Publicațiile TED se consultă separat și nu se adaugă încă o dată la total. Valorile înregistrate nu confirmă plăți efectuate.</p>
    </CoverageDisclosure>
  </div>;
}
