/*
 * Short names of the CPV divisions (final breakdown, question 4, recommended:
 * short names in the legends, the catalogue's name in the (?)): the
 * catalogue's are up to ~150 characters and made the legend of a split
 * series, the strip's suggestion and the breakdown's thread run over several
 * lines. Plain TypeScript for the engine and the screen. A division the list
 * does not hold keeps "CPV {code}".
 */

const SHORT: Readonly<Record<string, string>> = {
  "03": "Agricultură, silvicultură",
  "09": "Energie, combustibili",
  "14": "Minerit, metale",
  "15": "Alimente, băuturi",
  "16": "Utilaje agricole",
  "18": "Îmbrăcăminte, încălțăminte",
  "19": "Piele, textile, plastic",
  "22": "Tipărituri",
  "24": "Produse chimice",
  "30": "Echipamente de birou și IT",
  "31": "Echipamente electrice",
  "32": "Radio, TV, telecomunicații",
  "33": "Medicale, farmaceutice",
  "34": "Echipamente de transport",
  "35": "Securitate, apărare",
  "37": "Sport, muzică, jocuri",
  "38": "Laborator, optică",
  "39": "Mobilier, uz casnic",
  "41": "Apă",
  "42": "Echipamente industriale",
  "43": "Utilaje de construcții",
  "44": "Materiale de construcții",
  "45": "Construcții",
  "48": "Software",
  "50": "Reparații, întreținere",
  "51": "Instalare",
  "55": "Hoteluri, restaurante",
  "60": "Transport",
  "63": "Logistică, turism",
  "64": "Poștă, telecomunicații",
  "65": "Utilități",
  "66": "Finanțe, asigurări",
  "70": "Imobiliare",
  "71": "Arhitectură, inginerie",
  "72": "Servicii IT",
  "73": "Cercetare",
  "75": "Administrație publică",
  "76": "Servicii petroliere",
  "77": "Spații verzi, agricultură",
  "79": "Servicii pentru organizații",
  "80": "Educație, formare",
  "85": "Sănătate, asistență socială",
  "90": "Salubritate, mediu",
  "92": "Cultură, sport",
  "98": "Alte servicii",
};

/** "Construcții" for 45; "CPV 46" for a division the list does not hold. */
export function divisionShortName(code: string): string {
  return SHORT[code.slice(0, 2)] ?? `CPV ${code}`;
}
/** Every division with a short name (the test checks the list against the catalogue's divisions). */
export const SHORT_DIVISIONS: readonly string[] = Object.keys(SHORT);
