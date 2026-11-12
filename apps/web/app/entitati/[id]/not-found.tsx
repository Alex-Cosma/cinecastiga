import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import EntityName from "@/components/EntityName";
import { coverageDate, getCoverage } from "@/lib/coverage";
import { cleanName } from "@/lib/format";
import { getEntityProfile } from "@/lib/marts";
import { pageTitle } from "@/lib/site";
import { searchHref, searchWords } from "../../not-found-search";

export const metadata: Metadata = { title: "Entitate negăsită" };
// The page that threw keeps its own metadata after the client renders this boundary, so the tab title is also set here.

const VALID_ID = /^[1-9]\d{0,15}$/;

/**
 * An entity page, or one of its pages, that answered 404. The id is read from the address proxy.ts forwards (a
 * not-found page receives no params). An unknown id says so, with the date of the data it was looked up in; a known
 * entity whose sub-page does not apply (a firm's Radiografie, say) leads back to its page instead.
 */
export default async function EntityNotFound() {
  const path = (await headers()).get("x-seap-path") ?? "";
  const [, rawId = "", sub = ""] = /^\/entitati\/([^/]+)(\/.*)?$/.exec(path) ?? [];
  const id = searchWords(`/${rawId}`);
  const profile = id && sub && VALID_ID.test(id) ? await getEntityProfile(id).catch(() => null) : null;
  const coverage = await getCoverage().catch(() => null);
  const at = coverage?.observations[0]?.calculated_at;

  if (profile) {
    const role = profile.roles[0]?.role ?? null, name = cleanName(profile.name ?? "această entitate");
    return (
      <div className="err-page">
        <title>{pageTitle("Pagina nu există")}</title>
        <h1 className="page-title">Pagina nu există</h1>
        <p className="page-sub">
          Nu există pagina <span className="mono">{sub}</span> pentru{" "}
          <EntityName id={profile.entityId} role={role}>{name}</EntityName>{name.endsWith(".") ? "" : "."}
        </p>
        <div className="err-acts">
          <Link prefetch={false} href={`/entitati/${profile.entityId}`} className="btn pri">Pagina entității</Link>
          <Link href="/" className="btn">Prima pagină</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="err-page">
      <title>{pageTitle("Entitate negăsită")}</title>
      <h1 className="page-title">
        {id ? <>Nu avem entitatea <span className={VALID_ID.test(id) ? "nowrap" : undefined}>{id}</span> în date</> : "Nu avem această entitate în date"}
      </h1>
      <p className="page-sub">Caut-o după nume sau CUI.</p>
      <div className="err-acts">
        <Link href={searchHref(id, "entities")} className="btn pri">Caută instituția sau firma</Link>
        <Link href="/" className="btn">Prima pagină</Link>
      </div>
      <p className="err-coverage">
        {at ? `Date la ${coverageDate(at)}` : "Data datelor nu e confirmată"} · <Link href="/metodologie#acoperire">Surse și acoperire</Link>
      </p>
    </div>
  );
}
