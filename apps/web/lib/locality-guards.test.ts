import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { createMonitoringWatch } from "./monitoring";
import { queueCapture } from "./evidence-captures";
import type { CaptureRequest } from "./evidence-captures-shared";

/**
 * New watches and new evidence captures follow the builder's and /api/ask's
 * locality rule (localityScopeError): a locality on a view that cannot honour
 * it is refused before any database work. Existing ones re-run unchanged.
 */
const unreachable = () => { throw new Error("the database must not be reached"); };
const noDatabase = new Proxy(function sql() {}, { apply: unreachable, get: unreachable }) as unknown as DbSql;
const locality = { uatSiruta: 44818, uatName: "Municipiul Buzău (Buzău)" };

describe("locality rule on new watches and captures", () => {
  it("refuses a new watch on a map scoped to a locality, with the builder's message", async () => {
    await expect(createMonitoringWatch("user-1", { spec: { block: "map", measure: "value", filters: locality }, title: "Hartă" }, noDatabase))
      .rejects.toThrow(/Harta arată județele.*Elimină localitatea „Municipiul Buzău \(Buzău\)”/);
  });
  it("refuses a new capture of a risk profile scoped to a locality", async () => {
    const request: CaptureRequest = { kind: "query", refId: null, spec: { block: "scatter", dim: "authority", measure: "value", filters: locality }, options: {} };
    await expect(queueCapture(noDatabase, "user-1", "inv-1", "clip-1", request)).rejects.toThrow(/Indicele de risc compară instituții/);
  });
  it("lets a supported locality through to the usual checks (the database is reached)", async () => {
    const request: CaptureRequest = { kind: "query", refId: null, spec: { block: "stat", measure: "value", filters: locality }, options: {} };
    await expect(queueCapture(noDatabase, "user-1", "inv-1", "clip-1", request)).rejects.toThrow(/database must not be reached/);
  });
});
