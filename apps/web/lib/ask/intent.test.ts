import { describe, expect, it } from "vitest";
import { fold, score, parseIntents } from "./intent";

describe("fold", () => {
  it("strips diacritics of both orthographies", () => {
    expect(fold("Până")).toBe("pana");
    expect(fold("pînă")).toBe("pina");
    expect(fold("BRĂEŞTI")).toBe("braesti");
  });
});

describe("score", () => {
  it("ranks exact > prefix > word-prefix > contains", () => {
    const exact = score("cluj", "Cluj");
    const prefix = score("clu", "Cluj-Napoca");
    const wordPrefix = score("napo", "Cluj-Napoca");
    const contains = score("apoca", "Cluj-Napoca");
    expect(exact).toBe(1);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(0);
  });

  it("gives short words no typo budget (Cluj vs Gorj)", () => {
    expect(score("cluj", "Gorj")).toBe(0);
  });

  it("tolerates a typo in longer words", () => {
    expect(score("asfaltre", "asfaltare")).toBeGreaterThan(0.5);
  });

  it("matches a typo'd prefix of a long name", () => {
    expect(score("nucler", "Nuclearelectrica")).toBeGreaterThan(0.5);
  });

  it("requires all tokens of a multiword query", () => {
    expect(score("lemne foc", "Lemn de foc și brichete")).toBe(0);
    expect(score("lemne foc", "lemne de foc")).toBeGreaterThan(0.6);
  });
});

describe("parseIntents", () => {
  it("parses ranking phrases including number words", () => {
    expect(parseIntents("primele 8").topN).toMatchObject({ n: 8 });
    expect(parseIntents("top5").topN).toMatchObject({ n: 5 });
    expect(parseIntents("primele").topN).toMatchObject({ n: null });
    expect(parseIntents("primele cinci").topN).toMatchObject({ n: 5 });
    expect(parseIntents("primele 200").topN).toMatchObject({ n: 50, over: true });
    expect(parseIntents("8").topN).toMatchObject({ n: 8, bare: true });
    expect(parseIntents("2019").topN).toBeUndefined();
  });

  it("parses year phrases in both orthographies", () => {
    expect(parseIntents("din 2019").yearFrom).toMatchObject({ digits: "2019" });
    expect(parseIntents("până în 20").yearTo).toMatchObject({ digits: "20" });
    expect(parseIntents("pînă în 2024").yearTo).toMatchObject({ digits: "2024" });
    expect(parseIntents("în 2023").yearExact).toMatchObject({ year: 2023 });
    expect(parseIntents("anul trecut").yearExact).toMatchObject({ year: 2025 });
    expect(parseIntents("ultimii 3 ani").yearRange).toMatchObject({ from: 2023, to: 2026 });
  });

  it("flags risk and per-capita phrasing", () => {
    expect(parseIntents("cele mai riscante").risk).toBe(true);
    expect(parseIntents("pe cap de locuitor").perCapita).toBe(true);
  });

  it("strips announcing connectors", () => {
    expect(parseIntents("cu furnizori").stripped.dim).toBe("furnizori");
    expect(parseIntents("doar comune").stripped.kind).toBe("comune");
    expect(parseIntents("județul Cluj").stripped.county).toBe("Cluj");
    expect(parseIntents("din Brăești").stripped.place).toBe("Brăești");
  });

  it("marks control phrases consumed (CPV fallback suppression)", () => {
    expect(parseIntents("primele 5").consumed).toBe(true);
    expect(parseIntents("lemne de foc").consumed).toBe(false);
  });

  it("parses supplier-size (employees) phrases", () => {
    expect(parseIntents("sub 5 angajați").employees).toMatchObject({ max: 4 });
    expect(parseIntents("cel mult 10 angajati").employees).toMatchObject({ max: 10 });
    expect(parseIntents("peste 100 angajați").employees).toMatchObject({ min: 101 });
    expect(parseIntents("cel putin 50 angajati").employees).toMatchObject({ min: 50 });
    expect(parseIntents("fără angajați").employees).toMatchObject({ max: 0 });
    expect(parseIntents("sub 5 anga").employees).toMatchObject({ partial: true });
    expect(parseIntents("fara anga").employees).toMatchObject({ partial: true });
    expect(parseIntents("sub prag").employees).toBeUndefined();
  });
});
