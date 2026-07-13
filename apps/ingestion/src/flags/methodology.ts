/**
 * Red-flag methodology registry (red-flags DEC-007). Single source of truth for
 * flag definitions — consumed by the flag build (evidence/labels) and the web
 * `/metodologie` page. Bump `METHODOLOGY_VERSION` when a rule or threshold
 * changes; every flag instance is stamped with it.
 */
export const METHODOLOGY_VERSION = "rf-2020.1";

export type FlagSubject = "da" | "authority" | "supplier" | "pair";

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
];
