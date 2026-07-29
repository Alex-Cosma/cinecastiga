/**
 * Red-flag methodology registry (red-flags DEC-007). Single source of truth for
 * flag definitions — consumed by the flag build (evidence/labels) and the web
 * `/metodologie` page. Bump `METHODOLOGY_VERSION` when a rule or threshold
 * changes; every flag instance is stamped with it.
 */
export const METHODOLOGY_VERSION = "rf-2026.4";

export type FlagSubject = "da" | "award" | "authority" | "supplier" | "pair";

export interface FlagDef {
  code: string;
  title: string;
  subject: FlagSubject;
  /** What it measures. */
  description: string;
  /** Why it is a risk signal. */
  rationale: string;
  /** Known false-positive modes — the "signal, not proof" honesty. */
  caveat: string;
}

export const FLAG_DEFS: FlagDef[] = [
  {
    code: "da_split",
    title: "Fracționare sub prag",
    subject: "pair",
    description:
      "Aceeași autoritate și același furnizor, mai multe achiziții directe într-un an, fiecare sub pragul legal, dar însumând peste prag.",
    rationale:
      "Pragul legal e per achiziție (art. 7 alin. 5, Legea 98/2016), nu anual — dar legea interzice divizarea unei achiziții pentru a evita procedura (art. 11) și cere agregarea necesarului anual pe produse similare. Suma anuală către același partener, de câteva ori peste prag, e semnul tipic al divizării. Pragul s-a modificat în timp — 132.519 lei (2016 – iun. 2018), 135.060 lei (iun. 2018 – 2022, OUG 45/2018), 270.120 lei (din ian. 2023, Legea 208/2022) pentru produse/servicii; 441.730 / 450.200 / 900.400 lei pentru lucrări — și aplicăm pragul în vigoare la data fiecărei achiziții.",
    caveat:
      "Nevoi recurente legitime (ex. consumabile lunare) pot arăta similar. Într-un an care traversează o schimbare de prag, suma se compară cu pragul cel mai mare din acel an (interpretarea prudentă). Semnal, nu dovadă.",
  },
  {
    code: "da_concentration",
    title: "Concentrare pe un furnizor",
    subject: "authority",
    description:
      "Un singur furnizor primește o pondere disproporționată din cheltuiala pe achiziții directe a autorității (top-furnizor % și HHI).",
    rationale:
      "Dependența de un furnizor unic reduce concurența și crește riscul de favorizare.",
    caveat:
      "Piețe cu un singur furnizor real (monopol local) pot fi concentrate legitim.",
  },
  {
    code: "da_dependence",
    title: "Dependență de o autoritate",
    subject: "supplier",
    description:
      "Un furnizor obține cvasi-totalitatea veniturilor din achiziții directe de la o singură autoritate.",
    rationale:
      "Un furnizor „captiv” unei autorități poate indica o relație preferențială.",
    caveat: "Furnizori mici, locali, pot depinde firesc de un client principal.",
  },
  {
    code: "da_rapid",
    title: "Finalizare fulger",
    subject: "da",
    description:
      "Achiziție finalizată la un interval foarte scurt după publicare (sub pragul de ore configurat).",
    rationale:
      "Acceptarea aproape instantanee sugerează o înțelegere prealabilă, fără testarea reală a pieței.",
    caveat:
      "Unele achiziții directe simple sunt legitim rapide. Se corelează cu alte semnale.",
  },
  {
    code: "da_round",
    title: "Valoare aproape de prag",
    subject: "da",
    description:
      "Valoarea de închidere este chiar sub pragul legal aplicabil (ex. 90–100% din prag), pragul fiind cel în vigoare la data achiziției (132.519 / 135.060 / 270.120 lei pentru produse/servicii, după perioadă).",
    rationale:
      "Valori bunched imediat sub prag indică ajustare pentru a rămâne în achiziție directă.",
    caveat: "O singură achiziție sub prag este normală; semnalul contează în agregat.",
  },
  {
    code: "da_year_end",
    title: "Vârf de cheltuială la final de an",
    subject: "authority",
    description:
      "Pondere neobișnuit de mare a cheltuielii pe achiziții directe concentrată în decembrie.",
    rationale:
      "„Golirea bugetului” la final de an favorizează achiziții grăbite, slab justificate.",
    caveat: "Sezonalitate reală (ex. deszăpezire) poate explica vârfuri de iarnă.",
  },
  // ── Award (contract-award notice) flags ─────────────────────────────────────
  {
    code: "award_no_competition",
    title: "Atribuire fără competiție",
    subject: "award",
    description:
      "Contract de valoare atribuit prin „negociere fără publicare prealabilă” — o procedură excepțională, fără anunț public și fără concurență.",
    rationale:
      "Procedura fără publicare este permisă doar în cazuri strict definite (urgență, exclusivitate). Folosirea ei pentru contracte mari, repetat, ocolește concurența (Legea 98/2016 art. 104).",
    caveat:
      "Unele cazuri sunt legitime (urgențe reale, furnizor unic tehnic). Semnalul contează prin valoare și frecvență.",
  },
  {
    code: "award_single_bid",
    title: "Ofertant unic la procedură deschisă",
    subject: "award",
    description:
      "Procedură care ar trebui să fie competitivă (licitație deschisă/restrânsă) finalizată cu o singură ofertă, la contract de valoare mare.",
    rationale:
      "O licitație deschisă de valoare mare cu un singur ofertant sugerează cerințe croite pe măsura unui furnizor sau descurajarea concurenței.",
    caveat:
      "Piețe de nișă pot avea firesc un singur ofertant. Ofertant unic ≠ ilegal; e semnal de concurență slabă.",
  },
  {
    code: "award_concentration",
    title: "Concentrare pe un câștigător (contracte)",
    subject: "authority",
    description:
      "Un singur furnizor câștigă o pondere disproporționată din valoarea contractelor atribuite de o autoritate (peste procese, nu doar achiziții directe).",
    rationale:
      "Concentrarea contractelor pe un câștigător unic reduce concurența și crește riscul de favorizare sistematică.",
    caveat:
      "Piețe cu un singur furnizor real pot fi concentrate legitim. Fereastra de date (2026) este scurtă — a se interpreta cu prudență.",
  },
  {
    code: "award_dependence",
    title: "Furnizor captiv unei autorități (contracte)",
    subject: "supplier",
    description:
      "Un furnizor activ la mai multe autorități obține totuși cvasi-totalitatea valorii contractelor de la una singură.",
    rationale:
      "Un furnizor „captiv” unei autorități, deși prezent pe piață, poate indica o relație preferențială.",
    caveat:
      "Specializare reală pe un client mare poate explica dependența. Fereastra de date (2026) este scurtă.",
  },
  {
    code: "fin_tiny_staff",
    title: "Firmă minusculă, bani publici mari",
    subject: "supplier",
    description:
      "Furnizor cu cel mult 5 salariați (numărul mediu din bilanțul MF al aceluiași an) care încasează peste 2 mil. lei bani publici într-un singur an.",
    rationale:
      "O firmă fără personal care rulează contracte publice mari poate fi paravan sau intermediar — munca reală o face altcineva, iar marja rămâne la intermediar.",
    caveat:
      "Holdinguri, SPV-uri imobiliare, dealeri/importatori și firmele de consultanță cu subcontractare pot fi legitime cu personal minim. Salariații vin din bilanțul anual — zilierii și subcontractorii nu apar. Valorile atribuite pot include plafoane de acord-cadru, nu plăți efective.",
  },
  {
    code: "fin_public_reliance",
    title: "Dependență de bani publici",
    subject: "supplier",
    description:
      "Pe anii cu bilanț depus, valoarea contractată public a firmei reprezintă cel puțin 75% din întreaga sa cifră de afaceri (minim 1 mil. lei public).",
    rationale:
      "O firmă care trăiește aproape exclusiv din achiziții publice depinde de relația cu statul, nu de piață — teren fertil pentru relații preferențiale.",
    caveat:
      "Raportul compară valori contractate (nu încasări efective) cu cifra de afaceri; contractele multianuale și acordurile-cadru pot împinge raportul peste 1. Sectoare aproape exclusiv publice (ex. lucrări de drumuri) au firesc valori mari.",
  },
  {
    code: "net_shared_admin",
    title: "Firme surori la aceeași autoritate",
    subject: "supplier",
    description:
      "Două sau mai multe firme administrate de aceeași persoană (reprezentant legal la Registrul Comerțului, identificat prin nume + data și locul nașterii) încasează împreună bani publici de la aceeași autoritate.",
    rationale:
      "Împărțirea afacerii pe firme-surori ascunde concentrarea reală pe un singur beneficiar: fiecare firmă pare mică, dar aceeași persoană controlează întregul flux — inclusiv ca metodă de a ocoli pragurile și semnalele de fracționare pe o singură firmă.",
    caveat:
      "Administratorii nu sunt neapărat asociații/proprietarii, iar datele sunt instantaneul ONRC curent — nu administratorii de la momentul achizițiilor. Grupuri legitime de firme cu specializări diferite pot arăta similar.",
  },
];
