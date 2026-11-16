import type { Metadata } from "next";
import { getMethodologyFigures } from "@/lib/methodology-figures";
import MethodologyBehavior from "./MethodologyBehavior";
import MethodologyStory from "./MethodologyStory";
import "./metodologie-v24.css";

// "Ce date avem și unde sunt limitele" (DataCoverage) and the national figures (lib/methodology-figures.ts) read the
// current data on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The guide has one name, „Ghid” (owner, 5 and 13 November 2026): the tab says it with the page's title (Z7-35).
  title: "Ghid · Cum citim banii publici",
  description: "Cum citim banii publici: ce e un tipar, cum se calculează scorul de la 0 la 100 și ce nu înseamnă. Toate regulile, cu codul lor.",
};

export default async function MetodologiePage() {
  const figures = await getMethodologyFigures();
  return (
    <>
      <MethodologyStory figures={figures} />
      <MethodologyBehavior rootId="metodologie" />
    </>
  );
}
