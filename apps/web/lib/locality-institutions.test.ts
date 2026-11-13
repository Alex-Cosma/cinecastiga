import { describe, expect, it } from "vitest";
import { displayName } from "./locality-institutions";

describe("a locality's institutions", () => {
  it("writes an all-capitals list name in sentence case, keeping the connectors small", () => {
    expect(displayName("LICEUL TEHNOLOGIC CISNĂDIE")).toBe("Liceul Tehnologic Cisnădie");
    expect(displayName("CASA DE CULTURA A ORASULUI CISNADIE")).toBe("Casa de Cultura a Orasului Cisnadie");
    expect(displayName("Spitalul Orășenesc Cisnădie")).toBe("Spitalul Orășenesc Cisnădie");
  });
});
