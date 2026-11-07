"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { searchHref, searchWords } from "./not-found-search";

/** The 404's address and its search: the root not-found page receives no path, the client reads it. */
export default function NotFoundAddress() {
  const pathname = usePathname() ?? "";
  const words = searchWords(pathname);
  return (
    <>
      <p className="page-sub err-address">
        Adresa <span className="mono">{pathname || "cerută"}</span> nu e în datele noastre sau e greșită.
      </p>
      <div className="err-acts">
        <Link href={searchHref(words)} className="btn pri">{words ? `Caută „${words}”` : "Caută"}</Link>
        <Link href="/" className="btn">Prima pagină</Link>
      </div>
    </>
  );
}
