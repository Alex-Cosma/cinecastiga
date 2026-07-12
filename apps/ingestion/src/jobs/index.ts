import type { TaskList } from "graphile-worker";
import { heartbeat } from "./heartbeat.js";
import {
  makeScrapeNoticesTask,
  type ScrapeDeps,
} from "../scrape/elicitatie/notices.js";
import { makeScrapeDasTask } from "../scrape/elicitatie/direct-acquisitions.js";
import { makeDaCorrectionsTask } from "../scrape/elicitatie/da-corrections.js";
import { makeRescanTask } from "../scrape/elicitatie/state-rescan.js";
import { getElicitatieClient } from "../scrape/elicitatie/client.js";
import { getSharedDb } from "../db.js";

/**
 * Deps resolve lazily at job execution — the worker can boot (and run
 * heartbeat) without SCRAPE_UA; scrape jobs fail loud if it's missing.
 */
const lazyDeps: ScrapeDeps = {
  get db() {
    return getSharedDb();
  },
  get client() {
    return getElicitatieClient();
  },
};

export const taskList: TaskList = {
  heartbeat,
  scrape_tenders: makeScrapeNoticesTask(lazyDeps, "tenders"),
  scrape_awards: makeScrapeNoticesTask(lazyDeps, "awards"),
  rescan_notice_states: makeRescanTask(lazyDeps),
  scrape_das: makeScrapeDasTask(lazyDeps),
  refetch_da_corrections: makeDaCorrectionsTask(lazyDeps),
};

/**
 * Schedules in server-local time — run the box on Europe/Bucharest (or
 * adjust) so scrapes fire after the nightly SICAP finalization batch
 * (00:00–02:30 local; DEC-007). ?max=1 prevents overlapping runs.
 */
export const crontab = `
*/10 * * * * heartbeat
30 4 * * * scrape_tenders ?max=1
40 4 * * * scrape_awards ?max=1
0 5 * * * scrape_das ?max=1
0 6 * * 1 rescan_notice_states ?max=1
0 7 * * 2 refetch_da_corrections ?max=1
`.trim();
