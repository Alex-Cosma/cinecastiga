import type { MetadataRoute } from "next";

/**
 * Public data pages are crawlable; the ask/drill APIs, auth and the private
 * watchdog areas are not. Entity pages are ~200k, so no sitemap for now —
 * crawlers reach them through /semnale, /cauta and cross-links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/cont", "/anchete", "/login", "/cauta?"],
      },
    ],
  };
}
