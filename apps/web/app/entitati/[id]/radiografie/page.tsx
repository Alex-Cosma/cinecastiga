import Link from "next/link";
import { notFound } from "next/navigation";
import { getRadiografie } from "@/lib/radiografie";
import { formatRon, formatInt } from "@/lib/format";
import Headlines from "./Headlines";
import DependencyScatter from "./DependencyScatter";
import LotMatrix from "./LotMatrix";
import DaStrips from "./DaStrips";
import { encodeSpec } from "@/lib/ask/permalink";

export const dynamic = "force-dynamic";

/**
 * Radiografie: the structural lenses a watchdog reads before the risk score —
 * who depends on whom, who divides the lots, who slices the direct awards.
 * Authority-side only; see apps/ingestion/src/flags/radiografie.ts for the rules.
 */
export default async function RadiografiePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getRadiografie(id);
  if (!data) notFound();
  const { profile: p } = data;

  return (
    <div className="rx">
      <header className="rx-header">
        <p className="rx-eyebrow">
          <Link href={`/entitati/${p.id}`}>← profil</Link> · radiografie · autoritate contractantă
        </p>
        <h1>{p.name}</h1>
        <p className="rx-sub num">
          {formatRon(p.totalContracts)} în contracte · {p.firstYear}–{p.lastYear} · {formatInt(p.nContracts)} contracte ·{" "}
          {formatInt(p.nDas)} achiziții directe
          {p.cri != null ? ` · scor de risc ${p.cri.toFixed(1).replace(".", ",")}` : ""}
        </p>
        <Headlines items={data.headlines} />
      </header>

      <section>
        <p className="rx-eyebrow">dependență</p>
        <h2>Cine trăiește din această autoritate?</h2>
        <details className="rx-how">
          <summary>cum citesc</summary>
          <p>
            Fiecare bulă e un furnizor cu cel puțin 0,1% din contractele autorității (sau 500 k lei), cel mult 150. <b>Orizontal</b>: cât din
            banii autorității ajung la el. <b>Vertical</b>: cât din tot ce a câștigat firma pe SEAP vine de aici. Colțul de sus
            e locul unde firme trăiesc dintr-un singur client. Culoarea compară <b>valoarea contractată</b> aici în{" "}
            {data.win.from}–{data.win.to} cu <b>cifra de afaceri</b> a firmei din anii acoperiți de contracte: un contract simplu
            acoperă anul semnării, un acord-cadru acoperă până la 4 ani (valoarea lui e un plafon, nu bani încasați). Un raport
            peste 1 poate reflecta un plafon nefolosit, venituri recunoscute în alți ani sau lucrări făcute de altcineva.
          </p>
        </details>
        {data.dep.length ? (
          <DependencyScatter rows={data.dep} win={data.win} authorityName={p.name} />
        ) : (
          <div className="rx-panel" id="rx-dep">
            <p className="rx-silence">Niciun furnizor peste pragul de afișare.</p>
          </div>
        )}
        {data.dep.length > 0 && <details className="rx-how"><summary>Verifică sursele unui furnizor</summary><div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">Furnizor</th><th scope="col">Contracte și cote</th></tr></thead><tbody>{data.dep.map(supplier => <tr key={supplier.id}><td><Link href={`/entitati/${supplier.id}`}>{supplier.name}</Link></td><td><Link href={`/intreaba?spec=${encodeURIComponent(encodeSpec({ block: "fact_check", dataset: "contracts", measure: "value", filters: { authorityId: Number(p.id), supplierId: Number(supplier.id) } }))}&drill=1`}>Vezi contractele relației →</Link></td></tr>)}</tbody></table></div></details>}
      </section>

      <section>
        <p className="rx-eyebrow">loturi</p>
        <h2>Cine împarte loturile?</h2>
        <details className="rx-how">
          <summary>cum citesc</summary>
          <p>
            Doar licitațiile cu cel puțin 3 loturi, grupate pe clase CPV. Apar doar clasele în care un tipar se <b>repetă</b>:{" "}
            <b>rotația</b> (același grup de firme revine, fiecare cu câte un lot), <b>măturarea</b> (o firmă ia toate loturile,
            licitație după licitație), <b>consorțiul stabil</b> (aceiași parteneri, licitație după licitație; verificăm și dacă
            au același administrator în ONRC). Un consorțiu e un singur câștigător. Celula spune câte loturi din total a luat.{" "}
            <b>Roșu</b> = lot cu o singură ofertă raportată; <b>auriu</b> = cel mult 2 oferte; gri = fără date sau ≥3 oferte.
            Numărul ofertelor provine din loturi TED asociate cu încredere ridicată; lipsa sau ambiguitatea datelor rămâne necunoscută. Listele de ofertanți respinși nu sunt disponibile aici: o rotație
            rămâne pistă, nu concluzie.
          </p>
        </details>
        <LotMatrix families={data.families} patterns={data.patterns} familiesWithLots={data.familiesWithLots} familiesTotal={data.familiesTotal} />
        {data.patterns.length > 0 && <details className="rx-how"><summary>Verifică sursele unui tipar de loturi</summary><ul>{data.patterns.map(pattern => <li key={pattern.id}><Link href={`/entitati/${p.id}/radiografie/surse?tip=pattern&tipar=${pattern.id}&fingerprint=${pattern.fingerprint}`}>CPV {pattern.cpvClass} · {pattern.memberNames.join(" + ")} · {pattern.reps} repetări →</Link></li>)}</ul></details>}
      </section>

      <section>
        <p className="rx-eyebrow">achiziții directe</p>
        <h2>Unde se adună achiziții mici?</h2>
        <details className="rx-how">
          <summary>cum citesc</summary>
          <p>
            Cel puțin 3 achiziții directe din aceeași clasă CPV și același tip, într-o fereastră de cel mult 60 de zile;
            fiecare este strict sub plafonul propriu, iar suma depășește cel mai mare plafon aplicabil grupului.
            Linia punctată arată plafoanele fără TVA pentru tipul grupului: lucrări sau produse/servicii, cu schimbările din
            26.05.2016, 04.06.2018 și 10.09.2022. Banda aurie marchează fereastra, iar punctele roșii intră în suma afișată.
            Tipul declarat are prioritate; dacă lipsește, folosim CPV. Publicarea aproximează inițierea; în lipsa ei folosim finalizarea.
            Datele sau tipurile necunoscute nu primesc un plafon. Legea privește necesarul estimat, iar noi comparăm valorile de închidere:
            o clasă CPV comună și o sumă mare nu dovedesc fracționarea ilegală.
          </p>
        </details>
        <DaStrips rows={data.slices} nSuppliers={data.nDaSuppliers} authorityId={p.id} />
      </section>

      <footer className="rx-foot">
        <details>
          <summary>metodologie și limite</summary>
          <p>
            Valorile contractelor pot fi acorduri-cadru multianuale, deci raportul la cifra de afaceri e orientativ; tipul
            contractului vine din anunțul de atribuire. Listele de ofertanți respinși nu există în date. Administratorii vin din
            ONRC (identitate = nume + data nașterii); numărul de oferte provine din loturi TED asociate cu încredere ridicată. Pragurile: ≥3 loturi, ≥2
            repetiții, 60 de zile pentru feliere, 4 ani pentru acorduri-cadru. Vezi <Link href="/metodologie">metodologia</Link>.
          </p>
        </details>
      </footer>
    </div>
  );
}
