"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A product's year, the same control as on /preturi (UX audit Z6-34): a labelled select, a year without leads saying
 * „prea puține date”. A GET form: without JavaScript its button applies it; with it a change opens the year.
 */
export default function YearSelect({ action, year, years, labels, keep }: {
  action: string; year: number | null; years: number[]; labels: Record<number, string>; keep: Record<string, string>;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  return <form className="pr-year-form" method="get" action={action} onSubmit={(e) => e.preventDefault()}>
    {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    <label className="pr-field pr-year">An
      <select name="an" value={year ?? ""} onChange={(e) => {
        const p = new URLSearchParams(keep);
        if (e.target.value) p.set("an", e.target.value);
        start(() => router.push(`${action}${p.size ? `?${p}` : ""}`));
      }}>
        <option value="">Toți anii</option>
        {years.map((y) => <option key={y} value={y}>{labels[y] ?? y}</option>)}
      </select>
    </label>
    <noscript><button type="submit" className="pr-go">Arată</button></noscript>
  </form>;
}
