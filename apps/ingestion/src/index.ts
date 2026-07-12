import { run } from "graphile-worker";
import { DEFAULT_DATABASE_URL } from "@seap/db";
import { crontab, taskList } from "./jobs/index.js";

async function main(): Promise<void> {
  const runner = await run({
    connectionString: process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL,
    concurrency: 5,
    taskList,
    crontab,
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, stopping worker...`);
    runner.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await runner.promise;
}

main().catch((err) => {
  console.error("worker crashed:", err);
  process.exit(1);
});
