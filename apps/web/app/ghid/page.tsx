import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY, GUIDE_IDEAS } from "@/lib/glossary";
import { askHref, countyBreakdownHref } from "@/lib/discovery-links";
import DiscoveryIcon from "../DiscoveryIcon";

export const metadata: Metadata = {
  title: "Ghid pentru început",
  description: "Ce arată cinecâștigă?, cinci idei pentru a citi cifrele și patru feluri de a începe.",
};

/** Four first steps; each opens a page that answers on its own. */
const PATHS = [
  {
    href: countyBreakdownHref("Buzău"),
    title: "Pe ce se duc banii în județul tău?",
    text: "Alege un județ pe harta de pe prima pagină. De exemplu, Buzău: achizițiile instituțiilor din județ, împărțite pe domenii.",
  },
  {
    href: "/cauta?q=Municipiul%20Buz%C4%83u&tab=entities",
    title: "Caută o instituție, de exemplu „Municipiul Buzău”",
    text: "Scrie numele sau CUI-ul unei instituții sau firme. Pagina ei arată ce a cumpărat sau ce a câștigat, cu cine a lucrat și când.",
  },
  {
    href: askHref({ block: "table", dataset: "all", dim: "supplier", measure: "value", topN: 10, filters: { cpvTerm: "drumuri" } }),
    title: "Pune o întrebare: cine repară drumurile?",
    text: "În „Întreabă” alegi ce vrei să afli, unde și când. Răspunsul vine cu lista înregistrărilor din spate.",
  },
  {
    href: "/semnale",
    title: "Vezi ce merită verificat",
    text: "Semnalele arată tipare din date care merită verificate, nu acuzații. Fiecare are condițiile, limitele și sursele lui.",
  },
];

export default function GuidePage() {
  return <article className="guide-page" aria-labelledby="guide-title">
    <header className="guide-head">
      <p className="eyebrow">GHID PENTRU ÎNCEPUT</p>
      <h1 id="guide-title">Cum citești ce vezi aici</h1>
      <p className="guide-lede">
        cinecâștigă? arată ce cumpără instituțiile publice din România, de la ce firme și pentru ce sumă,
        din datele publice ale achizițiilor. Fiecare cifră duce la înregistrările din care a fost calculată,
        iar fiecare înregistrare duce la sursa ei.
      </p>
    </header>

    <section className="guide-section" aria-labelledby="guide-ideas">
      <h2 id="guide-ideas">Cinci idei care te ajută să citești cifrele</h2>
      <ol className="guide-ideas">
        {GUIDE_IDEAS.map((id) => {
          const entry = GLOSSARY[id];
          return <li key={id} id={id} className={id === "consortiu" ? "guide-extra" : undefined}>
            <h3>{entry.title}</h3>
            <p>{entry.text}</p>
          </li>;
        })}
      </ol>
      <p className="guide-note">Un semnal sau o sumă mare nu spun singure că ceva e în neregulă. Sunt motive să te uiți în documente și să întrebi instituția.</p>
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
      <p>
        Achizițiile directe, procedurile și contractele vin din SEAP/SICAP (e-licitatie.ro). Publicațiile europene
        din TED se consultă separat și nu se adaugă încă o dată la totaluri. Bilanțurile Ministerului Finanțelor
        arată, unde există, numărul de salariați și cifra de afaceri a firmelor, iar registrul ONRC arată
        reprezentanții lor, de exemplu administratorii. Datele nu sunt preluate în timp real și pot avea lipsuri;
        pagina de metodologie arată ce perioade acoperă fiecare sursă.
      </p>
      <ul className="guide-sources">
        <li><Link href="/metodologie">Metodologia: cum calculăm totalurile și semnalele</Link></li>
        <li><Link href="/metodologie#acoperire">Sursele și acoperirea datelor</Link></li>
      </ul>
    </section>
  </article>;
}
