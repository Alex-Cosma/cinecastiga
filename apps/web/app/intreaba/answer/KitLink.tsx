import { countWords } from "../../../lib/ask/answer-text";
import type { KitLink as Link } from "../builder/kit-types";

/*
 * A link of the answer drawn by its destination (R8): an <a> for a page of
 * the site, a <button> for the records drawer or another answer. The arrow is
 * decoration; the words say where it leads.
 */
export default function KitLink({ link, className }: { link: Link; className: string }) {
  const classes = `${className}${link.className ? ` ${link.className}` : ""}`;
  const glyph = link.glyph && <span className="fk-glyph" aria-hidden="true">{link.glyph}</span>;
  if (link.href) return <a className={classes} href={link.href}>{link.label}{glyph}</a>;
  return <button type="button" className={classes} onClick={link.onClick}>{link.label}{glyph}</button>;
}

/** "1 înregistrare", "14 înregistrări", "124 de înregistrări" (kit §4: numerals take "de" from 20). */
export const recordsWords = (count: number) => countWords(count, "înregistrare", "înregistrări");
