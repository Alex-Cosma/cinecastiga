import { describe, expect, it, vi } from "vitest";
import { shouldFetchEntityTable } from "./entity-table-fetch";

type Resp = { ok: boolean; rows: string[] };
const page = (n: number) => `/api/entity-partners?id=2144364&rol=autoritate&page=${n}`;

/**
 * Replays useEntityTable's effect: each render with a (url, attempt) pair asks
 * shouldFetchEntityTable; a fetch replaces the response on screen, as the hook does.
 */
function table(initial?: { url: string; data: Resp }) {
  const fetch = vi.fn(async (url: string): Promise<Resp> => ({ ok: true, rows: [url] }));
  let shown: { url: string; data: Resp | null } | null = initial ? { url: initial.url, data: initial.data } : null;
  let attempt = 0;
  const render = async (url: string) => {
    if (shouldFetchEntityTable({ url, attempt, shown, initialData: initial?.data })) shown = { url, data: await fetch(url) };
    return shown;
  };
  return { fetch, render, retry: () => { attempt += 1; } };
}

describe("entity tables with server-rendered first page", () => {
  const initial = { url: page(1), data: { ok: true, rows: ["RER SUD"] } };

  it("shows the server page without a request on first render (also when an effect runs twice)", async () => {
    const t = table(initial);
    expect((await t.render(page(1)))?.data).toBe(initial.data);
    expect((await t.render(page(1)))?.data).toBe(initial.data);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it("fetches after a page change and fetches page 1 again when returning to it", async () => {
    const t = table(initial);
    await t.render(page(1));
    expect((await t.render(page(2)))?.data?.rows).toEqual([page(2)]);
    expect((await t.render(page(1)))?.data?.rows).toEqual([page(1)]);
    expect(t.fetch.mock.calls.map(([url]) => url)).toEqual([page(2), page(1)]);
  });

  it("fetches after a retry, even on the server-rendered page", async () => {
    const t = table(initial);
    await t.render(page(1));
    t.retry();
    await t.render(page(1));
    expect(t.fetch.mock.calls.map(([url]) => url)).toEqual([page(1)]);
  });

  it("fetches normally without server data", async () => {
    const t = table();
    await t.render(page(1));
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not trust server data for a different URL", () => {
    expect(shouldFetchEntityTable({ url: page(2), attempt: 0, shown: { url: page(1), data: initial.data }, initialData: initial.data })).toBe(true);
    expect(shouldFetchEntityTable({ url: page(1), attempt: 0, shown: { url: page(1), data: { ok: true, rows: [] } }, initialData: initial.data })).toBe(true);
  });
});
