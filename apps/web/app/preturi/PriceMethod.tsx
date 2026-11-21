import Link from "next/link";
import HowNote from "@/components/HowNote";
import { LEAD_RULE } from "@/lib/unit-prices";
import { countWord, formatLei } from "@/lib/unit-prices-shared";

/** How the comparison is made, under the list (owner: terse copy, details on demand), in the box that floats over the
 * page (owner, 20 November 2026; before: a fold that pushed the page down). The lead's rule is read from LEAD_RULE, so
 * the words follow the mart. The method is Complet's (owner, 18 November 2026). */
export default function PriceMethod() {
  return <HowNote title="Cum am comparat" only="complet">
    <span className="tip-li"><b>Sursa.</b> Liniile achizițiilor directe acceptate din SEAP: denumirea scrisă de instituție, cantitatea, unitatea și prețul pe unitate, fără TVA. Sunt valori contractate, nu plăți.</span>
    <span className="tip-li"><b>Anii.</b> Din 2018 până azi. Anul în curs se completează zilnic, așa că numerele lui se mai schimbă.</span>
    <span className="tip-li"><b>Unitatea.</b> Socotim prețul pe kilogram, litru sau bucată din unitatea scrisă; la o bucată sau un pachet folosim mărimea din denumire („franzelă 600 g”, „cutie 100 buc”). Fără o mărime clară, sau când unitatea și denumirea nu se potrivesc, linia nu intră în comparație.</span>
    <span className="tip-li"><b>Același produs.</b> Un produs se recunoaște după denumire, cu excepțiile scrise pe pagina lui. O bucată mai mică decât minimul produsului (un borcan, un plic) nu e același produs. Unde produsul are ambalaje, se compară separat: o sticlă de 0,33 l nu se compară cu un bidon de 5 l.</span>
    <span className="tip-li"><b>Ce rămâne afară.</b> Prețurile în afara intervalului plauzibil al produsului, liniile cu un preț amestecat pentru mai multe produse și contractele-plafon pe un an, cu cantități estimate.</span>
    <span className="tip-li"><b>Mediana.</b> Prețul unei instituții e tot ce a contractat pentru produs într-un an, împărțit la toată cantitatea. Mediana e prețul instituției din mijloc, în acel an. Un produs apare cu cel puțin cinci instituții în an.</span>
    <span className="tip-li"><b>Peste dublu.</b> O instituție care, într-un an, a cumpărat la cel puțin {LEAD_RULE.ratio === 2 ? "de două ori" : `de ${LEAD_RULE.ratio} ori`} mediana anului, în cel puțin {LEAD_RULE.awards === 2 ? "două achiziții" : countWord(LEAD_RULE.awards, "o achiziție", "achiziții")}, cu cel puțin {formatLei(LEAD_RULE.excess)} peste mediană, la un produs cu cel puțin {countWord(LEAD_RULE.buyers, "o instituție", "instituții")} în acel an. E o pistă, nu o dovadă: poate fi un preț umflat, dar și un produs mai bun, livrat în altă parte sau scris greșit în SEAP. Deschide liniile și achizițiile înainte de orice concluzie.</span>
    <span className="tip-li"><b>Marca și ambalajul.</b> Un produs de marcă sau într-un ambalaj mic poate ieși peste dublul medianei fără să fie scump pentru felul lui. E o pistă de verificat, nu o concluzie.</span>
    <span className="tip-li"><b>Sezonul.</b> Legumele și fructele proaspete se compară tot cu mediana întregului an: o achiziție în afara sezonului poate ieși peste dublu fără să fie scumpă pentru luna ei.</span>
    <span className="tip-li"><b>Lei peste mediană.</b> Cât a contractat instituția peste ce ar fi costat aceeași cantitate la mediană.</span>
    <span className="tip-li"><b>Punctele.</b> Pe bandă apar cele mai mari prețuri peste dublu, în ordinea listei (implicit, cel mai mare multiplu); numele e al primului. Restul sunt în lista produsului.</span>
    <span className="tip-p">Metoda completă și limitele ei: <Link href="/metodologie">Metodologie</Link>.</span>
  </HowNote>;
}
