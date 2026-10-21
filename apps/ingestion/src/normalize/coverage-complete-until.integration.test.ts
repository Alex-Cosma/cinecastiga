import { afterAll, describe, expect, it } from "vitest";
import { createDb, type DbSql } from "@seap/db";
import { completeUntil, runCoverage } from "./coverage.js";

const { sql } = createDb();
afterAll(() => sql.end());

/** Every qualified object is redirected into isolated, data-less clones inside a rollback:
 * no shared table, row or sequence is touched. */
function isolatedSql(connection: DbSql, prefix: string): DbSql {
  const rewrite = (text: string) => text.replace(/\b(app|core|marts)\./g, `${prefix}_$1.`);
  const scoped = ((chunks: TemplateStringsArray, ...values: unknown[]) => {
    if (typeof chunks === "string" || !Array.isArray((chunks as { raw?: unknown }).raw))
      return (connection as unknown as (...a: unknown[]) => unknown)(chunks, ...values);
    const mapped = chunks.map(rewrite);
    Object.defineProperty(mapped, "raw", { value: chunks.raw.map(rewrite) });
    return connection(mapped as unknown as TemplateStringsArray, ...values as never[]);
  }) as unknown as DbSql;
  Object.assign(scoped, {
    begin: (...args: unknown[]) => (connection as unknown as {
      savepoint: (fn: (q: DbSql) => Promise<unknown>) => Promise<unknown>;
    }).savepoint((q) => (args[args.length - 1] as (q: DbSql) => Promise<unknown>)(isolatedSql(q, prefix))),
  });
  return scoped;
}

// The tables runCoverage reads (as in marts.integration.test.ts), the collector tasks and the import log.
const tables = {
  app: ["collection_tasks"],
  core: ["contracts", "awards", "contract_winners", "entities", "direct_acquisitions", "ted_lot_results", "ted_notices", "scrape_runs"],
  marts: ["contract_identity_exclusions", "contract_identity_archives", "contract_identity_members", "contract_identity_decisions", "contract_identity_candidates", "contract_identity_observations", "contract_transactions", "da_transactions", "data_coverage"],
};

async function fixture(run: (q: DbSql) => Promise<void>, { withTasks = true, withRuns = true } = {}) {
  const prefix = `complete_until_${process.pid}_${Date.now()}`;
  const rollback = Error("rollback complete-until fixture");
  await expect(sql.begin(async tx => {
    for (const [schema, names] of Object.entries(tables)) {
      await tx.unsafe(`create schema ${prefix}_${schema}`);
      for (const table of names) {
        if (table === "collection_tasks" && !withTasks || table === "scrape_runs" && !withRuns) continue;
        await tx.unsafe(`create table ${prefix}_${schema}.${table} as table ${schema}.${table} with no data`);
      }
    }
    await run(isolatedSql(tx as unknown as DbSql, prefix));
    throw rollback;
  })).rejects.toBe(rollback);
}

/** Months relative to the current Bucharest month, as runCoverage judges only ended months. */
async function monthsAgo(q: DbSql, n: number): Promise<string> {
  const [row] = await q`select to_char((date_trunc('month', now() at time zone 'Europe/Bucharest') - make_interval(months => ${n}))::date, 'YYYY-MM') ym`;
  return String(row!["ym"]);
}
const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

// Audit F10 (21 Oct 2026): production had DA complete to 20.10.2026, contracts reliable only
// through 30.06.2026 (July 79%, September 57% of the year before) and TED to 21.07.2026, but
// the public panel and /metodologie showed only the last observed day of each stream.
describe("completeUntil (isolated rollback fixture)", () => {
  it("DA: the unbroken run of collector days with one fully finished scan", async () => {
    await fixture(async q => {
      const day = (d: string, status: string, scan: string, extra: Record<string, unknown> = {}, kind = "da", stream = "da", priority = 10) =>
        q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status,priority,created_at)
          values('b',${`${d}:${scan}:${status}:${JSON.stringify(extra)}:${kind}:${priority}`},'p',${stream},${kind},
            ${JSON.stringify({ from: d, to: d, page: 0, daStrategy: "cpv-day-v1", daScan: scan, ...extra })}::jsonb,${status},${priority},now())`;
      await day("2026-07-01", "split", "2026-07-01");
      await day("2026-07-01", "complete", "2026-07-01", { cpvPrefix: "03" });
      await day("2026-07-02", "complete", "2026-07-02");
      // a later re-scan still queued does not undo a finished day
      await day("2026-07-02", "pending", "2026-07-08");
      await day("2026-07-03", "complete", "2026-07-03");
      await day("2026-07-03", "complete", "2026-07-03", { noticeId: 7 }, "da-detail");
      // background work is not the ordinary record of the day
      await day("2026-07-04", "failed", "2026-07-04", {}, "da", "da", 60);
      await day("2026-07-04", "complete", "2026-07-04");
      // a failed CPV fallback leaves 05.07 unfinished; later days do not count
      await day("2026-07-05", "split", "2026-07-05");
      await day("2026-07-05", "failed", "2026-07-05", { daFallback: true }, "catalogue", "catalogue");
      await day("2026-07-06", "complete", "2026-07-06");
      expect((await completeUntil(q)).da).toBe("2026-07-04");
      await q`update app.collection_tasks set status='complete' where kind='catalogue'`;
      expect((await completeUntil(q)).da).toBe("2026-07-06");
      // a day without any task ends the run
      await day("2026-07-08", "complete", "2026-07-08");
      expect((await completeUntil(q)).da).toBe("2026-07-06");
      // nothing finished on the first collector day: not established
      await q`update app.collection_tasks set status='pending' where params->>'from'='2026-07-01'`;
      expect((await completeUntil(q)).da).toBeNull();
    });
  });

  it("contracts: the end of the latest ended month with at least 90% of the year before", async () => {
    await fixture(async q => {
      const months: [number, number, number][] = [[1, 15, 100], [2, 57, 100], [3, 79, 100], [4, 90, 100], [5, 70, 100]];
      let id = 0;
      const add = (month: string, n: number, value = 1) =>
        q`insert into marts.contract_transactions(contract_id,closing_value,finalization_date)
          select ${id} + g, ${value}, ${`${month}-15`} from generate_series(1, ${n}) g`.then(() => { id += n; });
      for (const [ago, now, before] of months) {
        await add(await monthsAgo(q, ago), now);
        await add(await monthsAgo(q, ago + 12), before);
      }
      // 3 months ago stays at 79%: further allocation rows of its contracts count once and
      // rows outside the totals (no positive value) not at all
      const third = await monthsAgo(q, 3);
      await q`insert into marts.contract_transactions(contract_id,closing_value,finalization_date)
        select contract_id, 1, finalization_date from marts.contract_transactions where finalization_date like ${`${third}-%`} limit 20`;
      await add(third, 20, 0);
      // the running month is never judged, however full it looks
      await add(await monthsAgo(q, 0), 3);
      await add(await monthsAgo(q, 12), 3);
      expect((await completeUntil(q)).contracts).toBe(monthEnd(await monthsAgo(q, 4)));
      await q`delete from marts.contract_transactions where finalization_date like ${`${await monthsAgo(q, 16)}-%`}`;
      expect((await completeUntil(q)).contracts).toBeNull();
    });
  });

  it("TED: the newest archived OJ S package or finished import window, whichever is later", async () => {
    await fixture(async q => {
      const pkg = (id: number, status: string, result: Record<string, unknown>) =>
        q`insert into app.collection_tasks(id,batch_id,key,partition,stream,kind,params,status,priority,result,created_at)
          values(${id},'b',${`ted:${id}`},'p','ted','ted-package','{"page":0}'::jsonb,${status},10,${JSON.stringify(result)}::jsonb,now())`;
      await q`insert into core.scrape_runs(id,source,status,started_at,window_start,window_end)
        values(1,'ted:can-standard','completed',now(),'2026-06-01T00:00:00Z','2026-07-01 02:59:59+03'),
              (2,'ted:can-standard','failed',now(),'2026-07-01T00:00:00Z','2026-08-01 02:59:59+03'),
              (3,'elicitatie:das','completed',now(),'2026-07-16T00:00:00+03','2026-07-16 23:59:59+03')`;
      expect((await completeUntil(q)).ted).toBe("2026-06-30");
      await pkg(1, "complete", { ojs: "202600138", published: true, publicationDate: "2026-07-21" });
      await pkg(2, "failed", { ojs: "202600139" });
      await pkg(3, "complete", { ojs: "202600140", published: false });
      expect((await completeUntil(q)).ted).toBe("2026-07-21");
    });
    await fixture(async q => expect(await completeUntil(q)).toEqual({ da: null, contracts: null, ted: null }), { withTasks: false, withRuns: false });
  });

  it("runCoverage publishes the day in each stream's observation", async () => {
    await fixture(async q => {
      await q`insert into core.scrape_runs(id,source,status,started_at,window_start,window_end)
        values(1,'ted:can-standard','completed',now(),'2026-06-01T00:00:00Z','2026-07-01 02:59:59+03')`;
      await q`alter table marts.data_coverage add primary key (dataset)`;
      await runCoverage(q);
      const rows = await q`select dataset, observation from marts.data_coverage where dataset in ('da','contracts','ted') order by dataset`;
      expect(rows.map(r => [r["dataset"], (r["observation"] as Record<string, unknown>)["complete_until"]]))
        .toEqual([["contracts", null], ["da", null], ["ted", "2026-06-30"]]);
      expect(rows.every(r => "complete_until" in (r["observation"] as Record<string, unknown>))).toBe(true);
    });
  });
});
