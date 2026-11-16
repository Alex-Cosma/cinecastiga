import { describe, expect, it } from "vitest";
import { softName } from "./soft-name";

describe("softName (UX audit Z4-27)", () => {
  it("writes an all-capitals name in ordinary capitals, small words small", () => {
    expect(softName("ASOCIATIA DE DEZVOLTARE INTERCOMUNITARA PENTRU APA")).toBe("Asociatia de Dezvoltare Intercomunitara pentru Apa");
    expect(softName("SPITALUL CLINIC JUDEȚEAN DE URGENȚĂ SIBIU")).toBe("Spitalul Clinic Județean de Urgență Sibiu");
  });
  it("keeps a name that has small letters, and a short acronym", () => {
    expect(softName("Orasul Cisnadie")).toBe("Orasul Cisnadie");
    expect(softName("CJ")).toBe("CJ");
  });
});
