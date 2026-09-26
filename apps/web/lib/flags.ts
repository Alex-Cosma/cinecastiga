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
    short: "Achiziții din aceeași clasă CPV și același tip, însumând peste plafonul de referință.",
    description:
      "Cel puțin 3 achiziții directe între aceeași autoritate și același furnizor, în același an, aceeași clasă CPV și același tip de achiziție. Fiecare este sub plafonul de referință propriu, iar suma depășește cel mai mare plafon aplicabil grupului.",
    rationale:
      "Legea 98/2016 art. 7(5) privește valoarea estimată fără TVA, iar art. 11 interzice divizarea pentru evitarea procedurii. Plafoanele pentru produse/servicii sunt 132.519 lei din 26.05.2016, 135.060 lei din 04.06.2018 și 270.120 lei din 10.09.2022; pentru lucrări: 441.730, 450.200 și 900.400 lei. Se folosește tipul declarat, iar în lipsa lui o clasificare CPV; un tip necunoscut nu primește automat plafonul mai mic.",
    caveat:
      "Valoarea de închidere și data publicării sunt repere analitice, nu o verificare juridică a necesarului estimat. În lipsa publicării se folosește finalizarea, fapt declarat în dovezi. La schimbarea plafonului folosim maximul din grup. O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime. Datele anterioare datei de 26.05.2016 și clasificările necunoscute sunt excluse din acest calcul.",
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
    short: "O achiziție între 90% și 100% din plafonul de referință.",
    description:
      "Valoarea de închidere este de cel puțin 90%, dar strict sub plafonul fără TVA pentru tipul și data de referință ale achiziției. Plafoanele se modifică la 26.05.2016, 04.06.2018 și 10.09.2022; lucrările au plafoane distincte.",
    rationale:
      "Valori bunched imediat sub prag indică ajustare pentru a rămâne în achiziție directă.",
    caveat: "O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere. Publicarea aproximează inițierea; finalizarea o înlocuiește numai dacă lipsește. Tipul poate fi dedus din CPV când nu este declarat; necunoscut înseamnă neclasificat, nu suspect.",
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
    title: "Negociere fără publicare prealabilă",
    subject: "award",
    short: "Procedură fără anunț prealabil; numărul ofertelor se verifică separat.",
    description:
      "Anunț de atribuire de valoare mare care declară procedura „negociere fără publicare prealabilă”. Denumirea procedurii nu stabilește câte oferte au fost primite.",
    rationale:
      "Lipsa unui anunț prealabil justifică verificarea motivului legal invocat și a condițiilor de atribuire (Legea 98/2016 art. 104).",
    caveat:
      "Unele cazuri sunt legitime (urgențe reale, furnizor unic tehnic). Semnalul contează prin valoare și frecvență.",
  },
  award_single_bid: {
    code: "award_single_bid",
    title: "O singură ofertă raportată în TED",
    subject: "award",
    short: "Cel puțin un lot cu exact o ofertă raportată și o asociere TED confirmată.",
    description:
      "Anunț de atribuire de cel puțin 1 milion lei, prin licitație deschisă sau restrânsă, cu cel puțin un contract asociat unui lot TED care raportează exact o ofertă primită. Asocierea și numărul trebuie confirmate; egalitatea prețului minim cu cel maxim nu este o dovadă.",
    rationale:
      "O singură ofertă primită justifică verificarea accesului la procedură, a cerințelor și a pieței furnizorilor; nu identifică singură cauza concurenței reduse.",
    caveat:
      "Numărul de oferte nu este numărul membrilor unui consorțiu. Un lot cu o ofertă nu descrie toate loturile anunțului; valoarea afișată este a anunțului. Numerele lipsă, contradictorii și asocierile ambigue rămân necunoscute. Piețele de nișă pot avea legitim o singură ofertă.",
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
  fin_tiny_staff: {
    code: "fin_tiny_staff",
    title: "Firmă minusculă, bani publici mari",
    subject: "supplier",
    short: "Cel mult 5 salariați, cel puțin 2 mil. lei în achiziții înregistrate într-un an.",
    description:
      "Furnizor cu cel mult 5 salariați (numărul mediu din bilanțul MF al aceluiași an) cu achiziții directe și cote din contracte înregistrate de cel puțin 2 mil. lei într-un singur an.",
    rationale:
      "O firmă fără personal care rulează contracte publice mari poate fi paravan sau intermediar — munca reală o face altcineva.",
    caveat:
      "Dealeri, importatori, SPV-uri și consultanța cu subcontractare pot fi legitime cu personal minim. Zilierii și subcontractorii nu apar în bilanț. Valorile atribuite pot include plafoane de acord-cadru, nu plăți efective.",
  },
  fin_public_reliance: {
    code: "fin_public_reliance",
    title: "Dependență de bani publici",
    subject: "supplier",
    short: "Valoarea achizițiilor înregistrate reprezintă cel puțin 75% din cifra de afaceri.",
    description:
      "Pe anii cu bilanț depus, valoarea contractată public reprezintă cel puțin 75% din întreaga cifră de afaceri a firmei (minim 1 mil. lei public).",
    rationale:
      "O firmă care trăiește aproape exclusiv din achiziții publice depinde de relația cu statul, nu de piață.",
    caveat:
      "Compară valori contractate (nu încasări) cu cifra de afaceri; contractele multianuale pot împinge raportul peste 1. Unele sectoare sunt firesc aproape exclusiv publice.",
  },
  net_shared_admin: {
    code: "net_shared_admin",
    title: "Firme surori la aceeași autoritate",
    subject: "supplier",
    short: "Aceeași persoană conduce mai multe firme cu achiziții la aceeași autoritate.",
    description:
      "Două sau mai multe firme administrate de aceeași persoană (reprezentant legal ONRC, identificat prin nume + data și locul nașterii) au achiziții directe și cote din contracte înregistrate la aceeași autoritate.",
    rationale:
      "Împărțirea afacerii pe firme-surori ascunde concentrarea reală: fiecare firmă pare mică, dar aceeași persoană controlează întregul flux.",
    caveat:
      "Administratorii nu sunt neapărat asociații/proprietarii; instantaneu ONRC curent, nu de la momentul achizițiilor. Grupuri legitime de firme pot arăta similar.",
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
  "fin_tiny_staff",
  "fin_public_reliance",
  "net_shared_admin",
];

/** Risk band for a CRI score, for coloring. */
export function criBand(cri: number): { label: string; className: string } {
  if (cri >= 0.6) return { label: "Ridicat", className: "risk-high" };
  if (cri >= 0.3) return { label: "Mediu", className: "risk-mid" };
  if (cri > 0) return { label: "Scăzut", className: "risk-low" };
  return { label: "Fără semnale", className: "risk-none" };
}
