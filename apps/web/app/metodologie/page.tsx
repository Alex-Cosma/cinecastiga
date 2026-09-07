import { FLAG_META, FLAG_ORDER } from "@/lib/flags";

export const dynamic = "force-dynamic";

const SUBJECT_LABEL: Record<string, string> = {
  da: "Per achiziție",
  authority: "Per autoritate",
  supplier: "Per furnizor",
  pair: "Per relație",
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
            <strong>Praguri legale, în funcție de dată.</strong> Pragul achiziției directe
            (art. 7 alin. 5, Legea 98/2016, net TVA) s-a schimbat în timp: 132.519 lei
            (2016 – iun. 2018), 135.060 lei (iun. 2018 – 2022, OUG 45/2018), 270.120 lei
            (din ian. 2023, Legea 208/2022) pentru produse/servicii — respectiv 441.730 /
            450.200 / 900.400 lei pentru lucrări. Fiecare achiziție e judecată după pragul în
            vigoare la data ei.
          </li>
          <li>
            <strong>Doar bani care s-au mișcat.</strong> Comenzile refuzate de furnizor sau
            neacceptate la termen (~6% din înregistrările SEAP) nu sunt cheltuială și sunt
            excluse din totaluri și semnale. Când un anunț publică și acordul-cadru și
            contractele subsecvente, plafonul acordului nu se adună — banii reali sunt
            comenzile.
          </li>
          <li>
            <strong>Date curățate, nu ascunse.</strong> Valorile corupte în sursă (peste 2 mil.
            lei pe o achiziție directă, sau de 100+ ori peste estimat — erori tipice de
            introducere) sunt excluse din totaluri, dar rămân vizibile în liste, marcate ⚠ cu
            explicație.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Acoperire</h2>
        <p className="hint">
          Sunt analizate <strong>achizițiile directe</strong> (2018–prezent, ~19,6 milioane de
          tranzacții finalizate) și <strong>contractele atribuite prin proceduri</strong>{" "}
          (licitații, ~1,1 milioane), plus surse de context: bilanțurile firmelor (MF),
          reprezentanții legali (ONRC) și anunțurile TED. Semnalele acoperă ambele canale.
        </p>
      </section>

      <section className="section">
        <h2>Semnale</h2>
        {FLAG_ORDER.map((c) => {
          const m = FLAG_META[c]!;
          return (
            <div className="method-card" key={c}>
              <div className="method-head">
                <h3>{m.title}</h3>
                <span className="badge">{SUBJECT_LABEL[m.subject]}</span>
              </div>
              <p>
                <strong>Ce măsoară:</strong> {m.description}
              </p>
              <p>
                <strong>De ce e un risc:</strong> {m.rationale}
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
          vede: cine depinde de cine, cine împarte loturile, cine feliază achizițiile directe. Toate se recalculează la fiecare
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
            autorități. Numărul de oferte e publicat de SICAP doar la licitațiile deschise; listele de ofertanți respinși nu există
            în date, deci orice rotație rămâne pistă.
          </p>
        </div>
        <div className="method-card">
          <div className="method-head">
            <h3>Feliere de achiziții directe</h3>
          </div>
          <p>
            Un furnizor apare când are cel puțin 3 achiziții directe din aceeași clasă CPV, într-o fereastră de 60 de zile, a
            căror sumă depășește plafonul legal pentru servicii și produse (135.060 lei până în 2022, 270.120 lei din 2023).
            Se reține fereastra cu cel mai mare raport față de plafon. Plafonul pentru lucrări e mai mare și nu e aplicat.
          </p>
        </div>
      </section>
    </>
  );
}
