import { describe, expect, it } from "vitest";
import { makeWorkerUtils, run, type Task } from "graphile-worker";
import { DEFAULT_DATABASE_URL } from "@seap/db";

// Integration test — requires docker Postgres (infra/docker-compose.yml).
// graphile-worker creates its own schema on first run.

const connectionString = process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;

describe("ingestion worker", () => {
  it("executes an enqueued job", async () => {
    let ran = false;
    const probe: Task = async (payload) => {
      ran = true;
      expect((payload as { ping: string }).ping).toBe("pong");
    };

    const utils = await makeWorkerUtils({ connectionString });
    try {
      await utils.addJob("probe", { ping: "pong" });
    } finally {
      await utils.release();
    }

    const runner = await run({
      connectionString,
      concurrency: 1,
      taskList: { probe },
    });
    try {
      // Poll until the job has been picked up and executed
      const deadline = Date.now() + 15_000;
      while (!ran && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      await runner.stop();
    }

    expect(ran).toBe(true);
  }, 30_000);
});
