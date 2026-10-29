/**
 * The single source of beginner definitions. The guide (/ghid) and every
 * <Term> explanation read these texts, so a wording change happens here once.
 * Keep each definition to plain Romanian a first-time visitor can follow;
 * the methodology keeps the exact rules and their limits.
 */
export interface GlossaryEntry {
  /** Short name shown as the card title in the guide. */
  title: string;
  /** One or two sentences, shown in the guide and in the <Term> explanation. */
  text: string;
}

export const GLOSSARY = {
  "achizitie-directa": {
    title: "Achiziție directă",
    text: "Cumpărare fără licitație, cu valoarea estimată fără TVA sub pragul legal, numit pe site și plafon. Pentru majoritatea instituțiilor (Legea 98/2016), din 10.09.2022 plafonul este 270.120 lei pentru produse și servicii și 900.400 lei pentru lucrări; înainte era mai mic, iar utilitățile pot avea alte praguri. În totaluri intră doar cele acceptate, de cel mult 2 milioane lei: această limită este un filtru de plauzibilitate al site-ului, nu pragul legal.",
  },
  "contract-procedura": {
    title: "Contract din licitație sau procedură",
    text: "Un contract atribuit printr-o procedură, de exemplu o licitație: de obicei instituția publică un anunț, iar firmele depun oferte. Există și proceduri fără anunț prealabil, de exemplu negocierea fără publicare prealabilă; procedura nu garantează că au existat mai mulți ofertanți.",
  },
  "valoare-inregistrata": {
    title: "Valoare înregistrată, nu plată",
    text: "Arătăm valori calculate pornind de la suma din sursă a contractului sau a ofertei acceptate, de exemplu convertite în lei sau împărțite egal între membrii unui consorțiu. O ofertă acceptată sau un contract semnat nu dovedește că banii au fost plătiți.",
  },
  semnal: {
    title: "Semnal",
    text: "Un tipar din date care merită verificat, de exemplu posibila fracționare: cel puțin 3 achiziții directe ale aceleiași instituții de la aceeași firmă, în același an, cu aceeași clasă CPV și același tip, fiecare sub plafonul ei de achiziție directă, dar care împreună depășesc cel mai mare plafon aplicabil grupului. Este o pistă, nu o acuzație și nu dovedește o ilegalitate.",
  },
  cpv: {
    title: "Subiect (cod CPV)",
    text: "Categoria oficială a ce s-a cumpărat, din nomenclatorul european CPV, de exemplu „Iluminat stradal” (34993000). Codul îl alege instituția, așa că uneori e prea general sau nepotrivit.",
  },
  consortiu: {
    title: "Consorțiu",
    text: "Mai multe firme care câștigă împreună același contract. În lipsa cotelor reale, valoarea unui consorțiu este împărțită egal între membri. Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.",
  },
  // Întreabă says it in the kit's words (kit §4 "Asocieri"); the rest of the site keeps "consorțiu".
  "in-asociere": {
    title: "În asociere",
    text: "Mai multe firme care câștigă împreună același contract. În lipsa cotelor reale, valoarea contractului este împărțită egal între ele. Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.",
  },
  "inregistrare-contract-furnizor": {
    title: "Înregistrare contract–furnizor",
    text: "Un rând pentru fiecare firmă câștigătoare a unui contract. Un contract cu 3 câștigători apare pe 3 rânduri, cu valoarea împărțită între ei, așa că numărul de rânduri poate fi mai mare decât numărul de contracte.",
  },
  "selectie-precisa": {
    title: "Selecție precisă",
    text: "Condițiile de aici se adaugă celor de mai sus, iar răspunsul, sursele și exportul folosesc aceeași selecție. O excludere păstrează înregistrările cu identitate sau categorie necunoscută. La un contract cu mai mulți câștigători, valoarea este cota alocată fiecărui furnizor, nu valoarea integrală.",
  },
  "sediul-institutiei": {
    title: "Județul de pe hartă",
    text: "Harta include doar înregistrările cu județ cunoscut și pune fiecare achiziție în județul unde are sediul instituția care cumpără, nu unde se face lucrarea sau se livrează produsul. Un minister din București apare la București, chiar dacă lucrarea e în alt județ.",
  },
  "sediul-firmei": {
    title: "Sediul firmei",
    text: "Județul ultimei înmatriculări a firmei la Registrul Comerțului; unde lipsește, județul din SEAP. Firmele străine apar separat. Nu e locul lucrării: multe firme mari au sediul în București.",
  },
  "lista-titluri": {
    title: "Lista de titluri",
    text: "Fiecare contract apare o dată, chiar dacă are mai mulți furnizori. Unele importuri vechi nu au titlu, așa că lista nu e completă; achizițiile lor sunt pe paginile instituțiilor și firmelor.",
  },
  "recalculare-semnale": {
    title: "Recalculare",
    text: "Semnalele se recalculează săptămânal. Datele și statisticile din restul site-ului se actualizează separat, deci pot fi mai noi.",
  },
  "aparitie-anunt": {
    title: "Apariție pe anunț",
    text: "Un anunț se numără o singură dată, oricâte versiuni are în SEAP, cu anul primului contract; un contract republicat sub alt număr de anunț sau un acord-cadru și subsecventul lui pot apărea separat. Valoarea e a anunțului, nu a unui lot sau a fiecărei firme; când anunțul conține doar un acord-cadru, e plafonul lui, nu o cheltuială. Filtrul pe județul firmei păstrează anunțurile cu cel puțin un câștigător din județ și îi arată pe toți câștigătorii.",
  },
  "data-si-pragul": {
    title: "Data și pragul",
    text: "Data inițierii e aproximată prin publicare, altfel prin finalizare. Pragul și tipul fiecărei achiziții sunt cele aplicabile la acea dată.",
  },
  "captura-selectie": {
    title: "Salvare în anchetă",
    text: "Captura include toate înregistrările selecției, nu doar pagina afișată.",
  },
  "atlas-navigare": {
    title: "Cum navighezi",
    text: "Zona deschide subdomeniile, săgeata ↗ deschide detaliile. La ultimul nivel, și zona deschide detaliile.",
  },
  "rezultat-lot-ted": {
    title: "Rezultat de lot TED",
    text: "Un anunț poate conține mai multe loturi; un lot poate reuni mai multe rezultate publicate.",
  },
  "ted-tari": {
    title: "Țara câștigătorului",
    text: "Numărul de rezultate cu cel puțin un câștigător din țara indicată. Consorțiile multinaționale apar la fiecare țară relevantă; țările nu se însumează.",
  },
  "ted-fara-potrivire": {
    title: "Fără potrivire SEAP",
    text: "Nu am identificat încă o înregistrare corespunzătoare în datele SEAP analizate. Atribuirea poate exista în SEAP chiar dacă potrivirea lipsește.",
  },
  "ted-valori": {
    title: "Valori TED",
    text: "Valorile rămân în moneda și forma publicate: ofertă, interval sau plafon; nu calculăm un total comun. Sortarea după valoare compară numai valori de ofertă/rezultat și de contract publicate în RON, fără intervale, oferte multiple, plafoane sau tipuri încă neverificate.",
  },
  "potrivire-ted": {
    title: "Potrivire cu SEAP",
    text: "Potrivirile cu SEAP folosesc cumpărătorul, câștigătorii, valori comparabile în aceeași monedă, data și codul CPV. Legăturile posibile sunt marcate separat de cele confirmate automat.",
  },
  "plafoane-totaluri": {
    title: "Ce intră în totaluri",
    text: "Achizițiile directe acceptate de cel mult 2 milioane lei și contractele din proceduri de cel mult 1 miliard lei. Contractele peste acest plafon sunt separate de totaluri și listate pe pagina fiecărei instituții.",
  },
  "cronologie-redactie": {
    title: "Cronologie",
    text: "Datele evenimentelor sunt introduse de redacție.",
  },
  "data-validarii": {
    title: "Data validării",
    text: "Data verificării tehnice a datelor, nu a achizițiilor. Sursele pot fi mai vechi.",
  },
  "reper-urmarire": {
    title: "Reper",
    text: "Prima verificare păstrează situația de acum. O înregistrare mai veche observată ulterior va fi etichetată separat.",
  },
  "valoare-minima-alerta": {
    title: "Valoarea minimă",
    text: "0 include toate valorile. La corecții folosim valoarea mai mare dintre cele două versiuni. Schimbările de metodologie rămân separate.",
  },
  // Detail pages: entity, contract, award notice, direct acquisition, documents, radiografie, comparisons.
  "semnale-numarare": {
    title: "Cum se numără semnalele",
    text: "Doar criteriile pentru achiziții directe intră în indicele de risc. Aparițiile se pot suprapune și nu se adună. Semnalele din proceduri se numără o dată pe anunț, indiferent de versiuni, cu anul primului contract; un contract republicat sau un acord-cadru și subsecventul pot apărea separat.",
  },
  "criteriu-neindeplinit": {
    title: "Criteriu neîndeplinit",
    text: "Un criteriu al indicelui poate rămâne neîndeplinit chiar dacă există apariții: finalizarea rapidă și valorile aproape de prag cer o pondere minimă din achizițiile directe ale entității.",
  },
  "prag-vs-fractionare": {
    title: "Aproape de prag sau fracționare",
    text: "Aproape de prag: o achiziție față de plafonul ei. Fracționare: suma unui grup față de plafon. Aceeași achiziție poate apărea în ambele; niciunul nu arată intenția de a evita o procedură.",
  },
  "conducere-onrc": {
    title: "Conducere",
    text: "Reprezentanți legali din Registrul Comerțului (ONRC), instantaneu lunar. Nu sunt neapărat asociații sau proprietarii firmei.",
  },
  "excluse-total": {
    title: "Excluse din total",
    text: "Achiziții directe cu valoare nulă, negativă sau peste 2 milioane lei (filtru de plauzibilitate, nu prag legal). Rămân verificabile, dar nu intră în total.",
  },
  "act-aditional": {
    title: "Act adițional",
    text: "Suma poate fi totalul actualizat, o diferență sau o repetare; impactul real se verifică în documente.",
  },
  "plafon-acord-cadru": {
    title: "Plafon de acord-cadru",
    text: "Totalurile includ doar contractele și comenzile identificate. Dacă lipsesc subsecventele, acoperirea e incompletă; nu înseamnă că nu s-au cheltuit bani.",
  },
  "valoare-atribuita": {
    title: "Valoare atribuită",
    text: "Cifra declarată pe anunț.",
  },
  "comenzi-identificate": {
    title: "Contracte și comenzi identificate",
    text: "Contractele și subsecventele acestei publicații. Plafoanele, actele adiționale și tipurile neclare sunt separate. Lipsa comenzilor nu înseamnă cheltuieli zero.",
  },
  "versiuni-anunt": {
    title: "Versiuni ale anunțului",
    text: "SEAP republică anunțul sub același număr, de regulă când adaugă contracte subsecvente; fiecare versiune are propriile înregistrări.",
  },
  "semnatura-neverificata": {
    title: "Semnătură neverificată",
    text: "Verificarea criptografică a semnăturii a eșuat. Conținutul a fost extras fără validarea semnăturii; originalul P7S este păstrat.",
  },
  "descarcare-automata": {
    title: "Descărcare automată",
    text: "Descărcăm automat doar caietele de sarcini identificate. Din tot istoricul, cele recente întâi.",
  },
  "titlu-cpv": {
    title: "Titlu din categoria CPV",
    text: "Titlul original lipsește din arhivă; afișăm denumirea categoriei CPV.",
  },
  "grafic-dependenta": {
    title: "Graficul relației",
    text: "Procentul de pe axa verticală arată ponderea autorității în contractele publice ale firmei; un procent mare nu exclude clienți privați. Mărimea cercului arată valoarea alocată. Ctrl/⌘ + scroll mărește graficul, tragerea îl deplasează, un clic deschide detaliile.",
  },
  "interval-detectat": {
    title: "Banda aurie",
    text: "Arată intervalul detectat. Selectează un punct pentru detalii.",
  },
  "grup-populatie": {
    title: "Grup după populație",
    text: "Grupul depinde doar de populație, nu de anul sau domeniul ales. Comunele, orașele și municipiile pot fi în același grup; consiliile județene se compară după populația județului.",
  },
  "grup-activitate": {
    title: "Grup după activitate",
    text: "Grupul reunește entități cu un număr asemănător de înregistrări în selecție. Asta nu presupune firme egale ca mărime sau număr de angajați, nici bugete sau populații egale.",
  },
  // Kit G9: the one (?) text of the kind, in Întreabă and in the comparisons; /metodologie#tip-institutie has the rules.
  "tip-institutie": {
    title: "Tipul instituției",
    text: "Primăriile: după registrul localităților, apoi după nume. Spitale (cu institutele clinice), școli și consilii județene: după nume, aproximativ.",
  },
  mediana: {
    title: "Mediana",
    text: "Valoarea din mijloc după ordonare (sau media celor două din mijloc). Exclude entitatea analizată și membrii fără înregistrări.",
  },
  "subdomenii-cpv": {
    title: "Domeniul CPV",
    text: "Un domeniu CPV ales include toate subdomeniile sale.",
  },
  // Ask comparison of two entities.
  "profil-risc": {
    title: "Profil de risc",
    text: "Indicele de risc (CRI) și semnalele sunt calculate pe tot istoricul de achiziții directe al entității, nu pe selecția de mai sus. Un semnal este o pistă de verificat, nu o acuzație și nu dovedește o ilegalitate.",
  },
  // Kit §4 "Prima înregistrare a firmei" (trusa 6): "Prima dată", never "La prima apariție"; the (?) never says
  // "din aprilie 2018": 953 suppliers have older records (entity_card §3.7).
  "prima-data": {
    title: "Prima dată",
    text: "Prima înregistrare a firmei în datele noastre, nu data înființării ei. Anul înmatriculării vine din Registrul Comerțului.",
  },
  "oferte-cunoscute": {
    title: "O singură ofertă",
    text: "Numărul de oferte este publicat doar pentru o parte din contracte, mai ales pentru cele din TED. Procentul se calculează numai pe acestea.",
  },
  // Ask's change between two years (trend, F2): the groups' tips.
  "firma-noua": {
    title: "Noi",
    text: "Fără nicio înregistrare în primul an comparat și cu înregistrări în al doilea, în selecția aleasă. Poate avea înregistrări mai vechi sau în afara selecției.",
  },
  "nu-mai-apare": {
    title: "Nu mai apar",
    text: "Cu înregistrări în primul an comparat și fără niciuna în al doilea, în aceeași selecție. Un contract intră întreg în anul atribuirii, deci firma poate executa încă unul atribuit înainte.",
  },
  // The trend's group (trend final §3.8), its one (?) on the strip, in the sentence and under the rows
  // (defs/trend.ts firstTimeTip adds FIRST_TIME_NARROWED); "prima-data" above is the firm's first record on its profile line.
  "trend-prima-data": {
    title: "Prima dată",
    text: "Dintre cele noi, cele a căror primă înregistrare în datele noastre e în al doilea an comparat. Nu e data înființării.",
  },
  // Ask's distribution (distribution-2, final distribution §7.9): the group, the population band and the criteria.
  "fata-de-cine": {
    title: "Față de cine?",
    text: "Grupul cu care se compară entitatea: același tip sau populație apropiată, același județ, activitate apropiată ori toată țara. Intră doar profilurile cu cel puțin 10 achiziții directe acceptate; comparația cere cel puțin 5 alți membri.",
  },
  "populatie-apropiata": {
    title: "Populație apropiată",
    text: "Primăriile cu între jumătate și dublul populației rezidente (INS, RPL 2021). Comunele, orașele și municipiile stau în același grup: contează populația, nu rangul.",
  },
  "criterii-risc": {
    title: "Criteriile de risc",
    text: "Cinci criterii la instituții și patru la firme, din achizițiile directe acceptate ale întregii arhive. Un criteriu îndeplinit e un semnal de verificat, nu o dovadă.",
  },
  // Ask's verification (fact_check-2, final fact_check §4.1, §4.4): its third verdict and its line "Concurență".
  "acord-cadru": {
    title: "Acord-cadru",
    text: "Acordul-cadru fixează condițiile și un plafon; cumpărarea se face prin contracte subsecvente. Lipsa lor din date poate fi o lipsă de acoperire, nu „nimic cumpărat”.",
  },
  "concurenta-oferte": {
    title: "Concurență",
    text: "Numărul ofertelor e cunoscut doar pentru contractele găsite și în TED. Socotim licitațiile deschise și restrânse. „Nu știm” nu înseamnă cu concurență; achizițiile directe nu au oferte.",
  },
  "aceleasi-luni": {
    title: "Aceleași luni",
    text: "Când al doilea an nu e încheiat în date, ambii ani se compară pe aceleași luni: din ianuarie până la ultima lună completă. Altfel un an parțial ar părea o scădere.",
  },
  // F4, the comparison (final compare §3–§4, plan §8): the (?) of its switch, presets and context rows.
  "clienti-comuni": {
    title: "Doar clienții comuni",
    text: "Instituțiile care au cumpărat de la amândouă, în selecția aleasă; nu neapărat la aceeași licitație sau în același an. Include contractele câștigate împreună, arătate separat. Nu înseamnă că au concurat.",
  },
  "perioada-comuna": {
    title: "Perioada comună",
    text: "De la primul la ultimul an în care apar amândouă în arhivă, în selecția aleasă. Nu e vechimea firmei sau a instituției.",
  },
  "coduri-generale": {
    title: "Coduri mai generale",
    text: "Codul CPV îl alege instituția. Lucrările codate general (de exemplu 45000000 „Lucrări de construcții”) nu intră în domeniul ales; cardul arată cât e pe ele. Înregistrările fără cod CPV ies.",
  },
  "doar-primaria": {
    title: "Doar primăria",
    text: "Direcțiile, regiile și companiile orașului sunt instituții separate, cu achizițiile lor.",
  },
  "sediu-furnizori": {
    title: "Sediul furnizorilor",
    text: "Sediul social al firmei, nu locul lucrării: ultima înmatriculare la Registrul Comerțului, apoi județul din SEAP. Firmele cu sediul în București apar „în alt județ”.",
  },
  // F3's common selection (plan §8; S4 review: their (?) texts lived inline in „Din care”, the windows and the breakdown).
  "marimea-achizitiei": {
    title: "Mărimea achiziției",
    text: "Valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător. Limita de jos intră în plajă, cea de sus nu. Plajele nu sunt praguri legale.",
  },
  procedura: {
    title: "Procedura",
    text: "Procedura declarată în SEAP, doar la contractele din proceduri. Negocierea fără publicare e permisă în cazuri anume: o pistă, nu o abatere.",
  },
  "tip-achizitie": {
    title: "Tipul achiziției",
    text: "Tipul vine din codul CPV ales de cumpărător: 45 lucrări, 50–98 servicii, restul produse.",
  },
  "angajati-benzi": {
    title: "Angajați",
    text: "Din ultimul bilanț depus la Ministerul Finanțelor, nu din anul atribuirii. Firmele fără bilanț (străine, PFA, înființate recent) nu intră în nicio bandă.",
  },
  "inregistrari-consortiu": {
    title: "În asociere",
    text: "La un contract cu mai mulți câștigători, câte o înregistrare pe câștigător, cu cota lui egală. De aceea înregistrările pot fi mai multe decât contractele.",
  },
  // Ask's ranking (F5, final table §3.3, §3.6, §3.7; kit §4): the ranked winners' chips, each a lead, never a signal.
  "firme-noi": {
    title: "Firme noi",
    text: "Furnizori noi: prima înregistrare a firmei cu instituția aleasă e în anul ales sau după. Prima dată: prima înregistrare în datele noastre, nu data înființării. Înmatriculate: anul din Registrul Comerțului (după o mutare de sediu, poate fi anul mutării; firmele străine nu au număr).",
  },
  "client-principal": {
    title: "Principalul lor client public",
    text: "Cel puțin jumătate din tot ce a câștigat firma în achiziții publice (toată arhiva, cel puțin 3 înregistrări) vine de la această instituție. Vânzările private nu se văd aici. E un punct de plecare, nu o abatere.",
  },
  "o-firma-ia-jumatate": {
    title: "O firmă ia peste jumătate",
    text: "Cea mai mare firmă are cel puțin jumătate din valoarea instituției în selecție, din cel puțin 3 înregistrări. Des la școli (alimente), utilități și acorduri-cadru; e un punct de plecare.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;

/** The ideas of the beginner guide, in reading order. */
export const GUIDE_IDEAS: readonly GlossaryId[] = [
  "achizitie-directa",
  "contract-procedura",
  "valoare-inregistrata",
  "semnal",
  "cpv",
  "consortiu",
];

const IDEA_COUNT = ["", "O idee care te ajută", "Două idei care te ajută", "Trei idei care te ajută", "Patru idei care te ajută", "Cinci idei care te ajută", "Șase idei care te ajută", "Șapte idei care te ajută", "Opt idei care te ajută"];

/** The guide heading counts the cards it actually shows. */
export function guideIdeasHeading(count: number = GUIDE_IDEAS.length): string {
  return `${IDEA_COUNT[count] ?? `${count} idei care te ajută`} să citești cifrele`;
}

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  return GLOSSARY[id];
}
