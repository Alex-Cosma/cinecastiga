import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serialize } from "bson";
import { describe, it, expect } from "vitest";
import { streamBson } from "../src/import-old/bson-stream.js";

describe("strict archive reader", () => {
  it("handles frames across chunks and rejects truncation/corruption", () => {
    const dir=mkdtempSync(join(tmpdir(),'bson-identity-')),file=join(dir,'test.bson');
    try {
      const bytes=Buffer.concat([serialize({id:1}),serialize({id:2})]);
      writeFileSync(file,bytes);
      expect([...streamBson(file,7)]).toEqual([{id:1},{id:2}]);
      writeFileSync(file,bytes.subarray(0,bytes.length-1));
      expect(()=>[...streamBson(file,7)]).toThrow('Truncated');
      writeFileSync(file,Buffer.alloc(4));
      expect(()=>[...streamBson(file)]).toThrow('Invalid BSON');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
