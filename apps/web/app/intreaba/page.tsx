import type { Metadata } from "next";
import AskPanel from "./AskPanel";

export const metadata: Metadata = {
  title: "Întreabă",
  description:
    "Pune întrebări în limbaj natural despre achizițiile publice din România. AI-ul traduce întrebarea într-o interogare verificabilă pe date.",
};

export default function IntreabaPage() {
  return (
    <>
      <h1 className="page-title">Întreabă datele</h1>
      <p className="page-sub">
        Întrebi în română, primești un răspuns verificabil: ce am înțeles, limitele datelor și interogarea din spate.
      </p>
      <AskPanel />
    </>
  );
}
