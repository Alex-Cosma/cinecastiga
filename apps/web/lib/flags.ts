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
    title: "Posibilă fracționare sub prag",
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
    short: "O mare parte din valoarea achizițiilor directe revine unui singur furnizor.",
    description:
      "Un furnizor are o pondere mare în valoarea achizițiilor directe ale autorității din datele disponibile. Ponderea furnizorului principal și indicele de concentrare HHI descriu distribuția valorii.",
    rationale:
      "Merită verificate alternativele disponibile pe piață și modul în care a fost ales furnizorul.",
    caveat: "Specializarea, un monopol local sau un contract mare pot explica această concentrare. Datele nu stabilesc singure dacă a existat favorizare.",
  },
  da_dependence: {
    code: "da_dependence",
    title: "Dependență de o autoritate",
    subject: "supplier",
    short: "Majoritatea valorii achizițiilor directe ale furnizorului provine de la o autoritate.",
    description:
      "O singură autoritate reprezintă cea mai mare parte din valoarea achizițiilor directe înregistrate pentru furnizor în datele disponibile.",
    rationale: "Merită verificat istoricul relației cu autoritatea și modul de selectare a furnizorului.",
    caveat: "Această pondere nu descrie toate veniturile firmei: nu include vânzările private sau contractele prin proceduri. Un client public principal poate fi explicat de specializare sau de piața locală.",
  },
  da_rapid: {
    code: "da_rapid",
    title: "Finalizare rapidă",
    subject: "da",
    short: "Achiziție finalizată în câteva minute de la publicare.",
    description:
      "Interval scurt între publicarea și finalizarea achiziției directe, sub limita de durată folosită la calcul. Durata observată este afișată pentru fiecare achiziție.",
    rationale:
      "Merită verificat ce etape au precedat publicarea în SEAP și dacă documentele justifică alegerea furnizorului.",
    caveat: "Durata din SEAP nu descrie întreaga pregătire a achiziției. Achizițiile simple pot fi finalizate rapid; intervalul scurt nu dovedește o înțelegere între părți.",
  },
  da_round: {
    code: "da_round",
    title: "Valoare aproape de prag",
    subject: "da",
    short: "O achiziție între 90% și 100% din plafonul de referință.",
    description:
      "Valoarea de închidere este de cel puțin 90%, dar strict sub plafonul fără TVA pentru tipul și data de referință ale achiziției. Plafoanele se modifică la 26.05.2016, 04.06.2018 și 10.09.2022; lucrările au plafoane distincte.",
    rationale:
      "Merită verificată estimarea necesarului și existența altor achiziții pentru aceeași nevoie. Apropierea de prag nu stabilește intenția de a evita o procedură.",
    caveat: "O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere. Publicarea aproximează inițierea; finalizarea o înlocuiește numai dacă lipsește. Tipul poate fi dedus din CPV când nu este declarat; necunoscut înseamnă neclasificat, nu suspect.",
  },
  da_year_end: {
    code: "da_year_end",
    title: "Achiziții concentrate în decembrie",
    subject: "authority",
    short: "O pondere mare din valoarea anuală a achizițiilor directe este finalizată în decembrie.",
    description:
      "Cel puțin 35% din valoarea achizițiilor directe finalizate într-un an este concentrată în decembrie, pentru un total anual de cel puțin 100.000 lei.",
    rationale:
      "Merită verificate calendarul necesarului, justificările achizițiilor și momentul finalizării lor.",
    caveat: "Sezonalitatea și calendarul proiectelor pot explica vârful. Data finalizării în SEAP nu este data plății; semnalul nu dovedește epuizarea intenționată a bugetului.",
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
    short: "O mare parte din valoarea contractelor prin proceduri revine unui singur furnizor.",
    description:
      "Un furnizor are o pondere mare în valoarea contractelor prin proceduri ale autorității, în arhiva disponibilă.",
    rationale:
      "Merită verificate numărul ofertelor, accesul altor furnizori la proceduri și explicațiile pentru atribuiri repetate.",
    caveat:
      "Specializarea, un monopol sau un proiect mare pot explica această concentrare. Pentru consorții, cotele sunt estimate prin împărțire egală. Perioada și golurile arhivei pot influența ponderea.",
  },
  award_dependence: {
    code: "award_dependence",
    title: "Contracte concentrate la o autoritate",
    subject: "supplier",
    short: "Majoritatea valorii contractelor unui furnizor provine de la o autoritate.",
    description:
      "Un furnizor cu contracte la mai multe autorități are cea mai mare parte din valoarea contractelor prin proceduri înregistrată la una singură.",
    rationale:
      "Merită verificate istoricul atribuirilor, concurența la proceduri și specializarea furnizorului.",
    caveat:
      "Ponderea privește contractele din arhiva disponibilă, nu veniturile totale sau încasările firmei. Un proiect mare poate explica rezultatul. Pentru consorții, cotele sunt estimate prin împărțire egală.",
  },
  fin_tiny_staff: {
    code: "fin_tiny_staff",
    title: "Puțini salariați, valori contractate mari",
    subject: "supplier",
    short: "Cel mult 5 salariați, cel puțin 2 mil. lei în achiziții înregistrate într-un an.",
    description:
      "Furnizor cu cel mult 5 salariați (numărul mediu din bilanțul MF al aceluiași an) cu achiziții directe și cote din contracte înregistrate de cel puțin 2 mil. lei într-un singur an.",
    rationale:
      "Merită verificat cum au fost îndeplinite contractele: personal propriu, subcontractori, echipamente sau revânzare de produse.",
    caveat:
      "Numărul mediu de salariați nu măsoară singur capacitatea de execuție. Dealeri, importatori și firme cu subcontractare pot avea legitim puțini salariați. Valorile înregistrate pot include plafoane de acord-cadru, nu plăți efective.",
  },
  fin_public_reliance: {
    code: "fin_public_reliance",
    title: "Valori contractate raportate la cifra de afaceri",
    subject: "supplier",
    short: "Raport de cel puțin 75% între valoarea achizițiilor înregistrate și cifra de afaceri.",
    description:
      "În anii în care avem atât achiziții înregistrate, cât și bilanț cu cifră de afaceri pozitivă, suma achizițiilor directe și a cotelor din contracte înregistrate este de cel puțin 75% din cifra de afaceri cumulată, cu minimum 1 milion lei în achiziții și 250.000 lei cifră de afaceri.",
    rationale:
      "Merită comparate durata contractelor, execuția și veniturile raportate. Raportul ajută la alegerea documentelor de verificat, dar nu măsoară ponderea încasărilor de la stat.",
    caveat:
      "Compară valori contractate cu cifra de afaceri, nu încasări cu venituri. Contractele multianuale și plafoanele acordurilor-cadru pot duce raportul peste 100%. Cotele consorțiilor sunt estimate; unele sectoare au predominant clienți publici.",
  },
  net_shared_admin: {
    code: "net_shared_admin",
    title: "Reprezentant comun, aceeași autoritate",
    subject: "supplier",
    short: "Firme cu un reprezentant legal comun au achiziții la aceeași autoritate.",
    description:
      "Două sau mai multe firme cu un reprezentant legal comun în datele ONRC disponibile au achiziții directe și cote din contracte înregistrate la aceeași autoritate. Identitatea reprezentantului folosește numele, data și locul nașterii.",
    rationale:
      "Legătura permite analizarea împreună a atribuirilor acestor firme. Merită verificate rolul persoanei, relația dintre firme și situația lor la data achizițiilor.",
    caveat:
      "Reprezentantul legal nu este automat proprietar sau beneficiar real. Registrul disponibil descrie o situație ulterioară unora dintre achiziții și nu dovedește control comun la data atribuirii. Legătura poate exista între firme care lucrează legitim pentru aceeași autoritate.",
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
  return { label: "Niciun criteriu îndeplinit", className: "risk-none" };
}
