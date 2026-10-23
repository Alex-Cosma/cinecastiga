import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY, GUIDE_IDEAS, guideIdeasHeading } from "@/lib/glossary";
import { askHref, countyBreakdownHref } from "@/lib/discovery-links";
import DiscoveryIcon from "../DiscoveryIcon";

export const metadata: Metadata = {
  title: "Ghid pentru început",
  description: "Ce arată cinecâștigă?, ce înseamnă cifrele și patru feluri de a începe.",
};

/** Four first steps; each opens a page that answers on its own. */
const PATHS = [
  {
    href: countyBreakdownHref("Buzău"),
    title: "Pe ce se duc banii în județul tău?",
    text: "Harta de pe prima pagină, pe domenii.",
  },
  {
    href: "/cauta?q=Municipiul%20Buz%C4%83u&tab=entities",
    title: "Caută o instituție, de exemplu „Municipiul Buzău”",
    text: "Nume sau CUI: ce a cumpărat sau câștigat, cu cine, când.",
  },
  {
    href: askHref({ block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } }),
    title: "Pune o întrebare: cine repară drumurile?",
    text: "Ce, unde, când, cu înregistrările din spate.",
  },
  {
    href: "/semnale",
    title: "Vezi ce merită verificat",
    text: "Tipare de verificat, nu acuzații.",
  },
];

export default function GuidePage() {
  return <article className="guide-page" aria-labelledby="guide-title">
    <header className="guide-head">
      <h1 id="guide-title">Cum citești ce vezi aici</h1>
      <p className="guide-lede">
        Ce cumpără instituțiile publice, de la cine și cu cât. Fiecare cifră duce la înregistrările ei și la sursă.
      </p>
    </header>

    <section className="guide-section" aria-labelledby="guide-ideas">
      <h2 id="guide-ideas">{guideIdeasHeading()}</h2>
      <ol className="guide-ideas">
        {GUIDE_IDEAS.map((id) => {
          const entry = GLOSSARY[id];
          return <li key={id} id={id}>
            <h3>{entry.title}</h3>
            <p>{entry.text}</p>
          </li>;
        })}
      </ol>
      <p className="guide-note">Un semnal sau o sumă mare nu dovedesc o neregulă: sunt motive să verifici.</p>
    </section>

    <section className="guide-section" aria-labelledby="guide-start">
      <h2 id="guide-start">Cum să începi</h2>
      <ol className="guide-paths">
        {PATHS.map((path, index) => <li key={path.title}>
          <Link href={path.href}>
            <span className="guide-step" aria-hidden="true">{index + 1}</span>
            <span><b>{path.title}</b><small>{path.text}</small></span>
            <span className="guide-arrow" aria-hidden="true"><DiscoveryIcon name="arrow" /></span>
          </Link>
        </li>)}
      </ol>
    </section>

    <section className="guide-section" aria-labelledby="guide-sources">
      <h2 id="guide-sources">De unde vin datele</h2>
      <ul className="guide-data">
        <li><b>SEAP/SICAP</b> (e-licitatie.ro): achiziții și contracte</li>
        <li><b>TED</b>: separat, nu se adună la totaluri</li>
        <li><b>Bilanțuri MF</b>: salariați, cifră de afaceri</li>
        <li><b>ONRC</b>: administratori</li>
      </ul>
      <p>Datele nu sunt în timp real și pot avea lipsuri.</p>
      <ul className="guide-sources">
        <li><Link href="/metodologie">Metodologia: cum calculăm totalurile și semnalele</Link></li>
        <li><Link href="/metodologie#acoperire">Sursele și acoperirea datelor</Link></li>
      </ul>
    </section>
  </article>;
}
