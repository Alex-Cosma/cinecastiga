import type { Metadata } from "next";
import AskPanel from "./AskPanel";
export const metadata: Metadata = {
  title: "Întreabă",
  description:
    "Întreabă despre achizițiile publice în cuvintele tale: cine câștigă, pe ce se duc banii, cât costă. Vezi cum am înțeles întrebarea și fiecare înregistrare din SEAP din spatele răspunsului.",
};
import "./explore-compact.css";

export default function IntreabaPage() {
  return <div className="explore-compact"><AskPanel initialMode="build" /></div>;
}
