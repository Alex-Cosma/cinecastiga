import { describe, expect, it } from "vitest";
import { SHORT_CODE, SHORT_CODE_LENGTH, shortLinkCodes, shortLinkTarget } from "./short-links-shared";

describe("short links (owner, 9 November 2026)", () => {
  const ask = "/intreaba?spec=eyJibG9jayI6InRhYmxlIn0%3D";

  it("derives the same 8-character code from the same address, a longer one only after a collision", () => {
    const codes = shortLinkCodes(ask);
    expect(codes[0]).toHaveLength(SHORT_CODE_LENGTH);
    expect(codes.map((c) => c.length)).toEqual([8, 9, 10, 11, 12]);
    expect(codes.every((c, i) => SHORT_CODE.test(c) && (i === 0 || c.startsWith(codes[i - 1]!)))).toBe(true);
    expect(shortLinkCodes(ask)).toEqual(codes);
    expect(shortLinkCodes(`${ask}&drill=1`)[0]).not.toBe(codes[0]);
  });

  it("keeps a public address of the site in one spelling", () => {
    expect(shortLinkTarget(ask)).toBe(ask);
    // The fragment goes; the query is spelled as the browser reads it, so the same question is one link.
    expect(shortLinkTarget(`${ask}#rezultat`)).toBe(ask);
    expect(shortLinkTarget("/intreaba?spec=a%20b&fir=33.331")).toBe("/intreaba?spec=a+b&fir=33.331");
    expect(shortLinkTarget("/entitati/123/comparatii?an=2024")).toBe("/entitati/123/comparatii?an=2024");
    expect(shortLinkTarget("/")).toBe("/");
  });

  it("refuses another host, the private space, the admin, the API and anything malformed", () => {
    for (const raw of ["https://evil.example/intreaba", "//evil.example/intreaba", "/\\evil.example", "intreaba?spec=x",
      "/anchete/1", "/admin", "/cont", "/urmariri", "/api/ask", "/l/abcdefgh", "/intreaba/../admin", "/login", `/intreaba?x=${"a".repeat(5000)}`, 42, null]) {
      expect(shortLinkTarget(raw)).toBeNull();
    }
  });

  it("refuses an address that normalizes to another host (launch audit, 12 November 2026)", () => {
    for (const raw of ["/.//evil.example/x", "/%2e//evil.example", "/intreaba/..//evil.example", "/././/evil.example?spec=a", "/entitati/../..//evil.example"]) {
      expect(shortLinkTarget(raw)).toBeNull();
    }
    // A double slash inside a path of the site stays a path of the site.
    expect(shortLinkTarget("/intreaba//x")).toBe("/intreaba//x");
  });
});
