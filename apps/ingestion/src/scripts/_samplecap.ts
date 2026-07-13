import { openSync, readSync, closeSync, statSync } from "node:fs";
import { deserialize } from "bson";
// Read only first `capMB` of a (possibly huge) bson and yield first `n` docs.
function* docs(file: string, capMB: number, n: number): Generator<Record<string, unknown>> {
  const cap = Math.min(statSync(file).size, capMB * 1024 * 1024);
  const fd = openSync(file, "r"); const buf = Buffer.alloc(cap);
  let read = 0; while (read < cap) read += readSync(fd, buf, read, cap - read, read);
  closeSync(fd); let off = 0, c = 0;
  while (off + 4 <= buf.length && c < n) {
    const len = buf.readInt32LE(off);
    if (len <= 0 || off + len > buf.length) break;
    yield deserialize(buf.subarray(off, off + len)) as Record<string, unknown>; off += len; c++;
  }
}
const dir = "../../db-old";
for (const c of process.argv.slice(2)) {
  console.log(`\n========== ${c} ==========`);
  try {
    for (const d of docs(`${dir}/${c}.bson`, 12, 1)) {
      // show top-level keys + a shallow view
      console.log("KEYS:", Object.keys(d).join(", "));
      console.log(JSON.stringify(d, (_k,v)=> typeof v==="bigint"? v.toString(): v, 2).slice(0, 2600));
    }
  } catch(e){ console.log("ERR", (e as Error).message); }
}
