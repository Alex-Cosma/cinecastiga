import { describe, expect, it } from "vitest";
import { parseRoleParam } from "./role-param";
import { parseSignalState } from "./signals-shared";
import { parseTopicScope } from "./topic-search/shared";

describe("rol URL value (audit Q3F7)", () => {
  it.each([
    ["furnizor", "supplier"], ["supplier", "supplier"], ["autoritate", "authority"], ["authority", "authority"],
  ] as const)("reads %s as %s", (value, role) => expect(parseRoleParam(value)).toBe(role));

  it.each([undefined, null, "", "Furnizor", "firma", "supplier ", ["furnizor"]])("leaves %j to the caller's default", (value) => {
    expect(parseRoleParam(value)).toBeNull();
  });

  it("opens /semnale?rol=furnizor on firms, as /semnale?rol=supplier", () => {
    for (const rol of ["furnizor", "supplier"]) expect(parseSignalState({ view: "cri", rol }).role).toBe("supplier");
    for (const rol of ["autoritate", "authority", undefined, "x"]) expect(parseSignalState({ view: "cri", rol }).role).toBe("authority");
    // A signal of one side still decides the side (da_dependence is a firm's).
    expect(parseSignalState({ tip: "da_dependence", rol: "autoritate" }).role).toBe("supplier");
  });

  it("keeps the search's role filter for both spellings", () => {
    expect(parseTopicScope(new URLSearchParams({ q: "asfalt", rol: "furnizor" })).role).toBe("supplier");
    expect(parseTopicScope(new URLSearchParams({ q: "asfalt", rol: "authority" })).role).toBe("authority");
    expect(parseTopicScope(new URLSearchParams({ q: "asfalt" })).role).toBe("");
  });
});
