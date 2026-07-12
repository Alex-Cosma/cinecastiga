import type { TaskList } from "graphile-worker";
import { heartbeat } from "./heartbeat.js";

export const taskList: TaskList = {
  heartbeat,
};

/** Dev cadence: every minute. Real scrape schedules land in project Phase 2. */
export const crontab = `* * * * * heartbeat`;
