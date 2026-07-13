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
            <strong>Praguri legale, în funcție de dată.</strong> Pragurile achiziției directe
            (132.519 lei produse/servicii, 441.730 lei lucrări, net TVA, Legea 98/2016) se
            aplicară conform perioadei fiecărei achiziții.
          </li>
          <li>
            <strong>Date curățate.</strong> Achizițiile cu valori corupte în sursă (peste 2
            mil. lei, imposibil pentru o achiziție directă) sunt excluse din calcul.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Acoperire</h2>
        <p className="hint">
          Momentan sunt analizate <strong>achizițiile directe</strong> (instantaneu 2020, 4,78
          milioane de tranzacții). Semnalele pentru proceduri de atribuire (licitații) sunt în
          pregătire și vor fi activate când datele live devin disponibile.
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
