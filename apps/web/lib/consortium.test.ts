import { describe, expect, it } from "vitest";
import {
  consortiumExplanation, consortiumFraction, consortiumMembersLabel, consortiumPhrase,
  consortiumRankingNote, consortiumShareLabel, isConsortium,
} from "./consortium";
import { roCount } from "./ro-count";

describe("consortium share labels", () => {
  it("labels the Buzău contract 108758 share as a third of the whole amount", () => {
    // contract 607956: 381.909.792,16 lei, 3 winners, 127.303.264,05/,06 lei each
    expect(consortiumShareLabel(3, "381.909.792 lei")).toBe("⅓ din 381.909.792 lei · consorțiu de 3");
  });
  it("uses exact fractions only for small consortia", () => {
    expect(consortiumFraction(2)).toBe("½");
    expect(consortiumFraction(4)).toBe("¼");
    expect(consortiumFraction(6)).toBe("⅙");
    expect(consortiumFraction(7)).toBeNull();
    expect(consortiumShareLabel(8, "1.000 lei")).toBe("parte egală din 1.000 lei · consorțiu de 8");
  });
  it("says nothing for a single winner and still explains a share without the full amount", () => {
    expect(consortiumShareLabel(1, "1.000 lei")).toBeNull();
    expect(consortiumShareLabel(null, "1.000 lei")).toBeNull();
    expect(consortiumShareLabel(3, null)).toBe("⅓ din contract · consorțiu de 3");
    expect(consortiumShareLabel(9, null)).toBe("parte egală din contract · consorțiu de 9");
    expect(isConsortium(2)).toBe(true);
    expect(isConsortium(1.5)).toBe(false);
  });
  it("names the other members without inventing missing ones", () => {
    expect(consortiumMembersLabel(["CONCELEX", "Concelex Engineering S.R.L"], 3)).toBe("cu CONCELEX și Concelex Engineering S.R.L");
    expect(consortiumMembersLabel(["BOG'ART S.R.L."], 2)).toBe("cu BOG'ART S.R.L.");
    expect(consortiumMembersLabel(["A", "B", "C", "D"], 5)).toBe("cu A, B și încă 2 membri");
    expect(consortiumMembersLabel(["A"], 3)).toBe("cu A și încă un membru");
    expect(consortiumMembersLabel(["A", "B"], 22)).toBe("cu A, B și încă 19 membri");
    expect(consortiumMembersLabel(["A", "B"], 23)).toBe("cu A, B și încă 20 de membri");
    expect(consortiumMembersLabel([], 3)).toBeNull();
    expect(consortiumMembersLabel(["A"], 1)).toBeNull();
    expect(consortiumPhrase(["A"], 2)).toBe("consorțiu cu A");
    expect(consortiumPhrase([], 2)).toBe("contract în consorțiu");
  });
  it("explains that the amount was not awarded several times", () => {
    expect(consortiumExplanation(3)).toContain("nu a fost atribuită de 3 ori");
    expect(consortiumExplanation(3)).toContain("împărțim valoarea egal");
    expect(consortiumRankingNote(1)).toContain("dintr-un contract în consorțiu");
    expect(consortiumRankingNote(2)).toContain("din 2 contracte în consorțiu");
    expect(consortiumRankingNote(30)).toContain("din 30 de contracte în consorțiu");
  });
});

describe("Romanian counted nouns", () => {
  it("adds “de” from 20 and for whole hundreds, never for 1–19 or 101–119", () => {
    expect(roCount(1, "un contract", "contracte")).toBe("un contract");
    expect(roCount(2, "un contract", "contracte")).toBe("2 contracte");
    expect(roCount(19, "un contract", "contracte")).toBe("19 contracte");
    expect(roCount(20, "un contract", "contracte")).toBe("20 de contracte");
    expect(roCount(100, "un contract", "contracte")).toBe("100 de contracte");
    expect(roCount(105, "un contract", "contracte")).toBe("105 contracte");
    expect(roCount(782, "o achiziție directă", "achiziții directe")).toBe("782 de achiziții directe");
    expect(roCount(1200, "un contract", "contracte")).toBe("1.200 de contracte");
    expect(roCount(0, "un contract", "contracte")).toBe("0 contracte");
  });
});
