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
  "oferte-cunoscute": {
    title: "O singură ofertă",
    text: "Numărul de oferte este publicat doar pentru o parte din contracte, mai ales pentru cele din TED. Procentul se calculează numai pe acestea.",
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
