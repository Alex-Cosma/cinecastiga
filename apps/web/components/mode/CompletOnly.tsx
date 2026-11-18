import type { ReactNode } from "react";

/**
 * A page (or a state of one) that belongs to Complet (lib/view-mode.ts). Links to it are hidden in Esențial; a reader
 * who opens it anyway, from a link they were sent, sees it whole, with one line saying where it belongs (owner,
 * 18 November 2026). Wrap the page's content in it. `when={false}` leaves the content as it is (a page where only one
 * state belongs to Complet).
 */
export default function CompletOnly({ children, when = true }: { children: ReactNode; when?: boolean }) {
  if (!when) return <>{children}</>;
  return <div data-whole="">
    <CompletLine />
    {children}
  </div>;
}

/**
 * The line alone, for a page whose root cannot be wrapped (a client panel that keeps its state between answers, a lane
 * of the guide): the caller puts `data-whole` on its own root and this line first inside it.
 */
export function CompletLine({ className }: { className?: string }) {
  return <p className={`mode-line${className ? ` ${className}` : ""}`} data-only="esential">Pagina aceasta ține de modul <b>Complet</b>: o vezi întreagă.</p>;
}
