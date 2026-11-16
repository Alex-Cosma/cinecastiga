import { describe, expect, it } from "vitest";
import { awardListNote, awardRowFacts, awardRowTitle } from "./signal-award-rows";

const notice = { title: null, cpvName: "diverse medicamente", ted: ["211771-2022"], contracts: 120 };

describe("a procedure signal's row on its case page (UX audit Z6-06)", () => {
  it("is titled by the notice's title, else the name of its CPV", () => {
    expect(awardRowTitle(notice)).toBe("Diverse medicamente");
    expect(awardRowTitle({ ...notice, title: "Furnizare reactivi" })).toBe("Furnizare reactivi");
    expect(awardRowTitle({ ...notice, cpvName: null })).toBeNull();
  });
  it("says its facts in one line: contracts with a single bid, the first contract's year, the TED notice", () => {
    expect(awardRowFacts("award_single_bid", { confirmed_contract_count: 87, period_source: "first_contract" }, notice, "2020"))
      .toBe("87 de contracte cu o singură ofertă · primul contract în 2020 · TED 211771-2022");
    expect(awardRowFacts("award_single_bid", { contracts: [{}, {}], notice_contracts: "framework" }, { ...notice, ted: ["1-2022", "2-2023"] }, "2021"))
      .toBe("2 contracte cu o singură ofertă · primul contract în 2021 · TED 1-2022 și încă 1 · suma: plafonul acordului-cadru");
    expect(awardRowFacts("award_no_competition", { period_source: "notice_version" }, { ...notice, ted: [], contracts: 3 }, "2019"))
      .toBe("3 contracte · anunț preluat în 2019");
    expect(awardRowFacts("award_calloffs_over_ceiling", { calloffs: 17, value: 430, ceiling: 100, calloffs_repeating_ceiling: 17 }, { ...notice, ted: [] }, "2025"))
      .toBe("17 comenzi, de 4,3 ori plafonul · 17 comenzi au exact suma plafonului, probabil o eroare de completare · primul contract în 2025");
  });
  it("says the pattern once above its rows", () => {
    expect(awardListNote("award_single_bid")).toBe("Fiecare rând: un anunț cu cel puțin un lot cu o singură ofertă raportată în TED. Ordonate după valoare.");
    expect(awardListNote("net_shared_admin")).toBeNull();
  });
});
