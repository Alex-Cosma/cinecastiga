import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";
import { sitemapPaths } from "@/lib/sitemap-paths";

/**
 * /sitemap.xml: the addresses of lib/sitemap-paths.ts on the public origin. No dates: the pages change with the data.
 * Next writes each address into the XML as it is, so the "&" of a query string is escaped here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({ url: `${SITE_ORIGIN}${path}`.replaceAll("&", "&amp;") }));
}
