import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, mailHref } from "@/lib/site";
import "../legal.css";

export const metadata: Metadata = {
  title: "Date personale",
  description: "Ce date despre persoane ține cinecâștigă?, de unde vin și cum ceri corectarea sau ștergerea lor.",
};

/** The day this text last changed; change it with the text. */
const UPDATED = "19 noiembrie 2026";

/*
 * The information notice (GDPR art. 13–14; legal audit, 18 November 2026; owner, 19 November 2026). Every statement
 * describes what the code does on that day:
 *  - the register table (reference.company_reps) holds name, role, birth date and place, locality of residence; the
 *    site shows name, role, birth year and birth locality (lib/format.ts birthNote), never the day or the residence;
 *  - the register is replaced whole by each import (apps/ingestion/src/reference/onrc-import.ts);
 *  - documents with a CNP or an identity card are held back (migration 0112);
 *  - accounts keep name, e-mail, password hash, sessions with IP address and browser (packages/db schema auth);
 *  - „Feedback” keeps the text, its category and a public path, nothing about the sender (lib/feedback.ts);
 *  - cookies: the session of a signed-in reader and cc_tour (lib/tour.ts); theme and view mode stay in the browser.
 * Change the text when one of these changes. The operator is not named until the association exists (owner).
 */
export default function DatePersonalePage() {
  return (
    <article className="lg">
      <header className="lg-head">
        <h1>Date personale</h1>
        <p className="lg-lede">Ce date despre persoane ținem, de unde vin și cum ceri corectarea sau ștergerea lor.</p>
      </header>
      <div className="lg-cols">
        <div className="lg-text">
          <section>
            <h2>Cine răspunde de date</h2>
            <p>Răspunde proiectul {SITE_NAME} până la înființarea asociației care îl va administra; numele și datele ei vor apărea aici. Până atunci, orice cerere se trimite la <a href={mailHref("Date personale")}>{CONTACT_EMAIL}</a>.</p>
          </section>

          <section>
            <h2>Ce date ținem și de unde</h2>
            <p>Site-ul e despre contracte publice, nu despre oameni. Unele date publice despre contracte și firme privesc însă persoane.</p>
            <dl className="lg-rows">
              <div className="lg-row">
                <dt>Administratori și alți reprezentanți ai firmelor</dt>
                <dd>
                  <p><b>Ce ținem:</b> numele, calitatea în firmă, data și locul nașterii, localitatea de domiciliu (fără stradă).</p>
                  <p><b>Sursa:</b> Registrul Comerțului (ONRC), setul de date deschise publicat pe data.gov.ro. Îl preluăm întreg: peste 2,5 milioane de persoane.</p>
                  <p><b>Ce se vede pe site:</b> numele, calitatea, anul și localitatea nașterii, firmele în care persoana apare. O persoană poate fi căutată după nume. Ziua și luna nașterii și domiciliul nu se afișează.</p>
                </dd>
              </div>
              <div className="lg-row">
                <dt>Persoane care contractează în nume propriu</dt>
                <dd>
                  <p><b>Ce ținem:</b> numele din denumirea furnizorului (PFA, cabinet individual, întreprindere individuală), codul fiscal și contractele.</p>
                  <p><b>Sursa:</b> SEAP / SICAP.</p>
                  <p><b>Ce se vede pe site:</b> aceleași lucruri ca la orice furnizor.</p>
                </dd>
              </div>
              <div className="lg-row">
                <dt>Persoane numite în documentele de achiziție</dt>
                <dd>
                  <p><b>Ce ținem:</b> documentele publicate în SEAP, cu numele și funcțiile din ele.</p>
                  <p><b>Ce se vede pe site:</b> documentul, așa cum a fost publicat, și căutarea în textul lui. Un document care conține un CNP sau seria unui act de identitate nu se afișează.</p>
                </dd>
              </div>
              <div className="lg-row">
                <dt>Cei care au cont</dt>
                <dd>
                  <p><b>Ce ținem:</b> numele, adresa de e-mail, parola (doar ca amprentă criptografică), sesiunile cu adresa IP și tipul browserului, ce salvează în cont.</p>
                  <p><b>Sursa:</b> persoana însăși. Conturile se deschid la cerere.</p>
                  <p><b>Ce se vede pe site:</b> nimic public.</p>
                </dd>
              </div>
              <div className="lg-row">
                <dt>Cei care ne scriu</dt>
                <dd>
                  <p><b>Pe e-mail:</b> adresa și mesajul.</p>
                  <p><b>Prin butonul „Feedback”:</b> textul, tipul problemei și pagina. Fără nume, e-mail sau adresă IP.</p>
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>De ce le folosim</h2>
            <p>Ca să se vadă cine câștigă contracte din bani publici și ce legături există între firme. Temeiul este interesul legitim (art. 6 alin. 1 lit. f din GDPR): datele vin din registre publice și folosim doar ce e necesar ca să recunoaștem aceeași persoană în mai multe firme.</p>
            <p>Pentru conturi și mesaje, temeiul este serviciul cerut de persoană.</p>
            <p>Nu luăm decizii automate despre persoane. Semnalele și scorul descriu achiziții și sunt piste de verificat, nu concluzii.</p>
            <p>Nu îi putem anunța unul câte unul pe toți cei din registru, pentru că nu avem datele lor de contact. De aceea publicăm această pagină.</p>
          </section>

          <section>
            <h2>Cât le păstrăm</h2>
            <ul>
              <li><b>Registrul:</b> la fiecare actualizare, de obicei săptămânală, îl înlocuim cu versiunea publicată de ONRC. Cine nu mai e în setul public dispare și din paginile noastre.</li>
              <li><b>Contractele și documentele:</b> rămân în arhivă, fără un termen fix.</li>
              <li><b>Contul:</b> până la închiderea lui.</li>
              <li><b>Mesajele:</b> le păstrăm ca evidență a corecturilor.</li>
            </ul>
          </section>

          <section>
            <h2>Cine mai are acces</h2>
            <p>Furnizorii fără de care site-ul nu poate funcționa: găzduirea (în Uniunea Europeană), rețeaua prin care trece traficul și serviciul care trimite e-mailurile către cei cu cont. Ultimele două sunt operate de companii din Statele Unite.</p>
            <p>Nu vindem date și nu le dăm altcuiva.</p>
          </section>

          <section>
            <h2>Cookie-uri și urmărire</h2>
            <p>Nu folosim reclame, statistici de trafic sau urmărire. Există două cookie-uri: cel de sesiune, doar pentru cine intră în cont, și unul care ține minte că ai văzut turul de bun venit (un an). Tema și modul de afișare rămân în browserul tău.</p>
            <p>Rețeaua prin care trece traficul prelucrează adresa IP ca să livreze paginile și să oprească abuzurile.</p>
          </section>

          <section id="drepturi">
            <h2>Drepturile tale</h2>
            <p>Poți cere să afli ce date avem despre tine, corectarea lor, ștergerea, restricționarea sau te poți opune folosirii lor. Scrie la <a href={mailHref("Date personale")}>{CONTACT_EMAIL}</a>, cu linkul paginii unde apari.</p>
            <p>Răspundem în cel mult 10 zile lucrătoare; legea dă o lună. Dacă nu reiese din mesaj că cererea te privește, îți cerem un detaliu în plus.</p>
            <p>La o cerere de ștergere sau de opoziție punem în balanță interesul public al datelor despre contracte publice. Îți răspundem cu motivele, oricare ar fi rezultatul.</p>
            <p>Dacă datele sunt greșite chiar în registru, corectarea se cere la ONRC; la noi apare la următoarea actualizare.</p>
            <p>Te poți plânge și la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal: <a href="https://www.dataprotection.ro">dataprotection.ro</a>.</p>
          </section>

          <p className="lg-stamp">Ultima actualizare: {UPDATED}.</p>
        </div>
        <aside className="lg-side" aria-labelledby="lg-short">
          <h2 id="lg-short">Pe scurt</h2>
          <ul className="lg-points">
            <li>Datele vin din registre publice: SEAP și Registrul Comerțului.</li>
            <li>Nu afișăm ziua nașterii, CNP-uri sau adrese de domiciliu.</li>
            <li>Fără reclame și fără urmărire.</li>
            <li>Cereri la <a href={mailHref("Date personale")}>{CONTACT_EMAIL}</a>, cu răspuns în cel mult 10 zile lucrătoare.</li>
          </ul>
          <p className="lg-other"><Link href="/despre">Despre și contact</Link></p>
        </aside>
      </div>
    </article>
  );
}
