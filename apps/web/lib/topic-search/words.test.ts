import { describe, expect, it } from "vitest";
import { weakSubject } from "./words";

const catalog = (typed: string, cpvName: string) => ({ source: "catalog" as const, matched: { text: typed }, cpvName, label: cpvName }) as Parameters<typeof weakSubject>[0];

describe("weak catalogue reading (search probe, 12 November 2026)", () => {
  it("accepts a typed word whose inflection is in the label, in both directions", () => {
    expect(weakSubject(catalog("gunoi", "Servicii de colectare a gunoiului"))).toBe(false);
    expect(weakSubject(catalog("pacienti", "Servicii de transport al pacienţilor"))).toBe(false);
    expect(weakSubject(catalog("medicamentele", "Medicamente diverse"))).toBe(false);
    expect(weakSubject(catalog("iluminat", "Iluminat public"))).toBe(false);
  });

  it("still calls a fragment of a word weak: the person is more likely typing a name", () => {
    expect(weakSubject(catalog("construct", "Construcţie de canale"))).toBe(true);
    expect(weakSubject(catalog("psih", "Servicii de psihiatrie sau psihologie"))).toBe(true);
  });

  it("never calls a curated synonym or a typed CPV code weak", () => {
    expect(weakSubject({ ...catalog("gunoi", "Servicii de colectare a gunoiului"), source: "synonym" } as Parameters<typeof weakSubject>[0])).toBe(false);
    expect(weakSubject(catalog("45233140-2", "Lucrări de drumuri"))).toBe(false);
  });
});
