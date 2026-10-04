import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, type DbSql } from "@seap/db";
import { repairFinancials, repairOnrc } from "./repair.js";

const url = process.env.DATABASE_URL;
const allowed = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) &&
  new URL(url).pathname === "/seap_test_references_guards";
const { sql } = createDb(url);
const dir = mkdtempSync(join(tmpdir(), "seap-reference-test-"));
const reps = join(dir, "reps.csv");
const header = "COD_INMATRICULARE^PERSOANA_IMPUTERNICITA^CALITATE^DATA_NASTERE^LOCALITATE_NASTERE^JUDET_NASTERE^TARA_NASTERE^LOCALITATE^JUDET^TARA\n";
const rollback = new Error("fixture rollback");
afterAll(async () => { await sql.end(); rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(!allowed)("reference repair safeguards (dedicated empty local DB)", () => {
  it("preserves duplicate rows, disambiguates names by date, and is idempotent", async () => {
    writeFileSync(reps, header + "J1^PERSON TEST^ADMINISTRATOR^01/01/1980 00:00:00^TEST^^^^^\n".repeat(2)
      + "J2^PERSON TEST^ADMINISTRATOR^01/01/1990^TEST^^^^^\n");
    await expect(sql.begin(async (tx) => {
      const q = tx as unknown as DbSql;
      await q`insert into reference.onrc_firm(j_number,cui,name,snapshot_date) values('J1','100','TEST','2026-07-08'),('J2','200','TEST','2026-07-08')`;
      await q`insert into reference.company_reps(j_number,cui,person_name,calitate,birth_date,birth_locality,person_key,snapshot_date)
        values('J1','100','PERSON TEST','ADMINISTRATOR',null,'TEST','person test||test','2026-07-08'),
        ('J1','100','PERSON TEST','ADMINISTRATOR',null,'TEST','person test||test','2026-07-08'),
        ('J2','200','PERSON TEST','ADMINISTRATOR','1990-01-01','TEST','person test|1990-01-01|test','2026-07-08')`;
      expect((await repairOnrc(q, reps, "2026-07-08")).changed).toBe(2);
      const [r] = await q`select count(*) n,count(distinct person_key) persons from reference.company_reps`;
      expect(r).toMatchObject({ n: "3", persons: "2" });
      await q`drop table repair_reps`;
      expect((await repairOnrc(q, reps, "2026-07-08")).changed).toBe(0);
      throw rollback;
    })).rejects.toBe(rollback);
    expect((await sql`select count(*) n from reference.company_reps`)[0]!.n).toBe("0");
  });

  it("rejects the wrong ONRC snapshot without leaving any partial changes", async () => {
    writeFileSync(reps, header + "J1^TEST^ADMINISTRATOR^01/01/1980 00:00:00^TEST^^^^^\n");
    await expect(sql.begin(async (tx) => repairOnrc(tx as unknown as DbSql, reps, "2026-07-08")))
      .rejects.toThrow("differs from stored snapshot");
    expect((await sql`select count(*) n from reference.company_reps`)[0]!.n).toBe("0");
  });

  it("aborts the COPY stream on an invalid calendar date", async () => {
    writeFileSync(reps, header + "J1^TEST^ADMINISTRATOR^31/02/1980 00:00:00^TEST^^^^^\n");
    await expect(sql.begin(async (tx) => repairOnrc(tx as unknown as DbSql, reps, "2026-07-08")))
      .rejects.toThrow("Invalid ONRC date");
    expect((await sql`select count(*) n from reference.company_reps`)[0]!.n).toBe("0");
  });

  it("recovers zero and exact amounts using the stored vintage, keeps existing profit and does not insert filings", async () => {
    for (const vintage of [2024, 2025]) {
      const p = join(dir, `${vintage}-WEB_UU_AN2024.txt`);
      writeFileSync(p + ".spec.csv", "Profit net;i18\n");
      writeFileSync(p, `CUI,CAEN,I18\n100,,${vintage === 2024 ? "0" : "9007199254740993.12"}\n200,,7\n300,,99\n400,,9007199254740993.12\n`);
    }
    await expect(sql.begin(async (tx) => {
      const q = tx as unknown as DbSql;
      await q`insert into reference.company_financials(cui,year,category,source_vintage,profit_net)
        values('100',2024,'UU',2024,null),('200',2024,'UU',2025,7),('400',2024,'UU',2025,null)`;
      const result = await repairFinancials(q, dir);
      expect(result.changed).toBe(2);
      expect(await q`select cui,profit_net::text from reference.company_financials order by cui`).toEqual([
        { cui: "100", profit_net: "0" }, { cui: "200", profit_net: "7" }, { cui: "400", profit_net: "9007199254740993.12" },
      ]);
      await q`drop table repair_financials`;
      expect((await repairFinancials(q, dir)).changed).toBe(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("refuses an unrelated MF discrepancy and rolls back the ONRC repair too", async () => {
    const p = join(dir, "2025-WEB_UU_AN2025.txt");
    writeFileSync(p + ".spec.csv", "Profit net;i18\nCifra de afaceri neta;i13\n");
    writeFileSync(p, "CUI,CAEN,I13,I18\n100,,50,100\n");
    writeFileSync(reps, header + "J1^TEST^ADMINISTRATOR^01/01/1980 00:00:00^TEST^^^^^\n");
    await expect(sql.begin(async (tx) => {
      const q = tx as unknown as DbSql;
      await q`insert into reference.onrc_firm(j_number,cui,name,snapshot_date) values('J1','100','TEST','2026-07-08')`;
      await q`insert into reference.company_reps(j_number,cui,person_name,calitate,birth_locality,person_key,snapshot_date)
        values('J1','100','TEST','ADMINISTRATOR','TEST','test||test','2026-07-08')`;
      expect((await repairOnrc(q, reps, "2026-07-08")).changed).toBe(1);
      await q`insert into reference.company_financials(cui,year,category,source_vintage,net_turnover)
        values('100',2025,'UU',2025,51)`;
      await repairFinancials(q, dir);
    })).rejects.toThrow("non-target values differ");
    expect((await sql`select count(*) n from reference.company_financials`)[0]!.n).toBe("0");
    expect((await sql`select count(*) n from reference.company_reps`)[0]!.n).toBe("0");
  });

  it("reports a missing MF spec without guessing an indicator or changing the filing", async () => {
    writeFileSync(join(dir, "2025-WEB_NO_SPEC_AN2025.txt"), "CUI,CAEN,I18\n100,,999\n");
    await expect(sql.begin(async (tx) => {
      const q = tx as unknown as DbSql;
      await q`insert into reference.company_financials(cui,year,category,source_vintage) values('100',2025,'NO_SPEC',2025)`;
      const result = await repairFinancials(q, dir);
      expect(result.changed).toBe(0);
      expect(result.skipped).toEqual([{ year: 2025, category: "NO_SPEC", reason: "No cached spec; repair does not infer indicator numbers" }]);
      expect((await q`select profit_net from reference.company_financials`)[0]!.profit_net).toBeNull();
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
