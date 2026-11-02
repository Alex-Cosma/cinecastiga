import { describe, expect, it } from "vitest";
import { riskPeerWords } from "./risk-peers";

describe("the profile's place among similar ones", () => {
  it("says 'toate' when every other member is lower and never rounds a share up to 100%", () => {
    expect(riskPeerWords({ share: 1, all: true, n: 44, groupWords: "primăriile cu 131–526 mii de locuitori" }))
      .toBe("Scor peste toate primăriile cu 131–526 mii de locuitori");
    expect(riskPeerWords({ share: 0.997, all: false, n: 72_000, groupWords: "toate firmele" }))
      .toBe("Scor peste 99% dintre firmele");
    expect(riskPeerWords({ share: 0.5, all: false, n: 38, groupWords: "primăriile cu 32–126 mii de locuitori" }))
      .toBe("Scor peste 50% dintre primăriile cu 32–126 mii de locuitori");
  });
});
