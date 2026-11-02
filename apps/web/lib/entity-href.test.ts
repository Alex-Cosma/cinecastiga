import { describe, expect, it } from "vitest";
import { entityHref } from "./entity-href";

describe("entityHref", () => {
  it("links the entity's page, as the party asked for", () => {
    expect(entityHref("2146547")).toBe("/entitati/2146547");
    expect(entityHref(2146547, "authority")).toBe("/entitati/2146547?rol=autoritate");
    expect(entityHref("1976779", "supplier")).toBe("/entitati/1976779?rol=furnizor");
    expect(entityHref("1976779", null)).toBe("/entitati/1976779");
  });
});
