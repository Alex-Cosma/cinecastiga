import DataCoverage from "@/components/DataCoverage";
import { FLAG_META, FLAG_ORDER } from "@/lib/flags";

export const dynamic = "force-dynamic";

const SUBJECT_LABEL: Record<string, string> = {
  da: "Per achiziție",
  authority: "Per autoritate",
  supplier: "Per furnizor",
  pair: "Per relație",
  award: "Per anunț de atribuire",
};

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
            <strong>Transparent și reproductibil.</strong> Indicele compus de risc (CRI) este
            ponderea semnalelor declanșate din cele aplicabile — fără scoruri ascunse.
          </li>
          <li>
            <strong>Praguri legale, în funcție de dată și tip.</strong> Pentru produse și servicii: 132.519 lei din 26.05.2016,
            135.060 lei din 04.06.2018 și 270.120 lei din 10.09.2022. Pentru lucrări: 441.730, 450.200, respectiv 900.400 lei,
            la aceleași date. Valorile sunt fără TVA (<a href="https://legislatie.just.ro/Public/DetaliiDocument/178667" target="_blank" rel="noreferrer">Legea 98/2016, art. 7 alin. 5</a>).
            Tipul declarat are prioritate; dacă lipsește, folosim clasificarea CPV. Publicarea aproximează inițierea;
            în lipsa ei folosim finalizarea. Aceste aproximări sunt declarate în dovezi. Clasificările necunoscute și datele
            anterioare datei de 26.05.2016 sunt excluse din comparația cu pragul. Legea privește necesarul estimat;
            valorile de închidere sunt un reper analitic.
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
          </li>
        </ul>
      </section>

      <section className="section" id="indice">
        <h2>Ce intră în indicele de risc?</h2>
        <p>Indicele compus de risc (CRI) folosește doar achizițiile directe acceptate, cu valoare pozitivă
          de cel mult 2 milioane lei, din întreaga perioadă disponibilă la calcul. Fiecare criteriu îndeplinit
          contează o singură dată. Criteriile neîndeplinite rămân în numitor, inclusiv când lipsesc date necesare verificării lor.</p>
        <ul className="prose">
          <li><strong>Autorități: 5 criterii.</strong> Posibilă fracționare sub prag, concentrare pe un furnizor,
            achiziții concentrate în decembrie, finalizare rapidă și valori aproape de prag.</li>
          <li><strong>Furnizori: 4 criterii.</strong> Posibilă fracționare sub prag, dependență de o autoritate,
            finalizare rapidă și valori aproape de prag.</li>
        </ul>
        <p>La finalizarea rapidă, criteriul din profil cere cel puțin 5 achiziții eligibile și mai mult de 25% dintre ele
          cu acest semnal. La valorile aproape de prag, cere cel puțin 5 achiziții și mai mult de 10% cu semnal.
          Pentru celelalte criterii este suficient cel puțin un semnal calculat, inclusiv într-un an istoric.</p>
        <p><strong>Exemplu: 3 / 5 = 0,60.</strong> Acesta nu este un procent de corupție. Etichetele sunt scăzut
          (peste 0 și sub 0,30), mediu (de la 0,30 până sub 0,60) și ridicat (de la 0,60).
          Scorul 0 înseamnă că aceste criterii nu au fost îndeplinite în datele evaluate, nu că am certificat lipsa neregulilor.</p>
        <p>Semnalele despre contracte prin proceduri, bilanțuri și reprezentanți ONRC nu intră în CRI.
          În profil, filtrele tabelului de achiziții nu recalculează acest scor. Datele incomplete pot schimba rezultatul;
          verifică perioada fiecărui semnal și sursele sale înainte de a trage o concluzie.</p>
      </section>

      <section className="section" id="acoperire">
        <h2>Ce date avem — și unde sunt limitele</h2>
        <DataCoverage />
      </section>

      <section className="section" id="totaluri">
        <h2>Cum se formează totalurile</h2>
        <p>Profilurile entităților, partenerii, harta și căutările obișnuite după valoare folosesc aceeași populație.
          Pentru proceduri sunt incluse contractele cu valoare pozitivă de cel mult 1 miliard lei, dată și autoritate cunoscute,
          cel puțin un câștigător și monedă RON. Înregistrările istorice fără monedă sunt tratate ca RON. Inventarul de mai sus declară lipsa monedei în toate înregistrările sursă, înainte de aplicarea celorlalte filtre. Această presupunere trebuie verificată în documentul sursă pentru o investigație.</p>
        <p>Pe profilul entității, fiecare contract apare o singură dată în numărul de contracte distincte. Căutările și lista surselor numără rânduri contract–furnizor:
          câte unul pentru fiecare câștigător. În lipsa cotelor reale, valoarea unui consorțiu este împărțită egal între membri.
          Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.</p>
        <p>Dacă același anunț conține un acord-cadru și contracte explicit subsecvente, excludem plafonul acordului din total.
          Acordurile fără subsecvente publicate rămân valori înregistrate și pot fi plafoane neutilizate. Anunțurile de atribuire
          și publicațiile TED descriu aceste achiziții și nu se adaugă ca o cheltuială suplimentară.</p>
        <p>Întrebările care numără înregistrări pot include valori pozitive peste filtrul de plauzibilitate; rezultatul și lista
          surselor declară această selecție. Analizele CRI folosesc istoricul achizițiilor directe acceptate și explică filtrele
          pe care le pot aplica. CRI este proporția unor criterii declanșate, nu probabilitatea unei ilegalități.</p>
        <p>Pentru TED păstrăm moneda și sensul sumei: valoare de ofertă/rezultat, interval, plafon de acord-cadru sau necunoscut.
          Ofertele multiple nu sunt adunate automat într-o valoare a lotului. Sumele în monede diferite nu sunt însumate.
          Un număr lipsă sau ambiguu de oferte nu este tratat ca o singură ofertă.</p>
      </section>

      <section className="section">
        <h2>Semnale</h2>
        {FLAG_ORDER.map((c) => {
          const m = FLAG_META[c]!;
          return (
            <div className="method-card" key={c} id={c}>
              <div className="method-head">
                <h3>{m.title}</h3>
                <span className="badge">{SUBJECT_LABEL[m.subject]}</span>
              </div>
              <p>
                <strong>Ce măsoară:</strong> {m.description}
              </p>
              <p>
                <strong>Ce merită verificat:</strong> {m.rationale}
              </p>
              <p className="note">
                <strong>Limită:</strong> {m.caveat}
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
          reconstrucție a marturilor, pentru fiecare autoritate.
        </p>
        <div className="method-card">
          <div className="method-head">
            <h3>Dependență reciprocă</h3>
          </div>
          <p>
            Pentru fiecare furnizor cu cel puțin 0,1% din contractele autorității (sau 500 k lei): ponderea lui în cheltuiala
            autorității, ponderea autorității în tot ce a câștigat el pe SEAP și raportul dintre <strong>valoarea contractată</strong> în
            ultimii patru ani cu bilanț și <strong>cifra de afaceri</strong> din anii acoperiți de acele contracte. Un contract
            simplu acoperă anul semnării; un acord-cadru (tipul vine din anunțul de atribuire) acoperă până la 4 ani, valoarea lui
            fiind un plafon, nu bani încasați. Un raport peste 1 poate însemna plafon nefolosit, încasări viitoare sau lucrări
            făcute de altcineva; e un semnal, nu o dovadă.
          </p>
        </div>
        <div className="method-card">
          <div className="method-head">
            <h3>Carusel de loturi</h3>
          </div>
          <p>
            Doar licitațiile cu cel puțin 3 contracte (loturi), grupate pe clasa CPV (4 cifre). Un consorțiu e un singur
            câștigător. Tiparele reținute trebuie să se <strong>repete</strong>: <strong>rotația</strong> (3+ câștigători care
            revin împreună în 2+ licitații), <strong>împărțirea în doi</strong> (2 câștigători care iau împreună toate loturile în
            2+ licitații), <strong>măturarea</strong> (un câștigător ia toate loturile în 2+ licitații), <strong>consorțiul
            stabil</strong> (aceiași parteneri în 3+ licitații, indiferent de loturi; verificăm în ONRC dacă membrii au același
            administrator, identitate = nume + data nașterii). Tăria: <em>puternic</em> = 3+ repetiții, sau ofertant unic dovedit
            pe 2+ loturi, sau același administrator; <em>mediu</em> = 2 repetiții între 3+ firme sau o măturare; <em>slab</em> în
            rest. „Aceiași actori în altă parte” caută același set câștigând împreună (2+ membri în aceeași licitație) la alte
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
          În „Explorează”, „Copiază întrebarea” copiază linkul cu filtrele aplicate. Pentru celelalte pagini,
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
