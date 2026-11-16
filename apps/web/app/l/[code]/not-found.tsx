import type { Metadata } from "next";
import Link from "next/link";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = { title: "Linkul scurt nu există" };

/**
 * A short link that is not in the data (UX audit Z1-30, 16 November 2026): said as a short link, usually copied
 * incomplete, with the ways on; the code is not searched as a word. The status stays 404.
 */
export default function ShortLinkNotFound() {
  return (
    <div className="err-page">
      <title>{pageTitle("Linkul scurt nu există")}</title>
      <h1 className="page-title">Linkul scurt nu există</h1>
      <p className="page-sub">Poate a fost copiat incomplet: verifică ultimele litere.</p>
      <div className="err-acts">
        <Link href="/" className="btn pri">Prima pagină</Link>
        <Link href="/intreaba" className="btn">Întreabă</Link>
      </div>
    </div>
  );
}
