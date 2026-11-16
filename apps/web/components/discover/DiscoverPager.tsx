import type { ComponentType, ReactNode } from "react";
import { countWords } from "@/lib/ask/answer-text";
import { formatInt } from "@/lib/format";
import { pagerRange, pagerSlots } from "./pager-slots";
import "./discover-pager.css";

/*
 * One pager for the „Descoperă” pages (owner, 16 November 2026, UX audit Z6-14): the one of /semnale everywhere — „1–10
 * din 4.032.082 rezultate” on the left, ‹ 1 2 … 403.209 › on the right (under the count on a phone, 44 px targets),
 * the last page one click away. Links (`href`, drawn with `link`: next/link or a RegionLink) on server pages, buttons
 * (`onPage`) in a client list. Pages count from 0.
 */
// next/link or a RegionLink: both take an href, a class, the aria words, `scroll` and `prefetch`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LinkLike = ComponentType<any>;

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d={back ? "m14 5-7 7 7 7" : "m10 5 7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function DiscoverPager({ page, pageSize, total, unit, extra, label = "Pagini de rezultate", href, link: L, scroll, onPage, disabled = false, bottom = false, always = false, className = "" }: {
  /** What the rows are, one and many: „din 52 de grupuri” (countWords, the „de” rule). */
  page: number; pageSize: number; total: number; unit: readonly [string, string]; extra?: ReactNode; label?: string;
  href?: (page: number) => string; link?: LinkLike; scroll?: boolean; onPage?: (page: number) => void; disabled?: boolean;
  bottom?: boolean; always?: boolean; className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [from, to] = pagerRange(page, pageSize, total);
  const go = (p: number, words: ReactNode, aria: string, cls: string, current = false) => {
    if (L && href) return <L href={href(p)} className={cls} aria-label={aria} aria-current={current ? "page" : undefined} {...(scroll !== undefined ? { scroll } : {})} prefetch={false}>{words}</L>;
    return <button type="button" className={cls} aria-label={aria} aria-current={current ? "page" : undefined} disabled={disabled} onClick={() => onPage?.(p)}>{words}</button>;
  };
  const off = (words: ReactNode, aria: string) => <span className="dsc-pg-b dsc-pg-off" role="link" aria-disabled="true" aria-label={aria}>{words}</span>;
  return <div className={`dsc-pg${bottom ? " dsc-pg-bottom" : ""}${className ? ` ${className}` : ""}`}>
    <p className="dsc-pg-count"><strong>{formatInt(from)}–{formatInt(to)}</strong> din {countWords(total, unit[0], unit[1])}{extra}</p>
    {(pages > 1 || always) && <nav className="dsc-pg-pages" aria-label={label}>
      {page > 0 ? go(page - 1, <Arrow back />, "Pagina anterioară", "dsc-pg-b") : off(<Arrow back />, "Pagina anterioară")}
      {pagerSlots(page, pages).map((s) => <span key={s.page} className={`dsc-pg-slot${s.phone ? "" : " dsc-pg-wide"}`}>
        {s.gapWide && <span className={`dsc-pg-gap${s.gapPhone ? "" : " dsc-pg-wide"}`} aria-hidden="true">…</span>}
        {!s.gapWide && s.gapPhone && <span className="dsc-pg-gap dsc-pg-phone" aria-hidden="true">…</span>}
        {go(s.page, formatInt(s.page + 1), `Pagina ${formatInt(s.page + 1)}`, `dsc-pg-b${s.page === page ? " on" : ""}`, s.page === page)}
      </span>)}
      {page + 1 < pages ? go(page + 1, <Arrow />, "Pagina următoare", "dsc-pg-b") : off(<Arrow />, "Pagina următoare")}
    </nav>}
  </div>;
}
