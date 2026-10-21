import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { getCompanyReps, getRegistryCui } from "./marts";

// Audit F03 (option C stopgap): a foreign registration number that passes the
// CUI checksum was joined to the ONRC/MF records of an unrelated Romanian firm
// (e.g. FRESIA S.P.A. showed the representatives of a Romanian SNC). The entity
// page now reads ONRC through a corroborated CUI only. ONRC names and the
// person are fictitious.
const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Registry fixtures require a dedicated seap_test_* database");

const foreign = "991200001", stray = "991200002", romanian = "991200003";

describe.skipIf(!url)("ONRC data on the entity page only through a corroborated CUI (isolated PostgreSQL)", () => {
  let sql: DbSql;
  const globals = globalThis as unknown as { __seapSql?: DbSql };
  beforeAll(async () => {
    sql = createDb(url).sql;
    const [existing] = await sql`select count(*)::int n from reference.company_reps where person_key='fixture-f03'`;
    if (Number(existing?.n) !== 0) throw new Error("Expected no leftover F03 fixture");
    globals.__seapSql = sql;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,country_code,is_foreign) values
      (${foreign},'FRESIA S.P.A.','fresia s p a','1152147',true,'IT',false),
      (${stray},'TRANSELECTRICA S.A.','transelectrica','13328043',true,'DE',false),
      (${romanian},'Furnizor Exemplu S.R.L.','furnizor exemplu','99120011',true,null,false)`;
    // As written by the marts build: only the stray-country Romanian company is corroborated.
    await sql`insert into marts.cui_corroborations(entity_id,cui,onrc_name) values (${stray},'13328043','TRANSELECTRICA SA')`;
    await sql`insert into marts.entity_profile(entity_id,role,n_contracts,n_das,is_foreign)
      select id::bigint,'supplier',0,1,false from unnest(array[${foreign},${stray},${romanian}]::text[]) id`;
    await sql`insert into reference.company_reps(j_number,cui,person_name,calitate,birth_date,person_key,snapshot_date)
      select 'J-F03-'||cui,cui,'PERSOANA FICTIVA','administrator','1970-01-01','fixture-f03','2026-09-01'
      from unnest(array['1152147','13328043','99120011']) cui`;
  });
  afterAll(async () => {
    if (!sql) return;
    delete globals.__seapSql;
    await sql`delete from reference.company_reps where person_key='fixture-f03'`;
    await sql`delete from marts.entity_profile where entity_id = any(${[foreign, stray, romanian]}::bigint[])`;
    await sql`delete from marts.cui_corroborations where entity_id = any(${[foreign, stray, romanian]}::bigint[])`;
    await sql`delete from core.entities where id = any(${[foreign, stray, romanian]}::bigint[])`;
    await sql.end();
  });

  it("returns a registry CUI for Romanian and corroborated firms, never for a foreign checksum collision", async () => {
    expect(await getRegistryCui(foreign)).toBeNull();
    expect(await getRegistryCui(stray)).toBe("13328043");
    expect(await getRegistryCui(romanian)).toBe("99120011");
  });

  it("does not count a foreign collision among the representative's other firms", async () => {
    const reps = await getCompanyReps("99120011");
    expect(reps).toHaveLength(1);
    // The stray-country Romanian company counts; FRESIA's colliding number does not.
    expect(reps[0]).toMatchObject({ personName: "PERSOANA FICTIVA", nOtherFirms: 1 });
  });
});
