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
    text: "O cumpărare fără licitație: instituția alege direct firma, dacă valoarea estimată fără TVA rămâne sub pragul legal, numit pe site și plafon. Pentru majoritatea instituțiilor (Legea 98/2016), din 10.09.2022 plafonul este 270.120 lei pentru produse și servicii și 900.400 lei pentru lucrări; înainte a fost mai mic, iar entitățile din utilități (Legea 99/2016) pot avea alte praguri. În totaluri numărăm achizițiile directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei: această limită este un filtru de plauzibilitate al site-ului, nu pragul legal.",
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
    text: "Un tipar din date care merită verificat. De exemplu, posibila fracționare: cel puțin 3 achiziții directe ale aceleiași instituții de la aceeași firmă, în același an, cu aceeași clasă CPV și același tip, fiecare sub plafonul ei de achiziție directă, dar care împreună depășesc cel mai mare plafon aplicabil grupului. Este o pistă de verificat, nu o acuzație și nu dovedește o ilegalitate.",
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
  "sediul-institutiei": {
    title: "Județul de pe hartă",
    text: "Harta pune fiecare achiziție în județul unde are sediul instituția care cumpără, nu unde se face lucrarea sau se livrează produsul. Un minister din București apare la București, chiar dacă lucrarea e în alt județ.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;

/** The five ideas of the beginner guide, in reading order, then the consortium rule. */
export const GUIDE_IDEAS: readonly GlossaryId[] = [
  "achizitie-directa",
  "contract-procedura",
  "valoare-inregistrata",
  "semnal",
  "cpv",
  "consortiu",
];

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  return GLOSSARY[id];
}
