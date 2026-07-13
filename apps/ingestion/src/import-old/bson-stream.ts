import { openSync, readSync, closeSync, statSync } from "node:fs";
import { deserialize } from "bson";

/**
 * Stream every document from a large mongodump `.bson` (GB-scale) without
 * loading the whole file: read fixed chunks, carry the partial trailing frame
 * into the next chunk, yield each complete frame. Use for the multi-GB DA dumps
 * where `readBson` (whole-file) would blow memory.
 */
export function* streamBson(
  file: string,
  chunkBytes = 64 * 1024 * 1024,
): Generator<Record<string, unknown>> {
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  try {
    const chunk = Buffer.alloc(chunkBytes);
    let carry = Buffer.alloc(0);
    let filePos = 0;
    while (filePos < size) {
      const want = Math.min(chunkBytes, size - filePos);
      let r = 0;
      while (r < want) r += readSync(fd, chunk, r, want - r, filePos + r);
      filePos += want;
      const buf = carry.length
        ? Buffer.concat([carry, chunk.subarray(0, want)])
        : chunk.subarray(0, want);
      let off = 0;
      while (off + 4 <= buf.length) {
        const len = buf.readInt32LE(off);
        if (len <= 0) {
          off = buf.length;
          break;
        }
        if (off + len > buf.length) break;
        yield deserialize(buf.subarray(off, off + len)) as Record<string, unknown>;
        off += len;
      }
      // Copy the remainder — `chunk` is reused next iteration.
      carry = Buffer.from(buf.subarray(off));
    }
  } finally {
    closeSync(fd);
  }
}
