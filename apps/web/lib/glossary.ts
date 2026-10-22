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
    text: "O cumpărare mică, fără licitație: sub un prag stabilit de lege, instituția alege direct firma. În totaluri numărăm achizițiile directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei.",
  },
  "contract-procedura": {
    title: "Contract din licitație sau procedură",
    text: "Un contract atribuit printr-o procedură publică, de exemplu o licitație: instituția publică un anunț, iar firmele depun oferte. Procedura nu garantează că au existat mai mulți ofertanți.",
  },
  "valoare-inregistrata": {
    title: "Valoare înregistrată, nu plată",
    text: "Arătăm suma din contract sau din oferta acceptată, așa cum apare în sursă. O ofertă acceptată sau un contract semnat nu dovedește că banii au fost plătiți.",
  },
  semnal: {
    title: "Semnal",
    text: "Un tipar din date care merită verificat, de exemplu mai multe achiziții directe de la aceeași firmă care împreună depășesc pragul. Este o pistă de verificat, nu o acuzație și nu dovedește o ilegalitate.",
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
