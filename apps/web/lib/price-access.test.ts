import { describe, expect, it, vi } from "vitest";
import { decidePriceAccess } from "./price-access-core";

describe("unit prices: administrators only", () => {
  it("refuses a visit without a session cookie and looks nothing up", async () => {
    const lookup = vi.fn(async () => ({ user: { role: "admin" } }));
    expect(await decidePriceAccess(false, lookup)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("opens only for a session whose role is admin", async () => {
    expect(await decidePriceAccess(true, async () => ({ user: { role: "admin" } }))).toBe(true);
    expect(await decidePriceAccess(true, async () => ({ user: { role: "watchdog" } }))).toBe(false);
    expect(await decidePriceAccess(true, async () => ({ user: {} }))).toBe(false);
    expect(await decidePriceAccess(true, async () => ({ user: { role: null } }))).toBe(false);
  });

  it("refuses a cookie with no session behind it (expired, forged)", async () => {
    expect(await decidePriceAccess(true, async () => null)).toBe(false);
    expect(await decidePriceAccess(true, async () => undefined)).toBe(false);
  });

  it("refuses when the session cannot be read", async () => {
    expect(await decidePriceAccess(true, async () => { throw new Error("database down"); })).toBe(false);
  });
});
