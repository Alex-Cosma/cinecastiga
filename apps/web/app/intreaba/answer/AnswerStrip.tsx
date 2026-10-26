import type { ReactNode } from "react";
import HelpTip from "../builder/HelpTip";
import type { KitTip } from "../builder/kit-types";

/*
 * Component 14, the strip beside the answer (P6): what applies at once and
 * has numbers from the answer, or changes only the display. The same key as
 * the sentence's may sit here (R2: mirrored; the caller hides it while the
 * builder is open). "Vizual | Tabel" is always last (StripEnd). Each control
 * keeps its own Tab stop and arrow keys, so the strip is a named group, not a
 * toolbar with its own arrow navigation. The rows variant (scatter: "Primele
 * după", "Semnal") puts each control on a labelled line. The strip is the
 * anchor of its (?) (.qb-tipwrap): a tip opens above it, on its width (S4
 * tests: „Ponderile” and „Doar clienții comuni” opened at the page's top).
 */

export default function AnswerStrip({ label = "Ajustează răspunsul", rows = false, children }: { label?: string; rows?: boolean; children: ReactNode }) {
  return <div className={`qb-strip${rows ? " qb-strip--rows" : ""} qb-tipwrap`} role="group" aria-label={label}>{children}</div>;
}

/** A labelled line of the rows strip: the label (with its (?)) above the control on phones. */
export function StripRow({ label, tip, children }: { label: string; tip?: KitTip; children: ReactNode }) {
  return <div className="qb-strip-row">
    <span className="qb-strip-label">{label}{tip && <HelpTip tip={tip} />}</span>
    {children}
  </div>;
}

/**
 * A control with short words around it ("Arată [6 · 10 · 15] firme"). A label
 * that would squeeze the control on a phone ("Împarte") is kept for screen
 * readers only there (`smHide`). A control whose options carry a number keeps
 * the whole width there, its words under it (`wide`).
 */
export function StripLabelled({ before, after, smHide = false, wide = false, children }: { before?: string; after?: string; smHide?: boolean; wide?: boolean; children: ReactNode }) {
  return <span className={`qb-row${wide ? " qb-row--wide" : ""}`}>
    {before && <span className={`qb-strip-label${smHide ? " qb-strip-label--sm-hide" : ""}`}>{before}</span>}
    {children}
    {after && <span className="qb-strip-label">{after}</span>}
  </span>;
}

/** The end of the strip: "Vizual | Tabel". */
export function StripEnd({ children }: { children: ReactNode }) {
  return <span className="qb-strip-end">{children}</span>;
}

/** The suggestion to go down a level: "99,9% e Construcții · Detaliază ›" (R8: › is another answer), a link where the level has its own address. */
export function Suggest({ text, action = "Detaliază", onClick, href }: { text: string; action?: string; onClick?: () => void; href?: string }) {
  const inner = <>{text}<span aria-hidden="true">·</span><b>{action}<span className="qb-glyph" aria-hidden="true">›</span></b></>;
  return href ? <a className="qb-suggest" href={href}>{inner}</a> : <button type="button" className="qb-suggest" onClick={onClick}>{inner}</button>;
}

/** The thread of a drill-down ("Domenii: toate › Construcții"): each step goes back; the current one is text. */
export function Crumbs({ label, items, current }: { label: string; items: readonly { label: string; onClick?: () => void; href?: string }[]; current: string }) {
  return <nav className="qb-crumbs" aria-label={label}>
    <span>{label}:</span>
    {items.map((item, index) => <span className="qb-crumb" key={`${index}:${item.label}`}>
      {item.href ? <a href={item.href}>{item.label}</a> : <button type="button" onClick={item.onClick}>{item.label}</button>}
      <span aria-hidden="true">›</span>
    </span>)}
    <b aria-current="location">{current}</b>
  </nav>;
}
