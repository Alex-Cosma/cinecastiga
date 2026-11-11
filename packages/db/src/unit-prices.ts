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
 * the median. When the unit and the name give two different sizes and both prices are plausible („telemea 3 kg” priced
 * „per kg”), the line is „ambiguous” and stays out too (audit of 11 November 2026).
 *
 * A lead („peste dublu”, owner, 11 November 2026): a buyer at LEAD_MIN_RATIO × the median or more, with at least
 * LEAD_MIN_AWARDS awards and LEAD_MIN_EXCESS lei above the median, in a group of at least LEAD_MIN_BUYERS buyers.
 */

export const LEAD_MIN_RATIO = 2, LEAD_MIN_AWARDS = 2, LEAD_MIN_EXCESS = 500, LEAD_MIN_BUYERS = 20;

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
  packs?: { readonly list: readonly PricePack[]; readonly bulk: string | null;
    /** A name that says the line is no bulk („unt porționat”, „aprox. 200 g”): without a readable size it names no pack. */
    readonly notBulk?: RegExp };
  /** A piece smaller than this (in the family's unit) is another product: a jar of pickles, a sachet of sugar. */
  minPiece?: number;
  /** A unit of pairs („pereche”) is taken only when the name says this (a pair of nitrile-coated work gloves is no
   * examination glove). */
  pairOnlyIf?: RegExp;
}

export interface PricePack {
  slug: string;
  /** How the reader names the pack, after the product: „Apă îmbuteliată, sticle de până la 0,75 l”. */
  label: string;
  /** Largest piece, in the family's unit; null for the last pack. */
  upTo: number | null;
  /** Plausible lei per family unit for this pack, when it differs from the family's. */
  range?: readonly [number, number];
  /** Parked (owner, 11 November 2026): its lines are not classified until the pack is rebuilt. */
  parked?: true;
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
/** Packs of a product sold by weight in bags and in bulk (pasta, cheese). */
const SMALL_BULK = (small: string, upTo: number, smallRange: readonly [number, number], bulkRange: readonly [number, number]) => ({ bulk: "vrac", list: [
  { slug: "ambalat", label: small, upTo, range: smallRange },
  { slug: "vrac", label: "la kilogram", upTo: null, range: bulkRange },
] }) as const;

/**
 * Order matters: the first family whose words match takes the line. Exclusions match word starts („congelat” covers
 * „congelati”). Floors sit at about half of the lowest real prices of 2018–2019 (audit of 11 November 2026: a floor
 * inside the real spread cut the cheap half and moved the median up).
 */
export const PRICE_FAMILIES: readonly PriceFamily[] = [
  // ── alimente ──
  { slug: "paine", label: "Pâine", group: "panificatie", unit: "kg", cpv: FOOD, range: [1.5, 30],
    include: /^(paine|franzela)\b/, exclude: /\b(praf|pesmet|prajit|chifl|corn|covrig|lipie|crutoane|aluat|congel|toast|sandvi|burger|hot ?dog|baghet|ciabatt|bagel|brio|cozonac|chec|gluten|masline|rustic|grauin|grau intreg|seminte|cereale|dietetic|integral|secara|graham|tarate|neagra|cartof|manual|artizan|maia|multicereal|proteic|fitness|sandwich|boabe)/,
    holds: "Pâine și franzelă albă sau semialbă, la bucată sau la kilogram; fără pâine integrală, cu semințe, fără gluten sau făcută manual." },
  { slug: "lapte", label: "Lapte de consum", group: "lactate", unit: "l", cpv: FOOD, range: [1.5, 20],
    include: /^lapte\b/, exclude: /\b(praf|condensat|bebe|formula|batut|acru|vegetal|soia|migdal|cocos|ovaz|orez|pudra|ciocolat|cacao|capsul|lactoza|delact|bio|eco\b|ecologic|capra|oaie|aromat|banane|capsuni|vanilie)/,
    holds: "Lapte de vacă de consum, UHT sau proaspăt; fără lapte praf, bătut, vegetal, fără lactoză sau bio." },
  { slug: "oua", label: "Ouă", group: "lactate", unit: "buc", cpv: FOOD, range: [0.2, 1.6],
    include: /^(oua|ou)\b/, exclude: /\b(praf|prepelit|ciocolat|pasta|lichid|melanj|kinder|surpriz|fiert|vopsit|bio|eco\b|ecologic|aer liber|rata|gasca|clasa s\b|xxl|xl\b)/,
    holds: "Ouă de găină, la bucată sau în cofraje cu numărul de ouă scris." },
  { slug: "cartofi", label: "Cartofi", group: "legume", unit: "kg", cpv: FOOD, range: [0.5, 10],
    include: /^cartof/, exclude: /\b(prajit|pai|chips|congel|pure|wedg|dulci|gratin|prefrip|crocheti|rondele|ste(a)?khaus|steak|fantasy|country|feli|cuburi|pommes|noisette|noi\b|nou\b|timpuri|decojit|curatat|vidat|\d+ ?mm\b)/,
    holds: "Cartofi albi sau roșii, proaspeți; fără cartofi noi, congelați sau prăjiți." },
  { slug: "zahar", label: "Zahăr", group: "bacanie", unit: "kg", cpv: FOOD, range: [1.5, 15], minPiece: 0.25,
    include: /^zahar(?![.-]\w)\b/, exclude: /\b(vanil|pudra|plic|brun|trestie|cubic|cuburi|stick|caramel|farin|brut|rahat|mocca|doze|portii|ambalat la|invertit|candel|fructoza|stevia|indulcitor|aromat|\d+ ?x ?\d+ ?gr?\b)/,
    holds: "Zahăr alb tos, în pungi de cel puțin 250 g sau la kilogram; fără zahăr vanilat, pudră, brun sau la plic." },
  { slug: "faina", label: "Făină", group: "panificatie", unit: "kg", cpv: FOOD, range: [1, 12],
    include: /^faina\b/, exclude: /\b(porumb|malai|integral|secara|migdal|cocos|orez|naut|tapioca|ovaz|gluten|hrisca|spelta)/,
    holds: "Făină albă de grâu." },
  { slug: "malai", label: "Mălai", group: "panificatie", unit: "kg", cpv: FOOD, range: [1.2, 15],
    include: /^malai\b/, exclude: /\b(lapte|expandat|pufuleti)/, holds: "Mălai de porumb." },
  { slug: "orez", label: "Orez", group: "panificatie", unit: "kg", cpv: FOOD, range: [2.5, 40],
    include: /^orez\b/, exclude: /\b(lapte|expandat|rondele|budinc|faina|tapioca|basmati|jasmin|iasomie|arborio|risotto|sushi|salbatic|brun|integral|prefiert|parboil)/,
    holds: "Orez alb, cu bob rotund sau lung; fără basmati, orez brun sau prefiert." },
  { slug: "paste", label: "Paste făinoase", group: "panificatie", unit: "kg", cpv: FOOD, range: [2.5, 60],
    include: /^(paste|spaghete|macaroane|tagliatelle|penne|fusilli|fidea|taitei)\b/, exclude: /\b(tomat|rosii|dinti|pesto|ardei|masline|sos|ficat|peste|carne|branza|proaspete|orez|gluten|cartof|soia|konjac|instant|ramen|udon|barilla|barila|knorr|panzani|de casa|cu ou\b|cu oua)/,
    holds: "Paste făinoase uscate din grâu, fără ou: spaghete, macaroane, fidea, tăiței; fără mărcile de import.",
    packs: SMALL_BULK("pungi de până la 500 g", 0.5, [3, 60], [2.5, 30]) },
  { slug: "ulei", label: "Ulei de floarea-soarelui", group: "bacanie", unit: "l", cpv: FOOD, range: [3, 30],
    include: /^ulei\b.*\b(floare|floarea|vegetal|comestibil|soarelui)/, exclude: /\b(motor|hidraulic|masline|masaj|cosmetic|spray|presat|rece|oleic|ho\b|bio|eco\b|ecologic|palmier|friteuza|prajit)/,
    holds: "Ulei comestibil de floarea-soarelui sau vegetal; fără ulei de măsline sau presat la rece." },
  { slug: "unt", label: "Unt", group: "lactate", unit: "kg", cpv: FOOD, range: [20, 150],
    include: /^unt\b/, exclude: /\b(arahide|cacao|shea|vegetal|tartinabil|spread|margarin|clarifiat|ghee|usturoi|ierburi|president|lurpak)/, holds: "Unt de vacă, la bucată sau la kilogram.",
    packs: { bulk: "vrac", notBulk: /\b(portion|portii|pachet|aprox|calup|bucat)/, list: [
      { slug: "portii", label: "porții de până la 30 g", upTo: 0.03, range: [30, 250] },
      { slug: "calup", label: "calupuri de până la 1 kg", upTo: 1, range: [20, 150] },
      { slug: "vrac", label: "la kilogram", upTo: null, range: [15, 120] },
    ] } },
  { slug: "telemea", label: "Telemea", group: "lactate", unit: "kg", cpv: FOOD, range: [8, 100],
    include: /^(telemea|branza telemea)\b/, exclude: /\b(capra|bivol|oaie|oi\b|burduf)/, holds: "Telemea de vacă; fără telemea de capră, de bivoliță sau de oaie.",
    packs: { bulk: "vrac", list: [
      { slug: "ambalata", label: "ambalată, până la 1 kg", upTo: 1, range: [10, 100] },
      { slug: "vrac", label: "la kilogram", upTo: null, range: [8, 70] },
    ] } },
  { slug: "cascaval", label: "Cașcaval", group: "lactate", unit: "kg", cpv: FOOD, range: [12, 120],
    include: /^cascaval\b/, exclude: /\b(pane|afumat|feli|ras|razuit|rulada|impletit|sticks|topit)/, holds: "Cașcaval la bucată sau la kilogram; fără cașcaval feliat, ras sau afumat.",
    packs: SMALL_BULK("ambalat, până la 500 g", 0.5, [14, 120], [12, 90]) },
  { slug: "iaurt", label: "Iaurt", group: "lactate", unit: "kg", cpv: FOOD, range: [3, 30], minPiece: 0.1,
    packs: { bulk: "mare", list: [
      { slug: "pahar", label: "pahare de până la 200 g", upTo: 0.2, range: [4, 30] },
      { slug: "mare", label: "ambalaje de peste 200 g și la kilogram", upTo: null, range: [3, 25] },
    ] },
    include: /^iaurt\b/, exclude: /\b(baut|bautura|grecesc|fruct|vegetal|alpro|vegan|cereal|fulgi|capsun|piersic|cais|visin|vanilie|caramel|bio|eco\b|ecologic|arome|aroma|crema|olympus|danonino|copii|kids|sana|lapte batut|kefir|capra|oaie|bivol|10 ?%)/,
    holds: "Iaurt simplu, cu gramajul scris; fără iaurt de băut, grecesc, bio, cu fructe sau cu cereale." },
  { slug: "smantana", label: "Smântână", group: "lactate", unit: "kg", cpv: FOOD, range: [5, 60],
    include: /^smantana\b/, exclude: /\b(dulce|frisca|gatit|vegetal|spray|lichida|3[0-5] ?%)/, holds: "Smântână fermentată; fără smântână dulce sau de gătit." },
  { slug: "piept-pui", label: "Piept de pui", group: "carne", unit: "kg", cpv: FOOD, range: [10, 70], minPiece: 0.5,
    include: /^(piept|file)\b.*\b(pui|gaina)\b/, exclude: /\b(afumat|pulp|aripi|tocat|mici|carnat|parizer|sunca|crenvurst|conserv|pate|cu os|snitel|pane|gatit|marinat|frigarui|caroli|cris ?tim|pastrama|presat|feliat|cu piele|mezel|rulada)/,
    holds: "Piept sau file de pui dezosat, proaspăt sau congelat; fără piept cu os, afumat, tocat sau mezeluri." },
  { slug: "pulpe-pui", label: "Pulpe de pui cu os", group: "carne", unit: "kg", cpv: FOOD, range: [4, 40],
    include: /^pulp.*\bpui\b/, exclude: /\b(afumat|dez|fara os|file|gatit|marinat|pane|cu sp|spinare|f\.? ?os\b)/, holds: "Pulpe de pui cu os, întregi, superioare sau inferioare; fără pulpe cu spate." },
  { slug: "carne-porc", label: "Carne de porc", group: "carne", unit: "kg", cpv: FOOD, range: [9, 70], minPiece: 0.5,
    include: /^(carne|cotlet|ceafa|pulpa|spata)\b.*\bporc\b/, exclude: /\b(afumat|tocat|mici|carnat|parizer|sunca|conserv|pate|slanin|preparat|costit|organe|ficat|osanc|mezel|taranesc|scandia|lucru|haituit|cu os|hamburger|gulas)/,
    holds: "Carne de porc proaspătă sau congelată: pulpă, spată, ceafă, cotlet; fără carne tocată, afumată sau preparate." },
  { slug: "ceapa", label: "Ceapă", group: "legume", unit: "kg", cpv: FOOD, range: [0.6, 10],
    include: /^ceapa\b/, exclude: /\b(verde|deshidrat|praf|congel|rosie|cuburi|prajit|esalot|arpagic|stuttgart|samanta|rasad)/, holds: "Ceapă galbenă uscată; fără ceapă verde, roșie sau congelată." },
  { slug: "morcovi", label: "Morcovi", group: "legume", unit: "kg", cpv: FOOD, range: [0.6, 10],
    include: /^morcov/, exclude: /\b(congel|baby|suc|conserv|ras|cuburi|rondele|feli|vidat|refriger|curatat|decojit)/, holds: "Morcovi proaspeți." },
  { slug: "varza", label: "Varză albă", group: "legume", unit: "kg", cpv: FOOD, range: [0.4, 8],
    include: /^varza\b/, exclude: /\b(murat|acra|rosie|chinezeasc|conopid|bruxelles|kale|frunze|tocat|salata|noua|timpuri)/, holds: "Varză albă proaspătă; fără varză nouă, murată sau roșie." },
  { slug: "rosii", label: "Roșii", group: "legume", unit: "kg", cpv: FOOD, range: [1.5, 30], minPiece: 1,
    include: /^rosii\b/, exclude: /\b(pasta|bulion|conserv|suc|cherry|chery|cheri|cherr|cuburi|cub|uscate|decojit|ketchup|sos|san ?marzano|pulpa|tocat|pasat|passat|cirio|sticla|borcan|cutie|doza|amatta)/, holds: "Roșii proaspete; fără roșii cherry sau conserve." },
  { slug: "castraveti", label: "Castraveți", group: "legume", unit: "kg", cpv: FOOD, range: [1.2, 25], minPiece: 1,
    include: /^castrave/, exclude: /\b(murat|acri|conserv|otet|cornis|cornichon|in saramura|borcan|\d ?- ?\d ?cm)/, holds: "Castraveți proaspeți; fără murături sau cornișori." },
  { slug: "ardei", label: "Ardei gras", group: "legume", unit: "kg", cpv: FOOD, range: [1.5, 35], minPiece: 1,
    include: /^ardei\b/, exclude: /\b(iut|picant|pasta|boia|conserv|copt|kapia|capia|zacusc|umplut|praf|macinat|congel|cuburi|tocat|murat|otet|borcan|dulce|rosu|rosi|red\b)/, holds: "Ardei gras verde, galben sau alb, proaspăt; fără ardei roșu, iute, kapia sau conserve." },
  { slug: "mere", label: "Mere", group: "fructe", unit: "kg", cpv: FOOD, range: [1, 15],
    include: /^mere\b/, exclude: /\b(suc|piure|deshidrat|uscate|chips|compot|bio|ras|coapte|gem)/, holds: "Mere proaspete." },
  { slug: "banane", label: "Banane", group: "fructe", unit: "kg", cpv: FOOD, range: [2.5, 18],
    include: /^banane\b/, exclude: /\b(chips|uscate|piure|bio)/, holds: "Banane proaspete." },
  { slug: "portocale", label: "Portocale", group: "fructe", unit: "kg", cpv: FOOD, range: [2, 18],
    include: /^portocal/, exclude: /\b(suc|gem|dulceata|confiat|aroma|bio)/, holds: "Portocale proaspete." },
  { slug: "lamai", label: "Lămâi", group: "fructe", unit: "kg", cpv: FOOD, range: [2.5, 25],
    include: /^lamai\b/, exclude: /\b(suc|aroma|esenta|bio|verzi|verde|lime)/, holds: "Lămâi proaspete." },
  { slug: "fasole", label: "Fasole boabe", group: "bacanie", unit: "kg", cpv: FOOD, range: [3, 35], minPiece: 0.45,
    include: /^fasole\b/, exclude: /\b(verde|galben|teci|pastai|conserv|cutie|bucatele|fiart|frecat|sos|taiat|congel|cngel|borcan|batut|rosie|mung|neagra)/, holds: "Fasole boabe albă, uscată; fără fasole verde, galbenă sau conserve." },
  { slug: "apa", label: "Apă îmbuteliată", group: "bacanie", unit: "l", cpv: FOOD, range: [0.3, 10],
    include: /^apa (minerala|plata)\b/, exclude: /\b(aromat|dozator|watercooler|bidon 19|1[89](?:[.,]\d+)? ?l(?:itri)?\b|nrgb|rgb\b|panna|pellegrino|perrier|evian|0[.,]33 ?l? ?(?:in )?sticla|sticla (?:de )?0[.,]33)/, holds: "Apă minerală sau plată îmbuteliată; fără bidoanele de 19 l pentru dozatoare.",
    packs: { bulk: null, list: [
      { slug: "mica", label: "sticle de până la 0,75 l", upTo: 0.75, range: [0.6, 12] },
      { slug: "medie", label: "sticle de peste 0,75 l, sub 3 l", upTo: 2.999, range: [0.15, 3] },
      { slug: "bidon", label: "bidoane de la 3 l", upTo: null, range: [0.1, 2] },
    ] } },
  { slug: "sare", label: "Sare de bucătărie", group: "bacanie", unit: "kg", cpv: FOOD, range: [0.4, 12],
    include: /^sare\b/, exclude: /\b(drum|deszapez|industrial|tablet|dedurizar|pastil|antiderapant|baie|lamaie|amar|de mare|himalaya|condiment|dezapez|masin|vase|finis|somat|regenerant|granul|marar|cimbru|piper|tub\b|solnita|bulgar|bovine|lins)/, holds: "Sare alimentară; fără sare pentru drumuri, dedurizare, mașina de spălat vase sau sare de lămâie." },
  // ── curățenie ──
  { slug: "detergent-vase", label: "Detergent de vase", group: "curatenie", unit: "l", cpv: CLEAN, range: [1.5, 50],
    include: /^detergent\b.*\bvase\b/, exclude: /\b(masin|tablet|capsul|automat|inox|virto|dezinfect|aseptopol|suma|profes|concentrat|superconcentrat|fairy|pur\b)/, holds: "Detergent lichid obișnuit pentru vase spălate de mână; fără detergent profesional sau concentrat.",
    packs: { bulk: null, list: [
      { slug: "flacon", label: "flacoane de până la 0,75 l", upTo: 0.75, range: [2.5, 50] },
      { slug: "litru", label: "flacoane de peste 0,75 l, sub 3 l", upTo: 2.999, range: [1.5, 30] },
      { slug: "bidon", label: "bidoane de la 3 l", upTo: null, range: [1, 20] },
    ] } },
  { slug: "sapun-lichid", label: "Săpun lichid", group: "curatenie", unit: "l", cpv: CLEAN, range: [1.5, 60],
    include: /^sapun lichid\b/, exclude: /\b(dispenser|dozator|spuma|cartus|dezinfect|antisept|chirurg|bebe|copii|intim|tork|descosoft|baktolin|securgerm|wepa|nou nascut|premium|sensitive|antibact|antimicrob|argan|dermomed|igienizant)/,
    holds: "Săpun lichid obișnuit pentru mâini; fără săpun antibacterian și fără cartușele pentru dispensere.",
    packs: { bulk: null, list: [
      // Parked (owner, 11 November 2026): branded pump bottles against no-name refills; no like-for-like comparison yet.
      { slug: "flacon", label: "flacoane de până la 0,75 l", upTo: 0.75, range: [2, 80], parked: true },
      { slug: "litru", label: "flacoane de peste 0,75 l, sub 3 l", upTo: 2.999, range: [1.5, 40] },
      { slug: "bidon", label: "bidoane de la 3 l", upTo: null, range: [1, 20] },
    ] } },
  { slug: "alcool-sanitar", label: "Alcool sanitar", group: "curatenie", unit: "l", cpv: ["24", "33", "39"], range: [3, 60],
    include: /^alcool sanitar\b/, exclude: /\b(gel|servetel|tampoan)/, holds: "Alcool sanitar lichid; fără alcool etilic de laborator.",
    packs: { bulk: "litru", list: [
      { slug: "mic", label: "flacoane de până la 250 ml", upTo: 0.25, range: [5, 60] },
      { slug: "litru", label: "flacoane de peste 250 ml și la litru", upTo: null, range: [3, 40] },
    ] } },
  // ── birou ──
  { slug: "hartie-a4", label: "Hârtie copiator A4", group: "birou", unit: "top", cpv: ["30", "22"], range: [8, 35],
    include: /^hartie\b.*\b(a4|copiator|xerox)\b/, exclude: /\b(a3|a5|foto|photo|gloss|igienic|color|carton|luci|mat|autocopiativ|autocolant|adeziv|etichet|reciclat|asortat|scris|colotech|high grad|rosu|galben|verde|albastr|roz|intens|pastel|(?:6\d|7\d|9\d|[1-3]\d\d) ?gr?\b|(?:100|250|1000) ?coli)/,
    holds: "Hârtie albă A4 de 80 g/m² pentru copiator, la top de 500 de coli." },
  // ── medicale ──
  { slug: "manusi-nitril", label: "Mănuși de examinare din nitril", group: "medicale", unit: "buc", cpv: ["33", "18", "39"], range: [0.04, 1.2],
    include: /^manusi\b.*\bnitr[iy]l/, pairOnlyIf: /\b(examin|unica|consult)/,
    exclude: /\b(chirurg|steril|menaj|protecti|lucru|textil|piele|sudura|electric|cauciuc|bumbac|impregn|special|cat ?iii|categoria|antitai|termic|chimic|palma|nylon|sensor|grey|tricot|imersat|poliester|microflex|rotiprotect|cleanroom|ambulan|high risk)/,
    holds: "Mănuși de examinare din nitril, de unică folosință, la bucată (o pereche sunt două)." },
  // ── combustibil ──
  { slug: "motorina", label: "Motorină", group: "combustibil", unit: "l", cpv: ["09"], range: [3.5, 12],
    include: /^motorina\b/, exclude: /\b(bon|card|tichet|valoric|aditiv|incalzire)/, holds: "Motorină la pompă, la litru; fără bonuri valorice." },
  { slug: "benzina", label: "Benzină", group: "combustibil", unit: "l", cpv: ["09"], range: [3.5, 12],
    include: /^benzina\b/, exclude: /\b(bon|card|tichet|valoric|aditiv|extractie|avgas|aviat|100 ?ll)/, holds: "Benzină la pompă, la litru; fără bonuri valorice." },
];

/**
 * Parked families (owner, 11 November 2026, after the audit): not classified and not shown until rebuilt. Bleach mixed
 * Domestos gel with plain chlorine and a brand of floor cleaners; toilet paper spans one-ply 50 g rolls to premium
 * three-ply; „mănuși de unică folosință” took work gloves and thick ambulance gloves; firewood prices depend on the
 * species, the cutting and the transport, which the name rarely says. The definitions stay here to return from.
 */
export const PARKED_PRICE_FAMILIES: readonly PriceFamily[] = [
  { slug: "inalbitor", label: "Clor și înălbitor", group: "curatenie", unit: "l", cpv: CLEAN, range: [1, 30],
    include: /^(clor|inalbitor|bona clor)\b/, exclude: /\b(tablet|pastil|granul|piscin|praf|dioxid|vanish|oxi|rufe|pete|spray|degres|pulv|parfum|detartr|trigger|wc\b|toalet|gel\b|odoriz|pardos|podele|ceara|parchet)/, holds: "Înălbitor lichid cu clor; fără tablete sau clor pentru piscine." },
  { slug: "hartie-igienica-3", label: "Hârtie igienică, 3 straturi", group: "curatenie", unit: "buc", cpv: ["33", "39", "30"], range: [0.3, 4],
    include: /^hartie igienica\b.*\b(3|trei) ?(straturi|staturi|strat|str)\b/, exclude: /\b(jumbo|minijumbo|mini\b|compact|role mari|industrial|dispenser|suport|maxi|tork|(?:[5-9]\d|[1-9]\d{2,}) ?ml?\b)/,
    holds: "Role obișnuite de hârtie igienică în trei straturi, la rolă." },
  { slug: "hartie-igienica", label: "Hârtie igienică", group: "curatenie", unit: "buc", cpv: ["33", "39", "30"], range: [0.15, 2.5],
    include: /^hartie igienica\b/, exclude: /\b(jumbo|minijumbo|mini\b|compact|role mari|industrial|dispenser|suport|maxi|tork|(?:[5-9]\d|[1-9]\d{2,}) ?ml?\b)/, holds: "Role obișnuite de hârtie igienică, de unul sau două straturi ori fără numărul scris, la rolă; fără role jumbo pentru dispensere." },
  { slug: "manusi-examinare", label: "Mănuși de examinare", group: "medicale", unit: "buc", cpv: ["33", "18", "39"], range: [0.04, 1],
    include: /^manusi\b.*\b(examin|latex|vinil|consult)/, pairOnlyIf: /\b(examin|unica|consult)/,
    exclude: /\b(chirurg|steril|menaj|protecti|lucru|textil|piele|sudura|electric|cauciuc|bumbac|bbc|impregn|special|cat ?iii|categoria|antitai|termic|chimic|tricot|imersat|palma|antiintep|ambulan|groase|laborator|plastic|polietilen)/,
    holds: "Mănuși de examinare de unică folosință din latex sau vinil, la bucată (o pereche sunt două)." },
  { slug: "lemne-foc-mc", label: "Lemne de foc, la metru cub", group: "incalzire", unit: "mc", cpv: ["03", "09"], range: [150, 1500],
    include: /^lemne?\b.*\bfoc\b/, exclude: /\b(brichet|peleti|rumegus|aprindere|rotund|bustean|cherestea)/,
    holds: "Lemne de foc vândute la metru cub." },
  { slug: "lemne-foc-ster", label: "Lemne de foc, la metru ster", group: "incalzire", unit: "ster", cpv: ["03", "09"], range: [100, 1000],
    include: /^lemne?\b.*\bfoc\b/, exclude: /\b(brichet|peleti|rumegus|aprindere|rotund|bustean|cherestea)/,
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
  /** `pair`: „pereche”, two pieces, read only for gloves. */
  | { kind: "piece"; n: number; pair?: true }
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
  [/^(pereche|perechi|per)$/, { kind: "piece", n: 2, pair: true }],
  [/^(rola|role|rol)$/, { kind: "piece", n: 1 }],
  [/^(top|topuri)$/, { kind: "top" }],
  [/^(mc|m3|metru cub|metri cubi|mcub|m cub)$/, { kind: "mc" }],
  [/^(mst|ster|steri|metru ster|metri steri|m st|mster)$/, { kind: "ster" }],
  [/^(pachet|pac|pach|pack|bidon|bidonul|canistra|flacon|sticla|punga|plasa|sac|saci|ambalaj|borcan|galeata|galetusa|tub)$/, { kind: "container" }],
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
/** A number starts here: no digit, decimal part or fraction before it („BUC.5KG” and „aprox.200g” are sizes; the „2”
 * of „1/2 litri” is not). */
const START = String.raw`(?<!\d)(?<!\d[.,])(?<!\d\s?\/\s?)`;
/** A size ends here: no letter after it, except „x N” of a multipack („10gx100buc”); no „/m”, „/mp”, „/m2” (grams per
 * square metre), while „500 g/buc” and „1 l/sticlă” are sizes. */
const END = String.raw`(?![a-wyz]|x(?!\s*\d))(?!\s*\/\s*(?:m|mp|m2|mc)\b)`;
const num = (s: string, small: boolean) => {
  // „1.500 g” is 1500 g; „0,600 kg” is 0.6 kg
  const m = /^(\d+)[.,](\d{3})$/.exec(s);
  if (m && small && m[1] !== "0") return Number(`${m[1]}${m[2]}`);
  return Number(s.replace(",", "."));
};

export interface Sizes { kg: number[]; l: number[]; n: number[]; eggs: number[]; sheets: number[]; packs: number[] }

/** Every size written in the text, in kg, litres, pieces, sheets and „N topuri”; a multipack („6 x 1 kg”) multiplies,
 * unless `multipacks` is false (one piece's size). „N ouă” is kept apart: a count for eggs, an ingredient for pasta. */
export function sizesIn(text: string, multipacks = true): Sizes {
  const t = foldItemText(text);
  const out: Sizes = { kg: [], l: [], n: [], eggs: [], sheets: [], packs: [] };
  // „6 x 1 kg”, „6x1kg”, „8 buc * 15 g” before the size; „1 kg x 6”, „10 g x 100 buc” after it
  const before = (i: number) => {
    if (!multipacks) return 1;
    const m = /(\d+)\s*(?:buc\s*)?[x*]\s*$/.exec(t.slice(0, i));
    return m ? Number(m[1]) : 1;
  };
  const after = (end: number) => {
    if (!multipacks) return 1;
    const m = /^\s*[x*]\s*(\d+)(?:\s*(?:buc|bucati|pcs|bc)\b)?(?![\d.,]|\s*(?:kg|g|gr|l|ml|cm|mm|m)\b)/.exec(t.slice(end));
    return m ? Number(m[1]) : 1;
  };
  // „1/2 litri”, „1/4 kg”: a fraction of the unit
  const fraction = (unit: string, into: number[]) => {
    for (const m of t.matchAll(new RegExp(`(?<![\\d.,])(\\d)\\s*\\/\\s*(\\d)\\s*(?:${unit})${END}`, "g"))) {
      const a = Number(m[1]), b = Number(m[2]);
      // halves, thirds and quarters; „4/5 l” is „4 or 5 litres”
      if (a > 0 && b > a && b <= 4) into.push(a / b);
    }
  };
  for (const m of t.matchAll(new RegExp(`${START}${NUM}\\s*(kg|kgr|kilograme?|g|gr|grame?)${END}`, "g"))) {
    const small = !m[2]!.startsWith("k");
    const kg = num(m[1]!, small) * (small ? 0.001 : 1);
    if (kg > 0) out.kg.push(kg * before(m.index!) * after(m.index! + m[0].length));
  }
  fraction("kg|kilogram", out.kg);
  for (const m of t.matchAll(new RegExp(`${START}${NUM}\\s*(ml|l|lt|ltr|litri|litru)${END}`, "g"))) {
    const small = m[2] === "ml";
    const l = num(m[1]!, small) * (small ? 0.001 : 1);
    if (l > 0) out.l.push(l * before(m.index!) * after(m.index! + m[0].length));
  }
  fraction("l|litri|litru", out.l);
  // pieces: „100 buc”, „10 role”, „30buc/cofraj”, „30/cofraj”, „cutie 100 buc”, „cutie x 100”, „(100 buc)”;
  // „8+2 role” are ten and „2x20 role” forty, never the last number alone
  const PIECES = "buc|bucati|bucata|pcs|role|bc";
  const alone = String.raw`(?<![\d.,+])(?<![\d.,]\s?[+x*]\s?)`;
  for (const m of t.matchAll(new RegExp(`(?<![\\d.,])(\\d+)\\s*\\+\\s*(\\d+)\\s*(?:${PIECES})\\b`, "g"))) out.n.push(Number(m[1]) + Number(m[2]));
  for (const m of t.matchAll(new RegExp(`(?<![\\d.,])(\\d+)\\s*[x*]\\s*(\\d+)\\s*(?:${PIECES})\\b`, "g"))) out.n.push(Number(m[1]) * Number(m[2]));
  for (const m of t.matchAll(new RegExp(`${alone}(\\d+)\\s*(?:${PIECES})\\b(?!\\s*[x*])`, "g"))) out.n.push(Number(m[1]));
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*oua\b(?!\s*[x*])/g)) out.eggs.push(Number(m[1]));
  for (const m of t.matchAll(/(?<![\d.,])(\d+)\s*\/\s*(?:cofra[jg]|cutie|bax|set|tipla|pachet)\b/g)) out.n.push(Number(m[1]));
  // „set 3 straturi”, „pachet 2 str” name the plies, „cutie 30 cm” a length
  for (const m of t.matchAll(/\b(?:cutie|cutia|bax|set|pachet|cofraj|cofrag|tipla)\s*(?:x|de|cu|a)?\s*(\d+)\b(?!\s*(?:kg|g|gr|l|ml|litri|coli|file|buc|role|%|straturi|strat|str|pliuri|cm|mm|m)\b)(?!\s*[+x*,.]\s*\d)/g)) out.n.push(Number(m[1]));
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
/** „ambiguous”: two readings the text cannot choose between („1 l / 6 buc” priced per piece). */
export type MeasureMiss = "no_size" | "two_sizes" | "unit_kind" | "ambiguous";

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

/** Pieces counted in a text: for eggs „30 ouă” is a count too. */
const counts = (family: PriceFamily, s: Sizes) => family.slug === "oua" ? [...s.n, ...s.eggs] : s.n;

const pickSize = (family: PriceFamily, s: Sizes): number | null => {
  const want = family.unit;
  if (want === "kg") return one(s.kg);
  if (want === "l") return one(s.l);
  if (want === "buc") return one(counts(family, s));
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
  const nameSize = pickSize(family, named);
  const sized = (x: number | null): x is number => x != null && !Number.isNaN(x) && x > 0;
  /** A size that must be there and be one. */
  const must = (x: number | null): Measure[] | MeasureMiss => x == null || x === 0 ? "no_size" : Number.isNaN(x) ? "two_sizes" : [{ measure: x, source: "name" }];
  if (want === "mc" || want === "ster") return cls?.kind === want ? [{ measure: 1, source: "unit" }] : "unit_kind";
  if (cls) {
    // Pairs are gloves' unit; „orez 1 kg” priced per „perechi” is a mistyped unit, not a kilogram.
    if (cls.kind === "piece" && cls.pair && want !== "buc") return "unit_kind";
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
    // Another kind of measure (a kg family priced per litre, per top, per cubic metre): never divided by the name's size.
    if (cls.kind === "mass" || cls.kind === "volume" || cls.kind === "top" || cls.kind === "mc" || cls.kind === "ster") return "unit_kind";
    if (cls.kind === "piece" || cls.kind === "container") {
      // A piece or a container of a product sold by weight or volume: its size is in the name. A count written beside
      // it („1 l / 6 buc”, „0,75 l 15 buc/bax”) may make the piece a case: the text cannot say.
      const r = must(nameSize);
      if (typeof r !== "string" && (want === "kg" || want === "l") && named.n.some((n) => n > 1)) return "ambiguous";
      return r;
    }
    // Several pieces (cutie, bax, set): the count must be written, then the size of one piece (for kg and l).
    const count = one(counts(family, named));
    if (want === "buc" || want === "top") {
      if (want === "top" && sized(nameSize)) return [{ measure: nameSize, source: "name" }];
      return must(count);
    }
    // „10 g x 100 buc” is one kilogram already: the multipack is not multiplied again by its own count.
    const piece = pickSize(family, sizesIn(name ?? "", false));
    if (piece == null || nameSize == null) return "no_size";
    if (Number.isNaN(piece) || Number.isNaN(nameSize)) return "two_sizes";
    if (Math.abs(nameSize - piece) > 1e-9) return count == null || Math.abs(piece * count - nameSize) < 1e-9 ? [{ measure: nameSize, source: "name" }] : "two_sizes";
    if (count == null || count === 0) return "no_size";
    if (Number.isNaN(count)) return "two_sizes";
    return [{ measure: piece * count, source: "name" }];
  }
  // A unit text with its own size: „bidon 5 L”, „cutie (100 buc)”, „5 litri”, „pachet x 200g”, „kg 500 gr”.
  const fromUnit = pickSize(family, sizesIn(raw));
  if (fromUnit != null) return Number.isNaN(fromUnit) ? "two_sizes" : fromUnit > 0 ? [{ measure: fromUnit, source: "unit-text" }] : "no_size";
  if (!raw.trim()) return must(nameSize);
  return "unit_kind";
}

const familyMatches = (f: PriceFamily, folded: string, cpv: string) =>
  f.include.test(folded) && !f.exclude?.test(folded) && (!f.cpv || !cpv || f.cpv.some((p) => cpv.startsWith(p)));

/** „no_pack”: the family compares packs apart and the line names none. „ambiguous”: two plausible readings. */
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

/** One piece's size written in a text, in the family's unit (kg or l); null when none or two are. */
const pieceSize = (family: PriceFamily, text: string | null): number | null | typeof NaN => {
  if (family.unit !== "kg" && family.unit !== "l") return null;
  const s = sizesIn(text ?? "", false);
  return one(family.unit === "kg" ? s.kg : s.l);
};

/** The pack of a line: its piece's size (name first, then unit), or the family's bulk pack; null when it names none. */
export function packOf(family: PriceFamily, name: string | null, unitRaw: string | null): string | null {
  if (!family.packs) return "";
  const read = (text: string | null) => { const x = pieceSize(family, text); return x != null && x <= 0 ? null : x; };
  const size = read(name) ?? read(unitRaw);
  // Two sizes written („unt porționat 10 gr; 15 gr; 20 gr”) name no pack, and neither does a name that says it is no bulk.
  if (size != null && Number.isNaN(size)) return null;
  if (size == null) return family.packs.notBulk?.test(foldItemText(name)) ? null : family.packs.bulk;
  const list = family.packs.list;
  return (list.find((p) => p.upTo == null || size <= p.upTo + 1e-9) ?? list[list.length - 1]!).slug;
}

/**
 * A line's family, measure and price per family unit; null when no family takes it. The unit as written is read first.
 * Its price in the plausible range is kept, unless the name's size gives a plausible price too: then the line is
 * „ambiguous” („telemea 3 kg” at 59 lei „per kg” is a bucket's price or a dear kilogram). The name's size is used only
 * when the unit's price is far outside the range (a box of 100 gloves priced „per bucată”); a near miss stays
 * „out_of_range”, never multiplied by the name's size.
 */
export function classifyPriceLine(name: string | null, cpvCode: string | null, unitRaw: string | null, unitPrice: number | null): ClassifiedLine | null {
  const folded = foldItemText(name);
  if (!folded) return null;
  const cpv = (cpvCode ?? "").replace(/\D/g, "");
  const candidates = PRICE_FAMILIES.filter((f) => familyMatches(f, folded, cpv));
  if (!candidates.length) return null;
  // Families with the same words (told apart by the unit) take the first whose unit reads.
  let family = candidates[0]!, readings = measureReadings(family, name, unitRaw);
  for (const other of candidates.slice(1)) {
    if (typeof readings !== "string" || other.include.source !== family.include.source) break;
    const next = measureReadings(other, name, unitRaw);
    if (typeof next !== "string") { family = other; readings = next; }
  }
  // Another product under the same word: a jar, a sachet; a pair of work gloves.
  const piece = pieceSize(family, name);
  if (family.minPiece != null && piece != null && !Number.isNaN(piece) && piece > 0 && piece < family.minPiece - 1e-9) return null;
  const unitCls = unitClass(unitRaw ?? "");
  if (unitCls?.kind === "piece" && unitCls.pair && family.pairOnlyIf && !family.pairOnlyIf.test(folded)) return null;
  const pack = packOf(family, name, unitRaw);
  if (pack && pricePackOf(family, pack)?.parked) return null;
  const miss = (status: PriceLineStatus): ClassifiedLine => ({ family: family.slug, status, measure: null, measureSource: null, pricePerUnit: null, pack: pack ?? "" });
  if (typeof readings === "string") return miss(readings);
  if (unitPrice == null || !(unitPrice > 0)) return miss("no_size");
  if (pack == null) return miss("no_pack");
  // A price pasted into the unit („2.29kilogram” at 2,29 lei) is no size.
  if (readings[0]!.source === "unit-text" && Math.abs(readings[0]!.measure - unitPrice) < 1e-9) return miss("unit_kind");
  const [lo, hi] = pricePackOf(family, pack)?.range ?? family.range;
  const price = (r: Measure) => unitPrice / r.measure;
  const inRange = (r: Measure) => price(r) >= lo && price(r) <= hi;
  const line = (r: Measure, status: PriceLineStatus): ClassifiedLine => ({ family: family.slug, status, measure: r.measure, measureSource: r.source, pricePerUnit: price(r), pack });
  const [first, second] = readings as [Measure, Measure | undefined];
  if (inRange(first)) {
    // The name's size gives a plausible price too, or a larger container's price just under the floor: undecidable.
    if (second && (inRange(second) || (second.measure > first.measure && price(second) >= lo / 2))) return line(first, "ambiguous");
    return line(first, "ok");
  }
  // A near miss of the unit's own reading is an odd price, not another unit.
  if (second && price(first) >= lo / 2 && price(first) <= hi * 2) return line(first, "out_of_range");
  if (second && inRange(second)) return line(second, "ok");
  return line(first, "out_of_range");
}
