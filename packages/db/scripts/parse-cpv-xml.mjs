// One-off provenance tool (NOT run at build/seed time). Parses the official
// EU CPV 2008 XML into the vendored seed asset packages/db/seed/cpv_2008.json.
//
// Source (open EU data, Decision 2011/833/EU):
//   https://ted.europa.eu/documents/d/ted/cpv_2008_xml  (zip -> cpv_2008.xml)
//
// Usage:  node scripts/parse-cpv-xml.mjs /path/to/cpv_2008.xml
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) { console.error("usage: parse-cpv-xml.mjs <cpv_2008.xml>"); process.exit(2); }

const xml = readFileSync(src, "utf8");
const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

const rows = [];
const blockRe = /<CPV CODE="([^"]+)">([\s\S]*?)<\/CPV>/g;
let m;
while ((m = blockRe.exec(xml))) {
  const code = m[1].trim();
  const body = m[2];
  const pick = (lang) => {
    const r = new RegExp(`<TEXT LANG="${lang}">([\\s\\S]*?)</TEXT>`);
    const hit = r.exec(body);
    return hit ? decode(hit[1]) : null;
  };
  const nameRo = pick("RO");
  const nameEn = pick("EN");
  if (!/^\d{8}-\d$/.test(code)) { console.error("skip odd code:", code); continue; }
  rows.push({
    code,
    name_ro: nameRo ?? nameEn ?? code,
    name_en: nameEn,
    revision: "Rev.2",
    division: code.slice(0, 2),
  });
}

rows.sort((a, b) => (a.code < b.code ? -1 : 1));
writeFileSync(
  new URL("../seed/cpv_2008.json", import.meta.url),
  JSON.stringify(rows, null, 0) + "\n",
);
console.log(`wrote ${rows.length} CPV codes`);
