import { describe, expect, it } from "vitest";
import { encodeSpec } from "../../lib/ask/permalink";
import { buildPills } from "../../lib/ask/pills";
import { AUTHORITY_CLOUD_SPEC, HOSPITALS_BREAKDOWN_SPEC, ROADS_RANKING_SPEC } from "../../lib/ask/site-links";
import { countyBreakdownSpec } from "../../lib/discovery-links";
import { GHOST_PILL, ghostPillWidth, ghostPills, readAskLink } from "./link-hint";

describe("readAskLink (the server's reading of /intreaba's address)", () => {
  it("opens a runnable link folded on its answer, a drill link with its builder open", () => {
    const hint = readAskLink({ spec: encodeSpec(ROADS_RANKING_SPEC) });
    expect(hint).toMatchObject({ kind: "spec", run: true, drill: false, link: ROADS_RANKING_SPEC });
    expect(readAskLink({ spec: encodeSpec(ROADS_RANKING_SPEC), drill: "1" })).toMatchObject({ kind: "spec", drill: true });
  });
  it("says a broken link's reason from the first paint", () => {
    expect(readAskLink({ spec: "bm90LWpzb24" })).toMatchObject({ kind: "error" });
  });
  it("keeps a question in words for the rules, and nothing for a bare page", () => {
    expect(readAskLink({ q: "Cine vinde laptopuri școlilor din Iași?" })).toEqual({ kind: "text", question: "Cine vinde laptopuri școlilor din Iași?" });
    expect(readAskLink({})).toBeNull();
  });
});

describe("ghostPills (the pills the spec says before the engine answers)", () => {
  it("are the server's pills with a line in place of each name the engine resolves", () => {
    const pills = ghostPills(ROADS_RANKING_SPEC);
    const served = buildPills(ROADS_RANKING_SPEC, { cpv: { query: "drumuri", prefixes: ["45233"], matchedNames: ["Lucrări de drumuri"], notes: [] } } as never);
    expect(pills).toHaveLength(served.length);
    expect(pills.map((p, i) => (p.startsWith(GHOST_PILL) ? served[i] : p))).toEqual(served);
    expect(ghostPillWidth(pills.find((p) => p.startsWith(GHOST_PILL))!)).toBe("52ch");
  });
  it("say every word of a question without names, and a county as a line", () => {
    expect(ghostPills(HOSPITALS_BREAKDOWN_SPEC)).toEqual(buildPills(HOSPITALS_BREAKDOWN_SPEC, {}));
    expect(ghostPills(countyBreakdownSpec("Cluj")).filter((p) => p.startsWith(GHOST_PILL))).toEqual([`${GHOST_PILL}county`]);
  });
  it("draw the cloud's group, counted by the answer, as a line", () => {
    expect(ghostPills(AUTHORITY_CLOUD_SPEC)[0]).toBe(`${GHOST_PILL}dim`);
  });
});
