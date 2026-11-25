import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * Public data pages are crawlable; the ask/drill APIs, auth and the private
 * watchdog areas are not. The sitemap lists the main pages, the products of
 * „Prețuri” and the lists of signals (lib/sitemap-paths.ts); entity pages are
 * ~200k and are reached through /semnale, /cauta and cross-links.
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
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
