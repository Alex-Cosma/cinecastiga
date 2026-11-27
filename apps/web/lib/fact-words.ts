import { askHref } from "./discovery-links";
import { AUTHORITY_CLOUD_SPEC, CONTRACT_WINNERS_SPEC, FIRM_DEPENDENCE_CLOUD_SPEC, NATIONAL_DA_COUNT_SPEC } from "./ask/site-links";
import type { AskSpec } from "./ask/spec";
import { countyName } from "./counties";
import { cleanName, formatCalendarDate } from "./format";
import { roCount, takesDe } from "./ro-count";
import { parseSignalState, signalUrl } from "./signals-shared";
import { countryName } from "./ted-labels";
import { titleName } from "./tidy-name";

/*
 * „Știați că” (owner, 26 November 2026): the words of a fact, composed from the numbers a processing run found
 * (app.facts `data`, apps/ingestion/src/facts/build.ts). The card reads: the large figure, what follows it in small,
 * one sentence that continues it, one line of context, and a link to the records behind it.
 *
 * Wording rules of the site hold here too: an institution „a contractat”, never „a plătit”; values are recorded
 * values; a fact names what the data shows and draws no conclusion. An administrator can correct the words before
 * publishing; these are the defaults.
 *
 * A fact's link opens what the fact says (owner, 27 November 2026: a year's total against the year before opens the
 * two years as bars, not the country's all-time total). A country-wide fact opens a question of „Întreabă” narrowed to
 * its year: the site's shared questions (lib/ask/site-links.ts) or a shape the legacy corpus already runs (the years
 * as bars, a year month by month, the single-bidder contracts). A fact about one institution or one contract links to
 * its page.
 */
export interface FactWords {
  figure: string;
  unit: string | null;
  statement: string;
  context: string | null;
  linkHref: string | null;
  linkLabel: string | null;
}

const n = (v: unknown): number => Number(v ?? 0);
const int = (v: unknown): string => Math.round(n(v)).toLocaleString("ro-RO");
const dec = (v: number, digits: number): string => v.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: digits });
/** „17,6%”: one decimal under 20, none from 20 up. */
export function factPercent(share: number): string {
  const pct = share * 100;
  // Almost all is not all: 99,8%, never a rounded „100%”.
  if (pct >= 99.5 && share < 1) return `${dec(Math.floor(pct * 10) / 10, 1)}%`;
  return `${dec(pct, pct >= 20 ? 0 : 1)}%`;
}
/** A sum as the card shows it: the figure and its unit apart („6,63” · „mld. lei”). */
export function factMoney(value: number): { figure: string; unit: string } {
  if (value >= 1e9) return { figure: dec(value / 1e9, 2), unit: "mld. lei" };
  if (value >= 1e6) return { figure: dec(value / 1e6, 1), unit: "mil. lei" };
  return { figure: int(value), unit: "lei" };
}
const money = (value: number): string => { const m = factMoney(value); return `${m.figure} ${m.unit}`; };
/** „de instituții” after 354, „instituții” after 14: the unit beside a count shown as the figure. */
const unitOf = (count: number, many: string): string => `${takesDe(count) ? "de " : ""}${many}`;
const name = (raw: unknown): string => titleName(cleanName(typeof raw === "string" ? raw : null));
/** A name that closes its sentence: „Farmexim S.A.” brings its own full stop. */
const lastName = (raw: unknown): string => { const text = name(raw); return text.endsWith(".") ? text : `${text}.`; };
const year = (data: Record<string, unknown>): number => n(data.year);
/** A question of „Întreabă” narrowed to the years of the fact. */
const inYears = (spec: AskSpec, from: number, to = from): string => askHref({ ...spec, filters: { ...spec.filters, yearFrom: from, yearTo: to } });
/** The years as bars: what the owner's own link for „2025 against 2024” opens. */
const YEARS_AS_BARS: AskSpec = { block: "timeseries", measure: "value", filters: {} };
/** A long official title cut at a word, without its quotes. */
function shortTitle(raw: unknown, max = 110): string {
  const t = String(raw ?? "").replace(/["„”“]/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t.replace(/[.\s]+$/, "");
  const cut = t.slice(0, max), space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/** „din județul Cluj”, „din București”. */
const fromCounty = (raw: unknown): string => { const c = countyName(String(raw ?? "")); return /^bucure/i.test(c) ? `din ${c}` : `din județul ${c}`; };
const inCounty = (raw: unknown): string => fromCounty(raw).replace(/^din/, "în");
const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
/** „14 februarie 2025” from 2025-02-14. */
function longDay(raw: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? ""));
  if (!m || !MONTHS[Number(m[2]) - 1]) throw new Error("no day");
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
/** „în 2021”, „în 2023 și 2024”, „în 2019, 2022 și 2023”, „în 2018–2026” for more. */
function inTheYears(raw: unknown): string | null {
  const years = (Array.isArray(raw) ? raw.map(Number) : []).filter((y) => y > 1900).sort((a, b) => a - b);
  if (years.length === 0) return null;
  if (years.length > 3) return `în ${years[0]}–${years[years.length - 1]}`;
  return `în ${years.length === 1 ? years[0] : `${years.slice(0, -1).join(", ")} și ${years[years.length - 1]}`}`;
}
/** A share of the country's year, said whole (owner, 27 November 2026: „din valoarea anului” did not say whose). */
const ofCountryYear = (d: Record<string, unknown>): string => `din tot ce s-a contractat în țară în ${year(d)}`;
const ALL_YEARS = "în toți anii din arhivă";
/**
 * One firm's part of an institution's value, with the years the firm's value was contracted in (owner, 27 November
 * 2026: the tile says when it happened); an institution with a single year has said it in the sentence already.
 */
function majoritySums(d: Record<string, unknown>): string {
  const years = (Array.isArray(d.years) ? d.years.map(Number) : []).filter((y) => y > 1900);
  // Years that only repeat the institution's own span say nothing new.
  const whole = years.length > 1 && Math.min(...years) === n(d.from) && Math.max(...years) === n(d.to);
  const when = n(d.from) !== n(d.to) && !whole ? inTheYears(years) : null;
  if (when) return `${money(n(d.top))}, contractate ${when}, din ${money(n(d.total))}`;
  return `${money(n(d.top))} din ${money(n(d.total))}${n(d.from) ? "" : `, ${ALL_YEARS}`}`;
}
const records = (count: unknown): string => roCount(n(count), "o înregistrare", "înregistrări");
const signalHref = (code: string): string => signalUrl(parseSignalState({ tip: code }));
const LEAD_NOT_PROOF = "În toți anii din arhivă. Un semnal e o pistă de verificat, nu o dovadă.";

/** A domain in a few plain words, as it reads after „pentru” (the CPV division's official name is long). */
const DOMAIN_WORDS: Record<string, string> = {
  "45": "lucrări de construcții", "33": "echipamente medicale și medicamente", "30": "calculatoare și echipamente de birou",
  "90": "salubritate, deșeuri și mediu", "09": "combustibili și energie", "79": "pază, consultanță, tipărire și alte servicii pentru instituții",
  "34": "vehicule și echipamente de transport", "50": "reparații și întreținere", "71": "proiectare, inginerie și arhitectură",
  "60": "servicii de transport", "38": "aparatură de laborator și de precizie", "72": "servicii IT și software la comandă",
  "48": "pachete software", "77": "servicii pentru agricultură, păduri și spații verzi", "42": "echipamente industriale",
  "15": "alimente și băuturi", "32": "echipamente de comunicații", "44": "materiale de construcții",
  "31": "echipamente electrice și iluminat", "39": "mobilier și produse de curățat", "35": "echipamente de securitate și apărare",
  "85": "servicii de sănătate și asistență socială", "66": "servicii financiare și asigurări", "55": "servicii hoteliere și de restaurant",
  "80": "învățământ și formare profesională", "92": "servicii de recreere, cultură și sport", "98": "alte servicii comunitare și personale",
  "65": "utilități publice", "64": "servicii poștale și de telecomunicații", "63": "servicii conexe transportului", "18": "îmbrăcăminte și încălțăminte",
  "22": "tipărituri", "24": "produse chimice", "43": "utilaje de construcții", "03": "produse agricole", "16": "utilaje agricole", "37": "instrumente muzicale, articole sportive și jocuri",
  "51": "servicii de instalare", "70": "servicii imobiliare", "73": "cercetare și dezvoltare", "75": "servicii de administrație publică și apărare", "76": "servicii pentru industria petrolului și a gazelor",
};
function domainWords(d: Record<string, unknown>): string {
  const plain = DOMAIN_WORDS[String(d.cpv2)];
  if (plain) return plain;
  const official = String(d.name ?? "").trim();
  if (!official) throw new Error("no domain name");
  return official.charAt(0).toLocaleLowerCase("ro-RO") + official.slice(1).replace(/ş/g, "ș").replace(/ţ/g, "ț");
}

/** What a signal's count says: the unit after the figure and the sentence that continues it. */
const SIGNAL_WORDS: Record<string, { many: string; statement: string; context?: (d: Record<string, unknown>) => string }> = {
  net_shared_admin: { many: "firme", statement: "au un reprezentant legal comun cu o altă firmă care a câștigat de la aceeași instituție." },
  fin_public_reliance: { many: "firme", statement: "au câștigat din achiziții publice, într-un an, cel puțin 75% din cât e toată cifra lor de afaceri." },
  fin_tiny_staff: { many: "firme", statement: "cu cel mult 5 salariați au câștigat, într-un an, cel puțin 2 milioane de lei din achiziții publice." },
  da_capacity: { many: "firme", statement: "au câștigat prin achiziții directe, într-un an, de cel puțin 1,5 ori cifra lor de afaceri, sau 500.000 de lei fără niciun angajat." },
  da_dependence: { many: "firme", statement: "au un singur client public mare: cel puțin 70% din achizițiile directe câștigate vin de la o singură instituție." },
  da_year_end: { many: "instituții", statement: "au contractat în decembrie cel puțin 35% din achizițiile directe ale unui an." },
  da_first_month_buyer: { many: "instituții", statement: "au făcut achiziții directe de cel puțin 100.000 de lei cu o firmă înființată de cel mult 30 de zile." },
  da_split: { many: "instituții", statement: "au cumpărat de la aceeași firmă, în același an, de cel puțin 3 ori același fel de lucru: fiecare achiziție sub plafon, toate la un loc peste el.",
    context: (d) => `${roCount(n(d.instances), "un astfel de grup", "astfel de grupuri")} în toți anii din arhivă. Un semnal e o pistă de verificat, nu o dovadă.` },
  da_concentration: { many: "instituții", statement: "au, în cel puțin 2 ani, o singură firmă cu cel puțin 60% din valoarea achizițiilor lor directe." },
  da_round: { many: "achiziții directe", statement: "au valoarea la 96–100% din plafon, imediat sub suma de la care e nevoie de licitație." },
  da_above_ceiling: { many: "achiziții", statement: "publicate ca directe au valoarea peste plafonul legal din anul lor." },
  award_calloffs_over_ceiling: { many: "acorduri-cadru", statement: "au comenzi declarate în SEAP peste valoarea acordului din care sunt comandate." },
};

type Recipe = (data: Record<string, unknown>) => FactWords;
const RECIPES: Record<string, Recipe> = {
  firms_one_client: (d) => ({
    figure: factPercent(n(d.share)), unit: null,
    statement: "din firmele cu peste 1 milion de lei din contracte publice au un singur client public.",
    context: `${int(d.one)} din ${roCount(n(d.firms), "o firmă", "firme")}: peste 90% din valoarea lor vine de la o singură instituție. În toți anii din arhivă.`,
    linkHref: askHref(FIRM_DEPENDENCE_CLOUD_SPEC), linkLabel: "Vezi firmele",
  }),
  institutions_one_firm: (d) => ({
    figure: int(d.majority), unit: unitOf(n(d.majority), "instituții"),
    statement: "au contractat peste jumătate din valoare cu o singură firmă.",
    context: `Din ${roCount(n(d.institutions), "o instituție", "instituții")} cu peste 10 milioane de lei contractați, ${ALL_YEARS}.`,
    linkHref: askHref(AUTHORITY_CLOUD_SPEC), linkLabel: "Vezi instituțiile",
  }),
  top_firms_share: (d) => ({
    figure: factPercent(n(d.top10)), unit: null,
    statement: `din valoarea contractelor din proceduri din ${year(d)} a revenit la 10 firme.`,
    context: `${roCount(n(d.firms), "o firmă a", "firme au")} câștigat contracte; primele 100 au ${factPercent(n(d.top100))} din valoare.`,
    linkHref: inYears(CONTRACT_WINNERS_SPEC, year(d)), linkLabel: "Vezi clasamentul",
  }),
  largest_contract: (d) => {
    const suppliers = ((d.suppliers as { name: string | null }[] | undefined) ?? []).map((s) => name(s.name));
    const where = d.county ? ` al unei instituții ${fromCounty(d.county)}` : "";
    return {
      ...factMoney(n(d.value)),
      statement: `e cel mai mare contract din ${year(d)}${where}: ${shortTitle(d.title).replace(/([^…])$/, "$1.")}`,
      context: `${name(d.authority)} cu ${suppliers.length > 3 ? `${suppliers.slice(0, 3).join(", ")} și alții` : suppliers.join(", ")}${d.signed ? `, semnat pe ${formatCalendarDate(String(d.signed).slice(0, 10))}` : ""}.`,
      linkHref: `/contracte/${String(d.natId)}`, linkLabel: "Vezi contractul",
    };
  },
  da_per_day: (d) => ({
    figure: int(d.perDay), unit: "pe zi",
    statement: `achiziții directe s-au făcut, în medie, în fiecare zi din ${year(d)}.`,
    context: `${int(d.n)} într-un an, în medie ${int(d.average)} lei fiecare; împreună, ${money(n(d.total))}.`,
    linkHref: inYears(NATIONAL_DA_COUNT_SPEC, year(d)), linkLabel: "Vezi achizițiile directe",
  }),
  most_da: (d) => ({
    figure: int(d.n), unit: unitOf(n(d.n), "achiziții directe"),
    statement: `a făcut ${name(d.authority)} în ${year(d)}.`,
    context: `În medie ${int(d.perDay)} pe zi; împreună, ${money(n(d.total))}.`,
    linkHref: `/entitati/${String(d.authorityId)}`, linkLabel: "Vezi instituția",
  }),
  first_month: (d) => ({
    figure: int(d.firms), unit: unitOf(n(d.firms), "firme"),
    statement: "au câștigat o achiziție directă de peste 100.000 de lei în prima lună de la înființare.",
    context: "În toți anii din arhivă.",
    linkHref: signalUrl(parseSignalState({ tip: "da_first_month" })), linkLabel: "Vezi firmele",
  }),
  december: (d) => ({
    ...factMoney(n(d.december)),
    statement: `s-au contractat în decembrie ${year(d)}: ${factPercent(n(d.share))} din tot anul, într-o singură lună.`,
    context: `În tot anul ${year(d)}: ${money(n(d.total))}.`,
    linkHref: inYears({ ...YEARS_AS_BARS, timeseries: { grain: "month" } }, year(d)), linkLabel: "Vezi anul, lună de lună",
  }),
  year_total: (d) => {
    const change = n(d.change);
    return {
      ...factMoney(n(d.total)),
      statement: `s-au contractat în ${year(d)}, cu ${factPercent(Math.abs(change))} mai ${change >= 0 ? "mult" : "puțin"} decât în ${year(d) - 1}.`,
      context: `În ${year(d) - 1}: ${money(n(d.previous))}. Valori înregistrate, nu plăți.`,
      linkHref: inYears(YEARS_AS_BARS, year(d) - 1, year(d)), linkLabel: "Vezi cei doi ani",
    };
  },
  one_firm_majority: (d) => {
    const from = n(d.from), to = n(d.to);
    const span = from && to ? (from === to ? ` în ${from}` : ` între ${from} și ${to}`) : "";
    return {
      figure: factPercent(n(d.share)), unit: null,
      statement: `din valoarea contractată de ${name(d.authority)}${span} a revenit unei singure firme: ${lastName(d.supplier)}`,
      context: `${majoritySums(d)}.`,
      linkHref: `/entitati/${String(d.authorityId)}`, linkLabel: "Vezi instituția",
    };
  },
  single_bidder: (d) => ({
    figure: factPercent(n(d.share)), unit: null,
    statement: `din contractele din ${year(d)} la care se cunoaște numărul de oferte au avut un singur ofertant.`,
    context: `${int(d.single)} din ${int(d.known)}. Numărul de oferte se cunoaște doar la o parte din contracte.`,
    linkHref: inYears({ block: "table", dataset: "contracts", dim: "supplier", measure: "value", topN: 10, filters: { singleBidder: true } }, year(d)), linkLabel: "Vezi contractele",
  }),
  // The second set (owner, 27 November 2026).
  domain_year: (d) => ({
    ...factMoney(n(d.value)),
    statement: `s-au contractat în ${year(d)} pentru ${domainWords(d)}.`,
    context: `${factPercent(n(d.share))} ${ofCountryYear(d)}, în ${records(d.n)}: contracte și achiziții directe.`,
    linkHref: `/domenii?year=${year(d)}&code=${String(d.cpv2)}`, linkLabel: "Vezi domeniul",
  }),
  biggest_buyer: (d) => ({
    ...factMoney(n(d.value)),
    statement: `a contractat ${name(d.authority)} în ${year(d)}.`,
    context: `${factPercent(n(d.share))} ${ofCountryYear(d)}, în ${records(d.n)}.`,
    linkHref: `/entitati/${String(d.authorityId)}`, linkLabel: "Vezi instituția",
  }),
  top_buyers_share: (d) => ({
    figure: factPercent(n(d.share)), unit: null,
    statement: `din valoarea contractată în ${year(d)} aparține primelor 10 instituții.`,
    context: `${roCount(n(d.institutions), "o instituție a", "instituții au")} contractat ceva în ${year(d)}.`,
    linkHref: null, linkLabel: null,
  }),
  firms_active: (d) => ({
    figure: int(d.firms), unit: unitOf(n(d.firms), "firme"),
    statement: `au câștigat cel puțin un contract sau o achiziție directă în ${year(d)}.`,
    context: `${int(d.once)} dintre ele, o singură dată.`,
    linkHref: inYears(CONTRACT_WINNERS_SPEC, year(d)), linkLabel: "Vezi cine a câștigat cel mai mult",
  }),
  foreign_share: (d) => ({
    figure: factPercent(n(d.share)), unit: null,
    statement: `din valoarea contractată în ${year(d)} a revenit firmelor cu sediul în afara României.`,
    context: `${money(n(d.value))}, la ${roCount(n(d.firms), "o firmă", "firme")}. În consorții, valoarea se împarte egal între membri.`,
    linkHref: null, linkLabel: null,
  }),
  foreign_country: (d) => {
    const country = countryName(String(d.country));
    if (country === String(d.country)) throw new Error("no country name");
    return {
      ...factMoney(n(d.value)),
      statement: `au câștigat în ${year(d)} firme din ${country}.`,
      context: `${roCount(n(d.firms), "O firmă", "firme")}; ${factPercent(n(d.share))} ${ofCountryYear(d)}. În consorții, valoarea se împarte egal între membri.`,
      linkHref: null, linkLabel: null,
    };
  },
  no_notice: (d) => ({
    ...factMoney(n(d.value)),
    statement: `s-au atribuit în ${year(d)} prin negociere fără publicarea unui anunț.`,
    context: `${roCount(n(d.n), "un contract", "contracte")}; ${factPercent(n(d.share))} din valoarea contractelor din proceduri din ${year(d)}.`,
    linkHref: signalHref("award_no_competition"), linkLabel: "Vezi procedurile",
  }),
  zero_staff: (d) => ({
    figure: int(d.firms), unit: unitOf(n(d.firms), "firme"),
    statement: `fără niciun angajat în ultimul bilanț au câștigat contracte sau achiziții directe în ${year(d)}.`,
    context: `Împreună, ${money(n(d.value))}; ${int(d.large)} dintre ele, peste 1 milion de lei fiecare.`,
    linkHref: signalHref("fin_tiny_staff"), linkLabel: "Vezi firmele cu puțini salariați",
  }),
  new_firms: (d) => ({
    figure: int(d.firms), unit: unitOf(n(d.firms), "firme"),
    statement: `înființate în ${year(d)} au câștigat contracte sau achiziții directe chiar în același an.`,
    context: `Împreună, ${money(n(d.value))}.`,
    linkHref: signalHref("da_first_month"), linkLabel: "Vezi firmele din prima lună",
  }),
  signal: (d) => {
    const words = SIGNAL_WORDS[String(d.code)];
    if (!words) throw new Error("no words for this signal");
    return {
      figure: int(d.n), unit: unitOf(n(d.n), words.many), statement: words.statement,
      context: words.context?.(d) ?? LEAD_NOT_PROOF,
      linkHref: signalHref(String(d.code)), linkLabel: "Vezi lista",
    };
  },
  per_capita_town: (d) => ({
    figure: int(d.perCapita), unit: "lei pe locuitor",
    statement: `a contractat ${name(d.authority)} în ${year(d)}.`,
    context: `${money(n(d.value))} la ${roCount(n(d.population), "un locuitor", "locuitori")}, ${inCounty(d.county)}. Media primăriilor: ${int(d.average)} lei pe locuitor.`,
    linkHref: `/entitati/${String(d.authorityId)}`, linkLabel: "Vezi primăria",
  }),
  local_firms: (d) => {
    const span = `În toți anii din arhivă, ${n(d.from)}–${n(d.to)}.`;
    if (!d.county) return {
      figure: factPercent(n(d.share)), unit: null,
      statement: "din valoarea contractată de instituții a revenit firmelor din același județ cu ele.",
      context: span, linkHref: "/harta", linkLabel: "Vezi harta",
    };
    const capital = /^bucure/i.test(String(d.county));
    return {
      figure: factPercent(n(d.share)), unit: null,
      statement: `din valoarea contractată de instituțiile ${fromCounty(d.county)} a revenit firmelor ${capital ? "din București" : "din același județ"}: ${n(d.rank) === 1 ? `cea mai ${d.end === "top" ? "mare" : "mică"} proporție` : `printre cele mai ${d.end === "top" ? "mari" : "mici"} proporții`} din țară.`,
      context: `${d.end === "bottom" && !capital ? `${factPercent(n(d.bucharest))} a revenit firmelor din București. ` : ""}Media țării: ${factPercent(n(d.national))}. ${span}`,
      linkHref: "/harta", linkLabel: "Vezi harta",
    };
  },
  many_buyers: (d) => ({
    figure: int(d.buyers), unit: unitOf(n(d.buyers), "instituții"),
    statement: `au cumpărat de la ${name(d.supplier)} în ${year(d)}.`,
    context: `${records(d.n).replace(/^o /, "O ")}, împreună ${money(n(d.value))}.`,
    linkHref: `/entitati/${String(d.supplierId)}`, linkLabel: "Vezi firma",
  }),
  pair_contracts: (d) => ({
    figure: int(d.n), unit: unitOf(n(d.n), "contracte"),
    statement: `a semnat ${name(d.authority)} cu aceeași firmă în ${year(d)}: ${lastName(d.supplier)}`,
    context: `Împreună, ${money(n(d.value))}. Numărul include loturi și contracte subsecvente.`,
    linkHref: `/entitati/${String(d.authorityId)}`, linkLabel: "Vezi instituția",
  }),
  busiest_day_da: (d) => ({
    figure: int(d.n), unit: unitOf(n(d.n), "achiziții directe"),
    statement: `s-au încheiat într-o singură zi: ${longDay(d.day)}.`,
    context: `Media anului: ${int(d.perDay)} pe zi.`,
    linkHref: inYears(NATIONAL_DA_COUNT_SPEC, year(d)), linkLabel: "Vezi achizițiile directe",
  }),
  busiest_day_contracts: (d) => ({
    ...factMoney(n(d.value)),
    statement: `s-au contractat într-o singură zi: ${longDay(d.day)}.`,
    context: `${roCount(n(d.contracts), "Un contract", "contracte")}; ${factPercent(n(d.share))} din tot ce s-a contractat în ${year(d)}.`,
    linkHref: inYears({ ...YEARS_AS_BARS, timeseries: { grain: "month" } }, year(d)), linkLabel: "Vezi anul, lună de lună",
  }),
  archive_value: (d) => ({
    ...(n(d.value) >= 1e12 ? { figure: dec(n(d.value) / 1e9, 0), unit: "mld. lei" } : factMoney(n(d.value))),
    statement: `e valoarea tuturor contractelor și achizițiilor directe din arhivă, ${n(d.from)}–${n(d.to)}.`,
    context: "Valori înregistrate în SEAP, nu plăți.",
    linkHref: inYears(YEARS_AS_BARS, n(d.from), n(d.to)), linkLabel: "Vezi anii",
  }),
  archive_records: (d) => ({
    figure: dec(n(d.n) / 1e6, 1), unit: "milioane de înregistrări",
    statement: `sunt în arhivă: fiecare contract și fiecare achiziție directă publicată în SEAP din ${n(d.from)} până azi.`,
    context: null, linkHref: "/intreaba", linkLabel: "Întreabă arhiva",
  }),
  da_share_count: (d) => ({
    figure: factPercent(n(d.share)), unit: null,
    statement: `din achizițiile publice din ${year(d)}, ca număr, sunt achiziții directe.`,
    context: `Ca valoare, doar ${factPercent(n(d.valueShare))}: ${money(n(d.daValue))} din ${money(n(d.total))}.`,
    linkHref: inYears(NATIONAL_DA_COUNT_SPEC, year(d)), linkLabel: "Vezi achizițiile directe",
  }),
  year_vs_past: (d) => ({
    figure: `de ${dec(n(d.ratio), 1)} ori`, unit: null,
    statement: `mai mult s-a contractat în ${year(d)} decât în ${n(d.pastYear)}.`,
    context: `${money(n(d.total))} față de ${money(n(d.past))}. Valori înregistrate, nu plăți.`,
    linkHref: inYears(YEARS_AS_BARS, n(d.pastYear), year(d)), linkLabel: "Vezi anii",
  }),
};

/** The default words of a fact; null for a recipe this version of the site does not know. */
export function composeFact(recipe: string, data: Record<string, unknown>): FactWords | null {
  const compose = RECIPES[recipe];
  if (!compose) return null;
  try { return compose(data); } catch { return null; }
}

/** What each kind is called in the console. */
export const FACT_KIND_LABEL: Record<string, string> = { share: "proporție", count: "număr mare", sum: "sumă mare", record: "record", pattern: "tipar" };

/*
 * The small chart of a tile (owner, 27 November 2026: the page as a mosaic, „desene” = charts made of the fact's own
 * figure): two bars for a year against the year before, one bar of proportion for a share. Drawn to scale from the
 * run's numbers, whatever the words say; a fact with nothing to compare (a record, a count) has none.
 */
export type FactChart =
  | { kind: "two"; bars: [{ label: string; value: number }, { label: string; value: number }]; says: string }
  | { kind: "share"; share: number; label: string };

const CHARTS: Record<string, (d: Record<string, unknown>) => FactChart | null> = {
  year_total: (d) => n(d.previous) > 0 && n(d.total) > 0 ? {
    kind: "two",
    bars: [{ label: `${year(d) - 1} · ${factMoney(n(d.previous)).figure}`, value: n(d.previous) }, { label: `${year(d)} · ${factMoney(n(d.total)).figure}`, value: n(d.total) }],
    says: `${money(n(d.previous))} în ${year(d) - 1} și ${money(n(d.total))} în ${year(d)}`,
  } : null,
  firms_one_client: (d) => ({ kind: "share", share: n(d.share), label: `${int(d.one)} din ${roCount(n(d.firms), "o firmă", "firme")}, ${ALL_YEARS}` }),
  institutions_one_firm: (d) => ({ kind: "share", share: n(d.share), label: `${int(d.majority)} din ${roCount(n(d.institutions), "o instituție", "instituții")} cu peste 10 mil. lei, ${ALL_YEARS}` }),
  top_firms_share: (d) => ({ kind: "share", share: n(d.top10), label: `10 din ${roCount(n(d.firms), "o firmă", "firme")}` }),
  december: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} din tot ce s-a contractat în ${year(d)}` }),
  one_firm_majority: (d) => ({ kind: "share", share: n(d.share), label: majoritySums(d) }),
  single_bidder: (d) => ({ kind: "share", share: n(d.share), label: `${int(d.single)} din ${int(d.known)} contracte cu număr de oferte cunoscut` }),
  domain_year: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} ${ofCountryYear(d)}` }),
  biggest_buyer: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} ${ofCountryYear(d)}` }),
  top_buyers_share: (d) => ({ kind: "share", share: n(d.share), label: `10 din ${roCount(n(d.institutions), "o instituție", "instituții")}` }),
  foreign_share: (d) => ({ kind: "share", share: n(d.share), label: `${money(n(d.value))} ${ofCountryYear(d)}` }),
  foreign_country: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} ${ofCountryYear(d)}` }),
  no_notice: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} din valoarea contractelor din proceduri din ${year(d)}` }),
  local_firms: (d) => ({ kind: "share", share: n(d.share), label: d.county ? `Media țării: ${factPercent(n(d.national))}, în ${n(d.from)}–${n(d.to)}` : `În toți anii din arhivă, ${n(d.from)}–${n(d.to)}` }),
  da_share_count: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} ca număr; ${factPercent(n(d.valueShare))} ca valoare` }),
  busiest_day_contracts: (d) => ({ kind: "share", share: n(d.share), label: `${factPercent(n(d.share))} din tot ce s-a contractat în ${year(d)}` }),
  per_capita_town: (d) => n(d.average) > 0 && n(d.perCapita) > 0 ? {
    kind: "two",
    bars: [{ label: `media · ${int(d.average)}`, value: n(d.average) }, { label: `aici · ${int(d.perCapita)}`, value: n(d.perCapita) }],
    says: `${int(d.perCapita)} lei pe locuitor, față de o medie a primăriilor de ${int(d.average)}`,
  } : null,
  year_vs_past: (d) => n(d.past) > 0 && n(d.total) > 0 ? {
    kind: "two",
    bars: [{ label: `${n(d.pastYear)} · ${factMoney(n(d.past)).figure}`, value: n(d.past) }, { label: `${year(d)} · ${factMoney(n(d.total)).figure}`, value: n(d.total) }],
    says: `${money(n(d.past))} în ${n(d.pastYear)} și ${money(n(d.total))} în ${year(d)}`,
  } : null,
};

/** The chart of a fact, or null when its recipe has none or its numbers do not hold one. */
export function factChart(recipe: string, data: Record<string, unknown>): FactChart | null {
  try {
    const chart = CHARTS[recipe]?.(data) ?? null;
    if (chart?.kind === "share" && !(chart.share > 0 && chart.share <= 1)) return null;
    return chart;
  } catch { return null; }
}
