import Link from "next/link";

/** How the comparison is made, folded under the list (owner: terse copy, details on demand). */
export default function PriceMethod() {
  return <details className="pr-method">
    <summary>Cum am comparat</summary>
    <ul>
      <li><b>Sursa.</b> Liniile achizițiilor directe acceptate din SEAP: denumirea scrisă de instituție, cantitatea, unitatea și prețul final pe unitate, fără TVA. Pentru 2018 și 2019 le avem pe toate; din 2020 încoace doar o parte, deci acei ani nu apar încă.</li>
      <li><b>Unitatea.</b> Socotim prețul pe kilogram, litru sau bucată din unitatea scrisă; la o bucată sau un pachet folosim mărimea din denumire („franzelă 600 g”, „cutie 100 buc”). Fără o mărime clară, sau cu două, linia nu intră în comparație.</li>
      <li><b>Același produs.</b> Un produs se recunoaște după denumire, cu excepțiile scrise pe pagina lui (fără cartofi prăjiți, fără ouă de ciocolată…). Ambalajele se compară separat: o sticlă de 0,33 l nu se compară cu un bidon de 5 l.</li>
      <li><b>Mediana.</b> Prețul unei instituții e tot ce a plătit pentru produs într-un an, împărțit la toată cantitatea. Mediana e prețul instituției din mijloc. Un produs apare doar cu cel puțin cinci instituții în an.</li>
      <li><b>Peste dublu.</b> O instituție care, într-un an, a plătit de cel puțin două ori mediana acelui an. Poate fi un preț umflat, dar și un produs mai bun, livrat în altă parte sau scris greșit în SEAP: deschide liniile și achizițiile înainte de orice concluzie.</li>
      <li><b>Lei peste mediană.</b> Cât a contractat instituția peste ce ar fi costat aceeași cantitate la mediană. Sunt valori contractate, nu plăți.</li>
    </ul>
    <p>Metoda completă și limitele ei: <Link href="/metodologie">Metodologie</Link>.</p>
  </details>;
}
