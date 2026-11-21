import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, mailHref } from "@/lib/site";
import "../legal.css";

export const metadata: Metadata = {
  title: "Despre și contact",
  description: "Cine face cinecâștigă?, de unde vin datele și cum ne scrii pentru o corectură.",
};

/*
 * Who is behind the site and how to write to it (legal audit, 18 November 2026; owner, 19 November 2026). The
 * association that will run the project does not exist yet: the page says so and names it when it does. The promises
 * here are the ones the site keeps today: an answer in ten working days, a check against the official source.
 */
export default function DesprePage() {
  return (
    <article className="lg">
      <header className="lg-head">
        <h1>Despre și contact</h1>
        <p className="lg-lede">{SITE_NAME} arată cine câștigă contractele publice din România. Totul vine din date publice, cu sursa la un click.</p>
      </header>
      <div className="lg-cols">
        <div className="lg-text">
          <section>
            <h2>Cine face site-ul</h2>
            <p>Un proiect independent și necomercial, fără reclame. Asociația care îl va administra este în curs de înființare; numele ei va apărea aici.</p>
            <p>Codul e public: <a href="https://github.com/Alex-Cosma/cinecastiga">github.com/Alex-Cosma/cinecastiga</a>.</p>
          </section>
          <section>
            <h2>De unde vin datele</h2>
            <p>Din surse oficiale și publice: SEAP / SICAP (e-licitatie.ro), jurnalul european TED, bilanțurile depuse la Ministerul Finanțelor și Registrul Comerțului.</p>
            <p><Link href="/metodologie#acoperire">Surse, acoperire și actualizare <span aria-hidden="true">→</span></Link></p>
          </section>
          <section>
            <h2>Cum se citesc cifrele</h2>
            <ul>
              <li>Valorile sunt cele contractate, nu plăți făcute.</li>
              <li>Un semnal e o pistă de verificat. Nu e o dovadă și nu e o acuzație.</li>
              <li>Scorul descrie achizițiile unei instituții sau ale unei firme, după reguli publice.</li>
            </ul>
            <p><Link href="/metodologie">Ghidul, cu toate regulile <span aria-hidden="true">→</span></Link></p>
          </section>
          <section id="corectura">
            <h2>Ai găsit o greșeală?</h2>
            <p>Scrie-ne linkul paginii, ce e greșit și, dacă ai, documentul care arată varianta corectă. Verificăm cu sursa oficială și răspundem în cel mult 10 zile lucrătoare.</p>
            <p>Corectăm orice e inexact la noi, oricine ar cere. Dacă greșeala e în sursa oficială, îți spunem unde se corectează.</p>
            <p>Dacă un semnal te privește și ai explicația lui, trimite-o. O citim și verificăm dacă regula s-a aplicat corect.</p>
            <p>Pentru o problemă văzută pe o pagină poți folosi și butonul „Feedback”, aflat pe fiecare pagină. Mesajele de acolo sunt anonime, deci la ele nu putem răspunde.</p>
          </section>
        </div>
        <aside className="lg-side" aria-labelledby="lg-contact">
          <h2 id="lg-contact">Contact</h2>
          <a className="lg-mail" href={mailHref()}>{CONTACT_EMAIL}</a>
          <p>Răspundem în cel mult 10 zile lucrătoare.</p>
          <ul className="lg-acts">
            <li><a href={mailHref("Corectură")}>Trimite o corectură</a></li>
            <li><a href={mailHref("Date personale")}>Cerere despre datele tale</a></li>
            <li><a href={mailHref("Presă")}>Presă și colaborări</a></li>
          </ul>
          <p className="lg-other"><Link href="/date-personale">Ce date personale ținem</Link></p>
        </aside>
      </div>
    </article>
  );
}
