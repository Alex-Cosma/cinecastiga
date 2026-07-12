import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@seap/db";
import { resolveEntity } from "../src/normalize/resolve-entity.js";

/**
 * Runs against the local Postgres. Each test does its work inside a transaction
 * that is rolled back, so it leaves no residue in core.entities.
 */
const { db, sql } = createDb();

class Rollback extends Error {}

async function inRolledBackTx(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

afterAll(async () => {
  await sql.end();
});

describe("resolveEntity (integration)", () => {
  it("dedups RO-prefixed and bare CUI to one entity", async () => {
    await inRolledBackTx(async (tx) => {
      const a = await resolveEntity(tx, {
        cuiRaw: "RO21255449",
        nameDisplay: "S.C. INGRID S.R.L.",
        sicapId: 111,
        namespace: "supplier",
      });
      const b = await resolveEntity(tx, {
        cuiRaw: "21255449", // same entity, no RO prefix, different name spelling
        nameDisplay: "INGRID SRL",
        sicapId: 222,
        namespace: "winner",
      });
      expect(b).toBe(a);
    });
  });

  it("re-resolves the same SICAP id to the same entity (tier 1)", async () => {
    await inRolledBackTx(async (tx) => {
      const a = await resolveEntity(tx, {
        cuiRaw: "29074847",
        nameDisplay: "Gradinita PP nr. 4 Lugoj",
        sicapId: 500,
        namespace: "authority",
      });
      const again = await resolveEntity(tx, {
        cuiRaw: null, // no CUI this time — must still hit tier 1
        nameDisplay: "Gradinita PP nr. 4 Lugoj",
        sicapId: 500,
        namespace: "authority",
      });
      expect(again).toBe(a);
    });
  });

  it("does NOT merge a foreign / checksum-invalid id (no false accusation)", async () => {
    await inRolledBackTx(async (tx) => {
      const ro = await resolveEntity(tx, {
        cuiRaw: "21255449",
        nameDisplay: "INGRID SRL",
      });
      const foreign = await resolveEntity(tx, {
        cuiRaw: "DE811569869", // fails RO checksum
        nameDisplay: "FOREIGN GMBH",
      });
      expect(foreign).not.toBe(ro);
    });
  });

  it("keeps two distinct valid CUIs separate", async () => {
    await inRolledBackTx(async (tx) => {
      const a = await resolveEntity(tx, {
        cuiRaw: "21255449",
        nameDisplay: "INGRID SRL",
      });
      const b = await resolveEntity(tx, {
        cuiRaw: "16020748", // URBAN TEAM SRL, different real CUI
        nameDisplay: "URBAN TEAM SRL",
      });
      expect(b).not.toBe(a);
    });
  });
});
