/**
 * Writes the address without a navigation: a view's state (filters, an open county) or a parameter it drops.
 *
 * Next's router patches history.pushState/replaceState so that a write keeps the entry's router state and the router
 * learns the new address. Back to an entry without that state changes the address and leaves the page as it was. The
 * router installs its patch in its own first effect, which runs after its children's: a page's first write on a hard
 * load reached the browser unpatched and erased that state (/harta opened from a link, then a year of a UAT's panel,
 * then Back). The write waits for the end of that flush (a microtask), so it always goes through the router.
 */
export function writeAddress(url: string, mode: "push" | "replace" = "replace"): void {
  queueMicrotask(() => {
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  });
}
