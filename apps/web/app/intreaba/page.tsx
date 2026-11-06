import type { Metadata } from "next";
import AskPanel from "./AskPanel";
import { readAskLink } from "./link-hint";
export const metadata: Metadata = {
  title: "Întreabă",
  description:
    "Întreabă despre achizițiile publice în cuvintele tale: cine câștigă, pe ce se duc banii, cât costă. Vezi cum am înțeles întrebarea și fiecare înregistrare din SEAP din spatele răspunsului.",
};
import "./explore-compact.css";

/** The address's question is read here too, so the first paint already holds its answer's place (link-hint.ts). */
export default async function IntreabaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const link = readAskLink(await searchParams);
  return <div className="explore-compact"><AskPanel initialMode="build" link={link} /></div>;
}
