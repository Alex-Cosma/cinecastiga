import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, openSync, closeSync, writeSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { streamBson } from "../import-old/bson-stream.js";
import { legacyAuthorityResolver, type LegacyAuthorityIdentity } from "../import-old/authority-identity.js";

// Standalone, NO database connection and NO source traffic. The output directory
// must not already exist; manifest.json is written only after full validation.
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: audit-legacy-authorities <db-old directory> <NEW output directory>");
const directory = resolve(input), destination = resolve(output);
mkdirSync(destination, { recursive: false });
const dimension = join(directory, "contractingAuthority.bson");
const acquisitions = join(directory, "directAcquisitionContract.bson");
async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest("hex");
}
const before = [dimension, acquisitions].map(p => statSync(p));
const dimensionRows = [...streamBson(dimension)];
const classify = legacyAuthorityResolver(dimensionRows);
writeFileSync(join(destination, "dimension.json"), JSON.stringify(dimensionRows.map(row => ({
  sicapId:Number(row._id),cui:typeof row.cui === "string" ? row.cui : null,name:String(row.name ?? ""),
})), null, 2));
type Group = { id: number; raw: string; identity: LegacyAuthorityIdentity; rows: number; samples: string[] };
const groups = new Map<string, Group>();
const ids = new Set<string>();
const counts: Record<string, number> = {};
let rows = 0, buffer = "";
const fd = openSync(join(destination, "rows.tsv"), "wx");
try {
  for (const doc of streamBson(acquisitions)) {
    const da = Number(doc.directAcquisitionId);
    if (!Number.isSafeInteger(da) || da <= 0) throw new Error("Invalid source acquisition ID");
    const id = String(da);
    if (ids.has(id)) throw new Error(`Repeated source acquisition ID ${id}`);
    ids.add(id);
    const raw = String(doc.contractingAuthority ?? "");
    let g = groups.get(raw);
    if (!g) { g = { id: groups.size + 1, raw, identity: classify(raw), rows: 0, samples: [] }; groups.set(raw, g); }
    g.rows++;
    if (g.samples.length < 3) g.samples.push(id);
    counts[g.identity.kind] = (counts[g.identity.kind] ?? 0) + 1;
    // Every row is represented, including unresolved ones, to detect mixed old profiles.
    buffer += `${id}\t${g.id}\n`;
    if (++rows % 10000 === 0) { writeSync(fd, buffer); buffer = ""; }
    if (rows % 1000000 === 0) console.log(JSON.stringify({ rows }));
  }
  if (buffer) writeSync(fd, buffer);
} finally { closeSync(fd); }
writeFileSync(join(destination, "groups.json"), JSON.stringify([...groups.values()], null, 2));
const sources = [];
for (const [i, path] of [dimension, acquisitions].entries()) {
  const hash = await sha256(path), after = statSync(path), initial = before[i]!;
  if (after.size !== initial.size || after.mtimeMs !== initial.mtimeMs || after.ino !== initial.ino)
    throw new Error("Source archive changed during audit");
  sources.push({ name: path.split("/").at(-1), bytes: after.size, sha256: hash });
}
const manifest = { version: 2, dimensionRows: dimensionRows.length, createdAt: new Date().toISOString(), rows, groups: groups.size, counts, sources,
  files: { "dimension.json": await sha256(join(destination, "dimension.json")), "rows.tsv": await sha256(join(destination, "rows.tsv")), "groups.json": await sha256(join(destination, "groups.json")) } };
writeFileSync(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
console.log(JSON.stringify(manifest, null, 2));
