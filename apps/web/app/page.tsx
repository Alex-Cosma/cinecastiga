import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getDiscoverySummary } from "@/lib/discovery";
import { formatRon, formatInt } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import type { AskSpec } from "@/lib/ask/spec";
import { askHref } from "@/lib/discovery-links";
import { AUTHORITY_CLOUD_SPEC, COMMUNES_BREAKDOWN_SPEC, CONTRACT_WINNERS_SPEC, FIRM_DEPENDENCE_CLOUD_SPEC, HOSPITALS_BREAKDOWN_SPEC, NATIONAL_CONTRACT_COUNT_SPEC, NATIONAL_DA_COUNT_SPEC, NATIONAL_VALUE_SPEC } from "@/lib/ask/site-links";
import { sessionUserId } from "@/lib/session";
import Term from "@/components/Term";
import DiscoverySearch from "./DiscoverySearch";
import DiscoveryMap from "./DiscoveryMap";
import DiscoveryIcon from "./DiscoveryIcon";
import TownHallTile from "./TownHallTile";
import HowNote from "@/components/HowNote";
import { publicationDay, sourceDay } from "@/lib/coverage-summary";
import { getProcessingFreshness } from "@/lib/processing-freshness";
import { getCoverage } from "@/lib/coverage";

// Rendered per request (runtime data and the viewer's session); never cached.
export const dynamic = "force-dynamic";
const questionHref = askHref;
// The first card is „Ce a cumpărat primăria ta?” (TownHallTile; owner, 13 November 2026, in place of „Cine repară drumurile?”).
// `complet`: the card exists only in Complet (lib/view-mode.ts; owner, 18 November 2026). Esențial keeps the town hall,
// the hospitals and who wins; the communes repeat the town hall's card and the two clouds are the scatter answers.
const QUESTIONS = [
  { title: "Ce cumpără spitalele?", kind: "hospital", label: "SĂNĂTATE", action: "Explorează achizițiile", spec: HOSPITALS_BREAKDOWN_SPEC },
  { title: "Cine câștigă contractele?", kind: "network", label: "FIRME ȘI CONTRACTE", action: "Urmărește contractele", spec: CONTRACT_WINNERS_SPEC },
  { title: "Ce cumpără comunele?", kind: "village", label: "COMUNE", action: "Vezi domeniile", spec: COMMUNES_BREAKDOWN_SPEC, complet: true },
  { title: "Cine iese din tipar?", kind: "outlier", label: "SEMNALE", action: "Vezi instituțiile", spec: AUTHORITY_CLOUD_SPEC, complet: true },
  { title: "Ce firme depind de un singur client?", kind: "dependence", label: "DEPENDENȚĂ", action: "Vezi firmele", spec: FIRM_DEPENDENCE_CLOUD_SPEC, complet: true },
] satisfies { title: string; kind: string; label: string; action: string; spec: AskSpec; complet?: boolean }[];

// „Atribuiri publicate în TED” leads to /supra-prag, a Complet-only page: the card exists only in Complet (owner,
// 18 November 2026); Esențial's two cards share a row (components/mode/esential-acasa-harta.css).
const PATHS = [
  { href: "/semnale", kind: "signals", title: "Semnale care merită verificate" },
  { href: "/domenii", kind: "domains", title: "Ce cumpără instituțiile" },
  { href: "/supra-prag", kind: "ted", title: "Atribuiri publicate în TED", complet: true },
];
/** The mark of a block that exists only in Complet (lib/view-mode.ts). */
const onlyComplet = (complet: boolean | undefined) => (complet ? { "data-only": "complet" } : {});
// Twelve stars of the European flag, rounded so server and client agree.
const EU_RING = Array.from({ length: 12 }, (_, k) => [Math.round((104 + 36 * Math.cos(k * Math.PI / 6)) * 10) / 10, Math.round((52 + 36 * Math.sin(k * Math.PI / 6)) * 10) / 10]);

/*
 * On phones each card is a row with its drawing at 104×70 (UX audit Z1-04, 16 November 2026): the same drawing, its
 * empty margins cropped, so it stays legible at that size. A second copy of the drawing carries the phone's frame.
 */
const PHONE_CROP: Record<string, string> = {
  network: "52 4 206 98", outlier: "40 8 236 94", townhall: "76 0 170 100", village: "44 14 214 90", dependence: "26 8 254 98", hospital: "40 20 236 86",
  signals: "52 20 198 84", domains: "58 20 184 84", ted: "62 12 196 80",
};
function Framed({ className, viewBox, kind, children }: { className: string; viewBox: string; kind: string; children: ReactNode }) {
  return <>
    <svg className={`${className} d-art-${kind} d-art-wide`} viewBox={viewBox} aria-hidden="true">{children}</svg>
    <svg className={`${className} d-art-${kind} d-art-narrow`} viewBox={PHONE_CROP[kind] ?? viewBox} aria-hidden="true">{children}</svg>
  </>;
}
/** The small arrow after a card's title on phones, where the card's action row is left out. */
const CardGo = () => <span className="d-card-go" aria-hidden="true"><DiscoveryIcon name="arrow" /></span>;

function PathArt({ kind }: { kind: string }) {
  return <Framed className="d-path-art d-question-art" viewBox="20 0 270 105" kind={kind}>
    {kind === "signals" ? <><path className="d-art-stroke" d="M40 100h230" /><rect className="d-art-land" x="58" y="62" width="26" height="38" rx="3" /><rect className="d-art-land" x="98" y="44" width="26" height="56" rx="3" /><rect className="d-art-land" x="138" y="70" width="26" height="30" rx="3" /><rect className="d-art-highlight" x="178" y="28" width="26" height="72" rx="3" /><rect className="d-art-land" x="218" y="56" width="26" height="44" rx="3" /><circle className="d-art-stroke" cx="191" cy="40" r="27" /><path className="d-art-highlight-stroke" d="M211 60l22 22" /></>
      : kind === "domains" ? <><path className="d-art-stroke" d="M40 100h230" /><rect className="d-art-land" x="64" y="58" width="58" height="42" rx="3" /><rect className="d-art-building" x="122" y="34" width="70" height="66" rx="3" /><path className="d-art-stroke" d="M157 34v24m-35 0h70" /><rect className="d-art-land" x="192" y="70" width="44" height="30" rx="3" /><rect className="d-art-land" x="80" y="26" width="34" height="32" rx="3" /><path className="d-art-stroke" d="M97 26v12" /><circle className="d-art-highlight" cx="214" cy="56" r="8" /></>
      : <>{EU_RING.map(([cx, cy], k) => <circle className="d-art-node" cx={cx} cy={cy} r="4.5" key={k} />)}<rect className="d-art-building" x="88" y="34" width="32" height="38" rx="3" /><path className="d-art-stroke" d="M95 45h18m-18 8h18m-18 8h11" /><path className="d-art-stroke" d="M150 53h50" strokeDasharray="5 6" /><rect className="d-art-building" x="214" y="34" width="32" height="38" rx="3" /><path className="d-art-stroke" d="M221 45h18m-18 8h18m-18 8h11" /><circle className="d-art-highlight" cx="246" cy="34" r="9" /><path className="d-art-check" d="M242 34l3 3 5-6" /></>}
  </Framed>;
}

function QuestionArt({ kind }: { kind: string }) {
  return <Framed className="d-question-art" viewBox="0 0 310 105" kind={kind}>
    {kind === "townhall" ? <><path className="d-art-land" d="M0 84c52-12 110-10 160-12s104-6 150 2v31H0Z" /><path className="d-art-building" d="M92 98V52h126v46" /><path className="d-art-building" d="M84 52l71-28 71 28Z" /><path className="d-art-stroke" d="M155 24V6m0 0h18l-4 5 4 5h-18" /><circle className="d-art-stroke" cx="155" cy="40" r="6" /><path className="d-art-stroke" d="M108 62v28m22-28v28m50-28v28m22-28v28" /><path className="d-art-building" d="M144 98V72h22v26" /><path className="d-art-stroke" d="M40 98h230" /><circle className="d-art-node" cx="44" cy="80" r="12" /><path className="d-art-stroke" d="M44 92v6" /><circle className="d-art-node" cx="262" cy="78" r="14" /><path className="d-art-stroke" d="M262 92v6" /><circle className="d-art-highlight" cx="236" cy="30" r="7" /></>
      : kind === "road" ? <><path className="d-art-land" d="M0 78c43-43 93-21 139-43s114-20 171 2v67H0Z" /><path className="d-art-road" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64" /><path className="d-art-road-line" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64" /><path className="d-art-stroke" d="M57 30v23m-8-15 8-10 8 10M251 63v22m-8-14 8-10 8 10" /><circle className="d-art-highlight" cx="205" cy="87" r="7" /></> : kind === "village" ? <><path className="d-art-land" d="M0 86c58-15 116-9 168-13s100-7 142 1v31H0Z" /><path className="d-art-building" d="M52 88V60l22-18 22 18v28" /><path className="d-art-stroke" d="M67 88V72h14v16M58 64h8" /><path className="d-art-building" d="M112 88V68l16-13 16 13v20" /><path className="d-art-stroke" d="M123 88V77h10v11" /><path className="d-art-building" d="M178 88V46h22v42M178 46l11-17 11 17" /><path className="d-art-stroke" d="M189 18v11m-4-7h8M184 88V74h10v14" /><path className="d-art-stroke" d="M246 88V68" /><circle className="d-art-node" cx="246" cy="60" r="13" /><circle className="d-art-highlight" cx="134" cy="36" r="7" /><path className="d-art-stroke" d="M30 98h250" /></>
      : kind === "outlier" ? <><path className="d-art-stroke" d="M44 98h232M44 98V14" />{[[64,88],[76,80],[88,90],[97,74],[110,84],[120,68],[132,79],[144,64],[152,87],[164,72],[176,58],[188,77],[200,63],[122,92],[82,70],[104,62],[140,90],[170,85]].map(([cx, cy], k) => <circle className="d-art-node" cx={cx} cy={cy} r="4.5" key={k} />)}<circle className="d-art-stroke" cx="244" cy="28" r="17" /><circle className="d-art-highlight" cx="244" cy="28" r="7" /><path className="d-art-stroke" d="M210 54l18-14" strokeDasharray="4 5" /></>
      : kind === "dependence" ? <><path className="d-art-land" d="M30 104V66h96v38" /><path className="d-art-building" d="M48 104V40l30-16 30 16v64" /><path className="d-art-stroke" d="M60 54h36M60 66h36M60 78h36M70 104V90h16v14" /><path className="d-art-highlight-stroke" d="M112 62c38-4 62-6 92-6" /><path className="d-art-connections" d="M226 52l34-28M228 66l40 24M220 46l-6-30" strokeDasharray="4 5" /><circle className="d-art-node" cx="262" cy="22" r="6" /><circle className="d-art-node" cx="270" cy="92" r="7" /><circle className="d-art-node" cx="213" cy="14" r="5" /><circle className="d-art-highlight" cx="218" cy="56" r="13" /><path className="d-art-stroke" d="M20 104h270" /></> : kind === "hospital" ? <><rect className="d-art-land" x="51" y="62" width="207" height="42" rx="4" /><path className="d-art-building" d="M116 103V28h80v75M73 103V58h43m80 0h42v45" /><path className="d-art-stroke" d="M138 100V81h36v19M131 63h9m31 0h9M88 75h9m-9 13h9m113-13h9m-9 13h9" /><path className="d-art-highlight-stroke" d="M156 36v19m-10-10h20" /><path className="d-art-stroke" d="M44 103h224" /></> : <><path className="d-art-connections" d="M72 32 152 65 234 29M73 89l79-24 83 24M152 65V14" /><circle className="d-art-land" cx="152" cy="65" r="23" /><circle className="d-art-node" cx="72" cy="32" r="14" /><circle className="d-art-node" cx="73" cy="89" r="10" /><circle className="d-art-node" cx="234" cy="29" r="16" /><circle className="d-art-highlight" cx="235" cy="89" r="12" /><circle className="d-art-node" cx="152" cy="14" r="8" /><path className="d-art-stroke" d="M143 72V56h18v16m-21 0h24m-16-12h8m-8 5h8" /></>}
  </Framed>;
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
  const [headline, inventory, signedIn, freshness] = await Promise.all([getDiscoverySummary(), getCoverage(), sessionUserId().then(id => id !== null, () => false), getProcessingFreshness().catch(() => null)]);
  const dataAt = freshness?.dataAt ?? null;
  // The archive's periods, one line each; „complete până la” only where the source is complete short of its last day.
  const periods = (["da", "contracts", "ted"] as const).flatMap((dataset) => {
    const o = inventory?.observations.find(row => row.dataset === dataset)?.observation;
    if (!o?.date_from || !o.date_to) return [];
    const label = dataset === "da" ? "Achiziții directe" : dataset === "contracts" ? "Contracte din proceduri" : "TED (separat, nu se adună)";
    const note = o.complete_until && o.complete_until.slice(0, 10) < o.date_to.slice(0, 10) ? `complete până la ${sourceDay(o.complete_until)}, apoi provizorii` : null;
    return [{ label, range: `${sourceDay(o.date_from)}–${sourceDay(o.date_to)}`, note }];
  });
  const contractInventory = inventory?.observations.find(o => o.dataset === "contracts")?.observation;
  const aboveCap = contractInventory?.above_value_cap === undefined ? null : Number(contractInventory.above_value_cap);
  const heldUnderCap = Number(contractInventory?.value_held_under_cap ?? 0);
  const coverage = headline.yearFrom && headline.yearTo ? headline.yearFrom === headline.yearTo ? headline.yearFrom : `${headline.yearFrom}–${headline.yearTo}` : "arhiva importată";
  return <div className="discovery-page">
    <section className="d-hero" aria-labelledby="d-hero-title">
      <div className="d-hero-copy">
        <h1 id="d-hero-title">Sunt banii tăi.<br /><span>Vezi unde ajung.</span></h1>
        <p className="d-hero-description">De la strada ta la marile contracte. Urmărește cine cumpără, cine câștigă și ce întrebări merită puse.</p>
        <DiscoverySearch hero />
        {/* Esențial (owner, 18 November 2026): the examples, the national strip and the investigation invite exist only in
            Complet; the search, the county map and the starting questions are the home's essentials. */}
        <div className="d-quick-links" data-only="complet"><span>Încearcă:</span><Link href="/cauta?q=Cluj"><DiscoveryIcon name="pin" />Cluj</Link><Link href="/cauta?q=drumuri">Drumuri</Link><Link href="/cauta?q=iluminat">Iluminat</Link></div>
      </div>
      <DiscoveryMap counties={headline.counties} />
    </section>

    <section className="d-national-strip" aria-label="Datele din arhiva publică" data-only="complet">
      <div className="d-national-label"><div><strong>{coverage}</strong>
        {/* What the figures include floats over the page from quiet words under the archive's years, on the line of the figures' labels (owner, 20 November 2026: the
            fold that opened a wall of text in the home page became the site's floating card, „Fișă”). */}
        <HowNote title="Ce includ cifrele" className="d-national-how">
          <span className="how-n">Achiziții directe acceptate (până la 2 mil. lei) și contracte din proceduri. Valori înregistrate, nu plăți.</span>
          <span className="how-n">Peste 1 mld. lei, un contract intră doar dacă anunțul nu-i contrazice valoarea{aboveCap ? `; ${aboveCap === 1 ? "unul a rămas afară" : `${formatInt(aboveCap)} au rămas afară`} (${formatRon(Number(contractInventory?.above_value_cap_value ?? 0))})` : ""}.{heldUnderCap ? ` Ca eroare probabilă de valoare ${heldUnderCap === 1 ? "mai stă afară un contract" : `mai stau afară ${countWords(heldUnderCap, "contract", "contracte")}`} sub acest prag.` : ""} Consorțiu: un rând pe furnizor, valoarea împărțită.</span>
          {periods.map((row) => <span className="tip-li" key={row.label}>{row.label}: {row.range}{row.note ? <> · {row.note}</> : null}</span>)}
          <span className="how-n">{dataAt ? `Date publicate la ${publicationDay(dataAt)} · ` : ""}<Link href="/metodologie#acoperire">Surse și limite →</Link></span>
        </HowNote>
      </div></div>
      {/* The number opens its answer; the label explains the word. A Term is a
          button, so it sits next to the link instead of inside it. */}
      <div className="d-national-item"><Link href={questionHref(NATIONAL_DA_COUNT_SPEC)}><strong>{formatInt(headline.directRecords)}</strong></Link><small><Term hold="line" id="achizitie-directa" tip>achiziții directe acceptate</Term></small></div>
      <div className="d-national-item"><Link href={questionHref(NATIONAL_CONTRACT_COUNT_SPEC)}><strong>{formatInt(headline.contractRecords)}</strong></Link><small><Term hold="line" id="inregistrare-contract-furnizor" tip>înregistrări contract–{"\u2060"}furnizor</Term></small></div>
      <div className="d-national-item"><Link href={questionHref(NATIONAL_VALUE_SPEC)}><strong>{formatRon(headline.totalRon)}</strong></Link><small><Term hold="line" id="valoare-inregistrata" tip>valoare înregistrată</Term></small></div>
    </section>

    <section className="d-starts" aria-labelledby="d-starts-title">
      <div className="d-section-heading"><div><h2 id="d-starts-title">O întrebare bună e un început.</h2></div><Link className="d-text-link" href="/intreaba">Construiește întrebarea ta <DiscoveryIcon name="arrow" /></Link></div>
      <div className="d-question-grid"><TownHallTile number="01" art={<QuestionArt kind="townhall" />} />{QUESTIONS.map((question, index) => <Link className="d-question-card" href={questionHref(question.spec)} key={question.kind} {...onlyComplet(question.complet)}>
        <div className="d-question-top"><span>{question.label}</span><span>0{index + 2}</span></div><QuestionArt kind={question.kind} /><h3>{question.title}<CardGo /></h3><div className="d-question-bottom"><span>{question.action}</span><span><DiscoveryIcon name="arrow" /></span></div>
      </Link>)}</div>
    </section>

    <section className="d-paths" aria-label="Alte direcții">{PATHS.map((item) => <Link className="d-path-card" href={item.href} key={item.href} {...onlyComplet(item.complet)}>
      <PathArt kind={item.kind} /><div className="d-path-head"><h3>{item.title}<CardGo /></h3><span><DiscoveryIcon name="arrow" /></span></div>
    </Link>)}</section>

    {signedIn && <section className="d-investigation-invite" aria-labelledby="d-investigation-title" data-only="complet"><div className="d-folder-art" aria-hidden="true"><div className="d-folder-back" /><div className="d-folder-paper"><i /><i /><i /></div><div className="d-folder-front"><span>+</span></div></div><div><p className="eyebrow">DE LA CURIOZITATE LA ANCHETĂ</p><h2 id="d-investigation-title">Ai găsit un fir? Urmărește-l.</h2><p>Strânge contracte, surse și notițe într-un dosar privat.</p></div><Link href="/anchete" className="d-button d-button-primary">Începe o anchetă <DiscoveryIcon name="arrow" /></Link></section>}
  </div>;
}
