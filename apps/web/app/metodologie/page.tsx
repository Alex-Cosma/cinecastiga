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
    </>
  );
}
