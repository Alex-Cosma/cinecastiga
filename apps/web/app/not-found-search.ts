/*
 * The 404 pages offer a search for what the address asked for (critique 7 November 2026): the words of its last
 * segment, as /cauta reads them (2 to 150 characters, lib/topic-search/shared.ts). Pure, for the pages and their tests.
 */

const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/** "/achizitii/lucrari-de-drumuri" → "lucrari de drumuri"; null when nothing searchable is left. */
export function searchWords(pathname: string): string | null {
  const last = pathname.split(/[?#]/)[0]!.split("/").filter(Boolean).pop() ?? "";
  const words = decode(last).replace(/[-_+.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150).trim();
  return words.length >= 2 ? words : null;
}

/** The search page for those words; the plain search page when there are none. `tab` narrows it (e.g. "entities"). */
export function searchHref(words: string | null, tab?: "entities"): string {
  const params = new URLSearchParams();
  if (words) params.set("q", words);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return query ? `/cauta?${query}` : "/cauta";
}
