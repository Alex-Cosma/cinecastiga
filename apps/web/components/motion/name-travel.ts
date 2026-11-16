/*
 * The name you clicked becomes the page's title (UX audit M-14, owner, 16 November 2026). A plain click on an
 * institution's or a firm's name (EntityName, `a.entity-name`) names that link `ent-name` for the page's view transition
 * (app/template.tsx, components/motion/PageTransition.tsx); when the entity's page comes in, its title (`.ehead h1`) takes
 * the same name, so the browser moves the name from the list into the header (300 ms, --ease) while the rest of the page
 * cross-fades as before. Only forward, by that click: browser Back starts no view transition and clears it; a new tab,
 * a modified click, reduced motion or a browser without view transitions keep today's cross-fade. Nothing waits for it:
 * the navigation goes as fast as before.
 */

export const NAME = "ent-name";

/** Whether a click is a plain one that opens the link in this tab. */
export const plainClick = (event: Pick<MouseEvent, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function watchNameTravel(): () => void {
  const root = document.documentElement;
  let from: HTMLElement | null = null, to: HTMLElement | null = null, timer = 0;
  const clear = () => {
    window.clearTimeout(timer);
    from?.style.removeProperty("view-transition-name");
    to?.style.removeProperty("view-transition-name");
    from = to = null;
    delete root.dataset.vtName;
  };
  const onClick = (event: MouseEvent) => {
    clear();
    if (!plainClick(event) || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a.entity-name");
    if (!link || link.target === "_blank" || !("startViewTransition" in document)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The same page (another role of it) has no page transition: nothing to name.
    const url = new URL(link.href, location.href);
    if (url.pathname === location.pathname) return;
    from = link;
    link.style.setProperty("view-transition-name", NAME);
    root.dataset.vtName = url.pathname;
    // A navigation that never comes (a slow page left, an error) does not keep the name.
    timer = window.setTimeout(clear, 6000);
  };
  // The entity's title as React adds it (before the new picture is taken): it takes the name, once.
  const observer = new MutationObserver((records) => {
    if (!root.dataset.vtName || to) return;
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      const title = node.matches(".ehead h1") ? node : node.querySelector<HTMLElement>(".ehead h1");
      if (!(title instanceof HTMLElement)) continue;
      to = title;
      title.style.setProperty("view-transition-name", NAME);
      // The transition has played by then (300 ms after the new page is drawn); the names are taken off.
      window.clearTimeout(timer);
      timer = window.setTimeout(clear, 900);
      return;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", clear);
  return () => { clear(); observer.disconnect(); document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", clear); };
}
