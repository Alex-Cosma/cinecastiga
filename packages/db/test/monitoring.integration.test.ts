import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/client.js";
import { getMonitoringRefreshStatus, MONITORING_GATE, MonitoringRefreshUnavailableError,
  publishMonitoringRefresh, withMonitoringSnapshot, withMonitoringWrite } from "../src/monitoring.js";

const url = process.env["TEST_DATABASE_URL"];
if (url && !/^seap_test_/.test(new URL(url).pathname.slice(1))) throw new Error("Monitoring tests require an isolated seap_test_* database");
const suite = url ? describe : describe.skip;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
suite("monitoring publication gate", () => {
  const { sql } = createDb(url);
  const ids: string[] = [];
  const metadata = { monitoring: "fixture-1" };
  const outcome = () => Promise.resolve({ sourceCoverage: { procurementDateTo: "2020-12-31", collectedAt: "2021-01-01" }, validation: { fixture: true } });
  async function publish() {
    const cp = await publishMonitoringRefresh(sql, "baseline", metadata, outcome); ids.push(cp.id); return cp;
  }
  beforeAll(async () => {
    const [row] = await sql`select count(*)::int n from app.monitoring_refreshes`;
    if (row?.["n"] !== 0) throw new Error("Run gate tests before other monitoring fixtures; monitoring_refreshes must be empty");
  });
  afterAll(async () => {
    if (ids.length) await sql`delete from app.monitoring_refreshes where id = any(${ids}::uuid[])`;
    await sql.end();
  });
  it("requires an explicit ready baseline and preserves actual source freshness", async () => {
    await expect(withMonitoringSnapshot(sql, async () => "unreachable")).rejects.toMatchObject({ reason: "unpublished" });
    const cp = await publish();
    expect(cp.status).toBe("ready"); expect(cp.kind).toBe("baseline"); expect(cp.sourceCoverage["procurementDateTo"]).toBe("2020-12-31");
    expect(await withMonitoringSnapshot(sql, async (q, checkpoint) => {
      const [mode] = await q`select current_setting('transaction_isolation') isolation`;
      expect(mode?.["isolation"]).toBe("repeatable read"); return checkpoint.id;
    }, cp.id)).toBe(cp.id);
  });
  it("does not expose the previous ready version during an active rebuild", async () => {
    const entered = deferred(), finish = deferred();
    const writing = publishMonitoringRefresh(sql, "coordinated", metadata, async () => {
      entered.resolve(); await finish.promise; return outcome();
    });
    await entered.promise;
    try {
      await expect(withMonitoringSnapshot(sql, async () => "unreachable")).rejects.toMatchObject({ reason: "refreshing" });
      expect((await getMonitoringRefreshStatus(sql)).current?.status).toBe("running");
    } finally { finish.resolve(); }
    ids.push((await writing).id);
  });
  it("makes writers wait until a snapshot has completely published its work", async () => {
    const entered = deferred(), finish = deferred(), reader = withMonitoringSnapshot(sql, async () => {
      entered.resolve(); await finish.promise; return "complete";
    });
    await entered.promise;
    const connection = await sql.reserve();
    try {
      const [gate] = await connection`select pg_try_advisory_lock(${MONITORING_GATE[0]}, ${MONITORING_GATE[1]}) acquired`;
      expect(gate?.["acquired"]).toBe(false);
    } finally { connection.release(); finish.resolve(); }
    expect(await reader).toBe("complete");
    const cp = await publish(); expect(cp.status).toBe("ready");
  });
  it("invalidates a ready checkpoint before manual mutations and stays dirty after success", async () => {
    const prior = (await getMonitoringRefreshStatus(sql)).current!;
    await withMonitoringWrite(sql, "fixture manual", async () => {
      const status = await getMonitoringRefreshStatus(sql); expect(status.current?.status).toBe("running");
      await expect(withMonitoringSnapshot(sql, async () => null)).rejects.toBeInstanceOf(MonitoringRefreshUnavailableError);
    });
    const status = await getMonitoringRefreshStatus(sql); ids.push(status.current!.id);
    expect(status.available).toBe(false); expect(status.lastReady?.id).toBe(prior.id);
    expect(status.current?.status).toBe("failed"); expect(status.current?.kind).toBe("manual");
    await expect(withMonitoringSnapshot(sql, async () => null)).rejects.toMatchObject({ reason: "failed" });
    const recovered = await publish(); expect(BigInt(recovered.version)).toBeGreaterThan(BigInt(prior.version));
    await expect(withMonitoringSnapshot(sql, async () => null, prior.id)).rejects.toMatchObject({ reason: "superseded" });
  });
  it("records failed refreshes, releases locks, and never exposes failure as no changes", async () => {
    await expect(publishMonitoringRefresh(sql, "coordinated", metadata, async () => { throw new Error("sensitive source text"); })).rejects.toThrow("sensitive source text");
    const status = await getMonitoringRefreshStatus(sql); ids.push(status.current!.id);
    expect(status.current?.status).toBe("failed"); expect(status.current?.error).not.toContain("sensitive source text");
    expect(status.available).toBe(false);
    const cp = await publish(); expect(cp.status).toBe("ready");
  });
  it("fails closed after an interrupted writer whose session lock no longer exists", async () => {
    const [row] = await sql`insert into app.monitoring_refreshes (kind) values ('coordinated') returning id`;
    ids.push(String(row!["id"]));
    await expect(withMonitoringSnapshot(sql, async () => null)).rejects.toMatchObject({ reason: "refreshing" });
    expect((await getMonitoringRefreshStatus(sql)).available).toBe(false);
    const cp = await publish(); expect(cp.status).toBe("ready");
  });
  it("rolls back snapshot writes on failure and releases the shared lock", async () => {
    const before = (await getMonitoringRefreshStatus(sql)).current!;
    await expect(withMonitoringSnapshot(sql, async q => {
      await q`update app.monitoring_refreshes set validation = '{"bad":true}'::jsonb where id = ${before.id}`;
      throw new Error("fixture rollback");
    })).rejects.toThrow("fixture rollback");
    expect((await getMonitoringRefreshStatus(sql)).current?.validation).toEqual({ fixture: true });
    expect((await publish()).status).toBe("ready");
  });
  it("orders checkpoint versions numerically across decimal-width boundaries", async () => {
    let prior = (await getMonitoringRefreshStatus(sql)).current!;
    for (let index = 0; index < 12; index++) {
      const checkpoint = await publish();
      expect(BigInt(checkpoint.version)).toBeGreaterThan(BigInt(prior.version));
      expect((await getMonitoringRefreshStatus(sql)).current?.id).toBe(checkpoint.id);
      prior = checkpoint;
    }
  });
});
