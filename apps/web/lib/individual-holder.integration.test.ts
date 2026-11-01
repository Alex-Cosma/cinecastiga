import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { readHolderPractices, readHolderTwin } from "./individual-holder";
import { ground } from "./ask/ground";

// Owner decisions of 1 November 2026: an individual practice links to the one dated ONRC person with its holder's name
// (the page's "Titular"), and Ask's «conduse azi de» for that person includes the practice, by name only. Names and
// numbers are fictitious.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Holder fixtures require a dedicated seap_test_* database");

const firm = "991300001", cabinet = "991300002", pfa = "991300003", namesakeCabinet = "991300004", look = "991300005", ledPfa = "991300006";
const ids = [firm, cabinet, pfa, namesakeCabinet, look, ledPfa];
const person = "fixtur holderx ana|1971-03-04|testloc";

describe.skipIf(!url)("an individual practice and the ONRC person with its holder's name (isolated PostgreSQL)", () => {
  let sql: DbSql;
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from core.entities where id = any(${ids}::bigint[])`;
    if (Number(existing?.n) !== 0) throw new Error("Expected no leftover holder fixture");
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,country_code,is_foreign) values
      (${firm},'FIXTUR CONSULT S.R.L.','fixtur consult','99130011',true,null,false),
      (${cabinet},'CABINET INDIVIDUAL DE PSIHOLOGIE "FIXTUR HOLDERX ANA"','cabinet individual de psihologie fixtur holderx ana','99130012',true,null,false),
      (${pfa},'FIXTUR HOLDERX ANA P.F.A.','fixtur holderx ana p f a','99130013',true,null,false),
      (${namesakeCabinet},'CABINET MEDICAL INDIVIDUAL FIXTUR NAMESAKE DAN','cabinet medical individual fixtur namesake dan','99130014',true,null,false),
      (${look},'FIXTUR HOLDERX ANA SRL','fixtur holderx ana srl','99130015',true,null,false),
      (${ledPfa},'FIXTUR HOLDERX ANA I.I.','fixtur holderx ana i i','99130016',true,null,false)`;
    await sql`insert into marts.entity_profile(entity_id,role,n_contracts,n_das,is_foreign)
      select id::bigint,'supplier',0,1,false from unnest(${ids}::text[]) id`;
    await sql`insert into reference.company_reps(j_number,cui,person_name,calitate,birth_date,birth_locality,person_key,snapshot_date) values
      ('J-HOLDER-1','99130011','FIXTUR HOLDERX-ANA','administrator','1971-03-04','TESTLOC',${person},'2026-09-01'),
      -- The I.I. has a representative of its own: it is a firm ONRC leads, not one matched by name.
      ('J-HOLDER-2','99130016','ALTCINEVA FIXTUR','administrator','1960-01-01','TESTLOC','altcineva fixtur|1960-01-01|testloc','2026-09-01'),
      -- Two dated people named FIXTUR NAMESAKE DAN: nobody is linked by that name.
      ('J-HOLDER-3','99130011','FIXTUR NAMESAKE DAN','asociat','1980-01-01','A','fixtur namesake dan|1980-01-01|a','2026-09-01'),
      ('J-HOLDER-4','99130011','FIXTUR NAMESAKE DAN','asociat','1990-01-01','B','fixtur namesake dan|1990-01-01|b','2026-09-01')`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from reference.company_reps where j_number like 'J-HOLDER-%'`;
    await sql`delete from marts.entity_profile where entity_id = any(${ids}::bigint[])`;
    await sql`delete from core.entities where id = any(${ids}::bigint[])`;
    await sql.end();
  });

  it("finds the practices whose holder has the person's name and no ONRC representative of their own", async () => {
    // Not the S.R.L. with the same words (no individual form) nor the I.I. with its own representative.
    expect((await readHolderPractices(sql, person)).sort()).toEqual([cabinet, pfa].sort());
    expect(await readHolderTwin(sql, 'CABINET INDIVIDUAL DE PSIHOLOGIE "FIXTUR HOLDERX ANA"')).toMatchObject({ personKey: person, firms: 1 });
  });

  it("links nobody when two dated people share the name", async () => {
    expect(await readHolderPractices(sql, "fixtur namesake dan|1980-01-01|a")).toEqual([]);
    expect(await readHolderTwin(sql, "CABINET MEDICAL INDIVIDUAL FIXTUR NAMESAKE DAN")).toBeNull();
  });

  it("puts the practices in «conduse azi de», marked apart from the firms ONRC links", async () => {
    const { admin } = await ground(sql, { adminPersonKey: person });
    expect(admin?.supplierIds.sort()).toEqual([firm, cabinet, pfa].sort());
    expect(admin?.holderIds?.sort()).toEqual([cabinet, pfa].sort());
    expect(admin?.nFirms).toBe(1);
  });
});
