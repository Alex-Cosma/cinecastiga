/**
 * Red-flag methodology registry (red-flags DEC-007). Single source of truth for
 * flag definitions — consumed by the flag build (evidence/labels) and the web
 * `/metodologie` page. Bump `METHODOLOGY_VERSION` when a rule or threshold
 * changes; every flag instance is stamped with it.
 */
export const METHODOLOGY_VERSION = "rf-2026.1";

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
      "Împărțirea unei achiziții mari în mai multe achiziții directe evită procedura competitivă cerută peste prag (Legea 98/2016 art. 7).",
    caveat:
      "Nevoi recurente legitime (ex. consumabile lunare) pot arăta similar. Semnal, nu dovadă.",
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
      "Valoarea de închidere este chiar sub pragul legal aplicabil (ex. 90–100% din prag).",
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
];
