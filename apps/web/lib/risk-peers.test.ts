import { describe, expect, it } from "vitest";
import { riskPeerWords } from "./risk-peers";

describe("the profile's place among similar ones (rf-2026.22, M3/M27)", () => {
  it("says the rank in its group, never a share the profiles without a score inflate", () => {
    expect(riskPeerWords({ rank: 12, n: 719, groupWords: "primăriile cu 2–8 mii de locuitori" }))
      .toBe("Locul 12 din 719 · primăriile cu 2–8 mii de locuitori");
    expect(riskPeerWords({ rank: 1, n: 8188, groupWords: "firmele din domeniul „Servicii de arhitectură”" }))
      .toBe("Locul 1 din 8.188 · firmele din domeniul „Servicii de arhitectură”");
    expect(riskPeerWords({ rank: 3, n: 15594, groupWords: "toate instituțiile publice" }))
      .toBe("Locul 3 din 15.594 · instituțiile publice");
  });
});
