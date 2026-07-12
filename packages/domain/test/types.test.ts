import { describe, expect, it } from "vitest";
import type {
  Award,
  DirectAcquisition,
  Entity,
  Procedure,
  RedFlag,
} from "../src/index.js";

describe("@seap/domain types", () => {
  it("accepts well-formed object literals", () => {
    const entity: Entity = {
      id: "e1",
      cui: "RO12345678",
      canonicalName: "Primăria Cluj-Napoca",
      kind: "authority",
      county: "Cluj",
    };

    const procedure: Procedure = {
      id: "p1",
      source: "elicitatie",
      externalId: "CN1234567",
      noticeType: "tender",
      title: "Achiziție echipamente IT",
      authorityId: entity.id,
      cpvCode: "30200000-1",
      estimatedValueRon: 250_000,
      publishedAt: new Date("2024-03-01"),
    };

    const award: Award = {
      id: "a1",
      procedureId: procedure.id,
      supplierId: "e2",
      valueRon: 240_000,
      bidCount: 1,
      awardedAt: new Date("2024-04-15"),
    };

    const direct: DirectAcquisition = {
      id: "d1",
      source: "elicitatie",
      externalId: "DA9999999",
      authorityId: entity.id,
      supplierId: "e2",
      description: "Hârtie copiator",
      cpvCode: "30197643-5",
      valueRon: 4_999,
      quantity: 100,
      unitRaw: "100 Bucăți",
      concludedAt: new Date("2024-05-01"),
    };

    const flag: RedFlag = {
      id: "f1",
      flagType: "single_bid",
      severity: "elevated",
      entityId: entity.id,
      procedureId: procedure.id,
      sampleSize: 12,
      details: { rate: 0.83 },
      computedAt: new Date(),
    };

    expect(entity.kind).toBe("authority");
    expect(award.bidCount).toBe(1);
    expect(direct.unitRaw).toBe("100 Bucăți");
    expect(flag.sampleSize).toBeGreaterThan(1);
  });
});
