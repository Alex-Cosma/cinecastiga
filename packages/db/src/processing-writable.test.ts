import { describe, expect, it } from "vitest";
import { processingWritable } from "./processing.js";

describe("processingWritable (blue/green, owner 9 November 2026)", () => {
  it("in place: only behind maintenance with collection paused, as before", () => {
    expect(processingWritable({ mode: "in-place", maintenance: true, paused: true })).toBe(true);
    expect(processingWritable({ mode: "in-place", maintenance: false, paused: true })).toBe(false);
    expect(processingWritable({ mode: "in-place", maintenance: true, paused: false })).toBe(false);
    // A row read before migration 0099 has no mode: in place.
    expect(processingWritable({ maintenance: true, paused: true })).toBe(true);
    expect(processingWritable({ maintenance: false, paused: true })).toBe(false);
  });

  it("shadow build: the site stays open, collection still paused", () => {
    expect(processingWritable({ mode: "shadow", maintenance: false, paused: true })).toBe(true);
    expect(processingWritable({ mode: "shadow", maintenance: true, paused: true })).toBe(true);
    expect(processingWritable({ mode: "shadow", maintenance: false, paused: false })).toBe(false);
  });
});
