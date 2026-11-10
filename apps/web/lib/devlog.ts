import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Dev-session request log: every ask/drill/suggest request is appended as one
 * NDJSON line so a reviewing session can replay exactly what the user looked
 * at. Off in production; file lives outside the repo (seap-heartbeat sibling).
 * Override with SEAP_DEVLOG=<path> or disable with SEAP_DEVLOG=off.
 */

const LOG =
  process.env.SEAP_DEVLOG ??
  join(homedir(), "Desktop/Personal/code/seap-heartbeat/asklog.ndjson");

export function devlog(kind: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" || LOG === "off") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...payload }) + "\n";
  void appendFile(LOG, line).catch(() => {});
}
