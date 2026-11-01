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
  /**
   * The short name Ask's answers use (the risk cloud's chips and list, the distribution's criteria; F6b, plan §4.12
   * decision 7): set for the signals on direct acquisitions. The long `title` stays on the methodology pages.
   */
  label?: string;
  /**
   * The rule at the level of an entity ("Cel puțin o dată în arhivă: …"), not the one-acquisition `short` text:
   * what the profile's criterion means for an institution or a firm. Set with `label`.
   */
  entityRule?: string;
  description: string;
  rationale: string;
  caveat: string;
}

/** How the signals on award notices are counted. Both award caveats end with it;
 * /metodologie states it once, under "Cum se formează totalurile". */
export const AWARD_COUNTING_CAVEAT = "Semnalul se numără o dată pentru fiecare anunț de atribuire (apariții). Versiunile pe care SEAP le republică sub același număr de anunț se numără o singură dată, la ultima versiune care îndeplinește criteriul. Același contract republicat sub alt număr de anunț, sau un acord-cadru și contractul subsecvent atribuit din el, pot apărea ca apariții separate. Anul semnalului este anul primului contract din anunț, din oricare versiune; un anunț fără contract cu dată plauzibilă primește anul primei versiuni preluate. Când anunțul conține doar plafonul unui acord-cadru, valoarea afișată este plafonul, nu o cheltuială, și nu se adună la totaluri.";

export const FLAG_META: Record<string, FlagMeta> = {
  da_split: {
    code: "da_split",
    title: "Achiziții repetate, peste plafon cumulat",
    label: "Achiziții repetate, peste plafon cumulat",
    entityRule: "Cel puțin o dată în arhivă: 3+ achiziții directe la același furnizor, în același an, aceeași clasă CPV și același tip, fiecare sub plafon, cu suma peste plafon. Apare mai des la cine cumpără mult și de mulți ani.",
    subject: "pair",
    short: "Achiziții din aceeași clasă CPV și același tip, însumând peste plafonul de referință.",
    description:
      "Cel puțin 3 achiziții directe între aceeași autoritate și același furnizor, în același an, aceeași clasă CPV și același tip de achiziție. Fiecare este sub plafonul de referință propriu, iar suma depășește cel mai mare plafon aplicabil grupului.",
    rationale:
      "Legea 98/2016 art. 7(5) privește valoarea estimată fără TVA, iar art. 11 interzice divizarea pentru evitarea procedurii. Plafoanele, pe date și tipuri: vezi Principii. Se folosește tipul declarat, iar în lipsa lui o clasificare CPV; un tip necunoscut nu primește automat plafonul mai mic.",
    caveat:
      "Valoarea de închidere și data publicării sunt repere analitice, nu o verificare juridică a necesarului estimat. În lipsa publicării se folosește finalizarea, fapt declarat în dovezi. La schimbarea plafonului folosim maximul din grup. O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime. Datele anterioare datei de 26.05.2016 și clasificările necunoscute sunt excluse din acest calcul.",
  },
  da_concentration: {
    code: "da_concentration",
    title: "Concentrare pe un furnizor",
    label: "Concentrare pe un furnizor",
    entityRule: "Un furnizor are cel puțin 60% din valoarea achizițiilor directe ale instituției (minimum 3 furnizori și 100.000 lei).",
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
    label: "Dependență de o autoritate",
    entityRule: "O instituție aduce cel puțin 85% din valoarea achizițiilor directe ale firmei, la minimum 250.000 lei și cel puțin 5 achiziții cu ea.",
    subject: "supplier",
    short: "Majoritatea valorii achizițiilor directe ale furnizorului provine de la o autoritate.",
    description:
      "O singură autoritate reprezintă cel puțin 85% din valoarea achizițiilor directe înregistrate pentru furnizor în datele disponibile, pentru un total de cel puțin 250.000 lei și cel puțin 5 achiziții directe cu acea autoritate.",
    rationale: "Merită verificat istoricul relației cu autoritatea și modul de selectare a furnizorului.",
    caveat: "Această pondere nu descrie toate veniturile firmei: nu include vânzările private sau contractele prin proceduri. Un furnizor cu un singur client public în achizițiile directe din date primește semnalul automat, dacă valoarea totală atinge pragul folosit la calcul. Dependența de un singur client este chiar pista pe care o arată semnalul, nu o dovadă de neregulă. Un client public principal poate fi explicat de specializare sau de piața locală.",
  },
  da_round: {
    code: "da_round",
    title: "Chiar sub plafonul achiziției directe",
    label: "Chiar sub plafon",
    entityRule: "Peste 10% din achizițiile directe au între 96% și 100% din plafon (cel puțin 5 achiziții); la instituții și de la 5 astfel de achiziții, dacă sunt cel puțin 1%.",
    subject: "da",
    short: "O achiziție între 96% și 100% din plafonul achiziției directe.",
    description:
      "Valoarea de închidere este de cel puțin 96%, dar strict sub plafonul fără TVA pentru tipul și data de referință ale achiziției. Plafoanele se modifică la 26.05.2016, 04.06.2018 și 10.09.2022; lucrările au plafoane distincte.",
    rationale:
      "Merită verificată estimarea necesarului și existența altor achiziții pentru aceeași nevoie. Apropierea de prag nu stabilește intenția de a evita o procedură.",
    caveat: "O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere. Publicarea aproximează inițierea; finalizarea o înlocuiește numai dacă lipsește. Tipul poate fi dedus din CPV când nu este declarat; necunoscut înseamnă neclasificat, nu suspect.",
  },
  da_above_ceiling: {
    code: "da_above_ceiling",
    title: "Peste plafonul achiziției directe",
    label: "Peste plafon",
    entityRule: "Cel puțin 2 achiziții directe înregistrate cu peste 10% peste plafon, acolo unde excepțiile cunoscute nu se pot aplica.",
    subject: "da",
    short: "Achiziție directă înregistrată cu peste 10% peste plafon.",
    description:
      "Valoarea de închidere depășește cu peste 10% plafonul fără TVA al achiziției directe pentru tipul și data de referință ale achiziției. Numărăm doar cazurile în care excepțiile cunoscute nu se pot aplica: nu în codurile CPV din Anexa 2 (procedură proprie), nu medicamente și echipamente medicale (CPV 33, cumpărate și prin centrale de achiziții), nu la companii, asociații sau operatori de utilități (alte reguli), nu între 26.02 și 14.05.2020, nu când un plafon de lucrări ar acoperi valoarea și nu când valoarea de închidere depășește de peste două ori estimarea (posibilă greșeală de introducere). În profil contează de la două cazuri.",
    rationale:
      "Legea 98/2016 art. 7(5) permite achiziția directă doar sub plafon; peste el se aplică o procedură. Merită verificată estimarea, tipul achiziției și dacă a existat o procedură.",
    caveat:
      "Valoarea de închidere poate include ajustări, iar tipul achiziției poate fi greșit declarat în SEAP. Legea privește valoarea estimată, nu cea de închidere. Un caz nu dovedește o încălcare; e o pistă de verificat în documente.",
  },
  da_year_end: {
    code: "da_year_end",
    title: "Achiziții concentrate în decembrie",
    label: "Vârf în decembrie",
    entityRule: "Cel puțin un an în care ponderea lui decembrie e printre cele mai mari 5% la instituțiile de același tip și de cel puțin 35%, la un total anual de cel puțin 100.000 lei. Doar anii întregi ai arhivei.",
    subject: "authority",
    short: "O pondere mare din valoarea anuală a achizițiilor directe este finalizată în decembrie.",
    description:
      "Ponderea lunii decembrie în valoarea achizițiilor directe finalizate într-un an este printre cele mai mari 5% la instituțiile de același tip în același an (primării de comună, de oraș și municipiu, consilii județene, spitale, școli, alte instituții) și de cel puțin 35%, pentru un total anual de cel puțin 100.000 lei. Se evaluează doar anii acoperiți integral, din ianuarie până în decembrie: arhiva achizițiilor directe începe la 02.04.2018, deci 2018 nu este evaluat, iar anul în curs intră după încheierea lui.",
    rationale:
      "Merită verificate calendarul necesarului, justificările achizițiilor și momentul finalizării lor.",
    caveat: "Sezonalitatea și calendarul proiectelor pot explica vârful. Data finalizării în SEAP nu este data plății; semnalul nu dovedește epuizarea intenționată a bugetului.",
  },
  award_no_competition: {
    code: "award_no_competition",
    title: "Negociere fără anunț prealabil",
    subject: "award",
    short: "Procedură fără anunț prealabil; numărul ofertelor se verifică separat.",
    description:
      "Anunț de atribuire de valoare mare care declară procedura „negociere fără publicare prealabilă”. Denumirea procedurii nu stabilește câte oferte au fost primite.",
    rationale:
      "Lipsa unui anunț prealabil justifică verificarea motivului legal invocat și a condițiilor de atribuire (Legea 98/2016 art. 104).",
    caveat:
      `Unele cazuri sunt legitime (urgențe reale, furnizor unic tehnic). Semnalul contează prin valoare și frecvență. ${AWARD_COUNTING_CAVEAT}`,
  },
  award_single_bid: {
    code: "award_single_bid",
    title: "O singură ofertă raportată în TED",
    subject: "award",
    short: "Cel puțin un lot cu exact o ofertă raportată și o asociere TED confirmată.",
    description:
      "Anunț de atribuire de cel puțin 1 milion lei, prin licitație deschisă sau restrânsă, cu cel puțin un contract asociat unui lot TED care raportează exact o ofertă primită. Asocierea și numărul trebuie confirmate; egalitatea prețului minim cu cel maxim nu este o dovadă. Valoarea este cea a anunțului. Când anunțul nu are valoare (SEAP raportează 0), se folosește suma în lei a contractelor citate care sunt contracte sau comenzi subsecvente; plafoanele acordurilor-cadru nu înlocuiesc valoarea lipsă, deci un astfel de anunț care citează numai plafoane nu este evaluat.",
    rationale:
      "O singură ofertă primită justifică verificarea accesului la procedură, a cerințelor și a pieței furnizorilor; nu identifică singură cauza concurenței reduse.",
    caveat:
      `Numărul de oferte nu este numărul membrilor unui consorțiu. Un lot cu o ofertă nu descrie toate loturile anunțului. Valoarea afișată este a anunțului sau, când aceasta lipsește, a contractelor citate; contractele citate pot însuma mai mult decât valoarea anunțului. Numerele lipsă, contradictorii și asocierile ambigue rămân necunoscute. Piețele de nișă pot avea legitim o singură ofertă. ${AWARD_COUNTING_CAVEAT}`,
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
      "Furnizor cu cel mult 5 salariați (numărul mediu din bilanțul MF al aceluiași an) cu achiziții directe și cote din contracte înregistrate de cel puțin 2 mil. lei într-un singur an. Un CUI se leagă de bilanțul MF doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Merită verificat cum au fost îndeplinite contractele: personal propriu, subcontractori, echipamente sau revânzare de produse.",
    caveat:
      "Numărul mediu de salariați nu măsoară singur capacitatea de execuție. Dealeri, importatori și firme cu subcontractare pot avea legitim puțini salariați. Valorile sunt contractate, nu plăți efective; plafoanele acordurilor-cadru sunt excluse.",
  },
  fin_public_reliance: {
    code: "fin_public_reliance",
    title: "Valori contractate raportate la cifra de afaceri",
    subject: "supplier",
    short: "Raport de cel puțin 75% între valoarea achizițiilor înregistrate și cifra de afaceri.",
    description:
      "În anii în care avem atât achiziții înregistrate, cât și bilanț cu cifră de afaceri pozitivă, suma achizițiilor directe și a cotelor din contracte înregistrate este de cel puțin 75% din cifra de afaceri cumulată, cu minimum 1 milion lei în achiziții și 250.000 lei cifră de afaceri. Un CUI se leagă de bilanțul MF doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Merită comparate durata contractelor, execuția și veniturile raportate. Raportul ajută la alegerea documentelor de verificat, dar nu măsoară ponderea încasărilor de la stat.",
    caveat:
      "Compară valori contractate cu cifra de afaceri, nu încasări cu venituri. Contractele multianuale pot duce raportul peste 100%; plafoanele acordurilor-cadru sunt excluse. Cotele consorțiilor sunt estimate; unele sectoare au predominant clienți publici.",
  },
  net_shared_admin: {
    code: "net_shared_admin",
    title: "Reprezentant comun, aceeași autoritate",
    subject: "supplier",
    short: "Firme cu un reprezentant legal comun au achiziții la aceeași autoritate.",
    description:
      "Două sau mai multe firme cu un reprezentant legal comun în datele ONRC disponibile au achiziții directe și cote din contracte înregistrate la aceeași autoritate. Identitatea reprezentantului folosește numele, data și locul nașterii. O dată de naștere de completare (1910-01-01, 1910-10-10) sau neplauzibilă (înainte de 1910 ori sub 16 ani în anul instantaneului ONRC) nu identifică o persoană, deci nu leagă firmele. Nu se iau în calcul calitatea de membru în consiliul de supraveghere, pentru că acest consiliu nu reprezintă firma, și rolurile din procedurile de insolvență sau lichidare (administrator judiciar sau special, administrator concordatar, lichidator), atribuite în cadrul procedurii, nu în conducerea obișnuită a firmei. Dovada fiecărui semnal arată calitatea persoanei la firma respectivă. Un CUI se leagă de ONRC doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Legătura permite analizarea împreună a atribuirilor acestor firme. Merită verificate rolul persoanei, relația dintre firme și situația lor la data achizițiilor.",
    caveat:
      "Reprezentantul legal nu este automat proprietar sau beneficiar real. Registrul disponibil descrie o situație ulterioară unora dintre achiziții și nu dovedește control comun la data atribuirii. Legătura poate exista între firme care lucrează legitim pentru aceeași autoritate.",
  },
};

/** A signal's short name where Ask speaks of it (FlagMeta.label), else its title. */
export const flagLabel = (code: string): string => FLAG_META[code]?.label ?? FLAG_META[code]?.title ?? code;
/** A signal's rule at the level of an entity (FlagMeta.entityRule); empty where the signal has none. */
export const flagEntityRule = (code: string): string => FLAG_META[code]?.entityRule ?? "";

export const FLAG_ORDER = [
  "da_split",
  "da_concentration",
  "da_dependence",
  "da_year_end",
  "da_round",
  "da_above_ceiling",
  "award_no_competition",
  "award_single_bid",
  "award_concentration",
  "award_dependence",
  "fin_tiny_staff",
  "fin_public_reliance",
  "net_shared_admin",
];
