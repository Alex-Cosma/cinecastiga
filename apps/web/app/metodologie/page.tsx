import { DA_CEILING_ERAS } from "@seap/domain";
import DataCoverage from "@/components/DataCoverage";
import { AWARD_COUNTING_CAVEAT, FLAG_META, FLAG_ORDER, flagLabel } from "@/lib/flags";
import { coverageDate } from "@/lib/coverage";
import { formatInt } from "@/lib/format";
import { RISK_BAND_CLASS, RISK_CRITERIA, type RiskCriterion } from "@/lib/risk-score";
import "./metodologie.css";

export const dynamic = "force-dynamic";

const SUBJECT_LABEL: Record<string, string> = {
  da: "Per achiziție",
  authority: "Per autoritate",
  supplier: "Per furnizor",
  pair: "Per relație",
  award: "Per anunț de atribuire",
};

/** Who a criterion of the risk score applies to (RISK_CRITERIA, both roles or one). */
function scoreRoles(code: string): string | null {
  const inst = (RISK_CRITERIA.authority as readonly string[]).includes(code);
  const firm = (RISK_CRITERIA.supplier as readonly string[]).includes(code);
  return inst && firm ? "instituții și firme" : inst ? "instituții" : firm ? "firme" : null;
}

/**
 * The strength levels of each pattern of the risk score (rf-2026.18,
 * packages/db/src/profile-flags.ts): level 1 is the pattern itself (its rule on
 * the card below); levels 2 and 3 need a profile of 20 DAs and 500.000 lei.
 */
const LEVELS: { code: RiskCriterion; l1: string; l2: string; l3: string }[] = [
  { code: "da_split", l1: "cel puțin un grup", l2: "grupurile au 10% din valoare (firme: 25%)", l3: "25% (firme: 50%)" },
  { code: "da_round", l1: "peste 10% din achiziții la 96–100% din plafon (minimum 5); la instituții și 5 astfel de achiziții, dacă sunt 1%", l2: "peste 25%", l3: "peste 50%" },
  { code: "da_year_end", l1: "un an", l2: "doi ani", l3: "trei ani sau mai mulți" },
  { code: "da_concentration", l1: "60% din valoare la un furnizor", l2: "75%", l3: "90%" },
  { code: "da_dependence", l1: "85% din vânzări la o instituție (minimum 250.000 lei și 5 achiziții cu ea)", l2: "firma are 20% din achizițiile directe ale instituției", l3: "50%" },
  { code: "da_above_ceiling", l1: "2 cazuri", l2: "4 cazuri, sau 3 cu 5% din valoare", l3: "10 cazuri, sau 4 cu 20% din valoare" },
];

const BANDS: { band: keyof typeof RISK_BAND_CLASS; range: string; word: string }[] = [
  { band: "none", range: "0%", word: "niciun tipar găsit" },
  { band: "slab", range: "20–39%", word: "slab" },
  { band: "moderat", range: "40–67%", word: "moderat" },
  { band: "puternic", range: "68–100%", word: "puternic" },
];

export default function MetodologiePage() {
  return (
    <>
      <h1 className="page-title">Metodologie</h1>
      <p className="page-sub">
        Cum calculăm semnalele de risc și ce înseamnă (și ce nu înseamnă).
      </p>

      <section className="section">
        <h2>Principii</h2>
        <ul className="prose">
          <li>
            <strong>Semnal, nu dovadă.</strong> Un semnal indică un tipar care merită
            verificat, nu o ilegalitate. Fiecare are limite (fals-pozitive) documentate mai jos.
          </li>
          <li>
            <strong>Transparent și reproductibil.</strong> Scorul de risc pornește de la tiparele de mai jos, cu
            pragurile lor; tăria fiecărui tipar și formula sunt publice, fără ponderi ascunse.
          </li>
          <li>
            <strong>Praguri legale, în funcție de dată și tip.</strong> Valorile sunt fără TVA (<a href="https://legislatie.just.ro/Public/DetaliiDocument/178667" target="_blank" rel="noreferrer">Legea 98/2016, art. 7 alin. 5</a>).
            <table className="rank method-thresholds">
              <thead><tr><th scope="col">Din</th><th scope="col" className="num">Produse și servicii</th><th scope="col" className="num">Lucrări</th></tr></thead>
              <tbody>{DA_CEILING_ERAS.map((era) => <tr key={era.validFrom}><td>{coverageDate(era.validFrom)}</td><td className="num">{formatInt(era.goodsServices)} lei</td><td className="num">{formatInt(era.works)} lei</td></tr>)}</tbody>
            </table>
            <ul>
              <li>Tipul declarat are prioritate; dacă lipsește, folosim clasificarea CPV. Clasificările necunoscute și datele
                anterioare datei de 26.05.2016 sunt excluse din comparația cu pragul.</li>
              <li>Publicarea aproximează inițierea; în lipsa ei folosim finalizarea. Aceste aproximări sunt declarate în dovezi.</li>
              <li>Legea privește necesarul estimat; valorile de închidere sunt un reper analitic.</li>
            </ul>
          </li>
          <li>
            <strong>Valori înregistrate, nu plăți confirmate.</strong> Totalurile obișnuite folosesc achiziții directe acceptate,
            cu valoare pozitivă de cel mult 2 milioane lei, plus contracte prin proceduri din selecția descrisă mai jos.
            O ofertă acceptată sau un contract semnat nu dovedește că banii au fost plătiți. Ofertele refuzate sau expirate
            nu intră în aceste totaluri.
          </li>
          <li>
            <strong>Excluderi explicite.</strong> Limita de 2 milioane lei pentru o achiziție directă este un filtru analitic de plauzibilitate,
            nu pragul legal și nici dovada unei erori. Valorile nule, nepozitive sau peste această limită rămân accesibile
            în lista achizițiilor unei entități, prin opțiunea „Arată achizițiile directe excluse din total”.
            Contractele prin proceduri peste 1 miliard lei sunt separate de totaluri după aceeași logică: limita este un filtru
            al aplicației, nu dovada unei erori. Inventarul de mai jos le numără și le însumează, pagina instituției și a furnizorului
            le listează, iar pagina contractului arată că nu este inclus în totaluri.
          </li>
        </ul>
      </section>

      <section className="section" id="indice">
        <h2>Cum se calculează riscul?</h2>
        <p className="hint">Scorul de risc, de la 0 la 100%, arată câte tipare au achizițiile directe ale unei instituții sau firme
          și cât de pronunțate sunt. <strong>Nu este o probabilitate de corupție.</strong> Un tipar este o pistă de verificat, nu o dovadă.</p>
        <ul className="prose">
          <li><strong>Datele.</strong> Achizițiile directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, din toată arhiva.
            Filtrele unei pagini sau ale unei întrebări nu schimbă scorul.</li>
          <li><strong>Instituții, {RISK_CRITERIA.authority.length} tipare:</strong>{" "}
            {RISK_CRITERIA.authority.map((c, i) => <span key={c}>{i ? ", " : ""}<a href={`#${c}`}>{flagLabel(c)}</a></span>)}.</li>
          <li><strong>Firme, {RISK_CRITERIA.supplier.length} tipare:</strong>{" "}
            {RISK_CRITERIA.supplier.map((c, i) => <span key={c}>{i ? ", " : ""}<a href={`#${c}`}>{flagLabel(c)}</a></span>)}.</li>
          <li>Semnalele din proceduri, bilanțuri și ONRC nu intră în scor; pagina entității le arată separat.</li>
        </ul>

        <h3 id="niveluri">Cât de pronunțat e un tipar</h3>
        <p>Fiecare tipar găsit are o tărie de la 1 la 3, după nivelul atins; între praguri crește proporțional (de exemplu 2,5 la
          jumătatea drumului spre nivelul 3). <strong>Nivelurile 2 și 3 cer cel puțin 20 de achiziții directe și 500.000 lei</strong>;
          sub acestea, un tipar găsit are tăria 1.</p>
        <table className="rank method-levels">
          <thead><tr><th scope="col">Tipar</th><th scope="col">Nivelul 1</th><th scope="col">Nivelul 2</th><th scope="col">Nivelul 3</th></tr></thead>
          <tbody>{LEVELS.map((l) => <tr key={l.code}>
            <th scope="row"><a href={`#${l.code}`}>{flagLabel(l.code)}</a> <span className="county">{scoreRoles(l.code)}</span></th>
            <td data-l="Nivelul 1">{l.l1}</td><td data-l="Nivelul 2">{l.l2}</td><td data-l="Nivelul 3">{l.l3}</td>
          </tr>)}</tbody>
        </table>
        <p className="note">La achizițiile repetate, valoarea din CPV-urile Anexei 2 (servicii cu procedură proprie) nu ridică nivelul.
          În decembrie, un an contează când ponderea lunii e printre cele mai mari 5% la instituțiile de același tip și de cel puțin 35%;
          între niveluri contează cât de aproape de prag a fost cel mai înalt decembrie nesemnalat.</p>

        <h3 id="formula">Formula</h3>
        <p>Un tipar la tăria x ia 20% × x din ce a rămas până la 100%: la tăria maximă, 60%. Tiparele se combină, nu se adună peste 100%:</p>
        <p className="method-formula"><code>risc = 100 × (1 − (1 − 0,2·x₁) × (1 − 0,2·x₂) × …)</code></p>
        <ul className="prose">
          <li>Un singur tipar ajunge cel mult la 60%; nivelul 1 singur dă 20%; două tipare la nivelul 1 dau 36%.</li>
          <li><strong>Exemplu:</strong> achiziții repetate la tăria 2,51 și chiar sub plafon la 2,24: 100 × (1 − 0,498 × 0,552) ≈ 73%.
            Pagina entității îl împarte în puncte: 73% = 39 + 34, partea fiecărui tipar, rotunjită ca suma să fie scorul.</li>
        </ul>

        <h3 id="benzi">Benzile</h3>
        <p className="method-bands">{BANDS.map((b) => <span key={b.band}><span className={`cri-pill ${RISK_BAND_CLASS[b.band]}`}>{b.range}</span> {b.word}</span>)}</p>
        <p>Sub 20% nu există: cel mai slab tipar dă 20%. 0% înseamnă că tiparele nu apar în datele evaluate, nu că am certificat lipsa
          neregulilor. Datele incomplete pot schimba rezultatul; verifică perioada fiecărui semnal și sursele lui.</p>

        <p id="grup-comparatie"><strong>Față de cine?</strong> „Mai multe tipare decât X% dintre …” (pagina entității) apare doar la riscul
          moderat și puternic: o firmă slabă ar trece înaintea multor firme fără niciun tipar. X% sunt membrii grupului cu un scor mai mic.
          „Unde se situează?” din „Întreabă” arată câți au un scor mai mare, egal sau mai mic. Grupurile: primăriile după populație
          (RPL 2021, între jumătate și dublul populației; comune, orașe și municipii împreună, doar cele identificate sigur), consiliile
          județene, primăriile de sector, spitalele și școlile după tip; firmele și instituțiile fără un tip sigur, toată țara. În „Întreabă”
          se mai pot alege județul și activitatea apropiată (între jumătate și dublul achizițiilor directe). Intră profilurile cu cel puțin
          10 achiziții directe; comparația cere cel puțin 5 alți membri.</p>
        <p id="cine-conduce"><strong>Cine conduce?</strong> După valoare, „Cine conduce?” arată primele trei locuri ale clasamentului
          „Cine câștigă?”, cu partea din total a fiecăruia (valoare înregistrată, nu plăți; în contractele în asociere, cotele sunt egale).
          După risc arată profilurile cu tipare în ordinea scorului (la același procent, după valoarea
          achizițiilor directe), cu tiparele fiecăruia. Intră doar profilurile cu cel puțin 20 de achiziții directe acceptate. Un nume de cumpărător cu forma unei
          societăți sau a unei asociații e marcat ca atare; poate fi o companie a unei instituții sau un cumpărător privat. Semnalele sunt piste, nu dovezi.</p>

        <details className="method-fold" id="schimbari-risc">
          <summary>Ce s-a schimbat la 1 noiembrie 2026</summary>
          <ul className="method-list">
            <li>Indicele de risc (criteriile îndeplinite împărțite la 5 sau 4: 0; 0,20; 0,25 …) devine scorul de risc, de la 0 la 100%,
              care ține seama și de cât de pronunțat e fiecare tipar. Metodologia: versiunea rf‑2026.18.</li>
            <li>„Finalizare rapidă” a fost retrasă: nu are temei în lege și apărea la majoritatea instituțiilor.</li>
            <li>Tipar nou: <a href="#da_above_ceiling">„Peste plafonul achiziției directe”</a>, doar unde excepțiile cunoscute nu se pot aplica
              (Anexa 2, CPV 33, companii și operatori de utilități, 26.02–14.05.2020, Unifarm, plafonul de lucrări, valori de peste două ori estimarea).</li>
            <li>„Chiar sub plafon” (fost „Aproape de prag”) începe de la 96% din plafon, nu de la 90%.</li>
            <li>„Dependență de o autoritate” cere 250.000 lei (nu 50.000) și cel puțin 5 achiziții cu instituția principală.</li>
            <li>„Vârf în decembrie” compară fiecare an cu instituțiile de același tip din același an, nu doar cu pragul de 35%.</li>
            <li>„Posibilă fracționare” se numește „Achiziții repetate, peste plafon cumulat”; regula nu s-a schimbat.</li>
            <li>Un link vechi cu un interval al indicelui (0–1) selectează aceleași procente; o urmărire primește o singură notificare
              „Metodologie modificată”. Un răspuns salvat înainte își păstrează cifrele de atunci.</li>
          </ul>
        </details>
      </section>

      <section className="section" id="acoperire">
        <h2>Ce date avem — și unde sunt limitele</h2>
        <DataCoverage />
      </section>

      <section className="section" id="totaluri">
        <h2>Cum se formează totalurile</h2>
        <details className="method-fold">
          <summary>Ce intră în totaluri</summary>
          <p>Profilurile entităților, partenerii, harta și căutările obișnuite după valoare folosesc aceeași populație.
            Pentru proceduri sunt incluse contractele cu valoare pozitivă de cel mult 1 miliard lei, dată și autoritate cunoscute,
            cel puțin un câștigător diferit de autoritatea contractantă și valoare RON verificată (declarată sau convertită din sursă).
            Când singurul câștigător înregistrat este chiar autoritatea, furnizorul nu este cunoscut: contractul rămâne vizibil, marcat, dar nu intră în totaluri.
            O achiziție directă al cărei furnizor înregistrat este chiar autoritatea rămâne în totalul autorității, ca o achiziție fără furnizor cunoscut,
            dar nu apare ca venit de furnizor, partener sau dependență. Fără monedă ori conversie verificabilă, suma nu intră în totaluri. Inventarul declară lipsurile din înregistrările sursă înainte de celelalte filtre.</p>
        </details>
        <details className="method-fold">
          <summary>Consorții</summary>
          <p>Pe profilul entității, fiecare contract apare o singură dată în numărul de contracte distincte. Căutările și lista surselor numără rânduri contract–furnizor:
            câte unul pentru fiecare câștigător. În lipsa cotelor reale, valoarea unui consorțiu este împărțită egal între membri.
            Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.</p>
        </details>
        <details className="method-fold">
          <summary>Acorduri-cadru</summary>
          <p>Toate plafoanele acordurilor-cadru sunt separate de totaluri, inclusiv când nu avem subsecvente identificate.
            Însumăm numai contractele și comenzile identificate. Lipsa comenzilor este o limită de acoperire, nu cheltuială zero.
            Folosim tipul declarat de SEAP; pentru istoricul fără tip, folosim descrierea.
            Încadrarea după descriere poate greși, de exemplu un acord-cadru al cărui titlu nu spune asta;{" "}
            <a href="#acoperire">inventarul</a> arată câte contracte și ce valoare depind de ea.</p>
        </details>
        <details className="method-fold" id="diferente-ani">
          <summary>Diferențe între ani</summary>
          <p>În „Întreabă”, schimbarea între doi ani împarte firmele (sau instituțiile, ori județele) selecției în Creșteri, Noi, Scăderi și Nu mai apar;
            cele cu aceeași valoare în ambii ani se numără separat, iar grupele adună totalul selecției.
            Noi înseamnă fără nicio înregistrare în primul an, în selecție; Nu mai apar, fără niciuna în al doilea; Prima dată, dintre cele noi,
            cele a căror primă înregistrare din toată arhiva este în al doilea an.
            Un contract intră întreg în anul atribuirii, nu în anii în care se execută. Când al doilea an nu e încheiat în date,
            ambii ani se compară pe aceleași luni, din ianuarie până la ultima lună completă. Valorile sunt înregistrate, nu plăți.</p>
        </details>
        <details className="method-fold" id="grupele-retelei">
          <summary>Partenerii unei entități</summary>
          <p>În „Întreabă”, „Cu cine lucrează X?” împarte partenerii față de un an de referință, încheiat în date (din 2021):
            Noi, cu prima înregistrare a relației din acel an încoace; Continuă, cu înregistrări și înainte, și de atunci; Nu mai apar, fără nicio
            înregistrare din acel an. Grupele privesc toate achizițiile dintre cei doi, pe toate canalele; domeniul, canalul sau sediul aleg doar cine
            apare și valorile, iar perioada se aplică doar la Toți. „Cu semnale” păstrează partenerii cu un semnal oficial pe acea relație.
            O urmărire pe o grupă își fixează partenerii la activare; cei care intră sau ies din grupă apar doar ca notă.
            Semnalele sunt piste, nu dovezi; valorile sunt înregistrate, nu plăți.</p>
        </details>
        <details className="method-fold" id="verificare">
          <summary>Verificarea unei relații</summary>
          <p>În „Întreabă”, „A cumpărat X de la Y?” are trei răspunsuri. Da: cel puțin o înregistrare a perechii în selecție, sau un rând
            pe care totalurile îl lasă afară (o achiziție directă peste filtrul de 2 milioane lei ori fără valoare pozitivă, un contract cu identitate
            nesigură, peste 1 miliard lei, fără valoare în lei sau de tip neclar); acesta din urmă se spune „nu intră în sume”. Acord-cadru: perechea are doar plafoane
            de acord-cadru, care nu sunt cumpărări și nu se adună. Nu: nimic din acestea, cu motivul (alegerile întrebării, o condiție dintr-un link
            vechi sau nicio înregistrare în date). Concurența se numără doar la licitațiile deschise și restrânse cu numărul ofertelor cunoscut din TED.
            Ponderea relației compară perechea cu ceilalți parteneri ai fiecărei părți, cu aceleași alegeri. Un „Da” nu dovedește livrarea sau plata.</p>
        </details>
        <details className="method-fold">
          <summary>Republicări</summary>
          <p>Când SEAP republică același contract (același anunț, număr, dată, lot și autoritate), îl numărăm o singură dată, la ultima versiune verificată.
            Acceptăm și versiunile pe care SEAP nu le marchează ca modificate, dacă diferă doar valoarea, dacă se adaugă furnizori fără să dispară vreunul
            sau dacă titlul numește un act adițional. Astfel de schimbări sunt semnalate pe pagina contractului. Un titlu schimbat fără mențiunea unui act
            adițional rămâne exclus până la verificare. Pentru procedurile publicate fără identificator de procedură (negociere fără publicare prealabilă,
            norme proprii) folosim numărul anunțului de atribuire.</p>
        </details>
        <details className="method-fold" id="numarare-anunturi">
          <summary>Semnale pe anunțuri</summary>
          <p>Semnalele pe anunțuri de atribuire („Negociere fără publicare prealabilă”, „O singură ofertă raportată în TED”) se numără
            altfel: o apariție pentru fiecare anunț. SEAP republică un anunț de atribuire sub același număr când adaugă contracte subsecvente;
            versiunile aceleiași autorități cu același număr de anunț dau o singură apariție, la ultima versiune care îndeplinește criteriul.
            Anul semnalului este anul primului contract din anunț, din oricare versiune, nu data ultimei versiuni. Un anunț fără contract
            cu dată plauzibilă primește anul primei versiuni preluate, iar semnalul spune asta.
            Același contract republicat sub alt număr de anunț, sau un acord-cadru și
            contractul subsecvent atribuit din el, pot apărea ca apariții separate. Fiecare semnal spune ce conține anunțul: contracte
            obișnuite, doar plafonul unui acord-cadru, doar contracte subsecvente sau tipuri diferite. Valoarea unui anunț care conține doar
            un acord-cadru este plafonul acordului, nu o cheltuială; valorile semnalelor nu se adună la niciun total.</p>
        </details>
        <details className="method-fold">
          <summary>Excluderi temporare</summary>
          <p>Publicațiile cu identitate incertă sunt excluse temporar din calcule, fără ștergerea surselor.
            <a href="/metodologie/excluderi"> Lista cazurilor, motivele și sursele comparate</a> este publică.
            Le reverificăm la procesarea datelor; reintră în totaluri numai după verificarea identității.
            Această excludere nu este o constatare de neregulă.</p>
        </details>
        <details className="method-fold">
          <summary>Acte adiționale</summary>
          <p>Actele adiționale identificate rămân accesibile în surse, dar nu sunt adăugate ca achiziții noi:
            suma publicată poate reprezenta un total actualizat, o diferență sau o modificare fără impact financiar.
            Până la verificarea legăturii cu contractul inițial, totalurile nu includ separat aceste sume și pot să nu reflecte toate ajustările.</p>
        </details>
        <details className="method-fold">
          <summary>Întrebări și scorul de risc</summary>
          <p>Întrebările care numără înregistrări pot include valori pozitive peste filtrul de plauzibilitate; rezultatul și lista
            surselor declară această selecție. Răspunsurile despre risc folosesc tot istoricul achizițiilor directe acceptate și spun
            ce filtre pot aplica. Scorul arată tipare de verificat, nu probabilitatea unei ilegalități (<a href="#indice">cum se calculează</a>).</p>
        </details>
        <details className="method-fold" id="tip-institutie">
          <summary>Tipul instituției</summary>
          <p>Întrebările și comparațiile folosesc aceeași clasificare. Primăriile de comună, oraș și municipiu vin din registrul localităților,
            doar când codul localității este din județul instituției și numele este al administrației locale (primărie, consiliu local, UAT).
            Fără cod, căutăm o singură localitate cu același nume în același județ; altfel decide numele („Primăria comunei …” este o comună).
            Primăriile celor șase sectoare ale Bucureștiului sunt numărate cu orașele și municipiile.
            Spitalele sunt numele care încep cu „Spital” și institutele clinice, de exemplu Fundeni sau institutele oncologice;
            institutele de medicină legală și de cercetare nu intră. Consiliile județene sunt cele 41 din lista valorii pe locuitor, oricum s-ar numi în SEAP
            („UAT Județul Alba”, „Consiliul Județul Prahova, Direcția Servicii și Achiziții Publice”). Școlile (cu liceele, colegiile și grădinițele, dar și școli de aviație, poliție sau pompieri)
            sunt după nume, aproximativ. Un nume care se potrivește la două tipuri nu are tip, iar o instituție cu nume neobișnuit poate rămâne fără tip.</p>
        </details>
        <details className="method-fold" id="sediul-firmei">
          <summary>Sediul firmei</summary>
          <p>Județul unei firme, oriunde apare (clasamentele, harta furnizorilor, condiția „cu sediul în …”), este sediul ei social:
            județul ultimei înmatriculări la Registrul Comerțului, pentru un cod fiscal confirmat; când lipsește sau nu e clar, județul din SEAP.
            Firmele străine apar separat. „În județul instituției” și „În alt județ” compară sediul cu județul instituției care cumpără, la fiecare înregistrare.
            Sediul nu e locul lucrării: multe firme mari au sediul în București. O firmă fără sediu cunoscut nu intră în nicio condiție de sediu.</p>
        </details>
        <details className="method-fold" id="harta-judete">
          <summary>Harta pe județe</summary>
          <p>Fiecare înregistrare stă în județul instituției care cumpără. „Harta arată” schimbă doar culoarea și ordinea, nu selecția.
            Culorile sunt cinci grupe cu același număr de județe (cuantile); hașurat înseamnă prea puține date pentru un procent.
            „Firme din județ” este partea valorii câștigată de firme cu sediul în județul instituției, din toată valoarea județului
            (cu firmele din alte județe, din străinătate și cu sediu necunoscut); e hașurat sub 20 de înregistrări sau când sediul lipsește
            pentru peste 10% din valoare. „Cota firmei” este valoarea firmei din toate achizițiile județului cu aceleași condiții, hașurată sub 3
            înregistrări ale firmei sau 20 ale județului. Fișa județului arată cel mai mare cumpărător și cea mai mare înregistrare, cu procentul lor din județ.</p>
          <p>„Primăriile și consiliile județene” sunt lista strictă de la valoarea pe locuitor (nume, județ și cod SIRUTA concordante, plus primăriile
            celor șase sectoare și toate cele 41 de consilii județene), fără instituțiile, serviciile și companiile lor. Fiecare stă în județul pe care îl administrează: Consiliul Județean
            Ilfov, cu sediul în București, e la Ilfov. „Pe locuitor” împarte valoarea lor la populația rezidentă a județului (INS, RPL 2021);
            un județ al cărui consiliu județean nu e încă în listă e hașurat. Pe mai mulți ani, cifra e a întregii perioade, nu o medie pe an.</p>
        </details>
        <details className="method-fold" id="marimea-achizitiei">
          <summary>Mărimea, procedura și tipul achiziției</summary>
          <p>Mărimea este valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător: un contract de 1,2 mil. lei cu doi câștigători
            intră la „peste 1 mil. lei”, iar sumele rămân pe cote. Plajele (sub 10.000 lei, 10.000–100.000, 100.000–1 mil., peste 1 mil.) nu sunt praguri legale.
            Procedura este cea declarată în SEAP, doar la contractele din proceduri; negocierea fără publicare este permisă în cazuri anume.
            Tipul vine din codul CPV ales de cumpărător: 45 lucrări, 50–98 servicii, restul produse.</p>
        </details>
        <details className="method-fold" id="angajati-benzi">
          <summary>Angajații firmelor</summary>
          <p>Benzile (fără angajați, 1–9, 10–49, 50–249, 250 sau mai mulți) vin din ultimul bilanț depus la Ministerul Finanțelor, nu din anul atribuirii.
            Firmele fără bilanț (străine, PFA, înființate recent) nu intră în nicio bandă. Pe un clasament de firme banda restrânge lista;
            totalul și „% din total” rămân ale întregii selecții.</p>
        </details>
        <details className="method-fold">
          <summary>TED</summary>
          <p>Pentru TED păstrăm moneda și sensul sumei: valoare de ofertă/rezultat, interval, plafon de acord-cadru sau necunoscut.
            Ofertele multiple nu sunt adunate automat într-o valoare a lotului. Sumele în monede diferite nu sunt însumate.
            Un număr lipsă sau ambiguu de oferte nu este tratat ca o singură ofertă.</p>
        </details>
      </section>

      <section className="section">
        <h2>Semnale</h2>
        {FLAG_ORDER.map((c) => {
          const m = FLAG_META[c]!;
          const roles = scoreRoles(c);
          return (
            <div className="method-card" key={c} id={c}>
              <div className="method-head">
                <h3>{m.title}</h3>
                <span className="badge">{SUBJECT_LABEL[m.subject]}</span>
              </div>
              {roles && <p className="hint">În scorul de risc ({roles}): <a href="#niveluri">nivelurile</a>.</p>}
              <p>
                <strong>Ce măsoară:</strong> {m.description}
              </p>
              <p>
                <strong>Ce merită verificat:</strong> {m.rationale}
              </p>
              <p className="note">
                <strong>Limită:</strong> {m.caveat.endsWith(AWARD_COUNTING_CAVEAT)
                  ? <>{m.caveat.slice(0, -AWARD_COUNTING_CAVEAT.length)}Numărare pe anunț: vezi <a href="#numarare-anunturi">Cum se formează totalurile</a>.</>
                  : m.caveat}
              </p>
            </div>
          );
        })}
      </section>

      <section className="section" id="radiografie">
        <h2>Radiografie</h2>
        <p>
          Pagina <em>Radiografie</em> a unei autorități contractante arată tiparele structurale pe care scorul de risc nu le
          vede: concentrarea atribuirilor, câștigători care reapar la aceleași proceduri și grupuri de achiziții directe sub prag. Toate se recalculează la fiecare
          actualizare a datelor, pentru fiecare autoritate.
        </p>
        <div className="method-card">
          <div className="method-head">
            <h3>Dependență reciprocă</h3>
          </div>
          <p>
            Pentru fiecare furnizor cu cel puțin 0,1% din contractele autorității (sau 500 k lei): ponderea lui în valoarea
            contractată de autoritate, ponderea autorității în tot ce a câștigat el pe SEAP și raportul dintre <strong>valoarea contractată</strong> în
            ultimii patru ani cu bilanț și <strong>cifra de afaceri</strong> din anii acoperiți de acele contracte. Un contract
            sau o comandă identificată acoperă anul semnării; plafoanele acordurilor-cadru sunt excluse. Un raport peste 1 poate însemna încasări viitoare sau lucrări
            făcute de altcineva; e un semnal, nu o dovadă.
          </p>
        </div>
        <div className="method-card">
          <div className="method-head">
            <h3>Carusel de loturi</h3>
          </div>
          <p>
            Doar licitațiile cu cel puțin 3 contracte (loturi), grupate pe clasa CPV (4 cifre). Un consorțiu e un singur
            câștigător. Tiparele reținute trebuie să se <strong>repete</strong>:
          </p>
          <ul className="method-list">
            <li><strong>rotația</strong>: 3+ câștigători care revin împreună în 2+ licitații;</li>
            <li><strong>împărțirea în doi</strong>: 2 câștigători care iau împreună toate loturile în 2+ licitații;</li>
            <li><strong>măturarea</strong>: un câștigător ia toate loturile în 2+ licitații;</li>
            <li><strong>consorțiul stabil</strong>: aceiași parteneri în 3+ licitații, indiferent de loturi; verificăm în ONRC dacă membrii au același
              administrator, identitate = nume + data nașterii.</li>
          </ul>
          <p>Tăria:</p>
          <ul className="method-list">
            <li><em>puternic</em>: 3+ repetiții, sau ofertant unic dovedit pe 2+ loturi, sau același administrator;</li>
            <li><em>mediu</em>: 2 repetiții între 3+ firme sau o măturare;</li>
            <li><em>slab</em>: în rest.</li>
          </ul>
          <p>
            „Aceiași actori în altă parte” caută același set câștigând împreună (2+ membri în aceeași licitație) la alte
            autorități. Numărul ofertelor provine din loturi TED asociate cu încredere ridicată; lipsa sau ambiguitatea datelor
            rămâne necunoscută. Orice rotație rămâne o pistă de verificat.
          </p>
        </div>
        <div className="method-card">
          <div className="method-head">
            <h3>Feliere de achiziții directe</h3>
          </div>
          <p>
            Cel puțin 3 achiziții directe din aceeași clasă CPV și același tip, într-o fereastră de cel mult 60 de zile;
            fiecare strict sub plafonul propriu. Suma se compară cu cel mai mare plafon aplicabil achizițiilor din fereastră.
            Sunt luate în calcul și pragurile pentru lucrări. Se reține fereastra cu cel mai mare raport față de plafon.
          </p>
        </div>
      </section>
      <section className="section" id="citare">
        <h2>Cum citez</h2>
        <p className="hint">
          În „Întreabă”, „Copiază întrebarea” copiază linkul cu filtrele aplicate. Pentru celelalte pagini,
          copiază adresa din browser. Citează astfel: „<i>titlul paginii sau întrebarea</i>” — cinecâștigă?,
          perioada analizată, sursa indicată în rezultat, data consultării și linkul.
        </p>
        <p className="hint">
          Linkul nu îngheață datele: păstrează și exportul surselor pentru cifrele citate.
          Semnalele sunt piste de verificare, nu dovezi de ilegalitate.
        </p>
      </section>
    </>
  );
}
