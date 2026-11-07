import { afterEach, describe, expect, it, vi } from "vitest";
import { writeAddress } from "./address";

describe("writeAddress", () => {
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => { (globalThis as { window?: unknown }).window = original; });

  it("writes after the current effects flush, so the router's history patch is in place (Back to /harta)", async () => {
    const history = { pushState: vi.fn(), replaceState: vi.fn() };
    (globalThis as { window?: unknown }).window = { history };
    writeAddress("/harta?judet=hunedoara&uat=90066", "push");
    writeAddress("/entitati/2141452");
    // A page's first effect runs before the router's: nothing may reach the browser's history yet.
    expect(history.pushState).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/harta?judet=hunedoara&uat=90066");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/entitati/2141452");
    expect(history.pushState.mock.invocationCallOrder[0]).toBeLessThan(history.replaceState.mock.invocationCallOrder[0]!);
  });
});
