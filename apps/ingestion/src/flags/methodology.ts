import { FLAGS_METHODOLOGY_VERSION } from "@seap/db";

/**
 * Red-flag methodology registry (red-flags DEC-007). Single source of truth for
 * flag definitions — consumed by the flag build (evidence/labels) and the web
 * `/metodologie` page. Bump the version (FLAGS_METHODOLOGY_VERSION in @seap/db) when a rule or threshold
 * changes; every flag instance is stamped with it.
 */
// rf-2026.6: annual/monthly periods use Europe/Bucharest consistently with the source calendar.
// rf-2026.7: ceilings/addenda are non-additive; uncertain publication identities are temporarily excluded.
// rf-2026.8: da_year_end only for calendar years the DA archive covers from January to December.
// rf-2026.9: award_single_bid treats a 0/missing notice value as unknown and falls back to cited contracts/call-offs.
// rf-2026.10: net_shared_admin ignores ONRC supervisory-board seats (not legal representation).
// rf-2026.11: fin_* and net_shared_admin join MF/ONRC only through a corroborated CUI (audit F03 stopgap).
// rf-2026.12: award_no_competition/award_single_bid evidence records what the notice holds (notice_contracts, audit F14).
// rf-2026.13: net_shared_admin and Radiografie shared administrators ignore placeholder/implausible ONRC birth dates (audit F37).
// rf-2026.14: a DA supplier equal to its own authority is not a supplier (audit F12): no da_split pair, da_concentration/da_dependence share, fin_* or net_shared_admin value, supplier CRI or DA signal partner.
// rf-2026.15: award_no_competition/award_single_bid count once per award notice (same authority and notice number, across SEAP versions) and take the year of its first contract.
// rf-2026.16: net_shared_admin ignores ONRC insolvency/liquidation roles (administrator provizoriu stays) and records the person's role(s) at each firm (audit F31).
// rf-2026.17: fin_* and net_shared_admin skip the reviewed ONRC name collisions of Romanian-looking entities (audit F03, option b).
// rf-2026.18: the profile index becomes a risk score over 100 (owner decision, 1 November 2026): continuous strengths of
//   the DA criteria (score.ts); da_round from 96% of the ceiling; da_dependence needs 250k lei and 5 DAs with the main
//   institution; da_year_end against the kind-year 95th percentile; new da_above_ceiling (safe scope); da_rapid retired.
// rf-2026.19: net_shared_admin and Radiografie's shared administrators read the ONRC person key with the name's
//   punctuation and spacing folded ("MARIA-MONICA" = "MARIA MONICA", migration 0090): one person, one key.
// rf-2026.20: the risk score after the six-reader audit of 200 profiles (owner decisions, 3 November 2026): shown as
//   "70 din 100"; criteria grouped in four families (threshold avoidance, relationship, December, capacity); strengths
//   against the size of the profile (above the ceiling: events and value share; repeated purchases: weighted groups;
//   just under the ceiling: bunching against the national ratio; December: distance from peers); da_above_ceiling only
//   strict hits; buyer regimes from legal form and whole-word names (regime.ts) instead of substrings, public sectoral
//   operators judged like any institution (Legea 99 art. 12(4)); da_concentration without the largest DA;
//   da_dependence from 70%; new da_capacity (DA sales against turnover); a firm's part in a buyer's duty counts at
//   most 1.5 unless 80% is with one or two institutions; the institution's own firm has no score.
// rf-2026.21: no steps in the score (owner decisions, 4 November 2026): every scale climbs from a lower anchor; the
//   evidence cap and a firm's buyer-duty cap rise gradually.
// rf-2026.22: after the eight-profile audit of every institution and firm (owner decisions, 5 November 2026,
//   docs/handover/20261105/scor-audit-decizii.md): da_capacity only against the same year's balance sheet and "young"
//   from the ONRC registration; no capture in da_dependence; the evidence cap per criterion (sums by the DA value
//   0.5M/1M/2M or the count, frequencies and shares by the count); no score under 10 DAs or under 10 points; repeated
//   medical supplies (CPV 33) and small recurring orders out of da_split; da_round expects at least 0.5 and needs 5 / 8
//   records for levels 2 / 3; a firm's buyer-duty cap over the whole family; capacity alone counts half; a private
//   buyer has no score; misspelt OUAIs are associations, "ADI …" is classic, a reviewed list of buyers by CUI.
// rf-2026.23: award_calloffs_over_ceiling (owner, 8 November 2026): an award notice whose declared call-offs exceed the
//   framework agreement they are ordered from (over 120% and by at least 50,000 lei), with the call-offs that repeat the
//   whole ceiling (likely a data-entry error). Informative, not in the score; no other signal changes.
// The version itself lives in @seap/db, where the nightly scheduler reads it.
export const METHODOLOGY_VERSION = FLAGS_METHODOLOGY_VERSION;

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
    title: "Adunate, trec de plafon",
    subject: "pair",
    description:
      "Cel puțin 3 achiziții directe între aceeași autoritate și același furnizor, în același an, aceeași clasă CPV și același tip de achiziție. Fiecare este sub plafonul de referință propriu, iar suma depășește cel mai mare plafon aplicabil grupului.",
    rationale:
      "Legea 98/2016 art. 7(5) privește valoarea estimată fără TVA, iar art. 11 interzice divizarea pentru evitarea procedurii. Plafoanele pentru produse/servicii sunt 132.519 lei din 26.05.2016, 135.060 lei din 04.06.2018 și 270.120 lei din 10.09.2022; pentru lucrări: 441.730, 450.200 și 900.400 lei. Se folosește tipul declarat, iar în lipsa lui o clasificare CPV; un tip necunoscut nu primește automat plafonul mai mic.",
    caveat:
      "Valoarea de închidere și data publicării sunt repere analitice, nu o verificare juridică a necesarului estimat. În lipsa publicării se folosește finalizarea, fapt declarat în dovezi. La schimbarea plafonului folosim maximul din grup. O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime. Datele anterioare datei de 26.05.2016 și clasificările necunoscute sunt excluse din acest calcul.",
  },
  {
    code: "da_concentration",
    title: "O firmă are mare parte din valoare",
    subject: "authority",
    description:
      "Un furnizor are cel puțin 60% din valoarea achizițiilor directe ale instituției, fără cea mai mare achiziție a lui (o achiziție mare nu e o relație), cu cel puțin 3 achiziții în cel puțin 2 ani, la minimum 3 furnizori și 100.000 lei. Furnizorii de utilități și firma instituției (in-house) nu sunt numărați ca furnizor principal; o companie privată cumpărătoare nu e evaluată.",
    rationale:
      "Merită verificate alternativele disponibile pe piață și modul în care a fost ales furnizorul.",
    caveat:
      "Specializarea, un monopol local sau un contract mare pot explica această concentrare. Datele nu stabilesc singure dacă a existat favorizare.",
  },
  {
    code: "da_dependence",
    title: "Un singur client public mare",
    subject: "supplier",
    description:
      "O singură autoritate reprezintă cel puțin 70% din valoarea achizițiilor directe ale furnizorului, la un total de cel puțin 250.000 lei, cu cel puțin 5 achiziții în cel puțin 2 ani cu acea autoritate. Nivelul 1 începe de la 85%; tăria crește cu ponderea firmei în achizițiile instituției și când firma vinde și peste capacitatea ei. Firma instituției (in-house, Legea 98/2016 art. 31) nu primește semnalul.",
    rationale:
      "Merită verificat istoricul relației cu autoritatea și modul de selectare a furnizorului.",
    caveat: "Această pondere nu descrie toate veniturile firmei: nu include vânzările private sau contractele prin proceduri. Un furnizor cu un singur client public în achizițiile directe din date primește semnalul automat, dacă valoarea totală atinge pragul folosit la calcul. Dependența de un singur client este chiar pista pe care o arată semnalul, nu o dovadă de neregulă. Un client public principal poate fi explicat de specializare sau de piața locală.",
  },
  {
    code: "da_round",
    title: "Multe sume imediat sub plafon",
    subject: "da",
    description:
      "Valoarea de închidere este de cel puțin 96%, dar strict sub plafonul fără TVA pentru tipul și data de referință ale achiziției (de exemplu 130.000 lei la un plafon de 135.060 lei). Plafoanele se modifică la 26.05.2016, 04.06.2018 și 10.09.2022; lucrările au plafoane distincte.",
    rationale:
      "Merită verificată estimarea necesarului și existența altor achiziții pentru aceeași nevoie. Apropierea de prag nu stabilește intenția de a evita o procedură.",
    caveat: "O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere. Publicarea aproximează inițierea; finalizarea o înlocuiește numai dacă lipsește. Tipul poate fi dedus din CPV când nu este declarat; necunoscut înseamnă neclasificat, nu suspect.",
  },
  {
    code: "da_above_ceiling",
    title: "Declarate directe, peste plafon",
    subject: "da",
    description:
      "Valoarea de închidere depășește cu peste 10% plafonul fără TVA al achiziției directe, iar estimarea depășește plafonul sau închiderea îl depășește și cu TVA (21%). Numărăm doar la cumpărătorii pe care plafonul îi obligă (instituții publice și operatori sectoriali publici, Legea 99/2016 art. 12(4)), nu la companii private sau asociații, și doar unde excepțiile cunoscute nu se pot aplica: nu în codurile CPV din Anexa 2, nu CPV 33, nu între 26.02 și 14.05.2020, nu când un plafon de lucrări ar acoperi valoarea și nu când închiderea depășește de peste două ori estimarea. În profil contează de la două cazuri (cumpărător × lună), după număr și pondere în valoare.",
    rationale:
      "Legea 98/2016 art. 7(5) permite achiziția directă doar sub plafon; peste el se aplică o procedură. Merită verificată estimarea, tipul achiziției și dacă a existat o procedură.",
    caveat:
      "Valoarea de închidere poate include ajustări, iar tipul achiziției poate fi greșit declarat în SEAP. Legea privește valoarea estimată, nu cea de închidere. Un caz nu dovedește o încălcare; e o pistă de verificat în documente.",
  },
  {
    code: "da_year_end",
    title: "Mulți bani contractați în decembrie",
    subject: "authority",
    description:
      "Ponderea lunii decembrie în valoarea achizițiilor directe finalizate într-un an este printre cele mai mari 5% la instituțiile de același tip în același an (primării de comună, de oraș și municipiu, consilii județene, spitale, școli, alte instituții), și de cel puțin 35%, pentru un total anual de cel puțin 100.000 lei. Se evaluează doar anii acoperiți integral, din ianuarie până în decembrie: arhiva achizițiilor directe începe la 02.04.2018, deci 2018 nu este evaluat, iar anul în curs intră după încheierea lui.",
    rationale:
      "Merită verificate calendarul necesarului, justificările achizițiilor și momentul finalizării lor.",
    caveat: "Sezonalitatea și calendarul proiectelor pot explica vârful. Data finalizării în SEAP nu este data plății; semnalul nu dovedește epuizarea intenționată a bugetului.",
  },
  {
    code: "da_capacity",
    title: "Contracte directe peste cifra de afaceri",
    subject: "supplier",
    description:
      "Într-un an, achizițiile directe ale firmei sunt de cel puțin 1,5 ori cifra ei de afaceri din bilanțul MF (al acelui an sau de până la doi ani înainte, printr-un CUI coroborat), cifra de afaceri e sub 10.000 lei la cel puțin 100.000 lei în achiziții, sau firma are 0 angajați la cel puțin 500.000 lei. Firmele care au raportat vreodată peste 100 mil. lei cifră de afaceri nu intră.",
    rationale:
      "O firmă care vinde mult peste mărimea ei poate fi un intermediar; merită verificat cine a executat de fapt.",
    caveat:
      "Bilanțul e anual și poate lipsi; contractele multianuale, avansurile și subcontractarea pot explica diferența. Singur, semnalul rămâne slab în risc.",
  },
  // ── Award (contract-award notice) flags ─────────────────────────────────────
  {
    code: "award_no_competition",
    title: "Negociere fără anunț prealabil",
    subject: "award",
    description:
      "Anunț de atribuire de valoare mare care declară procedura „negociere fără publicare prealabilă”. Denumirea procedurii nu stabilește câte oferte au fost primite.",
    rationale:
      "Lipsa unui anunț prealabil justifică verificarea motivului legal invocat și a condițiilor de atribuire (Legea 98/2016 art. 104).",
    caveat:
      "Unele cazuri sunt legitime (urgențe reale, furnizor unic tehnic). Semnalul contează prin valoare și frecvență. Semnalul se numără o dată pentru fiecare anunț de atribuire (apariții). Versiunile pe care SEAP le republică sub același număr de anunț se numără o singură dată, la ultima versiune care îndeplinește criteriul. Același contract republicat sub alt număr de anunț, sau un acord-cadru și contractul subsecvent atribuit din el, pot apărea ca apariții separate. Anul semnalului este anul primului contract din anunț, din oricare versiune; un anunț fără contract cu dată plauzibilă primește anul primei versiuni preluate. Când anunțul conține doar plafonul unui acord-cadru, valoarea afișată este plafonul, nu o cheltuială, și nu se adună la totaluri.",
  },
  {
    code: "award_single_bid",
    title: "O singură ofertă raportată în TED",
    subject: "award",
    description:
      "Anunț de atribuire de cel puțin 1 milion lei, prin licitație deschisă sau restrânsă, cu cel puțin un contract asociat unui lot TED care raportează exact o ofertă primită. Asocierea și numărul trebuie confirmate; egalitatea prețului minim cu cel maxim nu este o dovadă. Valoarea este cea a anunțului. Când anunțul nu are valoare (SEAP raportează 0), se folosește suma în lei a contractelor citate care sunt contracte sau comenzi subsecvente; plafoanele acordurilor-cadru nu înlocuiesc valoarea lipsă, deci un astfel de anunț care citează numai plafoane nu este evaluat.",
    rationale:
      "O singură ofertă primită justifică verificarea accesului la procedură, a cerințelor și a pieței furnizorilor; nu identifică singură cauza concurenței reduse.",
    caveat:
      "Numărul de oferte nu este numărul membrilor unui consorțiu. Un lot cu o ofertă nu descrie toate loturile anunțului. Valoarea afișată este a anunțului sau, când aceasta lipsește, a contractelor citate; contractele citate pot însuma mai mult decât valoarea anunțului. Numerele lipsă, contradictorii și asocierile ambigue rămân necunoscute. Piețele de nișă pot avea legitim o singură ofertă. Semnalul se numără o dată pentru fiecare anunț de atribuire (apariții). Versiunile pe care SEAP le republică sub același număr de anunț se numără o singură dată, la ultima versiune care îndeplinește criteriul. Același contract republicat sub alt număr de anunț, sau un acord-cadru și contractul subsecvent atribuit din el, pot apărea ca apariții separate. Anul semnalului este anul primului contract din anunț, din oricare versiune; un anunț fără contract cu dată plauzibilă primește anul primei versiuni preluate. Când anunțul conține doar plafonul unui acord-cadru, valoarea afișată este plafonul, nu o cheltuială, și nu se adună la totaluri.",
  },
  {
    code: "award_calloffs_over_ceiling",
    title: "Comenzi declarate peste plafonul acordului-cadru",
    subject: "award",
    description:
      "Anunț de atribuire ale cărui contracte subsecvente, așa cum le declară autoritatea în SEAP, însumează mai mult decât acordul-cadru din care sunt comandate: peste 120% din plafon și cu cel puțin 50.000 lei. Comenzile se leagă de acord pe toate versiunile anunțului (același cumpărător și număr de anunț), pe același lot și cu un câștigător comun. Valoarea este suma declarată a comenzilor, cea care intră în totaluri.",
    rationale:
      "Comenzile dintr-un acord-cadru nu pot depăși valoarea lui. Fie s-a cumpărat peste plafon, fie valorile au fost raportate greșit în SEAP; ambele merită verificate în documentele contractelor.",
    caveat:
      "Poate fi o eroare de introducere a datelor, mai ales când comenzile au aceeași sumă ca plafonul acordului-cadru (plafonul copiat în fiecare comandă); câte comenzi repetă plafonul se vede în detalii. Un act adițional sau o ajustare de preț pot mări puțin plafonul. Semnalul nu intră în scor.",
  },
  {
    code: "award_concentration",
    title: "Concentrare pe un câștigător",
    subject: "authority",
    description:
      "Un furnizor are o pondere mare în valoarea contractelor prin proceduri ale autorității, în arhiva disponibilă.",
    rationale:
      "Merită verificate numărul ofertelor, accesul altor furnizori la proceduri și explicațiile pentru atribuiri repetate.",
    caveat:
      "Specializarea, un monopol sau un proiect mare pot explica această concentrare. Pentru consorții, cotele sunt estimate prin împărțire egală. Perioada și golurile arhivei pot influența ponderea.",
  },
  {
    code: "award_dependence",
    title: "Contracte concentrate la o autoritate",
    subject: "supplier",
    description:
      "Un furnizor cu contracte la mai multe autorități are cea mai mare parte din valoarea contractelor prin proceduri înregistrată la una singură.",
    rationale:
      "Merită verificate istoricul atribuirilor, concurența la proceduri și specializarea furnizorului.",
    caveat:
      "Ponderea privește contractele din arhiva disponibilă, nu veniturile totale sau încasările firmei. Un proiect mare poate explica rezultatul. Pentru consorții, cotele sunt estimate prin împărțire egală.",
  },
  {
    code: "fin_tiny_staff",
    title: "Puțini salariați, valori contractate mari",
    subject: "supplier",
    description:
      "Furnizor cu cel mult 5 salariați (numărul mediu din bilanțul MF al aceluiași an) cu achiziții directe și cote din contracte înregistrate de cel puțin 2 mil. lei într-un singur an. Un CUI se leagă de bilanțul MF doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Merită verificat cum au fost îndeplinite contractele: personal propriu, subcontractori, echipamente sau revânzare de produse.",
    caveat:
      "Numărul mediu de salariați nu măsoară singur capacitatea de execuție. Dealeri, importatori și firme cu subcontractare pot avea legitim puțini salariați. Valorile sunt contractate, nu plăți efective; plafoanele acordurilor-cadru sunt excluse.",
  },
  {
    code: "fin_public_reliance",
    title: "Valori contractate raportate la cifra de afaceri",
    subject: "supplier",
    description:
      "În anii în care avem atât achiziții înregistrate, cât și bilanț cu cifră de afaceri pozitivă, suma achizițiilor directe și a cotelor din contracte înregistrate este de cel puțin 75% din cifra de afaceri cumulată, cu minimum 1 milion lei în achiziții și 250.000 lei cifră de afaceri. Un CUI se leagă de bilanțul MF doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Merită comparate durata contractelor, execuția și veniturile raportate. Raportul ajută la alegerea documentelor de verificat, dar nu măsoară ponderea încasărilor de la stat.",
    caveat:
      "Compară valori contractate cu cifra de afaceri, nu încasări cu venituri. Contractele multianuale pot duce raportul peste 100%; plafoanele acordurilor-cadru sunt excluse. Cotele consorțiilor sunt estimate; unele sectoare au predominant clienți publici.",
  },
  {
    code: "net_shared_admin",
    title: "Reprezentant comun, aceeași autoritate",
    subject: "supplier",
    description:
      "Două sau mai multe firme cu un reprezentant legal comun în datele ONRC disponibile au achiziții directe și cote din contracte înregistrate la aceeași autoritate. Identitatea reprezentantului folosește numele, data și locul nașterii. O dată de naștere de completare (1910-01-01, 1910-10-10) sau neplauzibilă (înainte de 1910 ori sub 16 ani în anul instantaneului ONRC) nu identifică o persoană, deci nu leagă firmele. Nu se iau în calcul calitatea de membru în consiliul de supraveghere, pentru că acest consiliu nu reprezintă firma, și rolurile din procedurile de insolvență sau lichidare (administrator judiciar sau special, administrator concordatar, lichidator), atribuite în cadrul procedurii, nu în conducerea obișnuită a firmei. Dovada fiecărui semnal arată calitatea persoanei la firma respectivă. Un CUI se leagă de ONRC doar când firma nu este indicată drept străină sau ONRC înregistrează numărul sub un nume asemănător.",
    rationale:
      "Legătura permite analizarea împreună a atribuirilor acestor firme. Merită verificate rolul persoanei, relația dintre firme și situația lor la data achizițiilor.",
    caveat:
      "Reprezentantul legal nu este automat proprietar sau beneficiar real. Registrul disponibil descrie o situație ulterioară unora dintre achiziții și nu dovedește control comun la data atribuirii. Legătura poate exista între firme care lucrează legitim pentru aceeași autoritate.",
  },
];
