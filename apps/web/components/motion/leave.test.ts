import { describe, expect, it } from "vitest";
import { leaveMs } from "./leave";

// UX audit M-06: one exit for every window (components/motion/windows.css keeps the same numbers).
describe("leaveMs", () => {
  it("is 140 ms for a window and 180 ms for a phone's sheet", () => {
    expect(leaveMs(false, false)).toBe(140);
    expect(leaveMs(true, false)).toBe(180);
  });
  it("is a 90 ms fade with reduced motion, sheet or not", () => {
    expect(leaveMs(false, true)).toBe(90);
    expect(leaveMs(true, true)).toBe(90);
  });
});
