import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadFile, latestWithRetries, type OnrcDataset } from "./onrc-import.js";

// A local server plays data.gov.ro: each request gets the next behaviour of the list.
type Behaviour = (req: IncomingMessage, res: ServerResponse) => void;
const BODY = "DENUMIRE^CUI\n" + "FIRMA^123\n".repeat(20_000);

const whole: Behaviour = (_req, res) => { res.writeHead(200, { "content-length": Buffer.byteLength(BODY) }); res.end(BODY); };
// "other side closed": the connection drops midway through the body
const cut: Behaviour = (_req, res) => {
  res.writeHead(200, { "content-length": Buffer.byteLength(BODY) });
  res.write(BODY.slice(0, 50_000), () => res.socket?.destroy());
};
const status = (code: number): Behaviour => (_req, res) => { res.writeHead(code); res.end(); };

let server: Server, url: string, dir: string, requests: number, plan: Behaviour[];

beforeEach(async () => {
  requests = 0; plan = [];
  server = createServer((req, res) => { const next = plan[Math.min(requests, plan.length - 1)]!; requests++; next(req, res); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/od_firme.csv`;
  dir = mkdtempSync(join(tmpdir(), "onrc-download-"));
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

const noWait = async () => {};

describe("downloadFile", () => {
  it("starts over after a connection closed midway and keeps the whole file", async () => {
    plan = [cut, whole];
    const dest = join(dir, "firms.csv"), log: string[] = [];
    await downloadFile(url, dest, { sleep: noWait, log: (m) => log.push(m) });
    expect(requests).toBe(2);
    expect(readFileSync(dest, "utf8")).toBe(BODY);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/attempt 1 of 4 failed/);
  });

  it("retries a server error and a busy answer", async () => {
    plan = [status(503), status(429), whole];
    const dest = join(dir, "firms.csv");
    await downloadFile(url, dest, { sleep: noWait });
    expect(requests).toBe(3);
    expect(readFileSync(dest, "utf8")).toBe(BODY);
  });

  it("does not retry a missing file", async () => {
    plan = [status(404), whole];
    const dest = join(dir, "firms.csv");
    await expect(downloadFile(url, dest, { sleep: noWait })).rejects.toThrow(/HTTP 404/);
    expect(requests).toBe(1);
    expect(existsSync(dest)).toBe(false);
  });

  it("gives up after the last attempt and leaves no partial file", async () => {
    plan = [cut];
    const dest = join(dir, "firms.csv");
    await expect(downloadFile(url, dest, { sleep: noWait, attempts: 3 })).rejects.toThrow();
    expect(requests).toBe(3);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it("stops retrying when the next pause would pass the deadline", async () => {
    plan = [status(503), whole];
    const dest = join(dir, "firms.csv");
    await expect(downloadFile(url, dest, { sleep: noWait, timeoutMs: 10_000, backoffMs: () => 20_000 })).rejects.toThrow(/HTTP 503/);
    expect(requests).toBe(1);
  });

  it("keeps an existing file without asking the portal", async () => {
    plan = [whole];
    const dest = join(dir, "firms.csv");
    await downloadFile(url, dest, { sleep: noWait });
    await downloadFile(url, dest, { sleep: noWait });
    expect(requests).toBe(1);
  });
});

describe("latestWithRetries", () => {
  const dataset: OnrcDataset = { name: "firme-04-11-2026", snapshot: "2026-11-04", firmsUrl: "f", repsUrl: "r" };

  it("asks again after a failed lookup", async () => {
    let calls = 0;
    const found = await latestWithRetries(() => {}, 3, noWait, async () => { if (++calls < 3) throw new Error("fetch failed"); return dataset; });
    expect(found).toEqual(dataset);
    expect(calls).toBe(3);
  });

  it("gives up after the third failure", async () => {
    let calls = 0;
    await expect(latestWithRetries(() => {}, 3, noWait, async () => { calls++; throw new Error("fetch failed"); })).rejects.toThrow("fetch failed");
    expect(calls).toBe(3);
  });
});
