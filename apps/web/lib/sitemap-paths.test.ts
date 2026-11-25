import { describe, expect, it } from "vitest";
import { PRICE_FAMILIES } from "@seap/db";
import { sitemapPaths } from "./sitemap-paths";

describe("sitemapPaths", () => {
  const paths = sitemapPaths();

  it("starts with the home page and lists every address once", () => {
    expect(paths[0]).toBe("/");
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith("/"), path).toBe(true);
  });

  it("lists every product of the prices pages", () => {
    for (const family of PRICE_FAMILIES) expect(paths).toContain(`/preturi/${family.slug}`);
  });

  it("lists the patterns' signal lists, without the one that names a person", () => {
    expect(paths).toContain("/semnale?tip=award_single_bid&rol=authority");
    expect(paths.some((path) => path.includes("net_shared_admin"))).toBe(false);
  });

  it("keeps out what robots.txt closes and the private areas", () => {
    for (const path of paths) expect(path, path).not.toMatch(/^\/(api|admin|cont|anchete|login|urmariri)(\/|$)|^\/cauta\?/);
  });
});
