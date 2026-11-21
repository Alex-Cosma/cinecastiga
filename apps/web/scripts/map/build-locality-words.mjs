// The localities' and counties' words with diacritics, for tidying names in titles and lists (lib/tidy-name.ts).
// From lib/reference/uat-geo.json (INS SIRUTA) and the 42 counties: a word of at least four letters, kept only when
// every locality and county that writes it agrees on its diacritics („Botesti” is Botești or Boțești: left out).
// Run from apps/web: node scripts/map/build-locality-words.mjs. lib/tidy-name.test.ts checks the file is current.
import { readFileSync, writeFileSync } from "node:fs";

const geo = JSON.parse(readFileSync(new URL("../../lib/reference/uat-geo.json", import.meta.url), "utf8"));
const counties = readFileSync(new URL("../../lib/counties.ts", import.meta.url), "utf8")
  .match(/export const COUNTIES = \[([^\]]+)\]/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));

export function localityWords(uatNames, countyNames) {
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase("ro-RO");
  const seen = new Map();
  const add = (word) => {
    if (word.length < 4) return;
    const key = fold(word);
    const proper = word.charAt(0).toLocaleUpperCase("ro-RO") + word.slice(1).toLocaleLowerCase("ro-RO");
    const was = seen.get(key);
    if (was === undefined) seen.set(key, proper);
    else if (was !== proper) seen.set(key, null);
  };
  for (const name of uatNames) for (const word of name.split(/[\s\-–]+/)) add(word);
  for (const name of countyNames) for (const word of name.split(/[\s-]+/)) add(word);
  return [...seen.values()].filter((w) => w && fold(w) !== w.toLocaleUpperCase("ro-RO")).sort();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const words = localityWords(geo.uats.map((u) => u[1]), counties);
  writeFileSync(new URL("../../lib/reference/locality-words.json", import.meta.url), `${JSON.stringify({ source: "lib/reference/uat-geo.json + lib/counties.ts (scripts/map/build-locality-words.mjs)", words })}\n`);
  console.log(`${words.length} words`);
}
