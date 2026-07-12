import { openSync, readSync, closeSync, statSync } from "node:fs";
import { deserialize } from "bson";

/**
 * Iterate every document in a mongodump `.bson` file. Reads the whole file into
 * one buffer, so only use it for the collections we actually import (all ≤ ~75MB
 * — the multi-GB *Details/*CpvData dumps are never touched here).
 *
 * mongodump concatenates each document as a length-prefixed BSON frame:
 * a 4-byte little-endian total length, then that many bytes of document.
 */
export function* readBson(file: string): Generator<Record<string, unknown>> {
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(size);
    let read = 0;
    while (read < size) read += readSync(fd, buf, read, size - read, read);
    let off = 0;
    while (off + 4 <= buf.length) {
      const len = buf.readInt32LE(off);
      if (len <= 0 || off + len > buf.length) break;
      yield deserialize(buf.subarray(off, off + len)) as Record<string, unknown>;
      off += len;
    }
  } finally {
    closeSync(fd);
  }
}
