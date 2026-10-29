import { readableCpvName } from "./entity-summary";

/**
 * Short names of the CPV divisions (and of the construction groups), written
 * by hand for /domenii and shared with the Ask answers that name a domain
 * (final fact_check §3.2): "71" is "Arhitectură & inginerie". The official
 * CPV name stays beside it where it differs. "other" is /domenii's remainder.
 */
export const DOMAIN_ALIASES: Readonly<Record<string, string>> = {
  "45":"Construcții", "33":"Medical & farmaceutice", "34":"Echipamente de transport", "90":"Deșeuri, apă & mediu", "09":"Energie & combustibili", "71":"Arhitectură & inginerie", "79":"Servicii pentru organizații", "50":"Reparații & întreținere", "other":"Celelalte domenii",
  "03":"Agricultură & produse conexe", "14":"Materii prime & minerit", "15":"Alimente & băuturi", "16":"Utilaje agricole", "18":"Îmbrăcăminte & încălțăminte", "19":"Piele, textile & materiale", "22":"Cărți & imprimate", "24":"Produse chimice", "30":"Calculatoare & echipamente de birou", "31":"Echipamente electrice", "32":"Radio & telecomunicații", "35":"Securitate & apărare", "37":"Sport, jocuri & artă", "38":"Laboratoare & instrumente", "39":"Mobilier & produse pentru clădiri", "41":"Apă", "42":"Echipamente industriale", "43":"Utilaje de construcții", "44":"Materiale de construcții", "48":"Software", "51":"Servicii de instalare", "55":"Servicii hoteliere & restaurante", "60":"Servicii de transport", "63":"Servicii conexe transportului", "64":"Poștă & telecomunicații", "65":"Utilități publice", "66":"Finanțe & asigurări", "70":"Servicii imobiliare", "72":"Servicii IT", "73":"Cercetare & dezvoltare", "75":"Administrație & apărare", "76":"Servicii pentru petrol & gaze", "77":"Agricultură & spații verzi", "80":"Învățământ & formare", "85":"Sănătate & asistență socială", "92":"Cultură, recreere & sport", "98":"Servicii comunitare",
  "4523":"Drumuri, rețele & infrastructură", "4521":"Clădiri", "4531":"Instalații electrice", "4532":"Izolații", "4545":"Alte lucrări de finisare", "4500":"Construcții — cod general", "4525":"Construcții industriale", "4520":"Lucrări publice — cod general", "4511":"Demolări & terasamente", "4544":"Vopsitorie & geamuri", "4526":"Acoperișuri & lucrări speciale", "4522":"Inginerie & construcții", "4524":"Lucrări hidraulice", "4533":"Instalații de apă", "4550":"Utilaje cu operator — cod general", "4542":"Tâmplărie & dulgherie", "4534":"Garduri & dispozitive de siguranță", "4543":"Pardoseli & pereți", "4530":"Instalații — cod general", "4541":"Tencuieli", "4540":"Finisaje — cod general", "4552":"Închiriere utilaje de terasament", "4535":"Instalații mecanice", "4551":"Închiriere macarale", "4510":"Pregătire șantier — cod general", "4512":"Sondaje & foraje",
};

/** A CPV stem by its short name, else by its official one with ș and ț (readableCpvName); the code as a last resort. */
export function domainName(code: string, official: string | null | undefined): string {
  const alias = DOMAIN_ALIASES[code];
  if (alias) return alias;
  return official ? readableCpvName(official) : `CPV ${code}`;
}
