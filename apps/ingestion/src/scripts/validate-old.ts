import { openSync, readSync, closeSync, statSync } from "node:fs";
import { deserialize } from "bson";
import { canonicalCui } from "../normalize/cui.js";

/** Stream the first ~cap bytes of a mongodump .bson and yield documents. */
function* docs(file: string, capBytes: number): Generator<Record<string, unknown>> {
  const size = Math.min(statSync(file).size, capBytes);
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(size);
  readSync(fd, buf, 0, size, 0);
  closeSync(fd);
  let off = 0;
  while (off + 4 <= buf.length) {
    const len = buf.readInt32LE(off);
    if (len <= 0 || off + len > buf.length) break;
    yield deserialize(buf.subarray(off, off + len)) as Record<string, unknown>;
    off += len;
  }
}

const file = process.argv[2]!;
const cap = Number(process.argv[3] ?? 50) * 1024 * 1024;

let total = 0, valid = 0, invalid = 0, noCui = 0;
const invalidSamples: string[] = [];
for (const d of docs(file, cap)) {
  const cui = d["cui"] as string | undefined;
  total += 1;
  if (!cui) { noCui += 1; continue; }
  const r = canonicalCui(cui);
  if (r.valid) valid += 1;
  else {
    invalid += 1;
    if (invalidSamples.length < 15) invalidSamples.push(`${cui} → ${r.cui}`);
  }
}
console.log(JSON.stringify({
  file, docsRead: total, withCui: total - noCui, noCui,
  valid, invalid,
  validPct: total ? ((valid / (total - noCui)) * 100).toFixed(2) + "%" : "n/a",
}, null, 2));
console.log("invalid samples:", invalidSamples);
