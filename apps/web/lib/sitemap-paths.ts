import { PRICE_FAMILIES } from "@seap/db";
import { FLAG_ORDER } from "./flags";
import { parseSignalState, signalUrl } from "./signals-shared";

/** The public pages with one fixed address each, the home page first. */
const MAIN_PAGES = [
  "/", "/preturi", "/semnale", "/harta", "/domenii", "/supra-prag", "/intreaba", "/cauta",
  "/metodologie", "/metodologie/excluderi", "/despre", "/date-personale",
];

/** The one pattern whose pages stay out of search engines (app/semnale/[id]/page.tsx): it names a person. */
const UNLISTED_SIGNALS = new Set(["net_shared_admin"]);

/**
 * The addresses the site hands to search engines: the main pages, each product of „Prețuri” and each pattern's list
 * of signals. All of them are known at build time, with no database read. The pages of institutions, firms and
 * records are not listed: crawlers reach them through the links of these pages.
 */
export function sitemapPaths(): string[] {
  const signals = FLAG_ORDER.filter((code) => !UNLISTED_SIGNALS.has(code))
    .map((code) => signalUrl(parseSignalState({ tip: code })));
  return [...MAIN_PAGES, ...PRICE_FAMILIES.map((family) => `/preturi/${family.slug}`), ...signals];
}
