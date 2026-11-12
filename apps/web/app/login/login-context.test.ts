import { describe, expect, it } from "vitest";
import { CODE_VALID_MINUTES, codeDigits, contactHref, loginContext, safeReturnPath } from "./login-context";

describe("login return path", () => {
  it("keeps a path on this site", () => {
    expect(safeReturnPath("/anchete/abc?tab=dovezi")).toBe("/anchete/abc?tab=dovezi");
    expect(safeReturnPath("/cont")).toBe("/cont");
  });
  it.each([null, undefined, "", "anchete", "//evil.test", "/\\evil.test", "https://evil.test/", "/a b", "/a\u0000", "/.//evil.test", "/%2e//evil.test", "/anchete/..//evil.test"])("refuses %j", (next) => {
    expect(safeReturnPath(next)).toBeNull();
  });
});

describe("login context", () => {
  it("names the invitation and the private pages, nothing elsewhere", () => {
    expect(loginContext("/anchete/invitatie/55821f73")).toBe("invitation");
    expect(loginContext("/anchete")).toBe("private");
    expect(loginContext("/anchete/fcc8ee80/dovezi/1")).toBe("private");
    expect(loginContext("/urmariri?view=watches")).toBe("private");
    expect(loginContext("/urmariri/noua?x=1")).toBe("private");
    for (const next of ["/cont", "/intreaba?spec=x", "/ancheteabc", "/", "//anchete", null]) expect(loginContext(next)).toBeNull();
  });
});

describe("e-mailed code", () => {
  it("keeps only six digits, so a pasted code with spaces or words works", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("Cod: 123-456\n")).toBe("123456");
    expect(codeDigits("12345678")).toBe("123456");
    expect(codeDigits("abc")).toBe("");
  });
  it("states the period configured for the codes (lib/auth.ts otpOptions.period, in minutes)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../lib/auth.ts", import.meta.url), "utf8");
    expect(source).toMatch(new RegExp(`period:\\s*${CODE_VALID_MINUTES},`));
  });
});

describe("contact", () => {
  it("opens a message to the project with a subject", () => {
    expect(contactHref()).toBe("mailto:contact@cinecastiga.ro?subject=Acces%20la%20cont");
  });
});
