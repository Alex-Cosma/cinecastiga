import Link from "next/link";
import { LEAD_RULE } from "@/lib/unit-prices";
import { countWord, formatLei } from "@/lib/unit-prices-shared";

/** How the comparison is made, folded under the list (owner: terse copy, details on demand). The lead's rule is read
 * from LEAD_RULE, so the words follow the mart. */
export default function PriceMethod() {
  return <details className="pr-method">
    <summary>Cum am comparat</summary>
    <ul>
      <li><b>Sursa.</b> Liniile achizițiilor directe acceptate din SEAP: denumirea scrisă de instituție, cantitatea, unitatea și prețul pe unitate, fără TVA. Sunt valori contractate, nu plăți.</li>
      <li><b>Anii.</b> 2018 și 2019 sunt compleți. Din 2025 și 2026 avem doar o mică parte din achiziții: benzile se văd, dar de obicei sunt prea puține instituții pentru piste. Anii 2020–2024 lipsesc.</li>
      <li><b>Unitatea.</b> Socotim prețul pe kilogram, litru sau bucată din unitatea scrisă; la o bucată sau un pachet folosim mărimea din denumire („franzelă 600 g”, „cutie 100 buc”). Fără o mărime clară, sau când unitatea și denumirea nu se potrivesc, linia nu intră în comparație.</li>
      <li><b>Același produs.</b> Un produs se recunoaște după denumire, cu excepțiile scrise pe pagina lui. O bucată mai mică decât minimul produsului (un borcan, un plic) nu e același produs. Unde produsul are ambalaje, se compară separat: o sticlă de 0,33 l nu se compară cu un bidon de 5 l.</li>
      <li><b>Ce rămâne afară.</b> Prețurile în afara intervalului plauzibil al produsului, liniile cu un preț amestecat pentru mai multe produse și contractele-plafon pe un an, cu cantități estimate.</li>
      <li><b>Mediana.</b> Prețul unei instituții e tot ce a contractat pentru produs într-un an, împărțit la toată cantitatea. Mediana e prețul instituției din mijloc, în acel an. Un produs apare cu cel puțin cinci instituții în an.</li>
      <li><b>Peste dublu.</b> O instituție care, într-un an, a cumpărat la cel puțin {LEAD_RULE.ratio === 2 ? "de două ori" : `de ${LEAD_RULE.ratio} ori`} mediana anului, în cel puțin {LEAD_RULE.awards === 2 ? "două achiziții" : countWord(LEAD_RULE.awards, "o achiziție", "achiziții")}, cu cel puțin {formatLei(LEAD_RULE.excess)} peste mediană, la un produs cu cel puțin {countWord(LEAD_RULE.buyers, "o instituție", "instituții")} în acel an. E o pistă, nu o dovadă: poate fi un preț umflat, dar și un produs mai bun, livrat în altă parte sau scris greșit în SEAP. Deschide liniile și achizițiile înainte de orice concluzie.</li>
      <li><b>Sezonul.</b> Legumele și fructele proaspete se compară tot cu mediana întregului an: o achiziție în afara sezonului poate ieși peste dublu fără să fie scumpă pentru luna ei.</li>
      <li><b>Lei peste mediană.</b> Cât a contractat instituția peste ce ar fi costat aceeași cantitate la mediană.</li>
      <li><b>Punctele.</b> Fiecare preț peste dublu are o liniuță pe bandă; punctele sunt doar cele mai mari, după lei peste mediană, iar numele e al celui mai mare.</li>
    </ul>
    <p>Metoda completă și limitele ei: <Link href="/metodologie">Metodologie</Link>.</p>
  </details>;
}
