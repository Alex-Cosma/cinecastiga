import { describe, expect, it } from "vitest";
import { splitWords } from "./signal-case-words";
import { splitTotals } from "./signal-mirror";

const group = (year: number, count: number, total: number, ceiling: number, cpv = "4523") => ({ year, count, total, ceiling, cpv_class: cpv, type: "da_ceiling_works" });

describe("the case page of „Adunate, trec de plafon” counts every group (UX audit Z6-21)", () => {
  const all = splitTotals([...Array.from({ length: 47 }, (_, i) => group(2018 + (i % 8), 10, 3_000_000, 1_000_000)),
    ...Array.from({ length: 5 }, () => group(2020, 3, 1_100_000, 1_000_000))]);
  it("sums all the groups, not the page's", () => {
    expect(all).toEqual({ groups: 52, counted: 47, under: 5, recurring: 0, acquisitions: 485, years: { from: "2018", to: "2025" } });
  });
  it("says the title and the split once, each number by the „de” rule", () => {
    const w = splitWords("authority", all, { groups: 47, value: 71_400_000, rawShare: 0.35, points: 60 } as never);
    expect(w.title).toBe("De 47 de ori, aceeași firmă a câștigat în același an mai multe achiziții directe pentru același fel de lucru: luate pe rând sunt sub plafon, adunate îl depășesc.");
    expect(w.lede).toBe("52 de grupuri cu 485 de achiziții, 2018–2025: 47 intră în scor (71,4 mil. lei, 35% din valoarea achizițiilor directe), 5 sunt sub 1,2×.");
  });
  it("says when nothing counts, and a single time", () => {
    const one = splitTotals([group(2021, 3, 1_100_000, 1_000_000)]);
    expect(splitWords("authority", one, undefined)).toEqual({ title: expect.stringMatching(/^O dată, /), lede: "1 grup cu 3 achiziții, 2021. Niciun grup nu trece de 1,2 ori plafonul, așa că tiparul nu adaugă puncte." });
  });
});
