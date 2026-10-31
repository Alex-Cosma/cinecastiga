/** The 41 counties + București, display spelling (diacritics with comma). */
export const COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov",
  "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța",
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara",
  "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt",
  "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea",
  "Vaslui", "Vâlcea", "Vrancea",
];

/*
 * The one display map of the 42 counties (S6, S3L/F4s-county-spelling): the data writes them without diacritics
 * ("Bucuresti", "Timis", "Dambovita", sometimes "Municipiul Bucuresti" or with cedillas), the pages with them. Only
 * what is shown goes through it, everywhere a county is shown: the answers, the drawer's rows, the answer's CSV.
 * Stored values, spec keys, links, the scopes a row opens and the records' own CSV keep the data's spelling.
 */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const BY_FOLD = new Map(COUNTIES.map((name) => [fold(name), name]));

/** A county as the pages spell it ("Buzau" → "Buzău", "Municipiul Bucuresti" → "București"), or null when it is none. */
export function countyKnown(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return BY_FOLD.get(fold(raw).replace(/^municipiul /, "")) ?? null;
}

/** A county to show: its display spelling, else the text as it came (a country, "Necunoscut"); empty stays empty. */
export function countyName<T extends string | null | undefined>(raw: T): string | T {
  return raw ? countyKnown(raw) ?? raw : raw;
}
