import { describe, expect, it } from "vitest";
import { plainClick } from "./name-travel";

// UX audit M-14: only a plain click that opens the page in this tab carries the name.
describe("plainClick", () => {
  const base = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  it("is a primary click without keys", () => expect(plainClick(base)).toBe(true));
  it("is not a new tab, a window, a download or a middle click", () => {
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(plainClick({ ...base, [k]: true })).toBe(false);
    expect(plainClick({ ...base, button: 1 })).toBe(false);
    expect(plainClick({ ...base, defaultPrevented: true })).toBe(false);
  });
});
