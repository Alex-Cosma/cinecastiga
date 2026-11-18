/**
 * The two ways to see the site (owner, 18 November 2026). „Esențial” shows only what answers a page's question;
 * „Complet” is the whole site. A new reader starts in Esențial; the choice is made at the end of the welcome tour or
 * from the header switch, and is kept in this browser. The server always sends the whole page: the mode is a mark on
 * <html> (data-mode) and CSS hides what does not belong to it, so a shared link, the cache and a crawler see one page.
 *
 * Marking, in any component:
 *   data-only="complet"   the element exists only in Complet
 *   data-only="esential"  the element exists only in Esențial (the short form of something Complet says at length)
 *   data-whole            nothing inside is hidden in Esențial: a page that belongs to Complet, opened from a link
 */
export type ViewMode = "esential" | "complet";

export const VIEW_MODE_KEY = "cc-mode";
/** Set once a signed-in reader was moved to Complet on this device (they came to investigate). */
export const VIEW_MODE_SIGNED_KEY = "cc-mode-signed";
export const VIEW_MODE_EVENT = "cc:mode";
export const DEFAULT_VIEW_MODE: ViewMode = "esential";
export const VIEW_MODE_LABEL: Record<ViewMode, string> = { esential: "Esențial", complet: "Complet" };

/** What a stored value means; anything else is "not chosen yet". */
export function parseViewMode(value: string | null | undefined): ViewMode | null {
  return value === "esential" || value === "complet" ? value : null;
}

/**
 * Runs before the first paint (layout.tsx): the chosen mode, or the default, is stamped on <html>. Without scripts the
 * mark is missing and the page is whole.
 */
export const viewModeScript = `try{var m=localStorage.getItem(${JSON.stringify(VIEW_MODE_KEY)});document.documentElement.setAttribute("data-mode",m==="complet"?"complet":${JSON.stringify(DEFAULT_VIEW_MODE)})}catch(e){document.documentElement.setAttribute("data-mode",${JSON.stringify(DEFAULT_VIEW_MODE)})}`;
