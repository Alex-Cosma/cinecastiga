import { describe, expect, it } from "vitest";
import { REGISTRY_NAME_STOPWORDS } from "./entity-registry.js";
import {
  REVIEWED_REGISTRY_COLLISIONS,
  REVIEWED_REGISTRY_COLLISION_KEYS,
  reviewedRegistryCollision,
} from "./registry-collisions.js";

// Audit F03, option (b), owner decision of 22 October 2026: exactly these
// reviewed entities (production ids) lose their ONRC/MF join.
const REVIEWED: [string, string][] = [
  ["2095043", "16853659"], ["1997075", "32990305"], ["1966769", "2881845"], ["1974145", "791428"],
  ["2019716", "17305654"], ["2045888", "23902800"], ["2069641", "25021"], ["2078359", "4459783"],
  ["2086362", "31065212"], ["2087278", "43972983"], ["2089039", "55880"], ["2089718", "515"],
  ["2101730", "42030"], ["2106953", "46318"], ["2109901", "11845159"], ["2117585", "6580195"],
  ["1965461", "48591254"], ["1979778", "3975999"], ["1969710", "48467"], ["1973169", "17866800"],
  ["1981066", "17535424"], ["1984575", "10624672"], ["1996167", "83871"], ["2000965", "27537"],
  ["2036369", "25572881"], ["2063301", "14918204"], ["2117785", "34160"], ["1995840", "33504004"],
  ["2221353", "604"], ["2225747", "345280"], ["2071560", "76050"], ["2084211", "28065050"],
  ["2091938", "46342796"], ["2214527", "3217790"], ["2162552", "2477740"], ["2212371", "37263243"],
  ["2208853", "1301478"], ["2208331", "1485885"],
];
// Renames and spellings of the same firm from the top of the class by supplier
// value: they keep ONRC and MF.
const RENAMES = ["2127438", "2074426", "2115495", "2127571", "2126193", "2089605", "2116790"];

/** Mirror of nameTokens in entity-registry.ts (unaccent ≈ NFD without marks). */
function tokens(name: string): string[] {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^[0-9]+$/.test(t) && !REGISTRY_NAME_STOPWORDS.includes(t));
}

describe("REVIEWED_REGISTRY_COLLISIONS", () => {
  it("holds exactly the reviewed entities, each once and with its CUI", () => {
    expect(REVIEWED_REGISTRY_COLLISIONS.map((r) => [r.entityId, r.cui]).sort()).toEqual([...REVIEWED].sort());
    expect(new Set(REVIEWED_REGISTRY_COLLISIONS.map((r) => r.entityId)).size).toBe(REVIEWED.length);
    expect(new Set(REVIEWED_REGISTRY_COLLISIONS.map((r) => r.cui)).size).toBe(REVIEWED.length);
    expect(REVIEWED_REGISTRY_COLLISION_KEYS).toEqual(REVIEWED_REGISTRY_COLLISIONS.map((r) => `${r.entityId}:${r.cui}`));
  });

  it("never lists a renamed firm", () => {
    for (const id of RENAMES) expect(REVIEWED_REGISTRY_COLLISIONS.some((r) => r.entityId === id)).toBe(false);
  });

  it("records names sharing no distinctive token, and the evidence, for every row", () => {
    for (const r of REVIEWED_REGISTRY_COLLISIONS) {
      expect(r.cui).toMatch(/^[1-9][0-9]{0,9}$/);
      expect(r.seapName.trim()).not.toBe("");
      expect(r.onrcName.trim()).not.toBe("");
      expect(r.evidence.length).toBeGreaterThan(20);
      // A natural person registered in ONRC is described, never named.
      if (/natural person/.test(r.onrcName)) continue;
      expect(tokens(r.seapName).filter((t) => tokens(r.onrcName).includes(t))).toEqual([]);
    }
  });

  it("matches only the recorded entity and CUI", () => {
    expect(reviewedRegistryCollision("2095043", "16853659")?.onrcName).toBe("MEGASPEED TRANS SRL");
    expect(reviewedRegistryCollision(2095043, "16853659")).not.toBeNull();
    expect(reviewedRegistryCollision("2095043", "16853650")).toBeNull();
    expect(reviewedRegistryCollision("2095043", null)).toBeNull();
    expect(reviewedRegistryCollision("2115495", "5888716")).toBeNull();
  });
});
