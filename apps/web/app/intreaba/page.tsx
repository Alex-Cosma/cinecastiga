import type { Metadata } from "next";
import AskPanel from "./AskPanel";

export const metadata: Metadata = {
  title: "Întreabă — SEAP Transparent",
  description:
    "Pune întrebări în limbaj natural despre achizițiile publice din România. AI-ul traduce întrebarea într-o interogare verificabilă pe date.",
};

export default function IntreabaPage() {
  return (
    <>
      <h1 className="page-title">Întreabă datele</h1>
      <p className="page-sub">
        Întrebi în română, primești un răspuns verificabil: vezi exact ce am înțeles, ce limite au
        datele și interogarea din spate. Semnal, nu verdict — dovada e mereu la un click.
      </p>
      <AskPanel />
    </>
  );
}
