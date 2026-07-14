/**
 * Flag presentation metadata (mirrors ingestion's flags/methodology.ts). Drives
 * badges, the /semnale explorer and /metodologie. Kept here so the web has no
 * runtime dependency on the ingestion package.
 */
export interface FlagMeta {
  code: string;
  title: string;
  subject: "da" | "award" | "authority" | "supplier" | "pair";
  short: string;
  description: string;
  rationale: string;
  caveat: string;
}

export const FLAG_META: Record<string, FlagMeta> = {
  da_split: {
    code: "da_split",
    title: "Fracționare sub prag",
    subject: "pair",
    short: "Achiziții împărțite pentru a evita procedura competitivă.",
    description:
      "Aceeași autoritate și același furnizor, mai multe achiziții directe într-un an, fiecare sub pragul legal, dar însumând peste prag.",
    rationale:
      "Împărțirea unei achiziții mari în mai multe achiziții directe evită procedura competitivă cerută peste prag (Legea 98/2016 art. 7).",
    caveat:
      "Nevoi recurente legitime (ex. consumabile lunare) pot arăta similar. Semnal, nu dovadă.",
  },
  da_concentration: {
    code: "da_concentration",
    title: "Concentrare pe un furnizor",
    subject: "authority",
    short: "Un furnizor primește o pondere disproporționată din cheltuială.",
    description:
      "Un singur furnizor primește o pondere disproporționată din cheltuiala pe achiziții directe a autorității (top-furnizor % și HHI).",
    rationale:
      "Dependența de un furnizor unic reduce concurența și crește riscul de favorizare.",
    caveat: "Piețe cu un singur furnizor real (monopol local) pot fi concentrate legitim.",
  },
  da_dependence: {
    code: "da_dependence",
    title: "Dependență de o autoritate",
    subject: "supplier",
    short: "Un furnizor trăiește aproape exclusiv dintr-o singură autoritate.",
    description:
      "Un furnizor obține cvasi-totalitatea veniturilor din achiziții directe de la o singură autoritate.",
    rationale: "Un furnizor „captiv” unei autorități poate indica o relație preferențială.",
    caveat: "Furnizori mici, locali, pot depinde firesc de un client principal.",
  },
  da_rapid: {
    code: "da_rapid",
    title: "Finalizare fulger",
    subject: "da",
    short: "Achiziție finalizată în câteva minute de la publicare.",
    description:
      "Achiziție finalizată la un interval foarte scurt după publicare (sub 10 minute).",
    rationale:
      "Acceptarea aproape instantanee sugerează o înțelegere prealabilă, fără testarea reală a pieței.",
    caveat: "Unele achiziții directe simple sunt legitim rapide. Se corelează cu alte semnale.",
  },
  da_round: {
    code: "da_round",
    title: "Valoare aproape de prag",
    subject: "da",
    short: "Valoare de închidere chiar sub pragul legal.",
    description:
      "Valoarea de închidere este chiar sub pragul legal aplicabil (peste 90% din prag).",
    rationale:
      "Valori imediat sub prag indică ajustare pentru a rămâne în achiziție directă.",
    caveat: "O singură achiziție sub prag este normală; semnalul contează în agregat.",
  },
  da_year_end: {
    code: "da_year_end",
    title: "Vârf de final de an",
    subject: "authority",
    short: "Cheltuială concentrată neobișnuit în decembrie.",
    description:
      "Pondere neobișnuit de mare a cheltuielii pe achiziții directe concentrată în decembrie (peste 35%).",
    rationale:
      "„Golirea bugetului” la final de an favorizează achiziții grăbite, slab justificate.",
    caveat: "Sezonalitate reală (ex. deszăpezire) poate explica vârfuri de iarnă.",
  },
  award_no_competition: {
    code: "award_no_competition",
    title: "Atribuire fără competiție",
    subject: "award",
    short: "Contract mare atribuit prin negociere fără publicare, fără concurență.",
    description:
      "Contract de valoare atribuit prin „negociere fără publicare prealabilă” — o procedură excepțională, fără anunț public și fără concurență.",
    rationale:
      "Procedura fără publicare este permisă doar în cazuri strict definite (urgență, exclusivitate). Folosirea ei pentru contracte mari ocolește concurența (Legea 98/2016 art. 104).",
    caveat:
      "Unele cazuri sunt legitime (urgențe reale, furnizor unic tehnic). Semnalul contează prin valoare și frecvență.",
  },
  award_single_bid: {
    code: "award_single_bid",
    title: "Ofertant unic la procedură deschisă",
    subject: "award",
    short: "Licitație deschisă de valoare mare, finalizată cu o singură ofertă.",
    description:
      "Procedură care ar trebui să fie competitivă (licitație deschisă/restrânsă) finalizată cu o singură ofertă, la contract de valoare mare.",
    rationale:
      "O licitație deschisă de valoare mare cu un singur ofertant sugerează cerințe croite pe măsura unui furnizor sau descurajarea concurenței.",
    caveat:
      "Piețe de nișă pot avea firesc un singur ofertant. Ofertant unic ≠ ilegal; e semnal de concurență slabă.",
  },
  award_concentration: {
    code: "award_concentration",
    title: "Concentrare pe un câștigător",
    subject: "authority",
    short: "Un furnizor câștigă o pondere disproporționată din contracte.",
    description:
      "Un singur furnizor câștigă o pondere disproporționată din valoarea contractelor atribuite de o autoritate (peste procese, nu doar achiziții directe).",
    rationale:
      "Concentrarea contractelor pe un câștigător unic reduce concurența și crește riscul de favorizare sistematică.",
    caveat:
      "Piețe cu un singur furnizor real pot fi concentrate legitim. Fereastra de date (2026) este scurtă.",
  },
  award_dependence: {
    code: "award_dependence",
    title: "Furnizor captiv unei autorități",
    subject: "supplier",
    short: "Furnizor activ, dar cu cvasi-totalitatea contractelor de la o autoritate.",
    description:
      "Un furnizor activ la mai multe autorități obține totuși cvasi-totalitatea valorii contractelor de la una singură.",
    rationale:
      "Un furnizor „captiv” unei autorități, deși prezent pe piață, poate indica o relație preferențială.",
    caveat:
      "Specializare reală pe un client mare poate explica dependența. Fereastra de date (2026) este scurtă.",
  },
};

export const FLAG_ORDER = [
  "da_split",
  "da_concentration",
  "da_dependence",
  "da_year_end",
  "da_rapid",
  "da_round",
  "award_no_competition",
  "award_single_bid",
  "award_concentration",
  "award_dependence",
];

/** Risk band for a CRI score, for coloring. */
export function criBand(cri: number): { label: string; className: string } {
  if (cri >= 0.6) return { label: "Ridicat", className: "risk-high" };
  if (cri >= 0.3) return { label: "Mediu", className: "risk-mid" };
  if (cri > 0) return { label: "Scăzut", className: "risk-low" };
  return { label: "Fără semnale", className: "risk-none" };
}
