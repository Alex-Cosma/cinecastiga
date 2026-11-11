/**
 * Unit prices (owner, 10 November 2026): the same product bought by different institutions, compared per kilogram,
 * litre, piece… Item lines exist only in SEAP's direct-award detail (`core.da_items`): the name the buyer or the
 * catalogue wrote, the quantity, the unit as typed and the final unit price (`closing_price`; quantity × price is the
 * award's value in 99.7% of awards).
 *
 * A line is compared only when
 *  - its name places it in a family below (and its CPV, when the family names CPV prefixes, agrees), and
 *  - its quantity can be read in the family's unit: from the unit written („kg”, „litru”, „tonă”, „mc”) or, for a
 *    piece or a pack, from one size written in the unit or the name („600 g”, „1 L”, „cutie 100 buc”, „6 x 1 kg”).
 * Nothing is guessed: no size, or two different sizes, and the line stays out. Each family also has a plausible price
 * range; a line outside it most likely counts another unit (a box priced as a piece) and is shown apart, never in
 * the median.
 */

export type PriceUnit = "kg" | "l" | "buc" | "top" | "mc" | "ster";
export type PriceGroup = "legume" | "fructe" | "lactate" | "carne" | "panificatie" | "bacanie" | "curatenie" | "birou" | "medicale" | "combustibil" | "incalzire";

export interface PriceFamily {
  slug: string;
  /** Romanian label, as a reader names the product. */
  label: string;
  group: PriceGroup;
  unit: PriceUnit;
  /** Matched against the folded name (lowercase, no diacritics, single spaces). */
  include: RegExp;
  exclude?: RegExp;
  /** The item's CPV must start with one of these, when given (an item without a CPV passes). */
  cpv?: readonly string[];
  /** Plausible lei per family unit, excl. VAT; outside it the line is not compared. */
  range: readonly [number, number];
  /** One sentence on what the family holds, shown on its page. */
  holds: string;
  /**
   * Pack sizes compared apart (owner, 11 November 2026: like with like, a 0,33 l bottle is not a 5 l jug). A line goes
   * to the first pack whose bound its piece's size fits (the size written in the name or the unit, one piece of a
   * multipack); a line sold by the family's unit with no piece size goes to `bulk`, or stays out when `bulk` is null.
   */
  packs?: { readonly list: readonly PricePack[]; readonly bulk: string | null };
}

export interface PricePack {
  slug: string;
  /** How the reader names the pack, after the product: „Apă îmbuteliată, sticle de până la 0,75 l”. */
  label: string;
  /** Largest piece, in the family's unit; null for the last pack. */
  upTo: number | null;
  /** Plausible lei per family unit for this pack, when it differs from the family's. */
  range?: readonly [number, number];
}

/** Groups a reader picks from (owner, 11 November 2026: food split into six; not CPV, which item lines often get wrong). */
export const PRICE_GROUP_LABEL: Record<PriceGroup, string> = {
  legume: "Legume",
  fructe: "Fructe",
  lactate: "Lactate și ouă",
  carne: "Carne",
  panificatie: "Pâine și făinoase",
  bacanie: "Băcănie",
  curatenie: "Curățenie și igienă",
  birou: "Birou",
  medicale: "Materiale sanitare",
  combustibil: "Carburanți",
  incalzire: "Încălzire",
};

export const PRICE_UNIT_LABEL: Record<PriceUnit, { per: string; one: string }> = {
  kg: { per: "lei/kg", one: "kilogram" },
  l: { per: "lei/l", one: "litru" },
  buc: { per: "lei/buc.", one: "bucată" },
  top: { per: "lei/top", one: "top de 500 de coli" },
  mc: { per: "lei/mc", one: "metru cub" },
  ster: { per: "lei/ster", one: "metru ster" },
};

const FOOD = ["03", "15"] as const;
const CLEAN = ["39", "33", "24"] as const;

/** Order matters: the first family whose words match takes the line. Exclusions match word starts („congelat”
 * covers „congelati”). */
export const PRICE_FAMILIES: readonly PriceFamily[] = [
  // ── alimente ──
  { slug: "paine", label: "Pâine", group: "panificatie", unit: "kg", cpv: FOOD, range: [2.5, 30],
    include: /^(paine|franzela)\b/, exclude: /\b(praf|pesmet|prajit|chifl|corn|covrig|lipie|crutoane|aluat|congel|toast|sandvi|burger|hot ?dog|baghet|ciabatt|bagel|brio|cozonac|chec)/,
    holds: "Pâine și franzelă, albă, integrală sau de secară, la bucată sau la kilogram." },
  { slug: "lapte", label: "Lapte de consum", group: "lactate", unit: "l", cpv: FOOD, range: [2.5, 20],
    include: /^lapte\b/, exclude: /\b(praf|condensat|bebe|formula|batut|acru|vegetal|soia|migdal|cocos|ovaz|orez|pudra|ciocolat|cacao|capsul)/,
    holds: "Lapte de vacă de consum, UHT sau proaspăt; fără lapte praf, bătut sau vegetal." },
  { slug: "oua", label: "Ouă", group: "lactate", unit: "buc", cpv: FOOD, range: [0.25, 1.6],
    include: /^(oua|ou)\b/, exclude: /\b(praf|prepelit|ciocolat|pasta|lichid|melanj|kinder|surpriz)/,
    holds: "Ouă de găină, la bucată sau în cofraje cu numărul de ouă scris." },
  { slug: "cartofi", label: "Cartofi", group: "legume", unit: "kg", cpv: FOOD, range: [0.8, 10],
    include: /^cartof/, exclude: /\b(prajit|pai|chips|congel|pure|wedg|dulci|gratin|prefrip|crocheti|rondele|ste(a)?khaus|steak|fantasy|country|feli|cuburi|\d+ ?mm\b)/,
    holds: "Cartofi albi sau roșii, proaspeți; fără cartofi congelați sau prăjiți." },
  { slug: "zahar", label: "Zahăr", group: "bacanie", unit: "kg", cpv: FOOD, range: [2.5, 15],
    include: /^zahar\b/, exclude: /\b(vanil|pudra|plic|brun|trestie|cubic|cuburi|stick|caramel)/,
    holds: "Zahăr alb tos; fără zahăr vanilat, pudră, brun sau la plic." },
  { slug: "faina", label: "Făină", group: "panificatie", unit: "kg", cpv: FOOD, range: [1.5, 12],
    include: /^faina\b/, exclude: /\b(porumb|malai|integral|secara|migdal|cocos|orez|naut|tapioca|ovaz)/,
    holds: "Făină albă de grâu." },
  { slug: "malai", label: "Mălai", group: "panificatie", unit: "kg", cpv: FOOD, range: [2, 15],
    include: /^malai\b/, exclude: /\b(lapte|expandat|pufuleti)/, holds: "Mălai de porumb." },
  { slug: "orez", label: "Orez", group: "panificatie", unit: "kg", cpv: FOOD, range: [4, 40],
    include: /^orez\b/, exclude: /\b(lapte|expandat|rondele|budinc|faina|tapioca)/, holds: "Orez, de orice tip de bob." },
  { slug: "paste", label: "Paste făinoase", group: "panificatie", unit: "kg", cpv: FOOD, range: [4.5, 60],
    include: /^(paste|spaghete|macaroane|tagliatelle|penne|fusilli|fidea|taitei)\b/, exclude: /\b(tomat|rosii|dinti|pesto|ardei|masline|sos|ficat|peste|carne|branza|proaspete)/,
    holds: "Paste făinoase uscate: spaghete, macaroane, fidea, tăiței." },
  { slug: "ulei", label: "Ulei de floarea-soarelui", group: "bacanie", unit: "l", cpv: FOOD, range: [5, 30],
    include: /^ulei\b.*\b(floare|floarea|vegetal|comestibil|soarelui)/, exclude: /\b(motor|hidraulic|masline|masaj|cosmetic|spray)/,
    holds: "Ulei comestibil de floarea-soarelui sau vegetal; fără ulei de măsline." },
  { slug: "unt", label: "Unt", group: "lactate", unit: "kg", cpv: FOOD, range: [20, 150],
    include: /^unt\b/, exclude: /\b(arahide|cacao|shea|vegetal)/, holds: "Unt de vacă, la bucată sau la kilogram.",
    packs: { bulk: "vrac", list: [
      { slug: "portii", label: "porții de până la 30 g", upTo: 0.03, range: [30, 250] },
      { slug: "calup", label: "calupuri de până la 1 kg", upTo: 1, range: [20, 150] },
      { slug: "vrac", label: "la kilogram", upTo: null, range: [15, 120] },
    ] } },
  { slug: "telemea", label: "Telemea", group: "lactate", unit: "kg", cpv: FOOD, range: [12, 100],
    include: /^(telemea|branza telemea)\b/, holds: "Telemea de vacă sau de oaie.",
    packs: { bulk: "vrac", list: [
      { slug: "ambalata", label: "ambalată, până la 1 kg", upTo: 1, range: [15, 100] },
      { slug: "vrac", label: "la kilogram", upTo: null, range: [10, 70] },
    ] } },
  { slug: "cascaval", label: "Cașcaval", group: "lactate", unit: "kg", cpv: FOOD, range: [20, 120],
    include: /^cascaval\b/, exclude: /\b(pane|afumat|feli)/, holds: "Cașcaval la bucată sau la kilogram; fără cașcaval feliat sau afumat." },
  { slug: "iaurt", label: "Iaurt", group: "lactate", unit: "kg", cpv: FOOD, range: [5, 50],
    include: /^iaurt\b/, exclude: /\b(baut|bautura|grecesc|fruct|vegetal|alpro|vegan|cereal|fulgi|capsun|piersic|cais|visin|vanilie|caramel)/,
    holds: "Iaurt simplu, cu gramajul scris; fără iaurt de băut, cu fructe sau cu cereale." },
  { slug: "smantana", label: "Smântână", group: "lactate", unit: "kg", cpv: FOOD, range: [8, 60],
    include: /^smantana\b/, exclude: /\b(dulce|frisca|gatit|vegetal|spray)/, holds: "Smântână fermentată; fără smântână dulce sau de gătit." },
  { slug: "piept-pui", label: "Piept de pui", group: "carne", unit: "kg", cpv: FOOD, range: [12, 70],
    include: /^(piept|file|carne)\b.*\b(pui|gaina)\b/, exclude: /\b(afumat|pulp|aripi|tocat|mici|carnat|parizer|sunca|crenvurst|conserv|pate|cu os|snitel|pane|gatit|marinat|frigarui)/,
    holds: "Piept sau file de pui dezosat, proaspăt sau congelat; fără piept cu os, afumat sau tocat." },
  { slug: "pulpe-pui", label: "Pulpe de pui cu os", group: "carne", unit: "kg", cpv: FOOD, range: [6, 40],
    include: /^pulp.*\bpui\b/, exclude: /\b(afumat|dez|fara os|file|gatit|marinat|pane)/, holds: "Pulpe de pui cu os, întregi, superioare sau inferioare." },
  { slug: "carne-porc", label: "Carne de porc", group: "carne", unit: "kg", cpv: FOOD, range: [12, 70],
    include: /^(carne|cotlet|ceafa|pulpa|spata|muschi)\b.*\bporc\b/, exclude: /\b(afumat|tocat|mici|carnat|parizer|sunca|conserv|pate|slanin|preparat|costit|organe|ficat|osanc)/,
    holds: "Carne de porc proaspătă sau congelată: pulpă, spată, ceafă, cotlet; fără carne tocată, afumată sau preparate." },
  { slug: "ceapa", label: "Ceapă", group: "legume", unit: "kg", cpv: FOOD, range: [1, 10],
    include: /^ceapa\b/, exclude: /\b(verde|deshidrat|praf|congel|rosie|cuburi|prajit|esalot)/, holds: "Ceapă galbenă uscată; fără ceapă verde, roșie sau congelată." },
  { slug: "morcovi", label: "Morcovi", group: "legume", unit: "kg", cpv: FOOD, range: [1, 10],
    include: /^morcov/, exclude: /\b(congel|baby|suc|conserv|ras|cuburi|rondele)/, holds: "Morcovi proaspeți." },
  { slug: "varza", label: "Varză albă", group: "legume", unit: "kg", cpv: FOOD, range: [0.7, 8],
    include: /^varza\b/, exclude: /\b(murat|acra|rosie|chinezeasc|conopid|bruxelles|kale|frunze|tocat|salata)/, holds: "Varză albă proaspătă; fără varză murată sau roșie." },
  { slug: "rosii", label: "Roșii", group: "legume", unit: "kg", cpv: FOOD, range: [3, 30],
    include: /^rosii\b/, exclude: /\b(pasta|bulion|conserv|suc|cherry|chery|cuburi|uscate|decojit|ketchup|sos|san ?marzano|pulpa|tocat)/, holds: "Roșii proaspete; fără roșii cherry sau conserve." },
  { slug: "castraveti", label: "Castraveți", group: "legume", unit: "kg", cpv: FOOD, range: [2, 25],
    include: /^castrave/, exclude: /\b(murat|acri|conserv|otet|cornison|cornichon|in saramura)/, holds: "Castraveți proaspeți; fără murături sau cornișoni." },
  { slug: "ardei", label: "Ardei gras", group: "legume", unit: "kg", cpv: FOOD, range: [3, 35],
    include: /^ardei\b/, exclude: /\b(iute|picant|pasta|boia|conserv|copt|kapia|zacusc|umplut|praf|macinat|congel|cuburi)/, holds: "Ardei gras proaspăt; fără ardei iute, kapia sau conserve." },
  { slug: "mere", label: "Mere", group: "fructe", unit: "kg", cpv: FOOD, range: [1.5, 15],
    include: /^mere\b/, exclude: /\b(suc|piure|deshidrat|uscate|chips|compot|bio|ras|coapte|gem)/, holds: "Mere proaspete." },
  { slug: "banane", label: "Banane", group: "fructe", unit: "kg", cpv: FOOD, range: [4, 18],
    include: /^banane\b/, exclude: /\b(chips|uscate|piure|bio)/, holds: "Banane proaspete." },
  { slug: "portocale", label: "Portocale", group: "fructe", unit: "kg", cpv: FOOD, range: [3, 18],
    include: /^portocal/, exclude: /\b(suc|gem|dulceata|confiat|aroma|bio)/, holds: "Portocale proaspete." },
  { slug: "lamai", label: "Lămâi", group: "fructe", unit: "kg", cpv: FOOD, range: [4, 25],
    include: /^lamai\b/, exclude: /\b(suc|aroma|esenta|bio)/, holds: "Lămâi proaspete." },
  { slug: "fasole", label: "Fasole boabe", group: "bacanie", unit: "kg", cpv: FOOD, range: [5, 35],
    include: /^fasole\b/, exclude: /\b(verde|galben|teci|pastai|conserv|cutie|bucatele|fiart|frecat|sos|taiat|congel|borcan)/, holds: "Fasole boabe uscată; fără fasole verde, galbenă sau conserve." },
  { slug: "apa", label: "Apă îmbuteliată", group: "bacanie", unit: "l", cpv: FOOD, range: [0.3, 10],
    include: /^apa (minerala|plata)\b/, exclude: /\b(aromat|dozator|bidon 19|19 ?l)/, holds: "Apă minerală sau plată îmbuteliată; fără bidoanele de 19 l pentru dozatoare.",
    packs: { bulk: null, list: [
      { slug: "mica", label: "sticle de până la 0,75 l", upTo: 0.75, range: [0.6, 12] },
      { slug: "medie", label: "sticle de 1–2,5 l", upTo: 2.5, range: [0.15, 3] },
      { slug: "bidon", label: "bidoane de la 3 l", upTo: null, range: [0.1, 2] },
    ] } },
  { slug: "sare", label: "Sare de bucătărie", group: "bacanie", unit: "kg", cpv: FOOD, range: [0.8, 12],
    include: /^sare\b/, exclude: /\b(drum|deszapez|industrial|tablet|dedurizar|pastil|antiderapant|baie|lamaie|amar|de mare|himalaya|condiment)/, holds: "Sare alimentară; fără sare pentru drumuri, dedurizare sau sare de lămâie." },
  // ── curățenie ──
  { slug: "detergent-vase", label: "Detergent de vase", group: "curatenie", unit: "l", cpv: CLEAN, range: [3, 50],
    include: /^detergent\b.*\bvase\b/, exclude: /\b(masina|tablet|capsul|automat)/, holds: "Detergent lichid pentru vase spălate de mână." },
  { slug: "inalbitor", label: "Clor și înălbitor", group: "curatenie", unit: "l", cpv: CLEAN, range: [1, 30],
    include: /^(clor|inalbitor|domestos|bona clor|asevi)\b/, exclude: /\b(tablet|pastil|granul|piscin|praf|dioxid|vanish|oxi|rufe|pete|spray|degres|pulveriz|parfum)/, holds: "Înălbitor lichid cu clor; fără tablete sau clor pentru piscine." },
  { slug: "sapun-lichid", label: "Săpun lichid", group: "curatenie", unit: "l", cpv: CLEAN, range: [1.5, 60],
    include: /^sapun lichid\b/, exclude: /\b(dispenser|dozator|spuma|cartus|dezinfect|antisept|chirurg|bebe|copii|intim|tork)/,
    holds: "Săpun lichid pentru mâini; fără cartușele pentru dispensere Tork.",
    packs: { bulk: null, list: [
      { slug: "flacon", label: "flacoane de până la 0,75 l", upTo: 0.75, range: [2, 80] },
      { slug: "litru", label: "flacoane de 1–2 l", upTo: 2, range: [1.5, 40] },
      { slug: "bidon", label: "bidoane de la 3 l", upTo: null, range: [1, 20] },
    ] } },
  { slug: "hartie-igienica-3", label: "Hârtie igienică, 3 straturi", group: "curatenie", unit: "buc", cpv: ["33", "39", "30"], range: [0.3, 4],
    include: /^hartie igienica\b.*\b(3|trei) ?(straturi|strat|str)\b/, exclude: /\b(jumbo|minijumbo|industrial|dispenser|suport|maxi|tork|(?:[6-9]\d|[1-9]\d{2,}) ?m\b)/,
    holds: "Role obișnuite de hârtie igienică în trei straturi, la rolă." },
  { slug: "hartie-igienica", label: "Hârtie igienică", group: "curatenie", unit: "buc", cpv: ["33", "39", "30"], range: [0.15, 2.5],
    include: /^hartie igienica\b/, exclude: /\b(jumbo|minijumbo|industrial|dispenser|suport|maxi|tork|(?:[6-9]\d|[1-9]\d{2,}) ?m\b)/, holds: "Role obișnuite de hârtie igienică, de unul sau două straturi ori fără numărul scris, la rolă; fără role jumbo pentru dispensere." },
  { slug: "alcool-sanitar", label: "Alcool sanitar", group: "curatenie", unit: "l", cpv: ["24", "33", "39"], range: [4, 60],
    include: /^alcool sanitar\b/, exclude: /\b(gel|servetel|tampoan)/, holds: "Alcool sanitar lichid; fără alcool etilic de laborator." },
  // ── birou ──
  { slug: "hartie-a4", label: "Hârtie copiator A4", group: "birou", unit: "top", cpv: ["30", "22"], range: [9, 35],
    include: /^hartie\b.*\b(a4|copiator|xerox)\b/, exclude: /\b(a3|a5|foto|photo|glossy|igienic|color|carton|luci|mat|autocopiativ|etichet|reciclat|asortat|scris|60 ?gr?\b|70 ?gr?\b|100 ?g|120 ?g|160 ?g|1000 ?coli)/,
    holds: "Hârtie albă A4 de 80 g/m² pentru copiator, la top de 500 de coli." },
  // ── medicale ──
  { slug: "manusi-nitril", label: "Mănuși de examinare din nitril", group: "medicale", unit: "buc", cpv: ["33", "18", "39"], range: [0.04, 1.2],
    include: /^manusi\b.*\bnitril/, exclude: /\b(chirurg|steril|menaj|protecti|lucru|textil|piele|sudura|electric|cauciuc|bumbac|impregn|special|cat ?iii|categoria|antitai|termic|chimic)/,
    holds: "Mănuși de examinare din nitril, de unică folosință, la bucată (o pereche sunt două)." },
  { slug: "manusi-examinare", label: "Mănuși de examinare", group: "medicale", unit: "buc", cpv: ["33", "18", "39"], range: [0.04, 1],
    include: /^manusi\b.*\b(examin|nitril|latex|vinil|unica)/, exclude: /\b(chirurg|steril|menaj|protecti|lucru|textil|piele|sudura|electric|cauciuc|bumbac|impregn|special|cat ?iii|categoria|antitai|termic|chimic)/,
    holds: "Mănuși de examinare de unică folosință din latex sau vinil, ori fără materialul scris, la bucată (o pereche sunt două)." },
  // ── combustibil ──
  { slug: "motorina", label: "Motorină", group: "combustibil", unit: "l", cpv: ["09"], range: [5, 12],
    include: /^motorina\b/, exclude: /\b(bon|card|tichet|valoric|aditiv|incalzire)/, holds: "Motorină la pompă, la litru; fără bonuri valorice." },
  { slug: "benzina", label: "Benzină", group: "combustibil", unit: "l", cpv: ["09"], range: [5, 12],
    include: /^benzina\b/, exclude: /\b(bon|card|tichet|valoric|aditiv|extractie)/, holds: "Benzină la pompă, la litru; fără bonuri valorice." },
  // ── încălzire ──
  { slug: "lemne-foc-mc", label: "Lemne de foc, la metru cub", group: "incalzire", unit: "mc", cpv: ["03", "09"], range: [150, 1500],
    include: /^lemn.*\b(foc|esenta|fag|stejar|carpen|salcam)\b/, exclude: /\b(brichet|peleti|rumegus|aprindere)/,
    holds: "Lemne de foc vândute la metru cub." },
  { slug: "lemne-foc-ster", label: "Lemne de foc, la metru ster", group: "incalzire", unit: "ster", cpv: ["03", "09"], range: [100, 1000],
    include: /^lemn.*\b(foc|esenta|fag|stejar|carpen|salcam)\b/, exclude: /\b(brichet|peleti|rumegus|aprindere)/,
    holds: "Lemne de foc vândute la metru ster (lemn stivuit, cu golurile dintre bușteni)." },
];

export const priceFamilyBySlug = (slug: string) => PRICE_FAMILIES.find((f) => f.slug === slug) ?? null;
/** The pack's label, or null when the family has no such pack. */
export const pricePackOf = (family: PriceFamily, pack: string) => family.packs?.list.find((p) => p.slug === pack) ?? null;

/** Lowercase, no diacritics (cedilla or comma below), single spaces. */
export function foldItemText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ── units ───────────────────────────────────────────────────────────────────
type UnitClass =
  | { kind: "mass"; kg: number }
  | { kind: "volume"; l: number }
  | { kind: "piece"; n: number }
  /** A container sold whole: the size written is the container's („sac 25 kg”, „bidon 5 L”, „pachet 500 g”). */
  | { kind: "container" }
  /** Several pieces: the count must be written („bax”, „cutie”, „tipla”, „cofraj”). */
  | { kind: "multi" }
  | { kind: "top" }
  | { kind: "mc" }
  | { kind: "ster" };

const UNIT_WORDS: [RegExp, UnitClass][] = [
  [/^(kg|kgr|kgs|kilogram|kilograme|kilogramul|hilogram|kilogram kg|kg kilogram)$/, { kind: "mass", kg: 1 }],
  [/^(g|gr|gram|grame)$/, { kind: "mass", kg: 0.001 }],
  [/^(t|to|tona|tone)$/, { kind: "mass", kg: 1000 }],
  [/^(l|lt|ltr|litru|litri|litrul|l litru|litru l)$/, { kind: "volume", l: 1 }],
  [/^(ml|mililitru|mililitri)$/, { kind: "volume", l: 0.001 }],
  [/^(buc|bucata|bucati|bc|pc|pcs|ucata|bucata buc|unitate|bucata bucati)$/, { kind: "piece", n: 1 }],
  [/^(pereche|perechi|per)$/, { kind: "piece", n: 2 }],
  [/^(rola|role|rol)$/, { kind: "piece", n: 1 }],
  [/^(top|topuri)$/, { kind: "top" }],
  [/^(mc|m3|metru cub|metri cubi|mcub|m cub)$/, { kind: "mc" }],
  [/^(mst|ster|steri|metru ster|metri steri|m st|mster)$/, { kind: "ster" }],
  [/^(pachet|pac|pach|pack|bidon|bidonul|canistra|flacon|sticla|punga|sac|saci|ambalaj|borcan|galeata|galetusa|tub)$/, { kind: "container" }],
  [/^(cutie|cutia|cut|cutii|bax|baxuri|set|tipla|cofraj|cofrag|naveta|navete|lada|palet|bulk)$/, { kind: "multi" }],
];

const unitKey = (raw: string) => foldItemText(raw).replace(/[().,;:/\\-]+/g, " ").replace(/\s+/g, " ").trim();

/** The unit word alone („Kg.”, „l (litru)”, „buc.”), or null when the unit text says more („bidon 5 L”). */
function unitClass(raw: string): UnitClass | null {
  const key = unitKey(raw);
  for (const [re, cls] of UNIT_WORDS) if (re.test(key)) return cls;
  return null;
}

// ── sizes written in a text ─────────────────────────────────────────────────
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const num = (s: string, small: boolean) => {
  // „1.500 g” is 1500 g; „0,600 kg” is 0.6 kg
  const m = /^(\d+)[.,](\d{3})$/.exec(s);
  if (m && small && m[1] !== "0") return Number(`${m[1]}${m[2]}`);
  return Number(s.replace(",", "."));
};

export interface Sizes { kg: number[]; l: number[]; n: number[]; sheets: number[]; packs: number[] }

/** Every size written in the text, in kg, litres, pieces, sheets and „N topuri”; a multipack („6 x 1 kg”) multiplies,
 * unless `multipacks` is false (one piece's size). */
export function sizesIn(text: string, multipacks = true): Sizes {
  const t = foldItemText(text);
  const out: Sizes = { kg: [], l: [], n: [], sheets: [], packs: [] };
  // „6 x 1 kg”, „6x1kg”, „8 buc * 15 g” before the size; „1 kg x 6” after it
  const before = (i: number) => {
    if (!multipacks) return 1;
    const m = /(\d+)\s*(?:buc\s*)?[x*]\s*$/.exec(t.slice(0, i));
    return m ? Number(m[1]) : 1;
  };
  const after = (end: number) => {
    if (!multipacks) return 1;
    const m = /^\s*[x*]\s*(\d+)\b(?!\s*(?:kg|g|gr|l|ml|cm|mm|m)\b)/.exec(t.slice(end));
    return m ? Number(m[1]) : 1;
  };
  for (const m of t.matchAll(new RegExp(`(?<![\\d.,])${NUM}\\s*(kg|kgr|kilograme?|g|gr|grame?)(?![a-z/])`, "g"))) {
    const small = !m[2]!.startsWith("k");
    const kg = num(m[1]!, small) * (small ? 0.001 : 1);
    if (kg > 0) out.kg.push(kg * before(m.index!) * after(m.index! + m[0].length));
  }
  for (const m of t.matchAll(new RegExp(`(?<![\\d.,])${NUM}\\s*(ml|l|lt|ltr|litri|litru)(?![a-z/])`, "g"))) {
    const small = m[2] === "ml";
    const l = num(m[1]!, small) * (small ? 0.001 : 1);
    if (l > 0) out.l.push(l * before(m.index!) * after(m.index! + m[0].length));
  }
  // pieces: „100 buc”, „10 role”, „30buc/cofraj”, „30/cofraj”, „cutie 100 buc”, „cutie x 100”, „(100 buc)”
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*(?:buc|bucati|bucata|pcs|role|oua|bc)\b(?!\s*[x*])/g)) out.n.push(Number(m[1]));
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*\/\s*(?:cofra[jg]|cutie|bax|set|tipla|pachet)\b/g)) out.n.push(Number(m[1]));
  for (const m of t.matchAll(/\b(?:cutie|cutia|bax|set|pachet|cofraj|cofrag|tipla)\s*(?:x|de|cu|a)?\s*(\d+)\b(?!\s*(?:kg|g|gr|l|ml|litri|coli|file|buc|role|%))/g)) out.n.push(Number(m[1]));
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*(?:coli|file)\b/g)) out.sheets.push(Number(m[1]));
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*(?:topuri|top)\b/g)) out.packs.push(Number(m[1]));
  return out;
}

/** The one value written, NaN when two different ones are, null when none is. */
const one = (xs: number[]) => {
  const distinct = [...new Set(xs.map((x) => Math.round(x * 1e6) / 1e6))];
  return distinct.length === 1 ? distinct[0]! : distinct.length ? NaN : null;
};

export type MeasureSource = "unit" | "unit-text" | "name";
export interface Measure {
  /** Family units in one unit as written (price per family unit = unit price / measure). */
  measure: number;
  source: MeasureSource;
}
export type MeasureMiss = "no_size" | "two_sizes" | "unit_kind";

const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");
/** How the measure was read, for the reader: „600 g, din denumire”; empty when the unit itself is the measure. */
export function measureNote(family: PriceFamily, m: Measure): string {
  if (m.source === "unit" && m.measure === 1) return "";
  const where = m.source === "name" ? "din denumire" : "din unitate";
  const amount = family.unit === "kg" ? (m.measure < 1 ? `${fmt(m.measure * 1000)} g` : `${fmt(m.measure)} kg`)
    : family.unit === "l" ? (m.measure < 1 ? `${fmt(m.measure * 1000)} ml` : `${fmt(m.measure)} l`)
    : family.unit === "top" ? `${fmt(m.measure)} ${m.measure === 1 ? "top" : "topuri"}`
    : `${fmt(m.measure)} buc.`;
  return m.source === "unit" ? amount : `${amount}, ${where}`;
}

const pickSize = (want: PriceUnit, s: Sizes): number | null => {
  if (want === "kg") return one(s.kg);
  if (want === "l") return one(s.l);
  if (want === "buc") return one(s.n);
  if (want === "top") {
    const packs = one(s.packs);
    if (packs != null) return packs;
    const sheets = one(s.sheets);
    return sheets == null || Number.isNaN(sheets) ? sheets : sheets / 500;
  }
  return null;
};

/**
 * The readings of one unit as written, in the family's unit: what the unit says first, then what the name says when
 * the two can disagree („unt 250g” priced „per kg”; „10 role/set” priced „per bucată”). The price decides between them
 * (classifyPriceLine); a miss says why no reading exists. „two_sizes” is two different sizes written in one text.
 */
export function measureReadings(family: PriceFamily, name: string | null, unitRaw: string | null): Measure[] | MeasureMiss {
  const raw = unitRaw ?? "";
  const want = family.unit;
  const cls = unitClass(raw);
  const named = sizesIn(name ?? "");
  const nameSize = pickSize(want, named);
  const sized = (x: number | null): x is number => x != null && !Number.isNaN(x) && x > 0;
  if (want === "mc" || want === "ster") return cls?.kind === want ? [{ measure: 1, source: "unit" }] : "unit_kind";
  if (cls) {
    // The unit is the family's measure (kg, litru, top) or a piece of it: the name may say the piece was a pack.
    const direct = want === "kg" && cls.kind === "mass" ? cls.kg
      : want === "l" && cls.kind === "volume" ? cls.l
      : want === "top" && cls.kind === "top" ? 1
      : want === "buc" && cls.kind === "piece" ? cls.n : null;
    if (direct != null) {
      const out: Measure[] = [{ measure: direct, source: "unit" }];
      // „unt 250g” per kg (a piece of 250 g), „10 role/set” per bucată (a set of 10)
      if (sized(nameSize) && nameSize !== direct && !(want === "buc" && nameSize < direct)) out.push({ measure: nameSize, source: "name" });
      return out;
    }
    if (cls.kind === "mass" || cls.kind === "volume" || cls.kind === "top" || cls.kind === "mc" || cls.kind === "ster") {
      // „PAINE alba 300 G” priced per „g”: the unit is not the family's kind of measure, the name may still be.
      if (cls.kind === "mass" && want === "kg") return [{ measure: cls.kg, source: "unit" }];
      return sized(nameSize) && (want === "kg" || want === "l" || want === "top") ? [{ measure: nameSize, source: "name" }] : "unit_kind";
    }
    if (cls.kind === "piece") {
      // A piece of a product sold by weight or volume: its size is in the name.
      if (nameSize == null) return "no_size";
      if (Number.isNaN(nameSize)) return "two_sizes";
      return [{ measure: nameSize, source: "name" }];
    }
    if (cls.kind === "container") {
      if (want === "buc") {
        if (nameSize == null) return "no_size";
        return Number.isNaN(nameSize) ? "two_sizes" : [{ measure: nameSize, source: "name" }];
      }
      if (nameSize == null) return "no_size";
      if (Number.isNaN(nameSize)) return "two_sizes";
      return [{ measure: nameSize, source: "name" }];
    }
    // Several pieces: the count must be written, then the size of one piece (for kg and l).
    const count = one(named.n);
    if (want === "buc" || want === "top") {
      if (want === "top" && sized(nameSize)) return [{ measure: nameSize, source: "name" }];
      if (count == null) return "no_size";
      return Number.isNaN(count) ? "two_sizes" : [{ measure: count, source: "name" }];
    }
    if (nameSize == null || count == null) return "no_size";
    if (Number.isNaN(nameSize) || Number.isNaN(count)) return "two_sizes";
    return [{ measure: nameSize * count, source: "name" }];
  }
  // A unit text with its own size: „bidon 5 L”, „cutie (100 buc)”, „5 litri”, „pachet x 200g”, „kg 500 gr”.
  const fromUnit = pickSize(want, sizesIn(raw));
  if (fromUnit != null) return Number.isNaN(fromUnit) ? "two_sizes" : [{ measure: fromUnit, source: "unit-text" }];
  if (!raw.trim()) {
    if (nameSize == null) return "no_size";
    return Number.isNaN(nameSize) ? "two_sizes" : [{ measure: nameSize, source: "name" }];
  }
  return "unit_kind";
}

const familyMatches = (f: PriceFamily, folded: string, cpv: string) =>
  f.include.test(folded) && !f.exclude?.test(folded) && (!f.cpv || !cpv || f.cpv.some((p) => cpv.startsWith(p)));

/** „no_pack”: the family compares packs apart and the line names none. */
export type PriceLineStatus = "ok" | "out_of_range" | "no_pack" | MeasureMiss;
export interface ClassifiedLine {
  family: string;
  status: PriceLineStatus;
  measure: number | null;
  measureSource: MeasureSource | null;
  /** Lei per family unit: the reading compared („ok”), or the unit's own reading („out_of_range”). */
  pricePerUnit: number | null;
  /** The pack compared with (PricePack.slug); empty when the family does not split packs. */
  pack: string;
}

/** The pack of a line: its piece's size (name first, then unit), or the family's bulk pack; null when it names none. */
export function packOf(family: PriceFamily, name: string | null, unitRaw: string | null): string | null {
  if (!family.packs) return "";
  const piece = (text: string) => {
    const s = sizesIn(text, false);
    const size = one(family.unit === "kg" ? s.kg : family.unit === "l" ? s.l : []);
    return size == null || Number.isNaN(size) || size <= 0 ? null : size;
  };
  const size = piece(name ?? "") ?? piece(unitRaw ?? "");
  if (size == null) return family.packs.bulk;
  const list = family.packs.list;
  return (list.find((p) => p.upTo == null || size <= p.upTo + 1e-9) ?? list[list.length - 1]!).slug;
}

/**
 * A line's family, measure and price per family unit; null when no family takes it. The readings are tried in order
 * (the unit as written first) and the first whose price falls in the family's plausible range is kept; when none does,
 * the line is kept apart („out_of_range”) with the unit's reading.
 */
export function classifyPriceLine(name: string | null, cpvCode: string | null, unitRaw: string | null, unitPrice: number | null): ClassifiedLine | null {
  const folded = foldItemText(name);
  if (!folded) return null;
  const cpv = (cpvCode ?? "").replace(/\D/g, "");
  const candidates = PRICE_FAMILIES.filter((f) => familyMatches(f, folded, cpv));
  if (!candidates.length) return null;
  // Families with the same words (firewood per mc and per ster) are told apart by the unit.
  let family = candidates[0]!, readings = measureReadings(family, name, unitRaw);
  for (const other of candidates.slice(1)) {
    if (typeof readings !== "string" || other.include.source !== family.include.source) break;
    const next = measureReadings(other, name, unitRaw);
    if (typeof next !== "string") { family = other; readings = next; }
  }
  const pack = packOf(family, name, unitRaw);
  const miss = (status: PriceLineStatus): ClassifiedLine => ({ family: family.slug, status, measure: null, measureSource: null, pricePerUnit: null, pack: pack ?? "" });
  if (typeof readings === "string") return miss(readings);
  if (unitPrice == null || !(unitPrice > 0)) return miss("no_size");
  if (pack == null) return miss("no_pack");
  const [lo, hi] = pricePackOf(family, pack)?.range ?? family.range;
  // The unit as written is trusted first; the name's size only when the unit gives a price the product cannot have.
  const plausible = readings.filter((r) => unitPrice / r.measure >= lo && unitPrice / r.measure <= hi);
  const r = plausible[0] ?? readings[0]!;
  return { family: family.slug, status: plausible.length ? "ok" : "out_of_range", measure: r.measure, measureSource: r.source, pricePerUnit: unitPrice / r.measure, pack };
}
