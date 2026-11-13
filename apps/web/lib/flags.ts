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
   * The name on ONE acquisition (a records-table badge, a record's page): the singular of `label` where the
   * signal's name speaks of many („Multe sume imediat sub plafon” → „Imediat sub plafon”; owner, 4 November 2026).
   */
  recordLabel?: string;
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
    title: "Adunate, trec de plafon",
    label: "Adunate, trec de plafon",
    recordLabel: "Adunată cu altele, trece de plafon",
    entityRule: "Cel puțin o dată în arhivă: 3+ achiziții directe la același furnizor, în același an, aceeași clasă CPV și același tip, fiecare sub plafon, cu suma peste plafon. Un grup cântărește după cât trece de plafon (de la 1,2× la 2×) și după mărimea achizițiilor; grupurile mai ales din Anexa 2 nu contează, nici materialele medicale (CPV 33) și nici 12+ comenzi mici (sub 10% din plafon în medie): acestea apar ca „comenzi repetate, fără acord-cadru”, fără puncte. Pe o firmă cântărește puțin dacă grupurile nu sunt la 1–2 instituții.",
    subject: "pair",
    short: "Mai multe achiziții mici de la aceeași firmă, pentru același fel de lucru, în același an: fiecare sub plafon, împreună peste.",
    description:
      "Cel puțin 3 achiziții directe între aceeași autoritate și același furnizor, în același an, aceeași clasă CPV și același tip de achiziție. Fiecare este sub plafonul de referință propriu, iar suma depășește cel mai mare plafon aplicabil grupului. În risc, grupul cântărește după cât trece de plafon și după mărimea achizițiilor.",
    rationale:
      "Legea 98/2016 art. 7(5) privește valoarea estimată fără TVA, iar art. 11 interzice divizarea pentru evitarea procedurii. Plafoanele, pe date și tipuri: vezi Principii. Se folosește tipul declarat, iar în lipsa lui o clasificare CPV; un tip necunoscut nu primește automat plafonul mai mic.",
    caveat:
      "Valoarea de închidere și data publicării sunt repere analitice, nu o verificare juridică a necesarului estimat. În lipsa publicării se folosește finalizarea, fapt declarat în dovezi. La schimbarea plafonului folosim maximul din grup. O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime. Obligația estimării e a instituției, nu a firmei. Datele anterioare datei de 26.05.2016 și clasificările necunoscute sunt excluse din acest calcul.",
  },
  da_concentration: {
    code: "da_concentration",
    title: "O firmă are mare parte din valoare",
    label: "O firmă are mare parte din valoare",
    entityRule: "Un furnizor are cel puțin 60% din valoarea achizițiilor directe ale instituției, fără cea mai mare achiziție a lui, cu 3+ achiziții în 2+ ani (minimum 3 furnizori și 100.000 lei). Utilitățile și firma instituției nu intră.",
    subject: "authority",
    short: "Un singur furnizor primește o parte mare din valoarea achizițiilor directe.",
    description:
      "Un furnizor are cel puțin 60% din valoarea achizițiilor directe ale instituției, fără cea mai mare achiziție a lui (o achiziție mare nu e o relație), cu cel puțin 3 achiziții în cel puțin 2 ani, la minimum 3 furnizori și 100.000 lei. Furnizorii de utilități și firma instituției (in-house) nu sunt numărați; o companie privată cumpărătoare nu e evaluată.",
    rationale:
      "Merită verificate alternativele disponibile pe piață și modul în care a fost ales furnizorul.",
    caveat: "Specializarea sau un monopol local pot explica această concentrare. Datele nu stabilesc singure dacă a existat favorizare.",
  },
  da_dependence: {
    code: "da_dependence",
    title: "Un singur client public mare",
    label: "Un singur client public mare",
    entityRule: "O instituție aduce cel puțin 70% din valoarea achizițiilor directe ale firmei (minimum 250.000 lei, 5+ achiziții în 2+ ani cu ea); nivelul 1 începe de la 85%. Firma instituției (in-house) nu intră.",
    subject: "supplier",
    short: "O instituție aduce cel puțin 70% din ce vinde firma prin achiziții directe.",
    description:
      "O singură autoritate reprezintă cel puțin 70% din valoarea achizițiilor directe ale furnizorului, la un total de cel puțin 250.000 lei, cu cel puțin 5 achiziții în cel puțin 2 ani cu acea autoritate. Nivelul 1 începe de la 85%; tăria crește cu ponderea firmei în achizițiile instituției. Firma instituției (in-house, Legea 98/2016 art. 31) nu primește semnalul.",
    rationale: "Merită verificat istoricul relației cu autoritatea și modul de selectare a furnizorului.",
    caveat: "Această pondere nu descrie toate veniturile firmei: nu include vânzările private sau contractele prin proceduri. Un furnizor cu un singur client public în achizițiile directe din date primește semnalul automat, dacă valoarea totală atinge pragul folosit la calcul. Dependența de un singur client este chiar pista pe care o arată semnalul, nu o dovadă de neregulă. Un client public principal poate fi explicat de specializare sau de piața locală.",
  },
  da_round: {
    code: "da_round",
    title: "Multe sume imediat sub plafon",
    label: "Multe sume imediat sub plafon",
    recordLabel: "Imediat sub plafon",
    entityRule: "Cel puțin 3 achiziții directe la 96–100% din plafon, de cel puțin 2 ori mai multe decât ar fi de așteptat după media națională (același tip, aceleași plafoane; cel puțin 0,5 așteptate). Nivelul 2 cere cel puțin 5 astfel de achiziții, nivelul 3 cel puțin 8.",
    subject: "da",
    short: "O achiziție directă cu valoarea la 96–100% din plafon.",
    description:
      "Valoarea de închidere este de cel puțin 96%, dar strict sub plafonul fără TVA pentru tipul și data de referință ale achiziției. Plafoanele se modifică la 26.05.2016, 04.06.2018 și 10.09.2022; lucrările au plafoane distincte. În risc contează aglomerarea: câte sunt față de câte ar fi după media națională.",
    rationale:
      "Merită verificată estimarea necesarului și existența altor achiziții pentru aceeași nevoie. Apropierea de prag nu stabilește intenția de a evita o procedură.",
    caveat: "O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere. Publicarea aproximează inițierea; finalizarea o înlocuiește numai dacă lipsește. Tipul poate fi dedus din CPV când nu este declarat; necunoscut înseamnă neclasificat, nu suspect.",
  },
  da_above_ceiling: {
    code: "da_above_ceiling",
    title: "Declarate directe, peste plafon",
    label: "Declarate directe, peste plafon",
    recordLabel: "Declarată directă, peste plafon",
    entityRule: "Cel puțin 2 cazuri (cumpărător × lună) peste plafon: estimarea depășește plafonul sau închiderea îl depășește și cu TVA (21%). Doar la cumpărătorii obligați de plafon; companiile și asociațiile nu sunt verificate. Pe o firmă cântărește puțin dacă nu sunt la 1–2 instituții.",
    subject: "da",
    short: "O achiziție directă peste plafon: estimată peste el, sau peste el chiar și cu TVA.",
    description:
      "Valoarea de închidere depășește cu peste 10% plafonul fără TVA al achiziției directe, iar estimarea depășește plafonul sau închiderea îl depășește și cu TVA (21%). Numărăm doar la cumpărătorii pe care plafonul îi obligă (instituții publice și operatori sectoriali publici, Legea 99/2016 art. 12(4)), nu la companii private sau asociații, și doar unde excepțiile cunoscute nu se pot aplica: nu în codurile CPV din Anexa 2, nu CPV 33, nu între 26.02 și 14.05.2020, nu când un plafon de lucrări ar acoperi valoarea și nu când închiderea depășește de peste două ori estimarea. În profil contează de la două cazuri (cumpărător × lună), după număr și pondere în valoare.",
    rationale:
      "Legea 98/2016 art. 7(5) permite achiziția directă doar sub plafon; peste el se aplică o procedură. Merită verificată estimarea, tipul achiziției și dacă a existat o procedură.",
    caveat:
      "Valoarea de închidere poate include ajustări, iar tipul achiziției poate fi greșit declarat în SEAP. Plafonul obligă cumpărătorul, nu firma. Un caz nu dovedește o încălcare; e o pistă de verificat în documente.",
  },
  da_year_end: {
    code: "da_year_end",
    title: "Mulți bani contractați în decembrie",
    label: "Mulți bani contractați în decembrie",
    entityRule: "Cel puțin un an în care ponderea lui decembrie e printre cele mai mari 5% la instituțiile de același tip și de cel puțin 35%, la un total anual de cel puțin 100.000 lei. Tăria crește cu distanța față de instituțiile similare; singur, decembrie ajunge cel mult la 25 din 100.",
    subject: "authority",
    short: "O parte mare din achizițiile directe ale anului, făcute în decembrie.",
    description:
      "Ponderea lunii decembrie în valoarea achizițiilor directe finalizate într-un an este printre cele mai mari 5% la instituțiile de același tip în același an (primării de comună, de oraș și municipiu, consilii județene, spitale, școli, alte instituții) și de cel puțin 35%, pentru un total anual de cel puțin 100.000 lei. Se evaluează doar anii acoperiți integral, din ianuarie până în decembrie: arhiva achizițiilor directe începe la 02.04.2018, deci 2018 nu este evaluat, iar anul în curs intră după încheierea lui. În risc contează cât de departe sunt cele mai mari două decembrii de mediana instituțiilor similare.",
    rationale:
      "Merită verificate calendarul necesarului, justificările achizițiilor și momentul finalizării lor.",
    caveat: "Sezonalitatea și calendarul proiectelor pot explica vârful. Data finalizării în SEAP nu este data plății; semnalul nu dovedește epuizarea intenționată a bugetului.",
  },
  da_capacity: {
    code: "da_capacity",
    title: "Contracte directe peste cifra de afaceri",
    label: "Peste cifra de afaceri",
    entityRule: "Într-un an, achizițiile directe sunt de cel puțin 1,5 ori cifra de afaceri din bilanțul aceluiași an, cifra de afaceri e sub 10.000 lei sau firma are 0 angajați la 500.000 lei. Un an fără bilanț, cum e anul în curs, nu se evaluează. Firmele cu peste 100 mil. lei cifră de afaceri nu intră.",
    subject: "supplier",
    short: "Într-un an, achizițiile directe depășesc mult cifra de afaceri a firmei.",
    description:
      "Într-un an, achizițiile directe ale firmei (cel puțin 100.000 lei) sunt de cel puțin 1,5 ori cifra ei de afaceri din bilanțul MF al aceluiași an (un an fără bilanț nu se evaluează: față de bilanțul anului anterior, doar 23% din cazurile din 2019–2025 s-au confirmat), cifra de afaceri e sub 10.000 lei, sau firma are 0 angajați la cel puțin 500.000 lei. Firmele care au raportat vreodată peste 100 mil. lei cifră de afaceri nu intră.",
    rationale: "O firmă care vinde mult peste mărimea ei poate fi un intermediar; merită verificat cine a executat de fapt.",
    caveat: "Bilanțul e anual și poate lipsi; contractele multianuale și subcontractarea pot explica diferența. Singur, semnalul rămâne slab.",
  },
  da_first_month: {
    code: "da_first_month",
    title: "Contracte în prima lună de la înființare",
    subject: "supplier",
    short: "Achizițiile directe din primele 30 de zile de la înmatricularea firmei însumează cel puțin 100.000 lei.",
    description:
      "Achizițiile directe acceptate ale firmei, publicate în primele 30 de zile de la înmatricularea ei la Registrul Comerțului, însumează cel puțin 100.000 lei. Vârsta firmei se numără de la cea mai veche înmatriculare a CUI-ului (o mutare de sediu dă un număr nou, nu o firmă nouă) până la ziua publicării achiziției. Se numără doar achizițiile instituțiilor pe care le obligă plafoanele achiziției directe, nu ale companiilor private sau ale asociațiilor. Un CUI se leagă de ONRC doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "O firmă abia înființată nu are încă istoric de arătat. Merită verificat cum a fost aleasă, cine o conduce și cine a executat contractul.",
    caveat:
      "Firma nouă poate fi a unui furnizor cu experiență: dovezile arată când un reprezentant legal al ei are și o firmă mai veche, furnizoare a statului. Circa unu din zece furnizori noi are prima achiziție în prima lună; semnalul pornește de la sumă, nu de la vârstă. Achiziția directă sub plafon este legală. Data înmatriculării vine din ultimul import ONRC, deci o firmă înființată după el nu este încă evaluată. Semnalul nu intră în scor.",
  },
  da_first_month_buyer: {
    code: "da_first_month_buyer",
    title: "Contracte cu firme în prima lună de la înființare",
    subject: "authority",
    short: "Achiziții directe de cel puțin 100.000 lei cu o firmă aflată în primele 30 de zile de la înmatriculare.",
    description:
      "Instituția are, cu aceeași firmă, achiziții directe acceptate de cel puțin 100.000 lei, publicate în primele 30 de zile de la înmatricularea firmei la Registrul Comerțului. Fiecare firmă este un caz. Vârsta firmei se numără de la cea mai veche înmatriculare a CUI-ului până la ziua publicării achiziției. Este reversul semnalului „Contracte în prima lună de la înființare” al firmei.",
    rationale:
      "Merită verificat cum a fost aleasă o firmă fără istoric: ce oferte au mai fost cerute, cine o conduce și cine a executat contractul.",
    caveat:
      "Firma poate fi a unui furnizor mai vechi al instituției: dovezile arată când un reprezentant legal al ei are o firmă mai veche care a contractat cu aceeași instituție. Achiziția directă sub plafon este legală. Data înmatriculării vine din ultimul import ONRC, deci o firmă înființată după el nu este încă evaluată. Semnalul nu intră în scor.",
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
  award_calloffs_over_ceiling: {
    code: "award_calloffs_over_ceiling",
    title: "Comenzi declarate peste plafonul acordului-cadru",
    label: "Comenzi peste plafon",
    subject: "award",
    short: "Comenzile subsecvente declarate în SEAP depășesc acordul-cadru din care sunt comandate.",
    description:
      "Anunț de atribuire ale cărui contracte subsecvente, așa cum le declară autoritatea în SEAP, însumează mai mult decât acordul-cadru din care sunt comandate: peste 120% din plafon și cu cel puțin 50.000 lei. Comenzile se leagă de acord pe toate versiunile anunțului (același cumpărător și număr de anunț), pe același lot și cu un câștigător comun. Valoarea este suma declarată a comenzilor, cea care intră în totaluri.",
    rationale:
      "Comenzile dintr-un acord-cadru nu pot depăși valoarea lui. Fie s-a cumpărat peste plafon, fie valorile au fost raportate greșit în SEAP; ambele merită verificate în documentele contractelor.",
    caveat:
      `Poate fi o eroare de introducere a datelor, mai ales când comenzile au aceeași sumă ca plafonul acordului-cadru (plafonul copiat în fiecare comandă). Un act adițional sau o ajustare de preț pot mări puțin plafonul. Semnalul nu intră în scor. ${AWARD_COUNTING_CAVEAT}`,
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
/** A signal's name on a single acquisition (FlagMeta.recordLabel), else its name. */
export const flagRecordLabel = (code: string): string => FLAG_META[code]?.recordLabel ?? flagLabel(code);
/** The name of one finding: a single acquisition's singular where the signal is on one record (subject "da"), else its name (a group, a profile). */
export const flagFindingLabel = (code: string): string => FLAG_META[code]?.subject === "da" ? flagRecordLabel(code) : flagLabel(code);
/** A signal's rule at the level of an entity (FlagMeta.entityRule); empty where the signal has none. */
export const flagEntityRule = (code: string): string => FLAG_META[code]?.entityRule ?? "";

export const FLAG_ORDER = [
  "da_split",
  "da_concentration",
  "da_dependence",
  "da_capacity",
  "da_year_end",
  "da_round",
  "da_above_ceiling",
  "da_first_month",
  "da_first_month_buyer",
  "award_no_competition",
  "award_single_bid",
  "award_calloffs_over_ceiling",
  "award_concentration",
  "award_dependence",
  "fin_tiny_staff",
  "fin_public_reliance",
  "net_shared_admin",
];
