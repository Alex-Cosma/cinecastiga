import { describe, expect, it } from "vitest";
import { isWorkspaceId, permits } from "./investigation-access";
import { normalizeInviteEmail, parseEntry } from "./investigation-workspace";

describe("editorial workspace input and permissions", () => {
  it("keeps owner-only access management and viewer read-only", () => {
    expect(["read", "edit", "manage"].map(p => permits("owner", p as "read"))).toEqual([true, true, true]);
    expect(["read", "edit", "manage"].map(p => permits("editor", p as "read"))).toEqual([true, true, false]);
    expect(["read", "edit", "manage"].map(p => permits("viewer", p as "read"))).toEqual([true, false, false]);
    expect(permits(null, "read")).toBe(false);
  });
  it("rejects malformed identifiers, dates, kinds and oversized input", () => {
    const entry = { kind: "event", title: "A source date", body: "", status: "open", occurredOn: "2024-02-29" };
    expect(parseEntry(entry).occurredOn).toBe("2024-02-29");
    for (const occurredOn of ["2025-02-29", "2025-13-01", "2025-01-00", "", "2025-01-01T00:00:00Z"]) expect(() => parseEntry({ ...entry, occurredOn })).toThrow();
    expect(() => parseEntry({ ...entry, kind: "admin" })).toThrow();
    expect(() => parseEntry({ ...entry, body: "x".repeat(12001) })).toThrow();
    expect(isWorkspaceId("1; select 1")).toBe(false);
    expect(isWorkspaceId("00000000-0000-4000-8000-000000000001")).toBe(true);
  });
  it("normalizes only email identity and rejects malformed invitation email", () => {
    expect(normalizeInviteEmail("  Editor@Example.Test ")).toBe("editor@example.test");
    expect(() => normalizeInviteEmail("Editor <editor@example.test>")).toThrow();
    expect(() => normalizeInviteEmail("editor@example.test\nother@example.test")).toThrow();
  });
});
