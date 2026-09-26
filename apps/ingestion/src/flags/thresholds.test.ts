import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS } from "@seap/domain";
import { assertCeilingEras } from "./thresholds.js";

const canonical = DA_CEILING_SEED_ROWS.map((r) => ({ key: r.key, valid_from: r.validFrom, valid_to: r.validTo, value_num: r.valueNum }));
const dbReturning = (rows: { key: string; valid_from: string; valid_to: string | null; value_num: string }[]) => (() => Promise.resolve(rows)) as unknown as DbSql;

describe("ceiling-era rebuild guard", () => {
  it("accepts the complete canonical eras", async () => {
    await expect(assertCeilingEras(dbReturning(canonical))).resolves.toBe(6);
  });
  it("rejects the old January 2023 increase before derived-data rebuilds", async () => {
    const old = canonical.map((r) => ({ ...r,
      valid_from: r.valid_from === "2022-09-10" ? "2023-01-01" : r.valid_from,
      valid_to: r.valid_to === "2022-09-10" ? "2023-01-01" : r.valid_to,
    }));
    await expect(assertCeilingEras(dbReturning(old))).rejects.toThrow("seed-thresholds");
  });
  it("rejects missing, overlapping and wrong-value eras", async () => {
    await expect(assertCeilingEras(dbReturning(canonical.slice(0, 2)))).rejects.toThrow("outdated");
    await expect(assertCeilingEras(dbReturning([...canonical, canonical[0]!]))).rejects.toThrow("outdated");
    await expect(assertCeilingEras(dbReturning(canonical.map((r, i) => i ? r : { ...r, value_num: "135060" })))).rejects.toThrow("outdated");
  });
});
