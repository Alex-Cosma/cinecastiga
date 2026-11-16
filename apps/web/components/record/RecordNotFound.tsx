import Link from "next/link";
import { coverageDate, getCoverage } from "@/lib/coverage";
import { pageTitle } from "@/lib/site";
import RecordNotFoundId from "./RecordNotFoundId";

/**
 * A record that is not in the data (UX audit Z7-28, owner 16 November 2026): says which one, where its id comes from and
 * how to find it instead (an empty search field, by institution or notice number), with the date of the data. Searching
 * the id itself found nothing, so the field starts empty.
 */
export default async function RecordNotFound({ noun, none, hint, placeholder }: { noun: string; none: string; hint: string; placeholder: string }) {
  const coverage = await getCoverage().catch(() => null);
  const at = coverage?.observations[0]?.calculated_at;
  return (
    <div className="err-page record-not-found">
      <title>{pageTitle("Înregistrare negăsită")}</title>
      <RecordNotFoundId noun={noun} none={none} />
      <p className="page-sub">{hint}</p>
      <form className="record-not-found-search" action="/cauta" method="get" role="search">
        <label className="sr-only" htmlFor="record-not-found-q">Caută</label>
        <input id="record-not-found-q" type="search" name="q" minLength={2} maxLength={150} placeholder={placeholder} required />
        <button type="submit" className="btn pri">Caută</button>
      </form>
      <div className="err-acts"><Link href="/" className="btn">Prima pagină</Link></div>
      <p className="err-coverage">
        {at ? `Date la ${coverageDate(at)}` : "Data datelor nu e confirmată"} · <Link href="/metodologie#acoperire">Surse și acoperire</Link>
      </p>
    </div>
  );
}
