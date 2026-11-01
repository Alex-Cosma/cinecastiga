import { describe, expect, it } from "vitest";
import { entityRiskDrift } from "./anchete";

// rf-2026.18: a dossier's entity is compared on its risk score; a clip saved on the old index is not a change.
describe("an entity clip's risk against today's", () => {
  const live = { score: 73, nFlags: 2, flags: ["da_split", "da_round"] };
  it("reports the score and the patterns when both sides have a score", () => {
    expect(entityRiskDrift({ score: 73, nFlags: 2 }, live)).toEqual({ drift: [], methodologyChanged: false });
    expect(entityRiskDrift({ score: 60, nFlags: 1 }, live)).toEqual({ drift: ["riscul", "tiparele"], methodologyChanged: false });
    expect(entityRiskDrift({ score: 60, nFlags: 2 }, live)).toEqual({ drift: ["riscul"], methodologyChanged: false });
  });
  it("says the methodology changed for a snapshot of the old index (a clip's number, a capture's text)", () => {
    expect(entityRiskDrift({ cri: 0.6, nFlags: 3, flags: ["da_split"] }, live)).toEqual({ drift: [], methodologyChanged: true });
    expect(entityRiskDrift({ cri: "0.6000", nFlags: 3, riskProfiles: [] }, live)).toEqual({ drift: [], methodologyChanged: true });
    expect(entityRiskDrift({ cri: null, nFlags: 0 }, live)).toEqual({ drift: [], methodologyChanged: true });
  });
  it("compares nothing when either side has no profile", () => {
    expect(entityRiskDrift({ name: "Comuna X", roles: {} }, live)).toEqual({ drift: [], methodologyChanged: false });
    expect(entityRiskDrift({ score: 40, nFlags: 1 }, { score: null, nFlags: 0 })).toEqual({ drift: [], methodologyChanged: false });
    expect(entityRiskDrift({ cri: 0.2, nFlags: 1 }, { score: null, nFlags: 0 })).toEqual({ drift: [], methodologyChanged: false });
  });
});
