import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import NotFoundAddress from "./NotFoundAddress";

export const metadata: Metadata = { title: "Pagina nu există" };

/** Any address with no page, and a record page whose record is not in the data (its status stays 404). */
export default function NotFound() {
  return (
    <div className="err-page">
      {/* A record page that threw keeps its own metadata after the client renders this boundary: the tab title is set here too. */}
      <title>{pageTitle("Pagina nu există")}</title>
      <h1 className="page-title">Pagina nu există</h1>
      <NotFoundAddress />
    </div>
  );
}
