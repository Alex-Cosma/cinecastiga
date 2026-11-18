import { afterEach, describe, expect, it, vi } from "vitest";
import { isPersonToken, openPersonKey, sealPersonKey, sealPersonKeyOrNull } from "./person-token";

const KEY = "popescu ion|1960-01-31|buzau";
const DATE = /\d{4}-\d{2}-\d{2}/;

afterEach(() => vi.unstubAllEnvs());

describe("the token of an ONRC person key", () => {
  it("hides the name and the birth date and opens back to the same key", () => {
    const token = sealPersonKey(KEY);
    expect(isPersonToken(token)).toBe(true);
    expect(token).not.toMatch(DATE);
    expect(token).not.toContain("popescu");
    expect(token).not.toContain("|");
    expect(openPersonKey(token)).toBe(KEY);
  });

  it("is the same for the same key and different for another person", () => {
    expect(sealPersonKey(KEY)).toBe(sealPersonKey(KEY));
    expect(sealPersonKey(KEY)).not.toBe(sealPersonKey("popescu ion|1960-02-01|buzau"));
  });

  it("stays a token when sealed twice, and null stays null", () => {
    const token = sealPersonKey(KEY);
    expect(sealPersonKey(token)).toBe(token);
    expect(sealPersonKeyOrNull(null)).toBeNull();
    expect(sealPersonKeyOrNull(KEY)).toBe(token);
  });

  it("still opens a plain key from a link saved before the tokens, folded as the database keeps it", () => {
    expect(openPersonKey(KEY)).toBe(KEY);
    expect(openPersonKey("popescu-ionescu maria|1980-05-05|braila")).toBe("popescu ionescu maria|1980-05-05|braila");
    expect(isPersonToken(KEY)).toBe(false);
  });

  it("gives a key that matches nobody for a token it cannot open", () => {
    const token = sealPersonKey(KEY);
    const broken = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(openPersonKey(broken)).toBe("");
    expect(openPersonKey("p1." + "A".repeat(60))).toBe("");
  });

  it("fits the 300 characters a spec allows, for the longest key in the register (181 bytes)", () => {
    const longest = `${"a".repeat(120)}|1960-01-31|${"b".repeat(49)}`;
    expect(Buffer.byteLength(longest)).toBe(181);
    expect(sealPersonKey(longest).length).toBeLessThanOrEqual(300);
    expect(openPersonKey(sealPersonKey(longest))).toBe(longest);
  });

  it("keeps Romanian letters in the locality", () => {
    const key = "matei ioan|1957-01-01|sat bătin, ș.a.";
    expect(openPersonKey(sealPersonKey(key))).toBe(key);
  });
});

describe("the secret behind the token", () => {
  const outsideTests = () => vi.stubEnv("NODE_ENV", "development");

  it("is PERSON_KEY_SECRET when set, and a token made with the site secret before that still opens", () => {
    outsideTests();
    vi.stubEnv("PERSON_KEY_SECRET", "");
    vi.stubEnv("PERSON_KEY_SECRET_PREVIOUS", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "site-secret-for-this-test");
    const withSite = sealPersonKey(KEY);
    vi.stubEnv("PERSON_KEY_SECRET", "own-secret-for-this-test");
    const withOwn = sealPersonKey(KEY);
    expect(withOwn).not.toBe(withSite);
    expect(openPersonKey(withOwn)).toBe(KEY);
    expect(openPersonKey(withSite)).toBe(KEY);
  });

  it("opens a token of a rotated secret listed in PERSON_KEY_SECRET_PREVIOUS, and no other", () => {
    outsideTests();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("PERSON_KEY_SECRET_PREVIOUS", "");
    vi.stubEnv("PERSON_KEY_SECRET", "first-secret");
    const old = sealPersonKey(KEY);
    vi.stubEnv("PERSON_KEY_SECRET", "second-secret");
    expect(openPersonKey(old)).toBe("");
    vi.stubEnv("PERSON_KEY_SECRET_PREVIOUS", "another, first-secret");
    expect(openPersonKey(old)).toBe(KEY);
  });

  it("refuses to run in production without any secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PERSON_KEY_SECRET", "");
    vi.stubEnv("PERSON_KEY_SECRET_PREVIOUS", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(() => sealPersonKey(KEY)).toThrow(/PERSON_KEY_SECRET/);
  });
});
