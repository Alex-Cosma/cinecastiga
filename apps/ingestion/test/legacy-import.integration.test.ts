import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serialize } from "bson";
import { createDb } from "@seap/db";
import { describe, it, expect } from "vitest";
import { loadDas } from "../src/import-old/load-das.js";

const url = process.env.IDENTITY_TEST_DATABASE_URL;
if (url && !/^seap_test_identity_/.test(new URL(url).pathname.slice(1))) throw new Error("Isolated identity test DB required");
describe.skipIf(!url)("legacy import regression", () => {
  it("uses fiscal identity despite a polluted SICAP mapping and replays without new entities", async () => {
    const {db,sql}=createDb(url!);
    const dir=mkdtempSync(join(tmpdir(),"identity-import-"));
    try {
      const [main]=await sql`insert into core.entities(name_display,name_normalized,cui_canonical,cui_valid) values ('Municipiul Cluj-Napoca','municipiul cluj napoca','4305857',true) returning id`;
      const [old]=await sql`insert into core.entities(name_display,name_normalized) values ('Municipiul Cluj-Napoca','municipiul cluj napoca') returning id`;
      await sql`insert into core.entity_sicap_ids values (${main!.id},'authority',1226),(${old!.id},'authority',4305857)`;
      const file=join(dir,'directAcquisitionContract.bson');
      writeFileSync(file,Buffer.concat([
        serialize({directAcquisitionId:102373033,contractingAuthority:'4305857 Municipiul Cluj-Napoca',closingValue:'123.45'}),
        serialize({directAcquisitionId:102372052,contractingAuthority:'RO 4305857 Municipiul Cluj-Napoca',closingValue:'99.99'}),
        serialize({directAcquisitionId:102367419,contractingAuthority:'123456 Instituție neidentificată',closingValue:'1.01'}),
      ]));
      expect((await loadDas(db,sql,file)).inserted).toBe(3);
      const rows=await sql`select authority_entity_id::text authority,closing_value::text value from core.direct_acquisitions order by sicap_da_id desc`;
      expect(rows.slice(0,2).map(r=>r.authority)).toEqual([String(main!.id),String(main!.id)]);
      const before=await sql`select count(*)::int n from core.entities`;
      expect((await loadDas(db,sql,file)).inserted).toBe(0);
      expect((await sql`select count(*)::int n from core.entities`)[0]!.n).toBe(before[0]!.n);
      expect((await sql`select sum(closing_value)::text amount from core.direct_acquisitions`)[0]!.amount).toBe('224.45');
      expect((await sql`select count(*)::int n from core.entity_sicap_ids`)[0]!.n).toBe(2);
    } finally {
      await sql`truncate core.direct_acquisitions,core.entity_sicap_ids,core.entities cascade`;
      await sql.end({timeout:5}); rmSync(dir,{recursive:true,force:true});
    }
  });
});
